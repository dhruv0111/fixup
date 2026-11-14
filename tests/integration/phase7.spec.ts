import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { db, registered, context } from "../fixtures/helpers";
import {
  staff,
  priceList,
  assign,
  submitDealer,
  decide,
} from "../fixtures/phase3";
import {
  knownCostScenario,
  report,
  amount,
  expense,
  expenseData,
  reports,
} from "../fixtures/phase7";
import {
  scenario,
  action as deliveryAction,
  confirmed,
} from "../fixtures/phase6";
import {
  upload,
  verify,
  png,
  orderAction,
  put,
  review,
  checkout,
  sales,
} from "../fixtures/phase5";
import {
  fixture,
  po,
  action as purchaseAction,
  receive,
  adjustment,
} from "../fixtures/phase4";
import { createHash } from "node:crypto";
let owner: Awaited<ReturnType<typeof staff>>;
test("database rejects expense changes without history and ghost financial revisions", async () => {
  const x = await expense(owner.api);
  const original = await db.expenseRevision.findFirstOrThrow({
    where: { expenseId: x.row.id, version: 0 },
  });
  await expect(
    db.businessExpense.update({
      where: { id: x.row.id },
      data: { amountPaise: 999999, version: { increment: 1 } },
    }),
  ).rejects.toThrow();
  const { id: oldId, createdAt, ...fields } = original;
  void oldId;
  void createdAt;
  await expect(
    db.expenseRevision.create({
      data: {
        ...fields,
        version: 99,
        requestId: randomUUID(),
        title: "Unrecorded ghost change",
        amountPaise: 999999,
      },
    }),
  ).rejects.toThrow();
  expect(
    (await db.businessExpense.findUniqueOrThrow({ where: { id: x.row.id } }))
      .amountPaise,
  ).toBe(2500);
  const r = await report(owner.api, "expenses", { q: x.data.data.title });
  expect(amount(r, "expenses")).toBe(2500);
});
test("ready dispatch KPI reuses current eligibility and excludes a suspended customer", async () => {
  const s = await knownCostScenario(owner.api, { dispatch: false });
  const q = { customerId: s.b.user.customer!.id };
  expect(amount(await report(owner.api, "deliveries", q), "ready")).toBe(1);
  await db.user.update({ where: { id: s.b.user.id }, data: { active: false } });
  expect(amount(await report(owner.api, "deliveries", q), "ready")).toBe(0);
  const purchases = await report(owner.api, "purchases", {
    supplierId: s.f.supplier.id,
    variantId: s.f.variants[0].id,
  });
  expect(amount(purchases, "confirmedValue")).toBe(59000);
  expect(purchases.rows).toHaveLength(1);
  await s.b.api.dispose();
});
test("negative estimated profit remains numeric and exports as a real negative amount", async () => {
  const s = await knownCostScenario(owner.api, {
    purchaseRate: 12000,
    discount: 0,
  });
  const p = await report(owner.api, "profitability", {
    productId: s.f.product.id,
  });
  expect(amount(p, "cogs")).toBe(24000);
  expect(amount(p, "grossProfit")).toBe(-4000);
  expect(amount(p, "operatingSurplus")).toBeNull();
  const csv = await owner.api.get(
    `${reports}/profitability?preset=month&productId=${s.f.product.id}&format=csv`,
  );
  expect(await csv.text()).toContain('"-40"');
  expect(await csv.text()).not.toContain("'-40");
  await s.b.api.dispose();
});
test.beforeAll(async () => {
  owner = await staff();
});
test.afterAll(async () => {
  await owner.api.dispose();
  await db.$disconnect();
});

test("a thousand recorded expenses aggregate and export without truncation or duplicate totals", async () => {
  const prefix = `QA bulk ${randomUUID()}`;
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const data = Array.from({ length: 1000 }, (_, i) => ({
    id: `qa-exp-${randomUUID()}`,
    requestId: randomUUID(),
    payloadDigest: createHash("sha256").update(`${prefix}:${i}`).digest("hex"),
    title: `${prefix} ${i}`,
    category: "OTHER",
    amountPaise: 101,
    expenseDate: new Date(today),
    paymentMethod: "CASH",
    reference: "QA large-dataset receipt",
    description: "Isolated report scalability fixture",
    createdById: owner.user.id,
  }));
  await db.$transaction(
    async (tx) => {
      await tx.businessExpense.createMany({ data });
      await tx.expenseRevision.createMany({
        data: data.map((e) => ({
          expenseId: e.id,
          version: 0,
          requestId: e.requestId,
          payloadDigest: e.payloadDigest,
          title: e.title,
          category: e.category,
          amountPaise: e.amountPaise,
          expenseDate: e.expenseDate,
          paymentMethod: e.paymentMethod,
          reference: e.reference,
          description: e.description,
          status: "ACTIVE",
          actorId: owner.user.id,
          reason: "QA bulk test recorded expense",
        })),
      });
    },
    { timeout: 20000 },
  );
  const r = await report(owner.api, "expenses", { q: prefix });
  expect(r.rows).toHaveLength(1000);
  expect(amount(r, "expenses")).toBe(101000);
  const exported = await owner.api.get(
    `${reports}/expenses?preset=month&q=${encodeURIComponent(prefix)}&format=csv`,
  );
  expect(exported.status()).toBe(200);
  expect((await exported.text()).trim().split("\r\n")).toHaveLength(1001);
});
test("documented fully discounted receipt cost is zero rather than missing", async () => {
  const s = await knownCostScenario(owner.api, { discount: 60000 });
  const p = await report(owner.api, "profitability", {
    productId: s.f.product.id,
  });
  expect(amount(p, "cogs")).toBe(0);
  expect(amount(p, "missingCost")).toBe(0);
  expect(amount(p, "grossProfit")).toBe(20000);
  await s.b.api.dispose();
});
test("retail/dealer performance uses original order categories and independent customer history", async () => {
  const s = await knownCostScenario(owner.api);
  const dealer = await submitDealer(s.b.api);
  expect((await decide(owner.api, dealer.id, "APPROVED")).status()).toBe(200);
  const o = await checkout(s.b, s.f.variants[0].id, 1);
  expect(o.row.category).toBe("APPROVED_DEALER");
  const q = { customerId: s.b.user.customer!.id };
  const sales = await report(owner.api, "sales", q);
  expect(amount(sales, "retail")).toBe(20000);
  expect(amount(sales, "dealer")).toBe(10000);
  const dealers = await report(owner.api, "dealers", { dealerId: dealer.id });
  expect(dealers.rows[0].Orders).toBe(1);
  expect(dealers.rows[0]["Order value INR"]).toBe("100.00");
  const history = await report(owner.api, "customers", {
    ...q,
    view: "history",
  });
  expect(history.rows).toHaveLength(2);
  await s.b.api.dispose();
});
test("cancelled-order verified receipts and actual recorded refunds are separate collection flows", async () => {
  const s = await knownCostScenario(owner.api, { dispatch: false });
  expect((await orderAction(owner.api, s.o.row.id, "CANCEL")).status()).toBe(
    200,
  );
  const r = await owner.api.post(`/api/v1/admin/sales/refunds/${s.o.row.id}`, {
    data: {
      requestId: randomUUID(),
      amountPaise: 20000,
      method: "UPI",
      bankReference: `QAREFUND${randomUUID()}`,
      checkedBankRecord: true,
      reason: "QA externally completed refund",
      internalNotes: "QA actual external bank refund checked",
    },
  });
  expect(r.status(), await r.text()).toBe(200);
  const p = await report(owner.api, "payments", {
    customerId: s.b.user.customer!.id,
  });
  expect(amount(p, "receipts")).toBe(20000);
  expect(amount(p, "refunds")).toBe(20000);
  expect(amount(p, "netCollections")).toBe(0);
  await s.b.api.dispose();
});

test("UTC database sessions keep trigger reservation events aligned with application timestamps", async () => {
  const clock = await db.$queryRaw<
    { zone: string; instant: Date }[]
  >`SELECT current_setting('TimeZone') AS zone, clock_timestamp() AS instant`;
  expect(clock[0].zone).toBe("UTC");
  expect(Math.abs(clock[0].instant.getTime() - Date.now())).toBeLessThan(5000);
  const s = await knownCostScenario(owner.api, { dispatch: false });
  const reservation = await db.stockReservation.findFirstOrThrow({
    where: { orderId: s.o.row.id },
    include: { events: true },
  });
  expect(
    Math.abs(
      reservation.createdAt.getTime() -
        reservation.events[0].createdAt.getTime(),
    ),
  ).toBeLessThan(5000);
  expect(
    amount(
      await report(owner.api, "inventory", { productId: s.f.product.id }),
      "reserved",
    ),
  ).toBe(2);
  await s.b.api.dispose();
});
test("received lot costs and dispatched COGS freeze original discounted purchase values", async () => {
  const s = await knownCostScenario(owner.api);
  const lots = await db.stockLot.findMany({
    where: { variantId: { in: s.f.variants.map((v) => v.id) } },
    include: { cost: true },
  });
  expect(lots).toHaveLength(4);
  for (const l of lots) {
    expect(l.cost?.numeratorPaise).toBe(50000n);
    expect(l.cost?.denominatorUnits).toBe(10);
  }
  const costs = await db.dispatchCost.findMany({
    where: { allocation: { line: { dispatchId: s.d.id } } },
  });
  expect(costs).toHaveLength(1);
  expect(costs[0].amountPaise).toBe(10000n);
  await expect(
    db.lotCost.update({
      where: { lotId: lots[0].id },
      data: { numeratorPaise: 1 },
    }),
  ).rejects.toThrow();
  await expect(
    db.dispatchCost.update({
      where: { allocationId: costs[0].allocationId },
      data: { amountPaise: 1 },
    }),
  ).rejects.toThrow();
  await s.b.api.dispose();
});
test("profit and inventory match known samples and never use current selling prices as cost", async () => {
  const s = await knownCostScenario(owner.api);
  const query = { productId: s.f.product.id };
  const profit = await report(owner.api, "profitability", query);
  expect(amount(profit, "revenue")).toBe(20000);
  expect(amount(profit, "cogs")).toBe(10000);
  expect(amount(profit, "grossProfit")).toBe(10000);
  const inventory = await report(owner.api, "inventory", query);
  expect(amount(inventory, "onHand")).toBe(38);
  expect(amount(inventory, "reserved")).toBe(0);
  expect(amount(inventory, "available")).toBe(38);
  expect(amount(inventory, "inventoryValue")).toBe(190000);
  const list = await priceList(
    owner.api,
    s.f.variants.map((v) => ({ variantId: v.id, amountPaise: 90000 })),
  );
  await assign(owner.api, "RETAIL", list.id);
  const later = await report(owner.api, "profitability", query);
  expect(amount(later, "revenue")).toBe(20000);
  expect(amount(later, "cogs")).toBe(10000);
  await s.b.api.dispose();
});
test("tax-inclusive dispatched revenue excludes recorded tax and delivery charges", async () => {
  const s = await knownCostScenario(owner.api, {
    taxMode: "INCLUSIVE",
    taxBps: 1800,
  });
  const p = await report(owner.api, "profitability", {
    productId: s.f.product.id,
  });
  const line = await db.salesOrderLine.findFirstOrThrow({
    where: { orderId: s.o.row.id },
  });
  expect(amount(p, "revenue")).toBe(line.linePricePaise - line.taxPaise);
  expect(amount(p, "revenue")).toBe(16949);
  expect(amount(p, "grossProfit")).toBe(6949);
  await s.b.api.dispose();
});
test("undispatched paid orders remain reserved inventory and are not completed profit", async () => {
  const s = await knownCostScenario(owner.api, { dispatch: false });
  const p = await report(owner.api, "profitability", {
    productId: s.f.product.id,
  });
  expect(amount(p, "revenue")).toBe(0);
  expect(amount(p, "cogs")).toBe(0);
  const inventory = await report(owner.api, "inventory", {
    productId: s.f.product.id,
  });
  expect(amount(inventory, "onHand")).toBe(40);
  expect(amount(inventory, "reserved")).toBe(2);
  expect(amount(inventory, "available")).toBe(38);
  expect(amount(inventory, "inventoryValue")).toBe(200000);
  await s.b.api.dispose();
});
test("opening stock without cost produces incomplete valuation and profit, not fabricated zero cost", async () => {
  const s = await scenario(owner.api);
  const d = await confirmed(owner.api, s.o.row.id);
  const p = await report(owner.api, "profitability", {
    productId: s.f.product.id,
  });
  expect(amount(p, "revenue")).toBe(20000);
  expect(amount(p, "cogs")).toBeNull();
  expect(amount(p, "grossProfit")).toBeNull();
  expect(amount(p, "missingCost")).toBe(2);
  const c = await db.dispatchCost.findFirstOrThrow({
    where: { allocation: { line: { dispatchId: d.id } } },
  });
  expect(c.source).toBe("MISSING");
  const inventory = await report(owner.api, "inventory", {
    productId: s.f.product.id,
  });
  expect(amount(inventory, "inventoryValue")).toBeNull();
  expect(amount(inventory, "missingCost")).toBe(78);
  await s.b.api.dispose();
});
test("returned shipments preserve original revenue/cost and mark estimated profit incomplete", async () => {
  const s = await knownCostScenario(owner.api);
  expect(
    (
      await deliveryAction(owner.api, s.d.id, "RETURNED", {
        reference: "QA RTS analytics",
      })
    ).response.status(),
  ).toBe(200);
  const p = await report(owner.api, "profitability", {
    productId: s.f.product.id,
  });
  expect(amount(p, "revenue")).toBe(20000);
  expect(amount(p, "cogs")).toBe(10000);
  expect(amount(p, "grossProfit")).toBeNull();
  expect(amount(p, "returnReview")).toBe(1);
  await s.b.api.dispose();
});
test("cancelled orders stay visible but are excluded from successful sales and pending balances", async () => {
  const s = await scenario(owner.api, false);
  await orderAction(owner.api, s.o.row.id, "CANCEL");
  const q = { customerId: s.b.user.customer!.id };
  const sales = await report(owner.api, "sales", q);
  expect(amount(sales, "orders")).toBe(1);
  expect(amount(sales, "cancelled")).toBe(1);
  expect(amount(sales, "orderValue")).toBe(0);
  expect(amount(sales, "pending")).toBe(0);
  const p = await report(owner.api, "profitability", q);
  expect(amount(p, "revenue")).toBe(0);
  await s.b.api.dispose();
});
test("uploaded, rejected and duplicate proofs never inflate actual collections or partial payments", async () => {
  const s = await scenario(owner.api, false);
  const q = { customerId: s.b.user.customer!.id };
  await upload(s.b.api, s.o.row.id);
  let r = await report(owner.api, "payments", q);
  expect(amount(r, "receipts")).toBe(0);
  expect(amount(r, "underReview")).toBe(1);
  const v = await verify(owner.api, s.o.row.id, 7000);
  expect(v.response.status()).toBe(200);
  const repeated = await owner.api.post(
    `/api/v1/admin/sales/payments/${v.submission.id}`,
    { data: v.data },
  );
  expect(repeated.status()).toBe(200);
  r = await report(owner.api, "payments", q);
  expect(amount(r, "receipts")).toBe(7000);
  expect(amount(r, "partial")).toBe(1);
  expect(amount(r, "pending")).toBe(13000);
  await upload(s.b.api, s.o.row.id);
  const sub = await db.paymentSubmission.findFirstOrThrow({
    where: { orderId: s.o.row.id, status: "SUBMITTED" },
  });
  await owner.api.post(`/api/v1/admin/sales/payments/${sub.id}`, {
    data: {
      action: "REJECT",
      version: sub.version,
      reason: "QA rejected evidence",
      internalNotes: "Bank record does not support this extra screenshot",
    },
  });
  r = await report(owner.api, "payments", q);
  expect(amount(r, "receipts")).toBe(7000);
  expect(amount(r, "rejected")).toBe(1);
  expect(
    (await report(owner.api, "payments", { ...q, method: "BANK" })).rows,
  ).toHaveLength(0);
  await s.b.api.dispose();
});
test("UPI and bank collection filters use real verified PaymentRecord methods", async () => {
  const s = await knownCostScenario(owner.api, { dispatch: false });
  await put(s.b.api, s.f.variants[1].id, 1);
  const reviewed = await review(s.b.api, s.b.address.id, "BANK");
  const o = await s.b.api.post("/api/v1/me/orders", {
    data: {
      requestId: randomUUID(),
      addressId: s.b.address.id,
      paymentMethod: "BANK",
      reviewToken: reviewed.reviewToken,
    },
  });
  expect(o.status()).toBe(201);
  const order = (await o.json()).data;
  await upload(s.b.api, order.id, { method: "BANK" });
  const v = await verify(owner.api, order.id, order.totalPaise);
  expect(v.response.status()).toBe(200);
  const q = { customerId: s.b.user.customer!.id };
  expect(
    amount(
      await report(owner.api, "payments", { ...q, method: "UPI" }),
      "receipts",
    ),
  ).toBe(20000);
  expect(
    amount(
      await report(owner.api, "payments", { ...q, method: "BANK" }),
      "receipts",
    ),
  ).toBe(10000);
  await s.b.api.dispose();
});
test("collection method filters include actual transfers and refunds that differ from checkout intent", async () => {
  const s = await knownCostScenario(owner.api, { dispatch: false });
  try {
    const q = { customerId: s.b.user.customer!.id };
    // Checkout says UPI, but the customer actually pays this second order by bank.
    const o = await checkout(s.b, s.f.variants[1].id, 1);
    expect(o.row.paymentMethod).toBe("UPI");
    expect((await upload(s.b.api, o.row.id, { method: "BANK" })).status()).toBe(
      201,
    );
    expect(
      amount(
        await report(owner.api, "payments", { ...q, method: "BANK" }),
        "underReview",
      ),
    ).toBe(1);
    expect(
      (await verify(owner.api, o.row.id, o.row.totalPaise)).response.status(),
    ).toBe(200);
    expect((await orderAction(owner.api, s.o.row.id, "CANCEL")).status()).toBe(
      200,
    );
    expect(
      (
        await owner.api.post(`${sales}/refunds/${s.o.row.id}`, {
          data: {
            requestId: randomUUID(),
            amountPaise: 5000,
            method: "BANK",
            bankReference: `QA${randomUUID()}`,
            checkedBankRecord: true,
            reason: "QA external bank refund against UPI receipt",
            internalNotes: "Dummy external refund already checked",
          },
        })
      ).status(),
    ).toBe(200);
    const bank = await report(owner.api, "payments", { ...q, method: "BANK" });
    expect(amount(bank, "receipts")).toBe(o.row.totalPaise);
    expect(amount(bank, "refunds")).toBe(5000);
    expect(amount(bank, "netCollections")).toBe(o.row.totalPaise - 5000);
    const upi = await report(owner.api, "payments", { ...q, method: "UPI" });
    expect(amount(upi, "receipts")).toBe(s.o.row.totalPaise);
    expect(amount(upi, "refunds")).toBe(0);
  } finally {
    await s.b.api.dispose();
  }
});

test("PO commitments, received values and remaining quantities remain separate", async () => {
  const f = await fixture(owner.api);
  const p = await po(owner.api, f, 10);
  let r = await report(owner.api, "purchases", { supplierId: f.supplier.id });
  expect(amount(r, "poValue")).toBe(100000);
  expect(amount(r, "confirmedValue")).toBe(0);
  expect(amount(r, "receivedValue")).toBe(0);
  const submit = await purchaseAction(
    owner.api,
    "purchase-orders",
    p.row,
    "SUBMIT",
  );
  expect(submit.status()).toBe(200);
  const partial = await receive(owner.api, (await submit.json()).data, 4);
  r = await report(owner.api, "purchases", { supplierId: f.supplier.id });
  expect(amount(r, "confirmedValue")).toBe(100000);
  expect(amount(r, "receivedValue")).toBe(40000);
  expect(amount(r, "outstanding")).toBe(6);
  const current = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: p.row.id },
    include: { lines: true },
  });
  await receive(owner.api, current, 6);
  r = await report(owner.api, "purchases", { supplierId: f.supplier.id });
  expect(amount(r, "receivedValue")).toBe(100000);
  expect(amount(r, "outstanding")).toBe(0);
  const suppliers = await report(owner.api, "suppliers", {
    supplierId: f.supplier.id,
  });
  expect(suppliers.rows[0]["Net received packs"]).toBe(10);
  expect(JSON.stringify(suppliers.rows)).not.toMatch(
    /payable|bankAccount|paymentDetails/,
  );
  expect(partial.id).toBeTruthy();
});
test("low/out stock, damaged quantities and movement exports respect actual ledger and reservation events", async () => {
  const s = await knownCostScenario(owner.api, { dispatch: false });
  const v = s.f.variants[0];
  const lot = await db.stockLot.findFirstOrThrow({
    where: { variantId: v.id },
  });
  const damage = await adjustment(owner.api, v.id, 3, "DAMAGE", lot.id);
  expect(damage.status()).toBe(201);
  await owner.api.patch(`/api/v1/admin/operations/thresholds/${v.id}`, {
    data: {
      minimumQuantity: 6,
      version: 0,
      reason: "QA actual low stock threshold",
    },
  });
  const r = await report(owner.api, "inventory", { variantId: v.id });
  expect(amount(r, "onHand")).toBe(7);
  expect(amount(r, "damaged")).toBe(3);
  expect(amount(r, "reserved")).toBe(2);
  expect(amount(r, "available")).toBe(5);
  expect(amount(r, "lowStock")).toBe(1);
  const history = await report(owner.api, "inventory", {
    variantId: v.id,
    view: "movements",
  });
  expect(
    history.rows.some((x: Record<string, unknown>) => x.Kind === "DAMAGE"),
  ).toBe(true);
  await s.b.api.dispose();
});
test("expense creation, versioned edits, cancellation and immutable history are audited", async () => {
  const x = await expense(owner.api);
  expect(
    await db.expenseRevision.count({ where: { expenseId: x.row.id } }),
  ).toBe(1);
  const edit = {
    requestId: randomUUID(),
    version: 0,
    reason: "QA receipt corrected",
    data: { ...x.data.data, amountPaise: 4000 },
  };
  expect(
    (
      await owner.api.patch(`/api/v1/admin/expenses/${x.row.id}`, {
        data: edit,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await owner.api.patch(`/api/v1/admin/expenses/${x.row.id}`, {
        data: edit,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await owner.api.patch(`/api/v1/admin/expenses/${x.row.id}`, {
        data: { ...edit, requestId: randomUUID() },
      })
    ).status(),
  ).toBe(409);
  const cancel = {
    requestId: randomUUID(),
    version: 1,
    action: "CANCEL",
    reason: "QA incorrect duplicate expense cancelled",
  };
  expect(
    (
      await owner.api.post(`/api/v1/admin/expenses/${x.row.id}`, {
        data: cancel,
      })
    ).status(),
  ).toBe(200);
  const row = await db.businessExpense.findUniqueOrThrow({
    where: { id: x.row.id },
  });
  expect(row.status).toBe("CANCELLED");
  expect(await db.expenseRevision.count({ where: { expenseId: row.id } })).toBe(
    3,
  );
  expect(
    await db.auditLog.count({
      where: { entityId: row.id, action: "EXPENSE_CHANGED" },
    }),
  ).toBe(3);
  await expect(
    db.businessExpense.delete({ where: { id: row.id } }),
  ).rejects.toThrow();
  await expect(
    db.expenseRevision.updateMany({
      where: { expenseId: row.id },
      data: { amountPaise: 1 },
    }),
  ).rejects.toThrow();
});
test("expense date/category filters and knowledge cutoffs preserve prior revision figures", async () => {
  const x = await expense(owner.api, {
    category: "MAINTENANCE",
    expenseDate: "2026-10-01",
  });
  const before = await report(owner.api, "expenses", {
    preset: "custom",
    from: "2026-10-01",
    to: "2026-10-01",
    q: x.data.data.title,
    category: "MAINTENANCE",
  });
  expect(amount(before, "expenses")).toBe(2500);
  const cutoff = before.range.knowledgeAsOf;
  const edit = {
    requestId: randomUUID(),
    version: 0,
    reason: "QA actual corrected receipt amount",
    data: { ...x.data.data, amountPaise: 3500 },
  };
  expect(
    (
      await owner.api.patch(`/api/v1/admin/expenses/${x.row.id}`, {
        data: edit,
      })
    ).status(),
  ).toBe(200);
  const historical = await report(owner.api, "expenses", {
    preset: "custom",
    from: "2026-10-01",
    to: "2026-10-01",
    knowledgeAsOf: cutoff,
    q: x.data.data.title,
    category: "MAINTENANCE",
  });
  expect(amount(historical, "expenses")).toBe(2500);
  const current = await report(owner.api, "expenses", {
    preset: "custom",
    from: "2026-10-01",
    to: "2026-10-01",
    q: x.data.data.title,
    category: "MAINTENANCE",
  });
  expect(amount(current, "expenses")).toBe(3500);
});
test("invalid expense amounts, future dates and concurrent edits cannot corrupt records", async () => {
  for (const extra of [
    { amountPaise: 0 },
    { amountPaise: -1 },
    { amountPaise: 1.5 },
    { expenseDate: "2099-01-01" },
    { category: "FAKE" },
    { role: "SUPER_ADMIN" },
  ])
    expect(
      (
        await owner.api.post("/api/v1/admin/expenses", {
          data: expenseData(extra),
        })
      ).status(),
    ).toBe(422);
  const x = await expense(owner.api);
  const rs = await Promise.all(
    [3000, 4000].map((amountPaise) =>
      owner.api.patch(`/api/v1/admin/expenses/${x.row.id}`, {
        data: {
          requestId: randomUUID(),
          version: 0,
          reason: "QA concurrent expense revision",
          data: { ...x.data.data, amountPaise },
        },
      }),
    ),
  );
  expect(rs.map((r) => r.status()).sort()).toEqual([200, 409]);
  expect(
    await db.expenseRevision.count({ where: { expenseId: x.row.id } }),
  ).toBe(2);
});
test("expense CSV protects formulas and exports no private document or account fields", async () => {
  const x = await expense(owner.api, {
    title: "=HYPERLINK evil QA receipt",
    description: "+cmd|attack",
    reference: "@SUM bad",
  });
  const r = await owner.api.get(
    `${reports}/expenses?preset=month&q=${encodeURIComponent(x.data.data.title)}&format=csv`,
  );
  expect(r.status()).toBe(200);
  const csv = await r.text();
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).toContain("'+cmd");
  expect(csv).toContain("'@SUM");
  for (const secret of [
    "fileBytes",
    "fileHash",
    "attachments",
    "paymentDetails",
    "accountNumber",
  ])
    expect(csv).not.toContain(secret);
  expect(r.headers()["cache-control"]).toContain("no-store");
});
test("expense receipt images remain private and invalid files are rejected", async () => {
  const x = await expense(owner.api);
  const multipart = {
    requestId: randomUUID(),
    file: { name: "receipt.png", mimeType: "image/png", buffer: await png() },
  };
  const r = await owner.api.post(
    `/api/v1/admin/expenses/${x.row.id}/attachments`,
    { multipart },
  );
  expect(r.status(), await r.text()).toBe(201);
  const id = (await r.json()).data.id;
  expect(
    (await owner.api.get(`/api/v1/expense-attachments/${id}`)).status(),
  ).toBe(200);
  const a = await registered();
  expect((await a.api.get(`/api/v1/expense-attachments/${id}`)).status()).toBe(
    403,
  );
  expect(
    (
      await owner.api.post(`/api/v1/admin/expenses/${x.row.id}/attachments`, {
        multipart: {
          ...multipart,
          requestId: randomUUID(),
          file: {
            name: "bad.svg",
            mimeType: "image/svg+xml",
            buffer: Buffer.from("<svg/>"),
          },
        },
      })
    ).status(),
  ).toBe(415);
  await a.api.dispose();
});
test("customer, dealer and sales-rep accounts cannot access reports, financial CSV or expenses", async () => {
  const anonymous = await context();
  expect((await anonymous.get(`${reports}/dashboard`)).status()).toBe(401);
  await anonymous.dispose();
  for (const role of ["CUSTOMER", "DEALER", "SALES_REP"] as const) {
    const a = await registered();
    await db.user.update({ where: { id: a.user.id }, data: { role } });
    for (const path of [
      "dashboard",
      "sales",
      "payments",
      "profitability",
      "inventory",
      "expenses",
      "options",
    ])
      expect((await a.api.get(`${reports}/${path}?format=csv`)).status()).toBe(
        403,
      );
    expect(
      (
        await a.api.post("/api/v1/admin/expenses", { data: expenseData() })
      ).status(),
    ).toBe(403);
    await a.api.dispose();
  }
});
test("operational admin can record expenses but cannot access financial costs or profitability", async () => {
  const admin = await staff("ADMIN");
  const r = await admin.api.get(`${reports}/profitability?format=csv`);
  expect(r.status()).toBe(403);
  const inventory = await report(admin.api, "inventory");
  expect(JSON.stringify(inventory)).not.toMatch(
    /Known inventory value|Missing-cost|Complete valuation|numeratorPaise|amountPaise/,
  );
  const dash = await admin.api.get(`${reports}/dashboard`);
  expect(dash.status()).toBe(200);
  expect((await dash.json()).data.financialAccess).toBe(false);
  await expense(admin.api);
  await admin.api.dispose();
});
test("delivery reports use confirmed shipments and actual local/courier event statuses", async () => {
  const s = await knownCostScenario(owner.api);
  const q = { customerId: s.b.user.customer!.id };
  let r = await report(owner.api, "deliveries", q);
  expect(amount(r, "confirmed")).toBe(1);
  expect(amount(r, "local")).toBe(1);
  expect(amount(r, "courier")).toBe(0);
  await deliveryAction(owner.api, s.d.id, "OUT_FOR_DELIVERY");
  await deliveryAction(owner.api, s.d.id, "DELIVERED", {
    recipientName: "QA Receiver",
    confirmationSource: "Staff witnessed actual handover",
  });
  r = await report(owner.api, "deliveries", {
    ...q,
    status: "DELIVERED",
    deliveryMethod: "LOCAL",
  });
  expect(r.rows).toHaveLength(1);
  expect(amount(r, "DELIVERED")).toBe(1);
  expect(JSON.stringify(r)).not.toContain("PRIVATE-DISPATCH-NOTES");
  await s.b.api.dispose();
});
test("sales/product reports keep independent pack sizes and historical category snapshots", async () => {
  const s = await knownCostScenario(owner.api, { dispatch: false });
  const q = { customerId: s.b.user.customer!.id, productId: s.f.product.id };
  const products = await report(owner.api, "products", q);
  expect(products.rows).toHaveLength(1);
  expect(products.rows[0]["Pack size"]).toBe("8g");
  expect(products.rows[0]["Quantity packs"]).toBe(2);
  expect(products.rows[0]["Average unit price INR"]).toBe("100.00");
  const customers = await report(owner.api, "customers", q);
  expect(
    customers.rows.find(
      (r: Record<string, unknown>) =>
        r["Customer ID"] === s.b.user.customer!.id,
    )?.Orders,
  ).toBe(1);
  await s.b.api.dispose();
});
test("dashboard uses actual sources and selected ranges with protected, defined metrics", async () => {
  const s = await knownCostScenario(owner.api);
  const r = await owner.api.get(
    `${reports}/dashboard?preset=month&customerId=${s.b.user.customer!.id}&productId=${s.f.product.id}`,
  );
  expect(r.status(), await r.text()).toBe(200);
  const d = (await r.json()).data;
  expect(d.cards.find((m: { key: string }) => m.key === "orders").value).toBe(
    1,
  );
  expect(
    d.cards.every((m: { definition: string }) => m.definition.length > 10),
  ).toBe(true);
  const none = await report(owner.api, "sales", {
    customerId: `nonexistent-${randomUUID()}`,
  });
  expect(amount(none, "orders")).toBe(0);
  expect(none.rows).toEqual([]);
  expect(
    (
      await owner.api.get(
        `${reports}/sales?preset=custom&from=2026-11-14&to=2026-01-01`,
      )
    ).status(),
  ).toBe(422);
  expect(
    (await owner.api.get(`${reports}/sales?role=SUPER_ADMIN`)).status(),
  ).toBe(422);
  await s.b.api.dispose();
});
test("business timezone is used consistently and invalid configuration fails visibly", async () => {
  const initial = await db.businessSettings.findUniqueOrThrow({
    where: { id: "singleton" },
  });
  try {
    await db.businessSettings.update({
      where: { id: "singleton" },
      data: { timezone: "America/New_York" },
    });
    const r = await report(owner.api, "sales", {
      preset: "today",
      customerId: `absent-${randomUUID()}`,
    });
    expect(r.range.timezone).toBe("America/New_York");
    expect(r.range.from).toBe(
      new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
    );
    await db.businessSettings.update({
      where: { id: "singleton" },
      data: { timezone: "Invalid/Zone" },
    });
    expect((await owner.api.get(`${reports}/sales`)).status()).toBe(409);
  } finally {
    await db.businessSettings.update({
      where: { id: "singleton" },
      data: { timezone: initial.timezone },
    });
  }
});
test("financial mutations retain origin and strict body guards", async () => {
  expect(
    (
      await owner.api.post("/api/v1/admin/expenses", {
        headers: { Origin: "https://evil.invalid" },
        data: expenseData(),
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.api.post("/api/v1/admin/expenses", {
        data: { ...expenseData(), totalPaise: 1 },
      })
    ).status(),
  ).toBe(422);
});
