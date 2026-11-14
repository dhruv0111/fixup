import { test, expect } from "@playwright/test";
import { dummyCredentials, testIp, db } from "../fixtures/helpers";
import { secureAccount } from "../fixtures/security";

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-test-client-ip": testIp() });
});
test.afterAll(async () => {
  await db.$disconnect();
});

test("public pages, responsive navigation, recovery and not-found render", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Strong Bond. Lasting Trust." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `.local/qa/home-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Sign in", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(
    page.getByRole("button", { name: "Send reset link" }),
  ).toBeVisible();
  await page.goto("/reset-password");
  // Next.js also creates a route-announcer alert outside the page's main content.
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "valid reset link",
  );
  const notFound = await page.goto("/page-that-does-not-exist");
  expect(notFound?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "This page isn’t here." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("browser registration, protected account, denied admin, logout and login", async ({
  page,
}) => {
  const data = dummyCredentials();
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/register");
  await page.getByLabel("Full name").fill(data.name);
  await page.getByLabel("Email address").fill(data.email);
  await page.getByLabel("Password", { exact: true }).fill(data.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(data.email, { exact: true })).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Access restricted" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address").fill(data.email);
  await page.getByLabel("Password", { exact: true }).fill(data.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("button", { name: "Sign out all devices" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("admin dashboard renders for a privileged dummy user", async ({
  page,
}) => {
  const data = dummyCredentials();
  await page.goto("/register");
  await page.getByLabel("Full name").fill(data.name);
  await page.getByLabel("Email address").fill(data.email);
  await page.getByLabel("Password", { exact: true }).fill(data.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await secureAccount({
    api: page.request,
    credentials: data,
    user: await db.user.findUniqueOrThrow({ where: { email: data.email } }),
  });
  await db.user.update({
    where: { email: data.email },
    data: { role: "ADMIN" },
  });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Admin dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent activity" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
