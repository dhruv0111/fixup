import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { db, registered, testIp } from "../fixtures/helpers";
import { staff } from "../fixtures/phase3";
import {
  fixture,
  supplierData,
  root,
  balance,
  submitted,
  receive,
} from "../fixtures/phase4";
let owner: Awaited<ReturnType<typeof staff>>,
  f: Awaited<ReturnType<typeof fixture>>;
test.beforeAll(async () => {
  owner = await staff();
});
test.beforeEach(async ({ page }) => {
  f = await fixture(owner.api);
  await page.setExtraHTTPHeaders({ "x-test-client-ip": testIp() });
  await page.context().addCookies((await owner.api.storageState()).cookies);
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
    path: `.local/qa/phase4/${name}-${info.project.name}.png`,
    fullPage: true,
  });
}
async function confirm(page: Page, name: string) {
  const box = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await box
    .getByLabel("Reason for change")
    .fill("QA browser confirmed operation");
  await box.getByRole("checkbox").check();
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.url().includes("/api/v1/admin/operations/"),
  );
  await box.getByRole("button", { name, exact: true }).click();
  expect((await response).status()).toBe(200);
}

test("supplier form creates, edits, searches and retains product links", async ({
  page,
}, info) => {
  const data = supplierData(
    `QA Browser Supplier ${Date.now()} ${info.project.name}`,
  );
  await page.goto("/admin/operations/suppliers/new");
  const form = page.locator("form");
  for (const key of [
    "name",
    "contactName",
    "phone",
    "email",
    "address",
    "city",
    "state",
    "postalCode",
    "supplierType",
    "paymentTerms",
    "notes",
    "reason",
  ] as const)
    await form.locator(`[name="${key}"]`).fill(data[key]);
  await form
    .getByLabel("Products / variants supplied")
    .selectOption(f.variants.map((v) => v.id));
  await form.getByRole("button", { name: "Create supplier" }).click();
  await expect(page).toHaveURL(/\/admin\/operations\/suppliers$/);
  await page.getByLabel("Search", { exact: true }).fill(data.name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(data.name) })
    .click();
  await expect(
    page.getByRole("heading", { name: data.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Products supplied" }),
  ).toBeVisible();
  await capture(page, info, "supplier-detail");
  await page.getByLabel("Supplier status").selectOption("INACTIVE");
  await page
    .getByLabel("Reason for change")
    .fill("QA browser deactivate supplier");
  await page.getByRole("button", { name: "Save supplier" }).click();
  await expect(page.getByRole("status")).toContainText("Saved successfully");
  await page.reload();
  await expect(page.getByLabel("Supplier status")).toHaveValue("INACTIVE");
  await page.goto("/admin/operations/suppliers?status=INACTIVE");
  await expect(
    page.getByRole("main").getByRole("link", { name: new RegExp(data.name) }),
  ).toBeVisible();
  await capture(page, info, "suppliers");
});

test("purchase draft and partial goods receiving work from the browser", async ({
  page,
}, info) => {
  await page.goto("/admin/operations/purchase-orders/new");
  await page
    .getByLabel("Supplier", { exact: true })
    .selectOption(f.supplier.id);
  for (let i = 1; i <= 2; i++) {
    await page
      .getByRole("button", { name: "Add variant", exact: true })
      .click();
    await page
      .getByLabel(`Variant ${i}`, { exact: true })
      .selectOption(f.variants[i - 1].id);
    await page
      .getByLabel(`Quantity ${i}`, { exact: true })
      .fill(i === 1 ? "10" : "4");
    await page
      .getByLabel(`Purchase rate (₹) ${i}`, { exact: true })
      .fill("12.50");
    await page.getByLabel(`Tax (%) ${i}`, { exact: true }).fill("0");
  }
  await page
    .getByLabel("Reason for change")
    .fill("QA browser actual purchase entry");
  await page.getByRole("button", { name: "Save PO draft" }).click();
  await expect(page).toHaveURL(
    /\/admin\/operations\/purchase-orders\/c[a-z0-9]+$/,
  );
  const poId = page.url().split("/").at(-1)!;
  await expect(
    page.getByRole("heading", { name: "Server-calculated totals" }),
  ).toBeVisible();
  await expect(page.getByText("Total: ₹175.00", { exact: true })).toBeVisible();
  expect((await balance(f.variants[0].id)).available).toBe(0);
  await capture(page, info, "purchase-order");
  await confirm(page, "Submit purchase order");
  await expect(
    page.getByText("SUBMITTED", { exact: true }).first(),
  ).toBeVisible();
  expect((await balance(f.variants[0].id)).available).toBe(0);
  await page.getByRole("link", { name: "Receive goods", exact: true }).click();
  const received = page.getByLabel(`Received quantity ${f.variants[0].name}`, {
    exact: true,
  });
  await received.fill("3");
  const line = page.locator("form section").filter({
    has: page.getByRole("heading", {
      name: new RegExp(`${f.variants[0].name} · Remaining`),
    }),
  });
  await line.getByLabel("Batch number (optional)").fill("QA-BROWSER-BATCH");
  await line.getByLabel("Manufacturing date (optional)").fill("2026-01-01");
  await line.getByLabel("Expiry date (optional)").fill("2027-01-01");
  await page
    .getByLabel("Supplier invoice / reference (optional)")
    .fill("QA browser invoice");
  await page
    .getByLabel("Reason for change")
    .fill("QA browser receiving quantities");
  await page.getByRole("button", { name: "Save GRN draft" }).click();
  await expect(page).toHaveURL(
    /\/admin\/operations\/goods-receiving\/c[a-z0-9]+$/,
  );
  expect((await balance(f.variants[0].id)).available).toBe(0);
  await confirm(page, "Confirm goods received");
  await expect(
    page.getByText("COMPLETED", { exact: true }).first(),
  ).toBeVisible();
  expect((await balance(f.variants[0].id)).available).toBe(3);
  expect((await balance(f.variants[1].id)).available).toBe(0);
  await capture(page, info, "goods-receipt");
  await page.goto(`/admin/operations/purchase-orders/${poId}`);
  await expect(
    page.getByText("PARTIALLY_RECEIVED", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Receive goods", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: `${f.variants[0].name} · Remaining 7`,
      exact: true,
    }),
  ).toBeVisible();
});

test("inventory adjustment, lot traceability, damage and thresholds are usable", async ({
  page,
}, info) => {
  const p = await submitted(owner.api, f);
  const g = await receive(owner.api, p, 10);
  const lot = g.lines[0].lot.id;
  await page.goto("/admin/operations/stock-adjustments");
  await page
    .getByLabel("Variant", { exact: true })
    .selectOption(f.variants[0].id);
  await page.getByLabel("Stock lot", { exact: true }).selectOption(lot);
  await page.getByLabel("Adjustment type").selectOption("DAMAGE");
  await page.getByLabel("Quantity change").fill("2");
  await page.getByLabel("Reason for change").fill("QA browser damaged count");
  await page.getByRole("checkbox").check();
  await capture(page, info, "stock-adjustment");
  await page.getByRole("button", { name: "Apply stock adjustment" }).click();
  await expect(page).toHaveURL(/\/admin\/operations\/stock-ledger$/);
  expect(await balance(f.variants[0].id)).toEqual({ available: 8, damaged: 2 });
  await capture(page, info, "stock-ledger");
  await page.goto(`/admin/operations/inventory/${f.variants[0].id}`);
  await page.getByLabel("Minimum units").fill("10");
  await page
    .getByLabel("Reason for change")
    .fill("QA browser threshold configured");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect
    .poll(
      async () =>
        (
          await db.stockSetting.findUnique({
            where: { variantId: f.variants[0].id },
          })
        )?.minimumQuantity,
    )
    .toBe(10);
  await capture(page, info, "variant-inventory");
  await page.goto(
    `/admin/operations/inventory?status=LOW&q=${encodeURIComponent(f.product.name)}`,
  );
  await expect(
    page.getByRole("link", {
      name: `${f.variants[0].name}: lots and threshold`,
      exact: true,
    }),
  ).toBeVisible();
  await capture(page, info, "inventory-dashboard");
  await page.goto(`/admin/operations/lots/${lot}`);
  await expect(page.getByRole("main")).toContainText("QA-BATCH");
  await capture(page, info, "batch-traceability");
});

test("reports filter and export CSV while customers are denied internal pages", async ({
  page,
}, info) => {
  const p = await submitted(owner.api, f);
  await receive(owner.api, p, 4);
  await page.goto("/admin/operations/reports");
  await page.getByLabel("Report", { exact: true }).selectOption("purchases");
  await page.getByLabel("Search", { exact: true }).fill(p.number);
  await page.getByRole("button", { name: "Run report" }).click();
  await expect(page.getByRole("region", { name: "Report data" })).toContainText(
    p.number,
  );
  await capture(page, info, "purchase-report");
  const csv = await page.request.get(
    (await page
      .getByRole("link", { name: "Export CSV" })
      .getAttribute("href"))!,
  );
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain(p.number);
  await page.getByLabel("Report", { exact: true }).selectOption("movements");
  await page.getByLabel("Search", { exact: true }).fill("");
  await page.getByLabel("From date").fill("2099-01-01");
  await page.getByLabel("To date").fill("2099-12-31");
  await page.getByRole("button", { name: "Run report" }).click();
  await expect(
    page.getByText("No matching records.", { exact: true }),
  ).toBeVisible();
  const customer = await registered();
  try {
    await page.context().clearCookies();
    await page
      .context()
      .addCookies((await customer.api.storageState()).cookies);
    await page.goto("/admin/operations/inventory");
    await expect(page).toHaveURL(/\/account$/);
    expect(
      (await customer.api.get(`${root}/reports?kind=purchases`)).status(),
    ).toBe(403);
  } finally {
    await customer.api.dispose();
  }
});
