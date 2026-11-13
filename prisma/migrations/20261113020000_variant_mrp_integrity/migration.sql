BEGIN;

-- CHECK accepts SQL NULL. Require an actual amount in the confirmed branch so
-- a confirmed MRP without an amount cannot bypass the constraint.
ALTER TABLE "ProductVariant"
  DROP CONSTRAINT "ProductVariant_mrp_confirmation",
  ADD CONSTRAINT "ProductVariant_mrp_confirmation" CHECK (
    ("mrpPaise" IS NULL AND NOT "mrpConfirmed") OR
    ("mrpPaise" IS NOT NULL AND "mrpPaise" BETWEEN 1 AND 100000000 AND "mrpConfirmed")
  );

COMMIT;
