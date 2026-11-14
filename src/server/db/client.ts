import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/config/env";
import { assertRuntimeDatabaseRole, databaseOptions } from "./security";

class RuntimePrismaPg extends PrismaPg {
  async connect() {
    const adapter = await super.connect().catch(() => {
      throw new Error("Production database connection failed.");
    });
    try {
      await assertRuntimeDatabaseRole(adapter.underlyingDriver());
    } catch {
      await adapter.dispose();
      throw new Error("Production runtime database privilege check failed.");
    }
    return adapter;
  }
}

export function createDatabaseClient(operator = false) {
  const env = getEnv();
  if (
    operator &&
    (env.APP_ENV !== "production" ||
      process.env.FIXUP_ALLOW_PRIVILEGED_OPERATIONS !== "1")
  )
    throw new Error("Controlled production operator access is required.");
  const Adapter =
    env.APP_ENV === "production" && !operator ? RuntimePrismaPg : PrismaPg;
  return new PrismaClient({
    adapter: new Adapter({
      ...databaseOptions(
        env.DATABASE_URL,
        env.APP_ENV === "production",
        env.DATABASE_SSL_CA_FILE,
      ),
      options: "-c timezone=UTC",
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    }),
    log: [],
  });
}

const globalDb = globalThis as unknown as { fixupDb?: PrismaClient };

export function getDb() {
  if (!globalDb.fixupDb) {
    globalDb.fixupDb = createDatabaseClient();
  }
  return globalDb.fixupDb;
}
