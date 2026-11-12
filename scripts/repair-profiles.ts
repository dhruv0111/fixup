import "dotenv/config";
import { parseArgs } from "node:util";
import { getDb } from "../src/server/db/client";
import { ensureCustomerProfile } from "../src/modules/identity/provisioning";

const { values } = parseArgs({
  options: { limit: { type: "string", default: "100" } },
});
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
  throw new Error("--limit must be between 1 and 1000.");
let db: ReturnType<typeof getDb> | undefined;
try {
  db = getDb();
  const users = await db.user.findMany({
    where: {
      active: true,
      OR: [{ profileProvisionedAt: null }, { customer: null }],
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: limit,
  });
  let failed = 0;
  for (const user of users) {
    try {
      await ensureCustomerProfile(user.id, db);
    } catch {
      failed++;
    }
  }
  console.log(
    JSON.stringify({
      event: "profile_repair_completed",
      attempted: users.length,
      recovered: users.length - failed,
      failed,
    }),
  );
  if (failed) process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ event: "profile_repair_unavailable" }));
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
