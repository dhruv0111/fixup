import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActor } from "@/server/permissions/service";
import { getDb } from "@/server/db/client";
import { getWebsite, getPolicy } from "@/modules/catalogue/service";
import { ContentEditor } from "@/components/forms/content-editor";
import { policySlugs } from "@/modules/catalogue/validation";
export const metadata = { title: "Website content" };
export default async function ContentPage() {
  const actor = await getActor(await headers());
  if (!actor) redirect("/login");
  if (!actor.permissions.includes("catalogue.write"))
    return (
      <main id="main" className="container py-16">
        <h1 className="text-3xl">Access restricted</h1>
        <p>Only the business owner can edit website content.</p>
      </main>
    );
  const [site, faqs, policies] = await Promise.all([
    getWebsite(),
    getDb().faq.findMany({ orderBy: { sortOrder: "asc" }, take: 100 }),
    Promise.all(policySlugs.map(getPolicy)),
  ]);
  return (
    <main id="main" className="container py-12">
      <h1 className="text-4xl font-semibold">Website content</h1>
      <p className="body-copy">
        Publish only verified business information. Every save is audited with
        your reason.
      </p>
      <section className="max-w-3xl">
        <h2 className="section-title">Contact & company</h2>
        <ContentEditor
          resource="website"
          initial={{
            id: "singleton",
            phone: site.phone,
            whatsapp: site.whatsapp,
            email: site.email,
            address: site.address,
            workingHours: site.workingHours,
            aboutText: site.aboutText,
            aboutApproved: site.aboutApproved,
          }}
          fields={[
            { name: "phone", label: "Business phone" },
            {
              name: "whatsapp",
              label: "WhatsApp number (country code and digits only)",
            },
            { name: "email", label: "Business email", type: "email" },
            { name: "address", label: "Business address", type: "textarea" },
            { name: "workingHours", label: "Working hours" },
            {
              name: "aboutText",
              label: "Company introduction",
              type: "textarea",
            },
            {
              name: "aboutApproved",
              label: "Company introduction approved for publication",
              type: "checkbox",
            },
          ]}
        />
      </section>
      <section className="max-w-3xl mt-12">
        <h2 className="section-title">Frequently asked questions</h2>
        {[
          ...faqs,
          { id: "", question: "", answer: "", published: false, sortOrder: 0 },
        ].map((faq) => (
          <details key={faq.id || "new"} className="faq-item">
            <summary>{faq.question || "Add a question"}</summary>
            <ContentEditor
              resource="faqs"
              initial={{
                id: faq.id,
                question: faq.question,
                answer: faq.answer,
                published: faq.published,
                sortOrder: faq.sortOrder,
              }}
              fields={[
                { name: "question", label: "Question" },
                { name: "answer", label: "Answer", type: "textarea" },
                { name: "sortOrder", label: "Display order", type: "number" },
                {
                  name: "published",
                  label: "Publish this answer",
                  type: "checkbox",
                },
              ]}
            />
          </details>
        ))}
      </section>
      <section className="max-w-3xl mt-12">
        <h2 className="section-title">Policies</h2>
        <p className="body-copy">
          Policies remain labelled draft until approved. Approval must follow
          business/legal review.
        </p>
        {policies.map((policy, index) => (
          <details className="faq-item" key={policySlugs[index]}>
            <summary>{policy.title}</summary>
            <ContentEditor
              resource="policies"
              initial={{
                id: policySlugs[index],
                title: policy.title,
                body: policy.body,
                approved: policy.approved,
              }}
              fields={[
                { name: "title", label: "Title" },
                {
                  name: "body",
                  label: "Policy content (separate sections with a blank line)",
                  type: "textarea",
                },
                {
                  name: "approved",
                  label:
                    "Business/legal review complete — approve for publication",
                  type: "checkbox",
                },
              ]}
            />
          </details>
        ))}
      </section>
    </main>
  );
}
