import { PageIntro, WhatsAppLink } from "@/components/public/shared";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { getWebsite, productOptions } from "@/modules/catalogue/service";
import { bulkMessage } from "@/modules/catalogue/content";
import { challenge } from "@/modules/enquiries/protection";
import { pageMetadata } from "@/modules/catalogue/seo";
export function generateMetadata() {
  return pageMetadata(
    "Bulk Order Enquiries",
    "Discuss adhesive products, quantities and delivery requirements with FIXUP.",
    "/bulk-orders",
  );
}
export default async function BulkPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const raw = (await searchParams).q;
  const invalid =
    raw !== undefined && (typeof raw !== "string" || raw.length > 100);
  const query = typeof raw === "string" && !invalid ? raw.trim() : "";
  const [site, products] = await Promise.all([
    getWebsite(),
    productOptions(query),
  ]);
  return (
    <main id="main" className="container pb-20">
      <PageIntro
        eyebrow="BULK REQUIREMENTS"
        title="Big plans. Let’s talk supply."
      >
        Share your product, required quantity and delivery location to start a
        conversation.
      </PageIntro>
      <form action="/bulk-orders" className="info-panel mb-6">
        <label className="label" htmlFor="bulk-product-search">
          Find product by name or SKU
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <input
            id="bulk-product-search"
            name="q"
            className="field min-w-0 sm:flex-1"
            defaultValue={query}
            maxLength={100}
            aria-describedby="bulk-product-search-hint"
          />
          <button className="button" type="submit">
            Find product
          </button>
        </div>
        <p id="bulk-product-search-hint" className="mt-3 text-sm text-muted">
          Choose from up to 500 matching public products below. Search before
          entering your enquiry; searching reloads this page and clears unsent
          details.
        </p>
        {invalid && (
          <p role="alert">Use one search of at most 100 characters.</p>
        )}
        {query && !products.length && (
          <p role="status">No matching products. Try another name or SKU.</p>
        )}
      </form>
      <div className="editorial-grid">
        <EnquiryForm kind="BULK" token={challenge()} products={products} />
        <aside className="info-panel h-fit">
          <h2 className="text-2xl font-semibold">
            Prefer a direct conversation?
          </h2>
          <p className="body-copy">
            Send your requirements on WhatsApp. Availability, pricing and
            delivery are confirmed individually.
          </p>
          <WhatsAppLink number={site.whatsapp} message={bulkMessage} />
          <p className="mt-6 text-xs text-muted">
            Sending an enquiry does not place an order.
          </p>
        </aside>
      </div>
    </main>
  );
}
