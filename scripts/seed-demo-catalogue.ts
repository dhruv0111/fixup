import "dotenv/config";
import { getEnv } from "../src/config/env";
import { getDb } from "../src/server/db/client";
const env = getEnv();
const database = new URL(env.DATABASE_URL);
if (
  env.APP_ENV !== "development" ||
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  database.pathname !== "/fixup_dev"
)
  throw new Error(
    "Demo data is restricted to the local fixup_dev development database.",
  );
const db = getDb();
try {
  const category = await db.category.upsert({
    where: { slug: "development-preview" },
    create: {
      slug: "development-preview",
      name: "Development preview",
      description: "Illustrative catalogue records, not real products.",
      isDemo: true,
    },
    update: {},
  });
  for (const [index, name] of [
    "Adhesive sample 01",
    "Adhesive sample 02",
    "Adhesive sample 03",
  ].entries()) {
    await db.product.upsert({
      where: { slug: `demo-adhesive-${index + 1}` },
      create: {
        name,
        slug: `demo-adhesive-${index + 1}`,
        sku: `DEMO-00${index + 1}`,
        brand: "Demonstration only",
        packSize: "Pack details pending",
        summary:
          "Development sample. Actual product, brand and pack information await approval.",
        description:
          "This is a clearly marked development record for previewing the catalogue and enquiry flow. It is not a real product, offer or technical recommendation. Replace it with approved supplier information before launch.",
        categoryId: category.id,
        isDemo: true,
        published: true,
        contentApproved: true,
        approvalReference:
          "Development preview only; not approval of real product claims.",
        featured: true,
      },
      update: {},
    });
  }
  console.log(
    "Three labelled development samples are available. Existing records were preserved. Production queries exclude demos.",
  );
} finally {
  await db.$disconnect();
}
