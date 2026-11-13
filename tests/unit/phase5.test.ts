import { test } from "node:test";
import assert from "node:assert/strict";
import {
  totals,
  referenceKey,
  paymentBalance,
  settingsSchema,
} from "../../src/modules/sales/rules";
test("sales totals use integer paise and explicit exclusive/inclusive taxes", () => {
  assert.deepEqual(
    totals([{ quantity: 2, unitPricePaise: 10000 }], 500, "EXCLUSIVE", 2500),
    {
      subtotalPaise: 20000,
      taxPaise: 1000,
      totalPaise: 23500,
      deliveryPaise: 2500,
      taxes: [1000],
    },
  );
  assert.equal(
    totals([{ quantity: 1, unitPricePaise: 10500 }], 500, "INCLUSIVE", 0)
      .totalPaise,
    10500,
  );
  assert.equal(
    totals([{ quantity: 1, unitPricePaise: 10500 }], 500, "INCLUSIVE", 0)
      .taxPaise,
    500,
  );
});
test("sales totals reject integer/database overflow", () => {
  assert.throws(() =>
    totals(
      [{ quantity: 10000, unitPricePaise: 1000000000 }],
      10000,
      "EXCLUSIVE",
      0,
    ),
  );
});
test("bank references normalize separators and case to prevent duplicate credit", () => {
  assert.equal(referenceKey(" utr-ab 123 / 45 "), "UTRAB12345");
});
test("verified balance is independent of screenshots and subtracts completed refunds", () => {
  assert.equal(
    paymentBalance([
      { kind: "RECEIPT", amountPaise: 3000 },
      { kind: "RECEIPT", amountPaise: 7000 },
      { kind: "REFUND", amountPaise: 2000 },
    ]),
    8000,
  );
  assert.equal(paymentBalance([]), 0);
});
test("settings cannot infer absent business rules or enable without confirmation", () => {
  assert.equal(
    settingsSchema.safeParse({ enabled: true, upiId: "fake@example" }).success,
    false,
  );
});
