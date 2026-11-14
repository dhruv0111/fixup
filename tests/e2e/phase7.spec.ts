import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { db, testIp, registered } from "../fixtures/helpers";
import { staff } from "../fixtures/phase3";
import { knownCostScenario, expense } from "../fixtures/phase7";
import { png } from "../fixtures/phase5";
import { reportKinds, reportNames } from "../../src/modules/reports/schemas";
let owner: Awaited<ReturnType<typeof staff>>;
test.beforeAll(async () => {
  owner = await staff();
});
test.afterAll(async () => {
  await owner.api.dispose();
  await db.$disconnect();
});
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-test-client-ip": testIp() });
  await page.context().addCookies((await owner.api.storageState()).cookies);
});
async function capture(page: Page, info: TestInfo, name: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `.local/qa/phase7/${name}-${info.project.name}.png`,
    fullPage: true,
  });
}
test("owner dashboard displays real KPI definitions, charts and business-date filters", async ({
  page,
}, info) => {
  const s = await knownCostScenario(owner.api);
  await page.goto("/admin/business");
  await expect(
    page.getByRole("heading", {
      name: "FIXUP business dashboard",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Orders created", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Asia\/Kolkata/).first()).toBeVisible();
  await expect(page.getByRole("figure").first()).toBeVisible();
  await capture(page, info, "owner-dashboard");
  await page
    .getByLabel("Date range", { exact: true })
    .selectOption("yesterday");
  await page.getByRole("button", { name: "Apply report filters" }).click();
  await expect(page.getByText(/Loading recorded/)).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Today's order value (within selection)",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Date range", { exact: true }).selectOption("custom");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  await page.getByLabel("From date", { exact: true }).fill(today);
  await page.getByLabel("To date", { exact: true }).fill(today);
  await page.getByRole("button", { name: "Apply report filters" }).click();
  await expect(
    page.getByText(new RegExp(`${today} to ${today}`)),
  ).toBeVisible();
  await capture(page, info, "custom-date-dashboard");
  await s.b.api.dispose();
});
test("all centralized reports render, expose safe exports and support QWIK variant comparison", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const s = await knownCostScenario(owner.api);
  await expense(owner.api, { reference: s.o.row.number });
  for (const kind of reportKinds) {
    await page.goto(`/admin/reports/${kind}`);
    await expect(
      page
        .getByRole("heading", { name: reportNames[kind], exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Export filtered CSV", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (
      [
        "sales",
        "payments",
        "inventory",
        "profitability",
        "deliveries",
        "products",
      ].includes(kind)
    )
      await capture(page, info, `${kind}-report`);
    if (kind === "products")
      await expect(
        page.getByRole("heading", { name: "FIXUP QWIK pack-size comparison" }),
      ).toBeVisible();
  }
  await page.goto("/admin/reports/sales");
  await page
    .getByLabel("SO number or customer / dealer", { exact: true })
    .fill(s.o.row.number);
  await page.getByRole("button", { name: "Apply report filters" }).click();
  await expect(
    page.locator("tbody").first().getByText(s.o.row.number, { exact: true }),
  ).toBeVisible();
  const href = await page
    .getByRole("link", { name: "Export filtered CSV" })
    .getAttribute("href");
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain(s.o.row.number);
  expect(await response.text()).not.toMatch(
    /fileBytes|paymentDetails|internalRemarks/,
  );
  await s.b.api.dispose();
});
test("expense forms create, edit, attach a private receipt and cancel without deleting history", async ({
  page,
}, info) => {
  const title = `QA browser expense ${info.project.name} ${Date.now()}`;
  await page.goto("/admin/expenses/new");
  await page.getByLabel("Expense title", { exact: true }).fill(title);
  await page
    .getByLabel("Expense category", { exact: true })
    .selectOption("COURIER");
  await page.getByLabel("Expense amount (₹)", { exact: true }).fill("123.45");
  await page
    .getByLabel("Actual expense date", { exact: true })
    .fill(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  await page
    .getByLabel("Reason for expense record / edit", { exact: true })
    .fill("QA actual courier expense receipt");
  await page
    .getByRole("button", { name: "Record expense", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/expenses\/c[a-z0-9]+$/);
  await expect(
    page.getByRole("heading", { name: `${title} · ACTIVE`, exact: true }),
  ).toBeVisible();
  await capture(page, info, "expense-detail");
  const id = page.url().split("/").at(-1)!;
  await page.getByLabel("Expense amount (₹)", { exact: true }).fill("150.50");
  await page
    .getByLabel("Reason for expense record / edit", { exact: true })
    .fill("QA receipt revised after checking bill");
  await page
    .getByRole("button", { name: "Save expense changes", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await db.businessExpense.findUniqueOrThrow({ where: { id } }))
          .amountPaise,
    )
    .toBe(15050);
  await expect(
    page.getByLabel("Expense amount (₹)", { exact: true }),
  ).toHaveValue("150.5");
  await page.getByLabel("Receipt image", { exact: true }).setInputFiles({
    name: "QA-private-receipt.png",
    mimeType: "image/png",
    buffer: await png(),
  });
  await page
    .getByRole("button", { name: "Attach private receipt", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: /QA-private-receipt/ }),
  ).toBeVisible();
  await capture(page, info, "expense-private-receipt");
  await page
    .getByLabel("Cancellation reason", { exact: true })
    .fill("QA mistaken expense cancelled with evidence preserved");
  await page
    .getByRole("button", { name: "Cancel expense record", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `${title} · CANCELLED`, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Revision 2 · CANCELLED/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save expense changes" }),
  ).toHaveCount(0);
  await capture(page, info, "expense-cancelled-history");
});
test("operational admin sees restricted dashboard and customer cannot open financial pages", async ({
  page,
}, info) => {
  const admin = await staff("ADMIN");
  await page.context().clearCookies();
  await page.context().addCookies((await admin.api.storageState()).cookies);
  await page.goto("/admin/business");
  await expect(
    page.getByText(
      "Valuation and estimated profitability require owner financial access.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Estimated gross profit", exact: true }),
  ).toHaveCount(0);
  await capture(page, info, "operational-dashboard");
  await page.goto("/admin/reports/profitability");
  await expect(page).toHaveURL(/\/account$/);
  const a = await registered();
  await page.context().clearCookies();
  await page.context().addCookies((await a.api.storageState()).cookies);
  await page.goto("/admin/reports/sales");
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/admin/expenses/new");
  await expect(page).toHaveURL(/\/account$/);
  await admin.api.dispose();
  await a.api.dispose();
});
