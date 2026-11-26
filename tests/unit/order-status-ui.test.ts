import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTimeline,
  customerExplanation,
  orderStatus,
  paymentStatus,
  type OrderLike,
} from "../../src/components/orders/status";

const base: OrderLike = {
  status: "PENDING_PAYMENT",
  paymentStatus: "UNPAID",
  createdAt: "2026-11-14T05:00:00.000Z",
  verifiedPaise: 0,
  remainingPaise: 1000,
  events: [],
};
const state = (
  o: OrderLike,
  key: string,
  who: "admin" | "customer" = "admin",
) => buildTimeline(o, who).find((s) => s.key === key)!;

test("badge tones follow the requested colour scheme", () => {
  assert.equal(orderStatus("PENDING_PAYMENT").tone, "amber");
  assert.equal(orderStatus("PAYMENT_UNDER_REVIEW").tone, "blue");
  assert.equal(orderStatus("PAYMENT_REJECTED").tone, "red");
  assert.equal(orderStatus("READY_FOR_DISPATCH").tone, "green");
  assert.equal(orderStatus("DISPATCHED").tone, "blue");
  assert.equal(orderStatus("DELIVERED").tone, "green");
  assert.equal(orderStatus("DELIVERY_FAILED").tone, "red");
  assert.equal(orderStatus("RESERVATION_EXPIRED").label, "Expired");
  assert.equal(paymentStatus("OVERPAID").tone, "amber");
  assert.equal(paymentStatus("PAID").tone, "green");
  assert.equal(orderStatus("SOMETHING_NEW").label, "Something New");
});

test("payment is not shown as verified until money is actually verified", () => {
  assert.equal(state(base, "payment").state, "current");
  assert.equal(state(base, "payment").label, "Awaiting payment");
  const review = { ...base, status: "PAYMENT_UNDER_REVIEW" };
  assert.equal(state(review, "payment").label, "Payment under review");
  assert.notEqual(state(review, "payment").state, "done");
  const partial = {
    ...base,
    paymentStatus: "PARTIALLY_PAID",
    verifiedPaise: 400,
    remainingPaise: 600,
  };
  assert.notEqual(state(partial, "payment").state, "done");
});

test("timestamps come only from recorded events", () => {
  assert.equal(state(base, "placed").at, base.createdAt);
  const ready = {
    ...base,
    status: "READY_FOR_DISPATCH",
    paymentStatus: "PAID",
    verifiedPaise: 1000,
    remainingPaise: 0,
  };
  assert.equal(state(ready, "payment").state, "done");
  assert.equal(state(ready, "payment").at, undefined);
  assert.equal(state(ready, "ready").state, "current");
  assert.equal(state(ready, "dispatched").at, undefined);
  const stamped = {
    ...ready,
    events: [{ kind: "VERIFIED", createdAt: "2026-11-14T06:00:00.000Z" }],
  };
  assert.equal(state(stamped, "payment").at, "2026-11-14T06:00:00.000Z");
});

test("alternative outcomes use problem states", () => {
  for (const [status, key] of [
    ["PAYMENT_REJECTED", "payment"],
    ["RESERVATION_EXPIRED", "payment"],
    ["CANCELLED", "payment"],
    ["DELIVERY_FAILED", "delivered"],
    ["RETURNED", "delivered"],
  ] as const)
    assert.equal(state({ ...base, status }, key).state, "problem", status);
  const delivered = {
    ...base,
    status: "DELIVERED",
    paymentStatus: "PAID",
    verifiedPaise: 1000,
    remainingPaise: 0,
  };
  assert.ok(buildTimeline(delivered, "admin").every((s) => s.state === "done"));
});

test("customers get plain-language explanations, not technical codes", () => {
  const review = customerExplanation({
    ...base,
    status: "PAYMENT_UNDER_REVIEW",
  });
  assert.equal(review.title, "Payment Under Review");
  assert.match(review.body, /verifying the transaction/);
  assert.match(
    customerExplanation({ ...base, status: "READY_FOR_DISPATCH" }).body,
    /ready for shipping/,
  );
  assert.match(
    customerExplanation({ ...base, status: "RESERVATION_EXPIRED" }).body,
    /reservation/i,
  );
  for (const status of [
    "PENDING_PAYMENT",
    "PAYMENT_REJECTED",
    "DISPATCHED",
    "DELIVERED",
    "CANCELLED",
    "DELIVERY_FAILED",
    "RETURNED",
    "ADMIN_REVIEW",
  ]) {
    const e = customerExplanation({ ...base, status });
    assert.doesNotMatch(e.title + e.body, /[A-Z]+_[A-Z]+/);
  }
});
