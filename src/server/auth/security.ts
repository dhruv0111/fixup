import "server-only";
import { createHash } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { recordAudit } from "@/server/audit/service";

export const privileged = (role: string) =>
  ["ADMIN", "SUPER_ADMIN"].includes(role);
export const mfaFresh = (
  at: Date | null | undefined,
  maxAge = 12 * 60 * 60 * 1000,
) => !!at && at.getTime() <= Date.now() && at.getTime() > Date.now() - maxAge;
const verifying = new Set([
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
]);
const failure = () =>
  new APIError("FORBIDDEN", {
    message: "Complete account security verification before this action.",
    code: "SECURITY_VERIFICATION_REQUIRED",
  });

export function accountSecurity(): BetterAuthPlugin {
  return {
    id: "fixup-account-security",
    hooks: {
      before: [
        {
          matcher: (ctx) =>
            ctx.path?.startsWith("/two-factor/") === true ||
            ctx.path === "/send-verification-email",
          handler: createAuthMiddleware(async (ctx) => {
            const path = ctx.path;
            if (verifying.has(path)) {
              const schema = path.endsWith("verify-totp")
                ? z
                    .object({
                      code: z.string().regex(/^\d{6}$/),
                      trustDevice: z.literal(false).optional(),
                    })
                    .strict()
                : z
                    .object({
                      code: z.string().min(6).max(100),
                      trustDevice: z.literal(false).optional(),
                    })
                    .strict();
              if (!schema.safeParse(ctx.body).success) throw failure();
              const active = await getSessionFromCtx(ctx);
              let targetId = active?.user.id;
              if (!targetId) {
                const cookie = ctx.context.createAuthCookie("two_factor");
                const signed = await ctx.getSignedCookie(
                  cookie.name,
                  ctx.context.secret,
                );
                if (signed) {
                  const challenge =
                    await ctx.context.internalAdapter.findVerificationValue(
                      signed,
                    );
                  if (challenge && challenge.expiresAt.getTime() > Date.now())
                    targetId = challenge.value;
                }
              }
              if (targetId) {
                const user = await getDb().user.findUnique({
                  where: { id: targetId },
                  include: { twoFactor: true },
                });
                if (!user?.active) throw failure();
                if (
                  user.twoFactor?.lockedUntil &&
                  user.twoFactor.lockedUntil.getTime() > Date.now()
                )
                  throw new APIError("TOO_MANY_REQUESTS", {
                    message:
                      "Authenticator verification is temporarily locked.",
                  });
                const factor = user.twoFactor;
                if (path.endsWith("verify-backup-code") && !factor?.verified)
                  throw failure();
                if (path.endsWith("verify-totp") && factor) {
                  const digest = createHash("sha256")
                    .update(`${factor.id}:${ctx.body.code}`)
                    .digest("hex");
                  if (
                    await getDb().mfaCodeUse.findFirst({
                      where: {
                        factorId: factor.id,
                        digest,
                        usedAt: { gt: new Date(Date.now() - 120000) },
                      },
                    })
                  )
                    throw failure();
                }
              }
              return;
            }
            const session = await getSessionFromCtx(ctx);
            if (!session) throw failure();
            const user = await getDb().user.findUnique({
              where: { id: session.user.id },
            });
            if (!user?.active) throw failure();
            if (path === "/two-factor/enable") {
              if (
                !z
                  .object({
                    password: z.string().min(1).max(128),
                    method: z.literal("totp").optional(),
                  })
                  .strict()
                  .safeParse(ctx.body).success
              )
                throw failure();
              if (user.twoFactorEnabled) throw failure();
            } else if (path === "/two-factor/generate-backup-codes") {
              const current = await getDb().session.findUnique({
                where: { id: session.session.id },
              });
              if (!mfaFresh(current?.mfaVerifiedAt, 15 * 60 * 1000))
                throw failure();
            } else if (path !== "/send-verification-email") {
              // No disable, email OTP, trust-device or secret-redisclosure path.
              throw failure();
            }
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => verifying.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.context.returned instanceof APIError) {
              // The library's account budget covers sign-in challenges. Apply the
              // same budget to enrollment/step-up on an existing password session.
              const active = ctx.context.session;
              const code = ctx.context.returned.body?.code;
              if (
                active &&
                ["INVALID_CODE", "INVALID_BACKUP_CODE"].includes(code ?? "")
              ) {
                await getDb().$transaction(async (tx) => {
                  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${active.user.id} FOR UPDATE`;
                  // Share the row lock used by the library's atomic increments.
                  await tx.$queryRaw`SELECT id FROM "TwoFactor" WHERE "userId"=${active.user.id} FOR UPDATE`;
                  const factor = await tx.twoFactor.findUnique({
                    where: { userId: active.user.id },
                  });
                  if (factor) {
                    const count =
                      (factor.lockedUntil &&
                      factor.lockedUntil.getTime() <= Date.now()
                        ? 0
                        : factor.failedVerificationCount) + 1;
                    await tx.twoFactor.update({
                      where: { id: factor.id },
                      data: {
                        failedVerificationCount: count,
                        lockedUntil:
                          count >= 10 ? new Date(Date.now() + 900000) : null,
                      },
                    });
                  }
                });
              }
              return;
            }
            const result = ctx.context.returned;
            if (!result || typeof result !== "object" || !("user" in result))
              return;
            const session = ctx.context.newSession ?? ctx.context.session;
            if (!session) throw failure();
            const db = getDb();
            try {
              await db.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT id FROM "User" WHERE id=${session.user.id} FOR UPDATE`;
                const user = await tx.user.findUnique({
                  where: { id: session.user.id },
                  include: { twoFactor: true },
                });
                const factor = user?.twoFactor;
                if (
                  !user?.active ||
                  !user.twoFactorEnabled ||
                  !factor?.verified
                )
                  throw failure();
                if (
                  factor.lockedUntil &&
                  factor.lockedUntil.getTime() > Date.now()
                )
                  throw new APIError("TOO_MANY_REQUESTS", {
                    message:
                      "Authenticator verification is temporarily locked.",
                  });
                if (ctx.path === "/two-factor/verify-totp") {
                  const digest = createHash("sha256")
                    .update(`${factor.id}:${ctx.body.code}`)
                    .digest("hex");
                  if (
                    await tx.mfaCodeUse.findFirst({
                      where: {
                        factorId: factor.id,
                        digest,
                        usedAt: { gt: new Date(Date.now() - 120000) },
                      },
                    })
                  )
                    throw failure();
                  await tx.mfaCodeUse.create({
                    data: { factorId: factor.id, digest },
                  });
                }
                await tx.session.update({
                  where: { id: session.session.id },
                  data: { mfaVerifiedAt: new Date() },
                });
                await tx.twoFactor.update({
                  where: { id: factor.id },
                  data: { failedVerificationCount: 0, lockedUntil: null },
                });
                const old = await tx.session.findMany({
                  where: {
                    userId: user.id,
                    id: { not: session.session.id },
                    mfaVerifiedAt: null,
                  },
                  select: { id: true },
                });
                await tx.session.deleteMany({
                  where: { id: { in: old.map((s) => s.id) } },
                });
                for (const s of old)
                  await recordAudit(
                    {
                      actorId: user.id,
                      action: "SESSION_REVOKED",
                      entityType: "Session",
                      entityId: s.id,
                      reason:
                        "Unverified session revoked after MFA verification.",
                    },
                    tx,
                  );
                await recordAudit(
                  {
                    actorId: user.id,
                    action: "MFA_VERIFIED",
                    entityType: "Session",
                    entityId: session.session.id,
                    reason: ctx.path.endsWith("verify-totp")
                      ? "Authenticator verified."
                      : "Single-use recovery code verified.",
                  },
                  tx,
                );
              });
            } catch (error) {
              // A session created before an after-hook failure must never remain usable.
              if (ctx.context.newSession)
                await db.session.deleteMany({
                  where: { id: session.session.id },
                });
              throw error;
            }
          }),
        },
      ],
    },
  };
}
