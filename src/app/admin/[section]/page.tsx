import Link from "next/link";
import { notFound } from "next/navigation";
import { pageActor, Workspace } from "@/components/management/shared";
import { listAccounts } from "@/modules/management/accounts";
import { StatusBadge } from "@/components/orders/ui";
import { titleCase } from "@/components/orders/status";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { section } = await params;
  if (section !== "customers" && section !== "dealers") notFound();
  const actor = await pageActor(
    section === "customers" ? "customers.manage" : "dealers.manage",
  );
  const query = await searchParams;
  const result = await listAccounts(actor, section, query);
  const title = section === "customers" ? "Customers" : "Dealers";
  return (
    <Workspace admin title={title}>
      <form className="management-form flex flex-wrap items-end gap-4">
        <label className="grow">
          Search {section}
          <input name="q" defaultValue={query.q} maxLength={100} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={query.status ?? ""}>
            {[
              "",
              ...(section === "customers"
                ? ["ACTIVE", "INACTIVE"]
                : ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]),
            ].map((s) => (
              <option key={s} value={s}>
                {s || "All statuses"}
              </option>
            ))}
          </select>
        </label>
        <button className="button">Search</button>
      </form>
      <p className="text-sm text-muted">{result.total} records</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {result.items.map((item) => {
          const isCustomer = "user" in item;
          const status = isCustomer
            ? item.user.active
              ? "ACTIVE"
              : "INACTIVE"
            : item.status;
          const tone =
            status === "ACTIVE" || status === "APPROVED"
              ? "green"
              : status === "PENDING"
                ? "amber"
                : status === "INACTIVE" || status === "SUSPENDED"
                  ? "gray"
                  : "red";
          return (
            <Link
              key={item.id}
              href={`/admin/${section}/${item.id}`}
              className={`o-card block hover:border-[#b9a3d6] ${status === "PENDING" ? "o-card-attention" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  {isCustomer ? item.user.name : item.businessName}
                </h2>
                <StatusBadge label={titleCase(status)} tone={tone} />
              </div>
              <p className="mt-2 break-words text-sm text-muted">
                {isCustomer ? item.user.email : item.email}
              </p>
              {status === "PENDING" && (
                <p className="mt-3 text-sm font-semibold text-[#8a5a00]">
                  Waiting for your review
                </p>
              )}
            </Link>
          );
        })}
      </div>
      {result.total === 0 && <p>No matching records.</p>}
      <nav aria-label="Results pagination" className="flex gap-4">
        {result.page > 1 && (
          <Link
            className="text-link"
            href={`?q=${encodeURIComponent(query.q ?? "")}&status=${query.status ?? ""}&page=${result.page - 1}`}
          >
            Previous
          </Link>
        )}
        {result.page < result.pages && (
          <Link
            className="text-link"
            href={`?q=${encodeURIComponent(query.q ?? "")}&status=${query.status ?? ""}&page=${result.page + 1}`}
          >
            Next
          </Link>
        )}
      </nav>
    </Workspace>
  );
}
