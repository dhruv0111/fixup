BEGIN;

ALTER TABLE "User" ADD COLUMN "profileProvisionedAt" TIMESTAMPTZ(3);

-- Existing complete accounts need no repair. Incomplete accounts remain discoverable.
UPDATE "User" u SET "profileProvisionedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Customer" c WHERE c."userId" = u.id)
  AND EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."entityType" = 'User' AND a."entityId" = u.id AND a.action = 'USER_REGISTERED');

-- Suspension is durable: old sessions cannot come back when an account is re-enabled.
CREATE FUNCTION fixup_revoke_suspended_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.active AND NOT NEW.active THEN
    INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", reason)
      SELECT gen_random_uuid()::text, NULL, 'SESSION_REVOKED', 'Session', id, 'Account suspended'
      FROM "Session" WHERE "userId" = NEW.id;
    DELETE FROM "Session" WHERE "userId" = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "User_revoke_suspended_sessions" BEFORE UPDATE OF active ON "User"
FOR EACH ROW EXECUTE FUNCTION fixup_revoke_suspended_sessions();

-- Serialize session issuance against user updates, closing the login/suspension race.
CREATE FUNCTION fixup_require_active_session_user() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE enabled boolean;
BEGIN
  SELECT active INTO enabled FROM "User" WHERE id = NEW."userId" FOR SHARE;
  IF enabled IS FALSE THEN
    RAISE EXCEPTION 'Account access is unavailable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Session_require_active_user" BEFORE INSERT ON "Session"
FOR EACH ROW EXECUTE FUNCTION fixup_require_active_session_user();

COMMIT;
