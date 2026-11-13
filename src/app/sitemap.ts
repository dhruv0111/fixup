import type { MetadataRoute } from "next";
import { getDb } from "@/server/db/client";
import { publicProductWhere } from "@/modules/catalogue/service";
import { siteUrl } from "@/modules/catalogue/seo";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getDb().product.findMany({
    where: { ...publicProductWhere(), isDemo: false },
    select: { slug: true, updatedAt: true },
    orderBy: { id: "asc" },
    take: 49000,
  });
  const paths = [
    "/",
    "/about",
    "/products",
    "/applications",
    "/become-a-dealer",
    "/bulk-orders",
    "/contact",
    "/faq",
    "/policies/privacy",
    "/policies/terms",
    "/policies/shipping",
    "/policies/returns",
  ];
  return [
    ...paths.map((path) => ({ url: siteUrl(path) })),
    ...products.map((p) => ({
      url: siteUrl(`/products/${p.slug}`),
      lastModified: p.updatedAt,
    })),
  ];
}
