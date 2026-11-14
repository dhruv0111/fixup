import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { db, testIp, registered } from "../fixtures/helpers";
import { staff } from "../fixtures/phase3";
import {
  scenario,
  draft,
  allocate,
  confirmed,
  action,
  courierShipment,
} from "../fixtures/phase6";
import { png } from "../fixtures/phase5";
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
    path: `.local/qa/phase6/${name}-${info.project.name}.png`,
    fullPage: true,
  });
}
async function update(
  page: Page,
  kind: string,
  extra: Record<string, string> = {},
) {
  const form = page
    .locator("form")
    .filter({ has: page.getByLabel("Delivery action", { exact: true }) });
  await form.getByLabel("Delivery action", { exact: true }).selectOption(kind);
  await form
    .getByLabel("Reason / failure reason", { exact: true })
    .fill("QA checked actual delivery event");
  for (const [name, value] of Object.entries(extra))
    await form.getByLabel(name, { exact: true }).fill(value);
  await form.getByRole("checkbox").check();
  await form.getByRole("button").click();
}
test("local full-order dispatch is created, allocated, confirmed and delivered through browser forms", async ({
  page,
}, info) => {
  const s = await scenario(owner.api, true, true);
  await page.goto(`/admin/dispatch?view=ready`);
  await page
    .getByLabel("Order number or customer / dealer")
    .fill(s.o.row.number);
  await page.getByRole("button", { name: "Filter dispatches" }).click();
  await expect(
    page.getByRole("link", { name: s.o.row.number, exact: true }),
  ).toBeVisible();
  await capture(page, info, "ready-queue");
  await page
    .getByRole("link", { name: "Prepare dispatch", exact: true })
    .click();
  await page.getByLabel("Actual package count").fill("2");
  await page
    .getByLabel("Dispatch date", { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await page
    .getByLabel("Delivery person name", { exact: true })
    .fill("QA Local Driver");
  await page.getByLabel("Delivery person mobile").fill("9000000000");
  await page.getByLabel("Vehicle number (optional)").fill("QA01TEST");
  await page
    .getByLabel("Reason for change", { exact: true })
    .fill("QA reviewed actual packed order");
  await page.getByRole("button", { name: "Create draft dispatch" }).click();
  await expect(page).toHaveURL(/\/admin\/dispatch\/c[a-z0-9]+$/);
  const id = page.url().split("/").at(-1)!;
  await expect(page.getByRole("heading", { name: /FIX-DSP-/ })).toBeVisible();
  await capture(page, info, "local-draft");
  for (let i = 1; i <= 2; i++)
    await page
      .getByLabel(`Stock lot ${i}`, { exact: true })
      .selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "Save full-order allocation" })
    .click();
  await expect
    .poll(async () =>
      db.dispatchAllocation.count({ where: { line: { dispatchId: id } } }),
    )
    .toBe(2);
  // Wait for the refreshed packing revision before submitting another mutation.
  await expect(
    page.getByText(/^Lot .*: \d+ units · physical returns/),
  ).toHaveCount(2);
  await update(page, "CONFIRM");
  await expect(
    page.getByText("CONFIRMED · DISPATCHED · LOCAL", { exact: true }),
  ).toBeVisible();
  await capture(page, info, "confirmed-stock");
  await update(page, "OUT_FOR_DELIVERY");
  await expect(
    page.getByText("CONFIRMED · OUT FOR DELIVERY · LOCAL", { exact: true }),
  ).toBeVisible();
  await capture(page, info, "out-for-delivery");
  await update(page, "DELIVERED", {
    "Recipient name": "QA Recipient",
    "Source of delivery confirmation": "Local staff witnessed handover",
  });
  await expect(
    page.getByText("CONFIRMED · DELIVERED · LOCAL", { exact: true }),
  ).toBeVisible();
  await capture(page, info, "delivered-admin");
  await page.context().clearCookies();
  await page.context().addCookies((await s.b.api.storageState()).cookies);
  await page.goto(`/account/orders/${s.o.row.id}`);
  await expect(
    page.getByRole("heading", { name: "Delivery tracking", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      `${(await db.dispatch.findUniqueOrThrow({ where: { id } })).number} · DELIVERED`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("QA Local Driver", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel eligible order" }),
  ).toHaveCount(0);
  await capture(page, info, "customer-tracking");
  await s.b.api.dispose();
});
test("courier failure, manual rebooking, private proof and return handling work on each viewport", async ({
  page,
}, info) => {
  const s = await scenario(owner.api);
  const d = await confirmed(owner.api, s.o.row.id, courierShipment());
  await page.goto(`/admin/dispatch/${d.id}`);
  await expect(
    page.getByText("CONFIRMED · DISPATCHED · COURIER", { exact: true }),
  ).toBeVisible();
  await capture(page, info, "courier-shipment");
  await update(page, "IN_TRANSIT");
  await expect(
    page.getByText("CONFIRMED · IN TRANSIT · COURIER", { exact: true }),
  ).toBeVisible();
  await update(page, "DELIVERY_FAILED");
  await expect(
    page.getByText("CONFIRMED · DELIVERY FAILED · COURIER", { exact: true }),
  ).toBeVisible();
  await capture(page, info, "delivery-failed");
  await page.getByText("Edit delivery arrangements", { exact: true }).click();
  const edit = page.locator("form").filter({
    has: page.getByRole("button", { name: "Save delivery arrangements" }),
  });
  await edit
    .getByLabel("Courier service (optional)")
    .fill("QA rescheduled courier service");
  await edit
    .getByLabel("Reason for change", { exact: true })
    .fill("QA courier arranged another attempt");
  await edit
    .getByRole("button", { name: "Save delivery arrangements" })
    .click();
  await expect
    .poll(
      async () =>
        (await db.dispatch.findUniqueOrThrow({ where: { id: d.id } }))
          .courierService,
    )
    .toBe("QA rescheduled courier service");
  await update(page, "RESCHEDULE", {
    "Rescheduled delivery date": new Date(Date.now() + 86400000)
      .toISOString()
      .slice(0, 10),
  });
  await expect(
    page.getByText("CONFIRMED · IN TRANSIT · COURIER", { exact: true }),
  ).toBeVisible();
  await capture(page, info, "rescheduled");
  const proof = page.locator("form").filter({
    has: page.getByRole("button", { name: "Upload private delivery proof" }),
  });
  await proof
    .getByLabel("Evidence source", { exact: true })
    .fill("QA courier scanned handover record");
  await proof
    .getByLabel("Delivery photograph / scanned document")
    .setInputFiles({
      name: "qa-delivery.png",
      mimeType: "image/png",
      buffer: await png(),
    });
  await proof.getByRole("checkbox").check();
  await proof
    .getByRole("button", { name: "Upload private delivery proof" })
    .click();
  await expect(
    page.getByRole("link", { name: /QA courier scanned handover record/ }),
  ).toBeVisible();
  await capture(page, info, "private-proof");
  await update(page, "RETURNED", {
    "Return-to-sender reference": "QA-RTS-001",
  });
  await expect(
    page.getByText("CONFIRMED · RETURNED · COURIER", { exact: true }),
  ).toBeVisible();
  await capture(page, info, "return-inspection");
  await s.b.api.dispose();
});
test("customer tracking hides private remarks and customer cannot use admin dispatch screens", async ({
  page,
}, info) => {
  const s = await scenario(owner.api);
  const d = await confirmed(owner.api, s.o.row.id);
  await action(owner.api, d.id, "OUT_FOR_DELIVERY", {
    internalRemarks: "STAFF-ONLY-DELIVERY-NOTE",
  });
  await page.context().clearCookies();
  await page.context().addCookies((await s.b.api.storageState()).cookies);
  await page.goto(`/account/orders/${s.o.row.id}`);
  await expect(
    page.getByText(`${d.number} · OUT FOR DELIVERY`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("PRIVATE-DISPATCH-NOTES")).toHaveCount(0);
  await expect(page.getByText("STAFF-ONLY-DELIVERY-NOTE")).toHaveCount(0);
  await capture(page, info, "owned-local-tracking");
  await page.goto(`/admin/dispatch/${d.id}`);
  await expect(page).toHaveURL(/\/account$/);
  const other = await registered();
  await page.context().clearCookies();
  await page.context().addCookies((await other.api.storageState()).cookies);
  await page.goto(`/account/orders/${s.o.row.id}`);
  await expect(page.getByText(d.number, { exact: false })).toHaveCount(0);
  await expect(
    page.getByText("Order or payment not found.", { exact: true }).first(),
  ).toBeVisible();
  await other.api.dispose();
  await s.b.api.dispose();
});
test("blocked dispatch remains visible with reasons and invalid draft transitions are refused", async ({
  page,
}, info) => {
  const s = await scenario(owner.api, false);
  await page.goto("/admin/dispatch?view=blocked");
  await page
    .getByLabel("Order number or customer / dealer")
    .fill(s.o.row.number);
  await page.getByRole("button", { name: "Filter dispatches" }).click();
  await expect(
    page.getByText("Full payment has not been manually verified.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Prepare dispatch", exact: true }),
  ).toHaveCount(0);
  await capture(page, info, "blocked-queue");
  const paid = await scenario(owner.api);
  const d = await draft(owner.api, paid.o.row.id);
  await page.goto(`/admin/dispatch/${d.id}`);
  await update(page, "CONFIRM");
  await expect(
    page.getByText(
      "Review and allocate every ordered variant quantity before confirmation.",
      { exact: true },
    ),
  ).toBeVisible();
  await allocate(owner.api, d.id);
  await s.b.api.dispose();
  await paid.b.api.dispose();
});
