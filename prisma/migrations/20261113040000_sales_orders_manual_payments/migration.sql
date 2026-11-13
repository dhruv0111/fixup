BEGIN;
CREATE SEQUENCE fixup_so_number;
-- CreateTable
CREATE TABLE "CartItem" (
    "customerId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "seenPricePaise" INTEGER NOT NULL,
    "seenCategory" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("customerId","variantId")
);

-- CreateTable
CREATE TABLE "SalesSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "upiId" TEXT NOT NULL DEFAULT '',
    "holderName" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "accountNumber" TEXT NOT NULL DEFAULT '',
    "ifsc" TEXT NOT NULL DEFAULT '',
    "branch" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "taxBps" INTEGER,
    "taxMode" TEXT,
    "deliveryPaise" INTEGER,
    "reservationMinutes" INTEGER,
    "lateReviewMinutes" INTEGER,
    "customerCancelUnpaid" BOOLEAN,
    "adminCancelUnpaid" BOOLEAN,
    "adminCancelPaid" BOOLEAN,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL DEFAULT ('FIX-SO-'::text || (nextval('fixup_so_number'::regclass))::text),
    "requestId" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "category" "CustomerCategory" NOT NULL,
    "customerSnapshot" JSONB NOT NULL,
    "addressSnapshot" JSONB NOT NULL,
    "paymentDetails" JSONB NOT NULL,
    "cancellationRules" JSONB NOT NULL,
    "pricingSource" JSONB NOT NULL,
    "taxMode" TEXT NOT NULL,
    "taxBps" INTEGER NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "taxPaise" INTEGER NOT NULL,
    "deliveryPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "reservationMinutes" INTEGER NOT NULL,
    "lateReviewMinutes" INTEGER NOT NULL,
    "reservationExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "lateReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "overpaymentResolved" BOOLEAN NOT NULL DEFAULT false,
    "refundDecisionRequired" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "sku" TEXT,
    "packSize" TEXT NOT NULL,
    "imageUrl" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,
    "linePricePaise" INTEGER NOT NULL,
    "taxPaise" INTEGER NOT NULL,

    CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3),
    "changedById" TEXT,
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationEvent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "reservationId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "previousStatus" TEXT,
    "status" TEXT NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "actorId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSubmission" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "referenceKey" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "imageBytes" BYTEA NOT NULL,
    "imageHash" TEXT NOT NULL,
    "imageSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "duplicateReference" BOOLEAN NOT NULL DEFAULT false,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "publicMessage" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "submissionId" TEXT,
    "kind" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "bankReference" TEXT NOT NULL,
    "referenceKey" TEXT NOT NULL,
    "verifiedById" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_number_key" ON "SalesOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_requestId_key" ON "SalesOrder"("requestId");

-- CreateIndex
CREATE INDEX "SalesOrder_customerId_createdAt_idx" ON "SalesOrder"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesOrder_status_paymentStatus_createdAt_idx" ON "SalesOrder"("status", "paymentStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderLine_orderId_variantId_key" ON "SalesOrderLine"("orderId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_orderLineId_key" ON "StockReservation"("orderLineId");

-- CreateIndex
CREATE INDEX "StockReservation_variantId_status_idx" ON "StockReservation"("variantId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_status_expiresAt_idx" ON "StockReservation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_orderId_variantId_key" ON "StockReservation"("orderId", "variantId");

-- CreateIndex
CREATE INDEX "ReservationEvent_variantId_createdAt_idx" ON "ReservationEvent"("variantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationEvent_reservationId_version_key" ON "ReservationEvent"("reservationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSubmission_requestId_key" ON "PaymentSubmission"("requestId");

-- CreateIndex
CREATE INDEX "PaymentSubmission_referenceKey_idx" ON "PaymentSubmission"("referenceKey");

-- CreateIndex
CREATE INDEX "PaymentSubmission_status_createdAt_idx" ON "PaymentSubmission"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_requestId_key" ON "PaymentRecord"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_submissionId_key" ON "PaymentRecord"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_referenceKey_key" ON "PaymentRecord"("referenceKey");

-- CreateIndex
CREATE INDEX "SalesOrderEvent_orderId_createdAt_idx" ON "SalesOrderEvent"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationEvent" ADD CONSTRAINT "ReservationEvent_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "StockReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationEvent" ADD CONSTRAINT "ReservationEvent_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "PaymentSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderEvent" ADD CONSTRAINT "SalesOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CartItem" ADD CHECK (quantity BETWEEN 1 AND 10000 AND "seenPricePaise">=0);
ALTER TABLE "SalesOrderLine" ADD CHECK (quantity BETWEEN 1 AND 10000 AND "unitPricePaise">0 AND "linePricePaise"="unitPricePaise"*quantity AND "taxPaise">=0);
ALTER TABLE "SalesOrder" ADD CHECK ("subtotalPaise">0 AND "taxPaise">=0 AND "deliveryPaise">=0 AND "totalPaise">0 AND "taxBps" BETWEEN 0 AND 10000 AND "reservationMinutes">0 AND "lateReviewMinutes" BETWEEN 0 AND "reservationMinutes");
ALTER TABLE "StockReservation" ADD CHECK (quantity>0 AND status IN ('ACTIVE','RELEASED','EXPIRED'));
ALTER TABLE "PaymentRecord" ADD CHECK ("amountPaise">0 AND kind IN ('RECEIPT','REFUND') AND method IN ('UPI','BANK'));
ALTER TABLE "PaymentSubmission" ADD CHECK ("imageSize" BETWEEN 1 AND 5242880 AND octet_length("imageBytes")="imageSize" AND width>0 AND height>0 AND method IN ('UPI','BANK') AND status IN ('SUBMITTED','UNDER_REVIEW','VERIFIED','REJECTED','RESUBMISSION_REQUIRED'));
CREATE UNIQUE INDEX "PaymentSubmission_one_pending" ON "PaymentSubmission" ("orderId") WHERE status IN ('SUBMITTED','UNDER_REVIEW');
CREATE TRIGGER "PaymentRecord_immutable" BEFORE UPDATE OR DELETE ON "PaymentRecord" FOR EACH ROW EXECUTE FUNCTION fixup_immutable_stock();
CREATE TRIGGER "ReservationEvent_immutable" BEFORE UPDATE OR DELETE ON "ReservationEvent" FOR EACH ROW EXECUTE FUNCTION fixup_immutable_stock();
CREATE TRIGGER "SalesOrderEvent_immutable" BEFORE UPDATE OR DELETE ON "SalesOrderEvent" FOR EACH ROW EXECUTE FUNCTION fixup_immutable_stock();
CREATE TRIGGER "SalesOrderLine_immutable" BEFORE UPDATE OR DELETE ON "SalesOrderLine" FOR EACH ROW EXECUTE FUNCTION fixup_immutable_stock();
CREATE FUNCTION fixup_reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE physical bigint; reserved bigint;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reservation history is permanent' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('stock:' || NEW."variantId",0));
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW."orderId"<>OLD."orderId" OR NEW."orderLineId"<>OLD."orderLineId" OR NEW."variantId"<>OLD."variantId" OR NEW.quantity<>OLD.quantity OR NEW.version<>OLD.version+1 OR OLD.status='RELEASED' OR (OLD.status='EXPIRED' AND NEW.status<>'ACTIVE')) THEN RAISE EXCEPTION 'Invalid reservation transition' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "SalesOrderLine" WHERE id=NEW."orderLineId" AND "orderId"=NEW."orderId" AND "variantId"=NEW."variantId" AND quantity=NEW.quantity) THEN RAISE EXCEPTION 'Reservation must match order line' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(sum("availableDelta"),0) INTO physical FROM "StockMovement" WHERE "variantId"=NEW."variantId";
 SELECT COALESCE(sum(quantity),0) INTO reserved FROM "StockReservation" WHERE "variantId"=NEW."variantId" AND status='ACTIVE' AND id<>NEW.id;
 IF NEW.status='ACTIVE' AND physical-reserved<NEW.quantity THEN RAISE EXCEPTION 'Insufficient unreserved stock' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockReservation_guard" BEFORE INSERT OR UPDATE OR DELETE ON "StockReservation" FOR EACH ROW EXECUTE FUNCTION fixup_reservation_guard();
CREATE FUNCTION fixup_reservation_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior text; delta integer;
BEGIN
 prior=CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END;
 delta=CASE WHEN NEW.status='ACTIVE' THEN NEW.quantity ELSE 0 END-CASE WHEN prior='ACTIVE' THEN OLD.quantity ELSE 0 END;
 INSERT INTO "ReservationEvent" ("reservationId","variantId",version,"previousStatus",status,"quantityDelta","expiresAt","actorId",reason) VALUES (NEW.id,NEW."variantId",NEW.version,prior,NEW.status,delta,NEW."expiresAt",NEW."changedById",NEW.reason);
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockReservation_event" AFTER INSERT OR UPDATE ON "StockReservation" FOR EACH ROW EXECUTE FUNCTION fixup_reservation_event();
CREATE OR REPLACE FUNCTION fixup_validate_stock_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a bigint; d bigint; la bigint; ld bigint; line_quantity integer; line_variant text; receipt_status text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('stock:' || NEW."variantId", 0));
 SELECT COALESCE(sum("availableDelta"),0), COALESCE(sum("damagedDelta"),0) INTO a,d FROM "StockMovement" WHERE "variantId"=NEW."variantId";
 SELECT COALESCE(sum("availableDelta"),0), COALESCE(sum("damagedDelta"),0) INTO la,ld FROM "StockMovement" WHERE "lotId"=NEW."lotId";
 IF a+NEW."availableDelta" < 0 OR d+NEW."damagedDelta" < 0 OR la+NEW."availableDelta" < 0 OR ld+NEW."damagedDelta" < 0 OR a+NEW."availableDelta" > 2000000000 OR d+NEW."damagedDelta" > 2000000000 THEN
   RAISE EXCEPTION 'Stock would be negative or outside supported bounds' USING ERRCODE='23514';
 END IF;
 IF a+NEW."availableDelta" < (SELECT COALESCE(sum(quantity),0) FROM "StockReservation" WHERE "variantId"=NEW."variantId" AND status='ACTIVE') THEN RAISE EXCEPTION 'Stock is reserved for sales orders' USING ERRCODE='23514'; END IF;
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

COMMIT;
