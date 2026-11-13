import { pageActor, Workspace } from "@/components/management/shared";
import { ManagedForm } from "@/components/forms/managed-form";
import { readProfile } from "@/modules/customers/service";
import Link from "next/link";
export const metadata = { title: "Edit profile" };
export default async function Page() {
  const actor = await pageActor("account.update");
  const profile = await readProfile(actor);
  return (
    <Workspace title="Edit profile">
      <section className="info-panel">
        <p className="mb-6">Sign-in email: {actor.email}</p>
        <ManagedForm
          url="/api/v1/me"
          method="PATCH"
          initial={{
            name: actor.name,
            businessName: profile.businessName,
            phone: profile.phone,
          }}
          fields={[
            { name: "name", label: "Full name", required: true },
            {
              name: "phone",
              label: "Contact phone",
              type: "tel",
              nullable: true,
            },
            { name: "businessName", label: "Business name", nullable: true },
          ]}
        />
      </section>
      <Link className="text-link" href="/forgot-password">
        Reset your password
      </Link>
    </Workspace>
  );
}
