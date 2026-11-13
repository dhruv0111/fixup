import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db, context, registered } from "../fixtures/helpers";
import { staff } from "../fixtures/phase3";
import {
  fixture,
  root,
  supplierData,
  po,
  submitted,
  action,
  grn,
  receive,
  balance,
  adjustment,
} from "../fixtures/phase4";
let owner: Awaited<ReturnType<typeof staff>>;
let f: Awaited<ReturnType<typeof fixture>>;
test.beforeAll(async () => {
  owner = await staff();
});
test.beforeEach(async () => {
  f = await fixture(owner.api);
});
test.afterAll(async () => {
  await owner.api.dispose();
  await db.$disconnect();
});

test("supplier create/edit/search/status and historical retention", async () => {
  const edited = await owner.api.patch(`${root}/suppliers/${f.supplier.id}`, {
    data: {
      ...f.values,
      name: `${f.values.name} edited`,
      status: "INACTIVE",
      version: 0,
      reason: "QA supplier changed",
    },
  });
  expect(edited.status()).toBe(200);
  const search = await owner.api.get(
    `${root}/suppliers?q=${encodeURIComponent(f.values.name)}&status=INACTIVE`,
  );
  expect(
    (await search.json()).data.items.some(
      (s: { id: string }) => s.id === f.supplier.id,
    ),
  ).toBe(true);
  expect(
    (
      await owner.api.patch(`${root}/suppliers/${f.supplier.id}`, {
        data: { ...f.values, version: 0 },
      })
    ).status(),
  ).toBe(409);
  expect(
    (await owner.api.delete(`${root}/suppliers/${f.supplier.id}`)).status(),
  ).toBe(405);
  expect(
    await db.auditLog.count({
      where: { entityId: f.supplier.id, action: "SUPPLIER_CHANGED" },
    }),
  ).toBe(2);
});
test("duplicate and malformed suppliers are rejected safely", async () => {
  expect(
    (await owner.api.post(`${root}/suppliers`, { data: f.values })).status(),
  ).toBe(409);
  for (const extra of [
    { email: "bad" },
    { phone: "bad" },
    { gstin: "invalid" },
    { postalCode: "000000" },
    { status: "DELETED" },
    { unknown: true },
    { variantIds: ["missing"] },
  ])
    expect(
      (
        await owner.api.post(`${root}/suppliers`, {
          data: { ...supplierData(), ...extra },
        })
      ).status(),
    ).toBe(422);
  const rs = await Promise.all(
    [1, 2].map(() =>
      owner.api.post(`${root}/suppliers`, {
        data: supplierData("QA Concurrent " + f.supplier.id),
      }),
    ),
  );
  expect(rs.map((r) => r.status()).sort()).toEqual([201, 409]);
});
test("PO totals use line discounts, explicit taxes and all four variants", async () => {
  const data = {
    requestId: randomUUID(),
    supplierId: f.supplier.id,
    reason: "QA server calculation",
    lines: [
      {
        variantId: f.variants[0].id,
        quantity: 3,
        ratePaise: 10000,
        taxBps: 1800,
        discountPaise: 1000,
      },
      {
        variantId: f.variants[1].id,
        quantity: 2,
        ratePaise: 2000,
        taxBps: 0,
        discountPaise: 0,
      },
    ],
  };
  const r = await owner.api.post(`${root}/purchase-orders`, { data });
  expect(r.status()).toBe(201);
  expect((await r.json()).data).toMatchObject({
    subtotalPaise: 34000,
    discountPaise: 1000,
    taxPaise: 5220,
    totalPaise: 38220,
    status: "DRAFT",
  });
  expect(
    (
      await owner.api.post(`${root}/purchase-orders`, {
        data: { ...data, requestId: randomUUID(), totalPaise: 1 },
      })
    ).status(),
  ).toBe(422);
  const all = await po(owner.api, f, 4, true);
  expect(all.row.lines).toHaveLength(4);
  expect(all.row.number).toMatch(/^FIX-PO-\d+$/);
});
test("PO draft creation/submission never changes stock", async () => {
  const p = await po(owner.api, f);
  expect(await balance(f.variants[0].id)).toEqual({ available: 0, damaged: 0 });
  expect(
    (await action(owner.api, "purchase-orders", p.row, "SUBMIT")).status(),
  ).toBe(200);
  expect(await balance(f.variants[0].id)).toEqual({ available: 0, damaged: 0 });
  expect(
    await db.stockLot.count({ where: { variantId: f.variants[0].id } }),
  ).toBe(0);
});
test("only drafts can edit and submitted financial/product/supplier snapshots remain intact", async () => {
  const p = await po(owner.api, f);
  let r = await owner.api.patch(`${root}/purchase-orders/${p.row.id}`, {
    data: {
      ...p.data,
      version: 0,
      lines: [{ ...p.data.lines[0], quantity: 12 }],
      reason: "QA revise draft quantities",
    },
  });
  expect(r.status()).toBe(200);
  const revised = (await r.json()).data;
  expect(
    (await action(owner.api, "purchase-orders", revised, "SUBMIT")).status(),
  ).toBe(200);
  expect(
    (
      await owner.api.patch(`${root}/purchase-orders/${p.row.id}`, {
        data: { ...p.data, version: 2 },
      })
    ).status(),
  ).toBe(409);
  await db.productVariant.update({
    where: { id: f.variants[0].id },
    data: { name: "QA changed live name" },
  });
  await owner.api.patch(`${root}/suppliers/${f.supplier.id}`, {
    data: { ...f.values, version: 0, name: "QA changed supplier name" },
  });
  const sellingList = await db.priceList.create({
    data: {
      name: `QA changed selling list ${randomUUID()}`,
      entries: { create: { variantId: f.variants[0].id, amountPaise: 1000 } },
    },
    include: { entries: true },
  });
  await db.priceEntry.update({
    where: { id: sellingList.entries[0].id },
    data: { amountPaise: 99999 },
  });
  await db.productVariant.update({
    where: { id: f.variants[0].id },
    data: { mrpPaise: 17500, mrpConfirmed: true },
  });
  r = await owner.api.get(`${root}/purchase-orders/${p.row.id}`);
  const row = (await r.json()).data;
  expect(row.lines[0].variantName).toBe(p.row.lines[0].variantName);
  expect(row.supplierSnapshot.name).toBe(f.supplier.name);
  expect(row.totalPaise).toBe(120000);
  expect(row.lines[0].ratePaise).toBe(10000);
  await expect(
    db.purchaseOrderLine.update({
      where: { id: row.lines[0].id },
      data: { ratePaise: 1 },
    }),
  ).rejects.toThrow();
});
test("inactive/blocked suppliers and invalid purchase inputs cannot create orders", async () => {
  const p = await po(owner.api, f);
  for (const extra of [
    { quantity: 0 },
    { quantity: -1 },
    { quantity: 1.5 },
    { ratePaise: 0 },
    { ratePaise: 1.2 },
    { taxBps: 10001 },
    { discountPaise: 100001 },
    { variantId: "missing" },
  ])
    expect(
      (
        await owner.api.post(`${root}/purchase-orders`, {
          data: {
            ...p.data,
            requestId: randomUUID(),
            lines: [{ ...p.data.lines[0], ...extra }],
          },
        })
      ).status(),
    ).toBe(422);
  await owner.api.patch(`${root}/suppliers/${f.supplier.id}`, {
    data: { ...f.values, status: "BLOCKED", version: 0 },
  });
  expect(
    (
      await owner.api.post(`${root}/purchase-orders`, {
        data: { ...p.data, requestId: randomUUID() },
      })
    ).status(),
  ).toBe(422);
  expect(
    (await action(owner.api, "purchase-orders", p.row, "SUBMIT")).status(),
  ).toBe(422);
});
test("draft/submitted PO cancellation is allowed but received PO cancellation is blocked", async () => {
  const draft = await po(owner.api, f);
  expect(
    (await action(owner.api, "purchase-orders", draft.row, "CANCEL")).status(),
  ).toBe(200);
  const p = await submitted(owner.api, f);
  const g = await grn(owner.api, p);
  expect(
    (await action(owner.api, "purchase-orders", p, "CANCEL")).status(),
  ).toBe(200);
  expect(
    (await db.goodsReceipt.findUniqueOrThrow({ where: { id: g.row.id } }))
      .status,
  ).toBe("CANCELLED");
  expect(await balance(f.variants[0].id)).toEqual({ available: 0, damaged: 0 });
  const other = await submitted(owner.api, f);
  await receive(owner.api, other, 2);
  const row = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: other.id },
  });
  expect(
    (await action(owner.api, "purchase-orders", row, "CANCEL")).status(),
  ).toBe(422);
});
test("GRN completion adds stock with exact lot, batch and document references", async () => {
  const p = await submitted(owner.api, f);
  const g = await grn(owner.api, p, 10);
  expect(await balance(f.variants[0].id)).toEqual({ available: 0, damaged: 0 });
  const r = await action(owner.api, "goods-receiving", g.row, "CONFIRM");
  expect(r.status(), await r.text()).toBe(200);
  const row = (await r.json()).data;
  expect(row.number).toMatch(/^FIX-GRN-\d+$/);
  expect(row.status).toBe("COMPLETED");
  expect(row.completedById).toBe(owner.user.id);
  expect(await balance(f.variants[0].id)).toEqual({
    available: 10,
    damaged: 0,
  });
  const m = await db.stockMovement.findFirstOrThrow({
    where: { variantId: f.variants[0].id },
    include: { lot: true },
  });
  expect(m).toMatchObject({
    previousStock: 0,
    updatedStock: 10,
    availableDelta: 10,
    actorId: owner.user.id,
    receiptLineId: row.lines[0].id,
  });
  expect(m.lot.batchNumber).toBe("QA-BATCH");
  expect(
    (await db.purchaseOrder.findUniqueOrThrow({ where: { id: p.id } })).status,
  ).toBe("FULLY_RECEIVED");
});
test("partial and multiple receipts remain independent across all pack sizes", async () => {
  const p = await submitted(owner.api, f, 10, true);
  const first = await receive(owner.api, p, 3, true);
  expect(first.lines).toHaveLength(4);
  for (const v of f.variants) expect((await balance(v.id)).available).toBe(3);
  expect(
    (await db.purchaseOrder.findUniqueOrThrow({ where: { id: p.id } })).status,
  ).toBe("PARTIALLY_RECEIVED");
  await receive(owner.api, p, 7, true);
  for (const v of f.variants) expect((await balance(v.id)).available).toBe(10);
  expect(
    (await db.purchaseOrder.findUniqueOrThrow({ where: { id: p.id } })).status,
  ).toBe("FULLY_RECEIVED");
});
test("repeated and concurrent GRN confirmation posts exactly once", async () => {
  const p = await submitted(owner.api, f);
  const g = await grn(owner.api, p, 6);
  const rs = await Promise.all(
    [1, 2, 3].map(() => action(owner.api, "goods-receiving", g.row, "CONFIRM")),
  );
  expect(rs.map((r) => r.status())).toEqual([200, 200, 200]);
  expect((await balance(f.variants[0].id)).available).toBe(6);
  expect(
    await db.stockMovement.count({
      where: { receiptLineId: g.row.lines[0].id },
    }),
  ).toBe(1);
  expect(
    await db.auditLog.count({
      where: { entityId: g.row.id, action: "GOODS_RECEIPT_CHANGED" },
    }),
  ).toBe(2);
});
test("concurrent distinct GRNs cannot exceed remaining PO quantity", async () => {
  const p = await submitted(owner.api, f);
  const a = await grn(owner.api, p, 7),
    b = await grn(owner.api, p, 7);
  const rs = await Promise.all([
    action(owner.api, "goods-receiving", a.row, "CONFIRM"),
    action(owner.api, "goods-receiving", b.row, "CONFIRM"),
  ]);
  expect(rs.map((r) => r.status()).sort()).toEqual([200, 422]);
  expect((await balance(f.variants[0].id)).available).toBe(7);
  expect(
    (
      await db.purchaseOrderLine.findUniqueOrThrow({
        where: { id: p.lines[0].id },
      })
    ).receivedQuantity,
  ).toBe(7);
});
test("excess, foreign lines, draft and cancelled PO receiving are rejected", async () => {
  const p = await submitted(owner.api, f),
    other = await submitted(owner.api, f);
  const data = {
    requestId: randomUUID(),
    purchaseOrderId: p.id,
    lines: [{ purchaseLineId: p.lines[0].id, quantity: 11 }],
    reason: "QA excess receipt",
  };
  expect(
    (await owner.api.post(`${root}/goods-receiving`, { data })).status(),
  ).toBe(422);
  expect(
    (
      await owner.api.post(`${root}/goods-receiving`, {
        data: {
          ...data,
          requestId: randomUUID(),
          lines: [{ purchaseLineId: other.lines[0].id, quantity: 1 }],
        },
      })
    ).status(),
  ).toBe(422);
  const draft = await po(owner.api, f);
  expect(
    (
      await owner.api.post(`${root}/goods-receiving`, {
        data: {
          ...data,
          requestId: randomUUID(),
          purchaseOrderId: draft.row.id,
          lines: [{ purchaseLineId: draft.row.lines[0].id, quantity: 1 }],
        },
      })
    ).status(),
  ).toBe(422);
  await action(owner.api, "purchase-orders", p, "CANCEL");
  expect(
    (
      await owner.api.post(`${root}/goods-receiving`, {
        data: { ...data, requestId: randomUUID() },
      })
    ).status(),
  ).toBe(422);
});
test("GRN draft editing and cancellation have no ledger or stock effect", async () => {
  const p = await submitted(owner.api, f);
  const g = await grn(owner.api, p, 5);
  const r = await owner.api.patch(`${root}/goods-receiving/${g.row.id}`, {
    data: {
      ...g.data,
      version: 0,
      lines: [{ ...g.data.lines[0], quantity: 2 }],
      reason: "QA revise actual receipt",
    },
  });
  expect(r.status()).toBe(200);
  expect(
    (
      await action(
        owner.api,
        "goods-receiving",
        (await r.json()).data,
        "CANCEL",
      )
    ).status(),
  ).toBe(200);
  expect(
    (await action(owner.api, "goods-receiving", g.row, "CONFIRM")).status(),
  ).toBe(409);
  expect((await balance(f.variants[0].id)).available).toBe(0);
});
test("failed posting rolls back GRN status, all lots, quantities, ledger and audit", async () => {
  const p = await submitted(owner.api, f, 10, true);
  const g = await grn(owner.api, p, 4, true);
  const target = g.row.lines[1].purchaseLine.variantId;
  await db.$executeRawUnsafe(
    `CREATE FUNCTION _test_phase4_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."variantId" = '${target}' THEN RAISE EXCEPTION 'QA injected failure'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER "_test_phase4_fail" BEFORE INSERT ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION _test_phase4_fail()`,
  );
  try {
    expect(
      (await action(owner.api, "goods-receiving", g.row, "CONFIRM")).status(),
    ).toBe(500);
    expect(
      (await db.goodsReceipt.findUniqueOrThrow({ where: { id: g.row.id } }))
        .status,
    ).toBe("DRAFT");
    expect(
      await db.stockMovement.count({
        where: { variantId: { in: f.variants.map((v) => v.id) } },
      }),
    ).toBe(0);
    expect(
      await db.stockLot.count({
        where: { variantId: { in: f.variants.map((v) => v.id) } },
      }),
    ).toBe(0);
    expect(
      (
        await db.purchaseOrderLine.findMany({
          where: { purchaseOrderId: p.id },
        })
      ).every((l) => l.receivedQuantity === 0),
    ).toBe(true);
    expect(await db.auditLog.count({ where: { entityId: g.row.id } })).toBe(1);
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER "_test_phase4_fail" ON "StockMovement"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION _test_phase4_fail()");
  }
});
test("opening stock is confirmed, audited, idempotent and once per variant", async () => {
  const key = randomUUID();
  const r = await adjustment(owner.api, f.variants[0].id, 10, "OPENING", null, {
    requestId: key,
  });
  expect(r.status()).toBe(201);
  const row = (await r.json()).data;
  expect(row.movement).toMatchObject({
    previousStock: 0,
    updatedStock: 10,
    availableDelta: 10,
    kind: "OPENING_STOCK",
  });
  expect(
    (
      await adjustment(owner.api, f.variants[0].id, 10, "OPENING", null, {
        requestId: key,
      })
    ).status(),
  ).toBe(201);
  expect((await adjustment(owner.api, f.variants[0].id, 10)).status()).toBe(
    422,
  );
  expect((await balance(f.variants[0].id)).available).toBe(10);
  expect(
    await db.auditLog.count({
      where: { entityId: row.id, action: "STOCK_ADJUSTED" },
    }),
  ).toBe(1);
});
test("physical correction, damage and missing stock generate consistent lot ledger", async () => {
  const p = await submitted(owner.api, f);
  const r = await receive(owner.api, p, 10);
  const lot = r.lines[0].lot.id,
    v = f.variants[0].id;
  expect((await adjustment(owner.api, v, 2, "CORRECTION", lot)).status()).toBe(
    201,
  );
  expect((await adjustment(owner.api, v, 3, "DAMAGE", lot)).status()).toBe(201);
  expect((await adjustment(owner.api, v, -2, "MISSING", lot)).status()).toBe(
    201,
  );
  expect(await balance(v)).toEqual({ available: 7, damaged: 3 });
  const detail = (await (await owner.api.get(`${root}/lots/${lot}`)).json())
    .data;
  expect(detail).toMatchObject({ available: 7, damaged: 3 });
  expect(detail.receiptLine.receipt.purchaseOrderId).toBe(p.id);
  expect((await balance(f.variants[1].id)).available).toBe(0);
});
test("negative quantities, missing confirmation and wrong-variant lots are blocked", async () => {
  const r = await adjustment(owner.api, f.variants[0].id, 5);
  const lot = (await r.json()).data.movement.lotId;
  for (const [v, q, k, l, extra] of [
    [f.variants[0].id, -6, "CORRECTION", lot, {}],
    [f.variants[1].id, 1, "OTHER", lot, {}],
    [f.variants[0].id, 1, "OTHER", null, { confirmed: false }],
    [f.variants[0].id, -1, "OTHER", null, {}],
    [f.variants[0].id, 1.5, "OTHER", lot, {}],
  ] as const)
    expect((await adjustment(owner.api, v, q, k, l, extra)).status()).toBe(422);
  expect((await balance(f.variants[0].id)).available).toBe(5);
});
test("concurrent stock deductions cannot create negative stock", async () => {
  const r = await adjustment(owner.api, f.variants[0].id, 10);
  const lot = (await r.json()).data.movement.lotId;
  const rs = await Promise.all(
    [1, 2].map(() =>
      adjustment(owner.api, f.variants[0].id, -7, "MISSING", lot),
    ),
  );
  expect(rs.map((r) => r.status()).sort()).toEqual([201, 422]);
  expect((await balance(f.variants[0].id)).available).toBe(3);
});
test("database rejects ledger edits/deletion, direct received balance edits and negative postings", async () => {
  const p = await submitted(owner.api, f);
  const r = await receive(owner.api, p, 5);
  const m = await db.stockMovement.findFirstOrThrow({
    where: { receiptLineId: r.lines[0].id },
  });
  await expect(
    db.stockMovement.update({
      where: { id: m.id },
      data: { availableDelta: 50 },
    }),
  ).rejects.toThrow();
  await expect(
    db.stockMovement.delete({ where: { id: m.id } }),
  ).rejects.toThrow();
  await expect(
    db.stockLot.update({
      where: { id: m.lotId },
      data: { batchNumber: "overwrite" },
    }),
  ).rejects.toThrow();
  await expect(
    db.purchaseOrderLine.update({
      where: { id: p.lines[0].id },
      data: { receivedQuantity: 0 },
    }),
  ).rejects.toThrow();
  const a = await db.stockAdjustment.create({
    data: {
      requestId: randomUUID(),
      payloadDigest: "QA",
      kind: "CORRECTION",
      reason: "QA negative direct write",
      actorId: owner.user.id,
    },
  });
  await expect(
    db.stockMovement.create({
      data: {
        variantId: m.variantId,
        lotId: m.lotId,
        kind: "STOCK_CORRECTION",
        availableDelta: -99,
        adjustmentId: a.id,
        reason: "QA direct negative write",
        actorId: owner.user.id,
      },
    }),
  ).rejects.toThrow();
  expect((await balance(m.variantId)).available).toBe(5);
});
test("completed receipt reversal is super-admin only, exactly once and restores PO remaining", async () => {
  const p = await submitted(owner.api, f);
  const r = await receive(owner.api, p, 10);
  const admin = await staff("ADMIN");
  try {
    expect(
      (await action(admin.api, "goods-receiving", r, "REVERSE")).status(),
    ).toBe(403);
    expect(
      (await action(owner.api, "goods-receiving", r, "REVERSE")).status(),
    ).toBe(200);
    expect(
      (await action(owner.api, "goods-receiving", r, "REVERSE")).status(),
    ).toBe(200);
    expect((await balance(f.variants[0].id)).available).toBe(0);
    const current = await db.purchaseOrderLine.findUniqueOrThrow({
      where: { id: p.lines[0].id },
    });
    expect(current.receivedQuantity).toBe(0);
    expect(
      (await db.purchaseOrder.findUniqueOrThrow({ where: { id: p.id } }))
        .status,
    ).toBe("SUBMITTED");
    expect(
      await db.stockMovement.count({ where: { receiptLineId: r.lines[0].id } }),
    ).toBe(2);
  } finally {
    await admin.api.dispose();
  }
});
test("receipt reversal fails after damage or consumption", async () => {
  const p = await submitted(owner.api, f);
  const r = await receive(owner.api, p, 10);
  await adjustment(owner.api, f.variants[0].id, 1, "DAMAGE", r.lines[0].lot.id);
  expect(
    (await action(owner.api, "goods-receiving", r, "REVERSE")).status(),
  ).toBe(422);
  expect((await balance(f.variants[0].id)).available).toBe(9);
  expect(
    (await db.goodsReceipt.findUniqueOrThrow({ where: { id: r.id } })).status,
  ).toBe("COMPLETED");
});
test("thresholds are optional per variant, revision protected and low/out reports are correct", async () => {
  const path = `${root}/thresholds/${f.variants[0].id}`;
  expect(
    (
      await owner.api.patch(path, {
        data: {
          minimumQuantity: 5,
          version: 0,
          reason: "QA threshold configured",
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await owner.api.patch(path, {
        data: { minimumQuantity: 2, version: 0, reason: "QA stale threshold" },
      })
    ).status(),
  ).toBe(409);
  let rows = (
    await (
      await owner.api.get(
        `${root}/reports?kind=low-stock&variantId=${f.variants[0].id}`,
      )
    ).json()
  ).data.rows;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    available: 0,
    minimumQuantity: 5,
    outOfStock: true,
    lowStock: true,
  });
  expect(rows[0].suggestedReorderQuantity).toBeUndefined();
  await adjustment(owner.api, f.variants[0].id, 8);
  rows = (
    await (
      await owner.api.get(
        `${root}/reports?kind=low-stock&variantId=${f.variants[0].id}`,
      )
    ).json()
  ).data.rows;
  expect(rows).toEqual([]);
  expect(
    (
      await owner.api.patch(path, {
        data: {
          minimumQuantity: null,
          version: 1,
          reason: "QA disable threshold",
        },
      })
    ).status(),
  ).toBe(200);
});
test("batches preserve optional supplied dates and quantity traceability", async () => {
  const p = await submitted(owner.api, f);
  const g = await grn(owner.api, p, 3, false, {
    batchNumber: null,
    manufacturedAt: null,
    expiresAt: null,
  });
  const r = await action(owner.api, "goods-receiving", g.row, "CONFIRM");
  expect(r.status()).toBe(200);
  const rows = (
    await (
      await owner.api.get(
        `${root}/reports?kind=batches&variantId=${f.variants[0].id}`,
      )
    ).json()
  ).data.rows;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    manufactured: null,
    expiry: null,
    batch: null,
    receivedQuantity: 3,
    available: 3,
    grn: g.row.number,
    supplier: f.supplier.name,
  });
  expect(
    (
      await owner.api.post(`${root}/goods-receiving`, {
        data: {
          ...g.data,
          requestId: randomUUID(),
          lines: [
            {
              ...g.data.lines[0],
              manufacturedAt: "2027-01-01",
              expiresAt: "2026-01-01",
            },
          ],
        },
      })
    ).status(),
  ).toBe(422);
});
test("all reports support protected JSON/CSV with search, dates and expiry filtering", async () => {
  const p = await submitted(owner.api, f);
  const r = await receive(owner.api, p, 5);
  await adjustment(owner.api, f.variants[0].id, 1, "DAMAGE", r.lines[0].lot.id);
  for (const kind of [
    "stock",
    "purchases",
    "suppliers",
    "receipts",
    "movements",
    "damage",
    "adjustments",
    "low-stock",
    "batches",
  ]) {
    const a = await owner.api.get(`${root}/reports?kind=${kind}`);
    expect(a.status(), await a.text()).toBe(200);
    const c = await owner.api.get(`${root}/reports?kind=${kind}&format=csv`);
    expect(c.status()).toBe(200);
    expect(c.headers()["content-type"]).toContain("text/csv");
    expect(c.headers()["cache-control"]).toContain("no-store");
  }
  const future = await owner.api.get(
    `${root}/reports?kind=movements&variantId=${f.variants[0].id}&from=2099-01-01&to=2099-12-31`,
  );
  expect((await future.json()).data.rows).toEqual([]);
  const batch = await owner.api.get(
    `${root}/reports?kind=batches&variantId=${f.variants[0].id}&from=2027-01-01&to=2027-01-01`,
  );
  expect((await batch.json()).data.rows).toHaveLength(1);
  const search = await owner.api.get(
    `${root}/reports?kind=purchases&q=${p.number}`,
  );
  expect((await search.json()).data.rows).toHaveLength(1);
});
test("CSV formula input is escaped and invalid date/unknown query fields are rejected", async () => {
  const s = await owner.api.patch(`${root}/suppliers/${f.supplier.id}`, {
    data: { ...f.values, name: "=QA Formula " + f.supplier.id, version: 0 },
  });
  expect(s.status()).toBe(200);
  await submitted(owner.api, f);
  const c = await owner.api.get(
    `${root}/reports?kind=suppliers&supplierId=${f.supplier.id}&format=csv`,
  );
  expect(await c.text()).toContain("'=QA Formula");
  for (const query of [
    "kind=unknown",
    "kind=stock&from=2026-02-30",
    "kind=stock&from=2027-01-01&to=2026-01-01",
    "kind=stock&cost=true",
  ])
    expect((await owner.api.get(`${root}/reports?${query}`)).status()).toBe(
      422,
    );
});
test("anonymous/customer/dealer/sales roles cannot see internal costs or mutate stock", async () => {
  const anonymous = await context();
  try {
    for (const resource of [
      "suppliers",
      "purchase-orders",
      "goods-receiving",
      "inventory",
      "stock-ledger",
      "stock-adjustments",
      "reports",
      "options",
    ])
      expect((await anonymous.get(`${root}/${resource}`)).status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
  for (const role of ["CUSTOMER", "DEALER", "SALES_REP"] as const) {
    const a = await registered();
    try {
      await db.user.update({ where: { id: a.user.id }, data: { role } });
      for (const resource of [
        "suppliers",
        "purchase-orders",
        "goods-receiving",
        "inventory",
        "stock-ledger",
        "reports",
      ])
        expect((await a.api.get(`${root}/${resource}`)).status()).toBe(403);
      expect((await adjustment(a.api, f.variants[0].id, 1)).status()).toBe(403);
    } finally {
      await a.api.dispose();
    }
  }
  const publicResult = await owner.api.get("/api/v1/catalogue");
  expect(await publicResult.text()).not.toMatch(
    /purchaseRate|ratePaise|supplierSnapshot|StockMovement/,
  );
});
test("origin/media type/request size guards protect new mutations", async () => {
  const path = `${root}/suppliers`;
  expect(
    (
      await owner.api.post(path, {
        data: f.values,
        headers: { Origin: "https://evil.invalid" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.api.post(path, {
        data: "{}",
        headers: { "Content-Type": "text/plain" },
      })
    ).status(),
  ).toBe(415);
  expect(
    (
      await owner.api.post(path, {
        data: { ...f.values, notes: "x".repeat(17000) },
      })
    ).status(),
  ).toBe(413);
});
test("idempotency rejects altered retries for PO/GRN/stock adjustments", async () => {
  const p = await po(owner.api, f);
  const replay = await owner.api.post(`${root}/purchase-orders`, {
    data: p.data,
  });
  expect((await replay.json()).data.id).toBe(p.row.id);
  expect(
    (
      await owner.api.post(`${root}/purchase-orders`, {
        data: { ...p.data, notes: "changed" },
      })
    ).status(),
  ).toBe(409);
  await action(owner.api, "purchase-orders", p.row, "SUBMIT");
  const g = await grn(owner.api, p.row);
  expect(
    (
      await (
        await owner.api.post(`${root}/goods-receiving`, { data: g.data })
      ).json()
    ).data.id,
  ).toBe(g.row.id);
  expect(
    (
      await owner.api.post(`${root}/goods-receiving`, {
        data: { ...g.data, invoiceReference: "changed" },
      })
    ).status(),
  ).toBe(409);
  const key = randomUUID();
  expect(
    (
      await adjustment(owner.api, f.variants[1].id, 3, "OPENING", null, {
        requestId: key,
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await adjustment(owner.api, f.variants[1].id, 4, "OPENING", null, {
        requestId: key,
      })
    ).status(),
  ).toBe(409);
});
test("ADMIN can manage purchasing but cannot reverse; supplier historical transactions cannot be deleted", async () => {
  const admin = await staff("ADMIN");
  try {
    const p = await submitted(admin.api, f);
    await receive(admin.api, p, 2);
    expect(
      (await admin.api.get(`${root}/suppliers/${f.supplier.id}`)).status(),
    ).toBe(200);
    await expect(
      db.supplier.delete({ where: { id: f.supplier.id } }),
    ).rejects.toThrow();
    expect(
      (
        await owner.api.patch(`${root}/suppliers/${f.supplier.id}`, {
          data: { ...f.values, status: "INACTIVE", version: 0 },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await owner.api.get(`${root}/suppliers/${f.supplier.id}`)).json())
        .data.purchases,
    ).toHaveLength(1);
  } finally {
    await admin.api.dispose();
  }
});
