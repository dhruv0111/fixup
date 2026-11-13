import test from "node:test";
import assert from "node:assert/strict";
import {
  calculate,
  purchaseSchema,
  adjustmentSchema,
  receiptSchema,
  csv,
  optionalDay,
  querySchema,
} from "../../src/modules/inventory/schemas";
test("purchase totals round tax half-up per line after discount", () => {
  const r = calculate([
    {
      variantId: "v",
      quantity: 3,
      ratePaise: 10000,
      taxBps: 1800,
      discountPaise: 1000,
    },
    {
      variantId: "b",
      quantity: 2,
      ratePaise: 2000,
      taxBps: 0,
      discountPaise: 0,
    },
  ]);
  assert.equal(r.totalPaise, 38220);
  assert.equal(r.taxPaise, 5220);
  assert.equal(
    calculate([
      {
        variantId: "v",
        quantity: 1,
        ratePaise: 1,
        taxBps: 5000,
        discountPaise: 0,
      },
    ]).taxPaise,
    1,
  );
});
test("amount storage limits cannot overflow", () => {
  assert.throws(() =>
    calculate([
      {
        variantId: "v",
        quantity: 1000000,
        ratePaise: 100000000,
        taxBps: 10000,
        discountPaise: 0,
      },
    ]),
  );
});
test("purchase schema rejects browser totals, duplicate variants and invalid quantities", () => {
  const p = {
    requestId: "2ca1b725-d523-4a40-88ef-99f64d206263",
    supplierId: "s",
    lines: [{ variantId: "v", quantity: 2, ratePaise: 100, taxBps: 0 }],
    reason: "QA valid reason",
  };
  assert.ok(purchaseSchema.safeParse(p).success);
  for (const extra of [
    { totalPaise: 1 },
    { lines: [...p.lines, ...p.lines] },
    { lines: [{ ...p.lines[0], quantity: 1.5 }] },
  ])
    assert.equal(purchaseSchema.safeParse({ ...p, ...extra }).success, false);
});
test("adjustments require confirmation, explanation and lots for deductions", () => {
  const p = {
    requestId: "2ca1b725-d523-4a40-88ef-99f64d206263",
    variantId: "v",
    kind: "OPENING",
    quantity: 5,
    confirmed: true,
    reason: "QA stock count",
  };
  assert.ok(adjustmentSchema.safeParse(p).success);
  for (const extra of [
    { confirmed: false },
    { quantity: 0 },
    { reason: "" },
    { kind: "MISSING", quantity: -1 },
    { kind: "DAMAGE", quantity: 1 },
  ])
    assert.equal(adjustmentSchema.safeParse({ ...p, ...extra }).success, false);
});
test("batch dates are optional, calendar-valid and ordered", () => {
  assert.equal(optionalDay.parse(""), null);
  assert.equal(optionalDay.safeParse("2026-02-30").success, false);
  const p = {
    requestId: "2ca1b725-d523-4a40-88ef-99f64d206263",
    purchaseOrderId: "p",
    lines: [{ purchaseLineId: "l", quantity: 1 }],
    reason: "QA valid receipt",
  };
  assert.ok(receiptSchema.safeParse(p).success);
  assert.equal(
    receiptSchema.safeParse({
      ...p,
      lines: [
        {
          ...p.lines[0],
          manufacturedAt: "2027-01-01",
          expiresAt: "2026-01-01",
        },
      ],
    }).success,
    false,
  );
});
test("CSV escapes formulas, quotes, commas and line breaks", () => {
  const value = csv([{ name: "=SUM(1,2)", note: 'a,"b"\nc' }]);
  assert.ok(value.includes('"\'=SUM(1,2)"'));
  assert.ok(value.includes('a,""b""'));
  assert.ok(csv([{ quantity: -2 }]).includes('"-2"'));
  assert.equal(csv([]), "No matching records\r\n");
});
test("report filters accept empty form fields and reject reversed date ranges", () => {
  assert.ok(
    querySchema.safeParse({ supplierId: "", from: "", to: "" }).success,
  );
  assert.equal(
    querySchema.safeParse({ from: "2027-01-01", to: "2026-01-01" }).success,
    false,
  );
});
