import test from "node:test";
import assert from "node:assert/strict";
import {
  dateQuery,
  resolveRange,
  midnight,
  dayInZone,
  bucket,
} from "../../src/modules/reports/dates";
import {
  roundedRatio,
  safeNumber,
  merchandiseRevenue,
} from "../../src/modules/reports/math";
import { expenseCreate, reportQuery } from "../../src/modules/reports/schemas";
test("report presets use business dates and April financial years", () => {
  const now = new Date("2026-04-01T00:15:00+05:30");
  const expected = {
    today: ["2026-04-01", "2026-04-01"],
    yesterday: ["2026-03-31", "2026-03-31"],
    last7: ["2026-03-26", "2026-04-01"],
    last30: ["2026-03-03", "2026-04-01"],
    month: ["2026-04-01", "2026-04-01"],
    "previous-month": ["2026-03-01", "2026-03-31"],
    "financial-year": ["2026-04-01", "2026-04-01"],
  };
  for (const [preset, dates] of Object.entries(expected)) {
    const r = resolveRange(dateQuery.parse({ preset }), "Asia/Kolkata", now);
    assert.deepEqual([r.from, r.to], dates);
  }
  const r = resolveRange(
    dateQuery.parse({ preset: "financial-year" }),
    "Asia/Kolkata",
    new Date("2026-03-31T20:00:00+05:30"),
  );
  assert.equal(r.from, "2025-04-01");
});
test("local date boundaries handle India and a DST transition", () => {
  assert.equal(
    midnight("2026-11-14", "Asia/Kolkata").toISOString(),
    "2026-11-13T18:30:00.000Z",
  );
  const a = midnight("2026-03-08", "America/New_York"),
    b = midnight("2026-03-09", "America/New_York");
  assert.equal((b.getTime() - a.getTime()) / 3600000, 23);
  assert.equal(
    dayInZone(new Date("2026-11-13T19:00:00Z"), "Asia/Kolkata"),
    "2026-11-14",
  );
});
test("weekly/monthly buckets use local calendar date and Monday weeks", () => {
  assert.equal(
    bucket(new Date("2026-11-15T20:00:00Z"), "Asia/Kolkata", "weekly"),
    "2026-11-16",
  );
  assert.equal(
    bucket(new Date("2026-03-31T20:00:00Z"), "Asia/Kolkata", "monthly"),
    "2026-04",
  );
});
test("report filters reject future, inverted, missing and excessive date ranges", () => {
  for (const data of [
    { preset: "custom", from: "2026-11-15", to: "2026-11-14" },
    { preset: "custom", from: "2026-11-14", to: "2026-11-16" },
    { preset: "custom" },
    { preset: "custom", from: "2000-01-01", to: "2026-11-14" },
  ])
    assert.throws(() =>
      resolveRange(
        dateQuery.parse(data),
        "Asia/Kolkata",
        new Date("2026-11-14T12:00:00+05:30"),
      ),
    );
  assert.equal(reportQuery.safeParse({ role: "SUPER_ADMIN" }).success, false);
});
test("recorded cost uses rational integer arithmetic and supports documented zero net cost", () => {
  assert.equal(roundedRatio(10001n, 2, 3), 6667n);
  assert.equal(roundedRatio(0n, 5, 10), 0n);
  assert.equal(roundedRatio(1n, 1, 2), 1n);
  assert.throws(() => roundedRatio(-1n, 1, 1));
  assert.throws(() => safeNumber(9007199254740992n));
});
test("profit revenue excludes inclusive tax and ignores separate charges", () => {
  assert.equal(
    merchandiseRevenue({ linePricePaise: 11800, taxPaise: 1800 }, "INCLUSIVE"),
    10000,
  );
  assert.equal(
    merchandiseRevenue({ linePricePaise: 10000, taxPaise: 1800 }, "EXCLUSIVE"),
    10000,
  );
});
test("expense validation rejects browser totals, zero/fractional amounts and self-approval fields", () => {
  const input = {
    requestId: "7cc25e2a-84ec-45bd-bb54-cda312aa6816",
    reason: "Actual packaging expense",
    data: {
      title: "Packaging purchase",
      category: "PACKAGING",
      amountPaise: 25000,
      expenseDate: "2026-11-14",
      paymentMethod: "CASH",
    },
  };
  assert.ok(expenseCreate.safeParse(input).success);
  for (const change of [
    { amountPaise: 0 },
    { amountPaise: 12.5 },
    { category: "FAKE" },
    { role: "ADMIN" },
    { total: 2 },
  ])
    assert.equal(
      expenseCreate.safeParse({ ...input, data: { ...input.data, ...change } })
        .success,
      false,
    );
});
