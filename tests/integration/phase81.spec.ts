import { test, expect } from "@playwright/test";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { context, db, registered } from "../fixtures/helpers";
import {
  enrollMfa,
  secureAccount,
  totpCode,
  verificationLink,
  verifyEmail,
} from "../fixtures/security";
import { testRuntimeRole } from "../../scripts/lib/test-runtime-role";
import { assertRuntimeDatabaseRole } from "../../src/server/db/security";

test.afterAll(async () => {
  await db.$disconnect();
});

test("privileged roles fail closed before verified email, enrollment and per-session MFA", async () => {
  const a = await registered();
  try {
    await db.user.update({
      where: { id: a.user.id },
      data: { role: "SUPER_ADMIN" },
    });
    for (const path of [
      "/api/v1/admin/overview",
      "/api/v1/admin/reports/profitability?format=csv",
      "/api/v1/admin/sales/payments",
      "/api/v1/admin/dispatch",
    ])
      expect((await a.api.get(path)).status()).toBe(403);
    await verifyEmail(a.api, a.credentials.email);
    expect((await a.api.get("/api/v1/admin/overview")).status()).toBe(403);
    await enrollMfa(a.api, a.credentials.password);
    expect((await a.api.get("/api/v1/admin/overview")).status()).toBe(200);
    await db.session.updateMany({
      where: { userId: a.user.id },
      data: { mfaVerifiedAt: new Date(Date.now() - 13 * 60 * 60 * 1000) },
    });
    expect((await a.api.get("/api/v1/admin/overview")).status()).toBe(403);
    await db.session.updateMany({
      where: { userId: a.user.id },
      data: { mfaVerifiedAt: null },
    });
    expect((await a.api.get("/api/v1/admin/overview")).status()).toBe(403);
  } finally {
    await a.api.dispose();
  }
});

test("email ownership requires a real delivered dummy-account token; no automatic sign-in or forged proof", async () => {
  const a = await registered();
  const stranger = await context();
  try {
    expect(
      (
        await stranger.post("/api/auth/send-verification-email", {
          data: { email: a.credentials.email },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await a.api.post("/api/auth/send-verification-email", {
          data: { email: `other-${a.credentials.email}` },
        })
      ).status(),
    ).toBe(400);
    expect(
      (await a.api.get("/api/auth/verify-email?token=forged")).status(),
    ).toBe(401);
    await verifyEmail(a.api, a.credentials.email);
    const link = await verificationLink(a.credentials.email);
    expect((await stranger.get(link)).status()).toBe(200);
    expect((await stranger.get("/api/v1/me")).status()).toBe(401);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: a.user.id } }))
        .emailVerified,
    ).toBe(true);
  } finally {
    await a.api.dispose();
    await stranger.dispose();
  }
});

test("enrollment needs password and a real authenticator code, and cannot use email OTP or trust devices", async () => {
  const a = await registered();
  try {
    expect(
      (
        await a.api.post("/api/auth/two-factor/enable", {
          data: { password: "incorrect-password", method: "totp" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await a.api.post("/api/auth/two-factor/enable", {
          data: { password: a.credentials.password, method: "otp" },
        })
      ).status(),
    ).toBe(403);
    const setup = await a.api.post("/api/auth/two-factor/enable", {
      data: { password: a.credentials.password, method: "totp" },
    });
    expect(setup.status()).toBe(200);
    const data = await setup.json();
    const row = await db.twoFactor.findUniqueOrThrow({
      where: { userId: a.user.id },
    });
    expect(row.verified).toBe(false);
    expect(row.secret).not.toContain(
      new URL(data.totpURI).searchParams.get("secret")!,
    );
    expect(row.backupCodes).not.toContain(data.backupCodes[0]);
    expect(
      (
        await a.api.post("/api/auth/two-factor/verify-backup-code", {
          data: { code: data.backupCodes[0] },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: a.user.id } }))
        .twoFactorEnabled,
    ).toBe(false);
    const secret = new URL(data.totpURI).searchParams.get("secret")!;
    expect(
      (
        await a.api.post("/api/auth/two-factor/verify-totp", {
          data: { code: totpCode(secret, -5) },
        })
      ).status(),
    ).toBe(401);
    expect(
      (await db.twoFactor.findUniqueOrThrow({ where: { userId: a.user.id } }))
        .verified,
    ).toBe(false);
    for (const path of [
      "disable",
      "send-otp",
      "verify-otp",
      "get-totp-uri",
      "view-backup-codes",
    ])
      expect(
        (
          await a.api.post(`/api/auth/two-factor/${path}`, {
            data: { password: a.credentials.password },
          })
        ).status(),
      ).toBe(404);
  } finally {
    await a.api.dispose();
  }
});

test("password login yields only a challenge; invalid/expired/replayed TOTP and forged session fields cannot grant admin access", async () => {
  const a = await registered();
  const setup = await secureAccount(a);
  const second = await context();
  try {
    await db.user.update({ where: { id: a.user.id }, data: { role: "ADMIN" } });
    const login = await second.post("/api/auth/sign-in/email", {
      data: {
        email: a.credentials.email,
        password: a.credentials.password,
        mfaVerifiedAt: new Date().toISOString(),
      },
    });
    expect(login.status()).toBe(200);
    expect((await login.json()).twoFactorRedirect).toBe(true);
    expect((await second.get("/api/v1/admin/overview")).status()).toBe(401);
    expect(
      (
        await second.post("/api/auth/two-factor/verify-totp", {
          data: { code: totpCode(setup!.secret, -5) },
        })
      ).status(),
    ).toBe(401);
    expect(
      (await db.twoFactor.findUniqueOrThrow({ where: { userId: a.user.id } }))
        .failedVerificationCount,
    ).toBeGreaterThan(0);
    expect(
      (
        await second.post("/api/auth/two-factor/verify-totp", {
          data: { code: totpCode(setup!.secret), trustDevice: true },
        })
      ).status(),
    ).toBe(403);
    const verified = await second.post("/api/auth/two-factor/verify-totp", {
      data: { code: totpCode(setup!.secret, 1), trustDevice: false },
    });
    expect(verified.status()).toBe(200);
    expect((await second.get("/api/v1/admin/overview")).status()).toBe(200);
    // Rotate the test IP to exercise replay protection rather than the independent IP limiter.
    const replay = await context();
    try {
      await replay.post("/api/auth/sign-in/email", {
        data: { email: a.credentials.email, password: a.credentials.password },
      });
      expect(
        (
          await replay.post("/api/auth/two-factor/verify-totp", {
            data: { code: totpCode(setup!.secret, -5) },
          })
        ).status(),
      ).toBe(401);
      const failuresBeforeReplay = (
        await db.twoFactor.findUniqueOrThrow({ where: { userId: a.user.id } })
      ).failedVerificationCount;
      expect(failuresBeforeReplay).toBeGreaterThan(0);
      expect(
        (
          await replay.post("/api/auth/two-factor/verify-totp", {
            data: { code: totpCode(setup!.secret, 1) },
          })
        ).status(),
      ).toBe(403);
      expect(
        (await db.twoFactor.findUniqueOrThrow({ where: { userId: a.user.id } }))
          .failedVerificationCount,
      ).toBe(failuresBeforeReplay);
      expect((await replay.get("/api/v1/admin/overview")).status()).toBe(401);
    } finally {
      await replay.dispose();
    }
  } finally {
    await a.api.dispose();
    await second.dispose();
  }
});

test("single-use backup code completes MFA once and cannot bypass challenge possession or rotate factors", async () => {
  const a = await registered();
  const setup = await secureAccount(a);
  const second = await context();
  const replay = await context();
  try {
    await db.user.update({
      where: { id: a.user.id },
      data: { role: "SUPER_ADMIN" },
    });
    expect(
      (
        await second.post("/api/auth/two-factor/verify-backup-code", {
          data: { code: setup!.backupCodes[0] },
        })
      ).status(),
    ).toBe(401);
    await second.post("/api/auth/sign-in/email", {
      data: { email: a.credentials.email, password: a.credentials.password },
    });
    await replay.post("/api/auth/sign-in/email", {
      data: { email: a.credentials.email, password: a.credentials.password },
    });
    const attempts = await Promise.all(
      [second, replay].map((api) =>
        api.post("/api/auth/two-factor/verify-backup-code", {
          data: { code: setup!.backupCodes[0] },
        }),
      ),
    );
    expect(attempts.filter((r) => r.status() === 200)).toHaveLength(1);
    const winner = attempts[0].status() === 200 ? second : replay;
    const loser = winner === second ? replay : second;
    expect((await winner.get("/api/v1/admin/overview")).status()).toBe(200);
    expect((await loser.get("/api/v1/admin/overview")).status()).toBe(401);
    const fresh = await context();
    try {
      await fresh.post("/api/auth/sign-in/email", {
        data: { email: a.credentials.email, password: a.credentials.password },
      });
      expect(
        (
          await fresh.post("/api/auth/two-factor/verify-backup-code", {
            data: { code: setup!.backupCodes[0] },
          })
        ).status(),
      ).toBe(401);
      expect((await fresh.get("/api/v1/admin/overview")).status()).toBe(401);
    } finally {
      await fresh.dispose();
    }
    expect(
      (
        await winner.post("/api/auth/two-factor/enable", {
          data: { password: a.credentials.password, method: "totp" },
        })
      ).status(),
    ).toBe(403);
    const audit = JSON.stringify(
      await db.auditLog.findMany({ where: { actorId: a.user.id } }),
    );
    expect(audit).not.toContain(setup!.secret);
    for (const code of setup!.backupCodes) expect(audit).not.toContain(code);
  } finally {
    await a.api.dispose();
    await second.dispose();
    await replay.dispose();
  }
});

test("password recovery revokes sessions and preserves enrolled MFA; a reset link is not privileged login", async () => {
  const a = await registered();
  const setup = await secureAccount(a);
  const recovery = await context();
  try {
    await db.user.update({ where: { id: a.user.id }, data: { role: "ADMIN" } });
    expect(
      (
        await recovery.post("/api/auth/request-password-reset", {
          data: {
            email: a.credentials.email,
            redirectTo: "http://127.0.0.1:3100/reset-password",
          },
        })
      ).status(),
    ).toBe(200);
    const token = new URL(
      await verificationLink(a.credentials.email, "Reset your FIXUP password"),
    ).pathname
      .split("/")
      .at(-1)!;
    const password = randomBytes(24).toString("base64url");
    expect(
      (
        await recovery.post("/api/auth/reset-password", {
          data: { token, newPassword: password },
        })
      ).status(),
    ).toBe(200);
    expect((await a.api.get("/api/v1/admin/overview")).status()).toBe(401);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: a.user.id } }))
        .twoFactorEnabled,
    ).toBe(true);
    const login = await recovery.post("/api/auth/sign-in/email", {
      data: { email: a.credentials.email, password },
    });
    expect((await login.json()).twoFactorRedirect).toBe(true);
    expect((await recovery.get("/api/v1/admin/overview")).status()).toBe(401);
    expect(
      (
        await recovery.post("/api/auth/two-factor/verify-backup-code", {
          data: { code: setup!.backupCodes[1] },
        })
      ).status(),
    ).toBe(200);
    expect((await recovery.get("/api/v1/admin/overview")).status()).toBe(200);
  } finally {
    await a.api.dispose();
    await recovery.dispose();
  }
});

test("MFA mutations require same origin and anonymous APIs cannot enroll, regenerate codes or invoke alternate login", async () => {
  const a = await registered();
  const anon = await context();
  try {
    expect(
      (
        await a.api.post("/api/auth/two-factor/enable", {
          headers: { origin: "https://attacker.invalid" },
          data: { password: a.credentials.password },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await anon.post("/api/auth/two-factor/enable", {
          data: { password: a.credentials.password },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await a.api.post("/api/auth/two-factor/generate-backup-codes", {
          data: { password: a.credentials.password },
        })
      ).status(),
    ).toBe(403);
    for (const path of [
      "sign-in/social",
      "sign-in/username",
      "sign-in/phone-number",
      "two-factor/verify-otp",
      "totp/generate",
    ])
      expect(
        (await anon.post(`/api/auth/${path}`, { data: {} })).status(),
      ).toBe(404);
    const audit = await db.auditLog.findMany({ where: { actorId: a.user.id } });
    expect(JSON.stringify(audit)).not.toContain(a.credentials.password);
  } finally {
    await a.api.dispose();
    await anon.dispose();
  }
});

test("production database guard rejects bootstrap ownership and restricts schema, roles and server files", async () => {
  const source = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await expect(assertRuntimeDatabaseRole(source)).rejects.toThrow(
    "least-privilege",
  );
  await source.end();
  const runtime = await testRuntimeRole(process.env.DATABASE_URL!);
  const pool = new pg.Pool({ connectionString: runtime.url });
  try {
    await assertRuntimeDatabaseRole(pool);
    expect((await pool.query('SELECT count(*) FROM "User"')).rowCount).toBe(1);
    for (const sql of [
      "CREATE TABLE public.qa_forbidden(id int)",
      'ALTER TABLE "User" ADD COLUMN qa_forbidden int',
      'ALTER TABLE "StockMovement" DISABLE TRIGGER ALL',
      "CREATE ROLE qa_forbidden",
      "SELECT pg_read_file('postgresql.conf')",
    ])
      await expect(pool.query(sql)).rejects.toThrow();
  } finally {
    await pool.end();
    await runtime.cleanup();
  }
});

test("expired MFA challenges and account lockout deny verification even with valid factors", async () => {
  const a = await registered();
  const setup = await secureAccount(a);
  const second = await context();
  try {
    await second.post("/api/auth/sign-in/email", {
      data: { email: a.credentials.email, password: a.credentials.password },
    });
    await db.verification.updateMany({
      where: { value: a.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (
        await second.post("/api/auth/two-factor/verify-backup-code", {
          data: { code: setup!.backupCodes[0] },
        })
      ).status(),
    ).toBe(401);
    await second.post("/api/auth/sign-in/email", {
      data: { email: a.credentials.email, password: a.credentials.password },
    });
    await db.twoFactor.update({
      where: { userId: a.user.id },
      data: {
        failedVerificationCount: 10,
        lockedUntil: new Date(Date.now() + 900000),
      },
    });
    expect(
      (
        await second.post("/api/auth/two-factor/verify-backup-code", {
          data: { code: setup!.backupCodes[0] },
        })
      ).status(),
    ).toBe(429);
    expect((await second.get("/api/v1/me")).status()).toBe(401);
  } finally {
    await a.api.dispose();
    await second.dispose();
  }
});

test("existing password sessions cannot bypass the account-level MFA lockout through step-up", async () => {
  const a = await registered();
  const setup = await secureAccount(a);
  try {
    await db.user.update({ where: { id: a.user.id }, data: { role: "ADMIN" } });
    await db.session.updateMany({
      where: { userId: a.user.id },
      data: { mfaVerifiedAt: null },
    });
    await db.twoFactor.update({
      where: { userId: a.user.id },
      data: { failedVerificationCount: 9, lockedUntil: null },
    });
    expect(
      (
        await a.api.post("/api/auth/two-factor/verify-totp", {
          data: { code: totpCode(setup!.secret, -5) },
        })
      ).status(),
    ).toBe(401);
    const factor = await db.twoFactor.findUniqueOrThrow({
      where: { userId: a.user.id },
    });
    expect(factor.failedVerificationCount).toBe(10);
    expect(factor.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(
      (
        await a.api.post("/api/auth/two-factor/verify-backup-code", {
          data: { code: setup!.backupCodes[0] },
        })
      ).status(),
    ).toBe(429);
    expect((await a.api.get("/api/v1/admin/overview")).status()).toBe(403);
  } finally {
    await a.api.dispose();
  }
});
