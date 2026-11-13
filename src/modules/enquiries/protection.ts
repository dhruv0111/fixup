import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/config/env";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/http/errors";

export function digest(value: string) {
  return createHmac("sha256", getEnv().BETTER_AUTH_SECRET)
    .update(value)
    .digest("hex");
}
export function challenge() {
  const payload = `${Date.now()}.${randomUUID()}`;
  return `${payload}.${digest(`challenge:${payload}`)}`;
}
export function verifyChallenge(token: string, honeypot: string) {
  const [stamp, nonce, signature, extra] = token.split(".");
  const expected = digest(`challenge:${stamp}.${nonce}`);
  const age = Date.now() - Number(stamp);
  if (
    honeypot ||
    extra ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !Number.isFinite(age) ||
    age < 2000 ||
    age > 60 * 60 * 1000 ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw new AppError(
      422,
      "FORM_EXPIRED",
      "Please wait a moment or refresh the form and try again.",
    );
}
export async function limitEnquiries(
  request: Request,
  scope = "submit",
  max = 5,
) {
  const env = getEnv();
  // Trust only the header overwritten by the configured ingress, as in auth.
  const ip = env.TRUSTED_IP_HEADER
    ? request.headers.get(env.TRUSTED_IP_HEADER)
    : null;
  const key = `enquiry:${scope}:${digest(ip?.slice(0, 200) || "shared")}`;
  const now = BigInt(Date.now());
  const window = BigInt(10 * 60 * 1000);
  const rows = await getDb().$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest") VALUES (${key}, ${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."lastRequest" < ${now - window} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "lastRequest" = CASE WHEN "RateLimit"."lastRequest" < ${now - window} THEN ${now} ELSE "RateLimit"."lastRequest" END
    RETURNING "count"`;
  if (rows[0].count > max)
    throw new AppError(
      429,
      "RATE_LIMITED",
      "Too many attempts. Please try again in ten minutes.",
    );
}
