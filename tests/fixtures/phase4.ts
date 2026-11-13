import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
import { db } from "./helpers";
export const root = "/api/v1/admin/operations";
export const supplierData = (name = `QA Supplier ${randomUUID()}`) => ({
  name,
  contactName: "QA Contact",
  phone: "9000000000",
  email: "supplier@example.invalid",
  address: "123 QA Supplier Street",
  city: "QA City",
  state: "QA State",
  postalCode: "201009",
  gstin: null,
  supplierType: "Manufacturer",
  paymentTerms: "QA test terms only",
  notes: "Isolated test data",
  status: "ACTIVE",
  variantIds: [],
  reason: "QA supplier setup",
});
export async function fixture(api: APIRequestContext) {
  const key = randomUUID();
  const category = await db.category.create({
    data: { name: `QA Stock ${key}`, slug: `qa-stock-${key}`, isDemo: true },
  });
  const product = await db.product.create({
    data: {
      name: `QA QWIK stock ${key}`,
      slug: `qa-stock-product-${key}`,
      brand: "QA",
      packSize: "8g / 20g / 40g / 50g",
      summary: "QA isolated stock fixture",
      description: "Not real commercial inventory",
      categoryId: category.id,
      isDemo: true,
      variants: {
        create: ["8g", "20g", "40g", "50g"].map((packSize) => ({
          name: `QA ${packSize}`,
          packSize,
        })),
      },
    },
    include: { variants: { orderBy: { createdAt: "asc" } } },
  });
  const values = {
    ...supplierData(),
    variantIds: product.variants.map((v) => v.id),
  };
  const r = await api.post(`${root}/suppliers`, { data: values });
  expect(r.status(), await r.text()).toBe(201);
  return {
    product,
    variants: product.variants,
    supplier: (await r.json()).data,
    values,
  };
}
export async function po(
  api: APIRequestContext,
  f: Awaited<ReturnType<typeof fixture>>,
  quantity = 10,
  all = false,
) {
  const data = {
    requestId: randomUUID(),
    supplierId: f.supplier.id,
    notes: "QA purchase",
    lines: (all ? f.variants : [f.variants[0]]).map((v) => ({
      variantId: v.id,
      quantity,
      ratePaise: 10000,
      taxBps: 0,
      discountPaise: 0,
    })),
    reason: "QA purchase order",
  };
  const r = await api.post(`${root}/purchase-orders`, { data });
  expect(r.status(), await r.text()).toBe(201);
  return { row: (await r.json()).data, data };
}
export async function action(
  api: APIRequestContext,
  resource: string,
  row: { id: string; version: number },
  name: string,
) {
  return api.post(`${root}/${resource}/${row.id}`, {
    data: {
      action: name,
      version: row.version,
      reason: `QA ${name.toLowerCase()} operation`,
      confirmed: true,
    },
  });
}
export async function submitted(
  api: APIRequestContext,
  f: Awaited<ReturnType<typeof fixture>>,
  quantity = 10,
  all = false,
) {
  const p = await po(api, f, quantity, all);
  const r = await action(api, "purchase-orders", p.row, "SUBMIT");
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()).data;
}
export async function grn(
  api: APIRequestContext,
  p: { id: string; lines: { id: string }[] },
  quantity = 5,
  all = false,
  extra = {},
) {
  const data = {
    requestId: randomUUID(),
    purchaseOrderId: p.id,
    invoiceReference: "QA invoice",
    notes: "QA receiving",
    lines: (all ? p.lines : [p.lines[0]]).map((l) => ({
      purchaseLineId: l.id,
      quantity,
      batchNumber: "QA-BATCH",
      manufacturedAt: "2026-01-01",
      expiresAt: "2027-01-01",
      ...extra,
    })),
    reason: "QA actual receipt",
  };
  const r = await api.post(`${root}/goods-receiving`, { data });
  expect(r.status(), await r.text()).toBe(201);
  return { row: (await r.json()).data, data };
}
export async function receive(
  api: APIRequestContext,
  p: { id: string; lines: { id: string }[] },
  quantity = 5,
  all = false,
) {
  const g = await grn(api, p, quantity, all);
  const r = await action(api, "goods-receiving", g.row, "CONFIRM");
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()).data;
}
export async function balance(variantId: string) {
  const a = await db.stockMovement.aggregate({
    where: { variantId },
    _sum: { availableDelta: true, damagedDelta: true },
  });
  return {
    available: a._sum.availableDelta ?? 0,
    damaged: a._sum.damagedDelta ?? 0,
  };
}
export async function adjustment(
  api: APIRequestContext,
  variantId: string,
  quantity: number,
  kind = "OPENING",
  lotId: string | null = null,
  extra = {},
) {
  return api.post(`${root}/stock-adjustments`, {
    data: {
      requestId: randomUUID(),
      variantId,
      quantity,
      kind,
      lotId,
      reason: "QA stock operation",
      confirmed: true,
      ...extra,
    },
  });
}
