BEGIN;
CREATE SEQUENCE fixup_dispatch_number;
-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "dispatchAllocationId" TEXT,
ADD COLUMN     "dispatchReturnId" TEXT;

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL DEFAULT ('FIX-DSP-'::text || (nextval('fixup_dispatch_number'::regclass))::text),
    "orderId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "packageCount" INTEGER NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "expectedDate" DATE,
    "personName" TEXT NOT NULL DEFAULT '',
    "personPhone" TEXT NOT NULL DEFAULT '',
    "vehicleNumber" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "courierName" TEXT NOT NULL DEFAULT '',
    "courierService" TEXT NOT NULL DEFAULT '',
    "awb" TEXT NOT NULL DEFAULT '',
    "awbKey" TEXT,
    "bookingDate" DATE,
    "shippingReference" TEXT NOT NULL DEFAULT '',
    "trackingTemplate" TEXT NOT NULL DEFAULT '',
    "internalRemarks" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "recipientName" TEXT NOT NULL DEFAULT '',
    "confirmationSource" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchLine" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "DispatchLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchAllocation" (
    "id" TEXT NOT NULL,
    "dispatchLineId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "DispatchAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryEvent" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "internalRemarks" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryProof" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fileBytes" BYTEA NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sharedWithCustomer" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchReturn" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_number_key" ON "Dispatch"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_orderId_key" ON "Dispatch"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_requestId_key" ON "Dispatch"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_awbKey_key" ON "Dispatch"("awbKey");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchLine_orderLineId_key" ON "DispatchLine"("orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchLine_dispatchId_orderLineId_key" ON "DispatchLine"("dispatchId", "orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchAllocation_dispatchLineId_lotId_key" ON "DispatchAllocation"("dispatchLineId", "lotId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryEvent_requestId_key" ON "DeliveryEvent"("requestId");

-- CreateIndex
CREATE INDEX "DeliveryEvent_dispatchId_createdAt_idx" ON "DeliveryEvent"("dispatchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryProof_requestId_key" ON "DeliveryProof"("requestId");

-- CreateIndex
CREATE INDEX "DeliveryProof_dispatchId_idx" ON "DeliveryProof"("dispatchId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchReturn_requestId_key" ON "DispatchReturn"("requestId");

-- CreateIndex
CREATE INDEX "DispatchReturn_allocationId_idx" ON "DispatchReturn"("allocationId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_dispatchAllocationId_key" ON "StockMovement"("dispatchAllocationId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_dispatchReturnId_key" ON "StockMovement"("dispatchReturnId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_dispatchAllocationId_fkey" FOREIGN KEY ("dispatchAllocationId") REFERENCES "DispatchAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_dispatchReturnId_fkey" FOREIGN KEY ("dispatchReturnId") REFERENCES "DispatchReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchLine" ADD CONSTRAINT "DispatchLine_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchLine" ADD CONSTRAINT "DispatchLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchAllocation" ADD CONSTRAINT "DispatchAllocation_dispatchLineId_fkey" FOREIGN KEY ("dispatchLineId") REFERENCES "DispatchLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchAllocation" ADD CONSTRAINT "DispatchAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchReturn" ADD CONSTRAINT "DispatchReturn_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "DispatchAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extend existing states without changing historical snapshots or balances.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='"StockReservation"'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%' LOOP EXECUTE format('ALTER TABLE "StockReservation" DROP CONSTRAINT %I',c.conname); END LOOP;
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='"SalesOrder"'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%READY_FOR_DISPATCH%' LOOP EXECUTE format('ALTER TABLE "SalesOrder" DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_state" CHECK (quantity>0 AND status IN ('ACTIVE','RELEASED','EXPIRED','CONSUMED'));
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_state" CHECK (status IN ('PENDING_PAYMENT','PAYMENT_UNDER_REVIEW','PAYMENT_REJECTED','ADMIN_REVIEW','READY_FOR_DISPATCH','CANCELLED','RESERVATION_EXPIRED','DISPATCHED','DELIVERED','DELIVERY_FAILED','RETURNED') AND "paymentStatus" IN ('UNPAID','PARTIALLY_PAID','PAID','OVERPAID') AND "paymentMethod" IN ('UPI','BANK'));
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_source", DROP CONSTRAINT "StockMovement_kind";
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_source" CHECK (num_nonnulls("receiptLineId","adjustmentId","dispatchAllocationId","dispatchReturnId")=1), ADD CONSTRAINT "StockMovement_kind" CHECK (kind IN ('OPENING_STOCK','PURCHASE_RECEIVING','STOCK_ADJUSTMENT','DAMAGE','STOCK_CORRECTION','RECEIPT_REVERSAL','DISPATCH','DISPATCH_RETURN'));
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_state" CHECK (method IN ('LOCAL','COURIER') AND status IN ('DRAFT','CONFIRMED') AND "deliveryStatus" IN ('PENDING','ASSIGNED','DISPATCHED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','DELIVERY_FAILED','RETURNED') AND "packageCount">0 AND ((status='DRAFT' AND "confirmedAt" IS NULL AND "confirmedById" IS NULL AND "deliveryStatus" IN ('PENDING','ASSIGNED')) OR (status='CONFIRMED' AND "confirmedAt" IS NOT NULL AND "confirmedById" IS NOT NULL))), ADD CONSTRAINT "Dispatch_delivered" CHECK ("deliveryStatus"<>'DELIVERED' OR ("deliveredAt" IS NOT NULL AND length("recipientName")>=2 AND length("confirmationSource")>=3));
ALTER TABLE "DispatchLine" ADD CHECK (quantity>0);
ALTER TABLE "DispatchAllocation" ADD CHECK (quantity>0);
ALTER TABLE "DispatchReturn" ADD CHECK (quantity>0 AND condition IN ('GOOD','DAMAGED') AND length(reason)>=5 AND length(reference)>=3);
ALTER TABLE "DeliveryProof" ADD CHECK ("fileSize" BETWEEN 1 AND 5242880 AND octet_length("fileBytes")="fileSize" AND "mimeType"='image/png');

CREATE OR REPLACE FUNCTION fixup_reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE physical bigint; reserved bigint;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reservation history is permanent' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('stock:' || NEW."variantId",0));
 IF TG_OP='INSERT' AND NEW.status<>'ACTIVE' THEN RAISE EXCEPTION 'Reservations start active' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW."orderId"<>OLD."orderId" OR NEW."orderLineId"<>OLD."orderLineId" OR NEW."variantId"<>OLD."variantId" OR NEW.quantity<>OLD.quantity OR NEW.version<>OLD.version+1 OR OLD.status IN ('RELEASED','CONSUMED') OR (OLD.status='EXPIRED' AND NEW.status<>'ACTIVE')) THEN RAISE EXCEPTION 'Invalid reservation transition' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "SalesOrderLine" WHERE id=NEW."orderLineId" AND "orderId"=NEW."orderId" AND "variantId"=NEW."variantId" AND quantity=NEW.quantity) THEN RAISE EXCEPTION 'Reservation must match order line' USING ERRCODE='23514'; END IF;
 IF NEW.status='CONSUMED' AND NOT EXISTS (SELECT 1 FROM "Dispatch" WHERE "orderId"=NEW."orderId") THEN RAISE EXCEPTION 'Consumption requires dispatch' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(sum("availableDelta"),0) INTO physical FROM "StockMovement" WHERE "variantId"=NEW."variantId";
 SELECT COALESCE(sum(quantity),0) INTO reserved FROM "StockReservation" WHERE "variantId"=NEW."variantId" AND status='ACTIVE' AND id<>NEW.id;
 IF NEW.status='ACTIVE' AND physical-reserved<NEW.quantity THEN RAISE EXCEPTION 'Insufficient unreserved stock' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;

CREATE FUNCTION fixup_dispatch_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Dispatch history is permanent' USING ERRCODE='23514'; END IF;
 IF NEW."orderId"<>OLD."orderId" OR NEW.number<>OLD.number OR NEW."requestId"<>OLD."requestId" OR NEW."payloadDigest"<>OLD."payloadDigest" OR NEW."createdById"<>OLD."createdById" OR NEW."createdAt"<>OLD."createdAt" OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Invalid dispatch revision' USING ERRCODE='23514'; END IF;
 IF OLD.status='CONFIRMED' AND (NEW.status<>OLD.status OR NEW.method<>OLD.method OR NEW."packageCount"<>OLD."packageCount" OR NEW."scheduledDate"<>OLD."scheduledDate" OR NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt" OR NEW."confirmedById" IS DISTINCT FROM OLD."confirmedById") THEN RAISE EXCEPTION 'Confirmed dispatch snapshot is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "Dispatch_history" BEFORE UPDATE OR DELETE ON "Dispatch" FOR EACH ROW EXECUTE FUNCTION fixup_dispatch_history_guard();
CREATE TRIGGER "DispatchLine_immutable" BEFORE UPDATE OR DELETE ON "DispatchLine" FOR EACH ROW EXECUTE FUNCTION fixup_immutable_stock();
CREATE TRIGGER "DeliveryEvent_immutable" BEFORE UPDATE OR DELETE ON "DeliveryEvent" FOR EACH ROW EXECUTE FUNCTION fixup_immutable_stock();
CREATE TRIGGER "DeliveryProof_immutable" BEFORE UPDATE OR DELETE ON "DeliveryProof" FOR EACH ROW EXECUTE FUNCTION fixup_immutable_stock();
CREATE TRIGGER "DispatchReturn_immutable" BEFORE UPDATE OR DELETE ON "DispatchReturn" FOR EACH ROW EXECUTE FUNCTION fixup_immutable_stock();
CREATE FUNCTION fixup_dispatch_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line_id text; state text; expected_variant text; actual_variant text;
BEGIN
 line_id=CASE WHEN TG_OP='DELETE' THEN OLD."dispatchLineId" ELSE NEW."dispatchLineId" END;
 SELECT d.status,l."variantId" INTO state,expected_variant FROM "DispatchLine" dl JOIN "Dispatch" d ON d.id=dl."dispatchId" JOIN "SalesOrderLine" l ON l.id=dl."orderLineId" WHERE dl.id=line_id;
 IF state IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Confirmed allocations are immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 SELECT "variantId" INTO actual_variant FROM "StockLot" WHERE id=NEW."lotId";
 IF actual_variant IS DISTINCT FROM expected_variant THEN RAISE EXCEPTION 'Allocation lot must match variant' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "DispatchAllocation_guard" BEFORE INSERT OR UPDATE OR DELETE ON "DispatchAllocation" FOR EACH ROW EXECUTE FUNCTION fixup_dispatch_allocation_guard();

CREATE FUNCTION fixup_dispatch_movement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE qty integer; variant text; lot text; return_condition text;
BEGIN
 IF NEW."dispatchAllocationId" IS NOT NULL THEN
  SELECT a.quantity,l."variantId",a."lotId" INTO qty,variant,lot FROM "DispatchAllocation" a JOIN "DispatchLine" dl ON dl.id=a."dispatchLineId" JOIN "SalesOrderLine" l ON l.id=dl."orderLineId" JOIN "StockReservation" r ON r."orderLineId"=l.id WHERE a.id=NEW."dispatchAllocationId" AND r.status='CONSUMED';
  IF qty IS NULL OR NEW.kind<>'DISPATCH' OR NEW."availableDelta"<>-qty OR NEW."damagedDelta"<>0 OR NEW."variantId"<>variant OR NEW."lotId"<>lot THEN RAISE EXCEPTION 'Invalid dispatch stock source' USING ERRCODE='23514'; END IF;
 ELSIF NEW."dispatchReturnId" IS NOT NULL THEN
  SELECT r.quantity,l."variantId",a."lotId",r.condition INTO qty,variant,lot,return_condition FROM "DispatchReturn" r JOIN "DispatchAllocation" a ON a.id=r."allocationId" JOIN "DispatchLine" dl ON dl.id=a."dispatchLineId" JOIN "SalesOrderLine" l ON l.id=dl."orderLineId" WHERE r.id=NEW."dispatchReturnId";
  IF qty IS NULL OR NEW.kind<>'DISPATCH_RETURN' OR NEW."variantId"<>variant OR NEW."lotId"<>lot OR NEW."availableDelta"<>(CASE WHEN return_condition='GOOD' THEN qty ELSE 0 END) OR NEW."damagedDelta"<>(CASE WHEN return_condition='DAMAGED' THEN qty ELSE 0 END) THEN RAISE EXCEPTION 'Invalid physical return source' USING ERRCODE='23514'; END IF;
 ELSIF NEW.kind IN ('DISPATCH','DISPATCH_RETURN') THEN RAISE EXCEPTION 'Dispatch movement requires its document' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "StockMovement_dispatch_source" BEFORE INSERT ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION fixup_dispatch_movement_guard();

CREATE FUNCTION fixup_dispatch_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_id text; dispatch_row "Dispatch"%ROWTYPE; net bigint;
BEGIN
 IF TG_TABLE_NAME='Dispatch' THEN order_id=NEW."orderId";
 ELSIF TG_TABLE_NAME='StockReservation' THEN order_id=NEW."orderId";
 ELSIF TG_TABLE_NAME='DispatchLine' THEN SELECT "orderId" INTO order_id FROM "Dispatch" WHERE id=NEW."dispatchId";
 ELSE
 SELECT d."orderId" INTO order_id FROM "Dispatch" d JOIN "DispatchLine" dl ON dl."dispatchId"=d.id JOIN "DispatchAllocation" a ON a."dispatchLineId"=dl.id WHERE a.id=NEW."dispatchAllocationId";
 END IF;
 IF order_id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO dispatch_row FROM "Dispatch" WHERE "orderId"=order_id;
 IF dispatch_row.id IS NULL THEN RETURN NULL; END IF;
 IF dispatch_row.status='CONFIRMED' THEN
  SELECT COALESCE(sum(CASE WHEN kind='REFUND' THEN -"amountPaise" ELSE "amountPaise" END),0) INTO net FROM "PaymentRecord" WHERE "orderId"=order_id;
  IF NOT EXISTS (SELECT 1 FROM "SalesOrder" WHERE id=order_id AND "cancelledAt" IS NULL AND status IN ('DISPATCHED','DELIVERED','DELIVERY_FAILED','RETURNED') AND net>="totalPaise") THEN RAISE EXCEPTION 'Invalid dispatched order' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM "DispatchLine" WHERE "dispatchId"=dispatch_row.id)<>(SELECT count(*) FROM "SalesOrderLine" WHERE "orderId"=order_id) OR NOT EXISTS (SELECT 1 FROM "DispatchLine" WHERE "dispatchId"=dispatch_row.id) THEN RAISE EXCEPTION 'Full order dispatch required' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM "DispatchLine" dl JOIN "SalesOrderLine" l ON l.id=dl."orderLineId" LEFT JOIN "StockReservation" r ON r."orderLineId"=l.id WHERE dl."dispatchId"=dispatch_row.id AND (l."orderId"<>order_id OR dl.quantity<>l.quantity OR r.status IS DISTINCT FROM 'CONSUMED' OR r.quantity<>l.quantity OR dl.quantity<>(SELECT COALESCE(sum(a.quantity),0) FROM "DispatchAllocation" a WHERE a."dispatchLineId"=dl.id))) THEN RAISE EXCEPTION 'Dispatch lines and reservations must match' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM "DispatchAllocation" a JOIN "DispatchLine" dl ON dl.id=a."dispatchLineId" LEFT JOIN "StockMovement" m ON m."dispatchAllocationId"=a.id WHERE dl."dispatchId"=dispatch_row.id AND m.id IS NULL) THEN RAISE EXCEPTION 'Every allocation requires one deduction' USING ERRCODE='23514'; END IF;
 ELSE
  IF EXISTS (SELECT 1 FROM "StockReservation" WHERE "orderId"=order_id AND status='CONSUMED') OR EXISTS (SELECT 1 FROM "StockMovement" m JOIN "DispatchAllocation" a ON a.id=m."dispatchAllocationId" JOIN "DispatchLine" dl ON dl.id=a."dispatchLineId" WHERE dl."dispatchId"=dispatch_row.id) THEN RAISE EXCEPTION 'Draft dispatch cannot consume stock' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER "Dispatch_consistent" AFTER INSERT OR UPDATE ON "Dispatch" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fixup_dispatch_consistency();
CREATE CONSTRAINT TRIGGER "Reservation_dispatch_consistent" AFTER INSERT OR UPDATE ON "StockReservation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fixup_dispatch_consistency();
CREATE CONSTRAINT TRIGGER "Movement_dispatch_consistent" AFTER INSERT ON "StockMovement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fixup_dispatch_consistency();
CREATE CONSTRAINT TRIGGER "DispatchLine_consistent" AFTER INSERT ON "DispatchLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fixup_dispatch_consistency();
CREATE FUNCTION fixup_dispatch_return_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE available integer; state text; dispatched_at timestamptz;
BEGIN
 SELECT a.quantity,d."deliveryStatus",d."confirmedAt" INTO available,state,dispatched_at FROM "DispatchAllocation" a JOIN "DispatchLine" dl ON dl.id=a."dispatchLineId" JOIN "Dispatch" d ON d.id=dl."dispatchId" WHERE a.id=NEW."allocationId" FOR UPDATE OF d;
 IF state IS DISTINCT FROM 'RETURNED' OR NEW."receivedAt"<dispatched_at OR NEW.quantity+(SELECT COALESCE(sum(quantity),0) FROM "DispatchReturn" WHERE "allocationId"=NEW."allocationId")>available THEN RAISE EXCEPTION 'Physical return exceeds returned shipment' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "DispatchReturn_guard" BEFORE INSERT ON "DispatchReturn" FOR EACH ROW EXECUTE FUNCTION fixup_dispatch_return_guard();
CREATE FUNCTION fixup_dispatch_return_posted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "StockMovement" WHERE "dispatchReturnId"=NEW.id) THEN RAISE EXCEPTION 'Physical return must post to ledger' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER "DispatchReturn_posted" AFTER INSERT ON "DispatchReturn" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fixup_dispatch_return_posted();
COMMIT;
