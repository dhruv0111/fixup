import { spawnSync } from "node:child_process";
import { loadTestEnvironment } from "./lib/test-environment.mjs";
const env = { ...process.env, ...loadTestEnvironment() };
const result = spawnSync(
  process.execPath,
  [
    "--conditions=react-server",
    "--import",
    "tsx",
    "scripts/check-privileged-auth.ts",
  ],
  { env, stdio: "inherit" },
);
if (result.status !== 0) process.exitCode = result.status ?? 1;
