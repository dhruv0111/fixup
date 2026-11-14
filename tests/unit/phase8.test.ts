import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(resolve("src/config/env.ts")).href;
function validate(extra: Record<string, string | undefined> = {}) {
  const env = {
    ...process.env,
    DATABASE_URL: "postgresql://dummy:dummy@127.0.0.1/fixup_unit_test",
    BETTER_AUTH_SECRET: "phase-eight-dummy-secret-for-unit-only",
    BETTER_AUTH_URL: "https://fixup.example",
    APP_ENV: "production",
    MAIL_MODE: "smtp",
    SMTP_HOST: "smtp.example",
    MAIL_FROM: "FIXUP <recovery@fixup.example>",
    ...extra,
  };
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `import {getEnv} from ${JSON.stringify(moduleUrl)}; try {getEnv();} catch(e) {console.error(e.message);process.exitCode=1;}`,
    ],
    { env, encoding: "utf8", windowsHide: true },
  );
}
test("production rejects missing, malformed and example recovery senders without disclosing secrets", () => {
  for (const MAIL_FROM of [
    undefined,
    "FIXUP <noreply@example.invalid>",
    "not-a-mailbox",
    "one@example.com, two@example.com",
    "FIXUP\r\nBcc: attacker@example.com <mail@fixup.example>",
  ]) {
    const r = validate({ MAIL_FROM });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /explicit valid MAIL_FROM/);
    assert.doesNotMatch(r.stderr, /dummy-secret|postgresql:\/\//);
  }
});
test("production accepts a syntactically valid explicit single sender without sending email", () => {
  for (const MAIL_FROM of [
    "FIXUP <recovery@fixup.example>",
    "recovery@fixup.example",
  ]) {
    const r = validate({ MAIL_FROM });
    assert.equal(r.status, 0, r.stderr);
  }
});
test("production refuses HTTP, file mail and missing SMTP host", () => {
  for (const extra of [
    { BETTER_AUTH_URL: "http://fixup.example" },
    { MAIL_MODE: "file" },
    { SMTP_HOST: undefined },
  ]) {
    const r = validate(extra);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Production requires HTTPS/);
  }
});
test("invalid environment errors report field names without values", () => {
  const r = validate({
    DATABASE_URL: "private-invalid-connection",
    BETTER_AUTH_SECRET: "REPLACE_private-secret-value-1234567890",
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /DATABASE_URL/);
  assert.match(r.stderr, /BETTER_AUTH_SECRET/);
  assert.doesNotMatch(
    r.stderr,
    /private-invalid-connection|private-secret-value/,
  );
});

test("production remote database and operator flags fail closed without leaking secrets", () => {
  for (const DATABASE_URL of [
    "postgresql://dummy:private@db.example/fixup",
    "postgresql://dummy:private@db.example/fixup?sslmode=require",
  ]) {
    const r = validate({ DATABASE_URL });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /sslmode=verify-full/);
    assert.doesNotMatch(r.stderr, /dummy:private/);
  }
  assert.equal(
    validate({
      DATABASE_URL:
        "postgresql://dummy:private@db.example/fixup?sslmode=verify-full",
    }).status,
    0,
  );
  const r = validate({
    FIXUP_ALLOW_PRIVILEGED_OPERATIONS: "1",
    FIXUP_PROCESS_ROLE: undefined,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /dedicated operator/);
});
