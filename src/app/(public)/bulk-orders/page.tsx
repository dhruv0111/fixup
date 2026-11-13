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
export default async function BulkPage() {
  const [site, products] = await Promise.all([getWebsite(), productOptions()]);
  return (
    <main id="main" className="container pb-20">
      <PageIntro
        eyebrow="BULK REQUIREMENTS"
        title="Big plans. Let’s talk supply."
      >
        Share your product, required quantity and delivery location to start a
        conversation.
      </PageIntro>
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
