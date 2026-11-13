import { z } from "zod";
const text = (n: number) =>
  z
    .string()
    .trim()
    .max(n)
    .regex(/^[^<>\u0000-\u001f]*$/);
const prose = (n: number) =>
  z
    .string()
    .trim()
    .max(n)
    .regex(/^[^<>\u0000-\u0008\u000b\u000c\u000e-\u001f]*$/);
const id = z.string().min(1).max(100);
export const reason = text(350).min(5);
export const version = z.number().int().nonnegative();
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Enter a valid date.",
  );
export const optionalDay = z
  .union([day, z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);
const batch = {
  batchNumber: text(100)
    .nullable()
    .optional()
    .transform((v) => v || null),
  manufacturedAt: optionalDay,
  expiresAt: optionalDay,
};
export function datesValid(v: {
  manufacturedAt?: string | null;
  expiresAt?: string | null;
}) {
  return !v.manufacturedAt || !v.expiresAt || v.manufacturedAt <= v.expiresAt;
}
export const supplierSchema = z
  .object({
    name: text(160).min(2),
    contactName: text(100).min(2),
    phone: text(20).regex(/^\+?[0-9 ()-]{7,20}$/),
    email: z.email().max(254),
    address: text(300).min(3),
    city: text(100).min(2),
    state: text(100).min(2),
    postalCode: z.string().regex(/^[1-9][0-9]{5}$/),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
      .nullable()
      .default(null),
    supplierType: text(100).min(2),
    paymentTerms: prose(500).default(""),
    notes: prose(2000).default(""),
    status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]).default("ACTIVE"),
    variantIds: z.array(id).max(100).default([]),
    version: version.optional(),
    reason,
  })
  .strict()
  .refine(
    (v) => new Set(v.variantIds).size === v.variantIds.length,
    "Choose each variant once.",
  );
export const purchaseLine = z
  .object({
    variantId: id,
    quantity: z.number().int().min(1).max(1_000_000),
    ratePaise: z.number().int().min(1).max(100_000_000),
    taxBps: z.number().int().min(0).max(10000),
    discountPaise: z.number().int().min(0).max(2_000_000_000).default(0),
  })
  .strict()
  .refine(
    (v) =>
      v.quantity * v.ratePaise <= 2_000_000_000 &&
      v.discountPaise <= v.quantity * v.ratePaise,
    "Line amount or discount is outside supported limits.",
  );
export const purchaseSchema = z
  .object({
    requestId: z.uuid(),
    supplierId: id,
    expectedDate: optionalDay,
    notes: prose(2000).default(""),
    lines: z.array(purchaseLine).min(1).max(50),
    version: version.optional(),
    reason,
  })
  .strict()
  .refine(
    (v) => new Set(v.lines.map((l) => l.variantId)).size === v.lines.length,
    "Choose each variant once.",
  );
export const receiptLine = z
  .object({
    purchaseLineId: id,
    quantity: z.number().int().min(1).max(1_000_000),
    ...batch,
  })
  .strict()
  .refine(datesValid, "Expiry must not precede manufacture.");
export const receiptSchema = z
  .object({
    requestId: z.uuid(),
    purchaseOrderId: id,
    invoiceReference: text(150).default(""),
    notes: prose(2000).default(""),
    lines: z.array(receiptLine).min(1).max(50),
    version: version.optional(),
    reason,
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.lines.map((l) => l.purchaseLineId)).size === v.lines.length,
    "Choose each PO line once per GRN.",
  );
export const actionSchema = z
  .object({
    action: z.enum(["SUBMIT", "CANCEL", "CONFIRM", "REVERSE"]),
    version,
    reason,
    confirmed: z.literal(true),
  })
  .strict();
export const adjustmentSchema = z
  .object({
    requestId: z.uuid(),
    variantId: id,
    lotId: id.nullable().default(null),
    kind: z.enum(["OPENING", "CORRECTION", "DAMAGE", "MISSING", "OTHER"]),
    quantity: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((v) => v !== 0),
    reason,
    confirmed: z.literal(true),
    ...batch,
  })
  .strict()
  .refine(datesValid, "Expiry must not precede manufacture.")
  .refine(
    (v) =>
      ((v.kind !== "OPENING" && v.kind !== "DAMAGE") || v.quantity > 0) &&
      (v.kind !== "MISSING" || v.quantity < 0) &&
      (!(v.quantity < 0 || v.kind === "DAMAGE") || !!v.lotId) &&
      (v.kind !== "OPENING" || !v.lotId),
    "Choose a valid operation, signed quantity and existing lot for deductions/damage.",
  )
  .refine(
    (v) => !v.lotId || (!v.batchNumber && !v.manufacturedAt && !v.expiresAt),
    "Existing lot metadata is preserved.",
  );
export const thresholdSchema = z
  .object({
    minimumQuantity: z.number().int().min(0).max(2_000_000_000).nullable(),
    version,
    reason,
  })
  .strict();
export const reportKinds = [
  "stock",
  "purchases",
  "suppliers",
  "receipts",
  "movements",
  "damage",
  "adjustments",
  "low-stock",
  "batches",
] as const;
const filterId = z
  .union([id, z.literal("")])
  .optional()
  .transform((v) => v || undefined);
export const querySchema = z
  .object({
    q: text(100).default(""),
    status: text(30).default(""),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    from: optionalDay,
    to: optionalDay,
    variantId: filterId,
    supplierId: filterId,
    kind: z.enum(reportKinds).default("stock"),
    format: z.enum(["json", "csv"]).default("json"),
  })
  .strict()
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "End date must follow start date.",
  );
export function calculate(lines: z.infer<typeof purchaseLine>[]) {
  const items = lines.map((l) => {
    const subtotalPaise = l.quantity * l.ratePaise;
    const taxPaise = Number(
      (BigInt(subtotalPaise - l.discountPaise) * BigInt(l.taxBps) + 5000n) /
        10000n,
    );
    return {
      ...l,
      subtotalPaise,
      taxPaise,
      totalPaise: subtotalPaise - l.discountPaise + taxPaise,
    };
  });
  const sums = {
    subtotalPaise: 0,
    discountPaise: 0,
    taxPaise: 0,
    totalPaise: 0,
  };
  for (const l of items)
    for (const k of Object.keys(sums) as (keyof typeof sums)[]) sums[k] += l[k];
  if (
    sums.totalPaise > 2_000_000_000 ||
    sums.subtotalPaise > 2_000_000_000 ||
    items.some((i) => i.totalPaise > 2_000_000_000)
  )
    throw new Error("PURCHASE_AMOUNT_LIMIT");
  return { items, ...sums };
}
export function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "No matching records\r\n";
  const keys = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (typeof v === "string" && /^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    [keys, ...rows.map((r) => keys.map((k) => r[k]))]
      .map((r) => r.map(cell).join(","))
      .join("\r\n") + "\r\n"
  );
}
