BEGIN;
CREATE SEQUENCE fixup_po_number;
CREATE SEQUENCE fixup_grn_number;
-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "gstin" TEXT,
    "supplierType" TEXT NOT NULL,
    "paymentTerms" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "identityKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierVariant" (
    "supplierId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,

    CONSTRAINT "SupplierVariant_pkey" PRIMARY KEY ("supplierId","variantId")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL DEFAULT ('FIX-PO-'::text || lpad((nextval('fixup_po_number'::regclass))::text, 8, '0'::text)),
    "requestId" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierSnapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "expectedDate" DATE,
    "notes" TEXT NOT NULL DEFAULT '',
    "subtotalPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL,
    "taxPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "packSize" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "ratePaise" INTEGER NOT NULL,
    "taxBps" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "taxPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL DEFAULT ('FIX-GRN-'::text || lpad((nextval('fixup_grn_number'::regclass))::text, 8, '0'::text)),
    "requestId" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "invoiceReference" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "completedById" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "reversedById" TEXT,
    "reversedAt" TIMESTAMPTZ(3),
    "correctionReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "purchaseLineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "batchNumber" TEXT,
    "manufacturedAt" DATE,
    "expiresAt" DATE,

    CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLot" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "receiptLineId" TEXT,
    "batchNumber" TEXT,
    "manufacturedAt" DATE,
    "expiresAt" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "availableDelta" INTEGER NOT NULL,
    "damagedDelta" INTEGER NOT NULL DEFAULT 0,
    "previousStock" INTEGER NOT NULL DEFAULT 0,
    "updatedStock" INTEGER NOT NULL DEFAULT 0,
    "previousDamaged" INTEGER NOT NULL DEFAULT 0,
    "updatedDamaged" INTEGER NOT NULL DEFAULT 0,
    "receiptLineId" TEXT,
    "adjustmentId" TEXT,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockSetting" (
    "variantId" TEXT NOT NULL,
    "minimumQuantity" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockSetting_pkey" PRIMARY KEY ("variantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_gstin_key" ON "Supplier"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_identityKey_key" ON "Supplier"("identityKey");

-- CreateIndex
CREATE INDEX "Supplier_status_name_idx" ON "Supplier"("status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_requestId_key" ON "PurchaseOrder"("requestId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_createdAt_idx" ON "PurchaseOrder"("supplierId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_createdAt_idx" ON "PurchaseOrder"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderLine_purchaseOrderId_variantId_key" ON "PurchaseOrderLine"("purchaseOrderId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_number_key" ON "GoodsReceipt"("number");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_requestId_key" ON "GoodsReceipt"("requestId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_purchaseOrderId_createdAt_idx" ON "GoodsReceipt"("purchaseOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "GoodsReceipt_status_createdAt_idx" ON "GoodsReceipt"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceiptLine_receiptId_purchaseLineId_key" ON "GoodsReceiptLine"("receiptId", "purchaseLineId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLot_receiptLineId_key" ON "StockLot"("receiptLineId");

-- CreateIndex
CREATE INDEX "StockLot_variantId_expiresAt_idx" ON "StockLot"("variantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockLot_id_variantId_key" ON "StockLot"("id", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_requestId_key" ON "StockAdjustment"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_adjustmentId_key" ON "StockMovement"("adjustmentId");

-- CreateIndex
CREATE INDEX "StockMovement_variantId_createdAt_idx" ON "StockMovement"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_lotId_createdAt_idx" ON "StockMovement"("lotId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_receiptLineId_kind_key" ON "StockMovement"("receiptLineId", "kind");

-- AddForeignKey
ALTER TABLE "SupplierVariant" ADD CONSTRAINT "SupplierVariant_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierVariant" ADD CONSTRAINT "SupplierVariant_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_purchaseLineId_fkey" FOREIGN KEY ("purchaseLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_variantId_fkey" FOREIGN KEY ("lotId", "variantId") REFERENCES "StockLot"("id", "variantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSetting" ADD CONSTRAINT "StockSetting_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_status" CHECK (status IN ('ACTIVE','INACTIVE','BLOCKED'));
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_status" CHECK (status IN ('DRAFT','SUBMITTED','PARTIALLY_RECEIVED','FULLY_RECEIVED','CANCELLED')),
 ADD CONSTRAINT "PurchaseOrder_amounts" CHECK ("subtotalPaise" >= 0 AND "discountPaise" BETWEEN 0 AND "subtotalPaise" AND "taxPaise" >= 0 AND "totalPaise" = "subtotalPaise" - "discountPaise" + "taxPaise" AND "totalPaise" <= 2000000000);
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_quantities" CHECK (quantity > 0 AND "receivedQuantity" BETWEEN 0 AND quantity),
 ADD CONSTRAINT "PurchaseOrderLine_amounts" CHECK ("ratePaise" > 0 AND "taxBps" BETWEEN 0 AND 10000 AND "subtotalPaise"::bigint = quantity::bigint * "ratePaise" AND "discountPaise" BETWEEN 0 AND "subtotalPaise" AND "taxPaise" = (("subtotalPaise"::bigint - "discountPaise") * "taxBps" + 5000) / 10000 AND "totalPaise" = "subtotalPaise" - "discountPaise" + "taxPaise");
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_status" CHECK (status IN ('DRAFT','COMPLETED','CANCELLED','REVERSED'));
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_quantity" CHECK (quantity > 0), ADD CONSTRAINT "GoodsReceiptLine_dates" CHECK ("manufacturedAt" IS NULL OR "expiresAt" IS NULL OR "manufacturedAt" <= "expiresAt");
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_dates" CHECK ("manufacturedAt" IS NULL OR "expiresAt" IS NULL OR "manufacturedAt" <= "expiresAt");
ALTER TABLE "StockSetting" ADD CONSTRAINT "StockSetting_minimum" CHECK ("minimumQuantity" IS NULL OR "minimumQuantity" >= 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_source" CHECK (("receiptLineId" IS NULL) <> ("adjustmentId" IS NULL)),
 ADD CONSTRAINT "StockMovement_kind" CHECK (kind IN ('OPENING_STOCK','PURCHASE_RECEIVING','STOCK_ADJUSTMENT','DAMAGE','STOCK_CORRECTION','RECEIPT_REVERSAL')),
 ADD CONSTRAINT "StockMovement_nonzero" CHECK ("availableDelta" <> 0 OR "damagedDelta" <> 0),
 ADD CONSTRAINT "StockMovement_balances" CHECK ("previousStock" >= 0 AND "updatedStock" >= 0 AND "previousDamaged" >= 0 AND "updatedDamaged" >= 0 AND "updatedStock"::bigint = "previousStock"::bigint + "availableDelta" AND "updatedDamaged"::bigint = "previousDamaged"::bigint + "damagedDelta");

CREATE FUNCTION fixup_immutable_stock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Historical stock records are immutable' USING ERRCODE='23514';
END; $$;
CREATE TRIGGER "StockMovement_immutable" BEFORE UPDATE OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION fixup_immutable_stock();
CREATE TRIGGER "StockAdjustment_immutable" BEFORE UPDATE OR DELETE ON "StockAdjustment" FOR EACH ROW EXECUTE FUNCTION fixup_immutable_stock();

CREATE FUNCTION fixup_validate_stock_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a bigint; d bigint; la bigint; ld bigint; line_quantity integer; line_variant text; receipt_status text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('stock:' || NEW."variantId", 0));
 SELECT COALESCE(sum("availableDelta"),0), COALESCE(sum("damagedDelta"),0) INTO a,d FROM "StockMovement" WHERE "variantId"=NEW."variantId";
 SELECT COALESCE(sum("availableDelta"),0), COALESCE(sum("damagedDelta"),0) INTO la,ld FROM "StockMovement" WHERE "lotId"=NEW."lotId";
 IF a+NEW."availableDelta" < 0 OR d+NEW."damagedDelta" < 0 OR la+NEW."availableDelta" < 0 OR ld+NEW."damagedDelta" < 0 OR a+NEW."availableDelta" > 2000000000 OR d+NEW."damagedDelta" > 2000000000 THEN
   RAISE EXCEPTION 'Stock would be negative or outside supported bounds' USING ERRCODE='23514';
 END IF;
 IF NEW."receiptLineId" IS NOT NULL THEN
   SELECT l.quantity,p."variantId",g.status INTO line_quantity,line_variant,receipt_status FROM "GoodsReceiptLine" l JOIN "PurchaseOrderLine" p ON p.id=l."purchaseLineId" JOIN "GoodsReceipt" g ON g.id=l."receiptId" WHERE l.id=NEW."receiptLineId";
   IF line_variant IS DISTINCT FROM NEW."variantId" OR NEW."damagedDelta" <> 0 OR NOT EXISTS (SELECT 1 FROM "StockLot" WHERE id=NEW."lotId" AND "receiptLineId"=NEW."receiptLineId") OR
      NOT ((NEW.kind='PURCHASE_RECEIVING' AND NEW."availableDelta"=line_quantity AND receipt_status='COMPLETED') OR (NEW.kind='RECEIPT_REVERSAL' AND NEW."availableDelta"=-line_quantity AND receipt_status='REVERSED')) THEN
      RAISE EXCEPTION 'Invalid receiving source' USING ERRCODE='23514';
   END IF;
 ELSIF NEW.kind IN ('PURCHASE_RECEIVING','RECEIPT_REVERSAL') THEN
   RAISE EXCEPTION 'Receiving requires its document' USING ERRCODE='23514';
 END IF;
 IF NEW.kind='DAMAGE' AND (NEW."availableDelta" >= 0 OR NEW."damagedDelta" <> -NEW."availableDelta") THEN RAISE EXCEPTION 'Invalid damage transfer' USING ERRCODE='23514'; END IF;
 IF NEW.kind='OPENING_STOCK' AND (NEW."availableDelta" <= 0 OR EXISTS (SELECT 1 FROM "StockMovement" WHERE "variantId"=NEW."variantId")) THEN RAISE EXCEPTION 'Opening stock is recorded once per variant' USING ERRCODE='23514'; END IF;
 NEW."previousStock"=a; NEW."updatedStock"=a+NEW."availableDelta";
 NEW."previousDamaged"=d; NEW."updatedDamaged"=d+NEW."damagedDelta";
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockMovement_validate" BEFORE INSERT ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION fixup_validate_stock_movement();

CREATE FUNCTION fixup_purchase_line_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state text;
BEGIN
 SELECT status INTO state FROM "PurchaseOrder" WHERE id=OLD."purchaseOrderId";
 IF TG_OP='DELETE' THEN
   IF state <> 'DRAFT' THEN RAISE EXCEPTION 'Submitted purchase history is immutable' USING ERRCODE='23514'; END IF;
   RETURN OLD;
 END IF;
 IF (state <> 'DRAFT' AND (to_jsonb(NEW)-'receivedQuantity') IS DISTINCT FROM (to_jsonb(OLD)-'receivedQuantity')) OR (NEW."receivedQuantity" <> OLD."receivedQuantity" AND pg_trigger_depth()<2) THEN
   RAISE EXCEPTION 'Purchase snapshots and receiving balances cannot be edited directly' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "PurchaseOrderLine_history" BEFORE UPDATE OR DELETE ON "PurchaseOrderLine" FOR EACH ROW EXECUTE FUNCTION fixup_purchase_line_history();
CREATE FUNCTION fixup_post_receiving_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."receiptLineId" IS NOT NULL THEN
   UPDATE "PurchaseOrderLine" SET "receivedQuantity"="receivedQuantity"+NEW."availableDelta" WHERE id=(SELECT "purchaseLineId" FROM "GoodsReceiptLine" WHERE id=NEW."receiptLineId");
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockMovement_receiving_balance" AFTER INSERT ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION fixup_post_receiving_balance();
CREATE FUNCTION fixup_receipt_line_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT status FROM "GoodsReceipt" WHERE id=OLD."receiptId") <> 'DRAFT' THEN RAISE EXCEPTION 'Confirmed receipt lines are immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "GoodsReceiptLine_history" BEFORE UPDATE OR DELETE ON "GoodsReceiptLine" FOR EACH ROW EXECUTE FUNCTION fixup_receipt_line_history();
CREATE FUNCTION fixup_lot_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "StockMovement" WHERE "lotId"=OLD.id) THEN RAISE EXCEPTION 'Stock lot traceability is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockLot_history" BEFORE UPDATE OR DELETE ON "StockLot" FOR EACH ROW EXECUTE FUNCTION fixup_lot_history();
COMMIT;
