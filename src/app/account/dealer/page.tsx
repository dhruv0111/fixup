import { pageActor, Workspace } from "@/components/management/shared";
import { ManagedForm } from "@/components/forms/managed-form";
import { dealerFields } from "@/components/management/fields";
import { ownDealer } from "@/modules/management/accounts";
import Link from "next/link";
export const metadata = { title: "Dealer application" };
export default async function Page() {
  const actor = await pageActor("account.update");
  const dealer = await ownDealer(actor);
  return (
    <Workspace title="Dealer application">
      {dealer && (
        <section className="info-panel">
          <p className="eyebrow">Application status</p>
          <h2 className="mt-3 text-2xl font-semibold">{dealer.status}</h2>
          <p className="mt-3">
            {dealer.businessName} · {dealer.contactName}
          </p>
          {dealer.reviewReason && (
            <p className="mt-3">Review note: {dealer.reviewReason}</p>
          )}
          <p className="mt-3 text-muted">
            {dealer.status === "APPROVED"
              ? "Your shared dealer prices are available on product pages while your account remains active."
              : "Dealer access and dealer pricing require an approved, active account."}
          </p>
          <Link href="/products" className="text-link">
            Browse products
          </Link>
        </section>
      )}
      {(!dealer || dealer.status === "REJECTED") &&
      ["CUSTOMER", "DEALER"].includes(actor.role) ? (
        <section className="info-panel">
          <p className="mb-6 text-muted">
            Submit your business details for FIXUP to review. GSTIN is optional.
            You can submit a revised application after a rejection.
          </p>
          <ManagedForm
            url="/api/v1/me/dealer"
            fields={dealerFields}
            initial={dealer ?? { contactName: actor.name, email: actor.email }}
            submitLabel={
              dealer ? "Submit revised application" : "Submit application"
            }
          />
        </section>
      ) : (
        <p className="text-muted">
          Contact FIXUP if your business details need updating.
        </p>
      )}
    </Workspace>
  );
}
