import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/config/env";
import type { Actor } from "@/server/permissions/service";
import { AppError } from "@/server/http/errors";
import { eligibleList } from "@/modules/management/pricing";
import { publicProductWhere } from "@/modules/catalogue/service";
import { lock, stock, type Tx } from "@/modules/inventory/service";
import { id, method, totals } from "./rules";
export const invalid = (message: string, code = "INVALID_ORDER") =>
  new AppError(422, code, message);
export const missing = () =>
  new AppError(404, "NOT_FOUND", "Order or payment not found.");
export const hash = (data: unknown) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex");
export function buyer(actor: Actor) {
  if (!actor.customer || !["CUSTOMER", "DEALER"].includes(actor.role))
    throw new AppError(
      403,
      "FORBIDDEN",
      "Ordering requires an active customer or dealer account.",
    );
  return actor.customer.id;
}
export async function cartData(tx: Tx, actor: Actor) {
  const customerId = buyer(actor);
  const { category, list, assignment } = await eligibleList(tx, actor);
  const items = await tx.cartItem.findMany({
    where: { customerId },
    orderBy: { variantId: "asc" },
  });
  const lines = await Promise.all(
    items.map(async (item) => {
      const variant = await tx.productVariant.findFirst({
        where: {
          id: item.variantId,
          active: true,
          published: true,
          contentApproved: true,
          product: publicProductWhere(),
        },
        include: {
          product: {
            include: {
              images: {
                where: { approved: true },
                orderBy: { sortOrder: "asc" },
                take: 1,
              },
            },
          },
        },
      });
      const entry =
        variant && list
          ? await tx.priceEntry.findFirst({
              where: { variantId: variant.id, priceListId: list.id },
            })
          : null;
      const balance = await stock(tx, item.variantId);
      return {
        variantId: item.variantId,
        quantity: item.quantity,
        name: variant?.product.name ?? "Unavailable product",
        variant: variant?.name ?? "Unavailable variant",
        packSize: variant?.packSize ?? "",
        sku: variant?.sku ?? null,
        imageUrl:
          (variant?.imageApproved ? variant.imageUrl : null) ??
          variant?.product.images[0]?.url ??
          null,
        unitPricePaise: entry?.amountPaise ?? null,
        linePricePaise: entry ? entry.amountPaise * item.quantity : null,
        available: balance.available,
        changed:
          entry?.amountPaise !== item.seenPricePaise ||
          category !== item.seenCategory,
        orderable: !!variant && !!entry && entry.amountPaise > 0,
      };
    }),
  );
  return {
    category,
    pricingSource: {
      priceListId: list?.id ?? null,
      listVersion: list?.version ?? null,
      assignmentVersion: assignment?.version ?? null,
    },
    lines,
  };
}
export async function cart(actor: Actor) {
  return getDb().$transaction((tx) => cartData(tx, actor));
}
export async function setCart(actor: Actor, input: unknown) {
  const customerId = buyer(actor);
  const data = z
    .object({ variantId: id, quantity: z.number().int().min(0).max(10000) })
    .strict()
    .parse(input);
  return getDb().$transaction(async (tx) => {
    await lock(tx, `cart:${customerId}`);
    if (!data.quantity) {
      await tx.cartItem.deleteMany({
        where: { customerId, variantId: data.variantId },
      });
      return cartData(tx, actor);
    }
    const { list, category } = await eligibleList(tx, actor);
    const variant = await tx.productVariant.findFirst({
      where: {
        id: data.variantId,
        active: true,
        published: true,
        contentApproved: true,
        product: publicProductWhere(),
      },
    });
    const price =
      variant && list
        ? await tx.priceEntry.findFirst({
            where: { priceListId: list.id, variantId: data.variantId },
          })
        : null;
    if (!price || price.amountPaise <= 0)
      throw invalid("This variant is unavailable for ordering.");
    if (
      (await tx.cartItem.count({ where: { customerId } })) >= 50 &&
      !(await tx.cartItem.findUnique({
        where: {
          customerId_variantId: { customerId, variantId: data.variantId },
        },
      }))
    )
      throw invalid("Cart supports up to 50 variants.");
    await tx.cartItem.upsert({
      where: {
        customerId_variantId: { customerId, variantId: data.variantId },
      },
      create: {
        customerId,
        ...data,
        seenPricePaise: price.amountPaise,
        seenCategory: category,
      },
      update: {
        quantity: data.quantity,
        seenPricePaise: price.amountPaise,
        seenCategory: category,
      },
    });
    return cartData(tx, actor);
  });
}
export const previewSchema = z
  .object({ addressId: id, paymentMethod: method })
  .strict();
export async function previewData(
  tx: Tx,
  actor: Actor,
  data: z.infer<typeof previewSchema>,
) {
  const customerId = buyer(actor);
  const s = await tx.salesSettings.findUnique({ where: { id: "singleton" } });
  if (
    !s?.enabled ||
    !s.confirmedAt ||
    s.taxBps === null ||
    s.taxMode === null ||
    s.deliveryPaise === null ||
    s.reservationMinutes === null ||
    s.lateReviewMinutes === null
  )
    throw invalid(
      "Ordering awaits confirmed payment details and business rules.",
      "ORDERING_DISABLED",
    );
  if (data.paymentMethod === "UPI" ? !s.upiId : !s.accountNumber)
    throw invalid("Selected payment method is not configured.");
  const address = await tx.address.findFirst({
    where: { id: data.addressId, customerId },
  });
  if (!address) throw invalid("Choose one of your saved delivery addresses.");
  const customer = await tx.customer.findUniqueOrThrow({
    where: { id: customerId },
    include: { user: { select: { name: true, email: true } }, dealer: true },
  });
  const current = await cartData(tx, actor);
  if (!current.lines.length) throw invalid("Your cart is empty.");
  if (current.lines.some((l) => !l.orderable || l.quantity > l.available))
    throw invalid(
      "Some cart items are unavailable or exceed available stock.",
      "STOCK_UNAVAILABLE",
    );
  const lines = current.lines.map((l) => ({
    ...l,
    unitPricePaise: l.unitPricePaise!,
  }));
  let amount: ReturnType<typeof totals>;
  try {
    amount = totals(lines, s.taxBps, s.taxMode, s.deliveryPaise);
  } catch {
    throw invalid("Order total exceeds the supported limit.");
  }
  const {
    customerId: _,
    id: __,
    createdAt: ___,
    updatedAt,
    ...addressSnapshot
  } = address;
  void _;
  void __;
  void ___;
  const customerSnapshot = {
    name: customer.user.name,
    email: customer.user.email,
    phone: address.phone,
    businessName:
      current.category === "APPROVED_DEALER"
        ? (customer.dealer?.businessName ?? "")
        : "",
    gstin:
      current.category === "APPROVED_DEALER"
        ? (customer.dealer?.gstin ?? "")
        : "",
  };
  const paymentDetails = {
    upiId: s.upiId,
    holderName: s.holderName,
    bankName: s.bankName,
    accountNumber: s.accountNumber,
    ifsc: s.ifsc,
    branch: s.branch,
    instructions: s.instructions,
  };
  const review = {
    customerId,
    category: current.category,
    pricingSource: current.pricingSource,
    lines: lines.map((l) => ({
      variantId: l.variantId,
      quantity: l.quantity,
      unitPricePaise: l.unitPricePaise,
    })),
    addressSnapshot,
    addressUpdatedAt: updatedAt,
    settingsVersion: s.version,
    paymentMethod: data.paymentMethod,
    customerSnapshot,
    ...amount,
  };
  const reviewToken = createHmac("sha256", getEnv().BETTER_AUTH_SECRET)
    .update(JSON.stringify(review))
    .digest("hex");
  return {
    ...current,
    lines,
    ...amount,
    addressSnapshot,
    customerSnapshot,
    paymentDetails,
    taxBps: s.taxBps,
    taxMode: s.taxMode,
    reservationMinutes: s.reservationMinutes,
    lateReviewMinutes: s.lateReviewMinutes,
    cancellationRules: {
      customerCancelUnpaid: s.customerCancelUnpaid,
      adminCancelUnpaid: s.adminCancelUnpaid,
      adminCancelPaid: s.adminCancelPaid,
    },
    reviewToken,
  };
}
export async function preview(actor: Actor, input: unknown) {
  const data = previewSchema.parse(input);
  return getDb().$transaction((tx) => previewData(tx, actor, data));
}
export function validToken(a: string, b: string) {
  return (
    /^[a-f0-9]{64}$/.test(a) && timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
