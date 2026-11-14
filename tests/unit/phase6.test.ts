import test from "node:test";
import assert from "node:assert/strict";
import {
  shipmentSchema,
  actionSchema,
  allocationSchema,
  transition,
  trackingUrl,
  awbKey,
  businessDate,
} from "../../src/modules/dispatch/rules";
test("date-only dispatch rules use the FIXUP India business date across UTC midnight", () => {
  assert.equal(businessDate(new Date("2026-11-13T18:29:00Z")), "2026-11-13");
  assert.equal(businessDate(new Date("2026-11-13T18:30:00Z")), "2026-11-14");
});
test("courier tracking is optional and restricted to a known HTTPS template", () => {
  assert.equal(trackingUrl("", "ABC"), null);
  assert.equal(
    trackingUrl("https://courier.example/track/{awb}", "A B/1"),
    "https://courier.example/track/A%20B%2F1",
  );
  for (const t of [
    "javascript:alert(1)",
    "https://{awb}.example/path",
    "https://user:secret@example.com/{awb}",
    "http://example.com/{awb}",
    "https://example.com/track",
    "https://example.com/{awb}/{awb}",
  ])
    assert.equal(trackingUrl(t, "ABC"), null);
});
test("AWB duplicate keys normalize courier and reference formatting", () => {
  assert.equal(awbKey("QA Courier", "ab-123"), awbKey("qa courier", "AB123"));
  assert.notEqual(
    awbKey("Other Courier", "AB123"),
    awbKey("QA Courier", "AB123"),
  );
});
test("drafts require actual packages and valid delivery details", () => {
  const base = {
    method: "LOCAL",
    packageCount: 2,
    scheduledDate: "2026-11-13",
  };
  assert.ok(shipmentSchema.safeParse(base).success);
  for (const extra of [
    { packageCount: 0 },
    { packageCount: 1.5 },
    { personName: "Person" },
    { awb: "123" },
    { scheduledDate: "2026-02-30" },
    { expectedDate: "2026-11-12" },
  ])
    assert.equal(
      shipmentSchema.safeParse({ ...base, ...extra }).success,
      false,
    );
});
test("delivery transitions reject premature delivery and terminal rewrites", () => {
  assert.equal(transition("LOCAL", "PENDING", "DELIVERED"), null);
  assert.equal(transition("LOCAL", "DISPATCHED", "DELIVERED"), null);
  assert.equal(
    transition("LOCAL", "OUT_FOR_DELIVERY", "DELIVERED"),
    "DELIVERED",
  );
  assert.equal(transition("COURIER", "DISPATCHED", "IN_TRANSIT"), "IN_TRANSIT");
  assert.equal(
    transition("COURIER", "DELIVERY_FAILED", "RESCHEDULE"),
    "IN_TRANSIT",
  );
  assert.equal(transition("LOCAL", "DELIVERED", "DELIVERY_FAILED"), null);
  assert.equal(transition("LOCAL", "RETURNED", "RESCHEDULE"), null);
});
test("failed-delivery actions require reason, confirmation and real timestamp", () => {
  const data = {
    requestId: "11096a23-0924-42dd-8b0d-978984cfcfba",
    version: 0,
    action: "DELIVERY_FAILED",
    reason: "Customer unavailable",
    confirmed: true,
    occurredAt: new Date().toISOString(),
  };
  assert.ok(actionSchema.safeParse(data).success);
  for (const extra of [
    { reason: "" },
    { confirmed: false },
    { occurredAt: "2099-01-01T00:00:00Z" },
    { stock: 1 },
  ])
    assert.equal(actionSchema.safeParse({ ...data, ...extra }).success, false);
});
test("packing rejects duplicate allocations and browser-supplied totals", () => {
  const data = {
    requestId: "11096a23-0924-42dd-8b0d-978984cfcfba",
    version: 0,
    reason: "Packing reviewed",
    allocations: [{ lineId: "line", lotId: "lot", quantity: 2 }],
  };
  assert.ok(allocationSchema.safeParse(data).success);
  assert.equal(
    allocationSchema.safeParse({
      ...data,
      allocations: [...data.allocations, ...data.allocations],
    }).success,
    false,
  );
  assert.equal(
    allocationSchema.safeParse({ ...data, totalQuantity: 99 }).success,
    false,
  );
});
