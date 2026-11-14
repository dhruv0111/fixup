import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { getAuth } from "../src/server/auth/config";
import { getDb } from "../src/server/db/client";
import { getActor, requirePermission } from "../src/server/permissions/service";
import { testRuntimeRole } from "./lib/test-runtime-role";

function totpCode(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.toUpperCase()]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}

// Only synthetic request handling and a named isolated test database are allowed.
// Production here means the actual application config/adapter path, not deployment.
const source = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "http://invalid");
  } catch {
    throw new Error("Invalid isolated probe configuration; values suppressed.");
  }
})();
if (
  !["test", "production"].includes(process.env.APP_ENV ?? "") ||
  !["127.0.0.1", "localhost"].includes(source.hostname) ||
  !/^\/fixup_[a-z_]*test$/.test(source.pathname) ||
  [...source.searchParams.keys()].some((key) =>
    [
      "host",
      "hostaddr",
      "port",
      "user",
      "password",
      "dbname",
      "database",
      "service",
      "options",
    ].includes(key),
  )
)
  throw new Error("Privileged production probe is test-database only.");
const jar = new Map<string, string>();
const clientIp = `10.230.${randomBytes(1)[0]}.${1 + (randomBytes(1)[0] % 254)}`;
let checkpoint = "setup_signup";
function capture(response: Response) {
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(";")[0];
    const split = pair.indexOf("=");
    const name = pair.slice(0, split);
    const value = pair.slice(split + 1);
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
}
function cookieHeaders() {
  return new Headers({
    cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
  });
}
async function request(path: string, data?: Record<string, unknown>) {
  const base = process.env.BETTER_AUTH_URL!;
  const headers = cookieHeaders();
  headers.set("origin", new URL(base).origin);
  headers.set("content-type", "application/json");
  headers.set("x-fixup-client-ip", clientIp);
  const response = await getAuth().handler(
    new Request(new URL(path, base), {
      method: data ? "POST" : "GET",
      headers,
      ...(data ? { body: JSON.stringify(data) } : {}),
    }),
  );
  capture(response);
  return response;
}
async function runSetup() {
  const email = `${randomUUID()}@fixup.test`,
    password = randomBytes(24).toString("base64url");
  assert.equal(
    (
      await request("/api/auth/sign-up/email", {
        name: "Isolated production-path MFA probe",
        email,
        password,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/api/auth/send-verification-email", { email })).status,
    200,
  );
  checkpoint = "setup_mail_link";
  let link: string | undefined;
  for (const name of await readdir(".local/test-mail")) {
    const mail = JSON.parse(await readFile(`.local/test-mail/${name}`, "utf8"));
    if (mail.to === email && mail.subject === "Verify your FIXUP email")
      link = mail.text.match(/https?:\/\/[^\s]+/)[0];
  }
  assert.ok(link);
  // The raw handler returns the configured callback redirect; API clients follow it.
  assert.equal((await request(link)).status, 302);
  assert.equal(
    (await getDb().user.findUniqueOrThrow({ where: { email } })).emailVerified,
    true,
  );
  checkpoint = "setup_enrollment";
  const setup = await request("/api/auth/two-factor/enable", {
    password,
    method: "totp",
  });
  assert.equal(setup.status, 200);
  const material = await setup.json();
  const secret = new URL(material.totpURI).searchParams.get("secret")!;
  checkpoint = "setup_totp";
  assert.equal(
    (
      await request("/api/auth/two-factor/verify-totp", {
        code: totpCode(secret),
        trustDevice: false,
      })
    ).status,
    200,
  );
  const user = await getDb().user.findUniqueOrThrow({ where: { email } });
  checkpoint = "setup_role";
  await getDb().user.update({
    where: { id: user.id },
    data: { role: "ADMIN" },
  });
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/check-privileged-auth.ts",
    ],
    {
      env: {
        ...process.env,
        APP_ENV: "production",
        BETTER_AUTH_URL: "https://127.0.0.1:3443",
        MAIL_MODE: "smtp",
        MAIL_FROM: "FIXUP QA <security@fixup.test>",
        SMTP_HOST: "127.0.0.1",
        FIXUP_QA_EMAIL: email,
        FIXUP_QA_PASSWORD: password,
        FIXUP_QA_BACKUP: material.backupCodes[2],
      },
      encoding: "utf8",
    },
  );
  checkpoint = "production_child";
  if (result.status !== 0) {
    const safe = result.stderr.match(/checkpoint=[a-z_]+/);
    if (safe) console.error(safe[0]);
  }
  assert.equal(
    result.status,
    0,
    "Isolated production-path MFA probe failed; child details suppressed.",
  );
  assert.match(result.stdout, /PASS production privileged/);
  console.log(result.stdout.trim());
}
async function runProduction() {
  const email = process.env.FIXUP_QA_EMAIL!,
    password = process.env.FIXUP_QA_PASSWORD!,
    backup = process.env.FIXUP_QA_BACKUP!;
  assert.ok(email?.endsWith("@fixup.test") && password && backup);
  checkpoint = "production_runtime_role";
  const runtime = await testRuntimeRole(source.toString(), false);
  process.env.DATABASE_URL = runtime.url;
  try {
    checkpoint = "production_login";
    const login = await request("/api/auth/sign-in/email", { email, password });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).twoFactorRedirect, true);
    assert.equal(await getActor(cookieHeaders()), null);
    checkpoint = "production_factor";
    const verified = await request("/api/auth/two-factor/verify-backup-code", {
      code: backup,
      trustDevice: false,
    });
    assert.equal(verified.status, 200);
    checkpoint = "production_cookie";
    const cookie = verified.headers
      .getSetCookie()
      .find((c) => c.startsWith("__Secure-fixup.session_token="));
    assert.ok(
      cookie && /;\s*Secure/i.test(cookie) && /;\s*HttpOnly/i.test(cookie),
    );
    checkpoint = "production_permissions";
    const actor = await requirePermission(cookieHeaders(), "orders.manage");
    assert.equal(actor.role, "ADMIN");
    assert.equal(actor.security.mfaVerified, true);
    await assert.rejects(
      requirePermission(cookieHeaders(), "reports.financial"),
    );
    checkpoint = "production_audit";
    const audit = await getDb().auditLog.count({
      where: {
        actorId: actor.id,
        action: "MFA_VERIFIED",
        entityId: actor.sessionId,
      },
    });
    assert.equal(audit, 1);
    console.log(
      "PASS production privileged password challenge, actual MFA, Secure cookie, restricted runtime DML, session audit and financial-role denial.",
    );
  } finally {
    await getDb().$disconnect();
    await runtime.cleanup();
  }
}
try {
  if (process.env.APP_ENV === "test") await runSetup();
  else await runProduction();
} catch {
  console.error(
    `Isolated production-path security verification failed; checkpoint=${checkpoint}; secret-bearing details suppressed.`,
  );
  process.exitCode = 1;
} finally {
  await getDb().$disconnect();
}
