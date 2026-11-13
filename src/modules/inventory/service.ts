import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/server/permissions/service";
import { allowed, conflict, history } from "@/modules/management/history";
import { AppError } from "@/server/http/errors";
import {
  supplierSchema,
  purchaseSchema,
  receiptSchema,
  actionSchema,
  adjustmentSchema,
  thresholdSchema,
  calculate,
} from "./schemas";
export type Tx = Prisma.TransactionClient;
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const date = (v: string | null | undefined) =>
  v ? new Date(`${v}T00:00:00Z`) : null;
const invalid = (message: string) =>
  new AppError(422, "INVALID_OPERATION", message);
const missing = () => new AppError(404, "NOT_FOUND", "Record not found.");
export async function lock(tx: Tx, key: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
}
export async function stock(tx: Tx, variantId: string, lotId?: string) {
  const a = await tx.stockMovement.aggregate({
    where: { variantId, ...(lotId ? { lotId } : {}) },
    _sum: { availableDelta: true, damagedDelta: true },
  });
  const reserved = lotId
    ? 0
    : ((
        await tx.stockReservation.aggregate({
          where: { variantId, status: "ACTIVE" },
          _sum: { quantity: true },
        })
      )._sum.quantity ?? 0);
  return {
    onHand: a._sum.availableDelta ?? 0,
    reserved,
    available: (a._sum.availableDelta ?? 0) - reserved,
    damaged: a._sum.damagedDelta ?? 0,
  };
}
function replay<T extends { payloadDigest: string }>(
  row: T | null,
  hash: string,
) {
  if (row && row.payloadDigest !== hash)
    throw new AppError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "This request key was used with different data.",
    );
  return row;
}
export async function saveSupplier(
  actor: Actor,
  id: string | undefined,
  input: unknown,
) {
  allowed(actor, "suppliers.manage");
  const { reason, version, variantIds, ...data } = supplierSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    if (id && version === undefined) throw conflict();
    const before = id
      ? await tx.supplier.findUnique({
          where: { id },
          include: { variants: true },
        })
      : null;
    if (id && !before) throw missing();
    if (
      (await tx.productVariant.count({ where: { id: { in: variantIds } } })) !==
      variantIds.length
    )
      throw invalid("Choose existing supplied variants.");
    const identityKey = digest([
      data.name.toLowerCase().replace(/\s+/g, " "),
      data.phone.replace(/\D/g, ""),
      data.postalCode,
    ]);
    if (id) {
      const changed = await tx.supplier.updateMany({
        where: { id, version },
        data: { ...data, identityKey, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw conflict();
      await tx.supplierVariant.deleteMany({ where: { supplierId: id } });
    }
    const supplier = id
      ? await tx.supplier.findUniqueOrThrow({ where: { id } })
      : await tx.supplier.create({ data: { ...data, identityKey } });
    await tx.supplierVariant.createMany({
      data: variantIds.map((variantId) => ({
        supplierId: supplier.id,
        variantId,
      })),
    });
    await history(
      tx,
      actor,
      "Supplier",
      supplier.id,
      "SUPPLIER_CHANGED",
      reason,
      before,
      { ...supplier, variantIds },
    );
    return supplier;
  });
}
const poInclude = {
  lines: { orderBy: { id: "asc" as const } },
  supplier: true,
  receipts: {
    orderBy: { createdAt: "desc" as const },
    include: { lines: true },
  },
};
export async function purchaseDetail(actor: Actor, id: string) {
  allowed(actor, "purchasing.manage");
  const row = await getDb().purchaseOrder.findUnique({
    where: { id },
    include: poInclude,
  });
  if (!row) throw missing();
  return row;
}
export async function savePurchase(
  actor: Actor,
  id: string | undefined,
  input: unknown,
) {
  allowed(actor, "purchasing.manage");
  const data = purchaseSchema.parse(input);
  const hash = digest(data);
  let priced: ReturnType<typeof calculate>;
  try {
    priced = calculate(data.lines);
  } catch {
    throw invalid("Purchase total exceeds the supported amount limit.");
  }
  return getDb().$transaction(async (tx) => {
    await lock(tx, id ? `po:${id}` : `request:${data.requestId}`);
    if (!id) {
      const previous = replay(
        await tx.purchaseOrder.findUnique({
          where: { requestId: data.requestId },
          include: poInclude,
        }),
        hash,
      );
      if (previous) return previous;
    }
    const before = id
      ? await tx.purchaseOrder.findUnique({
          where: { id },
          include: { lines: true },
        })
      : null;
    if (
      id &&
      (!before ||
        before.status !== "DRAFT" ||
        before.version !== data.version ||
        before.requestId !== data.requestId)
    )
      throw conflict();
    const supplier = await tx.supplier.findUnique({
      where: { id: data.supplierId },
    });
    if (!supplier || supplier.status !== "ACTIVE")
      throw invalid("Select an active supplier.");
    const variants = await tx.productVariant.findMany({
      where: {
        id: { in: data.lines.map((l) => l.variantId) },
        active: true,
        product: { active: true },
      },
      include: { product: { select: { name: true } } },
    });
    if (variants.length !== data.lines.length)
      throw invalid("Choose active variants of active products.");
    const lines = priced.items.map((l) => {
      const v = variants.find((v) => v.id === l.variantId)!;
      return {
        ...l,
        productName: v.product.name,
        variantName: v.name,
        packSize: v.packSize,
        sku: v.sku,
      };
    });
    const { items: _, ...amounts } = priced;
    void _;
    const values = {
      supplierId: supplier.id,
      supplierSnapshot: {
        name: supplier.name,
        contactName: supplier.contactName,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        city: supplier.city,
        state: supplier.state,
        postalCode: supplier.postalCode,
        gstin: supplier.gstin,
        paymentTerms: supplier.paymentTerms,
      },
      expectedDate: date(data.expectedDate),
      notes: data.notes,
      ...amounts,
    };
    if (id)
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
    const row = id
      ? await tx.purchaseOrder.update({
          where: { id },
          data: {
            ...values,
            version: { increment: 1 },
            lines: { create: lines },
          },
          include: poInclude,
        })
      : await tx.purchaseOrder.create({
          data: {
            ...values,
            requestId: data.requestId,
            payloadDigest: hash,
            createdById: actor.id,
            lines: { create: lines },
          },
          include: poInclude,
        });
    await history(
      tx,
      actor,
      "PurchaseOrder",
      row.id,
      "PURCHASE_CHANGED",
      data.reason,
      before,
      row,
    );
    return row;
  });
}
export async function purchaseAction(actor: Actor, id: string, input: unknown) {
  allowed(actor, "purchasing.manage");
  const data = actionSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    await lock(tx, `po:${id}`);
    const before = await tx.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true, supplier: true },
    });
    if (!before) throw missing();
    if (before.version !== data.version) throw conflict();
    if (data.action === "SUBMIT") {
      if (before.status !== "DRAFT" || before.supplier.status !== "ACTIVE")
        throw invalid(
          "Only draft orders with active suppliers can be submitted.",
        );
    } else if (data.action === "CANCEL") {
      if (
        !["DRAFT", "SUBMITTED"].includes(before.status) ||
        before.lines.some((l) => l.receivedQuantity)
      )
        throw invalid(
          "Only unreceived draft/submitted orders can be cancelled.",
        );
      const drafts = await tx.goodsReceipt.findMany({
        where: { purchaseOrderId: id, status: "DRAFT" },
      });
      for (const receipt of drafts) {
        const cancelled = await tx.goodsReceipt.update({
          where: { id: receipt.id },
          data: { status: "CANCELLED", version: { increment: 1 } },
        });
        await history(
          tx,
          actor,
          "GoodsReceipt",
          receipt.id,
          "GOODS_RECEIPT_CHANGED",
          `PO cancellation: ${data.reason}`,
          receipt,
          cancelled,
        );
      }
    } else throw invalid("Unsupported purchase action.");
    const row = await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: data.action === "SUBMIT" ? "SUBMITTED" : "CANCELLED",
        version: { increment: 1 },
      },
      include: poInclude,
    });
    await history(
      tx,
      actor,
      "PurchaseOrder",
      id,
      "PURCHASE_CHANGED",
      data.reason,
      before,
      row,
    );
    return row;
  });
}
const grnInclude = {
  lines: {
    include: { purchaseLine: true, lot: true },
    orderBy: { id: "asc" as const },
  },
  purchaseOrder: { include: { supplier: true, lines: true } },
};
export async function receiptDetail(actor: Actor, id: string) {
  allowed(actor, "purchasing.manage");
  const row = await getDb().goodsReceipt.findUnique({
    where: { id },
    include: grnInclude,
  });
  if (!row) throw missing();
  return row;
}
export async function saveReceipt(
  actor: Actor,
  id: string | undefined,
  input: unknown,
) {
  allowed(actor, "purchasing.manage");
  const data = receiptSchema.parse(input);
  const hash = digest(data);
  return getDb().$transaction(async (tx) => {
    await lock(tx, `po:${data.purchaseOrderId}`);
    await lock(tx, `request:${data.requestId}`);
    if (!id) {
      const previous = replay(
        await tx.goodsReceipt.findUnique({
          where: { requestId: data.requestId },
          include: grnInclude,
        }),
        hash,
      );
      if (previous) return previous;
    }
    const before = id
      ? await tx.goodsReceipt.findUnique({
          where: { id },
          include: { lines: true },
        })
      : null;
    if (
      id &&
      (!before ||
        before.status !== "DRAFT" ||
        before.version !== data.version ||
        before.purchaseOrderId !== data.purchaseOrderId ||
        before.requestId !== data.requestId)
    )
      throw conflict();
    const po = await tx.purchaseOrder.findUnique({
      where: { id: data.purchaseOrderId },
      include: { lines: true },
    });
    if (!po || !["SUBMITTED", "PARTIALLY_RECEIVED"].includes(po.status))
      throw invalid("Receiving requires a submitted, outstanding PO.");
    for (const l of data.lines) {
      const p = po.lines.find((p) => p.id === l.purchaseLineId);
      if (!p || l.quantity > p.quantity - p.receivedQuantity)
        throw invalid(
          "Received quantity exceeds the outstanding PO line or references another PO.",
        );
    }
    const lines = data.lines.map((l) => ({
      ...l,
      manufacturedAt: date(l.manufacturedAt),
      expiresAt: date(l.expiresAt),
    }));
    if (id) await tx.goodsReceiptLine.deleteMany({ where: { receiptId: id } });
    const row = id
      ? await tx.goodsReceipt.update({
          where: { id },
          data: {
            invoiceReference: data.invoiceReference,
            notes: data.notes,
            version: { increment: 1 },
            lines: { create: lines },
          },
          include: grnInclude,
        })
      : await tx.goodsReceipt.create({
          data: {
            requestId: data.requestId,
            payloadDigest: hash,
            purchaseOrderId: po.id,
            invoiceReference: data.invoiceReference,
            notes: data.notes,
            createdById: actor.id,
            lines: { create: lines },
          },
          include: grnInclude,
        });
    await history(
      tx,
      actor,
      "GoodsReceipt",
      row.id,
      "GOODS_RECEIPT_CHANGED",
      data.reason,
      before,
      row,
    );
    return row;
  });
}
async function refreshPurchase(tx: Tx, id: string) {
  const lines = await tx.purchaseOrderLine.findMany({
    where: { purchaseOrderId: id },
  });
  const status = lines.every((l) => l.receivedQuantity === l.quantity)
    ? "FULLY_RECEIVED"
    : lines.some((l) => l.receivedQuantity > 0)
      ? "PARTIALLY_RECEIVED"
      : "SUBMITTED";
  await tx.purchaseOrder.update({
    where: { id },
    data: { status, version: { increment: 1 } },
  });
}
export async function receiptAction(actor: Actor, id: string, input: unknown) {
  allowed(actor, "purchasing.manage");
  const data = actionSchema.parse(input);
  if (data.action === "REVERSE") allowed(actor, "inventory.reverse");
  return getDb().$transaction(
    async (tx) => {
      const reference = await tx.goodsReceipt.findUnique({
        where: { id },
        select: { purchaseOrderId: true },
      });
      if (!reference) throw missing();
      await lock(tx, `po:${reference.purchaseOrderId}`);
      const before = await tx.goodsReceipt.findUniqueOrThrow({
        where: { id },
        include: grnInclude,
      });
      if (
        (data.action === "CONFIRM" && before.status === "COMPLETED") ||
        (data.action === "REVERSE" && before.status === "REVERSED") ||
        (data.action === "CANCEL" && before.status === "CANCELLED")
      )
        return before;
      if (before.version !== data.version) throw conflict();
      if (data.action === "CANCEL") {
        if (before.status !== "DRAFT")
          throw invalid(
            "Only draft GRNs can be cancelled; completed receipts require authorized reversal.",
          );
        await tx.goodsReceipt.update({
          where: { id },
          data: { status: "CANCELLED", version: { increment: 1 } },
        });
      } else if (data.action === "CONFIRM" || data.action === "REVERSE") {
        const reverse = data.action === "REVERSE";
        if (
          reverse
            ? before.status !== "COMPLETED"
            : before.status !== "DRAFT" ||
              !["SUBMITTED", "PARTIALLY_RECEIVED"].includes(
                before.purchaseOrder.status,
              )
        )
          throw invalid("Receipt state does not allow this action.");
        for (const variantId of [
          ...new Set(before.lines.map((l) => l.purchaseLine.variantId)),
        ].sort())
          await lock(tx, `stock:${variantId}`);
        for (const l of before.lines) {
          if (
            !reverse &&
            l.quantity >
              l.purchaseLine.quantity - l.purchaseLine.receivedQuantity
          )
            throw invalid(
              "This GRN exceeds remaining quantity after other receipts.",
            );
          if (reverse) {
            if (!l.lot) throw invalid("Receipt lot is unavailable.");
            const balance = await stock(tx, l.purchaseLine.variantId, l.lot.id);
            if (
              balance.available < l.quantity ||
              balance.damaged > 0 ||
              (await stock(tx, l.purchaseLine.variantId)).available < l.quantity
            )
              throw invalid(
                "Cannot reverse a receipt whose stock was consumed or damaged; correct stock through an audited workflow first.",
              );
          }
        }
        await tx.goodsReceipt.update({
          where: { id },
          data: {
            status: reverse ? "REVERSED" : "COMPLETED",
            version: { increment: 1 },
            ...(reverse
              ? {
                  reversedById: actor.id,
                  reversedAt: new Date(),
                  correctionReason: data.reason,
                }
              : { completedById: actor.id, completedAt: new Date() }),
          },
        });
        for (const l of before.lines) {
          const variantId = l.purchaseLine.variantId;
          const lot = reverse
            ? l.lot!
            : await tx.stockLot.create({
                data: {
                  variantId,
                  receiptLineId: l.id,
                  batchNumber: l.batchNumber,
                  manufacturedAt: l.manufacturedAt,
                  expiresAt: l.expiresAt,
                },
              });
          await tx.stockMovement.create({
            data: {
              variantId,
              lotId: lot.id,
              kind: reverse ? "RECEIPT_REVERSAL" : "PURCHASE_RECEIVING",
              availableDelta: reverse ? -l.quantity : l.quantity,
              receiptLineId: l.id,
              reason: data.reason,
              actorId: actor.id,
            },
          });
        }
        await refreshPurchase(tx, before.purchaseOrderId);
      } else throw invalid("Unsupported receipt action.");
      const row = await tx.goodsReceipt.findUniqueOrThrow({
        where: { id },
        include: grnInclude,
      });
      await history(
        tx,
        actor,
        "GoodsReceipt",
        id,
        "GOODS_RECEIPT_CHANGED",
        data.reason,
        before,
        row,
      );
      return row;
    },
    { timeout: 15000 },
  );
}
export async function adjustStock(actor: Actor, input: unknown) {
  allowed(actor, "inventory.adjust");
  const data = adjustmentSchema.parse(input);
  const hash = digest(data);
  return getDb().$transaction(async (tx) => {
    await lock(tx, `request:${data.requestId}`);
    const previous = replay(
      await tx.stockAdjustment.findUnique({
        where: { requestId: data.requestId },
        include: { movement: true },
      }),
      hash,
    );
    if (previous) return previous;
    await lock(tx, `stock:${data.variantId}`);
    if (!(await tx.productVariant.count({ where: { id: data.variantId } })))
      throw missing();
    if (
      data.kind === "OPENING" &&
      (await tx.stockMovement.count({ where: { variantId: data.variantId } }))
    )
      throw invalid("Opening stock already exists; use a physical correction.");
    const before = await stock(tx, data.variantId);
    let lot = data.lotId
      ? await tx.stockLot.findFirst({
          where: { id: data.lotId, variantId: data.variantId },
        })
      : null;
    if (data.lotId && !lot)
      throw invalid("Choose a lot belonging to this variant.");
    const delta = data.kind === "DAMAGE" ? -data.quantity : data.quantity;
    const damagedDelta = data.kind === "DAMAGE" ? data.quantity : 0;
    if (lot) {
      const b = await stock(tx, data.variantId, lot.id);
      if (b.available + delta < 0)
        throw invalid("Lot has insufficient available stock.");
    }
    if (before.available + delta < 0)
      throw invalid("Adjustment would create negative stock.");
    if (!lot)
      lot = await tx.stockLot.create({
        data: {
          variantId: data.variantId,
          batchNumber: data.batchNumber,
          manufacturedAt: date(data.manufacturedAt),
          expiresAt: date(data.expiresAt),
        },
      });
    const row = await tx.stockAdjustment.create({
      data: {
        requestId: data.requestId,
        payloadDigest: hash,
        kind: data.kind,
        reason: data.reason,
        actorId: actor.id,
      },
    });
    await tx.stockMovement.create({
      data: {
        variantId: data.variantId,
        lotId: lot.id,
        kind:
          data.kind === "OPENING"
            ? "OPENING_STOCK"
            : data.kind === "DAMAGE"
              ? "DAMAGE"
              : data.kind === "CORRECTION"
                ? "STOCK_CORRECTION"
                : "STOCK_ADJUSTMENT",
        availableDelta: delta,
        damagedDelta,
        adjustmentId: row.id,
        reason: data.reason,
        actorId: actor.id,
      },
    });
    const result = await tx.stockAdjustment.findUniqueOrThrow({
      where: { id: row.id },
      include: { movement: true },
    });
    await history(
      tx,
      actor,
      "StockAdjustment",
      row.id,
      "STOCK_ADJUSTED",
      data.reason,
      before,
      result,
    );
    return result;
  });
}
export async function setThreshold(
  actor: Actor,
  variantId: string,
  input: unknown,
) {
  allowed(actor, "inventory.adjust");
  const data = thresholdSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    await lock(tx, `stock:${variantId}`);
    if (!(await tx.productVariant.count({ where: { id: variantId } })))
      throw missing();
    const before = await tx.stockSetting.findUnique({ where: { variantId } });
    if ((before?.version ?? 0) !== data.version) throw conflict();
    const row = await tx.stockSetting.upsert({
      where: { variantId },
      create: { variantId, minimumQuantity: data.minimumQuantity, version: 1 },
      update: {
        minimumQuantity: data.minimumQuantity,
        version: { increment: 1 },
      },
    });
    await history(
      tx,
      actor,
      "StockSetting",
      variantId,
      "STOCK_THRESHOLD_CHANGED",
      data.reason,
      before,
      row,
    );
    return row;
  });
}
