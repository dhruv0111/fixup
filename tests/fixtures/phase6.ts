import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
import { db } from "./helpers";
import {
  salesFixture,
  buyerAccount,
  checkout,
  put,
  upload,
  verify,
} from "./phase5";
export const dispatchApi = "/api/v1/admin/dispatch";
export const localShipment = {
  method: "LOCAL",
  packageCount: 2,
  scheduledDate: new Date().toISOString().slice(0, 10),
  personName: "QA Delivery Person",
  personPhone: "9000000000",
  vehicleNumber: "QA01TEST",
  instructions: "QA front desk",
  internalRemarks: "PRIVATE-DISPATCH-NOTES",
};
export function courierShipment() {
  return {
    method: "COURIER",
    packageCount: 1,
    scheduledDate: new Date().toISOString().slice(0, 10),
    bookingDate: new Date().toISOString().slice(0, 10),
    courierName: "QA Courier",
    courierService: "Manual QA",
    awb: `QA-${randomUUID()}`,
    shippingReference: "QA shipment",
    internalRemarks: "PRIVATE-COURIER-NOTES",
  };
}
export async function scenario(
  api: APIRequestContext,
  paid = true,
  multiple = false,
) {
  const f = await salesFixture(api, 20);
  const b = await buyerAccount();
  if (multiple) await put(b.api, f.variants[1].id, 3);
  const o = await checkout(b, f.variants[0].id, 2);
  if (paid) {
    expect((await upload(b.api, o.row.id)).status()).toBe(201);
    const v = await verify(api, o.row.id, o.row.totalPaise);
    expect(v.response.status(), await v.response.text()).toBe(200);
  }
  return { f, b, o };
}
export async function draft(
  api: APIRequestContext,
  orderId: string,
  shipment: Record<string, unknown> = localShipment,
) {
  const data = {
    requestId: randomUUID(),
    orderId,
    shipment,
    reason: "QA prepare actual packages",
  };
  const r = await api.post(dispatchApi, { data });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()).data;
}
export async function allocate(api: APIRequestContext, id: string) {
  const r = await api.get(`${dispatchApi}/${id}`);
  expect(r.status(), await r.text()).toBe(200);
  const d = (await r.json()).data;
  const allocations = d.lines.map(
    (l: {
      id: string;
      quantity: number;
      orderLine: { variantId: string };
    }) => ({
      lineId: l.id,
      lotId: d.lots.find(
        (lot: { variantId: string }) => lot.variantId === l.orderLine.variantId,
      ).id,
      quantity: l.quantity,
    }),
  );
  const a = await api.post(`${dispatchApi}/${id}/allocations`, {
    data: {
      requestId: randomUUID(),
      version: d.version,
      reason: "QA checked actual lot allocation",
      allocations,
    },
  });
  expect(a.status(), await a.text()).toBe(200);
  return (await a.json()).data;
}
export async function action(
  api: APIRequestContext,
  id: string,
  action: string,
  extra: Record<string, unknown> = {},
) {
  const d = await db.dispatch.findUniqueOrThrow({ where: { id } });
  const data = {
    requestId: randomUUID(),
    version: d.version,
    action,
    reason: "QA verified delivery event",
    confirmed: true,
    occurredAt: new Date().toISOString(),
    ...extra,
  };
  return { data, response: await api.post(`${dispatchApi}/${id}`, { data }) };
}
export async function confirmed(
  api: APIRequestContext,
  orderId: string,
  shipment?: Record<string, unknown>,
) {
  const d = await draft(api, orderId, shipment);
  await allocate(api, d.id);
  const r = await action(api, d.id, "CONFIRM");
  expect(r.response.status(), await r.response.text()).toBe(200);
  return (await r.response.json()).data;
}
export async function balance(variantId: string) {
  return (
    await db.stockMovement.aggregate({
      where: { variantId },
      _sum: { availableDelta: true, damagedDelta: true },
    })
  )._sum;
}
