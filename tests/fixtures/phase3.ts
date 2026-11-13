import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
import { db, registered } from "./helpers";
import { seedQwik } from "../../src/modules/catalogue/qwik";
export const application = {
  businessName: "QA Dealer Business",
  contactName: "QA Applicant",
  phone: "9000000000",
  email: "dealer@example.invalid",
  address: "123 QA Street",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  postalCode: "201009",
  businessType: "Hardware retailer",
  gstin: null,
  expectedVolume: "100 packs per month",
  message: "Test business application",
};
export async function staff(role: "ADMIN" | "SUPER_ADMIN" = "SUPER_ADMIN") {
  const account = await registered();
  await db.user.update({ where: { id: account.user.id }, data: { role } });
  return account;
}
export async function qwikFixture() {
  const p = await seedQwik(db);
  await db.productVariant.updateMany({
    where: { productId: p.id },
    data: {
      active: true,
      published: true,
      contentApproved: true,
      sku: null,
      mrpPaise: null,
      mrpConfirmed: false,
    },
  });
  return db.product.findUniqueOrThrow({
    where: { id: p.id },
    include: {
      variants: { orderBy: { createdAt: "asc" } },
      images: { orderBy: { sortOrder: "asc" } },
    },
  });
}
export async function submitDealer(api: APIRequestContext) {
  const r = await api.post("/api/v1/me/dealer", { data: application });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()).data as { id: string; status: string };
}
export async function decide(
  api: APIRequestContext,
  id: string,
  status: string,
  version?: number,
) {
  const row = await db.dealerProfile.findUniqueOrThrow({ where: { id } });
  return api.patch(`/api/v1/admin/management/dealers/${id}`, {
    data: {
      status,
      version: version ?? row.version,
      reason: "QA business review decision",
    },
  });
}
export async function priceList(
  api: APIRequestContext,
  entries: { variantId?: string; productId?: string; amountPaise: number }[],
  active = true,
) {
  const r = await api.post("/api/v1/admin/management/price-lists", {
    data: {
      name: `QA list ${randomUUID()}`,
      active,
      entries,
      reason: "QA shared price setup",
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()).data;
}
export async function assign(
  api: APIRequestContext,
  category: "RETAIL" | "APPROVED_DEALER",
  priceListId: string | null,
) {
  const row = await db.categoryPriceList.findUniqueOrThrow({
    where: { category },
  });
  return api.post("/api/v1/admin/management/assignments", {
    data: {
      category,
      priceListId,
      version: row.version,
      reason: "QA category assignment",
    },
  });
}
