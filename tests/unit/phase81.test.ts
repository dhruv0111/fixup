import { test } from "node:test";
import assert from "node:assert/strict";
import { databaseOptions } from "../../src/server/db/security";

test("remote production database requires full TLS verification and refuses URL overrides", () => {
  for (const suffix of [
    "",
    "?sslmode=disable",
    "?sslmode=require",
    "?sslmode=prefer",
  ])
    assert.throws(
      () =>
        databaseOptions(
          `postgresql://dummy:dummy@db.example/fixup${suffix}`,
          true,
        ),
      /certificate-validating/,
    );
  assert.throws(
    () =>
      databaseOptions(
        "postgresql://dummy:dummy@db.example/fixup?sslmode=verify-full&ssl=false",
        true,
      ),
    /dedicated/,
  );
  const options = databaseOptions(
    "postgresql://dummy:dummy@db.example/fixup?sslmode=verify-full",
    true,
  );
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(
    new URL(options.connectionString!).searchParams.has("sslmode"),
    false,
  );
});
test("isolated loopback and development DB connectivity remain available without remote TLS", () => {
  const url = "postgresql://dummy:dummy@127.0.0.1/fixup_unit_test";
  assert.deepEqual(databaseOptions(url, true), { connectionString: url });
  assert.deepEqual(
    databaseOptions("postgresql://dummy:dummy@db.example/fixup", false),
    { connectionString: "postgresql://dummy:dummy@db.example/fixup" },
  );
});

test("production cannot disguise a remote target behind a loopback URL query", () => {
  for (const key of [
    "host",
    "hostaddr",
    "port",
    "options",
    "ssl",
    "sslrootcert",
    "sslkey",
    "uselibpqcompat",
  ])
    assert.throws(
      () =>
        databaseOptions(
          `postgresql://dummy:dummy@127.0.0.1/fixup?${key}=remote.example`,
          true,
        ),
      /overrides/,
    );
});
