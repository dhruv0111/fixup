import { z } from "zod";
export function businessDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[^<>\u0000-\u001f]*$/);
export const reason = text(500).min(5);
export const requestId = z.uuid();
export const methods = ["LOCAL", "COURIER"] as const;
export const statuses = [
  "PENDING",
  "ASSIGNED",
  "DISPATCHED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNED",
] as const;
export function trackingUrl(template: string, awb: string) {
  if (!template) return null;
  if (template.split("{awb}").length !== 2) return null;
  try {
    const url = new URL(template.replace("{awb}", encodeURIComponent(awb)));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      /[{}]/.test(url.hostname) ||
      template.slice(0, template.indexOf("/", 8)).includes("{awb}")
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}
export const shipmentSchema = z
  .object({
    method: z.enum(methods),
    packageCount: z.number().int().min(1).max(10000),
    scheduledDate: z.iso.date(),
    expectedDate: z.iso.date().nullable().default(null),
    personName: text(100).default(""),
    personPhone: text(20)
      .regex(/^(?:\+?[0-9 ()-]{7,20})?$/)
      .default(""),
    vehicleNumber: text(40).default(""),
    instructions: text(1000).default(""),
    courierName: text(100).default(""),
    courierService: text(100).default(""),
    awb: text(100)
      .regex(/^(?:[A-Za-z0-9][A-Za-z0-9 ._/-]{2,99})?$/)
      .default(""),
    bookingDate: z.iso.date().nullable().default(null),
    shippingReference: text(150).default(""),
    trackingTemplate: z
      .string()
      .trim()
      .max(500)
      .default("")
      .refine(
        (v) => !v || !!trackingUrl(v, "TEST123"),
        "Use a verified HTTPS URL with one {awb} placeholder outside the hostname.",
      ),
    internalRemarks: text(1000).default(""),
  })
  .strict()
  .refine(
    (v) => !v.expectedDate || v.expectedDate >= v.scheduledDate,
    "Expected delivery cannot precede scheduled dispatch.",
  )
  .refine(
    (v) =>
      v.method !== "LOCAL" ||
      (!v.courierName &&
        !v.awb &&
        !v.trackingTemplate &&
        !v.bookingDate &&
        !v.courierService &&
        !v.shippingReference),
    "Local delivery cannot contain courier fields.",
  )
  .refine(
    (v) =>
      v.method !== "COURIER" ||
      (!v.personName && !v.personPhone && !v.vehicleNumber),
    "Courier delivery cannot contain local assignment fields.",
  )
  .refine(
    (v) => !!v.personName === !!v.personPhone,
    "Delivery person name and phone are required together.",
  );
export const draftSchema = z
  .object({
    requestId,
    orderId: z.string().min(1).max(100),
    shipment: shipmentSchema,
    reason,
  })
  .strict();
export const editSchema = z
  .object({
    version: z.number().int().nonnegative(),
    requestId,
    shipment: shipmentSchema,
    reason,
  })
  .strict();
export const allocationSchema = z
  .object({
    requestId,
    version: z.number().int().nonnegative(),
    reason,
    allocations: z
      .array(
        z
          .object({
            lineId: z.string().min(1).max(100),
            lotId: z.string().min(1).max(100),
            quantity: z.number().int().min(1).max(10000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.allocations.map((a) => `${a.lineId}:${a.lotId}`)).size ===
      v.allocations.length,
    "Duplicate lot allocation.",
  );
export const actionSchema = z
  .object({
    requestId,
    version: z.number().int().nonnegative(),
    action: z.enum([
      "CONFIRM",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "DELIVERY_FAILED",
      "RESCHEDULE",
      "RETURNED",
      "CORRECT",
    ]),
    reason,
    confirmed: z.literal(true),
    occurredAt: z.iso
      .datetime({ offset: true })
      .refine(
        (v) => new Date(v).getTime() <= Date.now() + 60000,
        "Event time cannot be in the future.",
      ),
    publicMessage: text(500).default(""),
    internalRemarks: text(1000).default(""),
    reference: text(150).default(""),
    expectedDate: z.iso.date().nullable().optional(),
    recipientName: text(100).default(""),
    confirmationSource: text(200).default(""),
  })
  .strict();
export const returnSchema = z
  .object({
    requestId,
    allocationId: z.string().min(1).max(100),
    quantity: z.number().int().min(1).max(10000),
    condition: z.enum(["GOOD", "DAMAGED"]),
    receivedAt: z.iso
      .datetime({ offset: true })
      .refine((v) => new Date(v).getTime() <= Date.now() + 60000),
    reference: text(150).min(3),
    reason,
    inspectedPhysicalReturn: z.literal(true),
  })
  .strict();
export function transition(
  method: string,
  current: string,
  action: string,
): string | null {
  if (action === "CORRECT") return current;
  if (action === "RESCHEDULE" && current === "DELIVERY_FAILED")
    return method === "LOCAL" ? "ASSIGNED" : "IN_TRANSIT";
  if (
    action === "IN_TRANSIT" &&
    method === "COURIER" &&
    current === "DISPATCHED"
  )
    return "IN_TRANSIT";
  if (
    action === "OUT_FOR_DELIVERY" &&
    ["DISPATCHED", "ASSIGNED", "IN_TRANSIT"].includes(current)
  )
    return "OUT_FOR_DELIVERY";
  if (
    action === "DELIVERY_FAILED" &&
    ["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(current)
  )
    return "DELIVERY_FAILED";
  if (
    action === "DELIVERED" &&
    (method === "COURIER"
      ? ["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY"]
      : ["OUT_FOR_DELIVERY"]
    ).includes(current)
  )
    return "DELIVERED";
  if (
    action === "RETURNED" &&
    ["DELIVERY_FAILED", "IN_TRANSIT", "DISPATCHED"].includes(current)
  )
    return "RETURNED";
  return null;
}
export function awbKey(courier: string, awb: string) {
  return awb
    ? `${courier.toLowerCase().replace(/[^a-z0-9]/g, "")}:${awb.toUpperCase().replace(/[^A-Z0-9]/g, "")}`
    : null;
}
