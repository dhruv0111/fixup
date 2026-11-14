import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { db, context } from "../fixtures/helpers";
import {
  staff,
  priceList,
  assign,
  submitDealer,
  decide,
} from "../fixtures/phase3";
import { fixture, submitted, receive } from "../fixtures/phase4";
import {
  buyerAccount,
  checkout,
  upload,
  verify,
  setupSettings,
} from "../fixtures/phase5";
import {
  confirmed,
  courierShipment,
  action,
  balance,
} from "../fixtures/phase6";
import { report, amount } from "../fixtures/phase7";

let owner: Awaited<ReturnType<typeof staff>>;
test.beforeAll(async () => {
  owner = await staff();
});
test.afterAll(async () => {
  await owner.api.dispose();
  await db.$disconnect();
});

async function procurement() {
  const f = await fixture(owner.api);
  f.variants.sort((a, b) => parseInt(a.packSize) - parseInt(b.packSize));
  await db.product.update({
    where: { id: f.product.id },
    data: {
      published: true,
      contentApproved: true,
      approvalReference: "Isolated Phase 8 QA",
    },
  });
  await db.productVariant.updateMany({
    where: { productId: f.product.id },
    data: {
      published: true,
      contentApproved: true,
      approvalReference: "Isolated Phase 8 QA",
    },
  });
  const po = await submitted(owner.api, f, 200, true);
  await receive(owner.api, po, 200, true);
  for (const [category, price] of [
    ["RETAIL", 15000],
    ["APPROVED_DEALER", 12500],
  ] as const) {
    const list = await priceList(
      owner.api,
      f.variants.map((v) => ({ variantId: v.id, amountPaise: price })),
    );
    expect((await assign(owner.api, category, list.id)).status()).toBe(200);
  }
  await setupSettings(owner.api);
  return f;
}

for (const dealer of [false, true])
  test(`Phase 8 ${dealer ? "approved dealer bulk" : "retail customer"} chain reconciles procurement, login, prices, verified funds, dispatch and reports`, async () => {
    const f = await procurement();
    const b = await buyerAccount();
    try {
      if (dealer) {
        const application = await submitDealer(b.api);
        expect(
          (await decide(owner.api, application.id, "APPROVED")).status(),
        ).toBe(200);
      }
      expect(
        (await b.api.post("/api/auth/sign-out", { data: {} })).status(),
      ).toBe(200);
      expect(
        (
          await b.api.post("/api/auth/sign-in/email", {
            data: {
              email: b.credentials.email,
              password: b.credentials.password,
            },
          })
        ).status(),
      ).toBe(200);
      expect(
        (await b.api.get(`/api/v1/catalogue/${f.product.slug}`)).status(),
      ).toBe(200);
      const prices = (
        await (
          await b.api.get(`/api/v1/me/prices?productId=${f.product.id}`)
        ).json()
      ).data;
      expect(
        prices.prices.find(
          (p: { variantId: string }) => p.variantId === f.variants[0].id,
        ).amountPaise,
      ).toBe(dealer ? 12500 : 15000);
      const quantity = dealer ? 50 : 2;
      const order = await checkout(b, f.variants[0].id, quantity);
      expect(order.row.totalPaise).toBe(quantity * (dealer ? 12500 : 15000));
      expect(order.row.category).toBe(dealer ? "APPROVED_DEALER" : "RETAIL");
      expect((await balance(f.variants[0].id)).availableDelta).toBe(200);
      expect(
        (
          await upload(b.api, order.row.id, {
            reference: `PHASE8${randomUUID()}`,
          })
        ).status(),
      ).toBe(201);
      expect(
        await db.paymentRecord.count({ where: { orderId: order.row.id } }),
      ).toBe(0);
      const verified = await verify(
        owner.api,
        order.row.id,
        order.row.totalPaise,
      );
      expect(verified.response.status(), await verified.response.text()).toBe(
        200,
      );
      const dispatch = await confirmed(
        owner.api,
        order.row.id,
        dealer ? courierShipment() : undefined,
      );
      expect((await balance(f.variants[0].id)).availableDelta).toBe(
        200 - quantity,
      );
      expect(
        (
          await action(owner.api, dispatch.id, "OUT_FOR_DELIVERY")
        ).response.status(),
      ).toBe(200);
      const delivered = await action(owner.api, dispatch.id, "DELIVERED", {
        recipientName: "Isolated QA recipient",
        confirmationSource: "Dummy QA handover attestation",
      });
      expect(delivered.response.status(), await delivered.response.text()).toBe(
        200,
      );
      const tracking = await b.api.get(
        `/api/v1/me/orders/${order.row.id}/delivery`,
      );
      expect(tracking.status()).toBe(200);
      expect(await tracking.text()).toContain("DELIVERED");
      const query = { productId: f.product.id };
      const profit = await report(owner.api, "profitability", query);
      expect(amount(profit, "revenue")).toBe(order.row.totalPaise);
      expect(amount(profit, "cogs")).toBe(quantity * 10000);
      expect(amount(profit, "grossProfit")).toBe(
        order.row.totalPaise - quantity * 10000,
      );
      const inventory = await report(owner.api, "inventory", query);
      const ledger = await db.stockMovement.aggregate({
        where: { variantId: { in: f.variants.map((v) => v.id) } },
        _sum: { availableDelta: true },
      });
      expect(amount(inventory, "onHand")).toBe(ledger._sum.availableDelta);
      expect(amount(inventory, "onHand")).toBe(800 - quantity);
      expect(amount(inventory, "reserved")).toBe(0);
      expect(amount(inventory, "inventoryValue")).toBe(
        (800 - quantity) * 10000,
      );
      expect(
        (
          await db.stockLot.findMany({
            where: { variantId: { in: f.variants.map((v) => v.id) } },
          })
        ).every((l) => l.batchNumber === "QA-BATCH" && l.expiresAt !== null),
      ).toBe(true);
      const stranger = await context();
      try {
        expect(
          (
            await stranger.get(`/api/v1/me/orders/${order.row.id}/delivery`)
          ).status(),
        ).toBe(401);
      } finally {
        await stranger.dispose();
      }
    } finally {
      await b.api.dispose();
    }
  });

test("Phase 8 SQL-shaped report input stays data and does not disclose database errors", async () => {
  const before = await db.product.count();
  for (const kind of [
    "sales",
    "payments",
    "purchases",
    "inventory",
    "expenses",
    "customers",
    "products",
  ]) {
    const r = await owner.api.get(
      `/api/v1/admin/reports/${kind}?q=${encodeURIComponent("' OR 1=1; DROP TABLE Product; --")}`,
    );
    expect(r.status(), await r.text()).toBe(200);
    expect(await r.text()).not.toMatch(
      /PrismaClient|passwordHash|connectionString|SQLSTATE/,
    );
  }
  expect(await db.product.count()).toBe(before);
});
