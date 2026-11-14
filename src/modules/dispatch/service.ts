import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import type { Actor } from "@/server/permissions/service";
import { allowed, conflict } from "@/modules/management/history";
import { lock, stock, type Tx } from "@/modules/inventory/service";
import {
  load as orderLoad,
  stockLocks,
  event as orderEvent,
  type Order,
  authorize,
} from "@/modules/sales/orders";
import { hash, invalid, missing } from "@/modules/sales/cart";
import { paymentBalance } from "@/modules/sales/rules";
import { recordAudit } from "@/server/audit/service";
import {
  draftSchema,
  editSchema,
  allocationSchema,
  actionSchema,
  returnSchema,
  awbKey,
  transition,
  trackingUrl,
  businessDate,
} from "./rules";

const include = {
  order: {
    select: {
      number: true,
      customerId: true,
      customerSnapshot: true,
      addressSnapshot: true,
      paymentStatus: true,
      status: true,
    },
  },
  lines: {
    include: {
      orderLine: true,
      allocations: { include: { lot: true, returns: true } },
    },
  },
  events: { orderBy: { createdAt: "asc" as const }, take: 500 },
  proofs: {
    select: {
      id: true,
      source: true,
      mimeType: true,
      fileSize: true,
      sharedWithCustomer: true,
      createdAt: true,
    },
  },
} as const;
export async function loadDispatch(tx: Tx, id: string) {
  const d = await tx.dispatch.findUnique({ where: { id }, include });
  if (!d) throw missing();
  return d;
}
export type DispatchRecord = Awaited<ReturnType<typeof loadDispatch>>;
export async function eligibility(tx: Tx, order: Order, allowDraft = true) {
  const reasons: string[] = [];
  const net = paymentBalance(order.payments);
  const d = await tx.dispatch.findUnique({
    where: { orderId: order.id },
    select: { id: true, status: true },
  });
  if (order.cancelledAt || order.status === "CANCELLED")
    reasons.push("Order is cancelled.");
  if (order.status === "RESERVATION_EXPIRED")
    reasons.push("Order reservation expired.");
  if (d?.status === "CONFIRMED")
    reasons.push("Order has already been dispatched.");
  if (d && !allowDraft)
    reasons.push("A dispatch already exists for this order.");
  if (
    net < order.totalPaise ||
    !["PAID", "OVERPAID"].includes(order.paymentStatus)
  )
    reasons.push("Full payment has not been manually verified.");
  if (net > order.totalPaise && !order.overpaymentResolved)
    reasons.push("Overpayment requires an admin decision.");
  if (order.lateReviewRequired || order.refundDecisionRequired)
    reasons.push("Payment or refund review is unresolved.");
  if (
    order.submissions.some((s) =>
      ["SUBMITTED", "UNDER_REVIEW"].includes(s.status),
    )
  )
    reasons.push("A payment submission is still under review.");
  if (order.status !== "READY_FOR_DISPATCH")
    reasons.push("Order is not ready for dispatch.");
  const now = Date.now();
  if (
    !order.lines.length ||
    order.reservations.length !== order.lines.length ||
    order.lines.some(
      (l) =>
        !order.reservations.some(
          (r) =>
            r.orderLineId === l.id &&
            r.variantId === l.variantId &&
            r.quantity === l.quantity &&
            r.status === "ACTIVE" &&
            (!r.expiresAt || r.expiresAt.getTime() > now),
        ),
    )
  )
    reasons.push(
      "Every order line needs a matching active, unexpired reservation.",
    );
  const customer = await tx.customer.findUnique({
    where: { id: order.customerId },
    include: {
      user: { select: { active: true, role: true } },
      dealer: { select: { status: true } },
    },
  });
  if (
    !customer?.user.active ||
    !["CUSTOMER", "DEALER"].includes(customer.user.role) ||
    (order.category === "APPROVED_DEALER" &&
      (customer.category !== "APPROVED_DEALER" ||
        customer.user.role !== "DEALER" ||
        customer.dealer?.status !== "APPROVED"))
  )
    reasons.push("Customer account or dealer approval is no longer eligible.");
  return {
    eligible: reasons.length === 0,
    reasons,
    dispatchId: d?.id ?? null,
    verifiedPaise: net,
  };
}
async function requireEligible(tx: Tx, order: Order) {
  const check = await eligibility(tx, order);
  if (!check.eligible) throw invalid(check.reasons.join(" "));
}
async function auditEvent(
  tx: Tx,
  actor: Actor,
  d: { id: string; orderId: string; deliveryStatus: string },
  input: {
    requestId?: string;
    digest?: string;
    kind: string;
    message: string;
    reason: string;
    internalRemarks?: string;
    reference?: string;
    occurredAt?: Date;
  },
) {
  await tx.deliveryEvent.create({
    data: {
      dispatchId: d.id,
      requestId: input.requestId ?? randomUUID(),
      payloadDigest: input.digest ?? "",
      kind: input.kind,
      status: d.deliveryStatus,
      message: input.message,
      reason: input.reason,
      internalRemarks: input.internalRemarks ?? "",
      reference: input.reference ?? "",
      actorId: actor.id,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
  await recordAudit(
    {
      actorId: actor.id,
      action: "DISPATCH_CHANGED",
      entityType: "Dispatch",
      entityId: d.id,
      reason: input.reason,
    },
    tx,
  );
  await orderEvent(
    tx,
    actor,
    d.orderId,
    input.kind,
    input.message,
    input.internalRemarks || input.reason,
  );
}
function shipment(data: z.infer<typeof editSchema>["shipment"]) {
  return {
    ...data,
    scheduledDate: new Date(data.scheduledDate),
    expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
    bookingDate: data.bookingDate ? new Date(data.bookingDate) : null,
    awbKey: awbKey(data.courierName, data.awb),
  };
}
async function mutation(
  tx: Tx,
  actor: Actor,
  id: string,
  requestId: string,
  input: unknown,
) {
  await lock(tx, `delivery-request:${requestId}`);
  const source = await tx.dispatch.findUnique({
    where: { id },
    select: { orderId: true },
  });
  if (!source) throw missing();
  await lock(tx, `order:${source.orderId}`);
  const d = await loadDispatch(tx, id);
  const prior = await tx.deliveryEvent.findUnique({ where: { requestId } });
  if (prior && (prior.dispatchId !== id || prior.payloadDigest !== hash(input)))
    throw conflict();
  return { d, replay: !!prior };
}
export async function createDispatch(actor: Actor, input: unknown) {
  allowed(actor, "dispatch.manage");
  const data = draftSchema.parse(input);
  const digest = hash(data);
  return getDb().$transaction(
    async (tx) => {
      await lock(tx, `dispatch-request:${data.requestId}`);
      await lock(tx, `order:${data.orderId}`);
      const existing = await tx.dispatch.findFirst({
        where: {
          OR: [{ requestId: data.requestId }, { orderId: data.orderId }],
        },
      });
      if (existing) {
        if (
          existing.requestId !== data.requestId ||
          existing.payloadDigest !== digest
        )
          throw conflict();
        return loadDispatch(tx, existing.id);
      }
      const o = await orderLoad(tx, data.orderId);
      await lock(tx, `dealer:${o.customerId}`);
      await stockLocks(tx, o);
      await requireEligible(tx, o);
      const d = await tx.dispatch.create({
        data: {
          orderId: o.id,
          requestId: data.requestId,
          payloadDigest: digest,
          ...shipment(data.shipment),
          createdById: actor.id,
          deliveryStatus: data.shipment.personName ? "ASSIGNED" : "PENDING",
          lines: {
            create: o.lines.map((l) => ({
              orderLineId: l.id,
              quantity: l.quantity,
            })),
          },
        },
      });
      await auditEvent(tx, actor, d, {
        kind: "DISPATCH_DRAFT",
        message:
          "Dispatch is being prepared. Goods have not yet been dispatched.",
        reason: data.reason,
      });
      if (d.deliveryStatus === "ASSIGNED")
        await auditEvent(tx, actor, d, {
          kind: "DELIVERY_ASSIGNED",
          message: "A local delivery person has been assigned.",
          reason: data.reason,
        });
      return loadDispatch(tx, d.id);
    },
    { timeout: 20000 },
  );
}
export async function editDispatch(actor: Actor, id: string, input: unknown) {
  allowed(actor, "dispatch.manage");
  const data = editSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    const { d, replay } = await mutation(tx, actor, id, data.requestId, data);
    if (replay) return d;
    if (d.version !== data.version) throw conflict();
    // After confirmation, operational reassignment is allowed only for failed deliveries; the original values remain in the event.
    if (d.status === "CONFIRMED" && d.deliveryStatus !== "DELIVERY_FAILED")
      throw invalid(
        "Shipment details can be edited in draft or after delivery failure only.",
      );
    if (
      d.status === "CONFIRMED" &&
      (data.shipment.method !== d.method ||
        data.shipment.packageCount !== d.packageCount ||
        data.shipment.scheduledDate !==
          d.scheduledDate.toISOString().slice(0, 10))
    )
      throw invalid(
        "Confirmed method, package count and dispatch date cannot change.",
      );
    const updated = await tx.dispatch.update({
      where: { id },
      data: {
        ...shipment(data.shipment),
        deliveryStatus:
          d.status === "DRAFT"
            ? data.shipment.personName
              ? "ASSIGNED"
              : "PENDING"
            : d.deliveryStatus,
        version: { increment: 1 },
      },
    });
    await auditEvent(tx, actor, updated, {
      requestId: data.requestId,
      digest: hash(data),
      kind:
        data.shipment.personName && data.shipment.personName !== d.personName
          ? "DELIVERY_ASSIGNED"
          : "SHIPMENT_UPDATED",
      message:
        data.shipment.personName && data.shipment.personName !== d.personName
          ? "A local delivery person has been assigned."
          : "Delivery arrangements were updated.",
      reason: data.reason,
      internalRemarks: JSON.stringify({
        before: {
          method: d.method,
          personName: d.personName,
          personPhone: d.personPhone,
          vehicleNumber: d.vehicleNumber,
          courierName: d.courierName,
          awb: d.awb,
          bookingDate: d.bookingDate,
          expectedDate: d.expectedDate,
          trackingTemplate: d.trackingTemplate,
          internalRemarks: d.internalRemarks,
        },
        after: data.shipment,
      }),
    });
    return loadDispatch(tx, id);
  });
}
export async function saveAllocations(
  actor: Actor,
  id: string,
  input: unknown,
) {
  allowed(actor, "dispatch.manage");
  const data = allocationSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    const { d, replay } = await mutation(tx, actor, id, data.requestId, data);
    if (replay) return d;
    if (d.status !== "DRAFT" || d.version !== data.version) throw conflict();
    const o = await orderLoad(tx, d.orderId);
    await stockLocks(tx, o);
    if (data.allocations.some((a) => !d.lines.some((l) => l.id === a.lineId)))
      throw invalid("Choose only this dispatch's order lines.");
    for (const line of d.lines)
      if (
        data.allocations
          .filter((a) => a.lineId === line.id)
          .reduce((s, a) => s + a.quantity, 0) !== line.quantity
      )
        throw invalid("Allocate the full ordered quantity for every variant.");
    for (const a of data.allocations) {
      const line = d.lines.find((l) => l.id === a.lineId)!;
      const lot = await tx.stockLot.findUnique({ where: { id: a.lotId } });
      if (
        !lot ||
        lot.variantId !== line.orderLine.variantId ||
        (lot.expiresAt &&
          lot.expiresAt.toISOString().slice(0, 10) < businessDate()) ||
        (await stock(tx, lot.variantId, lot.id)).onHand < a.quantity
      )
        throw invalid(
          "Choose a matching, unexpired lot with sufficient undamaged stock.",
        );
    }
    await tx.dispatchAllocation.deleteMany({
      where: { dispatchLineId: { in: d.lines.map((l) => l.id) } },
    });
    await tx.dispatchAllocation.createMany({
      data: data.allocations.map((a) => ({
        dispatchLineId: a.lineId,
        lotId: a.lotId,
        quantity: a.quantity,
      })),
    });
    const updated = await tx.dispatch.update({
      where: { id },
      data: { version: { increment: 1 } },
    });
    await auditEvent(tx, actor, updated, {
      requestId: data.requestId,
      digest: hash(data),
      kind: "PACKING_REVIEW",
      message: "The full order has been allocated for packing.",
      reason: data.reason,
      internalRemarks: JSON.stringify({
        before: d.lines.map((l) => ({ id: l.id, allocations: l.allocations })),
        after: data.allocations,
      }),
    });
    return loadDispatch(tx, id);
  });
}
export async function dispatchAction(actor: Actor, id: string, input: unknown) {
  allowed(actor, "dispatch.manage");
  const data = actionSchema.parse(input);
  if (data.action === "CORRECT") allowed(actor, "dispatch.correct");
  return getDb().$transaction(
    async (tx) => {
      const { d, replay } = await mutation(tx, actor, id, data.requestId, data);
      if (replay) return d;
      if (data.action === "CONFIRM" && d.status === "CONFIRMED") return d;
      if (d.version !== data.version) throw conflict();
      const occurredAt = new Date(data.occurredAt);
      if (
        occurredAt < d.createdAt ||
        (d.confirmedAt && occurredAt < d.confirmedAt) ||
        (d.events.length &&
          occurredAt < d.events[d.events.length - 1].occurredAt)
      )
        throw invalid(
          "Event time cannot precede the shipment or its latest event.",
        );
      let next: string;
      const update: {
        deliveredAt?: Date;
        recipientName?: string;
        confirmationSource?: string;
        expectedDate?: Date | null;
      } = {};
      if (data.action === "CONFIRM") {
        if (d.status !== "DRAFT") throw conflict();
        const o = await orderLoad(tx, d.orderId);
        await lock(tx, `dealer:${o.customerId}`);
        await stockLocks(tx, o);
        // This check runs after every blocking lock, including the stock locks.
        await requireEligible(tx, await orderLoad(tx, d.orderId));
        if (d.method === "LOCAL" && (!d.personName || !d.personPhone))
          throw invalid(
            "Assign a delivery person and mobile number before dispatch.",
          );
        if (
          d.method === "COURIER" &&
          (!d.courierName || !d.awb || !d.bookingDate)
        )
          throw invalid(
            "Enter the actual courier, AWB and booking date before dispatch.",
          );
        if (
          d.scheduledDate.toISOString().slice(0, 10) > businessDate() ||
          (d.bookingDate &&
            d.bookingDate.toISOString().slice(0, 10) > businessDate())
        )
          throw invalid(
            "Dispatch and booking dates cannot be in the future at confirmation.",
          );
        for (const line of d.lines) {
          if (
            line.quantity !== line.orderLine.quantity ||
            line.allocations.reduce((s, a) => s + a.quantity, 0) !==
              line.quantity
          )
            throw invalid(
              "Review and allocate every ordered variant quantity before confirmation.",
            );
          for (const a of line.allocations)
            if (
              (a.lot.expiresAt &&
                a.lot.expiresAt.toISOString().slice(0, 10) < businessDate()) ||
              (await stock(tx, line.orderLine.variantId, a.lotId)).onHand <
                a.quantity
            )
              throw invalid(
                "Allocated lot is expired or has insufficient stock. Reallocate the draft.",
              );
        }
        for (const r of o.reservations)
          await tx.stockReservation.update({
            where: { id: r.id },
            data: {
              status: "CONSUMED",
              version: { increment: 1 },
              changedById: actor.id,
              reason: `Dispatch ${d.number} confirmed`,
            },
          });
        for (const line of d.lines)
          for (const a of line.allocations)
            await tx.stockMovement.create({
              data: {
                variantId: line.orderLine.variantId,
                lotId: a.lotId,
                dispatchAllocationId: a.id,
                kind: "DISPATCH",
                availableDelta: -a.quantity,
                reason: data.reason,
                actorId: actor.id,
              },
            });
        next = "DISPATCHED";
        await tx.dispatch.update({
          where: { id },
          data: {
            status: "CONFIRMED",
            deliveryStatus: next,
            confirmedAt: new Date(),
            confirmedById: actor.id,
            version: { increment: 1 },
          },
        });
      } else {
        if (d.status !== "CONFIRMED")
          throw invalid("Confirm dispatch before updating delivery.");
        const state = transition(d.method, d.deliveryStatus, data.action);
        if (!state)
          throw invalid("This delivery status transition is not allowed.");
        next = state;
        if (
          d.method === "LOCAL" &&
          ["OUT_FOR_DELIVERY", "RESCHEDULE"].includes(data.action) &&
          (!d.personName || !d.personPhone)
        )
          throw invalid(
            "Assign a delivery person and mobile number before scheduling a delivery attempt.",
          );
        if (data.action === "DELIVERED") {
          if (
            data.recipientName.length < 2 ||
            data.confirmationSource.length < 3
          )
            throw invalid(
              "Delivery requires recipient name and the real confirmation source.",
            );
          update.deliveredAt = occurredAt;
          update.recipientName = data.recipientName;
          update.confirmationSource = data.confirmationSource;
        }
        if (data.action === "RETURNED" && data.reference.length < 3)
          throw invalid(
            "Return-to-sender requires a reference and reason. Stock is not restored by this status.",
          );
        if (data.action === "RESCHEDULE") {
          if (!data.expectedDate || data.expectedDate < businessDate())
            throw invalid(
              "Supply a current or future rescheduled delivery date.",
            );
          update.expectedDate = new Date(data.expectedDate);
        }
        await tx.dispatch.update({
          where: { id },
          data: { ...update, deliveryStatus: next, version: { increment: 1 } },
        });
      }
      await tx.salesOrder.update({
        where: { id: d.orderId },
        data: {
          status: ["DELIVERED", "DELIVERY_FAILED", "RETURNED"].includes(next)
            ? next
            : "DISPATCHED",
          version: { increment: 1 },
        },
      });
      const current = await loadDispatch(tx, id);
      const message =
        data.publicMessage ||
        (data.action === "RESCHEDULE"
          ? "Delivery has been rescheduled."
          : data.action === "CORRECT"
            ? "FIXUP recorded a shipment correction. Contact us for details."
            : `Delivery update: ${next.replaceAll("_", " ").toLowerCase()}.`);
      await auditEvent(tx, actor, current, {
        requestId: data.requestId,
        digest: hash(data),
        kind: data.action,
        message,
        reason: data.reason,
        internalRemarks: data.internalRemarks,
        reference: data.reference,
        occurredAt:
          data.action === "CONFIRM" ? current.confirmedAt! : occurredAt,
      });
      return loadDispatch(tx, id);
    },
    { timeout: 20000 },
  );
}
export async function physicalReturn(actor: Actor, id: string, input: unknown) {
  allowed(actor, "dispatch.correct");
  const data = returnSchema.parse(input);
  const digest = hash(data);
  return getDb().$transaction(async (tx) => {
    await lock(tx, `return-request:${data.requestId}`);
    const source = await tx.dispatch.findUnique({
      where: { id },
      select: { orderId: true },
    });
    if (!source) throw missing();
    await lock(tx, `order:${source.orderId}`);
    const d = await loadDispatch(tx, id);
    const previous = await tx.dispatchReturn.findUnique({
      where: { requestId: data.requestId },
    });
    if (previous) {
      if (
        previous.payloadDigest !== digest ||
        !d.lines.some((l) =>
          l.allocations.some((a) => a.id === previous.allocationId),
        )
      )
        throw conflict();
      return d;
    }
    if (d.deliveryStatus !== "RETURNED")
      throw invalid(
        "Record return-to-sender before an inspected physical stock return.",
      );
    const line = d.lines.find((l) =>
      l.allocations.some((a) => a.id === data.allocationId),
    );
    const a = line?.allocations.find((a) => a.id === data.allocationId);
    if (!line || !a) throw missing();
    await lock(tx, `stock:${line.orderLine.variantId}`);
    if (
      a.returns.reduce((s, r) => s + r.quantity, 0) + data.quantity >
      a.quantity
    )
      throw invalid(
        "Return quantity exceeds the original dispatched quantity.",
      );
    if (new Date(data.receivedAt) < d.confirmedAt!)
      throw invalid("Physical return cannot precede dispatch.");
    const r = await tx.dispatchReturn.create({
      data: {
        allocationId: a.id,
        requestId: data.requestId,
        payloadDigest: digest,
        quantity: data.quantity,
        condition: data.condition,
        reference: data.reference,
        reason: data.reason,
        receivedAt: new Date(data.receivedAt),
        actorId: actor.id,
      },
    });
    await tx.stockMovement.create({
      data: {
        variantId: line.orderLine.variantId,
        lotId: a.lotId,
        dispatchReturnId: r.id,
        kind: "DISPATCH_RETURN",
        availableDelta: data.condition === "GOOD" ? data.quantity : 0,
        damagedDelta: data.condition === "DAMAGED" ? data.quantity : 0,
        reason: data.reason,
        actorId: actor.id,
      },
    });
    const updated = await tx.dispatch.update({
      where: { id },
      data: { version: { increment: 1 } },
    });
    await auditEvent(tx, actor, updated, {
      kind: "PHYSICAL_RETURN",
      message: "Returned goods were received and inspected by FIXUP.",
      reason: data.reason,
      reference: data.reference,
      internalRemarks: `${data.quantity} ${data.condition}; allocation ${a.id}`,
    });
    return loadDispatch(tx, id);
  });
}
export function customerDispatch(d: DispatchRecord) {
  return {
    id: d.id,
    number: d.number,
    orderNumber: d.order.number,
    paymentStatus: d.order.paymentStatus,
    status: d.status,
    deliveryStatus: d.deliveryStatus,
    method: d.method,
    packageCount: d.packageCount,
    confirmedAt: d.confirmedAt,
    expectedDate: d.expectedDate,
    personName: d.personName,
    personPhone: d.personPhone,
    vehicleNumber: d.vehicleNumber,
    courierName: d.courierName,
    courierService: d.courierService,
    awb: d.awb,
    trackingUrl: trackingUrl(d.trackingTemplate, d.awb),
    instructions: d.instructions,
    deliveredAt: d.deliveredAt,
    recipientName: d.recipientName,
    confirmationSource: d.confirmationSource,
    address: d.order.addressSnapshot,
    events: d.events.map((e) => ({
      id: e.id,
      kind: e.kind,
      status: e.status,
      message: e.message,
      occurredAt: e.occurredAt,
    })),
    proofs: d.proofs
      .filter((p) => p.sharedWithCustomer)
      .map((p) => ({ id: p.id, source: p.source, createdAt: p.createdAt })),
  };
}
export async function dispatchDetail(actor: Actor, id: string) {
  allowed(actor, "dispatch.manage");
  return getDb().$transaction(async (tx) => {
    const d = await loadDispatch(tx, id);
    const order = await orderLoad(tx, d.orderId);
    const check = await eligibility(tx, order);
    const lots = [];
    for (const l of d.lines) {
      const rows = await tx.stockLot.findMany({
        where: { variantId: l.orderLine.variantId },
        orderBy: { createdAt: "asc" },
        take: 500,
      });
      for (const lot of rows) {
        const b = await stock(tx, lot.variantId, lot.id);
        if (b.onHand > 0)
          lots.push({
            id: lot.id,
            variantId: lot.variantId,
            batchNumber: lot.batchNumber,
            expiresAt: lot.expiresAt,
            onHand: b.onHand,
          });
      }
    }
    return {
      ...d,
      eligibility: check,
      lots,
      canCorrect: actor.permissions.includes("dispatch.correct"),
    };
  });
}
export async function ownTracking(actor: Actor, orderId: string) {
  return getDb().$transaction(async (tx) => {
    const order = await orderLoad(tx, orderId);
    authorize(actor, order);
    const d = await tx.dispatch.findUnique({
      where: { orderId },
      select: { id: true },
    });
    return d ? customerDispatch(await loadDispatch(tx, d.id)) : null;
  });
}
export async function queue(actor: Actor, input: unknown) {
  allowed(actor, "dispatch.manage");
  const q = z
    .object({
      q: z.string().max(150).default(""),
      from: z.union([z.iso.date(), z.literal("")]).default(""),
      to: z.union([z.iso.date(), z.literal("")]).default(""),
      method: z.enum(["", "LOCAL", "COURIER"]).default(""),
      status: z.string().max(40).default(""),
      deliveryStatus: z.string().max(40).default(""),
      dispatchStatus: z.enum(["", "DRAFT", "CONFIRMED"]).default(""),
      view: z
        .enum([
          "all",
          "ready",
          "blocked",
          "history",
          "failed",
          "local",
          "courier",
        ])
        .default("all"),
    })
    .strict()
    .parse(input);
  return getDb().$transaction(
    async (tx) => {
      const rows = await tx.salesOrder.findMany({
        where: {
          ...(q.q
            ? {
                OR: [
                  { number: { contains: q.q, mode: "insensitive" } },
                  {
                    customer: {
                      user: { name: { contains: q.q, mode: "insensitive" } },
                    },
                  },
                  {
                    customer: {
                      dealer: {
                        businessName: { contains: q.q, mode: "insensitive" },
                      },
                    },
                  },
                ],
              }
            : {}),
          ...(q.status ? { status: q.status } : {}),
          createdAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to
              ? { lt: new Date(new Date(q.to).getTime() + 86400000) }
              : {}),
          },
          ...(q.method ||
          q.dispatchStatus ||
          q.deliveryStatus ||
          ["history", "local", "courier", "failed"].includes(q.view)
            ? {
                dispatch: {
                  ...(q.method
                    ? { method: q.method }
                    : q.view === "local"
                      ? { method: "LOCAL" }
                      : q.view === "courier"
                        ? { method: "COURIER" }
                        : {}),
                  ...(q.deliveryStatus
                    ? { deliveryStatus: q.deliveryStatus }
                    : q.view === "failed"
                      ? { deliveryStatus: "DELIVERY_FAILED" }
                      : {}),
                  ...(q.dispatchStatus
                    ? { status: q.dispatchStatus }
                    : q.view === "history"
                      ? { status: "CONFIRMED" }
                      : {}),
                },
              }
            : {}),
        },
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      const items = [];
      for (const row of rows) {
        const o = await orderLoad(tx, row.id);
        const check = await eligibility(tx, o);
        const d = check.dispatchId
          ? await tx.dispatch.findUnique({
              where: { id: check.dispatchId },
              select: {
                id: true,
                number: true,
                status: true,
                deliveryStatus: true,
                method: true,
              },
            })
          : null;
        if (q.view === "ready" && !check.eligible) continue;
        if (
          q.view === "blocked" &&
          (check.eligible || d?.status === "CONFIRMED")
        )
          continue;
        items.push({
          id: o.id,
          number: o.number,
          customer: o.customerSnapshot,
          address: o.addressSnapshot,
          createdAt: o.createdAt,
          paymentStatus: o.paymentStatus,
          status: o.status,
          productCount: o.lines.length,
          totalQuantity: o.lines.reduce((s, l) => s + l.quantity, 0),
          dispatch: d,
          ...check,
        });
      }
      return { items, limit: 200 };
    },
    { timeout: 20000 },
  );
}
