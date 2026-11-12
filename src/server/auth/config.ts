import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/config/env";
import { recordAudit } from "@/server/audit/service";
import { sendPasswordRecovery } from "@/server/email/service";

function createAuth() {
  const env = getEnv();
  const db = getDb();
  return betterAuth({
    appName: "FIXUP",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    logger: {
      level: "error",
      log(level) {
        console.error(JSON.stringify({ event: "auth_library_error", level }));
      },
    },
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: 1800,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordRecovery(user.email, url);
      },
      onPasswordReset: async ({ user }) => {
        await recordAudit({
          actorId: user.id,
          action: "PASSWORD_RESET",
          entityType: "User",
          entityId: user.id,
        });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    verification: { storeIdentifier: "hashed" },
    user: {
      additionalFields: {
        role: {
          type: ["CUSTOMER", "DEALER", "SALES_REP", "ADMIN", "SUPER_ADMIN"],
          defaultValue: "CUSTOMER",
          input: false,
        },
        active: { type: "boolean", defaultValue: true, input: false },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: "fixup",
      useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      ipAddress: { ipAddressHeaders: ["x-fixup-client-ip"] },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const name = user.name.trim();
            if (name.length < 2 || name.length > 100)
              throw new APIError("BAD_REQUEST", {
                message: "Name must contain 2–100 characters.",
              });
            return {
              data: {
                ...user,
                name,
                email: user.email.trim().toLowerCase(),
                role: "CUSTOMER" as const,
                active: true,
              },
            };
          },
          after: async (user) => {
            await db.$transaction(async (tx) => {
              await tx.customer.upsert({
                where: { userId: user.id },
                create: { userId: user.id },
                update: {},
              });
              await recordAudit(
                {
                  actorId: user.id,
                  action: "USER_REGISTERED",
                  entityType: "User",
                  entityId: user.id,
                },
                tx,
              );
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await db.user.findUnique({
              where: { id: session.userId },
              select: { active: true },
            });
            // A newly registered user may still be inside the adapter's transaction.
            // Its FK is enforced by PostgreSQL; existing disabled accounts are rejected.
            if (user && !user.active)
              throw new APIError("FORBIDDEN", {
                message: "Account access is unavailable.",
              });
          },
          after: async (session) => {
            await recordAudit({
              actorId: session.userId,
              action: "SESSION_CREATED",
              entityType: "Session",
              entityId: session.id,
            });
          },
        },
        delete: {
          after: async (session, context) => {
            await recordAudit({
              actorId: session.userId,
              action:
                context?.path === "/sign-out"
                  ? "USER_LOGGED_OUT"
                  : "SESSION_REVOKED",
              entityType: "Session",
              entityId: session.id,
            });
          },
        },
      },
    },
    // Only expose the authentication operations required by Phase 1.
    disabledPaths: [
      "/update-user",
      "/delete-user",
      "/change-email",
      "/link-social",
      "/unlink-account",
      "/sign-in/social",
    ],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  instance ??= createAuth();
  return instance;
}
