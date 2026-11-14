import assert from "node:assert/strict";
import {
  getPublicProduct,
  listProducts,
  listCategories,
} from "../src/modules/catalogue/service";
import { getDb } from "../src/server/db/client";
import { testRuntimeRole } from "./lib/test-runtime-role";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.APP_ENV !== "production" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !/^\/fixup_[a-z_]*test$/.test(url.pathname)
)
  throw new Error(
    "Production catalogue probe requires an isolated loopback test database.",
  );
const runtime = await testRuntimeRole(url.toString());
process.env.DATABASE_URL = runtime.url;
try {
  const demo = await getDb().product.findFirstOrThrow({
    where: { isDemo: true, published: true, active: true },
  });
  assert.equal(await getPublicProduct(demo.slug), null);
  assert.ok((await listProducts()).products.every((p) => !p.isDemo));
  assert.ok((await listCategories()).every((c) => !c.isDemo));
  console.log("Production catalogue excludes demo products and categories.");
} finally {
  await getDb().$disconnect();
  await runtime.cleanup();
}
