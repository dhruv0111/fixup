import "server-only";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import type { Actor } from "@/server/permissions/service";
import type { Prisma } from "@/generated/prisma/client";
import { publicProductWhere } from "@/modules/catalogue/service";
import { priceListSchema, assignmentSchema, quoteSchema, variantSchema } from "./schemas";
import { allowed, conflict, history } from "./history";

export async function pricingAdmin(actor: Actor, id?: string) {
  allowed(actor, "pricing.manage");
  const db = getDb();
  if (id) {
    const list = await db.priceList.findUnique({ where: { id }, include: { entries: true } });
    if (!list) throw new AppError(404, "NOT_FOUND", "Price list not found.");
    return { list, history: await db.managementEvent.findMany({ where: { OR: [{ entityType: "PriceList", entityId: id }, { entityType: "CategoryPriceList" }] }, orderBy: { createdAt: "desc" }, take: 100 }) };
  }
  return { lists: await db.priceList.findMany({ orderBy: { createdAt: "desc" }, take: 100 }), assignments: await db.categoryPriceList.findMany({ orderBy: { category: "asc" } }), products: await db.product.findMany({ select: { id: true, name: true, variants: { select: { id: true, name: true, packSize: true } } }, orderBy: { name: "asc" }, take: 500 }) };
}
export async function savePriceList(actor: Actor, id: string | undefined, input: unknown) {
  allowed(actor, "pricing.manage");
  const { reason, version, entries, ...values } = priceListSchema.parse(input);
  if (id && version === undefined) throw conflict();
  return getDb().$transaction(async tx => {
    const before = id ? await tx.priceList.findUnique({ where: { id }, include: { entries: true } }) : null;
    if (id && !before) throw new AppError(404, "NOT_FOUND", "Price list not found.");
    for (const entry of entries) {
      const exists = entry.variantId ? await tx.productVariant.count({ where: { id: entry.variantId } }) : await tx.product.count({ where: { id: entry.productId!, variants: { none: {} } } });
      if (!exists) throw new AppError(422, "INVALID_TARGET", "Use an existing variant, or a product without variants.");
    }
    let listId = id;
    if (id) {
      const changed = await tx.priceList.updateMany({ where: { id, version }, data: { ...values, version: { increment: 1 } } });
      if (changed.count !== 1) throw conflict();
      await tx.priceEntry.deleteMany({ where: { priceListId: id } });
    } else {
      listId = (await tx.priceList.create({ data: values })).id;
    }
    await tx.priceEntry.createMany({ data: entries.map(e => ({ ...e, priceListId: listId! })) });
    const after = await tx.priceList.findUniqueOrThrow({ where: { id: listId! }, include: { entries: true } });
    await history(tx, actor, "PriceList", after.id, "PRICE_LIST_CHANGED", reason, before, after);
    return after;
  });
}
export async function assignPriceList(actor: Actor, input: unknown) {
  allowed(actor, "pricing.manage");
  const { category, priceListId, version, reason } = assignmentSchema.parse(input);
  return getDb().$transaction(async tx => {
    if (priceListId && !await tx.priceList.count({ where: { id: priceListId, active: true } })) throw new AppError(422, "INACTIVE_PRICE_LIST", "Assign an active price list.");
    const before = await tx.categoryPriceList.findUniqueOrThrow({ where: { category } });
    const changed = await tx.categoryPriceList.updateMany({ where: { category, version }, data: { priceListId, version: { increment: 1 } } });
    if (changed.count !== 1) throw conflict();
    const after = await tx.categoryPriceList.findUniqueOrThrow({ where: { category } });
    await history(tx, actor, "CategoryPriceList", category, "CATEGORY_PRICE_LIST_CHANGED", reason, before, after);
    return after;
  });
}
async function eligibleList(tx: Prisma.TransactionClient, actor: Actor) {
  const user = await tx.user.findUnique({ where: { id: actor.id }, select: { active: true, role: true, customer: { select: { category: true, dealer: { select: { status: true } } } } } });
  if (!user?.active) throw new AppError(401, "UNAUTHENTICATED", "Please sign in.");
  const category = user.role === "DEALER" && user.customer?.category === "APPROVED_DEALER" && user.customer.dealer?.status === "APPROVED" ? "APPROVED_DEALER" : "RETAIL";
  const assignment = await tx.categoryPriceList.findUnique({ where: { category }, include: { priceList: true } });
  return { category, assignment, list: assignment?.priceList?.active ? assignment.priceList : null };
}
export async function ownPrices(actor: Actor, input: unknown) {
  allowed(actor, "account.read");
  const { productId } = z.object({ productId: z.string().min(1).max(100) }).strict().parse(input);
  return getDb().$transaction(async tx => {
    const product = await tx.product.findFirst({ where: { ...publicProductWhere(), id: productId }, select: { id: true, variants: { where: { active: true, published: true, contentApproved: true }, select: { id: true } } } });
    if (!product) throw new AppError(404, "NOT_FOUND", "Product not found.");
    const { category, list } = await eligibleList(tx, actor);
    const prices = list ? await tx.priceEntry.findMany({ where: { priceListId: list.id, OR: [{ productId }, { variantId: { in: product.variants.map(v => v.id) } }] }, select: { productId: true, variantId: true, amountPaise: true } }) : [];
    return { category, currency: "INR", prices };
  }, { isolationLevel: "RepeatableRead" });
}
export async function quote(actor: Actor, input: unknown) {
  allowed(actor, "account.read");
  const { productId, variantId, quantity } = quoteSchema.parse(input);
  return getDb().$transaction(async tx => {
    const { category, assignment, list } = await eligibleList(tx, actor);
    if (!list) throw new AppError(409, "PRICE_UNAVAILABLE", "Contact FIXUP for a price.");
    const target = variantId
      ? await tx.productVariant.findFirst({ where: { id: variantId, active: true, published: true, contentApproved: true, product: publicProductWhere() }, select: { id: true, productId: true, name: true, sku: true, packSize: true } })
      : await tx.product.findFirst({ where: { id: productId, ...publicProductWhere(), variants: { none: {} } }, select: { id: true, name: true, sku: true, packSize: true } });
    if (!target) throw new AppError(404, "NOT_FOUND", "Available product or variant not found.");
    const entry = await tx.priceEntry.findFirst({ where: { priceListId: list.id, ...(variantId ? { variantId } : { productId }) } });
    if (!entry) throw new AppError(409, "PRICE_UNAVAILABLE", "Contact FIXUP for a price.");
    // A quote is not an order. Future order creation must re-resolve and persist this snapshot transactionally.
    return { productId: variantId && "productId" in target ? target.productId : target.id, variantId: variantId ?? null, name: target.name, sku: target.sku, packSize: target.packSize, category, priceListId: list.id, priceListVersion: list.version, assignmentVersion: assignment!.version, currency: "INR", unitPricePaise: entry.amountPaise, quantity, totalPaise: entry.amountPaise * quantity, quotedAt: new Date().toISOString(), orderCreated: false };
  }, { isolationLevel: "RepeatableRead" });
}
export async function saveVariant(actor: Actor, productId: string, id: string | undefined, input: unknown) {
  allowed(actor, "catalogue.write");
  const { reason, version, ...data } = variantSchema.parse(input);
  return getDb().$transaction(async tx => {
    if (!await tx.product.count({ where: { id: productId } })) throw new AppError(404, "NOT_FOUND", "Product not found.");
    const before = id ? await tx.productVariant.findFirst({ where: { id, productId } }) : null;
    if (id) {
      if (!before) throw new AppError(404, "NOT_FOUND", "Variant not found.");
      if (version === undefined) throw conflict();
      const changed = await tx.productVariant.updateMany({ where: { id, productId, version }, data: { ...data, version: { increment: 1 } } });
      if (changed.count !== 1) throw conflict();
    }
    const after = id ? await tx.productVariant.findUniqueOrThrow({ where: { id } }) : await tx.productVariant.create({ data: { ...data, productId } });
    await history(tx, actor, "ProductVariant", after.id, "VARIANT_CHANGED", reason, before, after);
    return after;
  });
}
