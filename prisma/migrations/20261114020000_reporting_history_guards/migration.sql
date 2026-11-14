BEGIN;
CREATE FUNCTION fixup_expense_revision_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e "BusinessExpense"%ROWTYPE;
BEGIN
 SELECT * INTO e FROM "BusinessExpense" WHERE id=NEW."expenseId";
 IF e.id IS NULL OR NEW.version<>e.version OR NEW.title<>e.title OR NEW.category<>e.category OR NEW."amountPaise"<>e."amountPaise" OR NEW."expenseDate"<>e."expenseDate" OR NEW."paymentMethod"<>e."paymentMethod" OR NEW.reference<>e.reference OR NEW.description<>e.description OR NEW.status<>e.status THEN RAISE EXCEPTION 'Expense revision must match the changed expense' USING ERRCODE='23514'; END IF;
 IF NEW.version>0 AND NOT EXISTS (SELECT 1 FROM "ExpenseRevision" WHERE "expenseId"=NEW."expenseId" AND version=NEW.version-1) THEN RAISE EXCEPTION 'Expense history must be contiguous' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER "ExpenseRevision_source" BEFORE INSERT ON "ExpenseRevision" FOR EACH ROW EXECUTE FUNCTION fixup_expense_revision_source();
COMMIT;
