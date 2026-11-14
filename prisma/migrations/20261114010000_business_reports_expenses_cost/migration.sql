BEGIN;
-- CreateTable
CREATE TABLE "LotCost" (
    "lotId" TEXT NOT NULL,
    "numeratorPaise" BIGINT NOT NULL,
    "denominatorUnits" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotCost_pkey" PRIMARY KEY ("lotId")
);

-- CreateTable
CREATE TABLE "DispatchCost" (
    "allocationId" TEXT NOT NULL,
    "amountPaise" BIGINT,
    "numeratorPaise" BIGINT,
    "denominatorUnits" INTEGER,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchCost_pkey" PRIMARY KEY ("allocationId")
);

-- CreateTable
CREATE TABLE "BusinessExpense" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "expenseDate" DATE NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BusinessExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseRevision" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "expenseDate" DATE NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseAttachment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fileBytes" BYTEA NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessExpense_requestId_key" ON "BusinessExpense"("requestId");

-- CreateIndex
CREATE INDEX "BusinessExpense_expenseDate_category_status_idx" ON "BusinessExpense"("expenseDate", "category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseRevision_requestId_key" ON "ExpenseRevision"("requestId");

-- CreateIndex
CREATE INDEX "ExpenseRevision_expenseDate_createdAt_idx" ON "ExpenseRevision"("expenseDate", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseRevision_expenseId_version_key" ON "ExpenseRevision"("expenseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseAttachment_requestId_key" ON "ExpenseAttachment"("requestId");

-- CreateIndex
CREATE INDEX "ExpenseAttachment_expenseId_idx" ON "ExpenseAttachment"("expenseId");

-- AddForeignKey
ALTER TABLE "LotCost" ADD CONSTRAINT "LotCost_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchCost" ADD CONSTRAINT "DispatchCost_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "DispatchAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRevision" ADD CONSTRAINT "ExpenseRevision_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "BusinessExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAttachment" ADD CONSTRAINT "ExpenseAttachment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "BusinessExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LotCost" ADD CHECK ("numeratorPaise">=0 AND "denominatorUnits">0);
ALTER TABLE "DispatchCost" ADD CHECK (("amountPaise" IS NULL AND "numeratorPaise" IS NULL AND "denominatorUnits" IS NULL AND source='MISSING') OR ("amountPaise" IS NOT NULL AND "amountPaise">=0 AND "numeratorPaise" IS NOT NULL AND "numeratorPaise">=0 AND "denominatorUnits" IS NOT NULL AND "denominatorUnits">0 AND source IN ('RECORDED_LOT','LEGACY_RECORDED_LOT')));
ALTER TABLE "BusinessExpense" ADD CHECK ("amountPaise" BETWEEN 1 AND 1000000000 AND status IN ('ACTIVE','CANCELLED') AND "paymentMethod" IN ('UPI','BANK','CASH','OTHER'));
ALTER TABLE "ExpenseRevision" ADD CHECK ("amountPaise" BETWEEN 1 AND 1000000000 AND status IN ('ACTIVE','CANCELLED') AND length(reason)>=5);
ALTER TABLE "ExpenseAttachment" ADD CHECK ("fileSize" BETWEEN 1 AND 5242880 AND octet_length("fileBytes")="fileSize");
CREATE TRIGGER "LotCost_immutable" BEFORE UPDATE OR DELETE ON "LotCost" FOR EACH ROW EXECUTE FUNCTION fixup_immutable_stock();
CREATE TRIGGER "DispatchCost_immutable" BEFORE UPDATE OR DELETE ON "DispatchCost" FOR EACH ROW EXECUTE FUNCTION fixup_immutable_stock();
CREATE TRIGGER "ExpenseRevision_immutable" BEFORE UPDATE OR DELETE ON "ExpenseRevision" FOR EACH ROW EXECUTE FUNCTION fixup_immutable_stock();
CREATE TRIGGER "ExpenseAttachment_immutable" BEFORE UPDATE OR DELETE ON "ExpenseAttachment" FOR EACH ROW EXECUTE FUNCTION fixup_immutable_stock();
CREATE FUNCTION fixup_lot_cost_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n bigint; d integer; ref text;
BEGIN
 SELECT p."subtotalPaise"::bigint-p."discountPaise",p.quantity,p.id INTO n,d,ref FROM "StockLot" l JOIN "GoodsReceiptLine" r ON r.id=l."receiptLineId" JOIN "PurchaseOrderLine" p ON p.id=r."purchaseLineId" WHERE l.id=NEW."lotId";
 IF n IS NULL OR NEW."numeratorPaise"<>n OR NEW."denominatorUnits"<>d OR NEW."sourceReference"<>ref THEN RAISE EXCEPTION 'Lot cost requires the immutable original purchase line' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "LotCost_source" BEFORE INSERT ON "LotCost" FOR EACH ROW EXECUTE FUNCTION fixup_lot_cost_guard();
CREATE FUNCTION fixup_capture_lot_cost() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "LotCost" ("lotId","numeratorPaise","denominatorUnits",source,"sourceReference","createdAt") SELECT NEW.id,p."subtotalPaise"::bigint-p."discountPaise",p.quantity,'RECORDED_PURCHASE',p.id,NEW."createdAt" FROM "GoodsReceiptLine" r JOIN "PurchaseOrderLine" p ON p.id=r."purchaseLineId" WHERE r.id=NEW."receiptLineId";
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockLot_capture_cost" AFTER INSERT ON "StockLot" FOR EACH ROW EXECUTE FUNCTION fixup_capture_lot_cost();
INSERT INTO "LotCost" ("lotId","numeratorPaise","denominatorUnits",source,"sourceReference","createdAt") SELECT l.id,p."subtotalPaise"::bigint-p."discountPaise",p.quantity,'LEGACY_RECORDED_PURCHASE',p.id,l."createdAt" FROM "StockLot" l JOIN "GoodsReceiptLine" r ON r.id=l."receiptLineId" JOIN "PurchaseOrderLine" p ON p.id=r."purchaseLineId";

CREATE FUNCTION fixup_dispatch_cost_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n bigint; d integer; qty integer;
BEGIN
 SELECT c."numeratorPaise",c."denominatorUnits",a.quantity INTO n,d,qty FROM "DispatchAllocation" a JOIN "StockMovement" m ON m."dispatchAllocationId"=a.id LEFT JOIN "LotCost" c ON c."lotId"=a."lotId" WHERE a.id=NEW."allocationId";
 IF qty IS NULL OR (n IS NULL AND (NEW."amountPaise" IS NOT NULL OR NEW.source<>'MISSING')) OR (n IS NOT NULL AND (NEW."amountPaise" IS NULL OR NEW."amountPaise"<>(n*qty+d/2)/d OR NEW."numeratorPaise" IS DISTINCT FROM n OR NEW."denominatorUnits" IS DISTINCT FROM d)) THEN RAISE EXCEPTION 'Dispatch cost must match the original allocated lot' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "DispatchCost_source" BEFORE INSERT ON "DispatchCost" FOR EACH ROW EXECUTE FUNCTION fixup_dispatch_cost_guard();
CREATE FUNCTION fixup_capture_dispatch_cost() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='DISPATCH' THEN
 INSERT INTO "DispatchCost" ("allocationId","amountPaise","numeratorPaise","denominatorUnits",source,"createdAt") SELECT a.id,CASE WHEN c."lotId" IS NULL THEN NULL ELSE (c."numeratorPaise"*a.quantity+c."denominatorUnits"/2)/c."denominatorUnits" END,c."numeratorPaise",c."denominatorUnits",CASE WHEN c."lotId" IS NULL THEN 'MISSING' ELSE 'RECORDED_LOT' END,NEW."createdAt" FROM "DispatchAllocation" a LEFT JOIN "LotCost" c ON c."lotId"=a."lotId" WHERE a.id=NEW."dispatchAllocationId";
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockMovement_capture_cost" AFTER INSERT ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION fixup_capture_dispatch_cost();
INSERT INTO "DispatchCost" ("allocationId","amountPaise","numeratorPaise","denominatorUnits",source,"createdAt") SELECT a.id,CASE WHEN c."lotId" IS NULL THEN NULL ELSE (c."numeratorPaise"*a.quantity+c."denominatorUnits"/2)/c."denominatorUnits" END,c."numeratorPaise",c."denominatorUnits",CASE WHEN c."lotId" IS NULL THEN 'MISSING' ELSE 'LEGACY_RECORDED_LOT' END,m."createdAt" FROM "DispatchAllocation" a JOIN "StockMovement" m ON m."dispatchAllocationId"=a.id LEFT JOIN "LotCost" c ON c."lotId"=a."lotId";

CREATE FUNCTION fixup_expense_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Expense history is permanent' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (OLD.status<>'ACTIVE' OR NEW.version<>OLD.version+1 OR NEW.id<>OLD.id OR NEW."requestId"<>OLD."requestId" OR NEW."payloadDigest"<>OLD."payloadDigest" OR NEW."createdAt"<>OLD."createdAt" OR NEW."createdById"<>OLD."createdById") THEN RAISE EXCEPTION 'Invalid expense revision' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "BusinessExpense_guard" BEFORE UPDATE OR DELETE ON "BusinessExpense" FOR EACH ROW EXECUTE FUNCTION fixup_expense_guard();
CREATE FUNCTION fixup_expense_revision_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "ExpenseRevision" r JOIN "BusinessExpense" e ON e.id=r."expenseId" WHERE e.id=NEW.id AND r.version=e.version AND r.title=e.title AND r.category=e.category AND r."amountPaise"=e."amountPaise" AND r."expenseDate"=e."expenseDate" AND r."paymentMethod"=e."paymentMethod" AND r.reference=e.reference AND r.description=e.description AND r.status=e.status) THEN RAISE EXCEPTION 'Expense change requires its immutable revision' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER "BusinessExpense_revision" AFTER INSERT OR UPDATE ON "BusinessExpense" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fixup_expense_revision_required();
COMMIT;
