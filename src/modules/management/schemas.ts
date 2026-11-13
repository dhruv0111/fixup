import { z } from "zod";
import { imageUrl } from "@/modules/catalogue/validation";
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[^<>\u0000-\u001f]*$/);
export const reasonSchema = text(350).min(5);
export const versionSchema = z.number().int().nonnegative();
export const categoryKey = z.enum(["RETAIL", "APPROVED_DEALER"]);
export const dealerApplication = z
  .object({
    businessName: text(160).min(2),
    contactName: text(100).min(2),
    phone: text(20).regex(/^\+?[0-9 ()-]{7,20}$/),
    email: z.email().max(254),
    address: text(300).min(3),
    city: text(100).min(2),
    state: text(100).min(2),
    postalCode: z.string().regex(/^[1-9][0-9]{5}$/),
    businessType: text(100).min(2),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
      .nullable()
      .default(null),
    expectedVolume: text(200).min(1),
    message: text(1000).default(""),
  })
  .strict();
export const dealerReview = z
  .object({
    status: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
    version: versionSchema,
    reason: reasonSchema,
  })
  .strict();
export const customerStatus = z
  .object({ active: z.boolean(), version: versionSchema, reason: reasonSchema })
  .strict();
export const money = z.number().int().min(1).max(100_000_000);
export const priceEntry = z
  .object({
    productId: z.string().min(1).max(100).nullable().default(null),
    variantId: z.string().min(1).max(100).nullable().default(null),
    amountPaise: money,
  })
  .strict()
  .refine(
    (v) => !!v.productId !== !!v.variantId,
    "Choose a product or a variant.",
  );
export const priceListSchema = z
  .object({
    name: text(100).min(2),
    active: z.boolean(),
    entries: z.array(priceEntry).max(100),
    version: versionSchema.optional(),
    reason: reasonSchema,
  })
  .strict()
  .refine(
    (v) =>
      new Set(
        v.entries.map((e) =>
          e.variantId ? `v:${e.variantId}` : `p:${e.productId}`,
        ),
      ).size === v.entries.length,
    "Duplicate price target.",
  );
export const assignmentSchema = z
  .object({
    category: categoryKey,
    priceListId: z.string().min(1).max(100).nullable(),
    version: versionSchema,
    reason: reasonSchema,
  })
  .strict();
export const quoteSchema = z
  .object({
    productId: z.string().min(1).max(100).optional(),
    variantId: z.string().min(1).max(100).optional(),
    quantity: z.number().int().min(1).max(10000),
  })
  .strict()
  .refine(
    (v) => !!v.productId !== !!v.variantId,
    "Choose exactly one product or variant.",
  );
export const variantSchema = z
  .object({
    name: text(150).min(2),
    packSize: text(80).min(1),
    sku: text(60).min(1).nullable(),
    active: z.boolean(),
    published: z.boolean(),
    contentApproved: z.boolean(),
    approvalReference: text(500),
    imageUrl: imageUrl.nullable(),
    imageAlt: text(180),
    imageApproved: z.boolean(),
    representative: z.boolean(),
    mrpPaise: money.nullable(),
    mrpConfirmed: z.boolean(),
    version: versionSchema.optional(),
    reason: reasonSchema,
  })
  .strict()
  .refine(
    (v) =>
      !v.published || (v.contentApproved && v.approvalReference.length >= 5),
    "Publication requires approval and reference.",
  )
  .refine(
    (v) => !v.imageUrl || v.imageAlt.length >= 3,
    "Image alt text is required.",
  )
  .refine(
    (v) => (v.mrpPaise === null ? !v.mrpConfirmed : v.mrpConfirmed),
    "Confirm the MRP before saving an amount.",
  );
export const listQuery = z
  .object({
    q: text(100).default(""),
    status: z
      .enum([
        "",
        "ACTIVE",
        "INACTIVE",
        "PENDING",
        "APPROVED",
        "REJECTED",
        "SUSPENDED",
      ])
      .default(""),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
