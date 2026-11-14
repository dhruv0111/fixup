import { loadTestEnvironment } from "./lib/test-environment.mjs";
import pg from "pg";
import dotenv from "dotenv";
import {
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";

const config = loadTestEnvironment();
const client = new pg.Client({ connectionString: config.DATABASE_URL });
const checks = {
  negativeLotBalances: `SELECT count(*)::int AS count FROM (SELECT "lotId" FROM "StockMovement" GROUP BY "lotId" HAVING sum("availableDelta")<0 OR sum("damagedDelta")<0) s`,
  overReservedVariants: `WITH stock AS (SELECT "variantId",sum("availableDelta") AS units FROM "StockMovement" GROUP BY "variantId"), reserved AS (SELECT "variantId",sum(quantity) AS units FROM "StockReservation" WHERE status='ACTIVE' GROUP BY "variantId") SELECT count(*)::int AS count FROM reserved r LEFT JOIN stock s USING ("variantId") WHERE r.units>coalesce(s.units,0)`,
  orderArithmeticMismatches: `SELECT count(*)::int AS count FROM "SalesOrder" o LEFT JOIN LATERAL (SELECT sum("linePricePaise") AS subtotal,sum("taxPaise") AS tax FROM "SalesOrderLine" l WHERE l."orderId"=o.id) l ON true WHERE o."subtotalPaise" IS DISTINCT FROM l.subtotal OR o."taxPaise" IS DISTINCT FROM l.tax OR o."totalPaise"<>o."subtotalPaise"+o."deliveryPaise"+CASE WHEN o."taxMode"='INCLUSIVE' THEN 0 ELSE o."taxPaise" END`,
  reservationHistoryMismatches: `SELECT count(*)::int AS count FROM "StockReservation" r LEFT JOIN LATERAL (SELECT sum("quantityDelta") AS units FROM "ReservationEvent" e WHERE e."reservationId"=r.id) e ON true WHERE coalesce(e.units,0)<>CASE WHEN r.status='ACTIVE' THEN r.quantity ELSE 0 END`,
  dispatchMovementMismatches: `SELECT count(*)::int AS count FROM "DispatchAllocation" a JOIN "DispatchLine" l ON l.id=a."dispatchLineId" JOIN "Dispatch" d ON d.id=l."dispatchId" LEFT JOIN LATERAL (SELECT sum("availableDelta") AS units,count(*) AS movements FROM "StockMovement" m WHERE m."dispatchAllocationId"=a.id AND m.kind='DISPATCH') m ON true WHERE d."confirmedAt" IS NOT NULL AND (m.units IS DISTINCT FROM -a.quantity::bigint OR m.movements<>1)`,
  missingCostsInformational: `SELECT count(*)::int AS count FROM "StockLot" l LEFT JOIN "LotCost" c ON c."lotId"=l.id WHERE c."lotId" IS NULL`,
};
const known = new Set();
const oldPath = ".local/phase8-audit/order-mismatch.json";
if (existsSync(oldPath)) {
  const old = JSON.parse(readFileSync(oldPath, "utf8"));
  for (const row of old.mismatches ?? [])
    if (
      old.lines?.some(
        (l) => l.orderId === row.id && l.productName === "QA unreserved line",
      )
    )
      known.add(row.id);
}
if (existsSync(".local/qa/integrity-fixtures"))
  for (const file of readdirSync(".local/qa/integrity-fixtures")) {
    const row = JSON.parse(
      readFileSync(`.local/qa/integrity-fixtures/${file}`, "utf8"),
    );
    if (
      row.source === "tests/integration/phase6.spec.ts#missing reservation" &&
      row.marker === "QA unreserved line"
    )
      known.add(row.orderId);
  }
try {
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const result = {
    at: new Date().toISOString(),
    database: "guarded loopback test database",
    checks: {},
  };
  for (const [name, query] of Object.entries(checks))
    result.checks[name] = (await client.query(query)).rows[0].count;
  const mismatches = (
    await client.query(
      `SELECT o.id, EXISTS(SELECT 1 FROM "SalesOrderLine" l WHERE l."orderId"=o.id AND l."productName"='QA unreserved line' AND l.quantity=1 AND l."linePricePaise"=100 AND NOT EXISTS(SELECT 1 FROM "StockReservation" r WHERE r."orderLineId"=l.id)) AS marker, NOT EXISTS(SELECT 1 FROM "Dispatch" d WHERE d."orderId"=o.id) AS undispatched, u.email LIKE '%@fixup.test' AS "dummyOwner" FROM "SalesOrder" o JOIN "Customer" c ON c.id=o."customerId" JOIN "User" u ON u.id=c."userId" LEFT JOIN LATERAL(SELECT sum("linePricePaise") AS subtotal,sum("taxPaise") AS tax FROM "SalesOrderLine" l WHERE l."orderId"=o.id) l ON true WHERE o."subtotalPaise" IS DISTINCT FROM l.subtotal OR o."taxPaise" IS DISTINCT FROM l.tax OR o."totalPaise"<>o."subtotalPaise"+o."deliveryPaise"+CASE WHEN o."taxMode"='INCLUSIVE' THEN 0 ELSE o."taxPaise" END`,
    )
  ).rows;
  result.orderFindings = mismatches.map((row) => ({
    id: row.id,
    classification:
      known.has(row.id) && row.marker && row.undispatched && row.dummyOwner
        ? "EXPECTED_NEGATIVE_TEST_FIXTURE"
        : "UNEXPECTED_INTEGRITY_FINDING",
  }));
  await client.query("COMMIT");
  if (existsSync(".env")) {
    const dev = dotenv.parse(readFileSync(".env"));
    const url = new URL(dev.DATABASE_URL);
    if (
      dev.APP_ENV === "development" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    ) {
      const development = new pg.Client({ connectionString: dev.DATABASE_URL });
      try {
        await development.connect();
        await development.query("BEGIN READ ONLY");
        result.fixtureRecordsInDevelopment = (
          await development.query(
            'SELECT count(*)::int AS count FROM "SalesOrder" WHERE id=ANY($1::text[])',
            [mismatches.map((r) => r.id)],
          )
        ).rows[0].count;
        await development.query("COMMIT");
      } finally {
        await development.end();
      }
    }
  }
  // Preserve the original distinction: unknown opening costs are informational,
  // never fabricated zero costs or suppressed counts. All invariants remain strict.
  result.rawScanPassed = Object.entries(result.checks).every(
    ([key, n]) => key.endsWith("Informational") || n === 0,
  );
  result.expectedFixtures = result.orderFindings.filter(
    (f) => f.classification === "EXPECTED_NEGATIVE_TEST_FIXTURE",
  ).length;
  result.unexpectedFindings =
    result.orderFindings.filter(
      (f) => f.classification !== "EXPECTED_NEGATIVE_TEST_FIXTURE",
    ).length +
    Object.entries(result.checks)
      .filter(
        ([key]) =>
          key !== "orderArithmeticMismatches" && !key.endsWith("Informational"),
      )
      .reduce((count, [, n]) => count + n, 0) +
    (result.fixtureRecordsInDevelopment ?? 0);
  mkdirSync(".local/phase81-audit", { recursive: true, mode: 0o700 });
  const path = `.local/phase81-audit/integrity-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify(result, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  console.log(JSON.stringify(result));
  console.log(`Private evidence: ${path}`);
  // Classification never suppresses an invariant: raw violations still exit 1.
  if (!result.rawScanPassed || result.fixtureRecordsInDevelopment > 0)
    process.exitCode = 1;
} catch {
  console.error(
    "Integrity audit unavailable; details suppressed to protect database credentials.",
  );
  process.exitCode = 2;
} finally {
  await client.end();
}
