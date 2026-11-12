import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/config/env";

const globalDb = globalThis as unknown as { fixupDb?: PrismaClient };

export function getDb() {
  if (!globalDb.fixupDb) {
    const adapter = new PrismaPg({
      connectionString: getEnv().DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
    globalDb.fixupDb = new PrismaClient({ adapter, log: [] });
  }
  return globalDb.fixupDb;
}
