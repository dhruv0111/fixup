import "server-only";
import { getDb } from "@/server/db/client";
import type { Actor } from "@/server/permissions/service";
import type { Prisma } from "@/generated/prisma/client";
import { allowed } from "@/modules/management/history";
import { AppError } from "@/server/http/errors";
import { reportQuery, reportKinds } from "./schemas";
import { resolveRange, validTimezone, dayInZone, bucket } from "./dates";
import {
  roundedRatio,
  safeNumber,
  sum,
  merchandiseRevenue,
  rupees,
} from "./math";
import { csv } from "@/modules/inventory/schemas";
import { eligibility as dispatchEligibility } from "@/modules/dispatch/service";
import { load as loadSalesOrder } from "@/modules/sales/orders";
type Tx = Prisma.TransactionClient;
type Query = ReturnType<typeof reportQuery.parse>;
type Range = ReturnType<typeof resolveRange>;
export type Row = Record<string, string | number | boolean | null>;
export type Metric = {
  key: string;
  label: string;
  value: number | null;
  unit: "INR" | "count" | "packs";
  definition: string;
};
export type Chart = {
  title: string;
  unit: "INR" | "count" | "packs";
  data: { label: string; value: number }[];
};
export type Report = {
  kind: string;
  range: { from: string; to: string; timezone: string; knowledgeAsOf: string };
  summary: Metric[];
  rows: Row[];
  charts: Chart[];
  warnings: string[];
  limit: number;
  methodology: string;
  details: { title: string; rows: Row[] }[];
};
const max = 10000;
function bounded<T>(rows: T[]) {
  if (rows.length > max)
    throw new AppError(
      422,
      "REPORT_LIMIT",
      "More than 10,000 source records match. Narrow the date or entity filters; no partial totals were returned.",
    );
  return rows;
}
const metric = (
  key: string,
  label: string,
  value: number | null,
  unit: Metric["unit"],
  definition: string,
): Metric => ({ key, label, value, unit, definition });
const money = (
  key: string,
  label: string,
  value: number | null,
  definition: string,
) => metric(key, label, value, "INR", definition);
const count = (key: string, label: string, value: number, definition: string) =>
  metric(key, label, value, "count", definition);
function trend(
  rows: { date: Date; value: number }[],
  r: Range,
  period: Query["period"],
) {
  const groups = new Map<string, number[]>();
  for (const x of rows) {
    const k = bucket(x.date, r.timezone, period);
    groups.set(k, [...(groups.get(k) ?? []), x.value]);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, values]) => ({ label, value: sum(values) }));
}
function distribution(values: string[]) {
  const m = new Map<string, number>();
  for (const s of values) m.set(s, (m.get(s) ?? 0) + 1);
  return [...m]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));
}
function textName(value: Prisma.JsonValue, key = "name") {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value[key] === "string"
    ? (value[key] as string)
    : "Name unavailable";
}
function inPeriod(d: Date, r: Range) {
  return d >= r.start && d < r.cutoff;
}
function net(
  payments: { kind: string; amountPaise: number; createdAt: Date }[],
  r: Range,
) {
  return sum(
    payments
      .filter((p) => p.createdAt < r.cutoff)
      .map((p) => (p.kind === "REFUND" ? -p.amountPaise : p.amountPaise)),
  );
}
function cancelledAt(order: { cancelledAt: Date | null }, r: Range) {
  return !!order.cancelledAt && order.cancelledAt < r.cutoff;
}
function orderFilter(q: Query): Prisma.SalesOrderWhereInput {
  return {
    ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
    ...(q.method ? { paymentMethod: q.method } : {}),
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.dealerId
      ? {
          customer: { dealer: { id: q.dealerId } },
          category: "APPROVED_DEALER",
        }
      : {}),
    ...(q.customerCategory ? { category: q.customerCategory } : {}),
    ...(q.productId || q.variantId
      ? {
          lines: {
            some: {
              ...(q.variantId ? { variantId: q.variantId } : {}),
              ...(q.productId ? { variant: { productId: q.productId } } : {}),
            },
          },
        }
      : {}),
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
  };
}
async function sources(
  tx: Tx,
  q: Query,
  r: Range,
  financial: boolean,
  kind: (typeof reportKinds)[number] | "dashboard",
) {
  const needed = (...k: string[]) => kind === "dashboard" || k.includes(kind);
  const expenseSearch = kind === "expenses" ? q.q : "";
  const where = orderFilter(q);
  // Cashflow and submission methods can differ from the checkout selection.
  // Keep entity/cohort filters, then match the actual record's method below.
  const paymentOrderWhere = orderFilter({ ...q, method: "" });
  const orders = bounded(
    await tx.salesOrder.findMany({
      where: {
        ...where,
        createdAt: { gte: r.start, lt: r.cutoff },
        ...(!needed(
          "sales",
          "payments",
          "products",
          "deliveries",
          "customers",
          "dealers",
        )
          ? { id: { in: [] } }
          : {}),
      },
      select: {
        id: true,
        number: true,
        customerId: true,
        category: true,
        customerSnapshot: true,
        createdAt: true,
        cancelledAt: true,
        status: true,
        paymentStatus: true,
        taxMode: true,
        totalPaise: true,
        lines: {
          select: {
            id: true,
            variantId: true,
            productName: true,
            variantName: true,
            packSize: true,
            quantity: true,
            linePricePaise: true,
            taxPaise: true,
            unitPricePaise: true,
            variant: {
              select: { productId: true, product: { select: { slug: true } } },
            },
          },
        },
        payments: {
          where: { createdAt: { lt: r.cutoff } },
          select: { kind: true, amountPaise: true, createdAt: true },
        },
        events: {
          where: { createdAt: { lt: r.cutoff } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { kind: true },
        },
        reservations: { select: { status: true, expiresAt: true } },
        dispatch: { select: { id: true, confirmedAt: true } },
      },
      orderBy: { id: "asc" },
      take: max + 1,
    }),
  );
  const payments = bounded(
    await tx.paymentRecord.findMany({
      where: {
        ...(!needed("payments") ? { id: { in: [] } } : {}),
        createdAt: { gte: r.start, lt: r.cutoff },
        order: paymentOrderWhere,
        ...(q.method ? { method: q.method } : {}),
      },
      select: {
        id: true,
        kind: true,
        method: true,
        amountPaise: true,
        createdAt: true,
        order: {
          select: {
            id: true,
            number: true,
            customerId: true,
            category: true,
            customerSnapshot: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: max + 1,
    }),
  );
  const submissions = bounded(
    await tx.paymentSubmission.findMany({
      where: {
        ...(!needed("payments") ? { id: { in: [] } } : {}),
        createdAt: { gte: r.start, lt: r.cutoff },
        order: paymentOrderWhere,
        ...(q.method ? { method: q.method } : {}),
        ...(q.reviewStatus ? { status: q.reviewStatus } : {}),
      },
      select: {
        id: true,
        status: true,
        method: true,
        createdAt: true,
        orderId: true,
      },
      take: max + 1,
    }),
  );
  const purchases = bounded(
    await tx.purchaseOrder.findMany({
      where: {
        ...(q.productId || q.variantId
          ? {
              lines: {
                some: {
                  ...(q.variantId ? { variantId: q.variantId } : {}),
                  ...(q.productId
                    ? { variant: { productId: q.productId } }
                    : {}),
                },
              },
            }
          : {}),
        ...(!needed("purchases", "suppliers") ? { id: { in: [] } } : {}),
        createdAt: { gte: r.start, lt: r.cutoff },
        ...(q.supplierId ? { supplierId: q.supplierId } : {}),
        ...(q.q
          ? {
              OR: [
                { number: { contains: q.q, mode: "insensitive" } },
                { supplier: { name: { contains: q.q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        number: true,
        supplierId: true,
        supplierSnapshot: true,
        status: true,
        createdAt: true,
        totalPaise: true,
        lines: {
          select: {
            id: true,
            variantId: true,
            productName: true,
            variantName: true,
            packSize: true,
            quantity: true,
            receivedQuantity: true,
            variant: { select: { productId: true } },
            subtotalPaise: true,
            discountPaise: true,
            totalPaise: true,
          },
        },
      },
      orderBy: { id: "asc" },
      take: max + 1,
    }),
  );
  const receipts = bounded(
    await tx.stockMovement.findMany({
      where: {
        ...(!needed("purchases", "suppliers") ? { id: { in: [] } } : {}),
        kind: { in: ["PURCHASE_RECEIVING", "RECEIPT_REVERSAL"] },
        OR: [
          { createdAt: { gte: r.start } },
          {
            receiptLine: {
              receipt: { purchaseOrderId: { in: purchases.map((p) => p.id) } },
            },
          },
        ],
        createdAt: { lt: r.cutoff },
        ...(q.supplierId
          ? {
              receiptLine: {
                receipt: { purchaseOrder: { supplierId: q.supplierId } },
              },
            }
          : {}),
        ...(q.variantId ? { variantId: q.variantId } : {}),
        ...(q.productId ? { variant: { productId: q.productId } } : {}),
      },
      select: {
        id: true,
        kind: true,
        availableDelta: true,
        createdAt: true,
        variantId: true,
        receiptLine: {
          select: {
            receipt: {
              select: {
                number: true,
                purchaseOrderId: true,
                purchaseOrder: {
                  select: { supplierId: true, supplierSnapshot: true },
                },
              },
            },
            purchaseLine: {
              select: {
                quantity: true,
                totalPaise: true,
                productName: true,
                variantName: true,
                packSize: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: max + 1,
    }),
  );
  const dispatches = bounded(
    await tx.dispatch.findMany({
      where: {
        ...(!needed("deliveries", "profitability") ? { id: { in: [] } } : {}),
        order: where,
        createdAt: { lt: r.cutoff },
        OR: [
          { confirmedAt: { gte: r.start, lt: r.cutoff } },
          { confirmedAt: null, createdAt: { gte: r.start, lt: r.cutoff } },
          {
            events: {
              some: {
                occurredAt: { gte: r.start, lt: r.cutoff },
                createdAt: { lte: new Date(r.knowledgeAsOf) },
              },
            },
          },
        ],
        ...(q.deliveryMethod ? { method: q.deliveryMethod } : {}),
        ...(q.courier
          ? { courierName: { contains: q.courier, mode: "insensitive" } }
          : {}),
      },
      select: {
        id: true,
        number: true,
        orderId: true,
        method: true,
        courierName: true,
        status: true,
        confirmedAt: true,
        createdAt: true,
        deliveryStatus: true,
        events: {
          where: {
            occurredAt: { lt: r.cutoff },
            createdAt: { lte: new Date(r.knowledgeAsOf) },
          },
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { status: true, occurredAt: true },
        },
        order: {
          select: {
            number: true,
            category: true,
            customerSnapshot: true,
            customerId: true,
            taxMode: true,
            cancelledAt: true,
          },
        },
        lines: {
          select: {
            quantity: true,
            orderLine: {
              select: {
                variantId: true,
                productName: true,
                variantName: true,
                packSize: true,
                linePricePaise: true,
                taxPaise: true,
                variant: { select: { productId: true } },
              },
            },
            allocations: {
              select: {
                quantity: true,
                ...(financial
                  ? { cost: { select: { amountPaise: true, source: true } } }
                  : {}),
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: max + 1,
    }),
  );
  const variants = bounded(
    await tx.productVariant.findMany({
      where: {
        ...(!needed("inventory", "products") ? { id: { in: [] } } : {}),
        ...(kind === "inventory" && q.q
          ? {
              OR: [
                { name: { contains: q.q, mode: "insensitive" as const } },
                {
                  product: {
                    name: { contains: q.q, mode: "insensitive" as const },
                  },
                },
              ],
            }
          : {}),
        createdAt: { lt: r.cutoff },
        ...(q.variantId ? { id: q.variantId } : {}),
        ...(q.productId ? { productId: q.productId } : {}),
      },
      select: {
        id: true,
        name: true,
        packSize: true,
        productId: true,
        product: { select: { name: true, slug: true } },
        stockSetting: { select: { minimumQuantity: true } },
      },
      orderBy: { id: "asc" },
      take: max + 1,
    }),
  );
  const movements = await tx.stockMovement.groupBy({
    by: ["variantId", "lotId"],
    where: {
      createdAt: { lt: r.cutoff },
      variantId: { in: variants.map((v) => v.id) },
    },
    _sum: { availableDelta: true, damagedDelta: true },
  });
  const reservations = await tx.reservationEvent.groupBy({
    by: ["variantId"],
    where: {
      createdAt: { lt: r.cutoff },
      variantId: { in: variants.map((v) => v.id) },
    },
    _sum: { quantityDelta: true },
  });
  const lots = financial
    ? bounded(
        await tx.stockLot.findMany({
          where: { id: { in: movements.map((m) => m.lotId) } },
          select: {
            id: true,
            cost: { select: { numeratorPaise: true, denominatorUnits: true } },
          },
          take: max + 1,
        }),
      )
    : [];
  const recentMovements = bounded(
    await tx.stockMovement.findMany({
      where: {
        createdAt: { gte: r.start, lt: r.cutoff },
        variantId: { in: variants.map((v) => v.id) },
      },
      select: {
        id: true,
        variantId: true,
        kind: true,
        availableDelta: true,
        damagedDelta: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: max + 1,
    }),
  );
  const expenses = bounded(
    await tx.businessExpense.findMany({
      where: {
        ...(!needed("expenses", "profitability") ? { id: { in: [] } } : {}),
        createdAt: { lte: new Date(r.knowledgeAsOf) },
        AND: [
          {
            revisions: {
              some: {
                expenseDate: { gte: new Date(r.from), lte: new Date(r.to) },
              },
            },
          },
          ...(expenseSearch
            ? [
                {
                  revisions: {
                    some: {
                      OR: [
                        {
                          title: {
                            contains: expenseSearch,
                            mode: "insensitive" as const,
                          },
                        },
                        {
                          reference: {
                            contains: expenseSearch,
                            mode: "insensitive" as const,
                          },
                        },
                        {
                          description: {
                            contains: expenseSearch,
                            mode: "insensitive" as const,
                          },
                        },
                      ],
                    },
                  },
                },
              ]
            : []),
        ],
        ...(q.category
          ? { revisions: { some: { category: q.category } } }
          : {}),
      },
      select: {
        id: true,
        revisions: {
          where: { createdAt: { lte: new Date(r.knowledgeAsOf) } },
          orderBy: { version: "desc" },
          take: 1,
          select: {
            version: true,
            title: true,
            category: true,
            amountPaise: true,
            expenseDate: true,
            paymentMethod: true,
            reference: true,
            description: true,
            status: true,
          },
        },
      },
      take: max + 1,
    }),
  );
  const customers = bounded(
    await tx.customer.findMany({
      where: {
        ...(!["customers", "dealers"].includes(kind) ? { id: { in: [] } } : {}),
        ...(q.q
          ? {
              OR: [
                {
                  user: {
                    name: { contains: q.q, mode: "insensitive" as const },
                  },
                },
                {
                  dealer: {
                    businessName: {
                      contains: q.q,
                      mode: "insensitive" as const,
                    },
                  },
                },
                { id: { in: orders.map((o) => o.customerId) } },
              ],
            }
          : {}),
        createdAt: { lt: r.cutoff },
        ...(q.customerId ? { id: q.customerId } : {}),
        ...(q.dealerId ? { dealer: { id: q.dealerId } } : {}),
      },
      select: {
        id: true,
        createdAt: true,
        user: { select: { name: true, active: true, role: true } },
        dealer: {
          select: {
            id: true,
            businessName: true,
            status: true,
            createdAt: true,
          },
        },
      },
      take: max + 1,
    }),
  );
  const suppliers = bounded(
    await tx.supplier.findMany({
      where: {
        ...(kind !== "suppliers" ? { id: { in: [] } } : {}),
        ...(q.q
          ? {
              OR: [
                { name: { contains: q.q, mode: "insensitive" as const } },
                { id: { in: purchases.map((p) => p.supplierId) } },
              ],
            }
          : {}),
        createdAt: { lt: r.cutoff },
        ...(q.supplierId ? { id: q.supplierId } : {}),
      },
      select: {
        id: true,
        name: true,
        status: true,
        variants: {
          select: { variant: { select: { name: true, packSize: true } } },
        },
      },
      take: max + 1,
    }),
  );
  let readyCount = 0;
  if (
    needed("deliveries") &&
    (!q.status || q.status === "READY_FOR_DISPATCH")
  ) {
    const candidates = orders.filter((o) => o.status === "READY_FOR_DISPATCH");
    if (candidates.length > 1000)
      throw new AppError(
        422,
        "REPORT_LIMIT",
        "More than 1,000 ready-order eligibility checks match. Narrow the creation-date or customer filters.",
      );
    for (const o of candidates) {
      if (q.deliveryMethod || q.courier) {
        const draft = await tx.dispatch.findUnique({
          where: { orderId: o.id },
          select: { method: true, courierName: true },
        });
        if (
          !draft ||
          (q.deliveryMethod && draft.method !== q.deliveryMethod) ||
          (q.courier &&
            !draft.courierName.toLowerCase().includes(q.courier.toLowerCase()))
        )
          continue;
      }
      if (
        (await dispatchEligibility(tx, await loadSalesOrder(tx, o.id))).eligible
      )
        readyCount++;
    }
  }
  return {
    readyCount,
    orders,
    payments,
    submissions,
    purchases,
    receipts,
    dispatches,
    variants,
    movements,
    reservations,
    lots,
    recentMovements,
    expenses,
    customers,
    suppliers,
  };
}
type Sources = Awaited<ReturnType<typeof sources>>;
function build(
  kind: (typeof reportKinds)[number],
  s: Sources,
  q: Query,
  r: Range,
  financial: boolean,
): Report {
  const warnings: string[] = [];
  const details: { title: string; rows: Row[] }[] = [];
  const rows: Row[] = [];
  const summary: Metric[] = [];
  const charts: Chart[] = [];
  const cohort = s.orders.filter((o) => inPeriod(o.createdAt, r));
  const successful = cohort.filter((o) => !cancelledAt(o, r));
  const expenseRows = s.expenses
    .flatMap((e) => (e.revisions[0] ? [{ ...e.revisions[0], id: e.id }] : []))
    .filter(
      (e) =>
        e.expenseDate.toISOString().slice(0, 10) >= r.from &&
        e.expenseDate.toISOString().slice(0, 10) <= r.to &&
        (!q.category || e.category === q.category) &&
        (!q.method || e.paymentMethod === q.method) &&
        (kind !== "expenses" ||
          !q.q ||
          `${e.title} ${e.reference} ${e.description}`
            .toLowerCase()
            .includes(q.q.toLowerCase())) &&
        (!q.status || e.status === q.status),
    );
  const expenseTotal = sum(
    expenseRows.filter((e) => e.status === "ACTIVE").map((e) => e.amountPaise),
  );
  const dispatched = s.dispatches.filter(
    (d) =>
      d.confirmedAt && inPeriod(d.confirmedAt, r) && !cancelledAt(d.order, r),
  );
  const filteredLines = (lines: Sources["orders"][number]["lines"]) =>
    lines.filter(
      (l) =>
        (!q.variantId || l.variantId === q.variantId) &&
        (!q.productId || l.variant.productId === q.productId),
    );
  const orderValue = (o: Sources["orders"][number]) =>
    q.productId || q.variantId
      ? sum(filteredLines(o.lines).map((l) => l.linePricePaise))
      : o.totalPaise;
  if (kind === "sales" || kind === "products") {
    const selected = cohort.filter((o) => !q.status || o.status === q.status);
    const included = selected.filter((o) => !cancelledAt(o, r));
    const value = sum(included.map(orderValue));
    summary.push(
      count(
        "orders",
        "Orders created",
        selected.length,
        "SalesOrder.createdAt in range; includes cancelled in count.",
      ),
      money(
        "orderValue",
        "Non-cancelled order value",
        value,
        "Historical order totals; separately recorded tax/delivery included unless variant filter selects merchandise lines.",
      ),
      count(
        "cancelled",
        "Cancelled orders",
        selected.filter((o) => cancelledAt(o, r)).length,
        "cancelledAt before the snapshot cutoff.",
      ),
      money(
        "average",
        "Average order value",
        included.length ? Math.round(value / included.length) : 0,
        "Non-cancelled order value divided by non-cancelled order count.",
      ),
      money(
        "retail",
        "Retail order value",
        sum(included.filter((o) => o.category === "RETAIL").map(orderValue)),
        "Historical RETAIL category snapshot.",
      ),
      money(
        "dealer",
        "Dealer order value",
        sum(
          included
            .filter((o) => o.category === "APPROVED_DEALER")
            .map(orderValue),
        ),
        "Historical APPROVED_DEALER category snapshot.",
      ),
      money(
        "cohortCollected",
        "Verified net payments for these orders",
        sum(included.map((o) => net(o.payments, r))),
        "Receipt minus refund records through cutoff for the selected created-order cohort, separate from period collections.",
      ),
      money(
        "pending",
        "Pending payment for these orders",
        sum(
          included.map((o) => Math.max(0, o.totalPaise - net(o.payments, r))),
        ),
        "Outstanding order amount after verified net payments; screenshots never reduce it.",
      ),
    );
    charts.push(
      {
        title: "Daily order value",
        unit: "INR",
        data: trend(
          included.map((o) => ({ date: o.createdAt, value: orderValue(o) })),
          r,
          "daily",
        ),
      },
      {
        title: "Weekly order value",
        unit: "INR",
        data: trend(
          included.map((o) => ({ date: o.createdAt, value: orderValue(o) })),
          r,
          "weekly",
        ),
      },
      {
        title: "Monthly order value",
        unit: "INR",
        data: trend(
          included.map((o) => ({ date: o.createdAt, value: orderValue(o) })),
          r,
          "monthly",
        ),
      },
      {
        title: "Retail versus dealer",
        unit: "INR",
        data: [
          {
            label: "Retail",
            value: sum(
              included.filter((o) => o.category === "RETAIL").map(orderValue),
            ),
          },
          {
            label: "Dealer",
            value: sum(
              included
                .filter((o) => o.category === "APPROVED_DEALER")
                .map(orderValue),
            ),
          },
        ],
      },
      {
        title: "Current order statuses",
        unit: "count",
        data: distribution(selected.map((o) => o.status)),
      },
      {
        title: "Current payment statuses",
        unit: "count",
        data: distribution(selected.map((o) => o.paymentStatus)),
      },
    );
    if (kind === "sales")
      for (const o of selected)
        rows.push({
          "Sales order": o.number,
          Customer: textName(o.customerSnapshot),
          "Customer ID": o.customerId,
          Category: o.category,
          Created: o.createdAt.toISOString(),
          "Current status": o.status,
          "Current payment status": o.paymentStatus,
          "Cancelled at cutoff": cancelledAt(o, r),
          "Order value INR": rupees(orderValue(o)),
          "Verified net INR": rupees(net(o.payments, r)),
          "Pending INR": rupees(
            cancelledAt(o, r)
              ? 0
              : Math.max(0, o.totalPaise - net(o.payments, r)),
          ),
        });
    else {
      const groups = new Map<
        string,
        {
          name: string;
          product: string;
          productId: string;
          size: string;
          quantity: number;
          value: number[];
          orders: Set<string>;
        }
      >();
      for (const o of included)
        for (const l of filteredLines(o.lines)) {
          const g = groups.get(l.variantId) ?? {
            name: l.variantName,
            product: l.productName,
            productId: l.variant.productId,
            size: l.packSize,
            quantity: 0,
            value: [],
            orders: new Set<string>(),
          };
          g.quantity += l.quantity;
          g.value.push(l.linePricePaise);
          g.orders.add(o.id);
          groups.set(l.variantId, g);
        }
      // Actual QWIK variants are included even when there are no sales; zeros are calculated empty aggregates, not demo rows.
      for (const v of s.variants.filter(
        (v) => v.product.slug === "fixup-qwik-instant-adhesive",
      ))
        if (!groups.has(v.id))
          groups.set(v.id, {
            name: v.name,
            product: v.product.name,
            productId: v.productId,
            size: v.packSize,
            quantity: 0,
            value: [],
            orders: new Set<string>(),
          });
      for (const [id, g] of [...groups].sort(
        ([, a], [, b]) => sum(b.value) - sum(a.value),
      ))
        rows.push({
          Product: g.product,
          "Product ID": g.productId,
          Variant: g.name,
          "Variant ID": id,
          "Pack size": g.size,
          "Quantity packs": g.quantity,
          "Order value INR": rupees(sum(g.value)),
          Orders: g.orders.size,
          "Average unit price INR": rupees(
            g.quantity ? Math.round(sum(g.value) / g.quantity) : 0,
          ),
        });
      const productGroups = new Map<string, number[]>();
      for (const g of groups.values())
        productGroups.set(g.product, [
          ...(productGroups.get(g.product) ?? []),
          sum(g.value),
        ]);
      charts.push(
        {
          title: "Product merchandise value",
          unit: "INR",
          data: [...productGroups]
            .map(([label, v]) => ({ label, value: sum(v) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 12),
        },
        {
          title: "Variant pack quantities (different sizes)",
          unit: "packs",
          data: [...groups.values()]
            .map((g) => ({
              label: `${g.product} ${g.size}`,
              value: g.quantity,
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 12),
        },
      );
    }
    warnings.push(
      "Order value is not received money or dispatched revenue. Status distributions show current administrative statuses; use event-based reports for historical activity.",
    );
  }
  if (kind === "payments") {
    const receipts = s.payments.filter((p) => p.kind === "RECEIPT"),
      refunds = s.payments.filter((p) => p.kind === "REFUND");
    const active = successful;
    summary.push(
      money(
        "receipts",
        "Verified receipts",
        sum(receipts.map((p) => p.amountPaise)),
        "PaymentRecord RECEIPT by verified transaction timestamp.",
      ),
      money(
        "refunds",
        "Recorded external refunds",
        sum(refunds.map((p) => p.amountPaise)),
        "Immutable REFUND records; no transfer initiated by the website.",
      ),
      money(
        "netCollections",
        "Net verified collections",
        sum(
          s.payments.map((p) =>
            p.kind === "REFUND" ? -p.amountPaise : p.amountPaise,
          ),
        ),
        "Verified receipts less recorded refunds in this period; includes cancelled-order receipts as real money movements.",
      ),
      money(
        "pending",
        "Pending for created-order cohort",
        sum(active.map((o) => Math.max(0, o.totalPaise - net(o.payments, r)))),
        "Non-cancelled orders created in range, outstanding at cutoff.",
      ),
      count(
        "underReview",
        "Submissions awaiting review",
        s.submissions.filter((p) =>
          ["SUBMITTED", "UNDER_REVIEW"].includes(p.status),
        ).length,
        "Submission creation date in range; current review status; not received money.",
      ),
      count(
        "rejected",
        "Rejected submissions",
        s.submissions.filter((p) =>
          ["REJECTED", "RESUBMISSION_REQUIRED"].includes(p.status),
        ).length,
        "Current proof disposition, not collections.",
      ),
      count(
        "partial",
        "Partially paid orders",
        active.filter(
          (o) => net(o.payments, r) > 0 && net(o.payments, r) < o.totalPaise,
        ).length,
        "Verified net payments between zero and order total.",
      ),
      count(
        "paid",
        "Fully covered orders",
        active.filter((o) => net(o.payments, r) >= o.totalPaise).length,
        "Created-order cohort with fully covered verified balance, not a dispatch count.",
      ),
    );
    for (const p of s.payments)
      rows.push({
        "Payment ID": p.id,
        "Sales order": p.order.number,
        "Customer ID": p.order.customerId,
        Customer: textName(p.order.customerSnapshot),
        Category: p.order.category,
        "Verified date": p.createdAt.toISOString(),
        Kind: p.kind,
        Method: p.method,
        "Amount INR": rupees(p.amountPaise),
        "Net amount INR": rupees(
          p.kind === "REFUND" ? -p.amountPaise : p.amountPaise,
        ),
      });
    charts.push(
      {
        title: "Daily verified collections",
        unit: "INR",
        data: trend(
          s.payments.map((p) => ({
            date: p.createdAt,
            value: p.kind === "REFUND" ? -p.amountPaise : p.amountPaise,
          })),
          r,
          "daily",
        ),
      },
      {
        title: "Monthly verified collections",
        unit: "INR",
        data: trend(
          s.payments.map((p) => ({
            date: p.createdAt,
            value: p.kind === "REFUND" ? -p.amountPaise : p.amountPaise,
          })),
          r,
          "monthly",
        ),
      },
      {
        title: "Verified receipt methods",
        unit: "INR",
        data: ["UPI", "BANK"].map((method) => ({
          label: method,
          value: sum(
            receipts
              .filter((p) => p.method === method)
              .map((p) => p.amountPaise),
          ),
        })),
      },
    );
    warnings.push(
      "Current payment-status filter selects related orders; proof review-status filter selects proof workload only. Verified cashflow rows remain separate. Private proofs, bank instructions and bank references are never exported.",
    );
  }
  if (kind === "purchases" || kind === "suppliers") {
    const matchingLines = (p: Sources["purchases"][number]) =>
      p.lines.filter(
        (l) =>
          (!q.variantId || l.variantId === q.variantId) &&
          (!q.productId || l.variant.productId === q.productId),
      );
    const purchaseValue = (p: Sources["purchases"][number]) =>
      q.variantId || q.productId
        ? sum(matchingLines(p).map((l) => l.totalPaise))
        : p.totalPaise;
    const purchases = s.purchases.filter(
      (p) => inPeriod(p.createdAt, r) && (!q.status || p.status === q.status),
    );
    const committed = purchases.filter((p) =>
      ["SUBMITTED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED"].includes(p.status),
    );
    const received = s.receipts.filter((m) => inPeriod(m.createdAt, r));
    const receiptValue = (m: Sources["receipts"][number]) =>
      m.receiptLine
        ? safeNumber(
            roundedRatio(
              BigInt(m.receiptLine.purchaseLine.totalPaise),
              Math.abs(m.availableDelta),
              m.receiptLine.purchaseLine.quantity,
            ),
          ) * (m.availableDelta < 0 ? -1 : 1)
        : 0;
    const historicalReceived = new Map<string, number>();
    for (const m of s.receipts)
      if (m.receiptLine)
        historicalReceived.set(
          m.receiptLine.receipt.purchaseOrderId,
          (historicalReceived.get(m.receiptLine.receipt.purchaseOrderId) ?? 0) +
            m.availableDelta,
        );
    summary.push(
      money(
        "poValue",
        "All PO value",
        sum(purchases.map(purchaseValue)),
        "PO creation cohort, all statuses; not completed purchases or inventory.",
      ),
      money(
        "confirmedValue",
        "Committed PO value",
        sum(committed.map(purchaseValue)),
        "Submitted/partial/full POs; draft/cancelled excluded.",
      ),
      money(
        "receivedValue",
        "Net received purchase value",
        sum(received.map(receiptValue)),
        "Actual receiving less receipt reversals by stock posting date, proportional original tax-inclusive purchase line total.",
      ),
      metric(
        "outstanding",
        "Outstanding committed quantity",
        sum(
          committed.map((p) =>
            Math.max(
              0,
              sum(matchingLines(p).map((l) => l.quantity)) -
                (historicalReceived.get(p.id) ?? 0),
            ),
          ),
        ),
        "packs",
        "Committed created-order cohort less actual net receiving through cutoff; different pack sizes aggregated as pack units only.",
      ),
    );
    charts.push(
      {
        title: "Purchase commitments by month",
        unit: "INR",
        data: trend(
          committed.map((p) => ({
            date: p.createdAt,
            value: purchaseValue(p),
          })),
          r,
          "monthly",
        ),
      },
      {
        title: "Received purchase value",
        unit: "INR",
        data: trend(
          received.map((m) => ({ date: m.createdAt, value: receiptValue(m) })),
          r,
          q.period,
        ),
      },
      {
        title: "PO current states",
        unit: "count",
        data: distribution(purchases.map((p) => p.status)),
      },
    );
    if (kind === "purchases")
      for (const p of purchases)
        for (const l of matchingLines(p))
          rows.push({
            "Purchase order": p.number,
            "Supplier ID": p.supplierId,
            Supplier: textName(p.supplierSnapshot),
            Created: p.createdAt.toISOString(),
            Status: p.status,
            Product: l.productName,
            Variant: l.variantName,
            "Pack size": l.packSize,
            "Ordered packs": l.quantity,
            "Current received packs": l.receivedQuantity,
            "Original line value INR": rupees(l.totalPaise),
          });
    else
      for (const supplier of s.suppliers) {
        const pos = purchases.filter((p) => p.supplierId === supplier.id);
        const ms = received.filter(
          (m) =>
            m.receiptLine?.receipt.purchaseOrder.supplierId === supplier.id,
        );
        rows.push({
          Supplier: supplier.name,
          "Supplier ID": supplier.id,
          "Current status": supplier.status,
          "PO count": pos.length,
          "Committed PO value INR": rupees(
            sum(
              pos
                .filter((p) =>
                  [
                    "SUBMITTED",
                    "PARTIALLY_RECEIVED",
                    "FULLY_RECEIVED",
                  ].includes(p.status),
                )
                .map(purchaseValue),
            ),
          ),
          "Net received packs": sum(ms.map((m) => m.availableDelta)),
          "Received value INR": rupees(sum(ms.map(receiptValue))),
          "Last PO date": pos.length
            ? pos
                .map((p) => p.createdAt.toISOString())
                .sort()
                .at(-1)!
            : null,
          "Products supplied": supplier.variants
            .map((v) => `${v.variant.name} (${v.variant.packSize})`)
            .join("; "),
        });
      }
    const receiptRows: Row[] = received.map((m) => ({
      Movement: m.id,
      Receipt: m.receiptLine?.receipt.number ?? "",
      "Posting date": m.createdAt.toISOString(),
      Kind: m.kind,
      "Supplier ID": m.receiptLine?.receipt.purchaseOrder.supplierId ?? "",
      Product: m.receiptLine?.purchaseLine.productName ?? "",
      Variant: m.receiptLine?.purchaseLine.variantName ?? "",
      "Pack size": m.receiptLine?.purchaseLine.packSize ?? "",
      "Received packs": m.availableDelta,
      "Received value INR": rupees(receiptValue(m)),
    }));
    details.push({
      title: "Actual receiving and reversals",
      rows: receiptRows,
    });
    if (q.view === "receipts") {
      rows.splice(0, rows.length, ...receiptRows);
    }
    warnings.push(
      "Purchase values are not supplier payments or payable balances. Pack quantity totals combine unit packs of different sizes, not adhesive weight. PO states and line received counters are current; net received value uses immutable posting events.",
    );
  }
  if (kind === "inventory") {
    let missing = 0;
    const known: number[] = [];
    for (const v of s.variants) {
      const moves = s.movements.filter((m) => m.variantId === v.id);
      const onHand = sum(moves.map((m) => m._sum.availableDelta ?? 0)),
        damaged = sum(moves.map((m) => m._sum.damagedDelta ?? 0)),
        reserved =
          s.reservations.find((e) => e.variantId === v.id)?._sum
            .quantityDelta ?? 0;
      let unknown = 0;
      const values: number[] = [];
      if (financial)
        for (const m of moves) {
          const qty = m._sum.availableDelta ?? 0;
          if (qty <= 0) continue;
          const cost = s.lots.find((l) => l.id === m.lotId)?.cost;
          if (!cost) unknown += qty;
          else
            values.push(
              safeNumber(
                roundedRatio(cost.numeratorPaise, qty, cost.denominatorUnits),
              ),
            );
        }
      missing += unknown;
      known.push(sum(values));
      rows.push({
        Product: v.product.name,
        "Product ID": v.productId,
        Variant: v.name,
        "Variant ID": v.id,
        "Pack size": v.packSize,
        "On-hand packs": onHand,
        "Reserved packs": reserved,
        "Available packs": onHand - reserved,
        "Damaged packs": damaged,
        "Current minimum packs": v.stockSetting?.minimumQuantity ?? null,
        "Low stock":
          v.stockSetting?.minimumQuantity !== null &&
          v.stockSetting?.minimumQuantity !== undefined
            ? onHand - reserved <= v.stockSetting.minimumQuantity
            : false,
        "Out of stock": onHand - reserved <= 0,
        ...(financial
          ? {
              "Known inventory value INR": rupees(sum(values)),
              "Missing-cost packs": unknown,
              "Complete valuation INR": unknown ? null : rupees(sum(values)),
            }
          : {}),
      });
    }
    summary.push(
      metric(
        "onHand",
        "Usable on-hand packs",
        sum(rows.map((x) => Number(x["On-hand packs"]))),
        "packs",
        "StockMovement.availableDelta through selected cutoff.",
      ),
      metric(
        "reserved",
        "Reserved packs",
        sum(rows.map((x) => Number(x["Reserved packs"]))),
        "packs",
        "ReservationEvent.quantityDelta through cutoff; active reservation liability.",
      ),
      metric(
        "available",
        "Available packs",
        sum(rows.map((x) => Number(x["Available packs"]))),
        "packs",
        "Usable on-hand less reserved.",
      ),
      metric(
        "damaged",
        "Damaged packs",
        sum(rows.map((x) => Number(x["Damaged packs"]))),
        "packs",
        "StockMovement.damagedDelta through cutoff; separate from usable stock.",
      ),
      count(
        "lowStock",
        "Low-stock variants",
        rows.filter((x) => x["Low stock"]).length,
        "Available quantity <= current configured minimum; unset threshold is not assumed zero.",
      ),
      count(
        "outStock",
        "Out-of-stock variants",
        rows.filter((x) => x["Out of stock"]).length,
        "Available quantity <= 0.",
      ),
    );
    if (financial) {
      summary.push(
        money(
          "inventoryValue",
          "Complete usable inventory value",
          missing ? null : sum(known),
          "Approved recorded lot cost, net of line discount and excluding separately recorded tax; reserved usable stock remains owned inventory.",
        ),
        money(
          "knownValue",
          "Known-cost inventory portion",
          sum(known),
          "Supported receipt-linked usable on-hand lots only; damaged stock excluded.",
        ),
        metric(
          "missingCost",
          "Missing-cost packs",
          missing,
          "packs",
          "Opening/correction stock without a recorded receipt cost is not assigned an invented cost.",
        ),
      );
      if (missing)
        warnings.push(
          "Inventory valuation is incomplete because some on-hand lots have no recorded purchase cost.",
        );
    }
    charts.push({
      title: "Available packs by variant",
      unit: "packs",
      data: rows
        .filter(
          (x) =>
            Number(x["On-hand packs"]) || String(x.Product).includes("QWIK"),
        )
        .slice(0, 20)
        .map((x) => ({
          label: `${x.Product} ${x["Pack size"]}`,
          value: Number(x["Available packs"]),
        })),
    });
    const movementRows: Row[] = s.recentMovements.map((m) => ({
      "Movement ID": m.id,
      "Variant ID": m.variantId,
      Variant: s.variants.find((v) => v.id === m.variantId)?.name ?? "",
      "Posting date": m.createdAt.toISOString(),
      Kind: m.kind,
      "Usable quantity delta": m.availableDelta,
      "Damaged quantity delta": m.damagedDelta,
    }));
    details.push({ title: "Movements during selection", rows: movementRows });
    if (financial) {
      const groups = new Map<string, number[]>();
      for (const row of rows)
        groups.set(String(row.Product), [
          ...(groups.get(String(row.Product)) ?? []),
          Math.round(Number(row["Known inventory value INR"]) * 100),
        ]);
      charts.push({
        title: "Known inventory value by product",
        unit: "INR",
        data: [...groups].map(([label, v]) => ({ label, value: sum(v) })),
      });
    }
    if (q.view === "movements") rows.splice(0, rows.length, ...movementRows);
    warnings.push(
      "Inventory is an as-of range-end snapshot, not just movements during the range. Total packs combine different sizes and are not total adhesive weight. Current minimum-stock configuration is labelled separately. Recent movement history is available in the existing stock-ledger report.",
    );
  }
  if (kind === "expenses") {
    summary.push(
      money(
        "expenses",
        "Active business expenses",
        expenseTotal,
        "Latest immutable revision known at knowledgeAsOf, active status, actual expense calendar date in selected range.",
      ),
      count(
        "cancelledExpenses",
        "Cancelled expense records",
        expenseRows.filter((e) => e.status === "CANCELLED").length,
        "Cancelled records remain in history and contribute no active expense amount.",
      ),
    );
    for (const e of expenseRows)
      rows.push({
        "Expense ID": e.id,
        Title: e.title,
        Category: e.category,
        "Expense date": e.expenseDate.toISOString().slice(0, 10),
        "Amount INR": rupees(e.amountPaise),
        Method: e.paymentMethod,
        Reference: e.reference,
        Status: e.status,
        Revision: e.version,
        Description: e.description,
      });
    charts.push({
      title: "Expenses by category",
      unit: "INR",
      data: [...new Set(expenseRows.map((e) => e.category))]
        .sort()
        .map((category) => ({
          label: category,
          value: sum(
            expenseRows
              .filter((e) => e.category === category && e.status === "ACTIVE")
              .map((e) => e.amountPaise),
          ),
        })),
    });
  }
  if (kind === "profitability") {
    const subset = !!(
      q.q ||
      q.customerId ||
      q.dealerId ||
      q.productId ||
      q.variantId ||
      q.customerCategory ||
      q.deliveryMethod ||
      q.courier
    );
    let missing = 0;
    const returned = s.dispatches.filter(
      (d) =>
        d.events[0]?.status === "RETURNED" &&
        ((d.confirmedAt && inPeriod(d.confirmedAt, r)) ||
          inPeriod(d.events[0].occurredAt, r)),
    ).length;
    const revenue: number[] = [],
      costs: number[] = [];
    const profits: { date: Date; value: number }[] = [];
    for (const d of dispatched) {
      const state = d.events[0]?.status ?? "DISPATCHED";
      for (const l of d.lines.filter(
        (l) =>
          (!q.variantId || l.orderLine.variantId === q.variantId) &&
          (!q.productId || l.orderLine.variant.productId === q.productId),
      )) {
        const rev = merchandiseRevenue(l.orderLine, d.order.taxMode);
        let unknown = 0;
        const c: number[] = [];
        for (const a of l.allocations) {
          const cost =
            "cost" in a
              ? (a.cost as {
                  amountPaise: bigint | null;
                  source: string;
                } | null)
              : null;
          if (!cost || cost.amountPaise === null) unknown += a.quantity;
          else c.push(safeNumber(cost.amountPaise));
        }
        const cost = sum(c);
        missing += unknown;
        revenue.push(rev);
        costs.push(cost);
        if (!unknown) profits.push({ date: d.confirmedAt!, value: rev - cost });
        rows.push({
          Dispatch: d.number,
          "Sales order": d.order.number,
          "Dispatch date": d.confirmedAt!.toISOString(),
          "Customer category": d.order.category,
          Product: l.orderLine.productName,
          Variant: l.orderLine.variantName,
          "Variant ID": l.orderLine.variantId,
          "Pack size": l.orderLine.packSize,
          "Dispatched packs": l.quantity,
          "Revenue INR": rupees(rev),
          "Known COGS INR": rupees(cost),
          "Missing-cost packs": unknown,
          "Estimated gross profit INR":
            unknown || state === "RETURNED" ? null : rupees(rev - cost),
          "Return review required": state === "RETURNED",
        });
      }
    }
    const incomplete = missing > 0 || returned > 0;
    const rev = sum(revenue),
      cogs = sum(costs);
    summary.push(
      money(
        "revenue",
        "Gross dispatched merchandise revenue",
        rev,
        "Original confirmed dispatch period, immutable order line value excluding separately identified tax/delivery; gross before returns adjustments.",
      ),
      money(
        "cogs",
        "Complete cost of goods sold",
        missing ? null : cogs,
        "Frozen actual lot-allocation cost snapshots; no selling-price fallback.",
      ),
      money(
        "knownCogs",
        "Known cost portion",
        cogs,
        "Only allocations with supported recorded cost snapshots.",
      ),
      money(
        "grossProfit",
        "Estimated gross profit",
        incomplete ? null : rev - cogs,
        "Dispatched merchandise revenue minus complete COGS; unavailable if missing cost or returned shipments need financial review.",
      ),
      money(
        "expenses",
        "Business expenses",
        expenseTotal,
        "Active audited expenses by actual expense date for the same selected range.",
      ),
      money(
        "operatingSurplus",
        "Estimated operating surplus",
        incomplete || subset ? null : rev - cogs - expenseTotal,
        "Business-wide management estimate: gross profit minus active business expenses, not statutory net profit. Unavailable for customer/product subsets because expenses have no invented allocation.",
      ),
      metric(
        "missingCost",
        "Missing-cost dispatched packs",
        missing,
        "packs",
        "No invented zero cost for unsupported stock.",
      ),
      count(
        "returnReview",
        "Returned shipments requiring review",
        returned,
        "Original dispatched revenue/cost is preserved; this phase does not invent return/refund accounting.",
      ),
    );
    charts.push({
      title: `${q.period} supported gross-profit portion`,
      unit: "INR",
      data: trend(profits, r, q.period),
    });
    if (subset)
      warnings.push(
        "Business expenses are not attributed to customers/products. Subset gross profit is shown, but an allocated operating surplus is unavailable.",
      );
    if (incomplete)
      warnings.push(
        "Profitability is incomplete. Known portions are shown; a complete gross-profit/operating-surplus estimate is unavailable until missing costs or return accounting are resolved.",
      );
  }
  if (kind === "deliveries") {
    const ds = s.dispatches.filter(
      (d) =>
        inPeriod(d.confirmedAt ?? d.createdAt, r) ||
        (d.events[0] && inPeriod(d.events[0].occurredAt, r)),
    );
    const matching = ds.filter(
      (d) => !q.status || (d.events[0]?.status ?? "PENDING") === q.status,
    );
    for (const d of matching) {
      const state =
        d.events[0]?.status ??
        (d.confirmedAt && d.confirmedAt < r.cutoff ? "DISPATCHED" : "PENDING");
      rows.push({
        Dispatch: d.number,
        "Sales order": d.order.number,
        Customer: textName(d.order.customerSnapshot),
        "Customer ID": d.order.customerId,
        Category: d.order.category,
        Method: d.method,
        Courier: d.courierName,
        Created: d.createdAt.toISOString(),
        Confirmed:
          d.confirmedAt && d.confirmedAt < r.cutoff
            ? d.confirmedAt.toISOString()
            : null,
        "Delivery status at cutoff": state,
        "Last delivery event": d.events[0]?.occurredAt.toISOString() ?? null,
      });
    }
    const statuses = [
      "DISPATCHED",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "DELIVERY_FAILED",
      "RETURNED",
    ];
    summary.push(
      count(
        "ready",
        "Ready orders in creation cohort",
        s.readyCount,
        "Current Phase 6 eligibility for orders created in the selected range: verified funds, account/dealer eligibility and matching active reservations are rechecked. This is a current queue metric, not reconstructed historical readiness.",
      ),
      count(
        "confirmed",
        "Dispatched orders",
        matching.filter((d) => d.confirmedAt && inPeriod(d.confirmedAt, r))
          .length,
        "Confirmation timestamp in range; one dispatch per SO.",
      ),
      ...statuses
        .slice(1)
        .map((state) =>
          count(
            state,
            state.replaceAll("_", " "),
            rows.filter((x) => x["Delivery status at cutoff"] === state).length,
            "Dispatch cohort and latest recorded delivery event through selected cutoff.",
          ),
        ),
      count(
        "local",
        "Local deliveries",
        matching.filter((d) => d.method === "LOCAL").length,
        "Draft/confirmed dispatch cohort using entered delivery method.",
      ),
      count(
        "courier",
        "Courier deliveries",
        matching.filter((d) => d.method === "COURIER").length,
        "Manual courier dispatch cohort.",
      ),
    );
    charts.push(
      {
        title: "Delivery statuses at cutoff",
        unit: "count",
        data: distribution(
          rows.map((x) => String(x["Delivery status at cutoff"])),
        ),
      },
      {
        title: "Delivery methods",
        unit: "count",
        data: distribution(matching.map((d) => d.method)),
      },
    );
  }
  if (kind === "customers" || kind === "dealers") {
    const people = s.customers.filter(
      (c) =>
        ["CUSTOMER", "DEALER"].includes(c.user.role) &&
        (kind !== "dealers" || !!c.dealer),
    );
    const approved = people.filter((c) => c.dealer?.status === "APPROVED");
    summary.push(
      count(
        "total",
        kind === "dealers" ? "Approved dealers" : "Registered customers",
        kind === "dealers" ? approved.length : people.length,
        "Registered by cutoff; dealer approval is current configuration, not inferred historical status.",
      ),
      count(
        "new",
        "New registrations",
        people.filter((c) =>
          inPeriod(kind === "dealers" ? c.dealer!.createdAt : c.createdAt, r),
        ).length,
        "Actual customer/dealer registration timestamp in range.",
      ),
      count(
        "active",
        kind === "dealers"
          ? "Active approved dealers"
          : "Active customer accounts",
        (kind === "dealers" ? approved : people).filter((c) => c.user.active)
          .length,
        "Current active account flag; not a login count.",
      ),
      count(
        "repeat",
        "Repeat ordering customers in period",
        people.filter(
          (c) => successful.filter((o) => o.customerId === c.id).length >= 2,
        ).length,
        "At least two non-cancelled created orders within selection.",
      ),
    );
    for (const c of people) {
      const orders = successful.filter(
        (o) =>
          o.customerId === c.id &&
          (kind !== "dealers" || o.category === "APPROVED_DEALER"),
      );
      rows.push({
        "Customer ID": c.id,
        Customer: c.user.name,
        "Dealer business": c.dealer?.businessName ?? "",
        "Current dealer status": c.dealer?.status ?? "NOT_APPLIED",
        "Current account active": c.user.active,
        Registered: (kind === "dealers"
          ? c.dealer!.createdAt
          : c.createdAt
        ).toISOString(),
        Orders: orders.length,
        "Order value INR": rupees(sum(orders.map(orderValue))),
        "Average orders per 30 days": Number(
          (
            (orders.length /
              Math.max(
                1,
                (Date.parse(r.to) - Date.parse(r.from)) / 86400000 + 1,
              )) *
            30
          ).toFixed(2),
        ),
        "Last order": orders.length
          ? orders
              .map((o) => o.createdAt.toISOString())
              .sort()
              .at(-1)!
          : null,
      });
    }
    rows.sort(
      (a, b) => Number(b["Order value INR"]) - Number(a["Order value INR"]),
    );
    charts.push({
      title:
        kind === "dealers"
          ? "Top dealers by order value"
          : "Top customers by order value",
      unit: "INR",
      data: rows.slice(0, 10).map((x) => ({
        label: String(kind === "dealers" ? x["Dealer business"] : x.Customer),
        value: Math.round(Number(x["Order value INR"]) * 100),
      })),
    });
    const historyRows: Row[] = successful
      .filter((o) => kind !== "dealers" || o.category === "APPROVED_DEALER")
      .map((o) => ({
        "Sales order": o.number,
        Customer: textName(o.customerSnapshot),
        "Customer ID": o.customerId,
        Category: o.category,
        Created: o.createdAt.toISOString(),
        "Order value INR": rupees(orderValue(o)),
      }));
    details.push({
      title: "Purchase history during selection",
      rows: historyRows,
    });
    if (q.view === "history") rows.splice(0, rows.length, ...historyRows);
    warnings.push(
      "Customer/dealer account and approval flags are current configuration. Order category and prices are historical snapshots. Purchase history is the existing authorized customer/order detail workflow, not a public analytics endpoint.",
    );
  }
  return {
    kind,
    range: {
      from: r.from,
      to: r.to,
      timezone: r.timezone,
      knowledgeAsOf: r.knowledgeAsOf,
    },
    summary,
    rows,
    charts,
    warnings,
    limit: max,
    methodology:
      kind === "profitability" || kind === "inventory"
        ? "Approved recorded-lot cost: original purchase line subtotal less discount, excluding separately recorded tax, divided by ordered quantity. Amounts use integer half-up paise rounding; dispatch costs are frozen. Missing costs are incomplete."
        : "Real database records only. Flow metrics use their documented event date; inventory is as-of cutoff. Current statuses/configuration are explicitly labelled. INR amounts are calculated server-side; no screenshots count as money.",
    details,
  };
}
async function context(tx: Tx, input: unknown) {
  const q = reportQuery.parse(input);
  const settings = await tx.businessSettings.findUnique({
    where: { id: "singleton" },
    select: { timezone: true },
  });
  const zone = settings?.timezone || "Asia/Kolkata";
  if (!validTimezone(zone))
    throw new AppError(
      409,
      "INVALID_TIMEZONE",
      "Confirm the configured business timezone.",
    );
  let r: Range;
  try {
    r = resolveRange(q, zone);
  } catch {
    throw new AppError(
      422,
      "INVALID_REPORT_DATES",
      "Choose a valid past/current date range up to 10 years and a non-future knowledge cutoff.",
    );
  }
  return { q, r };
}
export async function getReport(
  actor: Actor,
  kind: (typeof reportKinds)[number],
  input: unknown = {},
) {
  allowed(actor, "reports.read");
  if (kind === "profitability") allowed(actor, "reports.financial");
  if (kind === "expenses") allowed(actor, "expenses.manage");
  const financial = actor.permissions.includes("reports.financial");
  return getDb().$transaction(
    async (tx) => {
      const { q, r } = await context(tx, input);
      const s = await sources(tx, q, r, financial, kind);
      return build(kind, s, q, r, financial);
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}
export async function dashboard(actor: Actor, input: unknown = {}) {
  allowed(actor, "reports.read");
  const financial = actor.permissions.includes("reports.financial");
  return getDb().$transaction(
    async (tx) => {
      const { q, r } = await context(tx, input);
      const s = await sources(tx, q, r, financial, "dashboard");
      const reports = {
        sales: build("sales", s, q, r, financial),
        payments: build("payments", s, q, r, financial),
        purchases: build("purchases", s, q, r, financial),
        inventory: build("inventory", s, q, r, financial),
        deliveries: build("deliveries", s, q, r, financial),
        expenses: build("expenses", s, q, r, financial),
        ...(financial
          ? { profitability: build("profitability", s, q, r, financial) }
          : {}),
      };
      const pick = (report: Report, key: string) =>
        report.summary.find((m) => m.key === key)!;
      const selected = s.orders.filter(
        (o) => inPeriod(o.createdAt, r) && !cancelledAt(o, r),
      );
      const today = dayInZone(new Date(r.knowledgeAsOf), r.timezone);
      const cards = [
        money(
          "today",
          "Today's order value (within selection)",
          sum(
            selected
              .filter((o) => dayInZone(o.createdAt, r.timezone) === today)
              .map((o) => o.totalPaise),
          ),
          "Non-cancelled created-order value on business today intersected with selected range.",
        ),
        money(
          "month",
          "This month's order value (within selection)",
          sum(
            selected
              .filter(
                (o) =>
                  dayInZone(o.createdAt, r.timezone).slice(0, 7) ===
                  today.slice(0, 7),
              )
              .map((o) => o.totalPaise),
          ),
          "Current business-month created orders intersected with selected range.",
        ),
        pick(reports.sales, "orders"),
        pick(reports.payments, "pending"),
        pick(reports.payments, "receipts"),
        pick(reports.purchases, "confirmedValue"),
        ...(financial ? [pick(reports.inventory, "inventoryValue")] : []),
        pick(reports.inventory, "lowStock"),
        pick(reports.deliveries, "ready"),
        pick(reports.deliveries, "DELIVERED"),
        pick(reports.expenses, "expenses"),
        ...(reports.profitability
          ? [pick(reports.profitability, "grossProfit")]
          : []),
      ];
      return {
        range: reports.sales.range,
        cards,
        charts: [
          ...reports.sales.charts.filter(
            (c) => !["Weekly order value"].includes(c.title),
          ),
          ...reports.payments.charts.filter(
            (c) => c.title === "Daily verified collections",
          ),
        ],
        warnings: [
          ...new Set(Object.values(reports).flatMap((x) => x.warnings)),
        ],
        financialAccess: financial,
        inventorySummary: reports.inventory.summary.filter((m) =>
          ["onHand", "reserved", "available", "damaged"].includes(m.key),
        ),
        methodology:
          "Orders created, actual verified collections, dispatch and delivery are distinct. Every card includes its definition; all flow values intersect the selected business date range. Stock is an as-of range-end snapshot.",
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}
export function reportCsv(report: Report) {
  const rows = report.rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        key.endsWith(" INR") &&
        typeof value === "string" &&
        /^-?\d+\.\d{2}$/.test(value)
          ? Number(value)
          : value,
      ]),
    ),
  );
  if (!rows.length) return '"No matching records"\r\n';
  return csv(rows);
}
