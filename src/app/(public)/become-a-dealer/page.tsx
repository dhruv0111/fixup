import { PageIntro } from "@/components/public/shared";
import Link from "next/link";
import { EnquiryForm } from "@/components/forms/enquiry-form";
import { challenge } from "@/modules/enquiries/protection";
import { pageMetadata } from "@/modules/catalogue/seo";
export function generateMetadata() {
  return pageMetadata(
    "Become a Dealer",
    "Introduce your business and enquire about a FIXUP dealer partnership.",
    "/become-a-dealer",
  );
}
export default function DealerPage() {
  return (
    <main id="main" className="container pb-20">
      <PageIntro
        eyebrow="PARTNER WITH FIXUP"
        title="Good business starts with a conversation."
      >
        Tell us about your shop or business and your expected requirements.
      </PageIntro>
      <div className="editorial-grid">
        <EnquiryForm kind="DEALER" token={challenge()} />
        <aside className="info-panel h-fit">
          <Link className="button mb-6" href="/account/dealer">Apply through your account</Link>
          <p className="mb-6 text-sm text-muted">Sign in or register to submit a dealer application and track its approval. This public form sends an initial enquiry.</p>
          <h2 className="text-2xl font-semibold">Let’s work together.</h2>
          <p className="body-copy">
            For hardware shops, retailers and wholesalers looking to discuss
            adhesive supply.
          </p>
          <ol className="space-y-5">
            <li>01 / Introduce your business.</li>
            <li>02 / Discuss products and quantities.</li>
            <li>03 / Confirm the next steps with FIXUP.</li>
          </ol>
          <p className="mt-8 text-sm text-muted">
            An application does not grant dealer access. Approval and commercial
            terms are discussed separately.
          </p>
        </aside>
      </div>
    </main>
  );
}
