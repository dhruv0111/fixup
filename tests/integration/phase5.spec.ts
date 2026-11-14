import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { secureAccount } from "../fixtures/security";
import { db, context, registered } from "../fixtures/helpers";
import { staff, submitDealer, decide } from "../fixtures/phase3";
import {
  balance,
  adjustment,
  root,
  submitted,
  receive,
  action,
} from "../fixtures/phase4";
import {
  sales,
  salesFixture,
  setupSettings,
  buyerAccount,
  put,
  review,
  checkout,
  upload,
  verify,
  orderAction,
  png,
} from "../fixtures/phase5";
let owner: Awaited<ReturnType<typeof staff>>,
  f: Awaited<ReturnType<typeof salesFixture>>,
  b: Awaited<ReturnType<typeof buyerAccount>>;
test.beforeAll(async () => {
  owner = await staff();
});
test.beforeEach(async () => {
  f = await salesFixture(owner.api);
  b = await buyerAccount();
});
test.afterEach(async () => {
  await b.api.dispose();
});
test.afterAll(async () => {
  await owner.api.dispose();
  await db.$disconnect();
});
const orderUrl = (id: string) => `/api/v1/me/orders/${id}`;
async function current(id: string) {
  return (await b.api.get(orderUrl(id))).json().then((r) => r.data);
}
async function due(id: string) {
  await db.stockReservation.updateMany({
    where: { orderId: id, status: "ACTIVE" },
    data: {
      expiresAt: new Date(Date.now() - 1000),
      version: { increment: 1 },
      reason: "QA force expiry",
    },
  });
}

test("cart variants use current retail prices, quantity, remove and updated-price notice", async () => {
  let c = await put(b.api, f.variants[0].id, 2);
  expect(c.lines[0]).toMatchObject({
    unitPricePaise: 10000,
    quantity: 2,
    linePricePaise: 20000,
    changed: false,
  });
  await db.priceEntry.updateMany({
    where: { priceListId: f.retail.id, variantId: f.variants[0].id },
    data: { amountPaise: 12000 },
  });
  c = (await (await b.api.get("/api/v1/me/cart")).json()).data;
  expect(c.lines[0]).toMatchObject({ unitPricePaise: 12000, changed: true });
  await put(b.api, f.variants[0].id, 3);
  c = await put(b.api, f.variants[0].id, 0);
  expect(c.lines).toEqual([]);
});
test("only current approved dealers receive dealer order pricing", async () => {
  const d = await submitDealer(b.api);
  expect((await decide(owner.api, d.id, "APPROVED")).status()).toBe(200);
  const o = await checkout(b, f.variants[0].id);
  expect(o.row).toMatchObject({
    category: "APPROVED_DEALER",
    totalPaise: 8000,
  });
  expect((await decide(owner.api, d.id, "SUSPENDED")).status()).toBe(200);
  const c = await put(b.api, f.variants[1].id);
  expect(c.category).toBe("RETAIL");
  expect(c.lines[0].unitPricePaise).toBe(11000);
});
test("all four variants reserve separately without physical stock deduction and snapshot totals/address", async () => {
  await setupSettings(owner.api, { taxBps: 500, deliveryPaise: 2500 });
  for (const v of f.variants) await put(b.api, v.id, 2);
  const p = await review(b.api, b.address.id, "BANK");
  expect(p).toMatchObject({
    subtotalPaise: 92000,
    taxPaise: 4600,
    deliveryPaise: 2500,
    totalPaise: 99100,
  });
  const r = await b.api.post("/api/v1/me/orders", {
    data: {
      requestId: randomUUID(),
      addressId: b.address.id,
      paymentMethod: "BANK",
      reviewToken: p.reviewToken,
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  const o = (await r.json()).data;
  expect(o.number).toMatch(/^FIX-SO-\d+$/);
  expect(o.lines).toHaveLength(4);
  expect(
    o.reservations.every(
      (r: { status: string; quantity: number }) =>
        r.status === "ACTIVE" && r.quantity === 2,
    ),
  ).toBe(true);
  await db.address.update({
    where: { id: b.address.id },
    data: { city: "Changed QA City" },
  });
  await db.priceEntry.updateMany({
    where: { priceListId: f.retail.id },
    data: { amountPaise: 9999 },
  });
  const saved = await current(o.id);
  expect(saved.addressSnapshot.city).toBe("Test City");
  expect(saved.totalPaise).toBe(99100);
  expect(saved.lines[0].unitPricePaise).not.toBe(9999);
  for (const v of f.variants)
    expect(await balance(v.id)).toEqual({ available: 10, damaged: 0 });
  const stock = (
    await (
      await owner.api.get(`${root}/inventory?variantId=${f.variants[0].id}`)
    ).json()
  ).data;
  expect(stock.items?.[0] ?? stock[0]).toMatchObject({
    onHand: 10,
    reserved: 2,
    available: 8,
  });
});
test("unpublished/inactive products and missing prices cannot enter checkout", async () => {
  for (const data of [
    { active: false },
    { active: true, published: false },
    { active: true, published: true, contentApproved: false },
  ]) {
    await db.product.update({ where: { id: f.product.id }, data });
    expect(
      (
        await b.api.patch("/api/v1/me/cart", {
          data: { variantId: f.variants[0].id, quantity: 1 },
        })
      ).status(),
    ).toBe(422);
  }
  await db.product.update({
    where: { id: f.product.id },
    data: { active: true, published: true, contentApproved: true },
  });
  await put(b.api, f.variants[0].id);
  await db.productVariant.update({
    where: { id: f.variants[0].id },
    data: { active: false },
  });
  expect(
    (
      await b.api.post("/api/v1/me/checkout/preview", {
        data: { addressId: b.address.id, paymentMethod: "UPI" },
      })
    ).status(),
  ).toBe(422);
});
test("invalid quantities, client prices and foreign addresses are rejected", async () => {
  for (const quantity of [-1, 0.5, 10001, "2"])
    expect(
      (
        await b.api.patch("/api/v1/me/cart", {
          data: { variantId: f.variants[0].id, quantity },
        })
      ).status(),
    ).toBe(422);
  expect(
    (
      await b.api.patch("/api/v1/me/cart", {
        data: { variantId: f.variants[0].id, quantity: 1, unitPricePaise: 1 },
      })
    ).status(),
  ).toBe(422);
  await put(b.api, f.variants[0].id);
  const stranger = await buyerAccount();
  expect(
    (
      await b.api.post("/api/v1/me/checkout/preview", {
        data: { addressId: stranger.address.id, paymentMethod: "UPI" },
      })
    ).status(),
  ).toBe(422);
  await stranger.api.dispose();
});
test("checkout review token rejects current price, visibility and settings changes atomically", async () => {
  await put(b.api, f.variants[0].id);
  const p = await review(b.api, b.address.id);
  await db.priceEntry.updateMany({
    where: { priceListId: f.retail.id, variantId: f.variants[0].id },
    data: { amountPaise: 12000 },
  });
  const r = await b.api.post("/api/v1/me/orders", {
    data: {
      addressId: b.address.id,
      paymentMethod: "UPI",
      requestId: randomUUID(),
      reviewToken: p.reviewToken,
    },
  });
  expect(r.status()).toBe(409);
  expect(
    await db.salesOrder.count({ where: { customerId: b.user.customer!.id } }),
  ).toBe(0);
  expect(
    await db.cartItem.count({ where: { customerId: b.user.customer!.id } }),
  ).toBe(1);
});
test("duplicate concurrent order requests create one order and one reservation", async () => {
  await put(b.api, f.variants[0].id, 3);
  const p = await review(b.api, b.address.id);
  const data = {
    addressId: b.address.id,
    paymentMethod: "UPI",
    requestId: randomUUID(),
    reviewToken: p.reviewToken,
  };
  const rs = await Promise.all(
    [1, 2, 3].map(() => b.api.post("/api/v1/me/orders", { data })),
  );
  expect(rs.map((r) => r.status())).toEqual([201, 201, 201]);
  const ids = await Promise.all(rs.map(async (r) => (await r.json()).data.id));
  expect(new Set(ids).size).toBe(1);
  expect(await db.stockReservation.count({ where: { orderId: ids[0] } })).toBe(
    1,
  );
  expect(
    (
      await b.api.post("/api/v1/me/orders", {
        data: { ...data, notes: "Changed intent" },
      })
    ).status(),
  ).toBe(409);
});
test("two buyers competing for final stock cannot oversell", async () => {
  const other = await buyerAccount();
  await put(b.api, f.variants[0].id, 10);
  await put(other.api, f.variants[0].id, 10);
  const ps = await Promise.all([
    review(b.api, b.address.id),
    review(other.api, other.address.id),
  ]);
  const rs = await Promise.all(
    [b, other].map((a, i) =>
      a.api.post("/api/v1/me/orders", {
        data: {
          addressId: a.address.id,
          paymentMethod: "UPI",
          requestId: randomUUID(),
          reviewToken: ps[i].reviewToken,
        },
      }),
    ),
  );
  expect(rs.map((r) => r.status()).sort()).toEqual([201, 422]);
  expect(
    (
      await db.stockReservation.aggregate({
        where: { variantId: f.variants[0].id, status: "ACTIVE" },
        _sum: { quantity: true },
      })
    )._sum.quantity,
  ).toBe(10);
  expect(await balance(f.variants[0].id)).toMatchObject({ available: 10 });
  await other.api.dispose();
});
test("failed multi-line checkout rolls back all reservations and retains cart", async () => {
  await put(b.api, f.variants[0].id);
  await put(b.api, f.variants[1].id, 10);
  const p = await review(b.api, b.address.id);
  const other = await buyerAccount();
  await checkout(other, f.variants[1].id, 10);
  expect(
    (
      await b.api.post("/api/v1/me/orders", {
        data: {
          addressId: b.address.id,
          paymentMethod: "UPI",
          requestId: randomUUID(),
          reviewToken: p.reviewToken,
        },
      })
    ).status(),
  ).toBe(422);
  expect(
    await db.salesOrder.count({ where: { customerId: b.user.customer!.id } }),
  ).toBe(0);
  expect(
    await db.stockReservation.count({ where: { variantId: f.variants[0].id } }),
  ).toBe(0);
  expect(
    await db.cartItem.count({ where: { customerId: b.user.customer!.id } }),
  ).toBe(2);
  await other.api.dispose();
});
test("owner isolation, anonymous access, role permissions and CSRF protect sales", async () => {
  const o = await checkout(b, f.variants[0].id);
  const other = await registered();
  const anon = await context();
  expect((await other.api.get(orderUrl(o.row.id))).status()).toBe(404);
  expect((await anon.get(orderUrl(o.row.id))).status()).toBe(401);
  expect(
    (
      await other.api.post(orderUrl(o.row.id), {
        data: { action: "CANCEL", version: 0, reason: "Foreign cancellation" },
      })
    ).status(),
  ).toBe(404);
  for (const route of ["settings", "orders", "payments"])
    expect((await b.api.get(`${sales}/${route}`)).status()).toBe(403);
  expect((await b.api.post(`${sales}/expire`, { data: {} })).status()).toBe(
    403,
  );
  expect(
    (
      await b.api.patch("/api/v1/me/cart", {
        headers: { origin: "https://evil.invalid" },
        data: { variantId: f.variants[0].id, quantity: 1 },
      })
    ).status(),
  ).toBe(403);
  await other.api.dispose();
  await anon.dispose();
});
test("settings require explicit confirmation and all business rules; disabled checkout fails safely", async () => {
  await setupSettings(owner.api, { enabled: false });
  await put(b.api, f.variants[0].id);
  expect(
    (
      await b.api.post("/api/v1/me/checkout/preview", {
        data: { addressId: b.address.id, paymentMethod: "UPI" },
      })
    ).status(),
  ).toBe(422);
  const current = await db.salesSettings.findUniqueOrThrow({
    where: { id: "singleton" },
  });
  expect(
    (
      await owner.api.post(`${sales}/settings`, {
        data: { version: current.version, enabled: true },
      })
    ).status(),
  ).toBe(422);
  const admin = await staff("ADMIN");
  expect((await admin.api.get(`${sales}/settings`)).status()).toBe(403);
  await admin.api.dispose();
});
test("cancellation releases reservations exactly once and keeps history", async () => {
  const o = await checkout(b, f.variants[0].id, 3);
  const rs = await Promise.all(
    [1, 2].map(() => orderAction(b.api, o.row.id, "CANCEL", false)),
  );
  expect(rs.map((r) => r.status())).toEqual([200, 200]);
  const saved = await current(o.row.id);
  expect(saved.status).toBe("CANCELLED");
  expect(saved.reservations[0].status).toBe("RELEASED");
  const events = await db.reservationEvent.findMany({
    where: { reservationId: o.row.reservations[0].id },
  });
  expect(events.map((e) => e.quantityDelta).sort()).toEqual([-3, 3]);
  expect(await balance(f.variants[0].id)).toMatchObject({ available: 10 });
});
test("configured cancellation policy prevents customer cancellation", async () => {
  await setupSettings(owner.api, { customerCancelUnpaid: false });
  const o = await checkout(b, f.variants[0].id);
  expect((await orderAction(b.api, o.row.id, "CANCEL", false)).status()).toBe(
    422,
  );
  expect((await current(o.row.id)).reservations[0].status).toBe("ACTIVE");
});
test("concurrent expiry cleanup releases once and unauthorized cleanup is forbidden", async () => {
  const o = await checkout(b, f.variants[0].id, 2);
  await due(o.row.id);
  const rs = await Promise.all(
    [1, 2].map(() => owner.api.post(`${sales}/expire`, { data: {} })),
  );
  expect(rs.every((r) => r.status() === 200)).toBe(true);
  expect((await current(o.row.id)).status).toBe("RESERVATION_EXPIRED");
  expect(
    await db.reservationEvent.count({
      where: { reservationId: o.row.reservations[0].id, status: "EXPIRED" },
    }),
  ).toBe(1);
});
test("valid private screenshot submission does not credit payment or deduct on-hand stock", async () => {
  const o = await checkout(b, f.variants[0].id);
  expect((await upload(b.api, o.row.id)).status()).toBe(201);
  const row = await current(o.row.id);
  expect(row).toMatchObject({
    status: "PAYMENT_UNDER_REVIEW",
    paymentStatus: "UNPAID",
    verifiedPaise: 0,
  });
  expect(row.payments).toEqual([]);
  expect(await balance(f.variants[0].id)).toMatchObject({ available: 10 });
  const s = row.submissions[0];
  const proof = await b.api.get(`/api/v1/payments/${s.id}/proof`);
  expect(proof.status()).toBe(200);
  expect(proof.headers()["content-type"]).toBe("image/png");
  expect(proof.headers()["cache-control"]).toContain("no-store");
  expect(proof.headers()["x-content-type-options"]).toBe("nosniff");
  const other = await registered();
  const anon = await context();
  expect((await other.api.get(`/api/v1/payments/${s.id}/proof`)).status()).toBe(
    403,
  );
  expect((await anon.get(`/api/v1/payments/${s.id}/proof`)).status()).toBe(401);
  expect((await owner.api.get(`/api/v1/payments/${s.id}/proof`)).status()).toBe(
    200,
  );
  expect(JSON.stringify(row)).not.toMatch(
    /imageBytes|payloadDigest|internalNotes|verifiedById/,
  );
  await other.api.dispose();
  await anon.dispose();
});
test("unsafe, spoofed, oversized, repeated and foreign proof uploads are rejected", async () => {
  const o = await checkout(b, f.variants[0].id);
  for (const file of [
    {
      name: "evil.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    },
    {
      name: "fake.png",
      mimeType: "image/png",
      buffer: Buffer.from("<script>alert(1)</script>"),
    },
    { name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(5242881) },
  ]) {
    const r = await b.api.post(`${orderUrl(o.row.id)}/payments`, {
      multipart: {
        requestId: randomUUID(),
        method: "UPI",
        reference: "QA1234567",
        paidOn: "2026-11-13",
        file,
      },
    });
    expect([413, 415, 422]).toContain(r.status());
  }
  const other = await registered();
  expect((await upload(other.api, o.row.id)).status()).toBe(404);
  expect(
    await db.paymentSubmission.count({ where: { orderId: o.row.id } }),
  ).toBe(0);
  await other.api.dispose();
});
test("duplicate submission retries do not create new records", async () => {
  const o = await checkout(b, f.variants[0].id);
  const buffer = await png();
  const extra = { requestId: randomUUID(), reference: `QA${randomUUID()}` };
  const rs = await Promise.all(
    [1, 2].map(() => upload(b.api, o.row.id, extra, buffer)),
  );
  expect(rs.map((r) => r.status())).toEqual([201, 201]);
  expect(
    await db.paymentSubmission.count({ where: { orderId: o.row.id } }),
  ).toBe(1);
  expect((await upload(b.api, o.row.id)).status()).toBe(422);
});
test("review, reject and resubmission preserve all earlier proofs and notifications", async () => {
  const o = await checkout(b, f.variants[0].id);
  await upload(b.api, o.row.id);
  let s = await db.paymentSubmission.findFirstOrThrow({
    where: { orderId: o.row.id },
  });
  for (const action of ["REVIEW", "RESUBMISSION_REQUIRED"]) {
    const r = await owner.api.post(`${sales}/payments/${s.id}`, {
      data: {
        action,
        version: s.version,
        reason: "QA review reason",
        internalNotes: "Private bank review notes",
        publicMessage: "Please upload clear transaction details",
      },
    });
    expect(r.status()).toBe(200);
    s = await db.paymentSubmission.findUniqueOrThrow({ where: { id: s.id } });
  }
  expect((await upload(b.api, o.row.id)).status()).toBe(201);
  const row = await current(o.row.id);
  expect(row.submissions).toHaveLength(2);
  expect(row.submissions[0].status).toBe("RESUBMISSION_REQUIRED");
  expect(JSON.stringify(row)).not.toContain("Private bank review notes");
  expect(
    row.events.some((e: { kind: string }) => e.kind === "UNDER_REVIEW"),
  ).toBe(true);
});
test("full manual bank verification makes order ready; repeat/concurrent approval credits once", async () => {
  const o = await checkout(b, f.variants[0].id);
  await upload(b.api, o.row.id);
  const v = await verify(owner.api, o.row.id, o.row.totalPaise);
  expect(v.response.status(), await v.response.text()).toBe(200);
  const rs = await Promise.all(
    [1, 2].map(() =>
      owner.api.post(`${sales}/payments/${v.submission.id}`, { data: v.data }),
    ),
  );
  expect(rs.map((r) => r.status())).toEqual([200, 200]);
  const row = await current(o.row.id);
  expect(row).toMatchObject({
    status: "READY_FOR_DISPATCH",
    paymentStatus: "PAID",
    remainingPaise: 0,
  });
  expect(row.reservations[0].expiresAt).toBeNull();
  expect(await db.paymentRecord.count({ where: { orderId: o.row.id } })).toBe(
    1,
  );
  expect(await balance(f.variants[0].id)).toMatchObject({ available: 10 });
  expect(
    await db.auditLog.count({
      where: { entityId: o.row.id, action: "SALES_CHANGED" },
    }),
  ).toBeGreaterThanOrEqual(3);
});
test("verification requires bank attestation; customer and promoted self-review are denied", async () => {
  const o = await checkout(b, f.variants[0].id);
  await upload(b.api, o.row.id);
  const s = await db.paymentSubmission.findFirstOrThrow({
    where: { orderId: o.row.id },
  });
  const data = {
    action: "VERIFY",
    version: 0,
    reason: "QA verify reason",
    internalNotes: "QA bank checked",
    amountPaise: 10000,
    bankReference: `BANK${randomUUID()}`,
    requestId: randomUUID(),
  };
  expect(
    (await owner.api.post(`${sales}/payments/${s.id}`, { data })).status(),
  ).toBe(422);
  expect(
    (await b.api.post(`${sales}/payments/${s.id}`, { data })).status(),
  ).toBe(403);
  await secureAccount(b);
  await db.user.update({ where: { id: b.user.id }, data: { role: "ADMIN" } });
  expect(
    (
      await b.api.post(`${sales}/payments/${s.id}`, {
        data: { ...data, checkedBankRecord: true },
      })
    ).status(),
  ).toBe(403);
  expect(await db.paymentRecord.count({ where: { orderId: o.row.id } })).toBe(
    0,
  );
});
test("partial payments record actual amounts and permit subsequent full balance", async () => {
  const o = await checkout(b, f.variants[0].id);
  await upload(b.api, o.row.id);
  expect((await verify(owner.api, o.row.id, 3000)).response.status()).toBe(200);
  let row = await current(o.row.id);
  expect(row.paymentStatus).toBe("PARTIALLY_PAID");
  expect(row.remainingPaise).toBe(7000);
  expect(row.status).not.toBe("READY_FOR_DISPATCH");
  await upload(b.api, o.row.id);
  expect((await verify(owner.api, o.row.id, 7000)).response.status()).toBe(200);
  row = await current(o.row.id);
  expect(row.status).toBe("READY_FOR_DISPATCH");
  expect(row.payments).toHaveLength(2);
});
test("duplicate UTR is flagged and globally unique bank reference prevents double credit", async () => {
  const other = await buyerAccount();
  const a = await checkout(b, f.variants[0].id);
  const c = await checkout(other, f.variants[0].id);
  const reference = `DUP${randomUUID()}`;
  await upload(b.api, a.row.id, { reference });
  await upload(other.api, c.row.id, { reference });
  expect(
    await db.paymentSubmission.findFirst({ where: { orderId: c.row.id } }),
  ).toMatchObject({ duplicateReference: true });
  const v = await verify(owner.api, a.row.id, 10000);
  expect(v.response.status()).toBe(200);
  const second = await verify(owner.api, c.row.id, 10000, {
    bankReference: v.data.bankReference,
  });
  expect(second.response.status()).toBe(409);
  expect(await db.paymentRecord.count({ where: { orderId: c.row.id } })).toBe(
    0,
  );
  await other.api.dispose();
});
test("overpayment stays under review until explicit resolution without changing order total", async () => {
  const o = await checkout(b, f.variants[0].id);
  await upload(b.api, o.row.id);
  expect((await verify(owner.api, o.row.id, 12000)).response.status()).toBe(
    200,
  );
  let row = await current(o.row.id);
  expect(row).toMatchObject({
    paymentStatus: "OVERPAID",
    status: "ADMIN_REVIEW",
    totalPaise: 10000,
  });
  expect(
    (await orderAction(owner.api, o.row.id, "RESOLVE_OVERPAYMENT")).status(),
  ).toBe(200);
  row = await current(o.row.id);
  expect(row.status).toBe("READY_FOR_DISPATCH");
  expect(row.totalPaise).toBe(10000);
});
test("late proof after expiry requires explicit re-reservation subject to current stock", async () => {
  const o = await checkout(b, f.variants[0].id, 10);
  await due(o.row.id);
  await owner.api.post(`${sales}/expire`, { data: {} });
  expect((await upload(b.api, o.row.id)).status()).toBe(201);
  expect((await verify(owner.api, o.row.id, 100000)).response.status()).toBe(
    200,
  );
  let row = await current(o.row.id);
  expect(row.lateReviewRequired).toBe(true);
  expect(row.status).toBe("RESERVATION_EXPIRED");
  const other = await buyerAccount();
  const c = await checkout(other, f.variants[0].id, 10);
  expect(
    (await orderAction(owner.api, o.row.id, "RESOLVE_LATE")).status(),
  ).toBe(422);
  await orderAction(other.api, c.row.id, "CANCEL", false);
  expect(
    (await orderAction(owner.api, o.row.id, "RESOLVE_LATE")).status(),
  ).toBe(200);
  row = await current(o.row.id);
  expect(row.status).toBe("READY_FOR_DISPATCH");
  expect(row.reservations[0].status).toBe("ACTIVE");
  expect(await balance(f.variants[0].id)).toMatchObject({ available: 10 });
  await other.api.dispose();
});
test("near-expiry proof flags review and cannot silently become ready after verification", async () => {
  await setupSettings(owner.api, { lateReviewMinutes: 60 });
  const o = await checkout(b, f.variants[0].id);
  await upload(b.api, o.row.id);
  await verify(owner.api, o.row.id, 10000);
  expect((await current(o.row.id)).status).toBe("ADMIN_REVIEW");
  expect(
    (await orderAction(owner.api, o.row.id, "RESOLVE_LATE")).status(),
  ).toBe(200);
  expect((await current(o.row.id)).status).toBe("READY_FOR_DISPATCH");
});
test("paid cancellation flags refund decision; manual refund is recorded exactly once", async () => {
  const o = await checkout(b, f.variants[0].id);
  await upload(b.api, o.row.id);
  await verify(owner.api, o.row.id, 10000);
  expect((await orderAction(b.api, o.row.id, "CANCEL", false)).status()).toBe(
    422,
  );
  expect((await orderAction(owner.api, o.row.id, "CANCEL")).status()).toBe(200);
  let row = await current(o.row.id);
  expect(row).toMatchObject({
    status: "CANCELLED",
    paymentStatus: "PAID",
    refundDecisionRequired: true,
  });
  const data = {
    requestId: randomUUID(),
    method: "BANK",
    amountPaise: 10000,
    bankReference: `REFUND${randomUUID()}`,
    checkedBankRecord: true,
    reason: "QA completed refund",
    internalNotes: "Actual external refund checked",
  };
  const rs = await Promise.all(
    [1, 2].map(() => owner.api.post(`${sales}/refunds/${o.row.id}`, { data })),
  );
  expect(rs.map((r) => r.status())).toEqual([200, 200]);
  row = await current(o.row.id);
  expect(row).toMatchObject({
    status: "CANCELLED",
    verifiedPaise: 0,
    refundDecisionRequired: false,
  });
  expect(row.payments).toHaveLength(2);
});
test("reserved stock cannot be damaged, removed or consumed in Phase 5", async () => {
  const o = await checkout(b, f.variants[0].id, 10);
  const lot = await db.stockLot.findFirstOrThrow({
    where: { variantId: f.variants[0].id },
  });
  expect(
    (
      await adjustment(owner.api, f.variants[0].id, 1, "DAMAGE", lot.id)
    ).status(),
  ).toBe(422);
  await expect(
    db.stockReservation.update({
      where: { id: o.row.reservations[0].id },
      data: {
        status: "CONSUMED",
        version: { increment: 1 },
        reason: "QA forbidden dispatch",
      },
    }),
  ).rejects.toThrow();
  expect(await balance(f.variants[0].id)).toMatchObject({ available: 10 });
  await expect(
    db.paymentRecord.updateMany({
      where: { orderId: o.row.id },
      data: { amountPaise: 1 },
    }),
  ).resolves.toMatchObject({ count: 0 });
});
test("admin search, filters, internal notes and customer history stay scoped", async () => {
  const o = await checkout(b, f.variants[0].id);
  await orderAction(owner.api, o.row.id, "NOTE");
  const result = await owner.api.get(
    `${sales}/orders?q=${o.row.number}&status=PENDING_PAYMENT&paymentStatus=UNPAID&from=2026-01-01&to=2027-12-31`,
  );
  expect(result.status()).toBe(200);
  expect(
    (await result.json()).data.orders.map((x: { id: string }) => x.id),
  ).toEqual([o.row.id]);
  const own = await b.api.get("/api/v1/me/orders");
  expect(
    (await own.json()).data.orders.map((x: { id: string }) => x.id),
  ).toEqual([o.row.id]);
  expect(JSON.stringify(await current(o.row.id))).not.toContain(
    "Private QA admin decision",
  );
});

test("simultaneous initial bank verification credits one immutable receipt", async () => {
  const o = await checkout(b, f.variants[0].id);
  await upload(b.api, o.row.id);
  const s = await db.paymentSubmission.findFirstOrThrow({
    where: { orderId: o.row.id },
  });
  const data = {
    action: "VERIFY",
    version: s.version,
    reason: "QA simultaneous bank review",
    internalNotes: "QA bank reference independently checked",
    checkedBankRecord: true,
    duplicateReviewed: true,
    amountPaise: 10000,
    bankReference: `SIM${randomUUID()}`,
    requestId: randomUUID(),
  };
  const rs = await Promise.all(
    [1, 2, 3].map(() => owner.api.post(`${sales}/payments/${s.id}`, { data })),
  );
  expect(rs.map((r) => r.status())).toEqual([200, 200, 200]);
  expect(await db.paymentRecord.count({ where: { orderId: o.row.id } })).toBe(
    1,
  );
  expect((await current(o.row.id)).verifiedPaise).toBe(10000);
});
test("historical snapshots, proof bytes, receipts and reservation history reject edits/deletion", async () => {
  const o = await checkout(b, f.variants[0].id);
  await upload(b.api, o.row.id);
  const v = await verify(owner.api, o.row.id, 10000);
  expect(v.response.status()).toBe(200);
  await expect(
    db.salesOrder.update({ where: { id: o.row.id }, data: { totalPaise: 1 } }),
  ).rejects.toThrow();
  await expect(
    db.salesOrderLine.update({
      where: { id: o.row.lines[0].id },
      data: { unitPricePaise: 1 },
    }),
  ).rejects.toThrow();
  await expect(
    db.paymentSubmission.update({
      where: { id: v.submission.id },
      data: { reference: "TAMPERED", version: { increment: 1 } },
    }),
  ).rejects.toThrow();
  const record = await db.paymentRecord.findFirstOrThrow({
    where: { orderId: o.row.id },
  });
  await expect(
    db.paymentRecord.update({
      where: { id: record.id },
      data: { amountPaise: 1 },
    }),
  ).rejects.toThrow();
  await expect(
    db.reservationEvent.deleteMany({
      where: { reservationId: o.row.reservations[0].id },
    }),
  ).rejects.toThrow();
  expect((await current(o.row.id)).totalPaise).toBe(10000);
});
test("GRN reversal cannot remove units already promised to a sales order", async () => {
  const p = await submitted(owner.api, f, 2);
  const g = await receive(owner.api, p, 2);
  const o = await checkout(b, f.variants[0].id, 12);
  expect(
    (await action(owner.api, "goods-receiving", g, "REVERSE")).status(),
  ).toBe(422);
  expect(await balance(f.variants[0].id)).toMatchObject({ available: 12 });
  expect((await current(o.row.id)).reservations[0].quantity).toBe(12);
  expect(
    (await db.goodsReceipt.findUniqueOrThrow({ where: { id: g.id } })).status,
  ).toBe("COMPLETED");
});
test("duplicate evidence explicitly requires admin acknowledgement before bank verification", async () => {
  const a = await checkout(b, f.variants[0].id);
  const other = await buyerAccount();
  const c = await checkout(other, f.variants[0].id);
  const buffer = await png();
  await upload(b.api, a.row.id, {}, buffer);
  await upload(other.api, c.row.id, {}, buffer);
  const r = await verify(owner.api, c.row.id, 10000, {
    duplicateReviewed: false,
  });
  expect(r.response.status()).toBe(422);
  expect(await db.paymentRecord.count({ where: { orderId: c.row.id } })).toBe(
    0,
  );
  await other.api.dispose();
});
test("post-review settings changes require checkout review again", async () => {
  await put(b.api, f.variants[0].id);
  const p = await review(b.api, b.address.id);
  await setupSettings(owner.api, { deliveryPaise: 100 });
  const r = await b.api.post("/api/v1/me/orders", {
    data: {
      requestId: randomUUID(),
      addressId: b.address.id,
      paymentMethod: "UPI",
      reviewToken: p.reviewToken,
    },
  });
  expect(r.status()).toBe(409);
  expect(
    await db.salesOrder.count({ where: { customerId: b.user.customer!.id } }),
  ).toBe(0);
});

test("verification waiting on stock locks rechecks an expiry crossed during the wait", async () => {
  const o = await checkout(b, f.variants[0].id);
  await upload(b.api, o.row.id);
  await db.stockReservation.update({
    where: { id: o.row.reservations[0].id },
    data: {
      expiresAt: new Date(Date.now() + 2000),
      version: { increment: 1 },
      reason: "QA imminent expiry",
    },
  });
  let pending: ReturnType<typeof verify> | undefined;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`stock:${f.variants[0].id}`},0))::text`;
    pending = verify(owner.api, o.row.id, 10000);
    await new Promise((resolve) => setTimeout(resolve, 2500));
  });
  const result = await pending!;
  expect(result.response.status(), await result.response.text()).toBe(200);
  const row = await current(o.row.id);
  expect(row.reservations[0].status).toBe("EXPIRED");
  expect(row.lateReviewRequired).toBe(true);
  expect(row.status).not.toBe("READY_FOR_DISPATCH");
  expect(row.verifiedPaise).toBe(10000);
});
