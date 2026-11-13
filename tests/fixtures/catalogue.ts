import { randomUUID, createHmac } from "node:crypto";
import { db } from "./helpers";
export function formToken(age = 3000) {
  const payload = `${Date.now() - age}.${randomUUID()}`;
  return `${payload}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(`challenge:${payload}`).digest("hex")}`;
}
export function enquiryData(
  kind = "CONTACT",
  extra: Record<string, unknown> = {},
) {
  return {
    requestId: randomUUID(),
    kind,
    name: "QA Customer",
    phone: "9000000000",
    message: `QA enquiry ${randomUUID()}`,
    consent: true,
    token: formToken(),
    ...extra,
  };
}
export async function catalogueFixture() {
  const prefix = `qa-${randomUUID()}`;
  const category = await db.category.create({
    data: { name: `Demo ${prefix}`, slug: prefix, isDemo: true },
  });
  const products = [];
  for (let i = 0; i < 14; i++)
    products.push(
      await db.product.create({
        data: {
          name: `Demo ${prefix} ${String(i).padStart(2, "0")}`,
          slug: `${prefix}-${i}`,
          sku: `${prefix}-${i}`,
          brand: "Development demo",
          packSize: "Demo pack",
          summary: "Development fixture, not a real product.",
          description: "For automated testing only. No technical claims.",
          categoryId: category.id,
          isDemo: true,
          published: true,
          contentApproved: true,
          approvalReference: "Automated QA fixture",
          featured: i === 0,
        },
      }),
    );
  const hidden = await db.product.create({
    data: {
      ...products[0],
      id: undefined,
      specifications: [],
      slug: `${prefix}-hidden`,
      sku: `${prefix}-hidden`,
      name: "Hidden QA product",
      published: false,
    },
  });
  return { prefix, category, products, hidden };
}
