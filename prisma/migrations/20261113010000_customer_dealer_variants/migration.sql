-- CreateEnum
CREATE TYPE "CustomerCategory" AS ENUM ('RETAIL', 'APPROVED_DEALER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "managementVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "category" "CustomerCategory" NOT NULL DEFAULT 'RETAIL';

-- AlterTable
ALTER TABLE "DealerProfile" ADD COLUMN     "address" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "message" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "postalCode" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "state" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sourceNotes" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "sku" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "packSize" TEXT NOT NULL,
    "sku" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "contentApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvalReference" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "imageAlt" TEXT NOT NULL DEFAULT '',
    "imageApproved" BOOLEAN NOT NULL DEFAULT false,
    "representative" BOOLEAN NOT NULL DEFAULT true,
    "mrpPaise" INTEGER,
    "mrpConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "mrpReferencePaise" INTEGER,
    "mrpReferenceNote" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryPriceList" (
    "category" "CustomerCategory" NOT NULL,
    "priceListId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CategoryPriceList_pkey" PRIMARY KEY ("category")
);

-- CreateTable
CREATE TABLE "PriceEntry" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "amountPaise" INTEGER NOT NULL,

    CONSTRAINT "PriceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagementEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_active_published_idx" ON "ProductVariant"("productId", "active", "published");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_packSize_key" ON "ProductVariant"("productId", "packSize");

-- CreateIndex
CREATE UNIQUE INDEX "PriceEntry_priceListId_productId_key" ON "PriceEntry"("priceListId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceEntry_priceListId_variantId_key" ON "PriceEntry"("priceListId", "variantId");

-- CreateIndex
CREATE INDEX "ManagementEvent_entityType_entityId_createdAt_idx" ON "ManagementEvent"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryPriceList" ADD CONSTRAINT "CategoryPriceList_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceEntry" ADD CONSTRAINT "PriceEntry_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceEntry" ADD CONSTRAINT "PriceEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceEntry" ADD CONSTRAINT "PriceEntry_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PriceEntry" ADD CONSTRAINT "PriceEntry_one_target" CHECK (("productId" IS NULL) <> ("variantId" IS NULL));
ALTER TABLE "PriceEntry" ADD CONSTRAINT "PriceEntry_positive_amount" CHECK ("amountPaise" BETWEEN 1 AND 100000000);
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_currency" CHECK ("currency" = 'INR');
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_mrp_confirmation" CHECK (("mrpPaise" IS NULL AND NOT "mrpConfirmed") OR ("mrpPaise" BETWEEN 1 AND 100000000 AND "mrpConfirmed"));
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_publication" CHECK (NOT "published" OR ("contentApproved" AND length("approvalReference") >= 5));
INSERT INTO "CategoryPriceList" ("category") VALUES ('RETAIL'), ('APPROVED_DEALER');
UPDATE "Customer" c SET "category" = 'APPROVED_DEALER' FROM "DealerProfile" d, "User" u WHERE d."customerId" = c."id" AND u."id" = c."userId" AND d."status" = 'APPROVED' AND u."role" = 'DEALER';
