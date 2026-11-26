import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mkdir, appendFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { staff } from "../fixtures/phase3";
import { db, testIp } from "../fixtures/helpers";
import { checkout, upload } from "../fixtures/phase5";
import { scenario, confirmed } from "../fixtures/phase6";

const require = createRequire(import.meta.url);
const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
let owner: Awaited<ReturnType<typeof staff>>;
let shipment: Awaited<ReturnType<typeof scenario>>;
let unpaid: Awaited<ReturnType<typeof checkout>>;
let dispatchId: string;
const evidence = `.local/final-qa-${Date.now()}`;

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  owner = await staff();
  shipment = await scenario(owner.api, true, true);
  dispatchId = (await confirmed(owner.api, shipment.o.row.id)).id;
  unpaid = await checkout(shipment.b, shipment.f.variants[0].id, 2);
  expect((await upload(shipment.b.api, unpaid.row.id)).status()).toBe(201);
});
test.afterAll(async () => {
  await shipment?.b.api.dispose();
  await owner?.api.dispose();
  await db.$disconnect();
});

async function signIn(page: Page, account: typeof owner) {
  await page.setExtraHTTPHeaders({ "x-test-client-ip": testIp() });
  await page.context().clearCookies();
  await page.context().addCookies((await account.api.storageState()).cookies);
}

async function audit(page: Page, info: TestInfo, name: string) {
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.getByText(/^Loading .+…$/)).toHaveCount(0);
  await page.addScriptTag({ content: axe });
  const accessibility = await page.evaluate<{
    violations: { id: string; impact: string; nodes: unknown[] }[];
    incomplete: { id: string; nodes: unknown[] }[];
  }>(
    "axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})",
  );
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    controls: [
      ...document.querySelectorAll(
        "main input:not([type=hidden]), main select, main textarea",
      ),
    ].map((el) => ({
      name: (el as HTMLInputElement).name,
      labeled:
        !!(el as HTMLInputElement).labels?.length ||
        !!el.getAttribute("aria-label") ||
        !!el.getAttribute("aria-labelledby"),
    })),
  }));
  await appendFile(
    `${evidence}/${info.project.name}-observations.jsonl`,
    JSON.stringify({ name, layout, ...accessibility }) + "\n",
    { mode: 0o600 },
  );
  await page.screenshot({
    path: `${evidence}/${info.project.name}-${name}.png`,
    scale: "css",
    fullPage:
      (await page.evaluate(() => document.documentElement.scrollHeight)) < 8000,
  });
  expect(layout.scrollWidth, `${name}: document overflow`).toBeLessThanOrEqual(
    layout.width,
  );
  expect(
    layout.controls.filter((c) => !c.labeled),
    `${name}: unlabelled controls`,
  ).toEqual([]);
  expect(accessibility.violations, `${name}: axe violations`).toEqual([]);
  info.annotations.push({ type: "final-qa-evidence", description: evidence });
}

test("customer payment instructions are reachable by keyboard at 320px and 390px", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await signIn(page, shipment.b);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/account/orders/${unpaid.row.id}`);
    const link = page.getByRole("link", {
      name: "Payment instructions",
      exact: true,
    });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "#payment-instructions");
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#payment-instructions$/);
    await expect(page.locator("#payment-instructions h2")).toBeInViewport();
    await expect(page.locator("#payment-instructions")).toContainText(
      "qa-only@example",
    );
    await expect(
      page.getByRole("button", { name: "Submit for verification" }),
    ).toBeEnabled();
    await page.locator("#payment-instructions").screenshot({
      path: `${evidence}/${info.project.name}-instructions-${width}.png`,
      scale: "css",
    });
    await page.getByRole("list", { name: "Order progress" }).screenshot({
      path: `${evidence}/${info.project.name}-timeline-${width}.png`,
      scale: "css",
    });
    await page
      .locator("section")
      .filter({
        has: page.getByRole("heading", {
          name: "Ordered products",
          exact: true,
        }),
      })
      .screenshot({
        path: `${evidence}/${info.project.name}-ordered-products-${width}.png`,
        scale: "css",
      });
    await audit(page, info, `customer-order-${width}`);
  }
});

test("mobile admin menu keeps keyboard focus and unique expandable section targets", async ({
  page,
}, info) => {
  await signIn(page, owner);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/admin");
  const trigger = page.getByRole("button", { name: "Open admin menu" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Admin menu" });
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeFocused();
  const targets = await dialog
    .locator("[aria-controls]")
    .evaluateAll((controls) =>
      controls.map((el) => {
        const id = el.getAttribute("aria-controls")!;
        return {
          count: document.querySelectorAll(`[id="${id}"]`).length,
          inside: !!document.getElementById(id)?.closest('[role="dialog"]'),
        };
      }),
    );
  expect(targets.length).toBeGreaterThan(0);
  expect(targets.every((t) => t.count === 1 && t.inside)).toBe(true);
  await page.keyboard.press("Shift+Tab");
  const last = dialog.getByRole("link").last();
  await expect(last).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  const focus = await close.evaluate((el) => ({
    width: getComputedStyle(el).outlineWidth,
    style: getComputedStyle(el).outlineStyle,
    height: el.getBoundingClientRect().height,
  }));
  expect(Number.parseFloat(focus.width)).toBeGreaterThanOrEqual(2);
  expect(focus.style).not.toBe("none");
  expect(focus.height).toBeGreaterThanOrEqual(44);
  await audit(page, info, "admin-menu-320");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("remaining admin modules are accessible and fit a 320px viewport", async ({
  page,
}, info) => {
  test.setTimeout(300000);
  await signIn(page, owner);
  await page.setViewportSize({ width: 320, height: 844 });
  for (const [name, path] of Object.entries({
    products: "/admin/products",
    variants: `/admin/products/${shipment.f.product.id}`,
    prices: "/admin/price-lists",
    purchase: "/admin/operations/purchase-orders",
    receiving: "/admin/operations/goods-receiving",
    inventory: "/admin/operations/inventory",
    expense: "/admin/expenses/new",
    settings: "/admin/sales/settings",
    reports: "/admin/reports",
    order: `/admin/sales/orders/${unpaid.row.id}`,
    payments: "/admin/sales/payments",
    dispatch: `/admin/dispatch/${dispatchId}`,
  })) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    if (name === "order")
      await expect(
        page.getByRole("button", { name: "Record manual review" }),
      ).toBeVisible();
    if (name === "dispatch")
      await expect(page.getByLabel("Delivery action")).toBeVisible();
    if (name === "prices")
      expect(
        await page
          .getByLabel("Search price lists")
          .evaluate((el) => el.getBoundingClientRect().width),
      ).toBeGreaterThanOrEqual(200);
    if (name === "inventory") {
      await expect(
        page.getByRole("group", { name: "Stock summary" }),
      ).toBeVisible();
      const table = page.getByRole("region", { name: "Report data" }).first();
      await expect(table.getByRole("columnheader").first()).toBeVisible();
      await table.focus();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() => table.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
    }
    await audit(page, info, `${name}-320`);
  }
});
