import { randomBytes, createHash } from "node:crypto";
import {
  mkdirSync,
  chmodSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { loadTestEnvironment } from "./lib/test-environment.mjs";

// Never accepts a database name or dump path from the caller. Existing databases
// cannot be overwritten. All destructive cleanup is limited to this run's new DBs.
process.umask(0o077);
const config = loadTestEnvironment();
const sourceUrl = new URL(config.DATABASE_URL);
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";
const suffix = randomBytes(8).toString("hex");
const restoreName = `fixup_restore_${suffix}_test`;
const migrateName = `fixup_migration_${suffix}_test`;
const directory = resolve(".local", "backup-checks", suffix);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const dump = resolve(directory, "test-database.dump");
const admin = new pg.Client({ connectionString: adminUrl.toString() });
const source = new pg.Client({ connectionString: sourceUrl.toString() });
const created = [];
const clients = [];
const started = Date.now();

function urlFor(name) {
  const value = new URL(sourceUrl);
  value.pathname = `/${name}`;
  return value.toString();
}
function pgEnv(database) {
  return {
    ...process.env,
    PGHOST: sourceUrl.hostname,
    PGPORT: sourceUrl.port || "5432",
    PGUSER: decodeURIComponent(sourceUrl.username),
    PGPASSWORD: decodeURIComponent(sourceUrl.password),
    PGDATABASE: database,
  };
}
function run(binary, args, env) {
  const result = spawnSync(binary, args, {
    env,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error)
    throw new Error(
      `${binary} failed; diagnostic details suppressed to protect credentials and dump contents.`,
    );
  return result.stdout;
}
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const identifier = (value) => `"${value.replaceAll('"', '""')}"`;

async function schemaFingerprint(client) {
  const columns = await client.query(
    "SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default,character_maximum_length,datetime_precision FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
  );
  const enums = await client.query(
    "SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder",
  );
  const constraints = await client.query(
    `SELECT c.relname, p.conname, pg_get_constraintdef(p.oid) AS definition FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname, p.conname`,
  );
  const indexes = await client.query(
    "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
  );
  const triggers = await client.query(
    "SELECT event_object_table,trigger_name,event_manipulation,action_timing,action_statement FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY event_object_table,trigger_name,event_manipulation",
  );
  const routines = await client.query(
    "SELECT proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY proname",
  );
  return hash({
    columns: columns.rows,
    enums: enums.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    triggers: triggers.rows,
    routines: routines.rows,
  });
}
async function dataFingerprint(client) {
  const tables = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  const result = {};
  for (const { tablename } of tables.rows) {
    const rows = await client.query(
      `SELECT to_jsonb(t) AS row FROM ${identifier(tablename)} t ORDER BY id`,
    );
    result[tablename] = { count: rows.rowCount, sha256: hash(rows.rows) };
  }
  return result;
}

try {
  await admin.connect();
  await source.connect();
  const sourceName = decodeURIComponent(sourceUrl.pathname.slice(1));
  const unwanted = await source.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE '\\_test%' ESCAPE '\\'",
  );
  if (unwanted.rowCount)
    throw new Error(
      "Remove test fault-injection artifacts before the backup check.",
    );
  await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const snapshot = (
    await source.query("SELECT pg_export_snapshot() AS snapshot")
  ).rows[0].snapshot;
  const expectedData = await dataFingerprint(source);
  const expectedSchema = await schemaFingerprint(source);
  // Use the same database snapshot for fingerprinting and the backup itself.
  run(
    "pg_dump",
    [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      `--snapshot=${snapshot}`,
      `--file=${dump}`,
    ],
    pgEnv(sourceName),
  );
  chmodSync(dump, 0o600);
  await source.query("COMMIT");
  for (const name of [restoreName, migrateName]) {
    await admin.query(`CREATE DATABASE ${identifier(name)}`);
    created.push(name);
  }
  run(
    "pg_restore",
    [
      "--exit-on-error",
      "--single-transaction",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      restoreName,
      dump,
    ],
    pgEnv(restoreName),
  );
  const restored = new pg.Client({ connectionString: urlFor(restoreName) });
  clients.push(restored);
  await restored.connect();
  const restoredData = await dataFingerprint(restored);
  if (JSON.stringify(restoredData) !== JSON.stringify(expectedData))
    throw new Error(
      "Restored data fingerprints do not match the source snapshot.",
    );
  if ((await schemaFingerprint(restored)) !== expectedSchema)
    throw new Error(
      "Restored constraints, indexes, functions or triggers differ.",
    );
  console.log(
    "PASS backup/restore: every table's row count and data fingerprint matches the exported snapshot.",
  );
  console.log(
    "PASS backup/restore: constraints, indexes, functions and triggers match.",
  );

  const migrationEnv = {
    ...process.env,
    ...config,
    DATABASE_URL: urlFor(migrateName),
  };
  run(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    migrationEnv,
  );
  run(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    migrationEnv,
  );
  const fresh = new pg.Client({ connectionString: urlFor(migrateName) });
  clients.push(fresh);
  await fresh.connect();
  if ((await schemaFingerprint(fresh)) !== expectedSchema)
    throw new Error(
      "Fresh migration schema differs from the current test schema.",
    );
  const migrations = await fresh.query(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
  );
  const expectedMigrations = readdirSync("prisma/migrations", {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (
    JSON.stringify(migrations.rows.map((row) => row.migration_name)) !==
    JSON.stringify(expectedMigrations)
  )
    throw new Error(
      "Expected all committed foundation migrations on the fresh database.",
    );
  console.log(
    "PASS fresh migration replay and second deploy; schema matches the current database.",
  );

  const manifest = {
    node: process.version,
    sourceDatabase: sourceName,
    migrations: migrations.rows.map((row) => row.migration_name),
    tables: expectedData,
    schemaSha256: expectedSchema,
    archiveSha256: createHash("sha256")
      .update(readFileSync(dump))
      .digest("hex"),
    durationMs: Date.now() - started,
    restored: true,
    freshMigrationReplay: true,
  };
  writeFileSync(
    resolve(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    `Evidence saved privately under .local/backup-checks/${suffix}/. No production data was used.`,
  );
} finally {
  await source.end();
  for (const client of clients) await client.end();
  for (const name of created.reverse()) {
    if (!/^fixup_(restore|migration)_[0-9a-f]{16}_test$/.test(name))
      throw new Error("Unsafe cleanup target rejected.");
    await admin.query(`DROP DATABASE ${identifier(name)}`);
  }
  await admin.end();
}
