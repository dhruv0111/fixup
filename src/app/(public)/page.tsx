import Link from "next/link";
import {
  featuredProducts,
  listCategories,
  getApplications,
} from "@/modules/catalogue/service";
import { ProductGrid } from "@/components/public/shared";
import { pageMetadata } from "@/modules/catalogue/seo";
export function generateMetadata() {
  return pageMetadata(
    "Adhesives & Bonding Solutions",
    "Meet FIXUP. Explore adhesive products, discuss bulk requirements and join our dealer network.",
    "/",
  );
}
export default async function HomePage() {
  const [products, categories, applications] = await Promise.all([
    featuredProducts(),
    listCategories(),
    getApplications(),
  ]);
  const uses = [...new Set(applications.flatMap((p) => p.applications))].slice(
    0,
    6,
  );
  return (
    <main id="main">
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">THE RIGHT CONNECTION STARTS HERE</p>
            <h1>
              Strong Bond.
              <br />
              <span>Lasting Trust.</span>
            </h1>
            <p className="hero-copy">
              Adhesives for the work ahead.
              <br />
              Sourced from manufacturers and suppliers. Brought to you by FIXUP.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="button" href="/products">
                Explore products <span aria-hidden="true">↗</span>
              </Link>
              <Link className="button button-secondary" href="/contact">
                Let’s talk
              </Link>
            </div>
            <p className="mt-7 text-xs text-muted">
              For hardware shops, retailers, wholesalers & individual customers.
            </p>
          </div>
          <div className="bond-art" aria-hidden="true">
            <div className="art-grid" />
            <span className="art-caption">FIXUP / BUILT ON CONNECTION</span>
            <div className="bond-piece piece-one" />
            <div className="bond-piece piece-two" />
            <div className="art-bottom">
              <span>01 — SOURCE</span>
              <span>02 — CONNECT</span>
              <span>03 — SUPPLY</span>
            </div>
          </div>
        </div>
      </section>
      <div className="audience-strip">
        <div className="container flex flex-wrap justify-between gap-4 py-5">
          <span>LOCAL CONNECTIONS.</span>
          <span>RETAIL ENQUIRIES</span>
          <span>DEALER PARTNERSHIPS</span>
          <span>BULK REQUIREMENTS</span>
        </div>
      </div>
      <section className="container section-space grid gap-8 md:grid-cols-[1fr_1.5fr]">
        <p className="eyebrow">MEET FIXUP</p>
        <div>
          <h2 className="section-title">Your work. Our connection.</h2>
          <p className="body-copy">
            FIXUP is an adhesive trading and distribution brand. We connect
            customers and local businesses with products sourced from
            manufacturers and suppliers, with the actual product brand clearly
            identified.
          </p>
          <Link className="text-link" href="/about">
            Get to know FIXUP →
          </Link>
        </div>
      </section>
      <section className="section-tint">
        <div className="container section-space">
          <div className="section-heading">
            <div>
              <p className="eyebrow">THE CATALOGUE</p>
              <h2 className="section-title">Find your next bond.</h2>
            </div>
            <Link className="text-link" href="/products">
              All products →
            </Link>
          </div>
          <ProductGrid products={products} />
          <div className="mt-9">
            <h3 className="mb-4 font-semibold">Explore by category</h3>
            {categories.length ? (
              <div className="flex flex-wrap gap-3">
                {categories.map((c) => (
                  <Link
                    className="category-chip"
                    key={c.slug}
                    href={`/products?category=${c.slug}`}
                  >
                    {c.name}
                    {c.isDemo ? " · Demo" : ""} ↗
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">
                Product categories will appear as the catalogue is approved.
              </p>
            )}
          </div>
        </div>
      </section>
      <section className="container section-space">
        <div className="section-heading">
          <div>
            <p className="eyebrow">APPLICATIONS & INDUSTRIES</p>
            <h2 className="section-title">Start with the application.</h2>
          </div>
          <Link className="text-link" href="/applications">
            View verified uses →
          </Link>
        </div>
        {uses.length ? (
          <div className="flex flex-wrap gap-3">
            {uses.map((use) => (
              <Link key={use} className="category-chip" href="/applications">
                {use} ↗
              </Link>
            ))}
          </div>
        ) : (
          <p className="body-copy">
            Tell us about your materials and intended use. Compatibility will be
            listed only when supported by approved product documentation.
          </p>
        )}
        <div className="values-grid">
          {[
            [
              "01",
              "Clear product information",
              "Actual product brands and approved details help you evaluate your options.",
            ],
            [
              "02",
              "A direct conversation",
              "Discuss product availability, quantities and delivery needs with FIXUP.",
            ],
            [
              "03",
              "For your kind of business",
              "Dedicated enquiries for local shops, dealer partnerships and bulk requirements.",
            ],
          ].map(([num, title, copy]) => (
            <article key={num}>
              <span className="eyebrow">{num} / WHY FIXUP</span>
              <h3 className="mt-5 text-xl font-semibold">{title}</h3>
              <p className="body-copy">{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="container pb-20">
        <div className="partner-panel">
          <div>
            <p className="eyebrow">GROW WITH FIXUP</p>
            <h2 className="section-title">
              Let’s build a<br />
              stronger connection.
            </h2>
            <p className="body-copy">
              Run a hardware shop or supply business?
              <br />
              Introduce yourself and discuss becoming a FIXUP dealer.
            </p>
            <Link className="button" href="/become-a-dealer">
              Become a dealer ↗
            </Link>
          </div>
          <div className="partner-aside">
            <h3 className="text-2xl font-semibold">A bigger requirement?</h3>
            <p className="body-copy">
              Share the product, quantity and location. We’ll discuss what’s
              possible.
            </p>
            <Link className="text-link" href="/bulk-orders">
              Enquire about bulk orders →
            </Link>
            <hr className="my-8 border-line" />
            <Link className="text-link" href="/contact">
              Have a question? Contact us →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
