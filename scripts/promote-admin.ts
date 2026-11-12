import "dotenv/config";
import { getDb } from "../src/server/db/client";
import { recordAudit } from "../src/server/audit/service";

const email = process.argv[2]?.trim().toLowerCase();
const reason = process.argv.slice(3).join(" ").trim();
if (!email || reason.length < 5)
  throw new Error(
    "Usage: npm run admin:promote -- existing-email 'reason for granting owner access'",
  );
const db = getDb();
try {
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.active)
    throw new Error(
      "An active, registered account is required. No account was created.",
    );
  await db.$transaction(async (tx) => {
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
        reason: `Local operator: ${reason}`,
      },
      tx,
    );
  });
  console.log(
    "Existing account granted SUPER_ADMIN. All existing sessions were revoked; sign in again.",
  );
} finally {
  await db.$disconnect();
}
