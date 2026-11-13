import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { expect, type APIRequestContext } from "@playwright/test";
import { db, registered, dummyAddress } from "./helpers";
import { fixture, adjustment } from "./phase4";
import { priceList, assign } from "./phase3";
export const sales = "/api/v1/admin/sales";
export const rules = {
  enabled: true,
  confirmed: true,
  reason: "QA explicit business rules only",
  upiId: "qa-only@example",
  holderName: "QA Fixture Account",
  bankName: "QA Fixture Bank",
  accountNumber: "123456789012",
  ifsc: "TEST0123456",
  branch: "QA branch",
  instructions: "Isolated QA data. Do not transfer real money.",
  taxBps: 0,
  taxMode: "EXCLUSIVE",
  deliveryPaise: 0,
  reservationMinutes: 60,
  lateReviewMinutes: 5,
  customerCancelUnpaid: true,
  adminCancelUnpaid: true,
  adminCancelPaid: true,
};
export async function setupSettings(api: APIRequestContext, extra = {}) {
  const row = await db.salesSettings.findUnique({ where: { id: "singleton" } });
  const r = await api.post(`${sales}/settings`, {
    data: { ...rules, version: row?.version ?? 0, ...extra },
  });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()).data;
}
export async function salesFixture(api: APIRequestContext, quantity = 10) {
  const f = await fixture(api);
  f.variants.sort((a, b) => parseInt(a.packSize) - parseInt(b.packSize));
  await db.product.update({
    where: { id: f.product.id },
    data: {
      published: true,
      contentApproved: true,
      approvalReference: "QA isolated fixture approval",
    },
  });
  await db.productVariant.updateMany({
    where: { productId: f.product.id },
    data: {
      published: true,
      contentApproved: true,
      approvalReference: "QA isolated fixture approval",
    },
  });
  const retail = await priceList(
    api,
    f.variants.map((v, i) => ({
      variantId: v.id,
      amountPaise: 10000 + i * 1000,
    })),
  );
  expect((await assign(api, "RETAIL", retail.id)).status()).toBe(200);
  const dealer = await priceList(
    api,
    f.variants.map((v, i) => ({
      variantId: v.id,
      amountPaise: 8000 + i * 1000,
    })),
  );
  expect((await assign(api, "APPROVED_DEALER", dealer.id)).status()).toBe(200);
  for (const v of f.variants) {
    const r = await adjustment(api, v.id, quantity);
    expect(r.status(), await r.text()).toBe(201);
  }
  await setupSettings(api);
  return { ...f, retail, dealer };
}
export async function buyerAccount() {
  const b = await registered();
  const a = await b.api.post("/api/v1/me/addresses", { data: dummyAddress });
  expect(a.status(), await a.text()).toBe(201);
  return { ...b, address: (await a.json()).data };
}
export async function put(
  api: APIRequestContext,
  variantId: string,
  quantity = 1,
) {
  const r = await api.patch("/api/v1/me/cart", {
    data: { variantId, quantity },
  });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()).data;
}
export async function review(
  api: APIRequestContext,
  addressId: string,
  paymentMethod = "UPI",
) {
  const r = await api.post("/api/v1/me/checkout/preview", {
    data: { addressId, paymentMethod },
  });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()).data;
}
export async function checkout(
  b: Awaited<ReturnType<typeof buyerAccount>>,
  variantId: string,
  quantity = 1,
) {
  await put(b.api, variantId, quantity);
  const p = await review(b.api, b.address.id);
  const data = {
    addressId: b.address.id,
    paymentMethod: "UPI",
    requestId: randomUUID(),
    reviewToken: p.reviewToken,
  };
  const r = await b.api.post("/api/v1/me/orders", { data });
  expect(r.status(), await r.text()).toBe(201);
  return { row: (await r.json()).data, data, preview: p };
}
export async function png() {
  return sharp({
    create: {
      width: 20,
      height: 20,
      channels: 3,
      background: {
        r: Math.floor(Math.random() * 256),
        g: Math.floor(Math.random() * 256),
        b: Math.floor(Math.random() * 256),
      },
    },
  })
    .png()
    .toBuffer();
}
export async function upload(
  api: APIRequestContext,
  orderId: string,
  extra: Record<string, string> = {},
  buffer?: Buffer,
) {
  return api.post(`/api/v1/me/orders/${orderId}/payments`, {
    multipart: {
      requestId: randomUUID(),
      method: "UPI",
      reference: `QA${randomUUID()}`,
      paidOn: new Date().toISOString().slice(0, 10),
      remarks: "QA proof",
      ...extra,
      file: {
        name: "proof.png",
        mimeType: "image/png",
        buffer: buffer ?? (await png()),
      },
    },
  });
}
export async function verify(
  api: APIRequestContext,
  orderId: string,
  amountPaise: number,
  extra = {},
) {
  const submission = await db.paymentSubmission.findFirstOrThrow({
    where: { orderId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
    orderBy: { createdAt: "desc" },
  });
  const data = {
    action: "VERIFY",
    version: submission.version,
    reason: "QA bank record checked",
    internalNotes: "QA actual bank transfer checked",
    checkedBankRecord: true,
    duplicateReviewed: true,
    amountPaise,
    bankReference: `BANK${randomUUID()}`,
    requestId: randomUUID(),
    ...extra,
  };
  return {
    response: await api.post(`${sales}/payments/${submission.id}`, { data }),
    data,
    submission,
  };
}
export async function orderAction(
  api: APIRequestContext,
  id: string,
  action: string,
  admin = true,
) {
  const row = await db.salesOrder.findUniqueOrThrow({ where: { id } });
  return api.post(`${admin ? sales : "/api/v1/me"}/orders/${id}`, {
    data: {
      action,
      version: row.version,
      reason: "QA explicit order resolution",
      internalNotes: admin ? "Private QA admin decision" : "",
    },
  });
}
