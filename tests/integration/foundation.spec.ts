import { test, expect } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { secureAccount } from "../fixtures/security";
import {
  context,
  db,
  dummyAddress,
  dummyCredentials,
  origin,
  registered,
} from "../fixtures/helpers";

test.afterAll(async () => {
  await db.$disconnect();
});

test("application startup and database readiness respond successfully", async () => {
  const api = await context();
  expect((await api.get("/api/health")).status()).toBe(200);
  expect(await (await api.get("/api/health/ready")).json()).toEqual({
    status: "ready",
  });
  expect((await api.get("/")).status()).toBe(200);
  await api.dispose();
});

test("real PostgreSQL connection and committed migrations", async () => {
  expect(await db.$queryRaw`SELECT 1 AS value`).toEqual([{ value: 1 }]);
  const migrations = await db.$queryRaw<
    Array<{ migration_name: string; finished_at: Date | null }>
  >`SELECT migration_name, finished_at FROM "_prisma_migrations"`;
  expect(migrations.length).toBeGreaterThan(0);
  expect(migrations.every((m) => m.finished_at !== null)).toBe(true);
  expect(await db.businessSettings.count()).toBe(1);
  await expect(
    db.businessSettings.create({ data: { id: "second" } }),
  ).rejects.toThrow();
});

test("registration creates a customer and a library-hashed credential", async () => {
  const { api, credentials, user } = await registered();
  expect(user.role).toBe("CUSTOMER");
  expect(user.customer).not.toBeNull();
  const account = await db.account.findFirstOrThrow({
    where: { userId: user.id },
  });
  expect(account.password).toBeTruthy();
  expect(account.password).not.toBe(credentials.password);
  expect(account.password).not.toContain(credentials.password);
  const response = await api.get("/api/v1/me");
  expect(response.status()).toBe(200);
  const cookies = (await api.storageState()).cookies;
  const sessionCookie = cookies.find((cookie) =>
    cookie.name.includes("session_token"),
  );
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe("Lax");
  await api.dispose();
});

test("duplicate registration and case-normalised emails cannot create another user", async () => {
  const { api, credentials } = await registered();
  await api.post("/api/auth/sign-up/email", {
    data: { ...credentials, email: credentials.email.toUpperCase() },
  });
  expect(await db.user.count({ where: { email: credentials.email } })).toBe(1);
  await api.dispose();
});

test("registration rejects role escalation and invalid input", async () => {
  const api = await context();
  const credentials = dummyCredentials();
  expect(
    (
      await api.post("/api/auth/sign-up/email", {
        data: { ...credentials, role: "SUPER_ADMIN" },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await api.post("/api/auth/sign-up/email", {
        data: { ...credentials, password: "short" },
      })
    ).status(),
  ).toBe(422);
  expect(await db.user.count({ where: { email: credentials.email } })).toBe(0);
  await api.dispose();
});

test("logout revokes the session; login with correct credentials creates another", async () => {
  const { api, credentials, user } = await registered();
  const old = await api.storageState();
  expect((await api.post("/api/auth/sign-out", { data: {} })).status()).toBe(
    200,
  );
  expect((await api.get("/api/v1/me")).status()).toBe(401);
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  const stale = await context();
  const cookie = old.cookies
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
  expect(
    (await stale.get("/api/v1/me", { headers: { cookie } })).status(),
  ).toBe(401);
  expect(
    (
      await api.post("/api/auth/sign-in/email", {
        data: { email: credentials.email, password: credentials.password },
      })
    ).status(),
  ).toBe(200);
  expect((await api.get("/api/v1/me")).status()).toBe(200);
  await api.dispose();
  await stale.dispose();
});

test("invalid credentials never establish a session", async () => {
  const { api, credentials } = await registered();
  await api.post("/api/auth/sign-out", { data: {} });
  expect(
    (
      await api.post("/api/auth/sign-in/email", {
        data: {
          email: credentials.email,
          password: dummyCredentials().password,
        },
      })
    ).status(),
  ).toBe(401);
  expect((await api.get("/api/v1/me")).status()).toBe(401);
  await api.dispose();
});

test("expired database session is denied despite a retained cookie", async () => {
  const { api, user } = await registered();
  await db.session.updateMany({
    where: { userId: user.id },
    data: { expiresAt: new Date(Date.now() - 60000) },
  });
  expect((await api.get("/api/v1/me")).status()).toBe(401);
  await api.dispose();
});

test("revoke all sessions invalidates multiple signed-in devices", async () => {
  const { api, credentials, user } = await registered();
  const second = await context();
  expect(
    (
      await second.post("/api/auth/sign-in/email", {
        data: { email: credentials.email, password: credentials.password },
      })
    ).status(),
  ).toBe(200);
  expect(await db.session.count({ where: { userId: user.id } })).toBe(2);
  expect(
    (await api.post("/api/auth/revoke-sessions", { data: {} })).status(),
  ).toBe(200);
  expect((await api.get("/api/v1/me")).status()).toBe(401);
  expect((await second.get("/api/v1/me")).status()).toBe(401);
  await api.dispose();
  await second.dispose();
});

test("disabled users lose current access and cannot log in", async () => {
  const { api, user, credentials } = await registered();
  await db.user.update({ where: { id: user.id }, data: { active: false } });
  expect((await api.get("/api/v1/me")).status()).toBe(401);
  const other = await context();
  expect(
    (
      await other.post("/api/auth/sign-in/email", {
        data: { email: credentials.email, password: credentials.password },
      })
    ).status(),
  ).toBe(403);
  await api.dispose();
  await other.dispose();
});

for (const role of [
  "CUSTOMER",
  "DEALER",
  "SALES_REP",
  "ADMIN",
  "SUPER_ADMIN",
] as const) {
  test(`${role} server-side permission matrix`, async () => {
    const a = await registered();
    const { api, user } = a;
    if (role === "ADMIN" || role === "SUPER_ADMIN") await secureAccount(a);
    await db.user.update({ where: { id: user.id }, data: { role } });
    const expected = role === "ADMIN" || role === "SUPER_ADMIN" ? 200 : 403;
    expect((await api.get("/api/v1/admin/overview")).status()).toBe(expected);
    expect((await api.get("/api/v1/admin/audit-logs")).status()).toBe(expected);
    expect(
      (
        await api.patch("/api/v1/admin/settings", {
          data: { displayName: "FIXUP", reason: "Automated permission test" },
        })
      ).status(),
    ).toBe(role === "SUPER_ADMIN" ? 200 : 403);
    expect((await api.get("/api/v1/me")).status()).toBe(200);
    await api.dispose();
  });
}

test("dealer access requires both DEALER role and current approval", async () => {
  const { api, user } = await registered();
  await db.user.update({ where: { id: user.id }, data: { role: "DEALER" } });
  expect((await api.get("/api/v1/dealer/access")).status()).toBe(403);
  const dealer = await db.dealerProfile.create({
    data: {
      customerId: user.customer!.id,
      businessName: "Test Hardware",
      contactName: "Test Contact",
    },
  });
  expect((await api.get("/api/v1/dealer/access")).status()).toBe(403);
  await db.dealerProfile.update({
    where: { id: dealer.id },
    data: { status: "APPROVED" },
  });
  expect((await api.get("/api/v1/dealer/access")).status()).toBe(200);
  await db.dealerProfile.update({
    where: { id: dealer.id },
    data: { status: "SUSPENDED" },
  });
  expect((await api.get("/api/v1/dealer/access")).status()).toBe(403);
  await api.dispose();
});

test("anonymous API requests are rejected without database details", async () => {
  const api = await context();
  for (const path of [
    "/api/v1/me",
    "/api/v1/me/addresses",
    "/api/v1/admin/overview",
    "/api/v1/admin/settings",
    "/api/v1/admin/audit-logs",
    "/api/v1/dealer/access",
  ]) {
    const response = await api.get(path);
    expect(response.status()).toBe(401);
    expect(await response.text()).not.toContain("postgresql");
  }
  await api.dispose();
});

test("cross-user address reads and updates return 404 and preserve data", async () => {
  const first = await registered();
  const second = await registered();
  const created = await first.api.post("/api/v1/me/addresses", {
    data: dummyAddress,
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).data.id as string;
  expect((await first.api.get(`/api/v1/me/addresses/${id}`)).status()).toBe(
    200,
  );
  expect((await second.api.get(`/api/v1/me/addresses/${id}`)).status()).toBe(
    404,
  );
  expect(
    (
      await second.api.patch(`/api/v1/me/addresses/${id}`, {
        data: { ...dummyAddress, recipient: "Attempted overwrite" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (await db.address.findUniqueOrThrow({ where: { id } })).recipient,
  ).toBe(dummyAddress.recipient);
  expect(
    (
      await second.api.patch("/api/v1/me", {
        data: { userId: first.user.id, role: "ADMIN" },
      })
    ).status(),
  ).toBe(422);
  await first.api.dispose();
  await second.api.dispose();
});

test("profile changes and auth events produce secret-free audit records", async () => {
  const { api, user, credentials } = await registered();
  expect(
    (
      await api.patch("/api/v1/me", { data: { businessName: "Test Hardware" } })
    ).status(),
  ).toBe(200);
  const sessions = await db.session.findMany({ where: { userId: user.id } });
  await api.post("/api/auth/sign-out", { data: {} });
  const logs = await db.auditLog.findMany({ where: { actorId: user.id } });
  expect(logs.map((log) => log.action)).toEqual(
    expect.arrayContaining([
      "USER_REGISTERED",
      "SESSION_CREATED",
      "PROFILE_UPDATED",
      "USER_LOGGED_OUT",
    ]),
  );
  expect(
    logs.every((log) => log.createdAt && log.entityId && log.entityType),
  ).toBe(true);
  const serialised = JSON.stringify(logs);
  expect(serialised).not.toContain(credentials.password);
  for (const session of sessions)
    expect(serialised).not.toContain(session.token);
  expect(serialised).not.toContain(process.env.BETTER_AUTH_SECRET!);
  await api.dispose();
});

test("same-origin enforcement rejects CSRF on auth and business mutations", async () => {
  const { api } = await registered();
  expect(
    (
      await api.patch("/api/v1/me", {
        headers: { Origin: "https://attacker.invalid" },
        data: { phone: "9000000000" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await api.post("/api/auth/sign-out", {
        headers: { Origin: "https://attacker.invalid" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect((await api.get("/api/v1/me")).status()).toBe(200);
  await api.dispose();
});

test("authentication rate limiting persists in PostgreSQL", async () => {
  const api = await context();
  const data = dummyCredentials();
  let limited = false;
  for (let i = 0; i < 12; i++) {
    const response = await api.post("/api/auth/sign-in/email", {
      data: { email: data.email, password: data.password },
    });
    if (response.status() === 429) {
      limited = true;
      break;
    }
  }
  expect(limited).toBe(true);
  expect(await db.rateLimit.count()).toBeGreaterThan(0);
  await api.dispose();
});

test("password recovery uses one-time expiring tokens and revokes sessions", async () => {
  const { api, credentials, user } = await registered();
  expect(
    (
      await api.post("/api/auth/request-password-reset", {
        data: {
          email: credentials.email,
          redirectTo: `${origin}/reset-password`,
        },
      })
    ).status(),
  ).toBe(200);
  const files = await readdir(".local/test-mail");
  const messages = await Promise.all(
    files.map(
      async (file) =>
        JSON.parse(await readFile(`.local/test-mail/${file}`, "utf8")) as {
          to: string;
          text: string;
        },
    ),
  );
  const mail = messages.find((message) => message.to === credentials.email);
  expect(mail).toBeTruthy();
  const link = mail!.text.match(/http[^\s]+/)![0];
  const landing = await api.get(link, { maxRedirects: 0 });
  expect(landing.status()).toBe(302);
  const token = new URL(landing.headers().location).searchParams.get("token");
  expect(token).toBeTruthy();
  const password = dummyCredentials().password;
  expect(
    (
      await api.post("/api/auth/reset-password", {
        data: { token, newPassword: password },
      })
    ).status(),
  ).toBe(200);
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  expect((await api.get("/api/v1/me")).status()).toBe(401);
  expect(
    (
      await api.post("/api/auth/reset-password", {
        data: { token, newPassword: credentials.password },
      })
    ).ok(),
  ).toBe(false);
  expect(
    (
      await api.post("/api/auth/sign-in/email", {
        data: { email: credentials.email, password },
      })
    ).status(),
  ).toBe(200);
  expect(
    await db.auditLog.count({
      where: { actorId: user.id, action: "PASSWORD_RESET" },
    }),
  ).toBe(1);
  await api.dispose();
});

test("unknown recovery email returns a generic response; invalid token is rejected", async () => {
  const api = await context();
  expect(
    (
      await api.post("/api/auth/request-password-reset", {
        data: {
          email: dummyCredentials().email,
          redirectTo: `${origin}/reset-password`,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await api.post("/api/auth/reset-password", {
        data: {
          token: "invalid-test-token",
          newPassword: dummyCredentials().password,
        },
      })
    ).ok(),
  ).toBe(false);
  await api.dispose();
});

test("an expired real recovery token cannot change the password", async () => {
  const { api, credentials, user } = await registered();
  await api.post("/api/auth/request-password-reset", {
    data: { email: credentials.email, redirectTo: `${origin}/reset-password` },
  });
  const files = await readdir(".local/test-mail");
  const messages = await Promise.all(
    files.map(
      async (file) =>
        JSON.parse(await readFile(`.local/test-mail/${file}`, "utf8")) as {
          to: string;
          text: string;
        },
    ),
  );
  const mail = messages.find((message) => message.to === credentials.email)!;
  const link = mail.text.match(/http[^\s]+/)![0];
  const landing = await api.get(link, { maxRedirects: 0 });
  const token = new URL(landing.headers().location).searchParams.get("token");
  const verification = await db.verification.findFirstOrThrow({
    where: { value: user.id },
  });
  expect(verification.identifier).not.toContain(token!);
  await db.verification.update({
    where: { id: verification.id },
    data: { expiresAt: new Date(Date.now() - 60000) },
  });
  expect(
    (
      await api.post("/api/auth/reset-password", {
        data: { token, newPassword: dummyCredentials().password },
      })
    ).status(),
  ).toBe(400);
  const another = await context();
  expect(
    (
      await another.post("/api/auth/sign-in/email", {
        data: { email: credentials.email, password: credentials.password },
      })
    ).status(),
  ).toBe(200);
  await api.dispose();
  await another.dispose();
});

test("local owner bootstrap promotes an existing dummy user and revokes sessions", async () => {
  const { api, user, credentials } = await registered();
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/promote-admin.ts",
      credentials.email,
      "Automated local owner bootstrap test",
    ],
    { env: process.env, encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).role,
  ).toBe("SUPER_ADMIN");
  expect((await api.get("/api/v1/me")).status()).toBe(401);
  expect(
    await db.auditLog.count({
      where: { entityId: user.id, action: "ROLE_CHANGED", actorId: null },
    }),
  ).toBe(1);
  expect(
    (
      await api.post("/api/auth/sign-in/email", {
        data: { email: credentials.email, password: credentials.password },
      })
    ).status(),
  ).toBe(200);
  expect((await api.get("/api/v1/admin/overview")).status()).toBe(403);
  await secureAccount({ api, user, credentials });
  expect((await api.get("/api/v1/admin/overview")).status()).toBe(200);
  await api.dispose();
});
