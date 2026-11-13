import { pageActor, Workspace } from "@/components/management/shared";
import { ManagedForm } from "@/components/forms/managed-form";
import { addressFields } from "@/components/management/fields";
import { readProfile } from "@/modules/customers/service";
export const metadata = { title: "Delivery addresses" };
export default async function Page() {
 const actor = await pageActor("account.update"); const { addresses } = await readProfile(actor);
 return <Workspace title="Delivery addresses"><section className="info-panel"><h2 className="mb-5 text-xl font-semibold">Add a delivery address</h2><ManagedForm url="/api/v1/me/addresses" fields={addressFields} base={{ country: "IN" }} submitLabel="Add address" resetOnSuccess /></section>{addresses.map((address, i) => <section key={address.id} className="info-panel"><h2 className="mb-5 text-xl font-semibold">Address {i+1}</h2><ManagedForm url={`/api/v1/me/addresses/${address.id}`} method="PATCH" fields={addressFields} initial={address} base={{ country: "IN" }} /><ManagedForm url={`/api/v1/me/addresses/${address.id}`} method="DELETE" fields={[]} submitLabel="Delete address" /></section>)}</Workspace>;
}

