import "server-only";
import { cache } from "react";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/config/env";
import { catalogueQuery, documentUrl, imageUrl } from "./validation";
import { policyDrafts } from "./content";

export function publicProductWhere() {
  const production = getEnv().APP_ENV === "production";
  return {
    active: true,
    published: true,
    contentApproved: true,
    ...(production ? { isDemo: false } : {}),
    category: { active: true, ...(production ? { isDemo: false } : {}) },
  };
}
const select = {
  id: true,
  slug: true,
  sku: true,
  name: true,
  brand: true,
  packSize: true,
  summary: true,
  description: true,
  sourceNotes: true,
  applications: true,
  materials: true,
  specifications: true,
  storageInstructions: true,
  availability: true,
  featured: true,
  isDemo: true,
  updatedAt: true,
  category: { select: { name: true, slug: true } },
  variants: {
    where: { active: true, published: true, contentApproved: true },
    orderBy: { createdAt: "asc" as const },
    select: { id: true, name: true, packSize: true, sku: true, imageUrl: true, imageAlt: true, imageApproved: true, representative: true, mrpPaise: true, mrpConfirmed: true },
  },
  images: {
    where: { approved: true },
    orderBy: { sortOrder: "asc" as const },
    select: { url: true, alt: true },
  },
  documents: {
    where: { approved: true, visibility: "PUBLIC" },
    select: { title: true, kind: true, publicUrl: true },
  },
} as const;
type Row = Awaited<ReturnType<typeof queryProduct>>;
function queryProduct(slug: string) {
  return getDb().product.findFirst({
    where: { ...publicProductWhere(), slug },
    select,
  });
}
function safeProduct(row: NonNullable<Row>) {
  return {
    ...row,
    variants: row.variants.map(({ imageApproved, mrpConfirmed, ...v }) => ({ ...v, imageUrl: imageApproved && imageUrl.safeParse(v.imageUrl).success ? v.imageUrl : null, mrpPaise: mrpConfirmed ? v.mrpPaise : null })),
    images: row.images.filter((i) => imageUrl.safeParse(i.url).success),
    documents: row.documents.filter(
      (d) => documentUrl.safeParse(d.publicUrl).success,
    ),
    purchasable: false as const,
  };
}
export type PublicProduct = ReturnType<typeof safeProduct>;
export const getPublicProduct = cache(async (slug: string) => {
  const row = await queryProduct(slug);
  return row ? safeProduct(row) : null;
});
export async function listProducts(input: unknown = {}) {
  const { q, category, page } = catalogueQuery.parse(input);
  const where = {
    ...publicProductWhere(),
    ...(category
      ? { category: { ...publicProductWhere().category, slug: category } }
      : {}),
    ...(q
      ? {
          OR: ["name", "sku", "brand", "summary"].map((key) => ({
            [key]: { contains: q, mode: "insensitive" as const },
          })),
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    getDb().product.findMany({
      where,
      select,
      orderBy: [{ featured: "desc" }, { name: "asc" }, { id: "asc" }],
      skip: (page - 1) * 12,
      take: 12,
    }),
    getDb().product.count({ where }),
  ]);
  return {
    products: rows.map(safeProduct),
    total,
    page,
    pages: Math.ceil(total / 12),
  };
}
export async function listCategories() {
  return getDb().category.findMany({
    where: {
      active: true,
      ...(getEnv().APP_ENV === "production" ? { isDemo: false } : {}),
      products: { some: publicProductWhere() },
    },
    select: { name: true, slug: true, description: true, isDemo: true },
    orderBy: { name: "asc" },
  });
}
export const getWebsite = cache(async () => {
  const row = await getDb().websiteContent.findUnique({
    where: { id: "singleton" },
  });
  return (
    row ?? {
      phone: "",
      whatsapp: "",
      email: "",
      address: "",
      workingHours: "",
      aboutText: "",
      aboutApproved: false,
    }
  );
});
export async function getFaqs() {
  return getDb().faq.findMany({
    where: { published: true },
    select: { id: true, question: true, answer: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}
export async function getApplications() {
  const rows = await getDb().product.findMany({
    where: publicProductWhere(),
    select,
    orderBy: { name: "asc" },
    take: 100,
  });
  return rows
    .map(safeProduct)
    .filter((p) => p.applications.length > 0 && !p.isDemo);
}
export async function getPolicy(slug: keyof typeof policyDrafts) {
  return (
    (await getDb().policy.findUnique({ where: { id: slug } })) ?? {
      ...policyDrafts[slug],
      approved: false,
    }
  );
}
export async function productOptions() {
  return getDb().product.findMany({
    where: publicProductWhere(),
    select: { id: true, name: true, sku: true, isDemo: true },
    orderBy: { name: "asc" },
    take: 500,
  });
}
export async function featuredProducts() {
  const rows = await getDb().product.findMany({
    where: { ...publicProductWhere(), featured: true },
    select,
    orderBy: { name: "asc" },
    take: 3,
  });
  return rows.map(safeProduct);
}
