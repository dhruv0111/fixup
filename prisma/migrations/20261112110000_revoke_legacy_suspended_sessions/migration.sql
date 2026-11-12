BEGIN;

-- The new trigger covers future suspensions. Reconcile sessions retained by
-- accounts that were already inactive before the hardening migration was applied.
WITH revoked AS (
  DELETE FROM "Session" s USING "User" u
  WHERE s."userId" = u.id AND NOT u.active
  RETURNING s.id
)
INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", reason)
SELECT gen_random_uuid()::text, NULL, 'SESSION_REVOKED', 'Session', id,
       'Legacy suspended account sessions revoked'
FROM revoked;

COMMIT;
