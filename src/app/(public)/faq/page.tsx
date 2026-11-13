import Link from "next/link";
import { getFaqs } from "@/modules/catalogue/service";
import { PageIntro, EmptyState } from "@/components/public/shared";
import { pageMetadata } from "@/modules/catalogue/seo";
export function generateMetadata() {
  return pageMetadata(
    "Frequently Asked Questions",
    "Find published answers to common questions about FIXUP and product enquiries.",
    "/faq",
  );
}
export default async function FaqPage() {
  const faqs = await getFaqs();
  return (
    <main id="main" className="container pb-20">
      <PageIntro eyebrow="A LITTLE CLARITY" title="Frequently asked questions.">
        Answers to help you take the next step.
      </PageIntro>
      <div className="max-w-3xl">
        {faqs.length ? (
          faqs.map((faq) => (
            <details className="faq-item" key={faq.id}>
              <summary>{faq.question}</summary>
              <p className="body-copy whitespace-pre-line">{faq.answer}</p>
            </details>
          ))
        ) : (
          <EmptyState>
            Our published answers are being prepared.{" "}
            <Link className="text-link" href="/contact">
              Ask FIXUP a question →
            </Link>
          </EmptyState>
        )}
      </div>
    </main>
  );
}
