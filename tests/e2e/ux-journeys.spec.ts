import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  db,
  dummyCredentials,
  dummyAddress,
  testIp,
} from "../fixtures/helpers";
import { staff, application } from "../fixtures/phase3";
import {
  salesFixture,
  png,
  buyerAccount,
  checkout,
  orderAction,
  put,
} from "../fixtures/phase5";
import { confirmed, action } from "../fixtures/phase6";
const root = `.local/ux-audit/journeys-${Date.now()}`;
let owner: Awaited<ReturnType<typeof staff>>;
test.beforeAll(async () => {
  await mkdir(root, { recursive: true, mode: 0o700 });
  owner = await staff();
});
test.afterAll(async () => {
  await owner?.api.dispose();
  await db.$disconnect();
});
async function capture(page: Page, width: number, name: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${root}/${width}-${name}.png`,
    fullPage: true,
  });
}
async function fillNames(page: Page, values: Record<string, string>) {
  for (const [k, v] of Object.entries(values))
    await page.locator(`main [name="${k}"]`).fill(v);
}
for (const [width, height] of [
  [375, 812],
  [390, 844],
  [768, 1024],
  [1366, 768],
]) {
  for (const dealer of [false, true]) {
    test(`UX ${dealer ? "dealer" : "customer"} complete journey ${width}x${height}`, async ({
      page,
    }, info) => {
      test.setTimeout(180000);
      await page.setViewportSize({ width, height });
      await page.setExtraHTTPHeaders({ "x-test-client-ip": testIp() });
      const f = await salesFixture(owner.api, 100);
      const credentials = dummyCredentials();
      await page.goto("/");
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("link", { name: "Skip to main content" }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Products", exact: true })
        .click();
      await page
        .getByLabel("Search products", { exact: true })
        .fill(f.product.name);
      await page.getByRole("button", { name: "Find products" }).click();
      await page
        .getByRole("main")
        .getByRole("link", { name: /View details/ })
        .first()
        .click();
      await expect(page).toHaveURL(new RegExp(f.product.slug));
      await page.getByRole("button", { name: "Check my prices" }).click();
      await expect(
        page
          .getByRole("main")
          .getByRole("link", { name: "Sign in", exact: true }),
      ).toBeVisible();
      await capture(
        page,
        width,
        `${dealer ? "dealer" : "customer"}-anonymous-prices`,
      );
      await page
        .getByRole("main")
        .getByRole("link", { name: "Sign in", exact: true })
        .click();
      await page
        .getByRole("link", { name: "Create an account", exact: true })
        .click();
      await fillNames(page, credentials);
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(page).toHaveURL(/\/account$/);
      if (dealer) {
        await page.goto("/become-a-dealer");
        await page
          .getByRole("link", { name: "Apply through your account" })
          .click();
        await expect(page).toHaveURL(/\/account\/dealer$/);
        await expect(
          page.getByRole("heading", {
            name: "Dealer application",
            exact: true,
          }),
        ).toBeVisible();
        const values = {
          ...application,
          email: credentials.email,
          gstin: "",
          message: "Isolated UX dealer application",
        };
        for (const [k, v] of Object.entries(values))
          await page.locator(`main [name="${k}"]`).fill(String(v));
        await page
          .getByRole("button", { name: "Submit application", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "PENDING", exact: true }),
        ).toBeVisible();
        await capture(page, width, "dealer-pending");
        await page.goto(`/products/${f.product.slug}`);
        await page.getByRole("button", { name: "Check my prices" }).click();
        await expect(
          page.getByText("Your retail prices.", { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText("Your approved dealer prices.", { exact: true }),
        ).toHaveCount(0);
        const u = await db.user.findUniqueOrThrow({
          where: { email: credentials.email },
          include: { customer: { include: { dealer: true } } },
        });
        await page.context().clearCookies();
        await page
          .context()
          .addCookies((await owner.api.storageState()).cookies);
        await page.goto(`/admin/dealers/${u.customer!.dealer!.id}`);
        await page.getByLabel("Review action").selectOption("APPROVED");
        await page
          .getByLabel("Reason for change")
          .fill("QA UX approval of isolated dealer");
        await page.getByRole("button", { name: "Record decision" }).click();
        await expect(
          page.getByRole("heading", {
            name: "Business application · APPROVED",
            exact: true,
          }),
        ).toBeVisible();
        await capture(page, width, "admin-dealer-approved");
        await page.context().clearCookies();
        await page.goto("/login");
        await fillNames(page, {
          email: credentials.email,
          password: credentials.password,
        });
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await expect(page).toHaveURL(/\/account$/);
      }
      await page.goto("/account/checkout");
      await expect(
        page.getByText("Add a delivery address before reviewing your order.", {
          exact: false,
        }),
      ).toBeVisible();
      await page
        .getByRole("link", { name: "Add delivery address", exact: true })
        .click();
      const addressForm = page.locator("form").filter({
        has: page.getByRole("button", { name: "Add address", exact: true }),
      });
      for (const [k, v] of Object.entries(dummyAddress)) {
        if (k !== "country") await addressForm.locator(`[name="${k}"]`).fill(v);
      }
      await addressForm
        .getByRole("button", { name: "Add address", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Address 1", exact: true }),
      ).toBeVisible();
      await page.goto(`/products/${f.product.slug}`);
      await page.getByRole("button", { name: "Check my prices" }).click();
      await expect(
        page.getByText(
          dealer ? "Your approved dealer prices." : "Your retail prices.",
          { exact: true },
        ),
      ).toBeVisible();
      const packs = dealer ? ["8g", "20g"] : ["8g"];
      for (const pack of packs) {
        await page
          .getByRole("listitem")
          .filter({ has: page.getByText(`QA ${pack}`, { exact: true }) })
          .getByRole("button", { name: "Add to cart" })
          .click();
      }
      await expect(
        page.getByText("Added to cart.", { exact: true }),
      ).toHaveCount(packs.length);
      await capture(
        page,
        width,
        `${dealer ? "dealer" : "customer"}-variant-prices`,
      );
      await page
        .getByRole("link", { name: "View cart", exact: true })
        .first()
        .click();
      for (const pack of packs) {
        const input = page.getByLabel(`Quantity ${pack}`, { exact: true });
        await input.fill("");
        await expect(input).toHaveValue("");
        await input.pressSequentially(dealer ? "25" : "2");
        await input
          .locator("xpath=ancestor::form")
          .getByRole("button", { name: "Update quantity", exact: true })
          .click();
        await expect(
          input
            .locator("xpath=ancestor::form")
            .getByRole("button", { name: "Update quantity", exact: true }),
        ).toBeEnabled();
        await expect(page.getByRole("status").first()).toContainText(
          "Cart updated.",
        );
        await expect(input).toHaveValue(dealer ? "25" : "2");
        const savedQuantity = await db.cartItem.findFirstOrThrow({
          where: {
            customer: { user: { email: credentials.email } },
            variantId: f.variants.find((v) => v.packSize === pack)!.id,
          },
        });
        expect(savedQuantity.quantity).toBe(dealer ? 25 : 2);
      }
      await capture(page, width, `${dealer ? "dealer" : "customer"}-cart`);
      await page
        .getByRole("link", { name: "Review checkout", exact: true })
        .click();
      await page
        .getByLabel("Delivery address", { exact: true })
        .selectOption({ index: 1 });
      await page.getByRole("button", { name: "Review current total" }).click();
      await expect(
        page.getByRole("heading", { name: "Confirm order" }),
      ).toBeVisible();
      await capture(page, width, `${dealer ? "dealer" : "customer"}-checkout`);
      await page.getByRole("button", { name: "Place sales order" }).click();
      await expect(page).toHaveURL(/\/account\/orders\/[^/]+$/);
      const orderId = page.url().split("/").at(-1)!;
      const row = await db.salesOrder.findUniqueOrThrow({
        where: { id: orderId },
      });
      await expect(
        page.getByRole("heading", { name: row.number }),
      ).toBeVisible();
      const proof = page.locator("form").filter({
        has: page.getByRole("button", { name: "Submit for verification" }),
      });
      await proof
        .getByLabel("Transaction reference / UTR", { exact: true })
        .fill(`QA-UX-${Date.now()}-${width}`);
      await proof
        .getByLabel("Payment date", { exact: true })
        .fill(new Date().toISOString().slice(0, 10));
      await proof
        .getByLabel("Payment screenshot", { exact: true })
        .setInputFiles({
          name: "bad.png",
          mimeType: "image/png",
          buffer: Buffer.from("not an image"),
        });
      await proof
        .getByRole("button", { name: "Submit for verification" })
        .click();
      await expect(proof.locator("..").getByRole("alert")).not.toBeEmpty();
      expect(await db.paymentSubmission.count({ where: { orderId } })).toBe(0);
      await capture(
        page,
        width,
        `${dealer ? "dealer" : "customer"}-failed-proof`,
      );
      await proof
        .getByLabel("Payment screenshot", { exact: true })
        .setInputFiles({
          name: "dummy.png",
          mimeType: "image/png",
          buffer: await png(),
        });
      await proof
        .getByRole("button", { name: "Submit for verification" })
        .click();
      await expect(
        page.getByRole("heading", { name: /SUBMITTED · UPI/ }),
      ).toBeVisible();
      expect(await db.paymentRecord.count({ where: { orderId } })).toBe(0);
      await capture(
        page,
        width,
        `${dealer ? "dealer" : "customer"}-proof-unverified`,
      );
      const buyerCookies = (await page.context().storageState()).cookies;
      await page.context().clearCookies();
      await page.context().addCookies((await owner.api.storageState()).cookies);
      await page.goto(`/admin/sales/orders/${orderId}`);
      const review = page.locator("form").filter({
        has: page.getByRole("button", { name: "Record manual review" }),
      });
      await review
        .getByLabel("Review action", { exact: true })
        .selectOption("VERIFY");
      await review
        .getByLabel("Actual bank-confirmed received amount (INR)", {
          exact: true,
        })
        .fill(String(row.totalPaise / 100));
      await review
        .getByLabel("Actual bank transaction reference", { exact: true })
        .fill(`QA-UX-BANK-${Date.now()}`);
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
        .fill("QA dummy bank verification for UX test");
      await review
        .getByLabel("Private verification notes", { exact: true })
        .fill("Dummy test only, no funds transferred");
      await review
        .getByRole("button", { name: "Record manual review" })
        .click();
      await expect(page.getByText(/READY FOR DISPATCH · PAID/)).toBeVisible();
      const d = await confirmed(owner.api, orderId);
      expect(
        (await action(owner.api, d.id, "OUT_FOR_DELIVERY")).response.status(),
      ).toBe(200);
      expect(
        (
          await action(owner.api, d.id, "DELIVERED", {
            recipientName: "QA Recipient",
            confirmationSource: "Isolated UX dummy handover",
          })
        ).response.status(),
      ).toBe(200);
      await page.context().clearCookies();
      await page.context().addCookies(buyerCookies);
      await page.goto(`/account/orders/${orderId}`);
      await expect(
        page.getByText(`${d.number} · DELIVERED`, { exact: true }),
      ).toBeVisible();
      await capture(page, width, `${dealer ? "dealer" : "customer"}-delivered`);
      await page.goto("/account/orders");
      await page.getByRole("link", { name: row.number, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: row.number }),
      ).toBeVisible();
      if (dealer) {
        // Existing manual repeat purchase, not a new reorder endpoint.
        await page.goto(`/products/${f.product.slug}`);
        await page.getByRole("button", { name: "Check my prices" }).click();
        await page
          .getByRole("listitem")
          .filter({ has: page.getByText("QA 8g", { exact: true }) })
          .getByRole("button", { name: "Add to cart" })
          .click();
        await page
          .getByRole("link", { name: "View cart", exact: true })
          .click();
        await expect(
          page.getByLabel("Quantity 8g", { exact: true }),
        ).toHaveValue("1");
        await capture(page, width, "dealer-manual-repeat-purchase");
      }
      info.annotations.push({ type: "ux-evidence", description: root });
    });
  }
  test(`UX empty, out-of-stock, invalid, cancelled and expired ${width}x${height}`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height });
    await page.setExtraHTTPHeaders({ "x-test-client-ip": testIp() });
    const f = await salesFixture(owner.api, 2),
      b = await buyerAccount();
    try {
      await page.goto("/register");
      await page.getByRole("button", { name: "Create account" }).click();
      expect(await page.locator("input:invalid").count()).toBeGreaterThan(0);
      await expect(page).toHaveURL(/\/register$/);
      await page.context().addCookies((await b.api.storageState()).cookies);
      await page.goto("/account/cart");
      await expect(
        page.getByText("Your cart is empty.", { exact: false }),
      ).toBeVisible();
      await capture(page, width, "empty-cart");
      await put(b.api, f.variants[0].id, 3);
      await page.goto("/account/cart");
      await expect(page.getByText(/Only 2 available/)).toBeVisible();
      await capture(page, width, "out-of-stock");
      const o = await checkout(b, f.variants[0].id, 1);
      expect(
        (await orderAction(b.api, o.row.id, "CANCEL", false)).status(),
      ).toBe(200);
      await page.goto(`/account/orders/${o.row.id}`);
      await expect(
        page.getByText(
          /Do not send a new payment for this cancelled or expired order/,
        ),
      ).toBeVisible();
      await capture(page, width, "cancelled");
      const other = await buyerAccount();
      try {
        const held = await checkout(other, f.variants[0].id, 2);
        await put(b.api, f.variants[0].id, 1);
        await page.goto("/account/cart");
        await expect(page.getByText(/Only 0 available/)).toBeVisible();
        await capture(page, width, "zero-available-stock");
        expect(
          (await orderAction(other.api, held.row.id, "CANCEL", false)).status(),
        ).toBe(200);
      } finally {
        await other.api.dispose();
      }
      const expired = await checkout(b, f.variants[0].id, 1);
      await db.stockReservation.updateMany({
        where: { orderId: expired.row.id, status: "ACTIVE" },
        data: {
          expiresAt: new Date(Date.now() - 120000),
          version: { increment: 1 },
          reason: "QA UX force expiry of isolated reservation",
        },
      });
      const r = await owner.api.post("/api/v1/admin/sales/expire", {
        data: {},
      });
      expect(r.status()).toBe(200);
      await page.goto(`/account/orders/${expired.row.id}`);
      await expect(
        page.getByText(/RESERVATION EXPIRED · UNPAID/),
      ).toBeVisible();
      await capture(page, width, "expired");
      info.annotations.push({ type: "ux-evidence", description: root });
    } finally {
      await b.api.dispose();
    }
  });
}

test("cart quantity supports clearing and multi-digit entry before explicit save", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const f = await salesFixture(owner.api, 100),
    b = await buyerAccount();
  try {
    await put(b.api, f.variants[0].id, 1);
    await page.context().addCookies((await b.api.storageState()).cookies);
    let releaseCart!: () => void;
    const cartResponse = new Promise<void>((resolve) => {
      releaseCart = resolve;
    });
    await page.route("**/api/v1/me/cart", async (route) => {
      await cartResponse;
      await route.continue();
    });
    await page.goto("/account/cart");
    await expect(
      page.getByText("Loading cart…", { exact: true }),
    ).toBeVisible();
    releaseCart();
    await page.unroute("**/api/v1/me/cart");
    const input = page.getByLabel("Quantity 8g", { exact: true });
    await expect(input).toHaveValue("1");
    await capture(page, 375, "quantity-before-edit");
    await input.fill("");
    await expect(input).toHaveValue("");
    await input.pressSequentially("25");
    await expect(
      page.getByRole("link", { name: "Review checkout", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/Update each changed quantity before checkout/),
    ).toBeVisible();
    expect(
      (
        await db.cartItem.findFirstOrThrow({
          where: {
            customerId: b.user.customer!.id,
            variantId: f.variants[0].id,
          },
        })
      ).quantity,
    ).toBe(1);
    await input.press("Tab");
    await expect(
      page.getByRole("button", { name: "Update quantity", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").first()).toContainText(
      "Cart updated.",
    );
    await expect(input).toHaveValue("25");
    await page.goto(`/products/${f.product.slug}`);
    await page.getByRole("button", { name: "Check my prices" }).click();
    await page
      .getByRole("listitem")
      .filter({ has: page.getByText("QA 8g", { exact: true }) })
      .getByRole("button", { name: "Add to cart" })
      .click();
    await expect(
      page.getByText("Already in your cart. Update quantities in your cart.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: "View cart", exact: true }).click();
    await expect(page.getByLabel("Quantity 8g", { exact: true })).toHaveValue(
      "25",
    );
  } finally {
    await b.api.dispose();
  }
});
