import "dotenv/config";
import { getDb } from "../src/server/db/client";

const db = getDb();
try {
  await db.$queryRaw`SELECT 1`;
  console.log("PostgreSQL connection successful.");
} catch {
  console.error(
    "PostgreSQL health check failed. Check local configuration; credentials were not logged.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
