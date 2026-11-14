import { readFileSync } from "node:fs";
import type { Pool, PoolConfig } from "pg";

export function databaseOptions(
  databaseUrl: string,
  production: boolean,
  caFile?: string,
): PoolConfig {
  const url = new URL(databaseUrl);
  if (production) {
    for (const key of url.searchParams.keys()) {
      if (!["sslmode", "application_name", "connect_timeout"].includes(key))
        throw new Error(
          "Use the dedicated production database TLS configuration; connection target overrides are forbidden.",
        );
    }
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!production || loopback) return { connectionString: databaseUrl };
  if (url.searchParams.get("sslmode") !== "verify-full")
    throw new Error(
      "Production remote database requires certificate-validating TLS (sslmode=verify-full).",
    );
  for (const key of [
    "ssl",
    "sslrootcert",
    "sslcert",
    "sslkey",
    "uselibpqcompat",
  ]) {
    if (url.searchParams.has(key))
      throw new Error(
        "Use the dedicated production database TLS configuration.",
      );
  }
  url.searchParams.delete("sslmode");
  return {
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: true,
      ...(caFile ? { ca: readFileSync(caFile, "utf8") } : {}),
    },
  };
}

export async function assertRuntimeDatabaseRole(pool: Pick<Pool, "query">) {
  const result = await pool.query<{ unsafe: boolean }>(`
    SELECT (
      EXISTS(SELECT 1 FROM pg_roles r WHERE pg_has_role(current_user,r.oid,'MEMBER')
        AND (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls OR r.rolname ~ '^pg_'))
      OR has_schema_privilege(current_user,'public','CREATE')
      OR has_database_privilege(current_user,current_database(),'CREATE')
      OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND pg_has_role(current_user,c.relowner,'MEMBER'))
    ) AS unsafe`);
  if (result.rows.length !== 1 || result.rows[0].unsafe)
    throw new Error(
      "Production database role is privileged. Use a separate least-privilege runtime role.",
    );
}
