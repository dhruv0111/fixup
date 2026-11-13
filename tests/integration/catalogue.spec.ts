import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { context, db, registered } from "../fixtures/helpers";
import {
  catalogueFixture,
  enquiryData,
  formToken,
} from "../fixtures/catalogue";
let fixture: Awaited<ReturnType<typeof catalogueFixture>>;
test.beforeAll(async () => {
  fixture = await catalogueFixture();
});
test.afterAll(async () => {
  await db.$disconnect();
});

test("catalogue searches, filters and paginates database products", async () => {
  const api = await context();
  const first = await (
    await api.get(`/api/v1/catalogue?category=${fixture.category.slug}`)
  ).json();
  expect(first.data.total).toBe(14);
  expect(first.data.products).toHaveLength(12);
  const second = await (
    await api.get(`/api/v1/catalogue?category=${fixture.category.slug}&page=2`)
  ).json();
  expect(second.data.products).toHaveLength(2);
  const search = await (
    await api.get(`/api/v1/catalogue?q=${fixture.products[3].sku}`)
  ).json();
  expect(search.data.products).toHaveLength(1);
  expect((await api.get("/api/v1/catalogue?page=0")).status()).toBe(422);
  await api.dispose();
});
test("unpublished, inactive, unapproved and inactive-category products are private", async () => {
  const api = await context();
  expect(
    (await api.get(`/api/v1/catalogue/${fixture.hidden.slug}`)).status(),
  ).toBe(404);
  for (const change of [
    { active: false },
    { contentApproved: false },
    { published: false },
  ]) {
    await db.product.update({
      where: { id: fixture.products[13].id },
      data: change,
    });
    expect(
      (
        await api.get(`/api/v1/catalogue/${fixture.products[13].slug}`)
      ).status(),
    ).toBe(404);
    await db.product.update({
      where: { id: fixture.products[13].id },
      data: { active: true, contentApproved: true, published: true },
    });
  }
  await db.category.update({
    where: { id: fixture.category.id },
    data: { active: false },
  });
  expect(
    (await api.get(`/api/v1/catalogue/${fixture.products[0].slug}`)).status(),
  ).toBe(404);
  await db.category.update({
    where: { id: fixture.category.id },
    data: { active: true },
  });
  await api.dispose();
});
test("public product response excludes private documents and internal fields", async () => {
  await db.productDocument.create({
    data: {
      productId: fixture.products[0].id,
      title: "Private QA",
      kind: "SDS",
      privateReference: "private/secret-qa.pdf",
    },
  });
  const api = await context();
  const response = await api.get(
    `/api/v1/catalogue/${fixture.products[0].slug}`,
  );
  const text = await response.text();
  expect(response.status()).toBe(200);
  expect(text).not.toContain("private/secret");
  expect(text).not.toContain("privateReference");
  expect(text).not.toContain("approvalReference");
  expect((await response.json()).data.documents).toEqual([]);
  expect((await api.get("/private/secret-qa.pdf")).status()).toBe(404);
  await api.dispose();
});
for (const kind of ["CONTACT", "DEALER", "BULK"])
  test(`${kind} submission persists with a private response and audit`, async () => {
    const api = await context();
    const data = enquiryData(kind, {
      businessName: "QA business",
      email: "qa@example.invalid",
      address: "QA address",
      city: "QA city",
      postalCode: "400001",
      businessType: "Hardware shop",
      quantity: "10 demo packs",
      location: "QA location",
      productId: fixture.products[0].id,
    });
    const response = await api.post("/api/v1/enquiries", { data });
    expect(response.status(), await response.text()).toBe(200);
    expect(await response.json()).toEqual({ data: { received: true } });
    const row = await db.enquiry.findUniqueOrThrow({
      where: { requestId: data.requestId },
    });
    expect(row.kind).toBe(kind);
    expect(
      await db.auditLog.count({
        where: { entityId: row.id, action: "ENQUIRY_RECEIVED" },
      }),
    ).toBe(1);
    await api.dispose();
  });
test("concurrent retries and equivalent submissions save once; changed ID reuse conflicts", async () => {
  const api = await context();
  const data = enquiryData();
  const responses = await Promise.all([
    api.post("/api/v1/enquiries", { data }),
    api.post("/api/v1/enquiries", { data }),
  ]);
  expect(responses.map((r) => r.status())).toEqual([200, 200]);
  expect(
    (
      await api.post("/api/v1/enquiries", {
        data: { ...data, requestId: randomUUID() },
      })
    ).status(),
  ).toBe(200);
  expect(await db.enquiry.count({ where: { message: data.message } })).toBe(1);
  expect(
    (
      await api.post("/api/v1/enquiries", {
        data: { ...data, message: "Different request" },
      })
    ).status(),
  ).toBe(409);
  await api.dispose();
});
test("invalid payloads, spam traps, forged and expired tokens cannot create enquiries", async () => {
  for (const extra of [
    { phone: "bad" },
    { website: "spam" },
    { token: "forged" },
    { token: formToken(4000000) },
    { token: formToken(0) },
    { consent: false },
    { message: "<script>alert(1)</script>" },
    { productId: fixture.hidden.id },
  ]) {
    const api = await context();
    const data = enquiryData("CONTACT", extra);
    expect((await api.post("/api/v1/enquiries", { data })).status()).toBe(422);
    expect(
      await db.enquiry.findUnique({ where: { requestId: data.requestId } }),
    ).toBeNull();
    await api.dispose();
  }
});
test("enquiry rate limit persists and cannot be bypassed with internal IP header", async () => {
  const api = await context();
  for (let i = 0; i < 5; i++)
    expect(
      (
        await api.post("/api/v1/enquiries", {
          data: enquiryData(),
          headers: { "x-fixup-client-ip": `1.2.3.${i}` },
        })
      ).status(),
    ).toBe(200);
  expect(
    (
      await api.post("/api/v1/enquiries", {
        data: enquiryData(),
        headers: { "x-fixup-client-ip": "5.6.7.8" },
      })
    ).status(),
  ).toBe(429);
  await api.dispose();
});
test("content and personal enquiries require current permissions and same origin", async () => {
  const anonymous = await context();
  expect((await anonymous.get("/api/v1/admin/content/products")).status()).toBe(
    401,
  );
  expect((await anonymous.get("/api/v1/admin/enquiries")).status()).toBe(401);
  const { api, user } = await registered();
  expect((await api.get("/api/v1/admin/content/products")).status()).toBe(403);
  await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  expect((await api.get("/api/v1/admin/enquiries")).status()).toBe(200);
  expect(
    (await api.post("/api/v1/admin/content/faqs", { data: {} })).status(),
  ).toBe(403);
  await db.user.update({
    where: { id: user.id },
    data: { role: "SUPER_ADMIN" },
  });
  const faq = {
    data: {
      question: "QA owner question?",
      answer: "QA owner answer.",
      published: true,
    },
    reason: "QA content editing",
  };
  expect(
    (
      await api.post("/api/v1/admin/content/faqs", {
        data: faq,
        headers: { Origin: "https://evil.invalid" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await api.post("/api/v1/admin/content/faqs", { data: faq })).status(),
  ).toBe(200);
  expect((await api.get("/api/v1/admin/content/missing")).status()).toBe(404);
  await api.dispose();
  await anonymous.dispose();
});
test("enquiry endpoint rejects cross-origin and oversized bodies", async () => {
  const api = await context();
  expect(
    (
      await api.post("/api/v1/enquiries", {
        data: enquiryData(),
        headers: { Origin: "https://evil.invalid" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await api.post("/api/v1/enquiries", {
        data: enquiryData("CONTACT", { message: "x".repeat(17000) }),
      })
    ).status(),
  ).toBe(413);
  await api.dispose();
});

test("owner can manage catalogue and draft policies without exposing unapproved content", async () => {
  const { api, user } = await registered();
  await db.user.update({
    where: { id: user.id },
    data: { role: "SUPER_ADMIN" },
  });
  const category = await api.post("/api/v1/admin/content/categories", {
    data: {
      data: { name: "QA managed category", slug: `managed-${randomUUID()}` },
      reason: "QA catalogue publishing",
    },
  });
  expect(category.status()).toBe(200);
  const values = {
    name: "QA managed product",
    slug: `managed-${randomUUID()}`,
    sku: `QA-${randomUUID()}`,
    brand: "QA fixture",
    packSize: "QA pack",
    summary: "QA publication fixture",
    description: "QA test data only",
    categoryId: (await category.json()).data.id,
    published: true,
  };
  expect(
    (
      await api.post("/api/v1/admin/content/products", {
        data: { data: values, reason: "QA missing approval" },
      })
    ).status(),
  ).toBe(422);
  const product = await api.post("/api/v1/admin/content/products", {
    data: {
      data: {
        ...values,
        contentApproved: true,
        approvalReference: "QA fixture approval",
      },
      reason: "QA approved fixture",
    },
  });
  expect(product.status()).toBe(200);
  expect((await api.get(`/api/v1/catalogue/${values.slug}`)).status()).toBe(
    200,
  );
  expect(
    (
      await api.post("/api/v1/admin/content/policies", {
        data: {
          id: "shipping",
          data: {
            title: "Shipping Policy",
            body: "QA draft shipping content pending review.",
            approved: false,
          },
          reason: "QA draft policy",
        },
      })
    ).status(),
  ).toBe(200);
  const policy = await db.policy.findUniqueOrThrow({
    where: { id: "shipping" },
  });
  expect(policy.approved).toBe(false);
  await api.dispose();
});

test("production catalogue suppresses development demo data", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/check-public-catalogue.ts",
    ],
    {
      env: {
        ...process.env,
        APP_ENV: "production",
        BETTER_AUTH_URL: "https://127.0.0.1:3443",
        MAIL_MODE: "smtp",
        SMTP_HOST: "127.0.0.1",
      },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  expect(result.status, result.stdout || "Catalogue probe failed").toBe(0);
});
