import "dotenv/config";
import { getDb } from "../src/server/db/client";
import { expireReservations } from "../src/modules/sales/orders";
if (!process.argv.includes("--confirm-expire")) {
  console.error(
    "Usage: npm run orders:expire -- --confirm-expire (up to 100 orders; repeat until zero). Requires trusted server database credentials.",
  );
  process.exitCode = 1;
} else {
  try {
    console.log(JSON.stringify(await expireReservations(null, true)));
  } finally {
    await getDb().$disconnect();
  }
}
