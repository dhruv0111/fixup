import "server-only";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import { recordAudit } from "@/server/audit/service";
import type { Actor } from "@/server/permissions/service";
import {
  categorySchema,
  productSchema,
  websiteSchema,
  faqSchema,
  policySchema,
  policySlugs,
} from "./validation";

const envelope = z
  .object({
    id: z.string().max(100).optional(),
    data: z.unknown(),
    reason: z.string().trim().min(5).max(350),
  })
  .strict();
export async function saveContent(
  actor: Actor,
  resource: string,
  input: unknown,
) {
  if (!actor.permissions.includes("catalogue.write"))
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only the owner can publish website content.",
    );
  const { id, data, reason } = envelope.parse(input);
  return getDb().$transaction(async (tx) => {
    let entityType:
      "Category" | "Product" | "WebsiteContent" | "Faq" | "Policy";
    let result: { id: string };
    switch (resource) {
      case "categories": {
        entityType = "Category";
        const values = categorySchema.parse(data);
        result = id
          ? await tx.category.update({ where: { id }, data: values })
          : await tx.category.create({ data: values });
        break;
      }
      case "products": {
        entityType = "Product";
        const { images, documents, ...values } = productSchema.parse(data);
        if (
          !(await tx.category.findUnique({ where: { id: values.categoryId } }))
        )
          throw new AppError(
            422,
            "INVALID_CATEGORY",
            "Choose an existing category.",
          );
        if (id)
          result = await tx.product.update({
            where: { id },
            data: {
              ...values,
              images: { deleteMany: {}, create: images },
              documents: { deleteMany: {}, create: documents },
            },
          });
        else
          result = await tx.product.create({
            data: {
              ...values,
              images: { create: images },
              documents: { create: documents },
            },
          });
        break;
      }
      case "website":
        entityType = "WebsiteContent";
        result = await tx.websiteContent.upsert({
          where: { id: "singleton" },
          create: { id: "singleton", ...websiteSchema.parse(data) },
          update: websiteSchema.parse(data),
        });
        break;
      case "faqs":
        entityType = "Faq";
        result = id
          ? await tx.faq.update({ where: { id }, data: faqSchema.parse(data) })
          : await tx.faq.create({ data: faqSchema.parse(data) });
        break;
      case "policies": {
        entityType = "Policy";
        const key = z.enum(policySlugs).parse(id);
        result = await tx.policy.upsert({
          where: { id: key },
          create: { id: key, ...policySchema.parse(data) },
          update: policySchema.parse(data),
        });
        break;
      }
      default:
        throw new AppError(404, "NOT_FOUND", "Resource not found.");
    }
    await recordAudit(
      {
        actorId: actor.id,
        action:
          entityType === "Product" || entityType === "Category"
            ? "CATALOGUE_UPDATED"
            : "CONTENT_UPDATED",
        entityType,
        entityId: result.id,
        reason,
      },
      tx,
    );
    return { id: result.id };
  });
}
export async function adminContent(actor: Actor, resource: string) {
  if (!actor.permissions.includes("catalogue.read"))
    throw new AppError(403, "FORBIDDEN", "Content access is restricted.");
  const db = getDb();
  switch (resource) {
    case "products":
      return db.product.findMany({
        include: { images: true, documents: true, variants: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    case "categories":
      return db.category.findMany({ orderBy: { name: "asc" }, take: 100 });
    case "website":
      return db.websiteContent.findUnique({ where: { id: "singleton" } });
    case "faqs":
      return db.faq.findMany({ orderBy: { sortOrder: "asc" }, take: 100 });
    case "policies":
      return db.policy.findMany({ orderBy: { id: "asc" } });
    default:
      throw new AppError(404, "NOT_FOUND", "Resource not found.");
  }
}
