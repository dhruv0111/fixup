import type { PrismaClient } from "@/generated/prisma/client";
import { qwikPackaging, qwikShowcase } from "./assets";
// Only owner-supplied identity, pack sizes and images are approved here. No technical claims or prices.
export async function seedQwik(db: PrismaClient) {
  return db.$transaction(async tx => {
    const category = await tx.category.upsert({ where: { slug: "instant-adhesive-super-glue" }, update: {}, create: { slug: "instant-adhesive-super-glue", name: "Instant Adhesive / Super Glue" } });
    const product = await tx.product.upsert({ where: { slug: "fixup-qwik-instant-adhesive" }, update: {}, create: {
      name: "FIXUP QWIK Instant Adhesive", slug: "fixup-qwik-instant-adhesive", brand: "FIXUP", packSize: "8g / 20g / 40g / 50g", categoryId: category.id,
      summary: "FIXUP QWIK Instant Adhesive in four pack sizes. Enquire for pricing and availability.",
      description: "Choose from 8g, 20g, 40g and 50g packs of FIXUP QWIK Instant Adhesive. Individual pack photographs and approved technical documents are awaited.",
      sourceNotes: "The supplied packaging describes Cyanoacrylate Adhesive, bonding in 5–10 seconds, and use with wood, metal, plastic, granite, ceramic, leather, rubber and glass. These are packaging statements, not independently verified technical specifications. Consult approved TDS/SDS documentation for authoritative information; none has been supplied yet.",
      featured: true, published: true, contentApproved: true, approvalReference: "Owner Phase 3 brief: product identity, four pack sizes and supplied images only.",
      images: { create: [{ url: qwikShowcase, alt: "FIXUP QWIK supplied marketing image with 50g bottle and packaging", approved: true, sortOrder: 0 }, { url: qwikPackaging, alt: "FIXUP QWIK 50g super glue packaging, supplied studio photograph", approved: true, sortOrder: 1 }] },
    } });
    for (const packSize of ["8g", "20g", "40g", "50g"]) await tx.productVariant.upsert({ where: { productId_packSize: { productId: product.id, packSize } }, update: {}, create: {
      productId: product.id, name: `FIXUP QWIK ${packSize}`, packSize, active: true, published: true, contentApproved: true,
      approvalReference: "Owner Phase 3 brief confirms this pack size.", imageUrl: qwikPackaging,
      imageAlt: packSize === "50g" ? "Supplied FIXUP QWIK 50g packaging" : `Representative 50g FIXUP QWIK packaging; not the ${packSize} pack`, imageApproved: true, representative: packSize !== "50g",
      mrpReferencePaise: packSize === "50g" ? 17500 : null,
      mrpReferenceNote: packSize === "50g" ? "₹175 visible on supplied 50g image. Reference only; confirm current MRP before publishing. Not a selling price." : "",
    } });
    return product;
  });
}
