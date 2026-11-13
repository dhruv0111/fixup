import { test, expect } from "@playwright/test";
import { context, db, registered, dummyAddress } from "../fixtures/helpers";
import {
  application,
  staff,
  qwikFixture,
  submitDealer,
  decide,
  priceList,
  assign,
} from "../fixtures/phase3";
import {
  qwikPackaging,
  qwikShowcase,
} from "../../src/modules/catalogue/assets";
let owner: Awaited<ReturnType<typeof staff>>;
let product: Awaited<ReturnType<typeof qwikFixture>>;
test.beforeAll(async () => {
  owner = await staff();
  product = await qwikFixture();
});
test.afterAll(async () => {
  await owner.api.dispose();
  await db.$disconnect();
});

test("QWIK is one parent with four sizes, supplied assets and no invented commercial data", async () => {
  const api = await context();
  const r = await api.get(`/api/v1/catalogue/${product.slug}`);
  expect(r.status()).toBe(200);
  const { data } = await r.json();
  expect(
    data.variants.map((v: { packSize: string }) => v.packSize).sort(),
  ).toEqual(["20g", "40g", "50g", "8g"]);
  expect(data.images.map((i: { url: string }) => i.url)).toEqual([
    qwikShowcase,
    qwikPackaging,
  ]);
  for (const v of data.variants) {
    expect(v.sku).toBeNull();
    expect(v.mrpPaise).toBeNull();
    expect(v.imageUrl).toBe(qwikPackaging);
    expect(v.representative).toBe(v.packSize !== "50g");
  }
  expect(
    product.variants.find((v) => v.packSize === "50g")?.mrpReferencePaise,
  ).toBe(17500);
  expect(await r.text()).not.toMatch(
    /mrpReference|approvalReference|priceList|amountPaise|customerId|privateReference/,
  );
  expect(data.applications).toEqual([]);
  expect(data.specifications).toEqual([]);
  await api.dispose();
});
test("customer edits name/contact and cannot promote or recategorize their account", async () => {
  const a = await registered();
  expect(
    (
      await a.api.patch("/api/v1/me", {
        data: {
          name: "Edited Customer",
          phone: "9111111111",
          businessName: "Edited business",
        },
      })
    ).status(),
  ).toBe(200);
  const me = (await (await a.api.get("/api/v1/me")).json()).data;
  expect(me.user.name).toBe("Edited Customer");
  expect(me.customer.phone).toBe("9111111111");
  for (const extra of [
    { role: "ADMIN" },
    { category: "APPROVED_DEALER" },
    { priceListId: "x" },
    { active: true },
  ])
    expect((await a.api.patch("/api/v1/me", { data: extra })).status()).toBe(
      422,
    );
  await a.api.dispose();
});
test("multiple addresses support edit and delete with ownership isolation", async () => {
  const a = await registered(),
    b = await registered();
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    const r = await a.api.post("/api/v1/me/addresses", {
      data: { ...dummyAddress, line1: `${i + 1} QA Road` },
    });
    expect(r.status()).toBe(201);
    ids.push((await r.json()).data.id);
  }
  for (const method of ["get", "patch", "delete"] as const) {
    const r = await b.api[method](
      `/api/v1/me/addresses/${ids[0]}`,
      method === "get" ? {} : { data: dummyAddress },
    );
    expect(r.status()).toBe(404);
  }
  expect(
    (
      await a.api.patch(`/api/v1/me/addresses/${ids[0]}`, {
        data: { ...dummyAddress, city: "Updated City" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await a.api.delete(`/api/v1/me/addresses/${ids[0]}`, { data: {} })
    ).status(),
  ).toBe(200);
  expect((await a.api.get(`/api/v1/me/addresses/${ids[0]}`)).status()).toBe(
    404,
  );
  expect(
    await db.address.count({ where: { customerId: a.user.customer!.id } }),
  ).toBe(1);
  expect(
    await db.auditLog.count({
      where: { entityId: ids[0], action: "ADDRESS_DELETED" },
    }),
  ).toBe(1);
  await a.api.dispose();
  await b.api.dispose();
});
test("account suspension revokes sessions; reactivation allows a fresh sign-in", async () => {
  const a = await registered();
  const path = `/api/v1/admin/management/customers/${a.user.customer!.id}`;
  expect(
    (
      await owner.api.patch(path, {
        data: { active: false, version: 0, reason: "QA suspension" },
      })
    ).status(),
  ).toBe(200);
  expect(await db.session.count({ where: { userId: a.user.id } })).toBe(0);
  expect((await a.api.get("/api/v1/me")).status()).toBe(401);
  expect(
    (
      await a.api.post("/api/auth/sign-in/email", { data: a.credentials })
    ).status(),
  ).not.toBe(200);
  expect(
    (
      await owner.api.patch(path, {
        data: { active: true, version: 1, reason: "QA reactivation" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await a.api.post("/api/auth/sign-in/email", { data: a.credentials })
    ).status(),
  ).toBe(200);
  expect((await a.api.get("/api/v1/me")).status()).toBe(200);
  expect(
    await db.auditLog.count({
      where: { entityId: a.user.id, action: "ACCOUNT_STATUS_CHANGED" },
    }),
  ).toBe(2);
  await a.api.dispose();
});
test("concurrent account status changes allow one revision and reject stale writes", async () => {
  const a = await registered();
  const path = `/api/v1/admin/management/customers/${a.user.customer!.id}`;
  const responses = await Promise.all(
    [false, true].map((active) =>
      owner.api.patch(path, {
        data: { active, version: 0, reason: "Concurrent QA change" },
      }),
    ),
  );
  expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
  await a.api.dispose();
});
test("dealer application collects complete data; identical concurrent retries save once", async () => {
  const a = await registered();
  const rs = await Promise.all([
    a.api.post("/api/v1/me/dealer", { data: application }),
    a.api.post("/api/v1/me/dealer", { data: application }),
  ]);
  expect(rs.map((r) => r.status())).toEqual([200, 200]);
  const id = (await rs[0].json()).data.id;
  expect(
    await db.dealerProfile.count({
      where: { customerId: a.user.customer!.id },
    }),
  ).toBe(1);
  expect(
    await db.auditLog.count({
      where: { entityId: id, action: "DEALER_APPLIED" },
    }),
  ).toBe(1);
  expect(
    (
      await a.api.post("/api/v1/me/dealer", {
        data: { ...application, state: "Other State" },
      })
    ).status(),
  ).toBe(409);
  const own = (await (await a.api.get("/api/v1/me/dealer")).json()).data;
  expect(own.state).toBe(application.state);
  expect(own.status).toBe("PENDING");
  expect(own.reviewedById).toBeUndefined();
  await a.api.dispose();
});
test("dealer self-approval and malformed or incomplete application data are rejected", async () => {
  const a = await registered();
  for (const extra of [
    { status: "APPROVED" },
    { category: "APPROVED_DEALER" },
    { state: "" },
    { gstin: "bad" },
    { phone: "invalid" },
    { priceListId: "x" },
  ])
    expect(
      (
        await a.api.post("/api/v1/me/dealer", {
          data: { ...application, ...extra },
        })
      ).status(),
    ).toBe(422);
  expect(
    await db.dealerProfile.count({
      where: { customerId: a.user.customer!.id },
    }),
  ).toBe(0);
  await a.api.dispose();
});
test("dealer lifecycle enforces pending, rejected, approved and suspended permissions", async () => {
  const a = await registered();
  const d = await submitDealer(a.api);
  expect((await a.api.get("/api/v1/dealer/access")).status()).toBe(403);
  expect((await decide(owner.api, d.id, "REJECTED")).status()).toBe(200);
  expect((await a.api.get("/api/v1/dealer/access")).status()).toBe(403);
  expect((await a.api.get("/api/v1/me/dealer")).status()).toBe(200);
  await submitDealer(a.api);
  expect((await decide(owner.api, d.id, "APPROVED")).status()).toBe(200);
  expect((await a.api.get("/api/v1/dealer/access")).status()).toBe(200);
  expect((await decide(owner.api, d.id, "SUSPENDED")).status()).toBe(200);
  expect((await a.api.get("/api/v1/dealer/access")).status()).toBe(403);
  expect(
    (await a.api.post("/api/v1/me/dealer", { data: application })).status(),
  ).toBe(409);
  expect((await decide(owner.api, d.id, "APPROVED")).status()).toBe(200);
  expect((await a.api.get("/api/v1/dealer/access")).status()).toBe(200);
  expect(
    await db.auditLog.count({
      where: { entityId: d.id, action: "DEALER_STATUS_CHANGED" },
    }),
  ).toBe(4);
  await a.api.dispose();
});
test("concurrent approval/rejection is atomic and only one decision wins", async () => {
  const a = await registered();
  const d = await submitDealer(a.api);
  const rs = await Promise.all([
    decide(owner.api, d.id, "APPROVED", 0),
    decide(owner.api, d.id, "REJECTED", 0),
  ]);
  expect(rs.map((r) => r.status()).sort()).toEqual([200, 409]);
  const current = await db.customer.findUniqueOrThrow({
    where: { id: a.user.customer!.id },
    include: { dealer: true, user: true },
  });
  expect(current.category).toBe(
    current.dealer!.status === "APPROVED" ? "APPROVED_DEALER" : "RETAIL",
  );
  expect(await db.managementEvent.count({ where: { entityId: d.id } })).toBe(2);
  await a.api.dispose();
});
test("rejection requires a reason and suspended customer accounts cannot be approved", async () => {
  const a = await registered();
  const d = await submitDealer(a.api);
  expect(
    (
      await owner.api.patch(`/api/v1/admin/management/dealers/${d.id}`, {
        data: { status: "REJECTED", version: 0, reason: "" },
      })
    ).status(),
  ).toBe(422);
  await owner.api.patch(
    `/api/v1/admin/management/customers/${a.user.customer!.id}`,
    { data: { active: false, version: 0, reason: "QA suspension" } },
  );
  expect((await decide(owner.api, d.id, "APPROVED")).status()).toBe(409);
  await a.api.dispose();
});
test("customer/dealer admin records and price configuration are isolated from other users", async () => {
  const a = await registered(),
    b = await registered();
  const dealer = await submitDealer(a.api);
  const anonymous = await context();
  for (const path of [
    "customers",
    "dealers",
    "price-lists",
    `customers/${a.user.customer!.id}`,
    `dealers/${dealer.id}`,
  ]) {
    expect((await b.api.get(`/api/v1/admin/management/${path}`)).status()).toBe(
      403,
    );
    expect(
      (await anonymous.get(`/api/v1/admin/management/${path}`)).status(),
    ).toBe(401);
  }
  expect((await (await b.api.get("/api/v1/me/dealer")).json()).data).toBeNull();
  expect(
    (
      await b.api.patch(`/api/v1/admin/management/dealers/${dealer.id}`, {
        data: { status: "APPROVED", version: 0, reason: "Self approval" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await b.api.post("/api/v1/admin/management/assignments", {
        data: {
          category: "APPROVED_DEALER",
          priceListId: null,
          version: 0,
          reason: "Self assignment",
        },
      })
    ).status(),
  ).toBe(403);
  await a.api.dispose();
  await b.api.dispose();
  await anonymous.dispose();
});
test("admin lists support search, status filtering and protected detail history", async () => {
  const a = await registered();
  const d = await submitDealer(a.api);
  const admin = await staff("ADMIN");
  for (const path of [
    `customers?q=${encodeURIComponent(a.credentials.email)}&status=ACTIVE`,
    "dealers?status=PENDING",
  ]) {
    const r = await admin.api.get(`/api/v1/admin/management/${path}`);
    expect(r.status()).toBe(200);
    expect((await r.json()).data.total).toBeGreaterThan(0);
  }
  const detail = await admin.api.get(
    `/api/v1/admin/management/dealers/${d.id}`,
  );
  expect(detail.status()).toBe(200);
  expect((await detail.json()).data.audit.length).toBeGreaterThan(0);
  expect(await detail.text()).not.toMatch(/password|accessToken|sessionId/);
  expect(
    (
      await admin.api.patch(
        `/api/v1/admin/management/customers/${owner.user.customer!.id}`,
        { data: { active: false, version: 0, reason: "Cannot suspend owner" } },
      )
    ).status(),
  ).toBe(404);
  await admin.api.dispose();
  await a.api.dispose();
});
test("shared retail prices differ per variant and server calculates exact totals", async () => {
  const a = await registered();
  const list = await priceList(
    owner.api,
    product.variants.map((v, i) => ({
      variantId: v.id,
      amountPaise: 10000 + i * 1000,
    })),
  );
  expect((await assign(owner.api, "RETAIL", list.id)).status()).toBe(200);
  const prices = (
    await (await a.api.get(`/api/v1/me/prices?productId=${product.id}`)).json()
  ).data;
  expect(
    prices.prices.map((p: { amountPaise: number }) => p.amountPaise).sort(),
  ).toEqual([10000, 11000, 12000, 13000]);
  const r = await a.api.post("/api/v1/me/price-quote", {
    data: { variantId: product.variants[2].id, quantity: 3 },
  });
  expect(r.status()).toBe(200);
  expect((await r.json()).data).toMatchObject({
    unitPricePaise: 12000,
    quantity: 3,
    totalPaise: 36000,
    category: "RETAIL",
    orderCreated: false,
    priceListVersion: 0,
  });
  await a.api.dispose();
});
test("pending, rejected and suspended dealers receive only retail pricing", async () => {
  const a = await registered();
  const d = await submitDealer(a.api);
  const variantId = product.variants[0].id;
  const retail = await priceList(owner.api, [
    { variantId, amountPaise: 10000 },
  ]);
  const dealer = await priceList(owner.api, [{ variantId, amountPaise: 7000 }]);
  await assign(owner.api, "RETAIL", retail.id);
  await assign(owner.api, "APPROVED_DEALER", dealer.id);
  async function check(category: string, amount: number) {
    const r = await a.api.post("/api/v1/me/price-quote", {
      data: { variantId, quantity: 1 },
    });
    expect(r.status()).toBe(200);
    const body = (await r.json()).data;
    expect(body.category).toBe(category);
    expect(body.unitPricePaise).toBe(amount);
  }
  await check("RETAIL", 10000);
  await decide(owner.api, d.id, "REJECTED");
  await check("RETAIL", 10000);
  await submitDealer(a.api);
  await decide(owner.api, d.id, "APPROVED");
  await check("APPROVED_DEALER", 7000);
  await decide(owner.api, d.id, "SUSPENDED");
  await check("RETAIL", 10000);
  await decide(owner.api, d.id, "APPROVED");
  await check("APPROVED_DEALER", 7000);
  await a.api.dispose();
});
test("frontend prices, categories and list IDs cannot alter resolved prices", async () => {
  const a = await registered();
  for (const extra of [
    { unitPricePaise: 1 },
    { amountPaise: 1 },
    { priceListId: "private" },
    { category: "APPROVED_DEALER" },
    { totalPaise: 1 },
    { quantity: -1 },
  ])
    expect(
      (
        await a.api.post("/api/v1/me/price-quote", {
          data: { variantId: product.variants[0].id, quantity: 1, ...extra },
        })
      ).status(),
    ).toBe(422);
  expect(
    (
      await a.api.get(
        `/api/v1/me/prices?productId=${product.id}&category=APPROVED_DEALER`,
      )
    ).status(),
  ).toBe(422);
  const response = await a.api.get(`/api/v1/me/prices?productId=${product.id}`);
  expect(await response.text()).not.toMatch(
    /cost|history|actorId|priceListId|approvalReference/i,
  );
  await a.api.dispose();
});
test("inactive and unassigned lists never yield a quote; missing prices do not fall back", async () => {
  const a = await registered();
  const list = await priceList(owner.api, [
    { variantId: product.variants[0].id, amountPaise: 11000 },
  ]);
  await assign(owner.api, "RETAIL", list.id);
  expect(
    (
      await a.api.post("/api/v1/me/price-quote", {
        data: { variantId: product.variants[1].id, quantity: 1 },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await owner.api.patch(`/api/v1/admin/management/price-lists/${list.id}`, {
        data: {
          name: list.name,
          active: false,
          version: 0,
          entries: [],
          reason: "Deactivate obsolete prices",
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await a.api.post("/api/v1/me/price-quote", {
        data: { variantId: product.variants[0].id, quantity: 1 },
      })
    ).status(),
  ).toBe(409);
  expect((await assign(owner.api, "APPROVED_DEALER", list.id)).status()).toBe(
    422,
  );
  await assign(owner.api, "RETAIL", null);
  expect(
    (
      await (
        await a.api.get(`/api/v1/me/prices?productId=${product.id}`)
      ).json()
    ).data.prices,
  ).toEqual([]);
  await a.api.dispose();
});
test("price-list edits and category assignments reject stale revisions and retain history", async () => {
  const list = await priceList(owner.api, [
    { variantId: product.variants[0].id, amountPaise: 10000 },
  ]);
  const input = {
    name: list.name,
    active: true,
    version: 0,
    entries: [{ variantId: product.variants[0].id, amountPaise: 12000 }],
    reason: "QA revised shared prices",
  };
  const rs = await Promise.all([
    owner.api.patch(`/api/v1/admin/management/price-lists/${list.id}`, {
      data: input,
    }),
    owner.api.patch(`/api/v1/admin/management/price-lists/${list.id}`, {
      data: input,
    }),
  ]);
  expect(rs.map((r) => r.status()).sort()).toEqual([200, 409]);
  const row = await db.categoryPriceList.findUniqueOrThrow({
    where: { category: "RETAIL" },
  });
  const ars = await Promise.all(
    [1, 2].map(() =>
      owner.api.post("/api/v1/admin/management/assignments", {
        data: {
          category: "RETAIL",
          priceListId: list.id,
          version: row.version,
          reason: "QA concurrent assignment",
        },
      }),
    ),
  );
  expect(ars.map((r) => r.status()).sort()).toEqual([200, 409]);
  expect(
    await db.managementEvent.count({
      where: { entityType: "PriceList", entityId: list.id },
    }),
  ).toBe(2);
  expect(
    (
      await owner.api.get(`/api/v1/admin/management/price-lists/${list.id}`)
    ).status(),
  ).toBe(200);
});
test("price list invalid/duplicate entries roll back and variant parents require variant prices", async () => {
  for (const entries of [
    [{ variantId: "missing", amountPaise: 100 }],
    [{ productId: product.id, amountPaise: 100 }],
    [
      { variantId: product.variants[0].id, amountPaise: 100 },
      { variantId: product.variants[0].id, amountPaise: 200 },
    ],
  ])
    expect(
      (
        await owner.api.post("/api/v1/admin/management/price-lists", {
          data: {
            name: "Invalid list",
            active: true,
            entries,
            reason: "QA invalid list",
          },
        })
      ).status(),
    ).toBe(422);
  expect(await db.priceList.count({ where: { name: "Invalid list" } })).toBe(0);
});
test("product-level pricing works for existing products without variants", async () => {
  const a = await registered();
  const parent = await db.product.create({
    data: {
      name: "QA single product",
      slug: `qa-single-${a.user.id.toLowerCase()}`,
      sku: null,
      brand: "QA",
      packSize: "one",
      summary: "QA only product",
      description: "QA only product",
      categoryId: product.categoryId,
      published: true,
      contentApproved: true,
    },
  });
  const list = await priceList(owner.api, [
    { productId: parent.id, amountPaise: 12550 },
  ]);
  await assign(owner.api, "RETAIL", list.id);
  const r = await a.api.post("/api/v1/me/price-quote", {
    data: { productId: parent.id, quantity: 2 },
  });
  expect(r.status()).toBe(200);
  expect((await r.json()).data.totalPaise).toBe(25100);
  await a.api.dispose();
});
test("variant admin changes SKU/MRP/publication with authorization and concurrency guards", async () => {
  const v = product.variants[0];
  const admin = await staff("ADMIN");
  const customer = await registered();
  const fields = {
    name: v.name,
    packSize: v.packSize,
    sku: v.sku,
    active: v.active,
    published: v.published,
    contentApproved: v.contentApproved,
    approvalReference: v.approvalReference,
    imageUrl: v.imageUrl,
    imageAlt: v.imageAlt,
    imageApproved: v.imageApproved,
    representative: v.representative,
    mrpPaise: v.mrpPaise,
    mrpConfirmed: v.mrpConfirmed,
    version: v.version,
  };
  const path = `/api/v1/admin/management/variants/${v.id}?productId=${product.id}`;
  const input = {
    ...fields,
    sku: `QA-SKU-${Date.now()}`,
    mrpPaise: 16000,
    mrpConfirmed: true,
    reason: "QA confirmed variant data",
  };
  expect((await admin.api.patch(path, { data: input })).status()).toBe(403);
  expect((await customer.api.patch(path, { data: input })).status()).toBe(403);
  expect(
    (
      await owner.api.patch(path, { data: { ...input, mrpConfirmed: false } })
    ).status(),
  ).toBe(422);
  expect((await owner.api.patch(path, { data: input })).status()).toBe(200);
  expect((await owner.api.patch(path, { data: input })).status()).toBe(409);
  const publicData = (
    await (await customer.api.get(`/api/v1/catalogue/${product.slug}`)).json()
  ).data.variants.find((x: { id: string }) => x.id === v.id);
  expect(publicData.sku).toBe(input.sku);
  expect(publicData.mrpPaise).toBe(16000);
  await db.productVariant.update({
    where: { id: v.id },
    data: { sku: null, mrpPaise: null, mrpConfirmed: false },
  });
  await admin.api.dispose();
  await customer.api.dispose();
});
test("inactive or unpublished variants and hidden parents cannot be priced or leaked", async () => {
  const a = await registered();
  const v = product.variants[1];
  const list = await priceList(owner.api, [
    { variantId: v.id, amountPaise: 10000 },
  ]);
  await assign(owner.api, "RETAIL", list.id);
  for (const data of [{ active: false }, { published: false }]) {
    await db.productVariant.update({ where: { id: v.id }, data });
    const body = (
      await (await a.api.get(`/api/v1/catalogue/${product.slug}`)).json()
    ).data;
    expect(body.variants.some((x: { id: string }) => x.id === v.id)).toBe(
      false,
    );
    expect(
      (
        await a.api.post("/api/v1/me/price-quote", {
          data: { variantId: v.id, quantity: 1 },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await (
          await a.api.get(`/api/v1/me/prices?productId=${product.id}`)
        ).json()
      ).data.prices.some((e: { variantId: string }) => e.variantId === v.id),
    ).toBe(false);
    await db.productVariant.update({
      where: { id: v.id },
      data: { active: true, published: true },
    });
  }
  await db.product.update({
    where: { id: product.id },
    data: { published: false },
  });
  expect(
    (await a.api.get(`/api/v1/me/prices?productId=${product.id}`)).status(),
  ).toBe(404);
  expect(
    (
      await a.api.post("/api/v1/me/price-quote", {
        data: { variantId: v.id, quantity: 1 },
      })
    ).status(),
  ).toBe(404);
  await db.product.update({
    where: { id: product.id },
    data: { published: true },
  });
  await a.api.dispose();
});
test("order history is an authenticated foundation and creates no orders", async () => {
  const api = await context();
  expect((await api.get("/api/v1/me/orders")).status()).toBe(401);
  const a = await registered();
  expect(
    (await (await a.api.get("/api/v1/me/orders")).json()).data,
  ).toMatchObject({ available: true, orders: [] });
  await api.dispose();
  await a.api.dispose();
});
test("new mutations enforce same-origin and never accept unauthenticated writes", async () => {
  const api = await context();
  for (const path of [
    "/api/v1/me/dealer",
    "/api/v1/me/price-quote",
    "/api/v1/admin/management/price-lists",
  ])
    expect((await api.post(path, { data: {} })).status()).toBe(401);
  expect(
    (
      await owner.api.post("/api/v1/admin/management/price-lists", {
        headers: { Origin: "https://evil.invalid" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await api.dispose();
});

test("database rejects confirmed MRP without an amount and invalid price targets", async () => {
  const v = product.variants[3];
  for (const data of [
    { mrpPaise: null, mrpConfirmed: true },
    { mrpPaise: 17500, mrpConfirmed: false },
    { mrpPaise: -1, mrpConfirmed: true },
  ]) {
    await expect(
      db.productVariant.update({ where: { id: v.id }, data }),
    ).rejects.toThrow();
  }
  const list = await priceList(owner.api, []);
  for (const data of [
    { priceListId: list.id, amountPaise: 100 },
    {
      priceListId: list.id,
      productId: product.id,
      variantId: v.id,
      amountPaise: 100,
    },
    { priceListId: list.id, variantId: v.id, amountPaise: 0 },
  ])
    await expect(db.priceEntry.create({ data })).rejects.toThrow();
});

test("adding variants hides legacy parent prices even while all variants are unpublished", async () => {
  const a = await registered();
  try {
    const parent = await db.product.create({
      data: {
        name: "QA converting product",
        slug: `qa-converting-${a.user.id.toLowerCase()}`,
        brand: "QA",
        packSize: "one",
        summary: "QA conversion fixture",
        description: "QA conversion fixture",
        categoryId: product.categoryId,
        published: true,
        contentApproved: true,
      },
    });
    const list = await priceList(owner.api, [
      { productId: parent.id, amountPaise: 5000 },
    ]);
    await assign(owner.api, "RETAIL", list.id);
    expect(
      (
        await (
          await a.api.get(`/api/v1/me/prices?productId=${parent.id}`)
        ).json()
      ).data.prices,
    ).toHaveLength(1);
    const variant = await db.productVariant.create({
      data: {
        productId: parent.id,
        name: "QA unpublished size",
        packSize: "QA",
      },
    });
    expect(
      (
        await (
          await a.api.get(`/api/v1/me/prices?productId=${parent.id}`)
        ).json()
      ).data.prices,
    ).toEqual([]);
    expect(
      (
        await a.api.post("/api/v1/me/price-quote", {
          data: { productId: parent.id, quantity: 1 },
        })
      ).status(),
    ).toBe(404);
    await db.productVariant.update({
      where: { id: variant.id },
      data: {
        published: true,
        contentApproved: true,
        approvalReference: "QA publication",
      },
    });
    expect(
      (
        await (
          await a.api.get(`/api/v1/me/prices?productId=${parent.id}`)
        ).json()
      ).data.prices,
    ).toEqual([]);
    expect(
      (
        await a.api.post("/api/v1/me/price-quote", {
          data: { variantId: variant.id, quantity: 1 },
        })
      ).status(),
    ).toBe(409);
  } finally {
    await a.api.dispose();
  }
});

test("QWIK setup is repeatable and preserves administrator edits", async () => {
  const { seedQwik } = await import("../../src/modules/catalogue/qwik");
  const v = product.variants[0];
  await db.productVariant.update({
    where: { id: v.id },
    data: { sku: `QA-PRESERVE-${Date.now()}` },
  });
  const before = await db.productVariant.findUniqueOrThrow({
    where: { id: v.id },
  });
  try {
    await seedQwik(db);
    await seedQwik(db);
    expect(await db.product.count({ where: { slug: product.slug } })).toBe(1);
    expect(
      await db.productVariant.count({ where: { productId: product.id } }),
    ).toBe(4);
    expect(
      (await db.productVariant.findUniqueOrThrow({ where: { id: v.id } })).sku,
    ).toBe(before.sku);
  } finally {
    await db.productVariant.update({
      where: { id: v.id },
      data: { sku: null },
    });
  }
});

test("owner creates variants with unique pack sizes/SKUs; staff cannot publish them", async () => {
  const parent = await db.product.create({
    data: {
      name: "QA variant creation",
      slug: `qa-variant-create-${Date.now()}`,
      brand: "QA",
      packSize: "QA sizes",
      summary: "QA variant creation fixture",
      description: "QA variant creation fixture",
      categoryId: product.categoryId,
      active: true,
      published: true,
      contentApproved: true,
    },
  });
  const salesperson = await registered();
  try {
    await db.user.update({
      where: { id: salesperson.user.id },
      data: { role: "SALES_REP" },
    });
    const path = `/api/v1/admin/management/variants?productId=${parent.id}`;
    const data = {
      name: "QA new size",
      packSize: "QA pack",
      sku: `QA-CREATE-${Date.now()}`,
      active: true,
      published: true,
      contentApproved: true,
      approvalReference: "QA creation approval",
      imageUrl: null,
      imageAlt: "",
      imageApproved: false,
      representative: true,
      mrpPaise: null,
      mrpConfirmed: false,
      reason: "QA create a distinct variant",
    };
    expect((await salesperson.api.post(path, { data })).status()).toBe(403);
    const response = await owner.api.post(path, { data });
    expect(response.status()).toBe(201);
    const variant = (await response.json()).data;
    expect(
      (await owner.api.post(path, { data: { ...data, sku: null } })).status(),
    ).toBe(409);
    expect(
      (
        await owner.api.post(path, {
          data: { ...data, packSize: "QA different pack" },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await owner.api.post(
          `/api/v1/admin/management/variants?productId=missing`,
          { data },
        )
      ).status(),
    ).toBe(404);
    const publicProduct = (
      await (await owner.api.get(`/api/v1/catalogue/${parent.slug}`)).json()
    ).data;
    expect(publicProduct.variants).toHaveLength(1);
    expect(publicProduct.variants[0]).toMatchObject({
      id: variant.id,
      sku: data.sku,
      packSize: data.packSize,
    });
    expect(
      await db.auditLog.count({
        where: { entityId: variant.id, action: "VARIANT_CHANGED" },
      }),
    ).toBe(1);
    expect(
      await db.managementEvent.count({ where: { entityId: variant.id } }),
    ).toBe(1);
    expect(
      (
        await owner.api.patch(
          `/api/v1/admin/management/variants/${variant.id}?productId=${product.id}`,
          { data: { ...data, version: 0 } },
        )
      ).status(),
    ).toBe(404);
  } finally {
    await salesperson.api.dispose();
  }
});
