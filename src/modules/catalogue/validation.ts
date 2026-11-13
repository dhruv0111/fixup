import { z } from "zod";
import { approvedLocalImages } from "./assets";

const text = (max: number) => z.string().trim().max(max);
export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
// Only reviewed, public Cloudinary assets can enter the image optimiser.
const remoteImageUrl = z.url().refine((value) => {
  const url = URL.parse(value);
  if (!url) return false;
  return (
    url.protocol === "https:" &&
    url.hostname === "res.cloudinary.com" &&
    !url.port &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname.includes("/image/upload/") &&
    /\.(png|jpe?g|webp|avif)$/i.test(url.pathname)
  );
}, "Use an approved public Cloudinary raster image URL.");
export const imageUrl = z.union([z.enum(approvedLocalImages), remoteImageUrl]);
export const documentUrl = z.url().refine((value) => {
  const url = URL.parse(value);
  if (!url) return false;
  return (
    url.protocol === "https:" &&
    url.hostname === "res.cloudinary.com" &&
    !url.port &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    (url.pathname.includes("/raw/upload/") ||
      url.pathname.includes("/image/upload/")) &&
    /\.pdf$/i.test(url.pathname)
  );
}, "Use an approved public Cloudinary PDF URL.");
export const categorySchema = z
  .object({
    name: text(100).min(2),
    slug: slugSchema,
    description: text(500).default(""),
    active: z.boolean().default(true),
  })
  .strict();
export const productSchema = z
  .object({
    name: text(150).min(2),
    slug: slugSchema,
    sku: text(60).min(1).nullable(),
    brand: text(100).min(1),
    packSize: text(80).min(1),
    summary: text(280).min(5),
    description: text(4000).min(5),
    sourceNotes: text(2000).default(""),
    categoryId: text(100).min(1),
    active: z.boolean().default(true),
    published: z.boolean().default(false),
    featured: z.boolean().default(false),
    contentApproved: z.boolean().default(false),
    approvalReference: text(500).default(""),
    applications: z.array(text(120).min(1)).max(20).default([]),
    materials: z.array(text(120).min(1)).max(20).default([]),
    specifications: z
      .array(
        z.object({ label: text(100).min(1), value: text(300).min(1) }).strict(),
      )
      .max(30)
      .default([]),
    storageInstructions: text(1500).default(""),
    availability: z
      .enum(["ENQUIRE", "AVAILABLE_ON_REQUEST", "UNAVAILABLE"])
      .default("ENQUIRE"),
    images: z
      .array(
        z
          .object({
            url: imageUrl,
            alt: text(180).min(3),
            approved: z.boolean(),
            sortOrder: z.number().int().min(0).max(100).default(0),
          })
          .strict(),
      )
      .max(6)
      .default([]),
    documents: z
      .array(
        z
          .object({
            title: text(150).min(3),
            kind: z.enum(["TDS", "SDS"]),
            publicUrl: documentUrl.nullable().default(null),
            privateReference: text(500).default(""),
            approved: z.boolean().default(false),
            visibility: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
          })
          .strict()
          .refine(
            (d) =>
              d.visibility === "PUBLIC"
                ? d.approved && !!d.publicUrl
                : d.publicUrl === null,
            "Private documents must have no public URL; public documents require approval.",
          ),
      )
      .max(6)
      .default([]),
  })
  .strict()
  .refine(
    (p) =>
      !p.published || (p.contentApproved && p.approvalReference.length >= 5),
    "Publication requires content approval and a source/authorisation reference.",
  );

export const catalogueQuery = z.object({
  q: text(100).default(""),
  category: z.union([slugSchema, z.literal("")]).default(""),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export const websiteSchema = z
  .object({
    phone: text(20).regex(/^(?:\+?[0-9 ()-]{7,20})?$/),
    whatsapp: text(15).regex(/^(?:[1-9][0-9]{7,14})?$/),
    email: z.union([z.email().max(254), z.literal("")]),
    address: text(500),
    workingHours: text(200),
    aboutText: text(4000),
    aboutApproved: z.boolean(),
  })
  .strict();
export const faqSchema = z
  .object({
    question: text(200).min(5),
    answer: text(2000).min(5),
    published: z.boolean(),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .strict();
export const policySchema = z
  .object({
    title: text(150).min(5),
    body: text(8000).min(10),
    approved: z.boolean().default(false),
  })
  .strict();
export const policySlugs = ["privacy", "terms", "shipping", "returns"] as const;
