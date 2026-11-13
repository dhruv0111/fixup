import "server-only";
import { getDb } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/server/permissions/service";
import { allowed } from "@/modules/management/history";
import { AppError } from "@/server/http/errors";
import { querySchema } from "./schemas";
import { stock } from "./service";
const maximum = 10000;
function bounded<T>(items: T[]) {
  if (items.length > maximum)
    throw new AppError(
      422,
      "REPORT_LIMIT",
      "More than 10,000 records match. Narrow your search/date filters.",
    );
  return items;
}
const range = (q: { from?: string | null; to?: string | null }) => ({
  ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}),
  ...(q.to
    ? { lt: new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86400000) }
    : {}),
});

const movementInclude = {
  variant: { include: { product: { select: { name: true } } } },
  lot: true,
  receiptLine: { include: { receipt: { select: { number: true } } } },
} as const;
function movementWhere(
  q: ReturnType<typeof querySchema.parse>,
): Prisma.StockMovementWhereInput {
  return {
    createdAt: range(q),
    ...(q.variantId ? { variantId: q.variantId } : {}),
    ...(q.supplierId
      ? {
          lot: {
            receiptLine: {
              receipt: { purchaseOrder: { supplierId: q.supplierId } },
            },
          },
        }
      : {}),
    ...(q.kind === "damage" ? { kind: "DAMAGE" } : {}),
    ...(q.kind === "adjustments" ? { adjustmentId: { not: null } } : {}),
    ...(q.q
      ? {
          OR: [
            { reason: { contains: q.q, mode: "insensitive" } },
            { variant: { name: { contains: q.q, mode: "insensitive" } } },
            { lot: { batchNumber: { contains: q.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}
function movementRow(
  m: Prisma.StockMovementGetPayload<{ include: typeof movementInclude }>,
) {
  return {
    id: m.id,
    product: m.variant.product.name,
    variant: m.variant.name,
    variantId: m.variantId,
    lotId: m.lotId,
    batch: m.lot.batchNumber,
    type: m.kind,
    quantity: m.availableDelta,
    damagedQuantity: m.damagedDelta,
    previousStock: m.previousStock,
    updatedStock: m.updatedStock,
    previousDamaged: m.previousDamaged,
    updatedDamaged: m.updatedDamaged,
    reference: m.receiptLine?.receipt.number ?? m.adjustmentId,
    reason: m.reason,
    user: m.actorId,
    date: m.createdAt.toISOString(),
  };
}
export async function recentMovements(actor: Actor) {
  allowed(actor, "inventory.read");
  return (
    await getDb().stockMovement.findMany({
      include: movementInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
    })
  ).map(movementRow);
}
export async function stockRows(actor: Actor, input: unknown = {}) {
  allowed(actor, "inventory.read");
  const q = querySchema.parse(input);
  if (q.status && !["LOW", "OUT"].includes(q.status))
    throw new AppError(422, "INVALID_STATUS", "Choose LOW or OUT stock.");
  return getDb().$transaction(
    async (tx) => {
      const variants = bounded(
        await tx.productVariant.findMany({
          where: {
            ...(q.variantId ? { id: q.variantId } : {}),
            ...(q.q
              ? {
                  OR: [
                    { name: { contains: q.q, mode: "insensitive" } },
                    { sku: { contains: q.q, mode: "insensitive" } },
                    {
                      product: { name: { contains: q.q, mode: "insensitive" } },
                    },
                  ],
                }
              : {}),
          },
          include: {
            product: { select: { id: true, name: true } },
            stockSetting: true,
          },
          orderBy: [{ product: { name: "asc" } }, { packSize: "asc" }],
          take: maximum + 1,
        }),
      );
      const sums = await tx.stockMovement.groupBy({
        by: ["variantId"],
        where: {
          variantId: { in: variants.map((v) => v.id) },
          ...(q.to
            ? {
                createdAt: {
                  lt: new Date(
                    new Date(`${q.to}T00:00:00Z`).getTime() + 86400000,
                  ),
                },
              }
            : {}),
        },
        _sum: { availableDelta: true, damagedDelta: true },
        _count: true,
      });
      const reservations = await tx.reservationEvent.groupBy({
        by: ["variantId"],
        where: {
          ...(q.to
            ? {
                createdAt: {
                  lt: new Date(
                    new Date(`${q.to}T00:00:00Z`).getTime() + 86400000,
                  ),
                },
              }
            : {}),
        },
        _sum: { quantityDelta: true },
      });
      const rows = variants.map((v) => {
        const s = sums.find((s) => s.variantId === v.id);
        const onHand = s?._sum.availableDelta ?? 0,
          reserved =
            reservations.find((r) => r.variantId === v.id)?._sum
              .quantityDelta ?? 0,
          available = onHand - reserved,
          damaged = s?._sum.damagedDelta ?? 0,
          minimum = v.stockSetting?.minimumQuantity ?? null;
        return {
          variantId: v.id,
          productId: v.product.id,
          product: v.product.name,
          variant: v.name,
          packSize: v.packSize,
          sku: v.sku,
          active: v.active,
          onHand,
          reserved,
          available,
          damaged,
          total: onHand + damaged,
          minimumQuantity: minimum,
          lowStock: minimum !== null && available <= minimum,
          outOfStock: available === 0,
          movements: s?._count ?? 0,
          settingVersion: v.stockSetting?.version ?? 0,
        };
      });
      return rows.filter((r) =>
        q.status === "LOW"
          ? r.lowStock
          : q.status === "OUT"
            ? r.outOfStock
            : true,
      );
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function options(actor: Actor) {
  allowed(actor, "inventory.read");
  const db = getDb();
  const [suppliers, variants, lots] = await Promise.all([
    db.supplier.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 1000,
    }),
    db.productVariant.findMany({
      include: { product: { select: { name: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: maximum,
    }),
    db.stockLot.findMany({
      include: {
        variant: { select: { name: true } },
        movements: { select: { availableDelta: true, damagedDelta: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
  ]);
  return {
    suppliers,
    variants: variants.map((v) => ({
      id: v.id,
      name: `${v.product.name} / ${v.name} (${v.packSize})`,
    })),
    lots: lots.map((l) => ({
      id: l.id,
      variantId: l.variantId,
      name: `${l.variant.name} / ${l.batchNumber ?? "Unbatched"} / ${l.id}`,
      available: l.movements.reduce((s, m) => s + m.availableDelta, 0),
      damaged: l.movements.reduce((s, m) => s + m.damagedDelta, 0),
    })),
  };
}
export async function supplierDetail(actor: Actor, id: string) {
  allowed(actor, "suppliers.manage");
  const row = await getDb().supplier.findUnique({
    where: { id },
    include: {
      variants: {
        include: {
          variant: { include: { product: { select: { name: true } } } },
        },
      },
      purchases: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { lines: true },
      },
    },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Supplier not found.");
  return row;
}
export async function internalHistory(actor: Actor, id: string) {
  allowed(actor, "inventory.read");
  return getDb().auditLog.findMany({
    where: { entityId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
export async function listRecords(
  actor: Actor,
  resource: string,
  input: unknown = {},
) {
  allowed(actor, "inventory.read");
  const q = querySchema.parse(input),
    db = getDb();
  let rows: unknown[];
  if (resource === "suppliers") {
    allowed(actor, "suppliers.manage");
    if (q.status && !["ACTIVE", "INACTIVE", "BLOCKED"].includes(q.status))
      throw new AppError(422, "INVALID_STATUS", "Invalid supplier status.");
    const where: Prisma.SupplierWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: "insensitive" } },
              { email: { contains: q.q, mode: "insensitive" } },
              { phone: { contains: q.q } },
              { gstin: { contains: q.q, mode: "insensitive" } },
            ],
          }
        : {}),
      createdAt: range(q),
    };
    const [items, total] = await Promise.all([
      db.supplier.findMany({
        where,
        include: { _count: { select: { purchases: true, variants: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * 25,
        take: 25,
      }),
      db.supplier.count({ where }),
    ]);
    return { items, total, page: q.page, pages: Math.ceil(total / 25) };
  }
  if (resource === "purchase-orders") {
    allowed(actor, "purchasing.manage");
    if (
      q.status &&
      ![
        "DRAFT",
        "SUBMITTED",
        "PARTIALLY_RECEIVED",
        "FULLY_RECEIVED",
        "CANCELLED",
      ].includes(q.status)
    )
      throw new AppError(422, "INVALID_STATUS", "Invalid purchase status.");
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.supplierId ? { supplierId: q.supplierId } : {}),
      ...(q.q
        ? {
            OR: [
              { number: { contains: q.q, mode: "insensitive" } },
              { supplier: { name: { contains: q.q, mode: "insensitive" } } },
            ],
          }
        : {}),
      createdAt: range(q),
    };
    const [items, total] = await Promise.all([
      db.purchaseOrder.findMany({
        where,
        include: { supplier: { select: { name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * 25,
        take: 25,
      }),
      db.purchaseOrder.count({ where }),
    ]);
    return { items, total, page: q.page, pages: Math.ceil(total / 25) };
  }
  if (resource === "goods-receiving") {
    allowed(actor, "purchasing.manage");
    if (
      q.status &&
      !["DRAFT", "COMPLETED", "CANCELLED", "REVERSED"].includes(q.status)
    )
      throw new AppError(422, "INVALID_STATUS", "Invalid receiving status.");
    const where: Prisma.GoodsReceiptWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { number: { contains: q.q, mode: "insensitive" } },
              { invoiceReference: { contains: q.q, mode: "insensitive" } },
              {
                purchaseOrder: {
                  number: { contains: q.q, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
      createdAt: range(q),
    };
    const [items, total] = await Promise.all([
      db.goodsReceipt.findMany({
        where,
        include: { purchaseOrder: { select: { number: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * 25,
        take: 25,
      }),
      db.goodsReceipt.count({ where }),
    ]);
    return { items, total, page: q.page, pages: Math.ceil(total / 25) };
  }
  if (resource === "inventory") rows = await stockRows(actor, input);
  else if (resource === "stock-ledger" || resource === "stock-adjustments") {
    const where = movementWhere({
      ...q,
      kind: resource === "stock-ledger" ? "movements" : "adjustments",
    });
    const [items, total] = await Promise.all([
      db.stockMovement.findMany({
        where,
        include: movementInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (q.page - 1) * 25,
        take: 25,
      }),
      db.stockMovement.count({ where }),
    ]);
    return {
      items: items.map(movementRow),
      total,
      page: q.page,
      pages: Math.ceil(total / 25),
    };
  } else throw new AppError(404, "NOT_FOUND", "Resource not found.");
  return {
    items: rows.slice((q.page - 1) * 25, q.page * 25),
    total: rows.length,
    page: q.page,
    pages: Math.ceil(rows.length / 25),
  };
}
export async function lotDetail(actor: Actor, id: string) {
  allowed(actor, "inventory.read");
  return getDb().$transaction(
    async (tx) => {
      const row = await tx.stockLot.findUnique({
        where: { id },
        include: {
          variant: { include: { product: { select: { name: true } } } },
          receiptLine: {
            include: {
              receipt: {
                include: {
                  purchaseOrder: {
                    include: { supplier: { select: { name: true } } },
                  },
                },
              },
            },
          },
        },
      });
      if (!row) throw new AppError(404, "NOT_FOUND", "Lot not found.");
      return { ...row, ...(await stock(tx, row.variantId, id)) };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function report(
  actor: Actor,
  input: unknown,
): Promise<Record<string, unknown>[]> {
  allowed(actor, "inventory.read");
  const q = querySchema.parse(input),
    db = getDb();
  if (q.kind === "stock" || q.kind === "low-stock")
    return (
      await stockRows(actor, {
        ...q,
        status: q.kind === "low-stock" ? "LOW" : q.status,
      })
    ).map((r) => ({ ...r }));
  if (q.kind === "purchases" || q.kind === "suppliers") {
    allowed(actor, "purchasing.manage");
    const rows = bounded(
      await db.purchaseOrder.findMany({
        where: {
          createdAt: range(q),
          ...(q.supplierId ? { supplierId: q.supplierId } : {}),
          ...(q.status ? { status: q.status } : {}),
          ...(q.q
            ? {
                OR: [
                  { number: { contains: q.q, mode: "insensitive" } },
                  {
                    supplier: { name: { contains: q.q, mode: "insensitive" } },
                  },
                ],
              }
            : {}),
        },
        include: { supplier: true },
        orderBy: { createdAt: "desc" },
        take: maximum + 1,
      }),
    );
    if (q.kind === "purchases")
      return rows.map((p) => ({
        id: p.id,
        number: p.number,
        supplier:
          (p.supplierSnapshot as { name?: string }).name ?? p.supplier.name,
        status: p.status,
        date: p.createdAt.toISOString(),
        expectedDate: p.expectedDate?.toISOString().slice(0, 10) ?? null,
        subtotalPaise: p.subtotalPaise,
        discountPaise: p.discountPaise,
        taxPaise: p.taxPaise,
        totalPaise: p.totalPaise,
      }));
    const grouped = new Map<
      string,
      {
        supplierId: string;
        supplier: string;
        orders: number;
        cancelled: number;
        committedTotalPaise: number;
      }
    >();
    for (const p of rows) {
      const r = grouped.get(p.supplierId) ?? {
        supplierId: p.supplierId,
        supplier: p.supplier.name,
        orders: 0,
        cancelled: 0,
        committedTotalPaise: 0,
      };
      r.orders++;
      if (p.status === "CANCELLED") r.cancelled++;
      if (!["DRAFT", "CANCELLED"].includes(p.status))
        r.committedTotalPaise += p.totalPaise;
      grouped.set(p.supplierId, r);
    }
    return [...grouped.values()];
  }
  if (q.kind === "receipts")
    return bounded(
      await db.goodsReceipt.findMany({
        where: {
          createdAt: range(q),
          ...(q.status ? { status: q.status } : {}),
          ...(q.supplierId
            ? { purchaseOrder: { supplierId: q.supplierId } }
            : {}),
          ...(q.q
            ? {
                OR: [
                  { number: { contains: q.q, mode: "insensitive" } },
                  { invoiceReference: { contains: q.q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: {
          purchaseOrder: { select: { number: true } },
          _count: { select: { lines: true } },
        },
        orderBy: { createdAt: "desc" },
        take: maximum + 1,
      }),
    ).map((r) => ({
      id: r.id,
      number: r.number,
      purchaseOrder: r.purchaseOrder.number,
      status: r.status,
      invoiceReference: r.invoiceReference,
      createdBy: r.createdById,
      completedBy: r.completedById,
      completedAt: r.completedAt?.toISOString() ?? null,
      date: r.createdAt.toISOString(),
      lines: r._count.lines,
    }));
  if (q.kind === "batches")
    return db.$transaction(
      async (tx) => {
        const lots = bounded(
          await tx.stockLot.findMany({
            where: {
              ...(q.variantId ? { variantId: q.variantId } : {}),
              ...(q.supplierId
                ? {
                    receiptLine: {
                      receipt: { purchaseOrder: { supplierId: q.supplierId } },
                    },
                  }
                : {}),
              ...(q.from || q.to ? { expiresAt: range(q) } : {}),
              ...(q.q
                ? {
                    OR: [
                      { batchNumber: { contains: q.q, mode: "insensitive" } },
                      {
                        variant: {
                          name: { contains: q.q, mode: "insensitive" },
                        },
                      },
                    ],
                  }
                : {}),
            },
            include: {
              variant: { include: { product: { select: { name: true } } } },
              receiptLine: {
                include: {
                  receipt: {
                    include: {
                      purchaseOrder: {
                        select: { supplierId: true, supplierSnapshot: true },
                      },
                    },
                  },
                },
              },
            },
            orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
            take: maximum + 1,
          }),
        );
        const sums = await tx.stockMovement.groupBy({
          by: ["lotId"],
          where: { lotId: { in: lots.map((l) => l.id) } },
          _sum: { availableDelta: true, damagedDelta: true },
        });
        return lots
          .filter(
            (l) =>
              !q.supplierId ||
              l.receiptLine?.receipt.purchaseOrder.supplierId === q.supplierId,
          )
          .map((l) => {
            const s = sums.find((s) => s.lotId === l.id);
            return {
              lotId: l.id,
              variantId: l.variantId,
              product: l.variant.product.name,
              variant: l.variant.name,
              batch: l.batchNumber,
              manufactured:
                l.manufacturedAt?.toISOString().slice(0, 10) ?? null,
              expiry: l.expiresAt?.toISOString().slice(0, 10) ?? null,
              receivedQuantity: l.receiptLine?.quantity ?? null,
              available: s?._sum.availableDelta ?? 0,
              damaged: s?._sum.damagedDelta ?? 0,
              grn: l.receiptLine?.receipt.number ?? null,
              supplier: l.receiptLine
                ? ((
                    l.receiptLine.receipt.purchaseOrder.supplierSnapshot as {
                      name?: string;
                    }
                  ).name ?? null)
                : null,
              invoice: l.receiptLine?.receipt.invoiceReference ?? null,
            };
          });
      },
      { isolationLevel: "RepeatableRead" },
    );
  const where = movementWhere(q);
  return bounded(
    await db.stockMovement.findMany({
      where,
      include: {
        variant: { include: { product: { select: { name: true } } } },
        lot: true,
        receiptLine: { include: { receipt: { select: { number: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: maximum + 1,
    }),
  ).map(movementRow);
}
