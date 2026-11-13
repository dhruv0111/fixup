import { notFound } from "next/navigation";
import { policySlugs } from "@/modules/catalogue/validation";
import { policyDrafts } from "@/modules/catalogue/content";
import { getPolicy } from "@/modules/catalogue/service";
import { PageIntro } from "@/components/public/shared";
import { pageMetadata } from "@/modules/catalogue/seo";
type Props = { params: Promise<{ slug: string }> };
function validSlug(slug: string): slug is (typeof policySlugs)[number] {
  return policySlugs.some((s) => s === slug);
}
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return validSlug(slug)
    ? pageMetadata(
        policyDrafts[slug].title,
        `Read FIXUP’s ${policyDrafts[slug].title.toLowerCase()} and its approval status.`,
        `/policies/${slug}`,
      )
    : { title: "Policy not found" };
}
export default async function PolicyPage({ params }: Props) {
  const { slug } = await params;
  if (!validSlug(slug)) notFound();
  const policy = await getPolicy(slug);
  return (
    <main id="main" className="container pb-20">
      <PageIntro eyebrow="POLICIES" title={policy.title} />
      {!policy.approved && (
        <div className="draft-banner" role="note">
          <strong>Draft — pending business/legal approval.</strong>
          <p>
            This content is a starting point and is not an approved legal
            document.
          </p>
        </div>
      )}
      <article className="policy-copy">
        {policy.body.split(/\n\s*\n/).map((section, i) => {
          const [heading, ...lines] = section.split("\n");
          return (
            <section key={i}>
              {lines.length ? (
                <>
                  <h2>{heading}</h2>
                  <p className="whitespace-pre-line">{lines.join("\n")}</p>
                </>
              ) : (
                <p>{heading}</p>
              )}
            </section>
          );
        })}
      </article>
    </main>
  );
}
