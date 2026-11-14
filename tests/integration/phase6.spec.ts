import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { db, context, registered } from "../fixtures/helpers";
import { staff, submitDealer, decide } from "../fixtures/phase3";
import {
  scenario,
  draft,
  allocate,
  action,
  confirmed,
  balance,
  dispatchApi,
  localShipment,
  courierShipment,
} from "../fixtures/phase6";
import { upload, verify, orderAction, png } from "../fixtures/phase5";
import { checkout } from "../fixtures/phase5";
import { adjustment } from "../fixtures/phase4";
let owner: Awaited<ReturnType<typeof staff>>;
test.beforeAll(async () => {
  owner = await staff();
});
test.afterAll(async () => {
  await owner.api.dispose();
  await db.$disconnect();
});

test("delivery evidence rejects oversized files, unknown fields and draft uploads; retries save once", async () => {
  const s = await scenario(owner.api);
  const d = await draft(owner.api, s.o.row.id);
  const multipart = {
    requestId: randomUUID(),
    source: "QA handover evidence",
    sharedWithCustomer: "false",
    file: { name: "qa.png", mimeType: "image/png", buffer: await png() },
  };
  const path = `${dispatchApi}/${d.id}/proofs`;
  expect((await owner.api.post(path, { multipart })).status()).toBe(422);
  await allocate(owner.api, d.id);
  expect((await action(owner.api, d.id, "CONFIRM")).response.status()).toBe(
    200,
  );
  expect(
    (
      await owner.api.post(path, {
        multipart: { ...multipart, extra: "unexpected" },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await owner.api.post(path, {
        multipart: {
          ...multipart,
          file: {
            ...multipart.file,
            buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
          },
        },
      })
    ).status(),
  ).toBe(413);
  for (let i = 0; i < 2; i++)
    expect((await owner.api.post(path, { multipart })).status()).toBe(201);
  expect(await db.deliveryProof.count({ where: { dispatchId: d.id } })).toBe(1);
  expect(
    (await db.dispatch.findUniqueOrThrow({ where: { id: d.id } }))
      .deliveryStatus,
  ).toBe("DISPATCHED");
  await s.b.api.dispose();
});

test("confirmation rechecks reservation expiry after waiting for a stock lock", async () => {
  const s = await scenario(owner.api);
  const d = await draft(owner.api, s.o.row.id);
  await allocate(owner.api, d.id);
  await db.stockReservation.updateMany({
    where: { orderId: s.o.row.id },
    data: { expiresAt: new Date(Date.now() + 2000), version: { increment: 1 } },
  });
  let pending: ReturnType<typeof action> | undefined;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`stock:${s.f.variants[0].id}`},0))::text`;
    pending = action(owner.api, d.id, "CONFIRM");
    await new Promise((resolve) => setTimeout(resolve, 2500));
  });
  expect((await pending!).response.status()).toBe(422);
  expect((await balance(s.f.variants[0].id)).availableDelta).toBe(20);
  expect(
    (await db.dispatch.findUniqueOrThrow({ where: { id: d.id } })).status,
  ).toBe("DRAFT");
  await s.b.api.dispose();
});
test("expired lots are rejected and split-lot confirmation posts one movement per allocation", async () => {
  const s = await scenario(owner.api);
  const d = await draft(owner.api, s.o.row.id);
  const variant = s.f.variants[0].id;
  const expired = await adjustment(owner.api, variant, 3, "CORRECTION", null, {
    batchNumber: "QA-EXPIRED",
    expiresAt: "2020-01-01",
  });
  expect(expired.status()).toBe(201);
  const expiredLot = (await expired.json()).data.movement.lotId;
  const input = {
    requestId: randomUUID(),
    version: d.version,
    reason: "QA lot validation",
    allocations: [{ lineId: d.lines[0].id, lotId: expiredLot, quantity: 2 }],
  };
  expect(
    (
      await owner.api.post(`${dispatchApi}/${d.id}/allocations`, {
        data: input,
      })
    ).status(),
  ).toBe(422);
  const second = await adjustment(owner.api, variant, 2, "CORRECTION", null, {
    batchNumber: "QA-SECOND",
  });
  expect(second.status()).toBe(201);
  const lot2 = (await second.json()).data.movement.lotId;
  const lot1 = await db.stockLot.findFirstOrThrow({
    where: { variantId: variant, receiptLineId: null, batchNumber: null },
  });
  expect(
    (
      await owner.api.post(`${dispatchApi}/${d.id}/allocations`, {
        data: {
          ...input,
          requestId: randomUUID(),
          allocations: [
            { lineId: d.lines[0].id, lotId: lot1.id, quantity: 1 },
            { lineId: d.lines[0].id, lotId: lot2, quantity: 1 },
          ],
        },
      })
    ).status(),
  ).toBe(200);
  expect((await action(owner.api, d.id, "CONFIRM")).response.status()).toBe(
    200,
  );
  expect(
    await db.stockMovement.count({
      where: { dispatchAllocation: { line: { dispatchId: d.id } } },
    }),
  ).toBe(2);
  expect((await balance(variant)).availableDelta).toBe(23);
  await s.b.api.dispose();
});
test("allocated lot depletion is detected before confirmation without negative inventory", async () => {
  const s = await scenario(owner.api);
  const d = await draft(owner.api, s.o.row.id);
  await allocate(owner.api, d.id);
  const a = await db.dispatchAllocation.findFirstOrThrow({
    where: { line: { dispatchId: d.id } },
  });
  expect(
    (
      await adjustment(owner.api, s.f.variants[0].id, 3, "CORRECTION", null, {
        batchNumber: "QA-OTHER-LOT",
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await adjustment(
        owner.api,
        s.f.variants[0].id,
        -19,
        "CORRECTION",
        a.lotId,
      )
    ).status(),
  ).toBe(201);
  expect((await action(owner.api, d.id, "CONFIRM")).response.status()).toBe(
    422,
  );
  expect((await balance(s.f.variants[0].id)).availableDelta).toBe(4);
  expect(
    (
      await adjustment(owner.api, s.f.variants[0].id, -5, "CORRECTION", a.lotId)
    ).status(),
  ).toBe(422);
  await s.b.api.dispose();
});
test("dealer-priced order loses dispatch eligibility if dealer approval is suspended", async () => {
  const s = await scenario(owner.api, false);
  const dealer = await submitDealer(s.b.api);
  await decide(owner.api, dealer.id, "APPROVED");
  const o = await checkout(s.b, s.f.variants[0].id, 1);
  expect(o.row.category).toBe("APPROVED_DEALER");
  await upload(s.b.api, o.row.id);
  await verify(owner.api, o.row.id, o.row.totalPaise);
  const d = await draft(owner.api, o.row.id);
  await allocate(owner.api, d.id);
  await decide(owner.api, dealer.id, "SUSPENDED");
  expect((await action(owner.api, d.id, "CONFIRM")).response.status()).toBe(
    422,
  );
  await s.b.api.dispose();
});
test("fully covered overpayment and pending extra proof require explicit review before dispatch", async () => {
  const s = await scenario(owner.api, false);
  await upload(s.b.api, s.o.row.id);
  await verify(owner.api, s.o.row.id, s.o.row.totalPaise + 100);
  const input = {
    requestId: randomUUID(),
    orderId: s.o.row.id,
    shipment: localShipment,
    reason: "QA unresolved payment",
  };
  expect((await owner.api.post(dispatchApi, { data: input })).status()).toBe(
    422,
  );
  expect(
    (await orderAction(owner.api, s.o.row.id, "RESOLVE_OVERPAYMENT")).status(),
  ).toBe(200);
  await upload(s.b.api, s.o.row.id);
  expect((await owner.api.post(dispatchApi, { data: input })).status()).toBe(
    422,
  );
  await s.b.api.dispose();
});
test("late proof and payment refresh preserve an already-dispatched order state", async () => {
  const s = await scenario(owner.api);
  const d = await confirmed(owner.api, s.o.row.id);
  expect((await upload(s.b.api, s.o.row.id)).status()).toBe(201);
  expect(
    (await db.salesOrder.findUniqueOrThrow({ where: { id: s.o.row.id } }))
      .status,
  ).toBe("DISPATCHED");
  expect(
    (await db.dispatch.findUniqueOrThrow({ where: { id: d.id } })).status,
  ).toBe("CONFIRMED");
  expect(
    await db.stockMovement.count({
      where: { dispatchAllocation: { line: { dispatchId: d.id } } },
    }),
  ).toBe(1);
  await s.b.api.dispose();
});
test("paid multi-variant order creates one full draft with unique number and no stock deduction", async () => {
  const s = await scenario(owner.api, true, true);
  const d = await draft(owner.api, s.o.row.id);
  expect(d.number).toMatch(/^FIX-DSP-\d+$/);
  expect(d.lines).toHaveLength(2);
  expect(
    d.lines.reduce((n: number, l: { quantity: number }) => n + l.quantity, 0),
  ).toBe(5);
  expect(d.packageCount).toBe(2);
  await allocate(owner.api, d.id);
  for (const v of s.f.variants)
    expect((await balance(v.id)).availableDelta).toBe(20);
  expect(
    await db.stockReservation.count({
      where: { orderId: s.o.row.id, status: "ACTIVE" },
    }),
  ).toBe(2);
  await s.b.api.dispose();
});
for (const state of [
  "unpaid",
  "partial",
  "review",
  "rejected",
  "cancelled",
  "expired",
  "missing reservation",
]) {
  test(`${state} orders are blocked by backend dispatch eligibility`, async () => {
    const s = await scenario(owner.api, false);
    if (["partial", "review", "rejected"].includes(state)) {
      await upload(s.b.api, s.o.row.id);
      if (state === "partial") await verify(owner.api, s.o.row.id, 100);
      else if (state === "rejected") {
        const sub = await db.paymentSubmission.findFirstOrThrow({
          where: { orderId: s.o.row.id },
        });
        await owner.api.post(`/api/v1/admin/sales/payments/${sub.id}`, {
          data: {
            action: "REJECT",
            version: sub.version,
            reason: "QA rejected proof",
            internalNotes: "Actual payment not received",
          },
        });
      }
    }
    if (["cancelled", "expired", "missing reservation"].includes(state)) {
      await upload(s.b.api, s.o.row.id);
      await verify(owner.api, s.o.row.id, s.o.row.totalPaise);
      if (state === "cancelled")
        await orderAction(owner.api, s.o.row.id, "CANCEL");
      if (state === "expired")
        await db.stockReservation.updateMany({
          where: { orderId: s.o.row.id },
          data: {
            expiresAt: new Date(Date.now() - 1000),
            version: { increment: 1 },
          },
        });
      if (state === "missing reservation")
        await db.salesOrderLine.create({
          data: {
            orderId: s.o.row.id,
            variantId: s.f.variants[2].id,
            productName: "QA unreserved line",
            variantName: "QA 40g",
            packSize: "40g",
            quantity: 1,
            unitPricePaise: 100,
            linePricePaise: 100,
            taxPaise: 0,
          },
        });
    }
    const r = await owner.api.post(dispatchApi, {
      data: {
        requestId: randomUUID(),
        orderId: s.o.row.id,
        shipment: localShipment,
        reason: "QA blocked dispatch",
      },
    });
    expect(r.status(), await r.text()).toBe(422);
    expect(await db.dispatch.count({ where: { orderId: s.o.row.id } })).toBe(0);
    const q = await owner.api.get(
      `${dispatchApi}?q=${s.o.row.number}&view=blocked`,
    );
    expect((await q.json()).data.items[0].reasons.length).toBeGreaterThan(0);
    await s.b.api.dispose();
  });
}
test("duplicate create retries are idempotent but changed payloads and second drafts conflict", async () => {
  const s = await scenario(owner.api);
  const data = {
    requestId: randomUUID(),
    orderId: s.o.row.id,
    shipment: localShipment,
    reason: "QA duplicate-safe request",
  };
  const rs = await Promise.all([
    owner.api.post(dispatchApi, { data }),
    owner.api.post(dispatchApi, { data }),
  ]);
  expect(rs.map((r) => r.status())).toEqual([201, 201]);
  expect((await rs[0].json()).data.id).toBe((await rs[1].json()).data.id);
  expect(
    (
      await owner.api.post(dispatchApi, {
        data: { ...data, requestId: randomUUID() },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await owner.api.post(dispatchApi, {
        data: { ...data, shipment: { ...localShipment, packageCount: 3 } },
      })
    ).status(),
  ).toBe(409);
  await s.b.api.dispose();
});
test("confirmation consumes each reservation and deducts each actual lot exactly once", async () => {
  const s = await scenario(owner.api, true, true);
  const d = await draft(owner.api, s.o.row.id);
  await allocate(owner.api, d.id);
  const result = await action(owner.api, d.id, "CONFIRM");
  expect(result.response.status(), await result.response.text()).toBe(200);
  expect(
    (
      await owner.api.post(`${dispatchApi}/${d.id}`, { data: result.data })
    ).status(),
  ).toBe(200);
  expect((await action(owner.api, d.id, "CONFIRM")).response.status()).toBe(
    200,
  );
  expect((await balance(s.f.variants[0].id)).availableDelta).toBe(18);
  expect((await balance(s.f.variants[1].id)).availableDelta).toBe(17);
  expect(
    await db.stockMovement.count({
      where: {
        dispatchAllocation: { line: { dispatchId: d.id } },
        kind: "DISPATCH",
      },
    }),
  ).toBe(2);
  expect(
    await db.reservationEvent.count({
      where: { reservation: { orderId: s.o.row.id }, status: "CONSUMED" },
    }),
  ).toBe(2);
  expect(
    (await db.salesOrder.findUniqueOrThrow({ where: { id: s.o.row.id } }))
      .status,
  ).toBe("DISPATCHED");
  expect((await orderAction(owner.api, s.o.row.id, "CANCEL")).status()).toBe(
    422,
  );
  await s.b.api.dispose();
});
test("concurrent confirmations produce one stock deduction and one confirmation event", async () => {
  const s = await scenario(owner.api);
  const d = await draft(owner.api, s.o.row.id);
  await allocate(owner.api, d.id);
  const rs = await Promise.all([
    action(owner.api, d.id, "CONFIRM"),
    action(owner.api, d.id, "CONFIRM"),
  ]);
  expect(rs.map((r) => r.response.status())).toEqual([200, 200]);
  expect((await balance(s.f.variants[0].id)).availableDelta).toBe(18);
  expect(
    await db.deliveryEvent.count({
      where: { dispatchId: d.id, kind: "CONFIRM" },
    }),
  ).toBe(1);
  await s.b.api.dispose();
});
test("confirmation rejects absent packing, person assignment, courier AWB and premature delivery", async () => {
  const s = await scenario(owner.api);
  const d = await draft(owner.api, s.o.row.id, {
    ...localShipment,
    personName: "",
    personPhone: "",
  });
  expect((await action(owner.api, d.id, "CONFIRM")).response.status()).toBe(
    422,
  );
  expect(
    (
      await action(owner.api, d.id, "DELIVERED", {
        recipientName: "QA Person",
        confirmationSource: "QA phone",
      })
    ).response.status(),
  ).toBe(422);
  const edit = await owner.api.patch(`${dispatchApi}/${d.id}`, {
    data: {
      requestId: randomUUID(),
      version: d.version,
      shipment: localShipment,
      reason: "Assigned delivery person",
    },
  });
  expect(edit.status()).toBe(200);
  expect((await action(owner.api, d.id, "CONFIRM")).response.status()).toBe(
    422,
  );
  await allocate(owner.api, d.id);
  expect((await action(owner.api, d.id, "CONFIRM")).response.status()).toBe(
    200,
  );
  await s.b.api.dispose();
});
test("allocations reject other variants and under/over quantities", async () => {
  const s = await scenario(owner.api);
  const d = await draft(owner.api, s.o.row.id);
  const lots = await db.stockLot.findMany({
    where: { variantId: { in: s.f.variants.map((v) => v.id) } },
  });
  const ownLot = lots.find((l) => l.variantId === s.f.variants[0].id)!;
  const wrong = lots.find((l) => l.variantId !== s.f.variants[0].id)!;
  for (const a of [
    { lineId: d.lines[0].id, lotId: wrong.id, quantity: 2 },
    { lineId: d.lines[0].id, lotId: ownLot.id, quantity: 1 },
    { lineId: d.lines[0].id, lotId: ownLot.id, quantity: 3 },
    { lineId: "other-order-line", lotId: ownLot.id, quantity: 2 },
  ])
    expect(
      (
        await owner.api.post(`${dispatchApi}/${d.id}/allocations`, {
          data: {
            requestId: randomUUID(),
            version: d.version,
            reason: "QA invalid allocation",
            allocations: [a],
          },
        })
      ).status(),
    ).toBe(422);
  await s.b.api.dispose();
});
test("fault during second variant deduction rolls back dispatch, consumption, ledger and audit", async () => {
  const s = await scenario(owner.api, true, true);
  const d = await draft(owner.api, s.o.row.id);
  await allocate(owner.api, d.id);
  const target = s.f.variants[1].id;
  expect(target).toMatch(/^[a-z0-9]+$/);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION qa_dispatch_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='DISPATCH' AND NEW."variantId"='${target}' THEN RAISE EXCEPTION 'QA injected fault'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER "QA_dispatch_failure" BEFORE INSERT ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION qa_dispatch_failure()',
  );
  try {
    expect((await action(owner.api, d.id, "CONFIRM")).response.status()).toBe(
      500,
    );
    expect(
      (await db.dispatch.findUniqueOrThrow({ where: { id: d.id } })).status,
    ).toBe("DRAFT");
    expect(
      await db.stockReservation.count({
        where: { orderId: s.o.row.id, status: "ACTIVE" },
      }),
    ).toBe(2);
    expect(
      await db.stockMovement.count({
        where: {
          kind: "DISPATCH",
          variantId: { in: s.f.variants.map((v) => v.id) },
        },
      }),
    ).toBe(0);
    expect(
      await db.deliveryEvent.count({
        where: { dispatchId: d.id, kind: "CONFIRM" },
      }),
    ).toBe(0);
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER "QA_dispatch_failure" ON "StockMovement"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION qa_dispatch_failure()");
  }
  await s.b.api.dispose();
});
test("database blocks draft consumption, negative inventory and edits to confirmed allocations", async () => {
  const s = await scenario(owner.api);
  const d = await draft(owner.api, s.o.row.id);
  await allocate(owner.api, d.id);
  await expect(
    db.stockReservation.updateMany({
      where: { orderId: s.o.row.id },
      data: { status: "CONSUMED", version: { increment: 1 } },
    }),
  ).rejects.toThrow();
  expect((await action(owner.api, d.id, "CONFIRM")).response.status()).toBe(
    200,
  );
  const a = await db.dispatchAllocation.findFirstOrThrow({
    where: { line: { dispatchId: d.id } },
  });
  await expect(
    db.dispatchAllocation.update({
      where: { id: a.id },
      data: { quantity: 3 },
    }),
  ).rejects.toThrow();
  await expect(
    db.stockMovement.updateMany({
      where: { dispatchAllocationId: a.id },
      data: { availableDelta: -99999 },
    }),
  ).rejects.toThrow();
  await s.b.api.dispose();
});
test("courier AWB normalization rejects duplicates and manual details are versioned", async () => {
  const s = await scenario(owner.api);
  const courier = courierShipment();
  const d = await draft(owner.api, s.o.row.id, courier);
  const s2 = await scenario(owner.api);
  expect(
    (
      await owner.api.post(dispatchApi, {
        data: {
          requestId: randomUUID(),
          orderId: s2.o.row.id,
          shipment: { ...courier, awb: courier.awb.toLowerCase() },
          reason: "QA duplicate AWB",
        },
      })
    ).status(),
  ).toBe(409);
  const input = {
    requestId: randomUUID(),
    version: d.version,
    shipment: { ...courier, courierService: "QA revised service" },
    reason: "QA courier booking revised",
  };
  expect(
    (await owner.api.patch(`${dispatchApi}/${d.id}`, { data: input })).status(),
  ).toBe(200);
  expect(
    (
      await owner.api.patch(`${dispatchApi}/${d.id}`, {
        data: { ...input, requestId: randomUUID() },
      })
    ).status(),
  ).toBe(409);
  await allocate(owner.api, d.id);
  expect((await action(owner.api, d.id, "CONFIRM")).response.status()).toBe(
    200,
  );
  expect((await action(owner.api, d.id, "IN_TRANSIT")).response.status()).toBe(
    200,
  );
  expect(
    (
      await action(owner.api, d.id, "DELIVERED", {
        recipientName: "QA Recipient",
        confirmationSource: "Courier telephone confirmation",
      })
    ).response.status(),
  ).toBe(200);
  await s.b.api.dispose();
  await s2.b.api.dispose();
});
test("local delivery requires out-for-delivery then explicit recipient and confirmation source", async () => {
  const s = await scenario(owner.api);
  const d = await confirmed(owner.api, s.o.row.id);
  expect(
    (
      await action(owner.api, d.id, "DELIVERED", {
        recipientName: "QA Person",
        confirmationSource: "Staff witnessed receipt",
      })
    ).response.status(),
  ).toBe(422);
  expect(
    (await action(owner.api, d.id, "OUT_FOR_DELIVERY")).response.status(),
  ).toBe(200);
  expect((await action(owner.api, d.id, "DELIVERED")).response.status()).toBe(
    422,
  );
  expect(
    (
      await action(owner.api, d.id, "DELIVERED", {
        recipientName: "QA Recipient",
        confirmationSource: "Local staff handed to recipient",
      })
    ).response.status(),
  ).toBe(200);
  expect(
    (await action(owner.api, d.id, "DELIVERY_FAILED")).response.status(),
  ).toBe(422);
  const o = (
    await (await s.b.api.get(`/api/v1/me/orders/${s.o.row.id}`)).json()
  ).data;
  expect(o.status).toBe("DELIVERED");
  expect(o.events.some((e: { kind: string }) => e.kind === "DELIVERED")).toBe(
    true,
  );
  await s.b.api.dispose();
});
test("failure requires a reason, supports reassignment and reschedule without stock restoration", async () => {
  const s = await scenario(owner.api);
  const d = await confirmed(owner.api, s.o.row.id);
  expect(
    (
      await action(owner.api, d.id, "DELIVERY_FAILED", { reason: "" })
    ).response.status(),
  ).toBe(422);
  expect(
    (
      await action(owner.api, d.id, "DELIVERY_FAILED", {
        reason: "Customer unavailable at delivery address",
      })
    ).response.status(),
  ).toBe(200);
  let current = await db.dispatch.findUniqueOrThrow({ where: { id: d.id } });
  expect(
    (
      await owner.api.patch(`${dispatchApi}/${d.id}`, {
        data: {
          requestId: randomUUID(),
          version: current.version,
          shipment: { ...localShipment, personName: "QA Replacement Driver" },
          reason: "Reassigned after failed attempt",
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await action(owner.api, d.id, "RESCHEDULE", {
        expectedDate: new Date(Date.now() + 86400000)
          .toISOString()
          .slice(0, 10),
      })
    ).response.status(),
  ).toBe(200);
  expect((await balance(s.f.variants[0].id)).availableDelta).toBe(18);
  current = await db.dispatch.findUniqueOrThrow({ where: { id: d.id } });
  expect(current.deliveryStatus).toBe("ASSIGNED");
  expect(
    (await action(owner.api, d.id, "OUT_FOR_DELIVERY")).response.status(),
  ).toBe(200);
  await s.b.api.dispose();
});
test("returned status never restores stock; inspected owner return is audited and bounded", async () => {
  const s = await scenario(owner.api);
  const d = await confirmed(owner.api, s.o.row.id);
  expect((await action(owner.api, d.id, "RETURNED")).response.status()).toBe(
    422,
  );
  expect(
    (
      await action(owner.api, d.id, "RETURNED", { reference: "QA RTS 001" })
    ).response.status(),
  ).toBe(200);
  expect((await balance(s.f.variants[0].id)).availableDelta).toBe(18);
  const a = await db.dispatchAllocation.findFirstOrThrow({
    where: { line: { dispatchId: d.id } },
  });
  const data = {
    requestId: randomUUID(),
    allocationId: a.id,
    quantity: 1,
    condition: "GOOD",
    receivedAt: new Date().toISOString(),
    reference: "Physical receipt QA001",
    reason: "Counted and inspected returned pack",
    inspectedPhysicalReturn: true,
  };
  const admin = await staff("ADMIN");
  expect(
    (
      await admin.api.post(`${dispatchApi}/${d.id}/physical-return`, { data })
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.api.post(`${dispatchApi}/${d.id}/physical-return`, {
        data: { ...data, inspectedPhysicalReturn: false },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await owner.api.post(`${dispatchApi}/${d.id}/physical-return`, { data })
    ).status(),
  ).toBe(200);
  expect(
    (
      await owner.api.post(`${dispatchApi}/${d.id}/physical-return`, { data })
    ).status(),
  ).toBe(200);
  expect((await balance(s.f.variants[0].id)).availableDelta).toBe(19);
  expect(
    (
      await owner.api.post(`${dispatchApi}/${d.id}/physical-return`, {
        data: { ...data, requestId: randomUUID(), quantity: 2 },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await owner.api.post(`${dispatchApi}/${d.id}/physical-return`, {
        data: { ...data, requestId: randomUUID(), condition: "DAMAGED" },
      })
    ).status(),
  ).toBe(200);
  expect(await balance(s.f.variants[0].id)).toMatchObject({
    availableDelta: 19,
    damagedDelta: 1,
  });
  expect(
    await db.stockMovement.count({ where: { dispatchAllocationId: a.id } }),
  ).toBe(1);
  await admin.api.dispose();
  await s.b.api.dispose();
});
test("administrative correction preserves original dispatch and never changes balances", async () => {
  const s = await scenario(owner.api);
  const d = await confirmed(owner.api, s.o.row.id);
  const admin = await staff("ADMIN");
  expect((await action(admin.api, d.id, "CORRECT")).response.status()).toBe(
    403,
  );
  expect(
    (
      await action(owner.api, d.id, "CORRECT", {
        reason: "Documented correction reference QA001",
        internalRemarks: "Actual dispatch retained; no physical return",
      })
    ).response.status(),
  ).toBe(200);
  expect((await balance(s.f.variants[0].id)).availableDelta).toBe(18);
  expect(
    await db.deliveryEvent.count({
      where: { dispatchId: d.id, kind: "CORRECT" },
    }),
  ).toBe(1);
  await admin.api.dispose();
  await s.b.api.dispose();
});
test("proof uploads are private, validated and cannot mark an order delivered", async () => {
  const s = await scenario(owner.api);
  const d = await confirmed(owner.api, s.o.row.id);
  const bytes = await png();
  const multipart = {
    requestId: randomUUID(),
    source: "QA local handover photograph",
    sharedWithCustomer: "false",
    file: { name: "delivery.png", mimeType: "image/png", buffer: bytes },
  };
  const r = await owner.api.post(`${dispatchApi}/${d.id}/proofs`, {
    multipart,
  });
  expect(r.status(), await r.text()).toBe(201);
  const id = (await r.json()).data.id;
  expect((await s.b.api.get(`/api/v1/delivery-proofs/${id}`)).status()).toBe(
    404,
  );
  expect(
    (await owner.api.get(`/api/v1/delivery-proofs/${id}`)).headers()[
      "cache-control"
    ],
  ).toContain("no-store");
  expect(
    (await db.dispatch.findUniqueOrThrow({ where: { id: d.id } }))
      .deliveryStatus,
  ).toBe("DISPATCHED");
  for (const file of [
    {
      name: "bad.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from('<svg onload="alert(1)"/>'),
    },
    {
      name: "fake.png",
      mimeType: "image/png",
      buffer: Buffer.from("invalid image"),
    },
  ])
    expect(
      (
        await owner.api.post(`${dispatchApi}/${d.id}/proofs`, {
          multipart: { ...multipart, requestId: randomUUID(), file },
        })
      ).status(),
    ).toBeGreaterThanOrEqual(400);
  const shared = await owner.api.post(`${dispatchApi}/${d.id}/proofs`, {
    multipart: {
      ...multipart,
      requestId: randomUUID(),
      sharedWithCustomer: "true",
    },
  });
  expect(shared.status()).toBe(201);
  const sharedId = (await shared.json()).data.id;
  expect(
    (await s.b.api.get(`/api/v1/delivery-proofs/${sharedId}`)).status(),
  ).toBe(200);
  const other = await registered();
  expect(
    (await other.api.get(`/api/v1/delivery-proofs/${sharedId}`)).status(),
  ).toBe(404);
  const anon = await context();
  expect((await anon.get(`/api/v1/delivery-proofs/${sharedId}`)).status()).toBe(
    401,
  );
  expect(
    (
      await s.b.api.post(`${dispatchApi}/${d.id}/proofs`, { multipart })
    ).status(),
  ).toBe(403);
  await other.api.dispose();
  await anon.dispose();
  await s.b.api.dispose();
});
test("customer tracking is owner-scoped and excludes admin notes, ledger and proof internals", async () => {
  const s = await scenario(owner.api);
  const d = await confirmed(owner.api, s.o.row.id);
  const r = await s.b.api.get(`/api/v1/me/orders/${s.o.row.id}/delivery`);
  expect(r.status()).toBe(200);
  const body = await r.text();
  for (const secret of [
    "PRIVATE-DISPATCH-NOTES",
    "internalRemarks",
    "actorId",
    "fileBytes",
    "payloadDigest",
    "lotId",
    "createdById",
  ])
    expect(body).not.toContain(secret);
  const other = await registered();
  expect(
    (await other.api.get(`/api/v1/me/orders/${s.o.row.id}/delivery`)).status(),
  ).toBe(404);
  expect((await other.api.get(`${dispatchApi}/${d.id}`)).status()).toBe(403);
  await other.api.dispose();
  await s.b.api.dispose();
});
test("customers, dealers and sales reps cannot create, edit, confirm or list dispatches", async () => {
  const s = await scenario(owner.api);
  const d = await draft(owner.api, s.o.row.id);
  for (const role of ["CUSTOMER", "DEALER", "SALES_REP"] as const) {
    const a = await registered();
    await db.user.update({ where: { id: a.user.id }, data: { role } });
    expect((await a.api.get(dispatchApi)).status()).toBe(403);
    expect((await a.api.post(dispatchApi, { data: {} })).status()).toBe(403);
    expect(
      (await a.api.patch(`${dispatchApi}/${d.id}`, { data: {} })).status(),
    ).toBe(403);
    expect(
      (await a.api.post(`${dispatchApi}/${d.id}`, { data: {} })).status(),
    ).toBe(403);
    await a.api.dispose();
  }
  const anon = await context();
  expect((await anon.get(dispatchApi)).status()).toBe(401);
  expect(
    (
      await owner.api.post(dispatchApi, {
        headers: { Origin: "https://evil.invalid" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await anon.dispose();
  await s.b.api.dispose();
});
test("suspended customer blocks a prepared dispatch at confirmation time", async () => {
  const s = await scenario(owner.api);
  const d = await draft(owner.api, s.o.row.id);
  await allocate(owner.api, d.id);
  await db.user.update({ where: { id: s.b.user.id }, data: { active: false } });
  expect((await action(owner.api, d.id, "CONFIRM")).response.status()).toBe(
    422,
  );
  expect((await balance(s.f.variants[0].id)).availableDelta).toBe(20);
  await s.b.api.dispose();
});
test("approved dealer can track their own shipment", async () => {
  const s = await scenario(owner.api, false);
  const dealer = await submitDealer(s.b.api);
  expect((await decide(owner.api, dealer.id, "APPROVED")).status()).toBe(200);
  await upload(s.b.api, s.o.row.id);
  await verify(owner.api, s.o.row.id, s.o.row.totalPaise);
  const d = await confirmed(owner.api, s.o.row.id);
  expect(
    (await s.b.api.get(`/api/v1/me/orders/${s.o.row.id}/delivery`)).status(),
  ).toBe(200);
  expect(
    (await s.b.api.post(`${dispatchApi}/${d.id}`, { data: {} })).status(),
  ).toBe(403);
  await s.b.api.dispose();
});
test("queue filters ready, blocked, local, courier and delivery histories", async () => {
  const s = await scenario(owner.api);
  const r = await owner.api.get(
    `${dispatchApi}?q=${s.o.row.number}&view=ready`,
  );
  expect((await r.json()).data.items).toHaveLength(1);
  const d = await confirmed(owner.api, s.o.row.id, courierShipment());
  for (const query of [
    "view=courier",
    "view=history",
    "method=COURIER&deliveryStatus=DISPATCHED",
  ]) {
    const q = await owner.api.get(
      `${dispatchApi}?q=${s.o.row.number}&${query}`,
    );
    expect(q.status()).toBe(200);
    expect((await q.json()).data.items[0].dispatch.id).toBe(d.id);
  }
  expect(
    (
      await (
        await owner.api.get(`${dispatchApi}?q=${s.o.row.number}&view=ready`)
      ).json()
    ).data.items,
  ).toHaveLength(0);
  await s.b.api.dispose();
});
