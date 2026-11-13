import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActor } from "@/server/permissions/service";
import { getDb } from "@/server/db/client";
export const metadata = { title: "Customer enquiries" };
export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await getActor(await headers());
  if (!actor) redirect("/login");
  if (!actor.permissions.includes("enquiries.read"))
    return (
      <main id="main" className="container py-16">
        <h1>Access restricted</h1>
      </main>
    );
  const raw = Number((await searchParams).page ?? 1);
  const page = Number.isInteger(raw) && raw > 0 && raw <= 10000 ? raw : 1;
  const rows = await getDb().enquiry.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * 25,
    take: 26,
    include: { product: { select: { name: true, sku: true } } },
  });
  return (
    <main id="main" className="container py-12">
      <h1 className="text-4xl font-semibold">Customer enquiries</h1>
      <p className="body-copy">
        Private customer information. Use only to follow up on the enquiry.
      </p>
      <div className="space-y-5">
        {rows.slice(0, 25).map((row) => (
          <article key={row.id} className="info-panel">
            <p className="eyebrow">
              {row.kind} ·{" "}
              {row.createdAt.toLocaleDateString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}
            </p>
            <h2 className="mt-3 text-xl font-semibold">
              {row.name}
              {row.businessName ? ` / ${row.businessName}` : ""}
            </h2>
            <dl className="contact-list">
              {Object.entries({
                Phone: row.phone,
                Email: row.email,
                Product: row.product
                  ? `${row.product.name} (${row.product.sku})`
                  : "",
                Quantity: row.quantity,
                Address: [row.address, row.city, row.postalCode]
                  .filter(Boolean)
                  .join(", "),
                Location: row.location,
                "Business type": row.businessType,
                GSTIN: row.gstin,
                Message: row.message,
              })
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd className="whitespace-pre-line">{value}</dd>
                  </div>
                ))}
            </dl>
          </article>
        ))}
      </div>
      {!rows.length && <p>No enquiries yet.</p>}
      <nav aria-label="Enquiry pagination" className="mt-8 flex gap-5">
        {page > 1 && (
          <Link href={`/admin/enquiries?page=${page - 1}`}>Previous</Link>
        )}
        {rows.length > 25 && (
          <Link href={`/admin/enquiries?page=${page + 1}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
