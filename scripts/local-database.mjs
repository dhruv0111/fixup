import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const root = process.cwd();
const local = resolve(root, ".local");
const data = resolve(local, "postgres");
const port = "55432";
const command = process.argv[2] ?? "start";
mkdirSync(local, { recursive: true, mode: 0o700 });

function run(binary, args, env = process.env, allowFailure = false) {
  const result = spawnSync(binary, args, { env, encoding: "utf8" });
  if (result.error)
    throw new Error(`${binary} is required on PATH: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${binary} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

if (command === "stop") {
  if (existsSync(resolve(data, "PG_VERSION")))
    run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  console.log("Local FIXUP PostgreSQL stopped.");
  process.exit(0);
}

const passwordFile = resolve(local, "postgres-password");
if (!existsSync(passwordFile)) {
  writeFileSync(passwordFile, randomBytes(32).toString("hex"), {
    mode: 0o600,
    flag: "wx",
  });
}
const password = readFileSync(passwordFile, "utf8").trim();
if (!existsSync(resolve(data, "PG_VERSION"))) {
  run("initdb", [
    "-D",
    data,
    "--username=fixup",
    `--pwfile=${passwordFile}`,
    "--auth=scram-sha-256",
    "--encoding=UTF8",
    "--locale=C",
  ]);
}
const running =
  run("pg_ctl", ["-D", data, "status"], process.env, true).status === 0;
if (!running) {
  run("pg_ctl", [
    "-D",
    data,
    "-l",
    resolve(local, "postgres.log"),
    "-o",
    `-h 127.0.0.1 -p ${port} -k ${local}`,
    "-w",
    "start",
  ]);
}
const pgEnv = { ...process.env, PGPASSWORD: password };
for (const database of ["fixup_dev", "fixup_test"]) {
  const present = run(
    "psql",
    [
      "-h",
      "127.0.0.1",
      "-p",
      port,
      "-U",
      "fixup",
      "-d",
      "postgres",
      "-tAc",
      `SELECT 1 FROM pg_database WHERE datname = '${database}'`,
    ],
    pgEnv,
  );
  if (present.stdout.trim() !== "1")
    run(
      "createdb",
      ["-h", "127.0.0.1", "-p", port, "-U", "fixup", database],
      pgEnv,
    );
}

if (command === "setup") {
  for (const [file, database, appPort, appEnv] of [
    [".env", "fixup_dev", 3000, "development"],
    [".env.test", "fixup_test", 3100, "test"],
  ]) {
    const target = resolve(root, file);
    if (existsSync(target)) {
      const existing = dotenv.parse(readFileSync(target));
      if (!existing.DATABASE_URL?.endsWith(`/${database}`)) {
        throw new Error(
          `${file} already exists with different configuration. It was preserved; inspect it manually.`,
        );
      }
      console.log(`${file} already exists; preserved.`);
      continue;
    }
    const content = [
      `DATABASE_URL=postgresql://fixup:${password}@127.0.0.1:${port}/${database}`,
      `BETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}`,
      `BETTER_AUTH_URL=http://127.0.0.1:${appPort}`,
      `APP_ENV=${appEnv}`,
      "MAIL_MODE=file",
      "MAIL_FROM=FIXUP <noreply@example.invalid>",
      "NEXT_TELEMETRY_DISABLED=1",
      "",
    ].join("\n");
    writeFileSync(target, content, { mode: 0o600, flag: "wx" });
    console.log(`Created ${file} with generated local-only credentials.`);
  }
}
console.log(
  `Local PostgreSQL is ready at 127.0.0.1:${port}. No credentials were printed.`,
);
