import { test, expect } from "@playwright/test";
import { secureAccount } from "../fixtures/security";
import { db, testIp, registered } from "../fixtures/helpers";
import { catalogueFixture } from "../fixtures/catalogue";
let fixture: Awaited<ReturnType<typeof catalogueFixture>>;
test.beforeAll(async () => {
  fixture = await catalogueFixture();
  await db.websiteContent.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", whatsapp: "919000000000" },
    update: { whatsapp: "919000000000" },
  });
  await db.faq.create({
    data: {
      question: `Published ${fixture.prefix}?`,
      answer: "QA published answer only.",
      published: true,
    },
  });
  await db.faq.create({
    data: {
      question: `Private ${fixture.prefix}?`,
      answer: "QA hidden answer.",
      published: false,
    },
  });
});
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-test-client-ip": testIp() });
});
test.afterAll(async () => {
  await db.$disconnect();
});

test("all public pages have metadata, headings and fit the viewport", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of [
    "/",
    "/about",
    "/products",
    "/applications",
    "/become-a-dealer",
    "/bulk-orders",
    "/contact",
    "/faq",
    "/policies/privacy",
    "/policies/terms",
    "/policies/shipping",
    "/policies/returns",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1 }),
    ).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `http://127.0.0.1:3100${path}`,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      /FIXUP/,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (path.startsWith("/policies/"))
      await expect(
        page.getByText("Draft — pending business/legal approval."),
      ).toBeVisible();
    if (["/", "/contact", "/become-a-dealer"].includes(path))
      await page.screenshot({
        path: `.local/qa/phase2-${path === "/" ? "home" : path.slice(1)}-${info.project.name}.png`,
        fullPage: true,
      });
  }
  expect(errors).toEqual([]);
});
test("catalogue search, category, pagination and product navigation work", async ({
  page,
}, info) => {
  await page.goto("/products");
  await page
    .getByLabel("Category", { exact: true })
    .selectOption(fixture.category.slug);
  await page.getByRole("button", { name: "Find products" }).click();
  await expect(page.getByText("14 products found")).toBeVisible();
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await page.getByLabel("Search products").fill(fixture.products[2].sku!);
  await page.getByRole("button", { name: "Find products" }).click();
  await expect(page.getByText("1 product found")).toBeVisible();
  await page.screenshot({
    path: `.local/qa/phase2-products-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "View details" }).click();
  await expect(
    page.getByRole("heading", { name: fixture.products[2].name, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("DEVELOPMENT DEMO · NOT FOR SALE")).toBeVisible();
  const whatsapp = page
    .getByRole("main")
    .getByRole("link", { name: /Chat on WhatsApp/ });
  const href = new URL((await whatsapp.getAttribute("href"))!);
  expect(href.searchParams.get("text")).toContain(fixture.products[2].sku);
  await page.screenshot({
    path: `.local/qa/phase2-product-detail-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: /Enquire about this product/ }).click();
  await expect(page.getByLabel("Product (optional)")).toHaveValue(
    fixture.products[2].id,
  );
  await page.goto(`/products/${fixture.hidden.slug}`);
  await expect(
    page.getByRole("heading", { name: "This page isn’t here." }),
  ).toBeVisible();
});
test("contact, bulk and dealer forms submit from the browser", async ({
  page,
}) => {
  for (const kind of ["contact", "bulk-orders", "become-a-dealer"]) {
    // Different clients avoid making this browser workflow a rate-limit test.
    await page.setExtraHTTPHeaders({ "x-test-client-ip": testIp() });
    await page.goto(`/${kind}`);
    await page
      .getByLabel(
        kind === "become-a-dealer" ? "Contact person *" : "Your name *",
        { exact: true },
      )
      .fill("QA Browser Customer");
    await page.getByLabel("Mobile number *").fill("9000000000");
    if (kind === "bulk-orders") {
      await page
        .getByLabel("Product *", { exact: true })
        .selectOption(fixture.products[0].id);
      await page
        .getByLabel("Required quantity (include units) *")
        .fill("10 demo packs");
      await page.getByLabel("Delivery location *").fill("QA City");
    }
    if (kind === "become-a-dealer") {
      for (const [label, value] of [
        ["Business name *", "QA Shop"],
        ["Email *", "qa@example.invalid"],
        ["Business address *", "QA Street"],
        ["City *", "QA City"],
        ["PIN code *", "400001"],
        ["Business type *", "Hardware shop"],
        ["Expected purchase quantity *", "10 demo packs"],
      ])
        await page.getByLabel(label, { exact: true }).fill(value);
    }
    await page
      .getByLabel(
        kind === "become-a-dealer"
          ? "Additional message (optional)"
          : kind === "contact"
            ? "Message *"
            : "Message (optional)",
        { exact: true },
      )
      .fill(`QA browser ${kind} ${Date.now()}`);
    await page.getByRole("checkbox").check();
    // Server-issued challenge requires at least two seconds of form time.
    await page.waitForTimeout(2100);
    await page
      .getByRole("button", { name: /Send (enquiry|dealer application)/ })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Your enquiry has been received",
    );
  }
});
test("invalid form, FAQ publication, sitemap and indexing protections", async ({
  page,
  request,
}) => {
  await page.goto("/contact");
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByLabel("Your name *")).toBeFocused();
  await page.goto("/faq");
  await page.getByText(`Published ${fixture.prefix}?`, { exact: true }).click();
  await expect(
    page.getByText("QA published answer only.").last(),
  ).toBeVisible();
  await expect(
    page.getByText(`Private ${fixture.prefix}?`, { exact: true }),
  ).toHaveCount(0);
  expect(await (await request.get("/robots.txt")).text()).toContain(
    "Disallow: /",
  );
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/products");
  expect(sitemap).not.toContain(fixture.hidden.slug);
  expect(sitemap).not.toContain("/admin");
  expect(sitemap).not.toContain(fixture.products[0].slug);
  await page.goto("/bulk-orders");
  const href = new URL(
    (await page
      .getByRole("main")
      .getByRole("link", { name: /Chat on WhatsApp/ })
      .getAttribute("href"))!,
  );
  expect(href.searchParams.get("text")).toContain("bulk order");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("owner content editor publishes FAQs while ordinary accounts are denied", async ({
  page,
}) => {
  const a = await registered();
  const { api, user } = a;
  await page.context().addCookies((await api.storageState()).cookies);
  await page.goto("/admin/content");
  await expect(
    page.getByRole("heading", { name: "Access restricted" }),
  ).toBeVisible();
  await secureAccount(a);
  await page.context().addCookies((await api.storageState()).cookies);
  await db.user.update({
    where: { id: user.id },
    data: { role: "SUPER_ADMIN" },
  });
  await page.goto("/admin/content");
  await page.getByText("Add a question", { exact: true }).click();
  const editor = page
    .locator("details")
    .filter({ has: page.getByText("Add a question", { exact: true }) });
  const question = `Browser owner FAQ ${Date.now()}?`;
  await editor.getByLabel("Question", { exact: true }).fill(question);
  await editor
    .getByLabel("Answer", { exact: true })
    .fill("This published answer was created in the isolated QA database.");
  await editor.getByLabel("Publish this answer").check();
  await editor
    .getByLabel("Reason for change")
    .fill("QA owner editing workflow");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor.getByRole("status")).toContainText("Saved successfully");
  await page.goto("/faq");
  await expect(page.getByText(question, { exact: true })).toBeVisible();
  await api.dispose();
});
