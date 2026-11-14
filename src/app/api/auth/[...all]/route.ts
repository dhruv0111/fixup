import { z } from "zod";
import { getAuth } from "@/server/auth/config";
import { getEnv } from "@/config/env";
import { AppError, apiError } from "@/server/http/errors";
import { assertSameOrigin, readJson } from "@/server/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const registrationSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(12).max(128),
    callbackURL: z.string().max(500).optional(),
    rememberMe: z.boolean().optional(),
  })
  .strict();

const allowed = new Set([
  "sign-up/email",
  "sign-in/email",
  "sign-out",
  "get-session",
  "list-sessions",
  "revoke-session",
  "revoke-sessions",
  "revoke-other-sessions",
  "request-password-reset",
  "reset-password",
  "send-verification-email",
  "verify-email",
  "two-factor/enable",
  "two-factor/verify-totp",
  "two-factor/verify-backup-code",
  "two-factor/generate-backup-codes",
]);

async function handler(request: Request) {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/auth\//, "");
    if (!allowed.has(path) && !/^reset-password\/[^/]+$/.test(path))
      throw new AppError(404, "NOT_FOUND", "Endpoint not found.");
    const headers = new Headers(request.headers);
    const env = getEnv();
    // Never trust a browser-supplied internal IP header. Only the configured ingress header may supply it.
    const clientIp = env.TRUSTED_IP_HEADER
      ? request.headers.get(env.TRUSTED_IP_HEADER)
      : null;
    headers.set("x-fixup-client-ip", clientIp || "127.0.0.1");
    headers.delete("content-length");
    let body: string | undefined;
    if (request.method === "POST") {
      assertSameOrigin(request);
      let payload = await readJson(request);
      if (path === "sign-up/email") payload = registrationSchema.parse(payload);
      body = JSON.stringify(payload);
    }
    const response = await getAuth().handler(
      new Request(request.url, { method: request.method, headers, body }),
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return apiError(error);
  }
}

export const GET = handler;
export const POST = handler;
