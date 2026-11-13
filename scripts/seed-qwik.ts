import "dotenv/config";
import { getEnv } from "../src/config/env";
import { getDb } from "../src/server/db/client";
import { seedQwik } from "../src/modules/catalogue/qwik";
const env = getEnv();
const url = new URL(env.DATABASE_URL);
if (
  env.APP_ENV !== "development" ||
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/fixup_dev"
)
  throw new Error("QWIK setup is restricted to local development.");
const db = getDb();
try {
  await seedQwik(db);
  console.log(
    "QWIK parent and four variants prepared. Existing edits preserved; SKU, confirmed MRP and selling prices remain unset.",
  );
} finally {
  await db.$disconnect();
}
