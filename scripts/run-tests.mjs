import { spawnSync } from "node:child_process";
import { loadTestEnvironment } from "./lib/test-environment.mjs";

const testEnv = loadTestEnvironment();
const origin = new URL(testEnv.BETTER_AUTH_URL);
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
