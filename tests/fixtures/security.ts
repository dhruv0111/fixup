import { createHmac } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { expect, type APIRequestContext } from "@playwright/test";
import { db, origin } from "./helpers";

// Independent RFC 6238 test implementation: derive actual codes from dummy enrollment.
export function totpCode(secret: string, offset = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase().replace(/=+$/, "")) {
    const n = alphabet.indexOf(c);
    if (n < 0) throw new Error("Invalid dummy authenticator secret");
    bits += n.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const start = hmac[19] & 15;
  return ((hmac.readUInt32BE(start) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}

export async function verificationLink(
  email: string,
  subject = "Verify your FIXUP email",
) {
  for (const name of await readdir(".local/test-mail")) {
    const mail = JSON.parse(await readFile(`.local/test-mail/${name}`, "utf8"));
    if (mail.to === email && mail.subject === subject)
      return mail.text.match(/https?:\/\/[^\s]+/)![0] as string;
  }
  throw new Error("Dummy account mail was not found");
}
export async function verifyEmail(api: APIRequestContext, email: string) {
  expect(
    (
      await api.post("/api/auth/send-verification-email", {
        headers: { Origin: origin },
        data: { email },
      })
    ).status(),
  ).toBe(200);
  expect((await api.get(await verificationLink(email))).status()).toBe(200);
}
export async function enrollMfa(api: APIRequestContext, password: string) {
  const r = await api.post("/api/auth/two-factor/enable", {
    headers: { Origin: origin },
    data: { password, method: "totp" },
  });
  expect(r.status()).toBe(200);
  const setup = (await r.json()) as { totpURI: string; backupCodes: string[] };
  const secret = new URL(setup.totpURI).searchParams.get("secret")!;
  expect(
    (
      await api.post("/api/auth/two-factor/verify-totp", {
        headers: { Origin: origin },
        data: { code: totpCode(secret), trustDevice: false },
      })
    ).status(),
  ).toBe(200);
  return { secret, backupCodes: setup.backupCodes };
}
export async function secureAccount(a: {
  api: APIRequestContext;
  credentials: { email: string; password: string };
  user: { id: string };
}) {
  const row = await db.user.findUniqueOrThrow({ where: { id: a.user.id } });
  if (!row.emailVerified) await verifyEmail(a.api, a.credentials.email);
  if (!row.twoFactorEnabled) return enrollMfa(a.api, a.credentials.password);
}
