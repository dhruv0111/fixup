import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { getAuth } from "../src/server/auth/config";
import { getDb } from "../src/server/db/client";

const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.APP_ENV !== "test" ||
  !/^\/fixup_[a-z_]*test$/.test(database.pathname) ||
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  process.env.BETTER_AUTH_URL !== "https://127.0.0.1:3443"
)
  throw new Error(
    "Secure cookie check is restricted to the isolated test database and loopback HTTPS origin.",
  );
try {
  const response = await getAuth().handler(
    new Request("https://127.0.0.1:3443/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        origin: "https://127.0.0.1:3443",
        "content-type": "application/json",
        "x-fixup-client-ip": "127.0.0.2",
      },
      body: JSON.stringify({
        name: "Cookie Test",
        email: `${randomUUID()}@fixup.test`,
        password: randomBytes(24).toString("base64url"),
      }),
    }),
  );
  assert.equal(response.status, 200);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("__Secure-fixup.session_token="));
  assert.ok(cookie, "HTTPS must issue a Secure-prefixed session cookie");
  assert.ok(/;\s*Secure/i.test(cookie));
  assert.ok(/;\s*HttpOnly/i.test(cookie));
  assert.ok(/;\s*SameSite=Lax/i.test(cookie));
  assert.ok(/;\s*Path=\//i.test(cookie));
  console.log(
    "HTTPS-origin Secure/HttpOnly/SameSite cookie assertions passed.",
  );
} finally {
  await getDb().$disconnect();
}
