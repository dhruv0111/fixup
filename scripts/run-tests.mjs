import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

if (!existsSync(".env.test"))
  throw new Error(
    "Create .env.test using npm run setup:local, or configure an isolated test database as described in README.md.",
  );
const testEnv = dotenv.parse(readFileSync(".env.test"));
const database = new URL(testEnv.DATABASE_URL);
const origin = new URL(testEnv.BETTER_AUTH_URL);
if (
  !/^\/fixup_[a-z_]*test$/.test(database.pathname) ||
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  testEnv.APP_ENV !== "test"
) {
  throw new Error(
    "Tests require APP_ENV=test and a loopback PostgreSQL database named fixup_*test. Refusing non-test data.",
  );
}
if (origin.origin !== "http://127.0.0.1:3100")
  throw new Error("Tests require BETTER_AUTH_URL=http://127.0.0.1:3100.");
const env = {
  ...process.env,
  ...testEnv,
  TRUSTED_IP_HEADER: "x-test-client-ip",
  NEXT_TELEMETRY_DISABLED: "1",
};

function run(args) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(["node_modules/prisma/build/index.js", "generate"]);
run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
run(["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)]);
