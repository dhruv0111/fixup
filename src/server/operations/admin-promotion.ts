import { getDb } from "@/server/db/client";
import { recordAudit } from "@/server/audit/service";

export type PromotionRequest = {
  email: string;
  reason: string;
  production?: boolean;
  operator?: string;
  confirmUser?: string;
};
export type OperatorEnvironment = {
  appEnv: string;
  databaseUrl: string;
  productionEnabled: boolean;
};

export function validatePromotionRequest(
  request: PromotionRequest,
  environment: OperatorEnvironment,
) {
  if (
    !request.email ||
    request.reason.trim().length < 5 ||
    request.reason.length > 350
  )
    throw new Error(
      "An existing email and a reason of 5–350 characters are required.",
    );
  if (environment.appEnv === "production") {
    if (
      !environment.productionEnabled ||
      !request.production ||
      !request.confirmUser ||
      !/^[a-zA-Z0-9._:@-]{3,100}$/.test(request.operator ?? "")
    ) {
      throw new Error(
        "Production promotion requires the controlled operator procedure: explicit enablement, --production, --operator and --confirm-user.",
      );
    }
  } else {
    const url = new URL(environment.databaseUrl);
    if (
      !["development", "test"].includes(environment.appEnv) ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !/^\/fixup_(dev|[a-z_]*test)$/.test(url.pathname) ||
      request.production
    ) {
      throw new Error(
        "Local promotion is restricted to named loopback FIXUP development/test databases.",
      );
    }
  }
}

// Trusted operator service only. There is intentionally no HTTP entrypoint.
export async function promoteOwner(
  request: PromotionRequest,
  environment: OperatorEnvironment,
  db = getDb(),
) {
  validatePromotionRequest(request, environment);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE email = ${request.email.trim().toLowerCase()} FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { email: request.email.trim().toLowerCase() },
    });
    if (!user?.active)
      throw new Error(
        "An active, registered account is required. No account was created.",
      );
    if (
      environment.appEnv === "production" &&
      (!user.emailVerified || user.id !== request.confirmUser)
    )
      throw new Error(
        "Production promotion requires verified email and the exact confirmed user ID.",
      );
    if (
      environment.appEnv === "production" &&
      (!user.twoFactorEnabled ||
        !(await tx.twoFactor.findUnique({ where: { userId: user.id } }))
          ?.verified)
    )
      throw new Error(
        "Production promotion requires verified authenticator enrollment.",
      );
    if (user.role === "SUPER_ADMIN") return false;
    await tx.user.update({
      where: { id: user.id },
      data: { role: "SUPER_ADMIN" },
    });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await recordAudit(
      {
        actorId: null,
        action: "ROLE_CHANGED",
        entityType: "User",
        entityId: user.id,
        reason: `Operator ${request.operator ?? "local-shell"}: ${request.reason}`,
      },
      tx,
    );
    return true;
  });
}
