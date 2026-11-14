BEGIN;
ALTER TABLE "User" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Session" ADD COLUMN "mfaVerifiedAt" TIMESTAMPTZ(3);
CREATE TABLE "TwoFactor" (
 "id" TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "secret" TEXT NOT NULL,
 "backupCodes" TEXT NOT NULL,
 "verified" BOOLEAN NOT NULL DEFAULT false,
 "failedVerificationCount" INTEGER NOT NULL DEFAULT 0 CHECK ("failedVerificationCount">=0),
 "lockedUntil" TIMESTAMPTZ(3)
);
CREATE TABLE "MfaCodeUse" (
 "id" TEXT PRIMARY KEY,
 "factorId" TEXT NOT NULL REFERENCES "TwoFactor"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "digest" TEXT NOT NULL,
 "usedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MfaCodeUse_factorId_usedAt_idx" ON "MfaCodeUse"("factorId","usedAt");
-- Existing sessions receive no MFA assurance. No identity/factor is invented.
COMMIT;
