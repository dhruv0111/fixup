BEGIN;
ALTER TABLE "SalesSettings" ADD CHECK (id='singleton' AND ("taxBps" IS NULL OR "taxBps" BETWEEN 0 AND 10000) AND ("deliveryPaise" IS NULL OR "deliveryPaise">=0) AND ("reservationMinutes" IS NULL OR "reservationMinutes">0) AND ("lateReviewMinutes" IS NULL OR "lateReviewMinutes" BETWEEN 0 AND "reservationMinutes") AND ("taxMode" IS NULL OR "taxMode" IN ('INCLUSIVE','EXCLUSIVE')));
ALTER TABLE "SalesOrder" ADD CHECK (status IN ('PENDING_PAYMENT','PAYMENT_UNDER_REVIEW','PAYMENT_REJECTED','ADMIN_REVIEW','READY_FOR_DISPATCH','CANCELLED','RESERVATION_EXPIRED') AND "paymentStatus" IN ('UNPAID','PARTIALLY_PAID','PAID','OVERPAID') AND "paymentMethod" IN ('UPI','BANK'));
CREATE FUNCTION fixup_sales_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Sales history is permanent' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','paymentStatus','lateReviewRequired','overpaymentResolved','refundDecisionRequired','internalNotes','version','cancelledAt','cancelledById','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','paymentStatus','lateReviewRequired','overpaymentResolved','refundDecisionRequired','internalNotes','version','cancelledAt','cancelledById','updatedAt']) THEN RAISE EXCEPTION 'Order snapshots are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "SalesOrder_snapshot_guard" BEFORE UPDATE OR DELETE ON "SalesOrder" FOR EACH ROW EXECUTE FUNCTION fixup_sales_snapshot_guard();
CREATE FUNCTION fixup_payment_proof_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment submissions are permanent' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','version','reviewedById','reviewedAt','internalNotes','publicMessage']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','reviewedById','reviewedAt','internalNotes','publicMessage']) THEN RAISE EXCEPTION 'Original payment evidence is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.version<>OLD.version+1 OR OLD.status NOT IN ('SUBMITTED','UNDER_REVIEW') OR (NEW.status='VERIFIED' AND NOT EXISTS (SELECT 1 FROM "PaymentRecord" WHERE "submissionId"=NEW.id AND kind='RECEIPT')) THEN RAISE EXCEPTION 'Invalid payment review transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "PaymentSubmission_guard" BEFORE UPDATE OR DELETE ON "PaymentSubmission" FOR EACH ROW EXECUTE FUNCTION fixup_payment_proof_guard();
COMMIT;
