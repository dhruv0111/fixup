import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { db, testIp } from "../fixtures/helpers";
import { staff } from "../fixtures/phase3";
import {
  salesFixture,
  buyerAccount,
  png,
  checkout,
  upload,
  verify,
} from "../fixtures/phase5";
let owner: Awaited<ReturnType<typeof staff>>,
  f: Awaited<ReturnType<typeof salesFixture>>,
  b: Awaited<ReturnType<typeof buyerAccount>>;
test.beforeAll(async () => {
  owner = await staff();
});
test.beforeEach(async ({ page }) => {
  f = await salesFixture(owner.api);
  b = await buyerAccount();
  await page.setExtraHTTPHeaders({ "x-test-client-ip": testIp() });
  await page.context().addCookies((await b.api.storageState()).cookies);
});
test.afterEach(async () => {
  await b.api.dispose();
});
test.afterAll(async () => {
  await owner.api.dispose();
  await db.$disconnect();
});
async function capture(page: Page, info: TestInfo, name: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `.local/qa/phase5/${name}-${info.project.name}.png`,
    fullPage: true,
  });
}
async function switchOwner(page: Page) {
  await page.context().clearCookies();
  await page.context().addCookies((await owner.api.storageState()).cookies);
}

test("retail buyer completes cart, reviewed checkout, private proof and admin bank verification", async ({
  page,
}, info) => {
  await page.goto(`/products/${f.product.slug}`);
  await page.getByRole("button", { name: "Check my prices" }).click();
  await expect(
    page.getByText("Your retail prices.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("listitem")
    .filter({ has: page.getByText("QA 8g", { exact: true }) })
    .getByRole("button", { name: "Add to cart" })
    .click();
  await expect(page.getByText("Added to cart.", { exact: true })).toBeVisible();
  await page.goto("/account/cart");
  await expect(
    page.getByRole("heading", { name: /QA QWIK stock/ }),
  ).toBeVisible();
  await page.getByLabel("Quantity 8g", { exact: true }).fill("2");
  await expect(page.getByRole("status")).toContainText("Cart updated.");
  await capture(page, info, "cart");
  await page
    .getByRole("link", { name: "Review checkout", exact: true })
    .click();
  await page
    .getByLabel("Delivery address", { exact: true })
    .selectOption(b.address.id);
  await page.getByRole("button", { name: "Review current total" }).click();
  await expect(
    page.getByRole("heading", { name: "Confirm order" }),
  ).toBeVisible();
  await expect(
    page.getByText("qa-only@example", { exact: true }),
  ).toBeVisible();
  await capture(page, info, "checkout");
  await page.getByRole("button", { name: "Place sales order" }).click();
  await expect(page).toHaveURL(/\/account\/orders\/[^/]+$/);
  await expect(page.getByRole("heading", { name: /FIX-SO-/ })).toBeVisible();
  const id = page.url().split("/").at(-1)!;
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Submit for verification" }),
  });
  await form
    .getByLabel("Transaction reference / UTR", { exact: true })
    .fill(`QA-BROWSER-${info.project.name}-${Date.now()}`);
  await form
    .getByLabel("Payment date", { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await form.getByLabel("Payment screenshot", { exact: true }).setInputFiles({
    name: "qa-proof.png",
    mimeType: "image/png",
    buffer: await png(),
  });
  await form.getByRole("button", { name: "Submit for verification" }).click();
  await expect(
    page.getByRole("heading", { name: /SUBMITTED · UPI/ }),
  ).toBeVisible();
  await expect(page.getByAltText("Private payment screenshot")).toBeVisible();
  await capture(page, info, "payment-submitted");
  await switchOwner(page);
  await page.goto(`/admin/sales/orders/${id}`);
  const review = page.locator("form").filter({
    has: page.getByRole("button", { name: "Record manual review" }),
  });
  await review
    .getByLabel("Review action", { exact: true })
    .selectOption("VERIFY");
  await review
    .getByLabel("Actual bank-confirmed received amount (INR)", { exact: true })
    .fill("200");
  await review
    .getByLabel("Actual bank transaction reference", { exact: true })
    .fill(`QA-BANK-BROWSER-${info.project.name}-${Date.now()}`);
  await review
    .getByRole("checkbox", {
      name: "I independently checked the actual bank or UPI transaction record.",
    })
    .check();
  await review
    .getByRole("checkbox", {
      name: "I reviewed the possible duplicate reference/proof warning.",
    })
    .check();
  await review
    .getByLabel("Review reason", { exact: true })
    .fill("QA actual bank record reviewed");
  await review
    .getByLabel("Private verification notes", { exact: true })
    .fill("QA actual bank amount and reference independently checked");
  await capture(page, info, "admin-verification");
  await review.getByRole("button", { name: "Record manual review" }).click();
  await expect(page.getByText(/READY FOR DISPATCH · PAID/)).toBeVisible();
  await capture(page, info, "ready-for-dispatch");
  await page.context().clearCookies();
  await page.context().addCookies((await b.api.storageState()).cookies);
  await page.goto("/account/orders");
  await expect(page.getByText(/READY FOR DISPATCH · PAID/)).toBeVisible();
  await capture(page, info, "order-history");
});
test("admin settings, payment queue and order search render without mobile overflow", async ({
  page,
}, info) => {
  const o = await checkout(b, f.variants[0].id);
  await upload(b.api, o.row.id);
  await switchOwner(page);
  await page.goto("/admin/sales/payments");
  await expect(
    page.getByRole("link", { name: new RegExp(o.row.number) }),
  ).toBeVisible();
  await capture(page, info, "payment-queue");
  await page.goto("/admin/sales/orders");
  await page
    .getByLabel("Order number or customer/dealer", { exact: true })
    .fill(o.row.number);
  await page.getByRole("button", { name: "Search orders" }).click();
  await expect(
    page.getByRole("link", { name: o.row.number, exact: true }),
  ).toBeVisible();
  await capture(page, info, "admin-orders");
  await page.goto("/admin/sales/settings");
  await expect(page.getByLabel("Business UPI ID", { exact: true })).toHaveValue(
    "qa-only@example",
  );
  await capture(page, info, "settings");
});
test("customer sees rejection history and can submit replacement proof", async ({
  page,
}, info) => {
  const o = await checkout(b, f.variants[0].id);
  await upload(b.api, o.row.id);
  const s = await db.paymentSubmission.findFirstOrThrow({
    where: { orderId: o.row.id },
  });
  await owner.api.post(`/api/v1/admin/sales/payments/${s.id}`, {
    data: {
      action: "REJECT",
      version: 0,
      reason: "QA incorrect screenshot",
      internalNotes: "Private QA bank record mismatch",
      publicMessage: "Please upload the correct transaction screenshot.",
    },
  });
  await page.goto(`/account/orders/${o.row.id}`);
  await expect(
    page.getByRole("heading", { name: /REJECTED · UPI/ }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Please upload the correct transaction screenshot.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await expect(page.getByText("Private QA bank record mismatch")).toHaveCount(
    0,
  );
  await capture(page, info, "rejected-proof");
});
test("paid cancellation retains verified receipts and flags a manual refund decision", async ({
  page,
}, info) => {
  const o = await checkout(b, f.variants[0].id);
  await upload(b.api, o.row.id);
  await verify(owner.api, o.row.id, 10000);
  await switchOwner(page);
  await page.goto(`/admin/sales/orders/${o.row.id}`);
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Apply order action" }) });
  await form.getByLabel("Action", { exact: true }).selectOption("CANCEL");
  await form
    .getByLabel("Reason / resolution", { exact: true })
    .fill("QA confirmed paid cancellation");
  await form.getByRole("button", { name: "Apply order action" }).click();
  await expect(page.getByText(/CANCELLED · PAID/)).toBeVisible();
  await expect(
    page.getByText(
      "Manual refund decision required. No refund has been initiated by this website.",
    ),
  ).toBeVisible();
  await capture(page, info, "paid-cancellation");
  await page.context().clearCookies();
  await page.context().addCookies((await b.api.storageState()).cookies);
  await page.goto(`/account/orders/${o.row.id}`);
  await expect(
    page.getByText(
      /Do not send a new payment for this cancelled or expired order/,
    ),
  ).toBeVisible();
});
