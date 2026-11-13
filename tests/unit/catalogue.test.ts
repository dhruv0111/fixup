import { test } from "node:test";
import assert from "node:assert/strict";
import {
  catalogueQuery,
  productSchema,
  documentUrl,
  imageUrl,
} from "../../src/modules/catalogue/validation";
import { enquirySchema } from "../../src/modules/enquiries/validation";
import {
  whatsappUrl,
  productMessage,
  bulkMessage,
} from "../../src/modules/catalogue/content";

test("WhatsApp validates the number and encodes the complete product message", () => {
  const message = productMessage({
    name: "Demo & sample",
    sku: "QA-1",
    packSize: "Demo pack",
  });
  const url = new URL(whatsappUrl("919000000000", message)!);
  assert.equal(url.hostname, "wa.me");
  assert.equal(url.searchParams.get("text"), message);
  assert.equal(whatsappUrl("", message), null);
  assert.equal(whatsappUrl("javascript:bad", message), null);
  assert.match(bulkMessage, /Quantity/);
});
test("catalogue rejects invalid paging and unsafe category input", () => {
  for (const input of [
    { page: 0 },
    { page: 10001 },
    { page: "bad" },
    { q: "x".repeat(101) },
    { category: "../private" },
  ])
    assert.equal(catalogueQuery.safeParse(input).success, false);
  assert.deepEqual(catalogueQuery.parse({}), { q: "", category: "", page: 1 });
});
test("media links exclude private, executable and external resources", () => {
  for (const url of ["", "not a URL", "/brand/../../.env"]) {
    assert.equal(imageUrl.safeParse(url).success, false);
    assert.equal(documentUrl.safeParse(url).success, false);
  }
  assert.equal(
    imageUrl.safeParse(
      "https://res.cloudinary.com/demo/image/upload/example.webp",
    ).success,
    true,
  );
  for (const url of [
    "https://evil.test/image/upload/a.png",
    "https://res.cloudinary.com/demo/image/private/a.png",
    "https://res.cloudinary.com/demo/image/upload/a.svg",
    "http://res.cloudinary.com/demo/image/upload/a.png",
  ])
    assert.equal(imageUrl.safeParse(url).success, false);
  assert.equal(
    documentUrl.safeParse("https://res.cloudinary.com/demo/raw/upload/tds.pdf")
      .success,
    true,
  );
  assert.equal(
    documentUrl.safeParse(
      "https://res.cloudinary.com/demo/raw/authenticated/tds.pdf",
    ).success,
    false,
  );
});
const product = {
  name: "Demo product",
  slug: "demo-product",
  sku: "QA",
  brand: "Demo",
  packSize: "Demo",
  summary: "Demo summary",
  description: "Demo description",
  categoryId: "demo",
};
test("publication requires approval and a supporting reference", () => {
  assert.equal(
    productSchema.safeParse({ ...product, published: true }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({
      ...product,
      published: true,
      contentApproved: true,
      approvalReference: "QA reference",
    }).success,
    true,
  );
});
test("private documents cannot receive public URLs and public documents require approval", () => {
  const doc = {
    title: "Demo document",
    kind: "TDS",
    publicUrl: "https://res.cloudinary.com/demo/raw/upload/tds.pdf",
  };
  assert.equal(
    productSchema.safeParse({ ...product, documents: [doc] }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({
      ...product,
      documents: [{ ...doc, visibility: "PUBLIC", approved: true }],
    }).success,
    true,
  );
});
const enquiry = {
  requestId: "2ca1b725-d523-4a40-88ef-99f64d206263",
  kind: "CONTACT",
  name: "QA Person",
  phone: "9000000000",
  message: "Test enquiry",
  consent: true,
  token: "test",
};
test("enquiries reject markup, excess fields and missing consent", () => {
  assert.equal(enquirySchema.safeParse(enquiry).success, true);
  for (const data of [
    { ...enquiry, consent: false },
    { ...enquiry, message: "<script>bad</script>" },
    { ...enquiry, role: "ADMIN" },
    { ...enquiry, phone: "bad" },
  ])
    assert.equal(enquirySchema.safeParse(data).success, false);
});
test("dealer and bulk forms enforce their own required fields", () => {
  assert.equal(
    enquirySchema.safeParse({ ...enquiry, kind: "DEALER" }).success,
    false,
  );
  assert.equal(
    enquirySchema.safeParse({ ...enquiry, kind: "BULK" }).success,
    false,
  );
  assert.equal(
    enquirySchema.safeParse({
      ...enquiry,
      kind: "BULK",
      productId: "product",
      quantity: "10 packs",
      location: "Test City",
    }).success,
    true,
  );
});
