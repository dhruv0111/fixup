import "dotenv/config";
import { parseArgs } from "node:util";
import { getDb } from "../src/server/db/client";
import {
  promoteOwner,
  validatePromotionRequest,
} from "../src/server/operations/admin-promotion";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    production: { type: "boolean" },
    operator: { type: "string" },
    "confirm-user": { type: "string" },
  },
});
const request = {
  email: positionals[0] ?? "",
  reason: positionals.slice(1).join(" ").trim(),
  production: values.production,
  operator: values.operator,
  confirmUser: values["confirm-user"],
};
const environment = {
  appEnv: process.env.APP_ENV ?? "development",
  databaseUrl: process.env.DATABASE_URL ?? "",
  productionEnabled: process.env.FIXUP_ALLOW_PRIVILEGED_OPERATIONS === "1",
};
let db: ReturnType<typeof getDb> | undefined;
try {
  validatePromotionRequest(request, environment);
  db = getDb();
  const changed = await promoteOwner(request, environment, db);
  console.log(
    changed
      ? "Existing account granted SUPER_ADMIN. All existing sessions were revoked; sign in again."
      : "Account is already SUPER_ADMIN; no change made.",
  );
} catch {
  // No raw DB errors or connection details in an operational log.
  console.error(
    "Administrator promotion refused or failed. Check the operator procedure, target eligibility and database configuration; no credentials were logged.",
  );
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
