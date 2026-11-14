import { randomBytes } from "node:crypto";
import pg from "pg";

// Creates no identities or business records. Only this run's random DB role is removed.
export async function testRuntimeRole(source: string, readOnly = true) {
  const url = new URL(source);
  if (
    [...url.searchParams.keys()].some((key) =>
      [
        "host",
        "hostaddr",
        "port",
        "user",
        "password",
        "dbname",
        "database",
        "service",
        "options",
      ].includes(key),
    )
  )
    throw new Error("Test database target overrides are forbidden.");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !/^\/fixup_[a-z_]*test$/.test(url.pathname)
  )
    throw new Error(
      "Runtime-role drill requires an isolated loopback test database.",
    );
  const admin = new pg.Client({ connectionString: source });
  await admin.connect();
  const name = `fixup_qa_runtime_${randomBytes(10).toString("hex")}`;
  const password = randomBytes(32).toString("hex");
  const ident = `"${name}"`;
  let created = false;
  async function cleanup() {
    try {
      if (created) {
        await admin.query(
          `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${ident}`,
        );
        await admin.query(
          `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${ident}`,
        );
        await admin.query(
          `REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${ident}`,
        );
        await admin.query(`DROP ROLE ${ident}`);
        created = false;
      }
    } finally {
      await admin.end();
    }
  }
  try {
    await admin.query(
      `CREATE ROLE ${ident} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    created = true;
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${ident}`);
    await admin.query(
      `GRANT ${readOnly ? "SELECT" : "SELECT,INSERT,UPDATE,DELETE"} ON ALL TABLES IN SCHEMA public TO ${ident}`,
    );
    if (!readOnly)
      await admin.query(
        `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ident}`,
      );
    url.username = name;
    url.password = password;
    return { url: url.toString(), cleanup };
  } catch {
    await cleanup();
    throw new Error("Isolated runtime-role setup failed; details suppressed.");
  }
}
