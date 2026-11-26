import { test, expect, type Page } from "@playwright/test";
import { db, testIp } from "../fixtures/helpers";
import { staff } from "../fixtures/phase3";
import { salesFixture, buyerAccount, checkout } from "../fixtures/phase5";

let owner: Awaited<ReturnType<typeof staff>>;
let admin: Awaited<ReturnType<typeof staff>>;
test.beforeAll(async () => {
  owner = await staff("SUPER_ADMIN");
  admin = await staff("ADMIN");
});
test.afterAll(async () => {
  await owner.api.dispose();
  await admin.api.dispose();
  await db.$disconnect();
});
async function as(page: Page, who: typeof owner) {
  await page.setExtraHTTPHeaders({ "x-test-client-ip": testIp() });
  await page.context().clearCookies();
  await page.context().addCookies((await who.api.storageState()).cookies);
}
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const sizes = [
  [1440, 900],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [320, 640],
] as const;

test("admin shell, dashboard cards and order pages across screen sizes", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // Playwright injects caret-color while taking screenshots, which React reports as a hydration mismatch.
    if (m.type() === "error" && !m.text().includes("caret-color"))
      errors.push(m.text());
  });
  const f = await salesFixture(owner.api);
  const b = await buyerAccount();
  const o = await checkout(b, f.variants[0].id, 2);
  await b.api.dispose();
  await as(page, owner);

  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    for (const [path, name] of [
      ["/admin", "dashboard"],
      ["/admin/sales/orders", "orders"],
      [`/admin/sales/orders/${o.row.id}`, "order"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("main")).toBeVisible();
      if (name === "orders")
        await expect(
          page.getByRole("link", { name: o.row.number, exact: true }),
        ).toBeVisible();
      if (name === "order")
        await expect(
          page.getByRole("heading", { name: o.row.number }),
        ).toBeVisible();
      expect(await noOverflow(page), `${name} overflow at ${w}`).toBe(true);
      await page.screenshot({
        path: `.local/qa/admin-shell/${name}-${w}.png`,
        fullPage: false,
      });
    }
    const sidebar = page.getByRole("complementary", { name: "Admin sidebar" });
    const menu = page.getByRole("button", { name: "Open admin menu" });
    if (w >= 1024) {
      await expect(sidebar).toBeVisible();
      await expect(menu).toBeHidden();
    } else {
      await expect(sidebar).toBeHidden();
      await page.goto("/admin");
      await menu.click();
      const drawer = page.getByRole("dialog", { name: "Admin menu" });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole("button", { name: "Close" })).toBeFocused();
      await page.screenshot({
        path: `.local/qa/admin-shell/drawer-${w}.png`,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(menu).toBeFocused();
      await menu.click();
      await drawer.getByRole("link", { name: "Sales orders" }).click();
      await expect(page).toHaveURL(/\/admin\/sales\/orders$/);
      await expect(drawer).toBeHidden();
    }
  }

  // Desktop: sidebar navigation, active state and card links.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Administration" });
  await expect(
    nav.getByRole("link", { name: "Dashboard", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Sales orders" }).click();
  await expect(page).toHaveURL(/\/admin\/sales\/orders$/);
  await expect(nav.getByRole("link", { name: "Sales orders" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goto("/admin");
  await page.getByRole("link", { name: /Pending payments/ }).click();
  await expect(page).toHaveURL(/status=PENDING_PAYMENT/);
  await expect(
    page.getByRole("link", { name: o.row.number, exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Order status")).toHaveValue("PENDING_PAYMENT");
  await page.goto("/admin/sales/orders?status=DELIVERED");
  await expect(page.getByLabel("Order status")).toHaveValue("DELIVERED");

  // Collapsible group.
  await page.goto("/admin");
  const heading = nav.getByRole("button", { name: /Settings/ });
  await expect(heading).toHaveAttribute("aria-expanded", "true");
  await heading.click();
  await expect(heading).toHaveAttribute("aria-expanded", "false");

  // Role-based visibility: ADMIN has no settings or catalogue editing links.
  await as(page, admin);
  await page.goto("/admin");
  await expect(nav.getByRole("link", { name: "Sales orders" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Sales settings" })).toHaveCount(
    0,
  );
  await expect(
    nav.getByRole("link", { name: "Products & variants" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
