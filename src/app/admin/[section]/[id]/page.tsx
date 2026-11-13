import { notFound } from "next/navigation";
import Link from "next/link";
import { pageActor, Workspace, History } from "@/components/management/shared";
import { accountDetail } from "@/modules/management/accounts";
import { ManagedForm } from "@/components/forms/managed-form";
import { reasonField } from "@/components/management/fields";
import { AppError } from "@/server/http/errors";
export default async function Page({ params }: { params: Promise<{ section: string; id: string }> }) {
 const { section, id } = await params; if(section !== "customers" && section !== "dealers") notFound();
 const actor = await pageActor(section === "customers" ? "customers.manage" : "dealers.manage");
 const result = await accountDetail(actor, section, id).catch(error => { if(error instanceof AppError && error.status === 404) notFound(); throw error; });
 const { customer, audit } = result; const dealer = customer.dealer;
 const options = dealer?.status === "PENDING" ? ["APPROVED", "REJECTED"] : dealer?.status === "APPROVED" ? ["SUSPENDED"] : dealer?.status === "SUSPENDED" ? ["APPROVED"] : [];
 return <Workspace admin title={section === "customers" ? customer.user.name : dealer!.businessName}><section className="info-panel"><h2 className="text-xl font-semibold">Customer details</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2">{Object.entries({ Name: customer.user.name, Email: customer.user.email, Phone: customer.phone, Business: customer.businessName, Category: customer.category, Account: customer.user.active ? "ACTIVE" : "INACTIVE" }).map(([key,value]) => <div key={key}><dt className="text-sm text-muted">{key}</dt><dd className="break-words">{value || "Not supplied"}</dd></div>)}</dl></section>
 {section === "customers" && <section className="info-panel"><h2 className="mb-5 text-xl font-semibold">Account access</h2><ManagedForm url={`/api/v1/admin/management/customers/${id}`} method="PATCH" base={{ version: customer.user.managementVersion }} initial={{ active: customer.user.active }} fields={[{ name: "active", label: "Account active", type: "checkbox" }, reasonField]} /><h2 className="my-4 text-xl font-semibold">Delivery addresses</h2>{customer.addresses.map(a => <p key={a.id} className="my-3">{a.recipient} · {a.phone}<br />{a.line1}, {a.line2} {a.city}, {a.state} {a.postalCode}</p>)}{!customer.addresses.length && <p>No saved addresses.</p>}{dealer && <Link className="text-link" href={`/admin/dealers/${dealer.id}`}>Review dealer profile</Link>}</section>}
 {section === "dealers" && dealer && <section className="info-panel"><h2 className="text-xl font-semibold">Business application · {dealer.status}</h2><dl className="my-6 grid gap-4 sm:grid-cols-2">{Object.entries({ "Contact person": dealer.contactName, Mobile: dealer.phone, Email: dealer.email, Address: dealer.address, City: dealer.city, State: dealer.state, "PIN code": dealer.postalCode, "Business type": dealer.businessType, GSTIN: dealer.gstin, "Monthly purchase volume": dealer.expectedVolume, Message: dealer.message, "Review reason": dealer.reviewReason }).map(([key,value]) => <div key={key}><dt className="text-sm text-muted">{key}</dt><dd className="break-words">{value || "Not supplied"}</dd></div>)}</dl>{options.length > 0 && <ManagedForm url={`/api/v1/admin/management/dealers/${id}`} method="PATCH" base={{ version: dealer.version }} fields={[{ name: "status", label: "Review action", type: "select", options: options.map(s => ({ value: s, label: s === "APPROVED" && dealer.status === "SUSPENDED" ? "REACTIVATE" : s })) }, reasonField]} submitLabel="Record decision" />}<Link className="text-link" href={`/admin/customers/${customer.id}`}>Manage customer account</Link></section>}
 <History events={audit} /></Workspace>;
}

