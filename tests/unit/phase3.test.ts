import test from "node:test";
import assert from "node:assert/strict";
import {
  dealerApplication,
  quoteSchema,
  priceListSchema,
  variantSchema,
} from "../../src/modules/management/schemas";
import { imageUrl } from "../../src/modules/catalogue/validation";
import {
  qwikPackaging,
  qwikShowcase,
} from "../../src/modules/catalogue/assets";
test("only the two supplied local images are accepted", () => {
  for (const url of [qwikPackaging, qwikShowcase])
    assert.ok(imageUrl.safeParse(url).success);
  for (const url of [
    "/brand/../../.env",
    "/private/a.png",
    "/brand/not-supplied.png",
    `${qwikPackaging}?file=secret`,
    "file:///secret.png",
  ])
    assert.equal(imageUrl.safeParse(url).success, false);
});
test("quotes reject client prices, category overrides and invalid quantities", () => {
  const input = { variantId: "variant", quantity: 2 };
  assert.ok(quoteSchema.safeParse(input).success);
  for (const extra of [
    { price: 1 },
    { category: "APPROVED_DEALER" },
    { priceListId: "private" },
    { quantity: 0 },
    { quantity: 1.5 },
    { quantity: 10001 },
    { productId: "parent" },
  ])
    assert.equal(quoteSchema.safeParse({ ...input, ...extra }).success, false);
});
test("price lists reject fractional paise, duplicates and ambiguous targets", () => {
  const input = {
    name: "Retail prices",
    active: true,
    reason: "Verified pricing",
    entries: [{ variantId: "v", amountPaise: 10000 }],
  };
  assert.ok(priceListSchema.safeParse(input).success);
  for (const entries of [
    [...input.entries, ...input.entries],
    [{ variantId: "v", productId: "p", amountPaise: 100 }],
    [{ variantId: "v", amountPaise: 0 }],
    [{ variantId: "v", amountPaise: 1.5 }],
  ])
    assert.equal(
      priceListSchema.safeParse({ ...input, entries }).success,
      false,
    );
});
test("dealer input requires state and disallows self-approval", () => {
  const data = {
    businessName: "QA Shop",
    contactName: "QA Person",
    phone: "9000000000",
    email: "qa@example.invalid",
    address: "QA Street",
    city: "QA City",
    state: "QA State",
    postalCode: "201009",
    businessType: "Retail",
    expectedVolume: "100 packs",
  };
  assert.ok(dealerApplication.safeParse(data).success);
  for (const extra of [
    { state: "" },
    { status: "APPROVED" },
    { category: "APPROVED_DEALER" },
    { gstin: "INVALID" },
  ])
    assert.equal(
      dealerApplication.safeParse({ ...data, ...extra }).success,
      false,
    );
});
test("variant publication and MRP require explicit confirmation", () => {
  const data = {
    name: "QWIK 50g",
    packSize: "50g",
    sku: null,
    active: true,
    published: false,
    contentApproved: false,
    approvalReference: "",
    imageUrl: null,
    imageAlt: "",
    imageApproved: false,
    representative: true,
    mrpPaise: null,
    mrpConfirmed: false,
    reason: "Configure variant",
  };
  assert.ok(variantSchema.safeParse(data).success);
  assert.equal(
    variantSchema.safeParse({ ...data, published: true }).success,
    false,
  );
  assert.equal(
    variantSchema.safeParse({ ...data, mrpPaise: 17500 }).success,
    false,
  );
  assert.ok(
    variantSchema.safeParse({ ...data, mrpPaise: 17500, mrpConfirmed: true })
      .success,
  );
});
