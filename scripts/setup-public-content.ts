import "dotenv/config";
import { readFileSync } from "node:fs";
import { getEnv } from "../src/config/env";
import { getDb } from "../src/server/db/client";
import { websiteSchema } from "../src/modules/catalogue/validation";
import { policyDrafts } from "../src/modules/catalogue/content";

const env = getEnv();
const database = new URL(env.DATABASE_URL);
if (
  env.APP_ENV !== "development" ||
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  database.pathname !== "/fixup_dev"
)
  throw new Error(
    "Content bootstrap requires the local fixup_dev development database.",
  );
if (!process.argv[2])
  throw new Error(
    "Supply a JSON file containing owner-provided website settings.",
  );
const settings = websiteSchema.parse(
  JSON.parse(readFileSync(process.argv[2], "utf8").replace(/^\uFEFF/, "")),
);
const db = getDb();
try {
  await db.$transaction(async (tx) => {
    // Initial content only: subsequent runs preserve owner edits and approval states.
    await tx.websiteContent.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...settings },
      update: {},
    });
    for (const [id, policy] of Object.entries(policyDrafts))
      await tx.policy.upsert({
        where: { id },
        create: { id, ...policy },
        update: {},
      });
    const faqs = [
      [
        "enquiries",
        "How do I enquire about a product?",
        "Open a product page and choose Enquire about this product. You can also use our contact form or the configured WhatsApp link.",
      ],
      [
        "dealers",
        "How can my shop apply to become a dealer?",
        "Complete the Become a Dealer form with your business and contact details. Submitting an application does not grant dealer access or confirm commercial terms.",
      ],
      [
        "bulk",
        "Can I discuss a bulk requirement?",
        "Use the Bulk Orders form for a published product, or contact FIXUP to discuss your required product, quantity and location.",
      ],
      [
        "documents",
        "Where can I find technical product information?",
        "Product pages show approved specifications and public TDS/SDS documents when available. Ask FIXUP for supporting documentation before deciding on suitability.",
      ],
    ];
    for (const [index, [id, question, answer]] of faqs.entries())
      await tx.faq.upsert({
        where: { id: `initial-${id}` },
        create: {
          id: `initial-${id}`,
          question,
          answer,
          published: true,
          sortOrder: index,
        },
        update: {},
      });
  });
  console.log(
    "Initial public content is available; existing content was preserved. Policies remain draft.",
  );
} finally {
  await db.$disconnect();
}
