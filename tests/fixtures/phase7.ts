import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
import { db } from "./helpers";
import { fixture, root, action as inventoryAction, receive } from "./phase4";
import { priceList, assign } from "./phase3";
import {
  setupSettings,
  buyerAccount,
  checkout,
  upload,
  verify,
} from "./phase5";
import { confirmed } from "./phase6";
export const reports = "/api/v1/admin/reports";
export function amount(
  report: { summary: { key: string; value: number | null }[] },
  key: string,
) {
  return report.summary.find((m) => m.key === key)!.value;
}
export async function report(
  api: APIRequestContext,
  kind: string,
  query: Record<string, string> = {},
) {
  const r = await api.get(
    `${reports}/${kind}?${new URLSearchParams({ preset: "month", ...query })}`,
  );
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()).data;
}
export async function knownCostScenario(
  api: APIRequestContext,
  {
    dispatch = true,
    quantity = 2,
    taxMode = "EXCLUSIVE",
    taxBps = 0,
    discount = 10000,
    purchaseRate = 6000,
  } = {},
) {
  const f = await fixture(api);
  f.variants.sort((a, b) => parseInt(a.packSize) - parseInt(b.packSize));
  await db.product.update({
    where: { id: f.product.id },
    data: {
      published: true,
      contentApproved: true,
      approvalReference: "QA approved basic catalogue",
    },
  });
  await db.productVariant.updateMany({
    where: { productId: f.product.id },
    data: {
      published: true,
      contentApproved: true,
      approvalReference: "QA approved pack sizes",
    },
  });
  const p = await api.post(`${root}/purchase-orders`, {
    data: {
      requestId: randomUUID(),
      supplierId: f.supplier.id,
      notes: "QA costing fixture",
      reason: "Actual QA supplier purchase",
      lines: f.variants.map((v) => ({
        variantId: v.id,
        quantity: 10,
        ratePaise: purchaseRate,
        taxBps: 1800,
        discountPaise: discount,
      })),
    },
  });
  expect(p.status(), await p.text()).toBe(201);
  const po = (await p.json()).data;
  const submitted = await inventoryAction(api, "purchase-orders", po, "SUBMIT");
  expect(submitted.status()).toBe(200);
  const received = await receive(api, (await submitted.json()).data, 10, true);
  const prices = await priceList(
    api,
    f.variants.map((v) => ({ variantId: v.id, amountPaise: 10000 })),
  );
  expect((await assign(api, "RETAIL", prices.id)).status()).toBe(200);
  expect((await assign(api, "APPROVED_DEALER", prices.id)).status()).toBe(200);
  await setupSettings(api, { taxBps, taxMode });
  const b = await buyerAccount();
  const o = await checkout(b, f.variants[0].id, quantity);
  expect((await upload(b.api, o.row.id)).status()).toBe(201);
  const v = await verify(api, o.row.id, o.row.totalPaise);
  expect(v.response.status(), await v.response.text()).toBe(200);
  const d = dispatch ? await confirmed(api, o.row.id) : null;
  return { f, b, o, d, po, received };
}
export function expenseData(extra: Record<string, unknown> = {}) {
  return {
    requestId: randomUUID(),
    reason: "QA actual business expense",
    data: {
      title: `QA expense ${randomUUID()}`,
      category: "PACKAGING",
      amountPaise: 2500,
      expenseDate: new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      }),
      paymentMethod: "CASH",
      reference: "QA receipt",
      description: "QA recorded packaging",
      ...extra,
    },
  };
}
export async function expense(
  api: APIRequestContext,
  extra: Record<string, unknown> = {},
) {
  const data = expenseData(extra);
  const r = await api.post("/api/v1/admin/expenses", { data });
  expect(r.status(), await r.text()).toBe(201);
  return { row: (await r.json()).data, data };
}
