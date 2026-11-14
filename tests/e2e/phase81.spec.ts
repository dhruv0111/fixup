import { test, expect } from "@playwright/test";
import { registered, db, testIp } from "../fixtures/helpers";
import { totpCode, verificationLink } from "../fixtures/security";
test.afterAll(async () => {
  await db.$disconnect();
});
test("dummy privileged user verifies email and enrolls authenticator through browser, then signs in with MFA", async ({
  page,
}) => {
  test.setTimeout(90000);
  const a = await registered();
  try {
    await page.setExtraHTTPHeaders({ "x-test-client-ip": testIp() });
    await page.context().addCookies((await a.api.storageState()).cookies);
    await db.user.update({ where: { id: a.user.id }, data: { role: "ADMIN" } });
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Access restricted" }),
    ).toBeVisible();
    await page.goto("/account/security");
    await page.getByRole("button", { name: "Send verification link" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Verification link requested",
    );
    await page.goto(await verificationLink(a.credentials.email));
    await expect(
      page.getByText("Email verified.", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Current password", { exact: true })
      .fill(a.credentials.password);
    await page.getByRole("button", { name: "Set up authenticator" }).click();
    const secret = await page
      .getByTestId("authenticator-setup-key")
      .textContent();
    expect(secret).toBeTruthy();
    await page
      .getByLabel("Authenticator code", { exact: true })
      .fill(totpCode(secret!));
    await page.getByRole("button", { name: "Confirm authenticator" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Authenticator confirmed",
    );
    await expect(page.getByTestId("authenticator-setup-key")).toHaveCount(0);
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Admin dashboard", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.goto("/login");
    await page
      .getByLabel("Email address", { exact: true })
      .fill(a.credentials.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(a.credentials.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/two-factor$/);
    await page
      .getByLabel("Authenticator code", { exact: true })
      .fill(totpCode(secret!, 1));
    await page
      .getByRole("button", { name: "Verify sign in", exact: true })
      .click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Admin dashboard", exact: true }),
    ).toBeVisible();
  } finally {
    await a.api.dispose();
  }
});
