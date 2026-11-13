import { PageIntro, WhatsAppLink } from "@/components/public/shared";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import {
  getWebsite,
  productOptions,
  getPublicProduct,
} from "@/modules/catalogue/service";
import { generalMessage, productMessage } from "@/modules/catalogue/content";
import { challenge } from "@/modules/enquiries/protection";
import { pageMetadata } from "@/modules/catalogue/seo";
export function generateMetadata() {
  return pageMetadata(
    "Contact FIXUP",
    "Contact FIXUP for adhesive product information, availability and business enquiries.",
    "/contact",
  );
}
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const query = await searchParams;
  const [site, products, selected] = await Promise.all([
    getWebsite(),
    productOptions(),
    typeof query.product === "string" ? getPublicProduct(query.product) : null,
  ]);
  return (
    <main id="main" className="container pb-20">
      <PageIntro eyebrow="CONTACT FIXUP" title="Let’s make a connection.">
        Have a product question or a business requirement? We’re ready to hear
        from you.
      </PageIntro>
      <div className="editorial-grid">
        <EnquiryForm
          kind="CONTACT"
          token={challenge()}
          products={products}
          selectedProduct={selected?.id}
        />
        <aside className="info-panel h-fit">
          <h2 className="text-2xl font-semibold">Talk to FIXUP</h2>
          <dl className="contact-list">
            <dt>Phone</dt>
            <dd>
              {site.phone ? (
                <a href={`tel:${site.phone.replace(/[^+0-9]/g, "")}`}>
                  {site.phone}
                </a>
              ) : (
                "To be confirmed"
              )}
            </dd>
            <dt>Email</dt>
            <dd>
              {site.email ? (
                <a href={`mailto:${site.email}`}>{site.email}</a>
              ) : (
                "To be confirmed"
              )}
            </dd>
            <dt>Address</dt>
            <dd>{site.address || "To be confirmed"}</dd>
            <dt>Working hours</dt>
            <dd>
              {site.workingHours || "Contact us to confirm working hours."}
            </dd>
          </dl>
          <WhatsAppLink
            number={site.whatsapp}
            message={selected ? productMessage(selected) : generalMessage}
          />
          <p className="mt-5 text-xs text-muted">
            WhatsApp opens an external conversation. Chats are not automatically
            saved here.
          </p>
        </aside>
      </div>
    </main>
  );
}
