import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { context, db, dummyCredentials, registered } from "../fixtures/helpers";
import {
  ensureCustomerProfile,
  ProfileProvisioningError,
} from "../../src/modules/identity/provisioning";
import {
  promoteOwner,
  validatePromotionRequest,
} from "../../src/server/operations/admin-promotion";

test("database tools reject unsafe targets and development/test aliases", () => {
  const directory = mkdtempSync(join(tmpdir(), "fixup-db-guard-"));
  const helper = pathToFileURL(
    resolve("scripts/lib/test-environment.mjs"),
  ).href;
  const invoke = () =>
    spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { loadTestEnvironment } from ${JSON.stringify(helper)}; loadTestEnvironment();`,
      ],
      { cwd: directory, encoding: "utf8" },
    );
  try {
    for (const [appEnv, databaseUrl] of [
      ["production", "postgresql://127.0.0.1/fixup_test"],
      ["test", "postgresql://127.0.0.1/fixup_dev"],
      ["test", "postgresql://example.invalid/fixup_test"],
    ]) {
      writeFileSync(
        join(directory, ".env.test"),
        `APP_ENV=${appEnv}\nDATABASE_URL=${databaseUrl}\n`,
      );
      expect(invoke().status).toBe(1);
    }
    writeFileSync(
      join(directory, ".env.test"),
      "APP_ENV=test\nDATABASE_URL=postgresql://test-user@127.0.0.1:5432/fixup_test\n",
    );
    writeFileSync(
      join(directory, ".env"),
      "DATABASE_URL=postgresql://different-user@localhost/fixup_%74est\n",
    );
    const aliased = invoke();
    expect(aliased.status).toBe(1);
    expect(aliased.stderr).toContain("must be different databases");
    writeFileSync(
      join(directory, ".env"),
      "DATABASE_URL=postgresql://localhost/fixup_dev\n",
    );
    expect(invoke().status).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Fault injection is confined to the guarded test DB, never application flags or routes.
test.beforeAll(async () => {
  await db.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS "_test_provision_fault" (email text PRIMARY KEY)',
  );
  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION test_provision_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.action = 'USER_REGISTERED' AND EXISTS (SELECT 1 FROM "_test_provision_fault" f JOIN "User" u ON u.email = f.email WHERE u.id = NEW."entityId") THEN
      RAISE EXCEPTION 'PRIVATE_FAULT_SENTINEL do not log request data';
    END IF;
    RETURN NEW;
  END $$`);
  await db.$executeRawUnsafe(
    'CREATE OR REPLACE TRIGGER "test_provision_fault" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION test_provision_fault()',
  );
});
test.afterAll(async () => {
  await db.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS "test_provision_fault" ON "AuditLog"',
  );
  await db.$executeRawUnsafe("DROP FUNCTION IF EXISTS test_provision_fault()");
  await db.$executeRawUnsafe('DROP TABLE IF EXISTS "_test_provision_fault"');
  await db.$disconnect();
});

async function partialRegistration() {
  const api = await context();
  const credentials = dummyCredentials();
  await db.$executeRaw`INSERT INTO "_test_provision_fault" (email) VALUES (${credentials.email})`;
  expect(
    (await api.post("/api/auth/sign-up/email", { data: credentials })).status(),
  ).toBe(200);
  const user = await db.user.findUniqueOrThrow({
    where: { email: credentials.email },
  });
  expect(user.profileProvisionedAt).toBeNull();
  expect(await db.account.count({ where: { userId: user.id } })).toBe(1);
  expect(await db.customer.count({ where: { userId: user.id } })).toBe(0);
  return { api, credentials, user };
}

test("partial registration rolls back provisioning, logs safely, then concurrent retries recover exactly once", async () => {
  const { api, credentials, user } = await partialRegistration();
  try {
    expect((await api.get("/")).status()).toBe(200);
    const response = await api.get("/api/v1/me");
    expect(response.status()).toBe(503);
    expect(response.headers()["retry-after"]).toBe("5");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect((await response.json()).error.code).toBe("PROFILE_SETUP_PENDING");
    const logs: string[] = [];
    const original = console.error;
    console.error = (message: unknown) => {
      logs.push(String(message));
    };
    try {
      await expect(ensureCustomerProfile(user.id, db)).rejects.toBeInstanceOf(
        ProfileProvisioningError,
      );
    } finally {
      console.error = original;
    }
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain("customer_provisioning_failed");
    for (const secret of [
      credentials.email,
      credentials.password,
      "PRIVATE_FAULT_SENTINEL",
      process.env.DATABASE_URL!,
      process.env.BETTER_AUTH_SECRET!,
    ])
      expect(logs[0]).not.toContain(secret);
    expect(await db.customer.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await db.auditLog.count({
        where: { entityId: user.id, action: "USER_REGISTERED" },
      }),
    ).toBe(0);
    // Retry signup cannot produce a second identity; the existing credentials remain valid.
    await api.post("/api/auth/sign-up/email", { data: credentials });
    expect(await db.user.count({ where: { email: credentials.email } })).toBe(
      1,
    );
    await db.$executeRaw`DELETE FROM "_test_provision_fault" WHERE email = ${credentials.email}`;
    const retries = await Promise.all(
      Array.from({ length: 8 }, () => api.get("/api/v1/me")),
    );
    expect(retries.map((result) => result.status())).toEqual(
      Array(8).fill(200),
    );
    expect(await db.customer.count({ where: { userId: user.id } })).toBe(1);
    expect(
      await db.auditLog.count({
        where: { entityId: user.id, action: "USER_REGISTERED" },
      }),
    ).toBe(1);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .profileProvisionedAt,
    ).not.toBeNull();
    await db.customer.update({
      where: { userId: user.id },
      data: { businessName: "Preserve this business" },
    });
    await ensureCustomerProfile(user.id, db);
    expect(
      (await db.customer.findUniqueOrThrow({ where: { userId: user.id } }))
        .businessName,
    ).toBe("Preserve this business");
    expect(
      await db.auditLog.count({
        where: { entityId: user.id, action: "USER_REGISTERED" },
      }),
    ).toBe(1);
  } finally {
    await db.$executeRaw`DELETE FROM "_test_provision_fault" WHERE email = ${credentials.email}`;
    await api.dispose();
  }
});

test("password-authenticated login repairs a prior incomplete registration", async () => {
  const { api, user, credentials } = await partialRegistration();
  await api.post("/api/auth/sign-out", { data: {} });
  await db.$executeRaw`DELETE FROM "_test_provision_fault" WHERE email = ${credentials.email}`;
  expect(
    (
      await api.post("/api/auth/sign-in/email", {
        data: { email: credentials.email, password: credentials.password },
      })
    ).status(),
  ).toBe(200);
  expect((await api.get("/api/v1/me")).status()).toBe(200);
  expect(await db.customer.count({ where: { userId: user.id } })).toBe(1);
  await api.dispose();
});

test("operator reconciliation can be retried after failure without duplicate profiles or audits", async () => {
  const { api, user, credentials } = await partialRegistration();
  const command = [
    "node_modules/tsx/dist/cli.mjs",
    "scripts/repair-profiles.ts",
    "--limit",
    "1000",
  ];
  const failed = spawnSync(process.execPath, command, {
    env: process.env,
    encoding: "utf8",
  });
  expect(failed.status).toBe(1);
  expect(failed.stderr).not.toContain("PRIVATE_FAULT_SENTINEL");
  await db.$executeRaw`DELETE FROM "_test_provision_fault" WHERE email = ${credentials.email}`;
  for (let i = 0; i < 2; i++)
    expect(
      spawnSync(process.execPath, command, {
        env: process.env,
        encoding: "utf8",
      }).status,
    ).toBe(0);
  expect(await db.customer.count({ where: { userId: user.id } })).toBe(1);
  expect(
    await db.auditLog.count({
      where: { entityId: user.id, action: "USER_REGISTERED" },
    }),
  ).toBe(1);
  await api.dispose();
});

test("legacy profile recovery preserves existing registration audit and business data", async () => {
  const { api, user } = await registered();
  await db.customer.update({
    where: { userId: user.id },
    data: { phone: "9000000000" },
  });
  await db.user.update({
    where: { id: user.id },
    data: { profileProvisionedAt: null },
  });
  expect((await api.get("/api/v1/me")).status()).toBe(200);
  expect(
    (await db.customer.findUniqueOrThrow({ where: { userId: user.id } })).phone,
  ).toBe("9000000000");
  expect(
    await db.auditLog.count({
      where: { entityId: user.id, action: "USER_REGISTERED" },
    }),
  ).toBe(1);
  await api.dispose();
});

test("registration rate limit rejects the sixth signup without creating an account", async () => {
  const api = await context();
  for (let i = 0; i < 5; i++)
    expect(
      (
        await api.post("/api/auth/sign-up/email", { data: dummyCredentials() })
      ).status(),
    ).toBe(200);
  const blocked = dummyCredentials();
  expect(
    (await api.post("/api/auth/sign-up/email", { data: blocked })).status(),
  ).toBe(429);
  expect(await db.user.count({ where: { email: blocked.email } })).toBe(0);
  await api.dispose();
});

test("untrusted internal IP headers cannot bypass login throttling", async () => {
  const api = await context();
  const credentials = dummyCredentials();
  for (let i = 0; i < 10; i++)
    expect(
      (
        await api.post("/api/auth/sign-in/email", {
          headers: { "x-fixup-client-ip": `192.0.2.${i + 1}` },
          data: { email: credentials.email, password: credentials.password },
        })
      ).status(),
    ).toBe(401);
  expect(
    (
      await api.post("/api/auth/sign-in/email", {
        headers: { "x-fixup-client-ip": "192.0.2.100" },
        data: { email: credentials.email, password: credentials.password },
      })
    ).status(),
  ).toBe(429);
  await api.dispose();
});

test("suspension deletes sessions and reactivation cannot revive them", async () => {
  const { api, user } = await registered();
  const session = await db.session.findFirstOrThrow({
    where: { userId: user.id },
  });
  await db.user.update({ where: { id: user.id }, data: { active: false } });
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  expect(await (await api.get("/api/auth/get-session")).json()).toBeNull();
  await expect(
    db.session.create({
      data: {
        id: randomUUID(),
        token: randomUUID(),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60000),
      },
    }),
  ).rejects.toThrow();
  expect(
    await db.auditLog.count({
      where: {
        entityId: session.id,
        action: "SESSION_REVOKED",
        reason: "Account suspended",
      },
    }),
  ).toBe(1);
  await db.user.update({ where: { id: user.id }, data: { active: true } });
  expect((await api.get("/api/v1/me")).status()).toBe(401);
  await api.dispose();
});

test("upgrade reconciliation revokes legacy suspended sessions with one audit per session", async () => {
  const { api, user } = await registered();
  const session = await db.session.findFirstOrThrow({
    where: { userId: user.id },
  });
  // Reproduce Phase 1 state only in the isolated test DB. Transactional DDL restores
  // the suspension trigger even if fixture creation fails. No application bypass exists.
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'ALTER TABLE "User" DISABLE TRIGGER "User_revoke_suspended_sessions"',
    );
    await tx.user.update({ where: { id: user.id }, data: { active: false } });
    await tx.$executeRawUnsafe(
      'ALTER TABLE "User" ENABLE TRIGGER "User_revoke_suspended_sessions"',
    );
  });
  expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const sql = readFileSync(
      "prisma/migrations/20261112110000_revoke_legacy_suspended_sessions/migration.sql",
      "utf8",
    );
    await client.query(sql);
    await client.query(sql);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await db.auditLog.count({
        where: {
          entityId: session.id,
          action: "SESSION_REVOKED",
          reason: "Legacy suspended account sessions revoked",
        },
      }),
    ).toBe(1);
    await db.user.update({ where: { id: user.id }, data: { active: true } });
    expect((await api.get("/api/v1/me")).status()).toBe(401);
  } finally {
    await client.end();
    await api.dispose();
  }
});

test("role demotion and dealer rejection affect existing sessions immediately", async () => {
  const { api, user } = await registered();
  await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  expect((await api.get("/api/v1/admin/overview")).status()).toBe(200);
  await db.user.update({ where: { id: user.id }, data: { role: "DEALER" } });
  expect((await api.get("/api/v1/admin/overview")).status()).toBe(403);
  const dealer = await db.dealerProfile.create({
    data: {
      customerId: user.customer!.id,
      businessName: "Test Dealer",
      contactName: "Test Owner",
      status: "APPROVED",
    },
  });
  expect((await api.get("/api/v1/dealer/access")).status()).toBe(200);
  await db.dealerProfile.update({
    where: { id: dealer.id },
    data: { status: "REJECTED" },
  });
  expect((await api.get("/api/v1/dealer/access")).status()).toBe(403);
  await api.dispose();
});

test("a user cannot revoke another user's session", async () => {
  const first = await registered();
  const second = await registered();
  const session = await db.session.findFirstOrThrow({
    where: { userId: second.user.id },
  });
  await first.api.post("/api/auth/revoke-session", {
    data: { token: session.token },
  });
  expect(await db.session.count({ where: { id: session.id } })).toBe(1);
  expect((await second.api.get("/api/v1/me")).status()).toBe(200);
  await first.api.dispose();
  await second.api.dispose();
});

test("missing origin, incorrect JSON media types and oversized requests fail closed", async () => {
  const { api } = await registered();
  expect(
    (
      await api.patch("/api/v1/me", {
        headers: { origin: "" },
        data: { phone: "9000000000" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await api.patch("/api/v1/me", {
        headers: { "content-type": "application/jsonp" },
        data: JSON.stringify({ phone: "9000000000" }),
      })
    ).status(),
  ).toBe(415);
  const large = await api.patch("/api/v1/me", {
    data: { businessName: "x".repeat(17000) },
  });
  expect(large.status()).toBe(413);
  expect(large.headers()["cache-control"]).toContain("no-store");
  await api.dispose();
});

test("HTTPS-origin auth emits Secure HttpOnly SameSite cookies", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/check-secure-cookies.ts",
    ],
    {
      env: { ...process.env, BETTER_AUTH_URL: "https://127.0.0.1:3443" },
      encoding: "utf8",
    },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("cookie assertions passed");
});

test("administrator creation has no public endpoint and production CLI defaults to refusal", async () => {
  const api = await context();
  for (const path of ["/api/auth/admin/promote", "/api/v1/admin/users/promote"])
    expect((await api.post(path, { data: {} })).status()).toBe(404);
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/promote-admin.ts",
      "operator-target@fixup.test",
      "Production guard test",
    ],
    { env: { ...process.env, APP_ENV: "production" }, encoding: "utf8" },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("promotion refused");
  expect(() =>
    validatePromotionRequest(
      { email: "x@fixup.test", reason: "Test reason" },
      {
        appEnv: "development",
        databaseUrl: "postgresql://example.invalid/fixup_dev",
        productionEnabled: false,
      },
    ),
  ).toThrow("loopback");
  await api.dispose();
});

test("production promotion requires verified identity, exact ID and audit; replay is a no-op", async () => {
  const { api, user, credentials } = await registered();
  const environment = {
    appEnv: "production",
    databaseUrl: process.env.DATABASE_URL!,
    productionEnabled: true,
  };
  const request = {
    email: credentials.email,
    reason: "Approved test operation",
    production: true,
    operator: "test-operator",
    confirmUser: user.id,
  };
  await expect(promoteOwner(request, environment, db)).rejects.toThrow(
    "verified email",
  );
  await db.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });
  await expect(
    promoteOwner({ ...request, confirmUser: "wrong-id" }, environment, db),
  ).rejects.toThrow("exact confirmed user ID");
  expect(await promoteOwner(request, environment, db)).toBe(true);
  expect(await promoteOwner(request, environment, db)).toBe(false);
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  const audit = await db.auditLog.findMany({
    where: { entityId: user.id, action: "ROLE_CHANGED" },
  });
  expect(audit).toHaveLength(1);
  expect(audit[0].reason).toContain("test-operator");
  await api.dispose();
});

test("database constraints reject orphan addresses, duplicate profiles and malformed canonical data", async () => {
  const { api, user } = await registered();
  await expect(
    db.customer.create({ data: { userId: user.id } }),
  ).rejects.toThrow();
  await expect(
    db.customer.create({ data: { userId: randomUUID() } }),
  ).rejects.toThrow();
  await expect(
    db.address.create({
      data: {
        customerId: randomUUID(),
        recipient: "Test",
        phone: "9000000000",
        line1: "Test Street",
        city: "Test",
        state: "Test",
        postalCode: "400001",
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.user.update({
      where: { id: user.id },
      data: { email: user.email.toUpperCase() },
    }),
  ).rejects.toThrow();
  await expect(
    db.address.create({
      data: {
        customerId: user.customer!.id,
        recipient: "Test",
        phone: "9000000000",
        line1: "Test Street",
        city: "Test",
        state: "Test",
        postalCode: "BADPIN",
      },
    }),
  ).rejects.toThrow();
  await expect(db.user.delete({ where: { id: user.id } })).rejects.toThrow();
  await api.dispose();
});
