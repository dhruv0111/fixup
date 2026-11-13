import { getWebsite } from "@/modules/catalogue/service";
import { PageIntro } from "@/components/public/shared";
import { pageMetadata } from "@/modules/catalogue/seo";
export function generateMetadata() {
  return pageMetadata(
    "About FIXUP",
    "Learn about FIXUP’s adhesive sourcing and distribution business.",
    "/about",
  );
}
export default async function AboutPage() {
  const site = await getWebsite();
  return (
    <main id="main" className="container pb-20">
      <PageIntro eyebrow="OUR BUSINESS" title="Built on connection.">
        An adhesive trading and distribution brand for local businesses and
        individual customers.
      </PageIntro>
      <div className="editorial-grid">
        <section>
          <h2 className="section-title">Meet FIXUP</h2>
          {site.aboutApproved && site.aboutText ? (
            <p className="body-copy whitespace-pre-line">{site.aboutText}</p>
          ) : (
            <>
              <p className="badge">COMPANY PROFILE · PENDING OWNER APPROVAL</p>
              <p className="body-copy">
                FIXUP purchases adhesive products from manufacturers and
                suppliers and supplies them to hardware shops, retailers,
                wholesalers and individual customers. Our initial focus is the
                local market.
              </p>
              <p className="text-sm text-muted">
                A fuller company introduction will be added when the business
                details are approved.
              </p>
            </>
          )}
        </section>
        <aside className="info-panel">
          <h2 className="text-xl font-semibold">How we work</h2>
          <ol className="mt-6 space-y-6">
            <li>
              <strong>01 / Source</strong>
              <p className="mt-2 text-muted">
                Products from manufacturers and suppliers, with their own brands
                identified.
              </p>
            </li>
            <li>
              <strong>02 / Inform</strong>
              <p className="mt-2 text-muted">
                Publish approved information so customers can discuss
                suitability.
              </p>
            </li>
            <li>
              <strong>03 / Connect</strong>
              <p className="mt-2 text-muted">
                Handle retail, dealer and bulk enquiries, including local and
                courier delivery requirements.
              </p>
            </li>
          </ol>
        </aside>
      </div>
      <section className="mt-16">
        <h2 className="section-title">Our commitment</h2>
        <p className="body-copy">
          Clear communication, accurate product information and a practical
          understanding of customer needs guide the business. Product
          suitability and availability should always be confirmed before
          purchase.
        </p>
      </section>
    </main>
  );
}
