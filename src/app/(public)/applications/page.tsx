import Link from "next/link";
import { getApplications } from "@/modules/catalogue/service";
import { PageIntro, EmptyState } from "@/components/public/shared";
import { pageMetadata } from "@/modules/catalogue/seo";
export function generateMetadata() {
  return pageMetadata(
    "Verified Applications",
    "Explore adhesive applications supported by approved product information.",
    "/applications",
  );
}
export default async function ApplicationsPage() {
  const products = await getApplications();
  const uses = [...new Set(products.flatMap((p) => p.applications))].sort();
  return (
    <main id="main" className="container pb-20">
      <PageIntro
        eyebrow="APPLICATIONS & INDUSTRIES"
        title="Know what works together."
      >
        Only applications supported by approved product information are listed.
        Confirm suitability for your specific materials and conditions.
      </PageIntro>
      {uses.length ? (
        <div className="product-grid">
          {uses.map((use) => (
            <section className="info-panel" key={use}>
              <h2 className="text-2xl font-semibold">{use}</h2>
              <ul className="mt-5 space-y-4">
                {products
                  .filter((p) => p.applications.includes(use))
                  .map((p) => (
                    <li key={p.id}>
                      <Link className="text-link" href={`/products/${p.slug}`}>
                        {p.name} →
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState>
          <h2 className="text-xl font-semibold">
            Verified applications are being prepared.
          </h2>
          <p className="my-4">
            Share your intended use and materials. We’ll help you request the
            supporting product information.
          </p>
          <Link className="text-link" href="/contact">
            Discuss your application →
          </Link>
        </EmptyState>
      )}
    </main>
  );
}
