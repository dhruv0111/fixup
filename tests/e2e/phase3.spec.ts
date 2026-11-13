import {
  test,
  expect,
  type Page,
  type TestInfo,
  type Locator,
} from "@playwright/test";
import { db, registered, testIp, dummyAddress } from "../fixtures/helpers";
import { application, staff, qwikFixture } from "../fixtures/phase3";
import {
  qwikPackaging,
  qwikShowcase,
} from "../../src/modules/catalogue/assets";

let product: Awaited<ReturnType<typeof qwikFixture>>;
test.beforeAll(async () => {
  product = await qwikFixture();
  // Old fixture data persists in the disposable DB; reserve the featured slots.
  await db.product.updateMany({
    where: { id: { not: product.id }, featured: true },
    data: { featured: false },
  });
});
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-test-client-ip": testIp() });
});
test.afterAll(async () => {
  await db.$disconnect();
});
async function capture(page: Page, info: TestInfo, name: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `.local/qa/phase3/${name}-${info.project.name}.png`,
    fullPage: true,
  });
}
async function fill(form: Locator, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values))
    await form.locator(`[name="${name}"]`).fill(value);
}

test("QWIK shows supplied images, four sizes, representative labels and pack-specific WhatsApp", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/products/${product.slug}`);
  await expect(
    page.getByRole("heading", { name: product.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('meta[property="og:image"]').first(),
  ).toHaveAttribute("content", `http://127.0.0.1:3100${qwikShowcase}`);
  const structured = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent())!,
  );
  expect(structured.image).toEqual(
    [qwikShowcase, qwikPackaging].map((path) => `http://127.0.0.1:3100${path}`),
  );
  expect(structured.offers).toBeUndefined();
  const variants = page.getByRole("region", { name: "Available variants" });
  await expect(variants.locator("article")).toHaveCount(4);
  for (const size of ["8g", "20g", "40g", "50g"]) {
    const card = variants
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: size, exact: true }) });
    await expect(card.getByRole("img")).toBeVisible();
    if (size !== "50g")
      await expect(
        card.getByText(
          `Representative imagery; not a photograph of the ${size} pack.`,
        ),
      ).toBeVisible();
    const url = new URL(
      (await card
        .getByRole("link", { name: /Chat on WhatsApp/ })
        .getAttribute("href"))!,
    );
    expect(url.searchParams.get("text")).toContain(size);
    await expect(card).not.toContainText("MRP:");
  }
  for (const asset of [qwikShowcase, qwikPackaging])
    expect((await page.request.get(asset)).status()).toBe(200);
  await expect
    .poll(() =>
      page
        .getByRole("main")
        .locator("img")
        .evaluateAll((imgs) =>
          imgs.every(
            (img) =>
              (img as HTMLImageElement).complete &&
              (img as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await expect(page.getByText("About the supplied packaging")).toBeVisible();
  await page.getByRole("button", { name: "Check my prices" }).click();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await capture(page, info, "qwik-product");
  await page.goto("/");
  await expect(
    page
      .getByRole("main")
      .getByRole("img", { name: /supplied marketing image/ }),
  ).toBeVisible();
  await capture(page, info, "home");
  expect(errors).toEqual([]);
});

test("customer edits profile and manages multiple delivery addresses", async ({
  page,
}, info) => {
  const a = await registered();
  try {
    await page.context().addCookies((await a.api.storageState()).cookies);
    await page.goto("/account/profile");
    const profile = page.locator("form");
    await fill(profile, {
      name: "QA Browser Profile",
      phone: "9000000000",
      businessName: "QA Browser Shop",
    });
    await profile.getByRole("button", { name: "Save changes" }).click();
    await expect(profile.getByRole("status")).toContainText(
      "Saved successfully",
    );
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue(
      "QA Browser Profile",
    );
    await capture(page, info, "customer-profile");
    await page.goto("/account/addresses");
    for (let i = 1; i <= 2; i++) {
      const form = page.locator("form").filter({
        has: page.getByRole("button", { name: "Add address", exact: true }),
      });
      await fill(form, {
        recipient: `QA Recipient ${i}`,
        phone: dummyAddress.phone,
        line1: `${i} QA Street`,
        city: dummyAddress.city,
        state: dummyAddress.state,
        postalCode: dummyAddress.postalCode,
      });
      await form
        .getByRole("button", { name: "Add address", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: `Address ${i}`, exact: true }),
      ).toBeVisible();
    }
    const first = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Address 1", exact: true }),
    });
    await first.getByLabel("City *", { exact: true }).fill("QA Edited City");
    await first.getByRole("button", { name: "Save changes" }).click();
    await expect(first.getByRole("status").first()).toContainText(
      "Saved successfully",
    );
    await capture(page, info, "customer-addresses");
    const deletion = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().includes("/api/v1/me/addresses/"),
    );
    await first.getByRole("button", { name: "Delete address" }).click();
    expect((await deletion).status()).toBe(200);
    await expect(
      page.getByRole("button", { name: "Delete address" }),
    ).toHaveCount(1);
    await expect
      .poll(() =>
        db.address.count({ where: { customerId: a.user.customer!.id } }),
      )
      .toBe(1);
    await page.goto("/account/orders");
    await expect(page.getByRole("main")).toContainText("No orders yet.");
  } finally {
    await a.api.dispose();
  }
});

test("dealer applies and admin reviews, rejects, approves, suspends and reactivates", async ({
  page,
}, info) => {
  const a = await registered();
  const owner = await staff();
  try {
    await page.context().addCookies((await a.api.storageState()).cookies);
    await page.goto("/account/dealer");
    const form = page.locator("form");
    await fill(form, {
      businessName: application.businessName,
      contactName: application.contactName,
      phone: application.phone,
      email: application.email,
      address: application.address,
      city: application.city,
      state: application.state,
      postalCode: application.postalCode,
      businessType: application.businessType,
      expectedVolume: application.expectedVolume,
      message: "QA browser dealer application",
    });
    await form
      .getByRole("button", { name: "Submit application", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "PENDING", exact: true }),
    ).toBeVisible();
    await capture(page, info, "dealer-application");
    const dealer = await db.dealerProfile.findUniqueOrThrow({
      where: { customerId: a.user.customer!.id },
    });
    await page.context().clearCookies();
    await page.context().addCookies((await owner.api.storageState()).cookies);
    await page.goto("/admin/dealers?status=PENDING");
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: new RegExp(application.businessName) })
        .first(),
    ).toBeVisible();
    await page.goto(`/admin/dealers/${dealer.id}`);
    await expect(page.getByRole("main")).toContainText(application.state);
    await page.getByLabel("Review action").selectOption("REJECTED");
    await page
      .getByLabel("Reason for change")
      .fill("QA request revised business details");
    await page.getByRole("button", { name: "Record decision" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Business application · REJECTED",
        exact: true,
      }),
    ).toBeVisible();
    expect((await a.api.get("/api/v1/dealer/access")).status()).toBe(403);
    expect(
      (await a.api.post("/api/v1/me/dealer", { data: application })).status(),
    ).toBe(200);
    for (const [status, expected] of [
      ["APPROVED", 200],
      ["SUSPENDED", 403],
      ["APPROVED", 200],
    ] as const) {
      await page.reload();
      await page.getByLabel("Review action").selectOption(status);
      await page
        .getByLabel("Reason for change")
        .fill(`QA browser ${status.toLowerCase()} business`);
      await page.getByRole("button", { name: "Record decision" }).click();
      await expect(
        page.getByRole("heading", {
          name: `Business application · ${status}`,
          exact: true,
        }),
      ).toBeVisible();
      expect((await a.api.get("/api/v1/dealer/access")).status()).toBe(
        expected,
      );
    }
    await capture(page, info, "admin-dealer-review");
    await expect(
      page.getByRole("heading", { name: "Audit history" }),
    ).toBeVisible();
    await page.goto(`/admin/customers/${a.user.customer!.id}`);
    await page.getByLabel("Account active").uncheck();
    await page
      .getByLabel("Reason for change")
      .fill("QA browser account suspension");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText("Saved successfully");
    expect((await a.api.get("/api/v1/me")).status()).toBe(401);
    await page.getByLabel("Account active").check();
    await page
      .getByLabel("Reason for change")
      .fill("QA browser account reactivation");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect
      .poll(
        async () =>
          (await db.user.findUniqueOrThrow({ where: { id: a.user.id } }))
            .active,
      )
      .toBe(true);
  } finally {
    await a.api.dispose();
    await owner.api.dispose();
  }
});

test("admin creates and edits shared variant prices; account sees only assigned active prices", async ({
  page,
}, info) => {
  const owner = await staff();
  const a = await registered();
  const variant = product.variants[0];
  try {
    await page.context().addCookies((await owner.api.storageState()).cookies);
    await page.goto("/admin/price-lists/new");
    await page
      .getByLabel("Price list name")
      .fill(`QA Browser Prices ${info.project.name} ${Date.now()}`);
    await page.getByLabel("Active price list").check();
    await page.getByRole("button", { name: "Add price", exact: true }).click();
    await page
      .getByLabel("Price target 1", { exact: true })
      .selectOption(`v:${variant.id}`);
    await page.getByLabel("Price amount 1", { exact: true }).fill("123.45");
    await page
      .getByLabel("Reason for change")
      .fill("QA browser shared price setup");
    await page
      .getByRole("button", { name: "Save price list", exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/price-lists\/c[a-z0-9]+$/);
    const id = page.url().split("/").at(-1)!;
    await page.getByLabel("Price amount 1", { exact: true }).fill("125.50");
    await page
      .getByLabel("Reason for change")
      .fill("QA browser updated selling amount");
    await page
      .getByRole("button", { name: "Save price list", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await db.priceList.findUniqueOrThrow({ where: { id } })).version,
      )
      .toBe(1);
    await page.goto("/admin/price-lists");
    const retail = page.locator("section").filter({
      has: page.getByRole("heading", { name: "RETAIL", exact: true }),
    });
    await retail.getByLabel("Assigned price list").selectOption(id);
    await retail
      .getByLabel("Reason for change")
      .fill("QA browser category assignment");
    await retail.getByRole("button", { name: "Save changes" }).click();
    await expect(retail.getByRole("status")).toContainText(
      "Saved successfully",
    );
    await capture(page, info, "admin-price-lists");
    await page.context().clearCookies();
    await page.context().addCookies((await a.api.storageState()).cookies);
    await page.goto(`/products/${product.slug}`);
    await page.getByRole("button", { name: "Check my prices" }).click();
    await expect(page.getByRole("status")).toContainText("Your retail prices");
    await expect(page.getByRole("main")).toContainText("₹125.50");
    await capture(page, info, "customer-pricing");
    await page.context().clearCookies();
    await page.context().addCookies((await owner.api.storageState()).cookies);
    await page.goto(`/admin/price-lists/${id}`);
    await page.getByLabel("Active price list").uncheck();
    await page
      .getByLabel("Reason for change")
      .fill("QA deactivate shared price list");
    await page.getByRole("button", { name: "Save price list" }).click();
    await expect
      .poll(
        async () =>
          (await db.priceList.findUniqueOrThrow({ where: { id } })).active,
      )
      .toBe(false);
    const prices = (
      await (
        await a.api.get(`/api/v1/me/prices?productId=${product.id}`)
      ).json()
    ).data.prices;
    expect(prices).toEqual([]);
  } finally {
    await owner.api.dispose();
    await a.api.dispose();
  }
});

test("owner edits variant SKU, confirmed MRP, publication and parent content", async ({
  page,
}, info) => {
  const owner = await staff();
  const v = product.variants[3];
  try {
    await page.context().addCookies((await owner.api.storageState()).cookies);
    await page.goto(`/admin/products/${product.id}`);
    const details = page
      .locator("details")
      .filter({ has: page.locator("summary").filter({ hasText: v.name }) });
    await details.locator("summary").click();
    await details
      .getByLabel("Variant SKU (optional)")
      .fill(`QA-BROWSER-${info.project.name}`);
    await details.getByLabel("Confirmed MRP (₹)").fill("175");
    await details.getByLabel("I confirm this is the current MRP").check();
    await details.getByLabel("Published variant").uncheck();
    await details
      .getByLabel("Reason for change")
      .fill("QA confirm MRP and hide variant");
    await details
      .getByRole("button", { name: "Save variant", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await db.productVariant.findUniqueOrThrow({ where: { id: v.id } }))
            .published,
      )
      .toBe(false);
    await capture(page, info, "admin-product-variants");
    await page.goto(`/products/${product.slug}`);
    await expect(
      page
        .getByRole("region", { name: "Available variants" })
        .locator("article"),
    ).toHaveCount(3);
    await page.goto(`/admin/products/${product.id}`);
    await details.locator("summary").click();
    await details.getByLabel("Published variant").check();
    await details
      .getByLabel("Reason for change")
      .fill("QA republish confirmed variant");
    await details
      .getByRole("button", { name: "Save variant", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await db.productVariant.findUniqueOrThrow({ where: { id: v.id } }))
            .published,
      )
      .toBe(true);
    await page.goto(`/products/${product.slug}`);
    const card = page
      .getByRole("region", { name: "Available variants" })
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "50g", exact: true }) });
    await expect(card).toContainText(`SKU: QA-BROWSER-${info.project.name}`);
    await expect(card).toContainText("MRP: ₹175.00");
    await page.goto(`/admin/products/${product.id}`);
    const parent = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Parent product", exact: true }),
    });
    await parent.getByLabel("Short description").fill(product.summary);
    await parent
      .getByLabel("Reason for change")
      .fill("QA verify parent content editor");
    await parent
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(parent.getByRole("status")).toContainText(
      "Saved successfully",
    );
  } finally {
    await db.productVariant.update({
      where: { id: v.id },
      data: { sku: null, mrpPaise: null, mrpConfirmed: false, published: true },
    });
    await owner.api.dispose();
  }
});
