import "server-only";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import type { Actor } from "@/server/permissions/service";
import { AppError } from "@/server/http/errors";
import { allowed, conflict } from "@/modules/management/history";
import { recordAudit } from "@/server/audit/service";
import { eligibleList } from "@/modules/management/pricing";
import { lock, stock, type Tx } from "@/modules/inventory/service";
import {
  buyer,
  hash,
  invalid,
  missing,
  previewSchema,
  previewData,
  validToken,
} from "./cart";
import { requestId, reason, paymentBalance } from "./rules";
export const orderInclude = {
  lines: true,
  reservations: true,
  payments: true,
  submissions: {
    select: {
      id: true,
      method: true,
      reference: true,
      paidOn: true,
      remarks: true,
      imageSize: true,
      width: true,
      height: true,
      duplicateReference: true,
      late: true,
      status: true,
      version: true,
      reviewedAt: true,
      publicMessage: true,
      internalNotes: true,
      reviewedById: true,
      createdAt: true,
    },
  },
  events: { orderBy: { createdAt: "asc" as const }, take: 500 },
} as const;
export type Order = Awaited<ReturnType<typeof load>>;
export async function load(tx: Tx, id: string) {
  const row = await tx.salesOrder.findUnique({
    where: { id },
    include: orderInclude,
  });
  if (!row) throw missing();
  return row;
}
export function isAdmin(actor: Actor) {
  return actor.permissions.includes("orders.manage");
}
export function authorize(
  actor: Actor,
  row: { customerId: string },
  admin = false,
) {
  if (admin) {
    allowed(actor, "orders.manage");
    return;
  }
  if (actor.customer?.id !== row.customerId) throw missing();
}
export function dto(row: Order, admin = false) {
  const {
    payloadDigest,
    requestId,
    pricingSource,
    internalNotes,
    cancelledById,
    ...safe
  } = row;
  void payloadDigest;
  void requestId;
  void pricingSource;
  void cancelledById;
  return {
    ...safe,
    submissions: row.submissions.map((s) => {
      if (admin) return s;
      const { internalNotes, reviewedById, ...safe } = s;
      void internalNotes;
      void reviewedById;
      return safe;
    }),
    payments: row.payments.map((p) =>
      admin
        ? p
        : {
            id: p.id,
            kind: p.kind,
            method: p.method,
            amountPaise: p.amountPaise,
            bankReference: p.bankReference,
            createdAt: p.createdAt,
          },
    ),
    events: row.events.map((e) =>
      admin
        ? e
        : {
            id: e.id,
            kind: e.kind,
            message: e.message,
            createdAt: e.createdAt,
          },
    ),
    reservations: row.reservations.map((r) => ({
      id: r.id,
      variantId: r.variantId,
      quantity: r.quantity,
      status: r.status,
      expiresAt: r.expiresAt,
    })),
    ...(admin ? { internalNotes, pricingSource } : {}),
    verifiedPaise: paymentBalance(row.payments),
    remainingPaise: Math.max(0, row.totalPaise - paymentBalance(row.payments)),
  };
}
export async function event(
  tx: Tx,
  actor: Actor | null,
  id: string,
  kind: string,
  message: string,
  internalNotes = "",
) {
  await tx.salesOrderEvent.create({
    data: { orderId: id, kind, message, internalNotes, actorId: actor?.id },
  });
  await recordAudit(
    {
      actorId: actor?.id ?? null,
      action: "SALES_CHANGED",
      entityType: "SalesOrder",
      entityId: id,
      reason: internalNotes || message,
    },
    tx,
  );
}
export async function orderDetail(actor: Actor, id: string, admin = false) {
  return getDb().$transaction(async (tx) => {
    authorize(actor, await load(tx, id), admin);
    await expireOne(tx, id);
    return dto(await load(tx, id), admin);
  });
}
export async function listOrders(
  actor: Actor,
  input: unknown = {},
  admin = false,
) {
  if (admin) allowed(actor, "orders.manage");
  else if (!actor.customer) throw missing();
  const q = z
    .object({
      q: z.string().max(150).optional(),
      status: z.string().max(40).optional(),
      paymentStatus: z.string().max(40).optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
    })
    .strict()
    .parse(input);
  const orders = await getDb().salesOrder.findMany({
    where: {
      ...(!admin ? { customerId: actor.customer!.id } : {}),
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
      ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
      createdAt: {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lt: new Date(new Date(q.to).getTime() + 86400000) } : {}),
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: orderInclude,
  });
  return {
    available: true,
    orders: orders.map((o) => dto(o, admin)),
    limit: 200,
  };
}
export async function createOrder(actor: Actor, input: unknown) {
  const customerId = buyer(actor);
  const data = previewSchema
    .extend({
      requestId,
      reviewToken: z.string().length(64),
      notes: z.string().trim().max(1000).default(""),
    })
    .strict()
    .parse(input);
  const digest = hash(data);
  return getDb().$transaction(
    async (tx) => {
      await lock(tx, `sales-request:${data.requestId}`);
      const previous = await tx.salesOrder.findUnique({
        where: { requestId: data.requestId },
        include: orderInclude,
      });
      if (previous) {
        authorize(actor, previous);
        if (previous.payloadDigest !== digest) throw conflict();
        return dto(previous);
      }
      await lock(tx, `cart:${customerId}`);
      await lock(tx, `dealer:${customerId}`);
      await lock(tx, "sales-settings");
      const items = await tx.cartItem.findMany({
        where: { customerId },
        orderBy: { variantId: "asc" },
      });
      for (const i of items) await lock(tx, `stock:${i.variantId}`);
      // Share locks keep current visibility and prices stable until the snapshot commits.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.id} FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${customerId} FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM "Address" WHERE id=${data.addressId} FOR SHARE`;
      const initial = await eligibleList(tx, actor);
      await tx.$queryRaw`SELECT category FROM "CategoryPriceList" WHERE category=${initial.category}::"CustomerCategory" FOR SHARE`;
      if (initial.list)
        await tx.$queryRaw`SELECT id FROM "PriceList" WHERE id=${initial.list.id} FOR SHARE`;
      for (const i of items) {
        await tx.$queryRaw`SELECT v.id FROM "ProductVariant" v JOIN "Product" p ON p.id=v."productId" JOIN "Category" c ON c.id=p."categoryId" WHERE v.id=${i.variantId} FOR SHARE OF v,p,c`;
      }
      const current = await previewData(tx, actor, {
        addressId: data.addressId,
        paymentMethod: data.paymentMethod,
      });
      if (!validToken(data.reviewToken, current.reviewToken))
        throw new AppError(
          409,
          "REVIEW_REQUIRED",
          "Prices, account details or terms changed. Review checkout again.",
        );
      const expiresAt = new Date(
        Date.now() + current.reservationMinutes * 60000,
      );
      const order = await tx.salesOrder.create({
        data: {
          requestId: data.requestId,
          payloadDigest: digest,
          customerId,
          category: current.category,
          customerSnapshot: current.customerSnapshot,
          addressSnapshot: current.addressSnapshot,
          paymentDetails: current.paymentDetails,
          cancellationRules: current.cancellationRules,
          pricingSource: current.pricingSource,
          taxMode: current.taxMode,
          taxBps: current.taxBps,
          subtotalPaise: current.subtotalPaise,
          taxPaise: current.taxPaise,
          deliveryPaise: current.deliveryPaise,
          totalPaise: current.totalPaise,
          reservationMinutes: current.reservationMinutes,
          lateReviewMinutes: current.lateReviewMinutes,
          reservationExpiresAt: expiresAt,
          paymentMethod: data.paymentMethod,
          notes: data.notes,
          lines: {
            create: current.lines.map((l, i) => ({
              variantId: l.variantId,
              productName: l.name,
              variantName: l.variant,
              sku: l.sku,
              packSize: l.packSize,
              imageUrl: l.imageUrl,
              quantity: l.quantity,
              unitPricePaise: l.unitPricePaise,
              linePricePaise: l.linePricePaise!,
              taxPaise: current.taxes[i],
            })),
          },
        },
        include: { lines: true },
      });
      for (const l of order.lines)
        await tx.stockReservation.create({
          data: {
            orderId: order.id,
            orderLineId: l.id,
            variantId: l.variantId,
            quantity: l.quantity,
            expiresAt,
            changedById: actor.id,
            reason: "Checkout reservation",
          },
        });
      await tx.cartItem.deleteMany({ where: { customerId } });
      await event(
        tx,
        actor,
        order.id,
        "CREATED",
        "Order created. Transfer the exact amount using the payment instructions. Payment requires manual bank verification.",
      );
      return dto(await load(tx, order.id));
    },
    { timeout: 20000 },
  );
}
export async function stockLocks(tx: Tx, row: Order) {
  for (const id of [
    ...new Set(row.reservations.map((r) => r.variantId)),
  ].sort())
    await lock(tx, `stock:${id}`);
}
export async function refresh(tx: Tx, id: string) {
  const row = await load(tx, id);
  const net = paymentBalance(row.payments);
  const paymentStatus =
    net > row.totalPaise
      ? "OVERPAID"
      : net === row.totalPaise
        ? "PAID"
        : net > 0
          ? "PARTIALLY_PAID"
          : "UNPAID";
  const allActive =
    row.reservations.length > 0 &&
    row.reservations.every((r) => r.status === "ACTIVE");
  const pending = row.submissions.some((s) =>
    ["SUBMITTED", "UNDER_REVIEW"].includes(s.status),
  );
  const currentUser = await tx.customer.findUnique({
    where: { id: row.customerId },
    include: { user: { select: { active: true, role: true } }, dealer: true },
  });
  const eligible =
    currentUser?.user.active &&
    ["CUSTOMER", "DEALER"].includes(currentUser.user.role) &&
    (row.category !== "APPROVED_DEALER" ||
      (currentUser.user.role === "DEALER" &&
        currentUser.category === "APPROVED_DEALER" &&
        currentUser.dealer?.status === "APPROVED"));
  const ready =
    net >= row.totalPaise &&
    allActive &&
    !row.lateReviewRequired &&
    !row.refundDecisionRequired &&
    (net === row.totalPaise || row.overpaymentResolved) &&
    eligible;
  const status = row.cancelledAt
    ? "CANCELLED"
    : !allActive
      ? "RESERVATION_EXPIRED"
      : ready
        ? "READY_FOR_DISPATCH"
        : net >= row.totalPaise
          ? "ADMIN_REVIEW"
          : pending
            ? "PAYMENT_UNDER_REVIEW"
            : row.submissions.some((s) =>
                  ["REJECTED", "RESUBMISSION_REQUIRED"].includes(s.status),
                )
              ? "PAYMENT_REJECTED"
              : "PENDING_PAYMENT";
  await tx.salesOrder.update({
    where: { id },
    data: { status, paymentStatus, version: { increment: 1 } },
  });
  if (
    net >= row.totalPaise &&
    allActive &&
    !row.lateReviewRequired &&
    !row.cancelledAt
  ) {
    for (const r of row.reservations.filter((r) => r.expiresAt))
      await tx.stockReservation.update({
        where: { id: r.id },
        data: {
          expiresAt: null,
          version: { increment: 1 },
          reason: "Full payment verified; held for manual review/dispatch",
        },
      });
  }
  return load(tx, id);
}
export async function expireOne(
  tx: Tx,
  id: string,
  actor: Actor | null = null,
) {
  await lock(tx, `order:${id}`);
  const row = await tx.salesOrder.findUnique({
    where: { id },
    include: orderInclude,
  });
  if (!row) return false;
  const due = row.reservations.filter(
    (r) =>
      r.status === "ACTIVE" &&
      r.expiresAt &&
      r.expiresAt.getTime() <= Date.now(),
  );
  if (!due.length || row.cancelledAt) return false;
  await stockLocks(tx, row);
  for (const r of due)
    await tx.stockReservation.update({
      where: { id: r.id },
      data: {
        status: "EXPIRED",
        changedById: actor?.id,
        reason: "Configured reservation period expired",
        version: { increment: 1 },
      },
    });
  await tx.salesOrder.update({
    where: { id },
    data: {
      lateReviewRequired: row.submissions.length > 0 || row.payments.length > 0,
    },
  });
  await refresh(tx, id);
  await event(
    tx,
    actor,
    id,
    "RESERVATION_EXPIRED",
    "Reservation expired. Any payment requires admin review and a new stock check.",
  );
  return true;
}
export async function expireReservations(
  actor: Actor | null,
  operator = false,
) {
  if (actor) allowed(actor, "orders.manage");
  else if (!operator)
    throw new AppError(403, "FORBIDDEN", "Operator authorization required.");
  const rows = await getDb().stockReservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
    select: { orderId: true },
    distinct: ["orderId"],
    take: 100,
    orderBy: { expiresAt: "asc" },
  });
  let expired = 0;
  for (const row of rows)
    if (await getDb().$transaction((tx) => expireOne(tx, row.orderId, actor)))
      expired++;
  return { expired, batchLimit: 100 };
}
export async function orderAction(
  actor: Actor,
  id: string,
  input: unknown,
  admin = false,
) {
  const data = z
    .object({
      action: z.enum([
        "CANCEL",
        "NOTE",
        "RESOLVE_LATE",
        "RESOLVE_OVERPAYMENT",
        "REFUND_DECISION",
      ]),
      version: z.number().int().nonnegative(),
      reason,
      internalNotes: z.string().trim().max(1000).default(""),
    })
    .strict()
    .parse(input);
  if (admin) allowed(actor, "orders.manage");
  else if (data.action !== "CANCEL")
    throw new AppError(403, "FORBIDDEN", "Restricted action.");
  return getDb().$transaction(async (tx) => {
    await expireOne(tx, id, actor);
    let row = await load(tx, id);
    authorize(actor, row, admin);
    if (data.action === "CANCEL" && row.cancelledAt) return dto(row, admin);
    if (row.version !== data.version) throw conflict();
    await stockLocks(tx, row);
    if (
      row.reservations.some(
        (r) => !["ACTIVE", "EXPIRED", "RELEASED"].includes(r.status),
      )
    )
      throw invalid(
        "Order has consumed reservations; cancellation requires a future returns workflow.",
      );
    if (data.action === "CANCEL") {
      const net = paymentBalance(row.payments);
      const rules = row.cancellationRules as {
        customerCancelUnpaid: boolean;
        adminCancelPaid: boolean;
        adminCancelUnpaid: boolean;
      };
      if (
        admin
          ? net > 0
            ? !rules.adminCancelPaid
            : !rules.adminCancelUnpaid
          : net > 0 || !rules.customerCancelUnpaid
      )
        throw invalid(
          "Cancellation is not permitted by this order's confirmed policy.",
        );
      for (const r of row.reservations.filter((r) => r.status === "ACTIVE"))
        await tx.stockReservation.update({
          where: { id: r.id },
          data: {
            status: "RELEASED",
            version: { increment: 1 },
            changedById: actor.id,
            reason: data.reason,
          },
        });
      await tx.salesOrder.update({
        where: { id },
        data: {
          cancelledAt: new Date(),
          cancelledById: actor.id,
          refundDecisionRequired: net > 0,
        },
      });
    } else if (data.action === "NOTE") {
      await tx.salesOrder.update({
        where: { id },
        data: { internalNotes: data.internalNotes || data.reason },
      });
    } else if (data.action === "RESOLVE_LATE") {
      if (row.cancelledAt)
        throw invalid("Cancelled orders cannot be re-reserved.");
      if (row.reservations.some((r) => r.status === "RELEASED"))
        throw invalid("Released reservations cannot be restored.");
      for (const r of row.reservations.filter((r) => r.status === "EXPIRED")) {
        if ((await stock(tx, r.variantId)).available < r.quantity)
          throw invalid("Insufficient stock to resolve late payment.");
        await tx.stockReservation.update({
          where: { id: r.id },
          data: {
            status: "ACTIVE",
            expiresAt: new Date(Date.now() + row.reservationMinutes * 60000),
            version: { increment: 1 },
            changedById: actor.id,
            reason: data.reason,
          },
        });
      }
      await tx.salesOrder.update({
        where: { id },
        data: { lateReviewRequired: false },
      });
    } else if (data.action === "RESOLVE_OVERPAYMENT") {
      if (paymentBalance(row.payments) <= row.totalPaise)
        throw invalid("No overpayment to resolve.");
      await tx.salesOrder.update({
        where: { id },
        data: { overpaymentResolved: true },
      });
    } else {
      if (!row.cancelledAt)
        throw invalid("Refund decisions apply to cancelled orders.");
      await tx.salesOrder.update({
        where: { id },
        data: { refundDecisionRequired: false },
      });
    }
    await event(
      tx,
      actor,
      id,
      data.action,
      data.action === "NOTE"
        ? "Order reviewed by FIXUP."
        : `${data.action.replaceAll("_", " ")}: ${data.reason}`,
      data.internalNotes,
    );
    row = await refresh(tx, id);
    return dto(row, admin);
  });
}
