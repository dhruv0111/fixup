import { test, expect, type Page } from "@playwright/test";
import { db, testIp } from "../fixtures/helpers";
import { staff, submitDealer } from "../fixtures/phase3";
import {
  salesFixture,
  buyerAccount,
  checkout,
  upload,
} from "../fixtures/phase5";

let owner: Awaited<ReturnType<typeof staff>>;
test.beforeAll(async () => {
  owner = await staff("SUPER_ADMIN");
});
test.afterAll(async () => {
  await owner.api.dispose();
  await db.$disconnect();
});
const sizes = [
  [1440, 900],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [320, 640],
] as const;
const overflow = (page: Page) =>
  page.evaluate(() => ({
    over: document.documentElement.scrollWidth - innerWidth,
    wide: [...document.querySelectorAll("body *")]
      .filter(
        (e) =>
          e.getBoundingClientRect().right > innerWidth + 1 &&
          !e.closest(".o-scroll, .o-tabs, [role='region'], .sr-only") &&
          !e.classList.contains("sr-only"),
      )
      .slice(0, 5)
      .map((e) => `${e.tagName}.${String(e.className).slice(0, 40)}`),
  }));
async function visit(
  page: Page,
  path: string,
  name: string,
  w: number,
  ready: (page: Page) => Promise<unknown>,
) {
  await page.goto(path);
  await ready(page);
  await page.waitForLoadState("networkidle");
  const o = await overflow(page);
  expect(
    o.over,
    `${name} @${w} overflows by ${o.over}px: ${o.wide}`,
  ).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `.local/qa/phase5/${name}-${w}.png` });
}

test("admin and customer pages stay readable and within the viewport", async ({
  page,
}) => {
  test.setTimeout(600000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("caret-color"))
      errors.push(m.text());
  });
  const f = await salesFixture(owner.api);
  const b = await buyerAccount();
  const o = await checkout(b, f.variants[0].id, 2);
  expect((await upload(b.api, o.row.id)).status()).toBeLessThan(300);
  const d = await buyerAccount();
  await submitDealer(d.api);
  await page.setExtraHTTPHeaders({ "x-test-client-ip": testIp() });

  const adminPages: [string, string, (p: Page) => Promise<unknown>][] = [
    [
      "/admin",
      "dashboard",
      (p) =>
        expect(
          p.getByRole("heading", { name: "Admin dashboard" }),
        ).toBeVisible(),
    ],
    [
      "/admin/sales/orders",
      "orders",
      (p) =>
        expect(
          p.getByRole("link", { name: o.row.number, exact: true }),
        ).toBeVisible(),
    ],
    [
      `/admin/sales/orders/${o.row.id}`,
      "order",
      (p) =>
        expect(p.getByRole("heading", { name: o.row.number })).toBeVisible(),
    ],
    [
      "/admin/sales/payments",
      "payments",
      (p) => expect(p.getByText(/Waiting for verification/)).toBeVisible(),
    ],
    [
      "/admin/dealers?status=PENDING",
      "dealers",
      (p) =>
        expect(p.getByText("Waiting for your review").first()).toBeVisible(),
    ],
    [
      "/admin/customers",
      "customers",
      (p) =>
        expect(
          p.getByRole("heading", { name: "Customers", exact: true }),
        ).toBeVisible(),
    ],
    [
      "/admin/operations/inventory",
      "inventory",
      (p) => expect(p.getByText("Available units").first()).toBeVisible(),
    ],
    [
      "/admin/operations/purchase-orders",
      "purchase-orders",
      (p) =>
        expect(
          p.getByRole("heading", { name: "Purchase Orders" }),
        ).toBeVisible(),
    ],
    [
      "/admin/operations/goods-receiving",
      "goods-receiving",
      (p) =>
        expect(
          p.getByRole("heading", { name: "Goods Receiving" }),
        ).toBeVisible(),
    ],
    [
      "/admin/dispatch",
      "dispatch",
      (p) =>
        expect(
          p.getByRole("heading", { name: /Ready for dispatch/ }),
        ).toBeVisible(),
    ],
    [
      "/admin/reports",
      "reports",
      (p) =>
        expect(
          p.getByRole("heading", { name: "Business reports" }),
        ).toBeVisible(),
    ],
    [
      "/admin/products",
      "products",
      (p) => expect(p.getByRole("main")).toBeVisible(),
    ],
    [
      "/admin/price-lists",
      "price-lists",
      (p) => expect(p.getByRole("main")).toBeVisible(),
    ],
    [
      "/admin/expenses/new",
      "expense-new",
      (p) => expect(p.getByRole("main")).toBeVisible(),
    ],
    [
      "/admin/sales/settings",
      "settings",
      (p) => expect(p.getByRole("main")).toBeVisible(),
    ],
  ];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.context().clearCookies();
    await page.context().addCookies((await owner.api.storageState()).cookies);
    for (const [path, name, ready] of adminPages) {
      await visit(page, path, name, w, ready);
      // The public website header and footer must not appear inside admin.
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toHaveCount(0);
      await expect(page.locator("footer.site-footer")).toHaveCount(0);
    }
    await page.context().clearCookies();
    await page.context().addCookies((await b.api.storageState()).cookies);
    await visit(page, "/account/orders", "my-orders", w, (p) =>
      expect(
        p.getByRole("link", { name: o.row.number, exact: true }),
      ).toBeVisible(),
    );
    await visit(page, `/account/orders/${o.row.id}`, "my-order", w, (p) =>
      expect(p.getByRole("heading", { name: o.row.number })).toBeVisible(),
    );
    // Customer pages keep the public header and footer.
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
    await expect(page.locator("footer.site-footer")).toBeVisible();
  }
  await b.api.dispose();
  await d.api.dispose();
  expect(errors).toEqual([]);
});
