import { test, expect, type Page } from "@playwright/test";
import { mkdir, appendFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { db, testIp } from "../fixtures/helpers";
import { staff, submitDealer } from "../fixtures/phase3";
import {
  salesFixture,
  buyerAccount,
  checkout,
  upload,
} from "../fixtures/phase5";
const require = createRequire(import.meta.url);
const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const stage = process.env.FIXUP_UX_STAGE === "before" ? "before" : "after";
const root = `.local/ux-audit/${stage}-${Date.now()}`;
let owner: Awaited<ReturnType<typeof staff>>;
let buyer: Awaited<ReturnType<typeof buyerAccount>>;
let f: Awaited<ReturnType<typeof salesFixture>>;
let orderId: string;
test.beforeAll(async () => {
  await mkdir(root, { recursive: true, mode: 0o700 });
  owner = await staff();
  f = await salesFixture(owner.api, 100);
  buyer = await buyerAccount();
  await submitDealer(buyer.api);
  const o = await checkout(buyer, f.variants[0].id);
  orderId = o.row.id;
  expect((await upload(buyer.api, orderId)).status()).toBe(201);
});
test.afterAll(async () => {
  await buyer?.api.dispose();
  await owner?.api.dispose();
  await db.$disconnect();
});
async function record(page: Page, width: number, name: string) {
  await expect(page.locator("main h1")).toBeVisible();
  await page.addScriptTag({ content: axe });
  const accessibility = await page.evaluate<{
    violations: { id: string; impact: string; nodes: { target: string[] }[] }[];
    incomplete: { id: string }[];
  }>(
    "async () => await axe.run(document.querySelector('main'), {runOnly: {type:'tag', values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})",
  );
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    unlabeled: [
      ...document.querySelectorAll(
        'main input:not([type="hidden"]),main select,main textarea',
      ),
    ].filter(
      (el) =>
        !(el as HTMLInputElement).labels?.length &&
        !el.getAttribute("aria-label") &&
        !el.getAttribute("aria-labelledby"),
    ).length,
    smallTargets: [...document.querySelectorAll("main button,main a")].filter(
      (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.height < 24 || r.width < 24);
      },
    ).length,
    navigationMs: performance
      .getEntriesByType("navigation")
      .map((e) => e.duration)[0],
    images: [...document.querySelectorAll("main img")].map((el) => ({
      loaded:
        (el as HTMLImageElement).complete &&
        (el as HTMLImageElement).naturalWidth > 0,
      width: el.getBoundingClientRect().width,
    })),
  }));
  await page.screenshot({
    path: `${root}/${width}-${name}.png`,
    fullPage: true,
  });
  await appendFile(
    `${root}/observations.jsonl`,
    JSON.stringify({
      width,
      name,
      layout,
      violations: accessibility.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        targets: v.nodes.map((n) => n.target),
      })),
      incomplete: accessibility.incomplete.map((v) => v.id),
    }) + "\n",
    { mode: 0o600 },
  );
}
for (const [width, height] of [
  [375, 812],
  [390, 844],
  [768, 1024],
  [1366, 768],
]) {
  test(`UX atlas ${width}x${height}: public, customer, pending dealer and admin`, async ({
    page,
  }, info) => {
    test.setTimeout(360000);
    await page.setViewportSize({ width, height });
    await page.setExtraHTTPHeaders({ "x-test-client-ip": testIp() });
    for (const [name, path] of Object.entries({
      home: "/",
      catalogue: `/products?q=${encodeURIComponent(f.product.name)}`,
      product: `/products/${f.product.slug}`,
      about: "/about",
      applications: "/applications",
      contact: "/contact",
      dealer: "/become-a-dealer",
      bulk: "/bulk-orders",
      faq: "/faq",
      privacy: "/policies/privacy",
      terms: "/policies/terms",
      shipping: "/policies/shipping",
      returns: "/policies/returns",
      login: "/login",
      register: "/register",
      recovery: "/forgot-password",
      reset: "/reset-password",
      mfa: "/two-factor",
    })) {
      await page.goto(path);
      await record(page, width, name);
    }
    await page.context().addCookies((await buyer.api.storageState()).cookies);
    for (const [name, path] of Object.entries({
      account: "/account",
      profile: "/account/profile",
      addresses: "/account/addresses",
      pending: "/account/dealer",
      emptyCart: "/account/cart",
      checkout: "/account/checkout",
      orders: "/account/orders",
      order: `/account/orders/${orderId}`,
      security: "/account/security",
    })) {
      await page.goto(path);
      if (name === "order")
        await expect(
          page.getByRole("heading", { name: /FIX-SO-/ }),
        ).toBeVisible();
      if (name === "checkout")
        await expect(
          page.getByLabel("Delivery address", { exact: true }),
        ).toBeVisible();
      await record(page, width, name);
    }
    await page.context().clearCookies();
    await page.context().addCookies((await owner.api.storageState()).cookies);
    for (const [name, path] of Object.entries({
      admin: "/admin",
      dealers: "/admin/dealers?status=PENDING",
      products: "/admin/products",
      prices: "/admin/price-lists",
      suppliers: "/admin/operations/suppliers",
      purchasing: "/admin/operations/purchase-orders",
      grn: "/admin/operations/goods-receiving",
      inventory: "/admin/operations/inventory",
      ledger: "/admin/operations/stock-ledger",
      adjustments: "/admin/operations/stock-adjustments",
      sales: "/admin/sales/orders",
      payments: "/admin/sales/payments",
      review: `/admin/sales/orders/${orderId}`,
      dispatch: "/admin/dispatch",
      expenses: "/admin/expenses/new",
      reports: "/admin/reports",
      business: "/admin/business",
    })) {
      const loaded =
        name === "business"
          ? page.waitForResponse(
              (r) =>
                new URL(r.url()).pathname === "/api/v1/admin/reports/dashboard",
              { timeout: 45000 },
            )
          : null;
      await page.goto(path);
      if (loaded) expect((await loaded).status()).toBe(200);
      if (name === "review")
        await expect(
          page.getByRole("button", { name: "Record manual review" }),
        ).toBeVisible();
      await record(page, width, name);
    }
    info.annotations.push({ type: "ux-evidence", description: root });
  });
}
