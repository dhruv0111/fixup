import { getDb } from "@/server/db/client";
import { recordAudit } from "@/server/audit/service";

export class ProfileProvisioningError extends Error {
  constructor() {
    super("Account setup is temporarily unavailable. Please retry shortly.");
  }
}

// No request input is accepted. Call only after authentication, from the registration
// hook, or through the trusted operator CLI. Existing business/customer data is preserved.
export async function ensureCustomerProfile(userId: string, db = getDb()) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          // One lock per identity prevents concurrent retries from duplicating the audit.
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { active: true, profileProvisionedAt: true },
          });
          if (!user?.active) throw new ProfileProvisioningError();
          const customer = await tx.customer.upsert({
            where: { userId },
            create: { userId },
            update: {},
          });
          if (!user.profileProvisionedAt) {
            const recorded = await tx.auditLog.findFirst({
              where: {
                action: "USER_REGISTERED",
                entityType: "User",
                entityId: userId,
              },
              select: { id: true },
            });
            if (!recorded)
              await recordAudit(
                {
                  actorId: userId,
                  action: "USER_REGISTERED",
                  entityType: "User",
                  entityId: userId,
                },
                tx,
              );
            await tx.user.update({
              where: { id: userId },
              data: { profileProvisionedAt: new Date() },
            });
          }
          return customer;
        },
        { maxWait: 5000, timeout: 10000 },
      );
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "UNKNOWN";
      // Only codes we explicitly recognise are logged; never exception messages,
      // credentials, email, SQL, connection strings or request bodies.
      const transient = ["P2034", "P2002", "P2024"].includes(code);
      if (transient && attempt < 3) continue;
      console.error(
        JSON.stringify({
          event: "customer_provisioning_failed",
          userId,
          attempt,
          category: transient
            ? "TRANSIENT_DATABASE_FAILURE"
            : "PROVISIONING_UNAVAILABLE",
        }),
      );
      throw new ProfileProvisioningError();
    }
  }
  throw new ProfileProvisioningError();
}

export async function provisionAfterRegistration(userId: string) {
  try {
    await ensureCustomerProfile(userId);
  } catch (error) {
    // The identity/credential transaction has already committed. Preserve its successful
    // response; the durable null marker is retried on authenticated access or by the CLI.
    if (!(error instanceof ProfileProvisioningError)) throw error;
  }
}
