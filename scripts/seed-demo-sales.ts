import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { getEnv } from "../src/config/env";
import { getDb } from "../src/server/db/client";

// Local development only: dummy prices, stock and payment settings so that
// Add to cart / checkout can be tried. Never run against real business data.
const env = getEnv();
const database = new URL(env.DATABASE_URL);
if (
  env.APP_ENV !== "development" ||
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  database.pathname !== "/fixup_dev"
)
  throw new Error(
    "Demo sales data is restricted to the local fixup_dev database.",
  );

// Rupees per variant pack size: [retail, dealer, opening stock]
const demo: Record<string, [number, number, number]> = {
  "8g": [49, 38, 500],
  "20g": [99, 78, 300],
  "40g": [179, 140, 200],
  "50g": [219, 170, 150],
};
const db = getDb();
try {
  const actor = await db.user.findFirstOrThrow({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true },
  });
  const variants = await db.productVariant.findMany({
    where: { product: { published: true, active: true } },
    include: { product: { select: { id: true } } },
  });
  for (const [name, index] of [
    ["DEMO Retail prices", 0],
    ["DEMO Dealer prices", 1],
  ] as const) {
    const category = index === 0 ? "RETAIL" : "APPROVED_DEALER";
    let list = await db.priceList.findFirst({ where: { name } });
    list ??= await db.priceList.create({ data: { name, active: true } });
    await db.priceList.update({
      where: { id: list.id },
      data: { active: true },
    });
    for (const v of variants) {
      const rupees = (demo[v.packSize] ?? [100, 80, 100])[index];
      await db.priceEntry.upsert({
        where: {
          priceListId_variantId: { priceListId: list.id, variantId: v.id },
        },
        create: {
          priceListId: list.id,
          variantId: v.id,
          amountPaise: rupees * 100,
        },
        update: { amountPaise: rupees * 100 },
      });
    }
    await db.categoryPriceList.upsert({
      where: { category },
      create: { category, priceListId: list.id, version: 1 },
      update: { priceListId: list.id },
    });
  }
  for (const v of variants) {
    if ((await db.stockMovement.count({ where: { variantId: v.id } })) > 0)
      continue;
    const qty = (demo[v.packSize] ?? [0, 0, 100])[2];
    const lot = await db.stockLot.create({
      data: { variantId: v.id, batchNumber: `DEMO-${v.packSize}` },
    });
    const adj = await db.stockAdjustment.create({
      data: {
        requestId: randomUUID(),
        payloadDigest: createHash("sha256").update(v.id).digest("hex"),
        kind: "OPENING_STOCK",
        reason: "Development demo opening stock",
        actorId: actor.id,
      },
    });
    await db.stockMovement.create({
      data: {
        variantId: v.id,
        lotId: lot.id,
        kind: "OPENING_STOCK",
        availableDelta: qty,
        previousStock: 0,
        updatedStock: qty,
        adjustmentId: adj.id,
        reason: "Development demo opening stock",
        actorId: actor.id,
      },
    });
  }
  await db.salesSettings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      enabled: true,
      upiId: "demo@upi",
      holderName: "FIXUP Demo",
      instructions: "DEMO ONLY - do not send real money.",
      taxBps: 1800,
      taxMode: "INCLUSIVE",
      deliveryPaise: 5000,
      reservationMinutes: 1440,
      lateReviewMinutes: 60,
      customerCancelUnpaid: true,
      adminCancelUnpaid: true,
      adminCancelPaid: false,
      confirmedById: actor.id,
      confirmedAt: new Date(),
      version: 1,
    },
    update: {},
  });
  console.log(
    `Demo prices, stock and payment settings ready for ${variants.length} variants.`,
  );
} finally {
  await db.$disconnect();
}
