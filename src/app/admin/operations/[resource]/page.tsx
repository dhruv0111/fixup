import Link from "next/link";
import { notFound } from "next/navigation";
import { pageActor, Workspace } from "@/components/management/shared";
import {
  OperationsNav,
  DataTable,
  money,
  operationLinks,
} from "@/components/inventory/shared";
import { AdjustmentEditor } from "@/components/inventory/editors";
import {
  listRecords,
  stockRows,
  options,
  report,
  recentMovements,
} from "@/modules/inventory/read";
import { querySchema, reportKinds } from "@/modules/inventory/schemas";
import { getDb } from "@/server/db/client";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { resource } = await params;
  if (!operationLinks.some((l) => l[1] === resource)) notFound();
  const actor = await pageActor("inventory.read");
  const input = await searchParams;
  const parsed = querySchema.safeParse(input);
  const query = parsed.success ? parsed.data : querySchema.parse({});
  const title = operationLinks.find((l) => l[1] === resource)![0];
  const base = `/admin/operations/${resource}`;
  const status =
    resource === "suppliers"
      ? ["ACTIVE", "INACTIVE", "BLOCKED"]
      : resource === "purchase-orders"
        ? [
            "DRAFT",
            "SUBMITTED",
            "PARTIALLY_RECEIVED",
            "FULLY_RECEIVED",
            "CANCELLED",
          ]
        : resource === "goods-receiving"
          ? ["DRAFT", "COMPLETED", "CANCELLED", "REVERSED"]
          : resource === "inventory"
            ? ["LOW", "OUT"]
            : [];
  if (resource === "reports") {
    const q = { ...query, status: "" };
    const rows = await report(actor, q);
    const filterValues = new URLSearchParams(
      Object.entries(q).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    filterValues.set("format", "csv");
    const suppliers = await getDb().supplier.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 1000,
    });
    return (
      <Workspace admin title={title}>
        <OperationsNav />
        <form className="management-form grid gap-4 sm:grid-cols-3">
          <label>
            Report
            <select aria-label="Report" name="kind" defaultValue={q.kind}>
              {reportKinds.map((k) => (
                <option key={k} value={k}>
                  {k.replaceAll("-", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input name="q" defaultValue={q.q} maxLength={100} />
          </label>
          <label>
            Supplier
            <select
              aria-label="Supplier"
              name="supplierId"
              defaultValue={q.supplierId ?? ""}
            >
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            From date
            <input name="from" type="date" defaultValue={q.from ?? ""} />
          </label>
          <label>
            To date
            <input name="to" type="date" defaultValue={q.to ?? ""} />
          </label>
          <button className="button self-end">Run report</button>
        </form>
        <p className="text-sm text-muted">
          Stock reports show balance as of the To date (or now); From applies to
          event reports. Batch date filters use expiry dates. Purchase reports
          distinguish drafts/cancellations from committed supplier purchases.
          Amounts are INR; no paid/payment status is implied. Up to 10,000
          matching rows; narrow filters for larger exports.
        </p>
        <Link
          className="button button-secondary"
          href={`/api/v1/admin/operations/reports?${filterValues}`}
        >
          Export CSV
        </Link>
        <p>
          {rows.length} matching records. Showing first 100; CSV includes all
          matching records within the limit.
        </p>
        <DataTable rows={rows.slice(0, 100)} />
      </Workspace>
    );
  }
  const validStatus = !query.status || status.includes(query.status);
  const result = await listRecords(
    actor,
    resource,
    validStatus ? query : { ...query, status: "" },
  );
  const items = result.items as Record<string, unknown>[];
  let totals = null;
  if (resource === "inventory") {
    const rows = await stockRows(actor, {});
    totals = {
      onHand: rows.reduce((s, r) => s + r.onHand, 0),
      reserved: rows.reduce((s, r) => s + r.reserved, 0),
      available: rows.reduce((s, r) => s + r.available, 0),
      damaged: rows.reduce((s, r) => s + r.damaged, 0),
      low: rows.filter((r) => r.lowStock).length,
      out: rows.filter((r) => r.outOfStock).length,
    };
  }
  return (
    <Workspace admin title={title}>
      <OperationsNav />
      {(!parsed.success || !validStatus) && (
        <p role="alert">Invalid filters were cleared.</p>
      )}
      {["suppliers", "purchase-orders"].includes(resource) && (
        <Link className="button" href={`${base}/new`}>
          {resource === "suppliers" ? "Add supplier" : "Create purchase order"}
        </Link>
      )}
      {resource === "goods-receiving" && (
        <Link className="button" href={`${base}/new`}>
          Create GRN draft
        </Link>
      )}
      {totals && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              ["On-hand units", totals.onHand],
              ["Reserved units", totals.reserved],
              ["Available units", totals.available],
              ["Damaged units", totals.damaged],
              ["Low-stock variants", totals.low],
              ["Out-of-stock variants", totals.out],
            ].map(([name, n]) => (
              <section key={name} className="info-panel">
                <h2>{name}</h2>
                <p className="mt-3 text-3xl font-semibold">{n}</p>
              </section>
            ))}
          </div>
          <p className="text-sm text-muted">
            Total physical stock: {totals.onHand + totals.damaged} units. Counts
            are sums of recorded ledger entries; variants without movements have
            no stock recorded. No stock is reserved. Thresholds are
            admin-configured; no reorder quantity is assumed.
          </p>
          <h2 className="text-xl font-semibold">Current stock by product</h2>
          <DataTable
            rows={Object.values(
              (await stockRows(actor, {})).reduce<
                Record<
                  string,
                  { product: string; available: number; damaged: number }
                >
              >((a, r) => {
                const p = a[r.productId] ?? {
                  product: r.product,
                  available: 0,
                  damaged: 0,
                };
                p.available += r.available;
                p.damaged += r.damaged;
                a[r.productId] = p;
                return a;
              }, {}),
            )}
          />
        </>
      )}
      <form className="management-form flex flex-wrap items-end gap-4">
        <label className="grow">
          Search
          <input name="q" defaultValue={query.q} maxLength={100} />
        </label>
        {status.length > 0 && (
          <label>
            Status
            <select name="status" defaultValue={query.status}>
              <option value="">All statuses</option>
              {status.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        {resource !== "inventory" && (
          <>
            <label>
              From date
              <input name="from" type="date" defaultValue={query.from ?? ""} />
            </label>
            <label>
              To date
              <input name="to" type="date" defaultValue={query.to ?? ""} />
            </label>
          </>
        )}
        <button className="button">Search</button>
      </form>
      {["suppliers", "purchase-orders", "goods-receiving"].includes(
        resource,
      ) ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((r) => (
            <Link
              className="info-panel min-w-0"
              key={String(r.id)}
              href={`${base}/${r.id}`}
            >
              <h2 className="break-words text-xl font-semibold">
                {String(r.name ?? r.number)}
              </h2>
              <p className="mt-2">{String(r.status)}</p>
              {typeof r.totalPaise === "number" && (
                <p className="mt-2">{money(r.totalPaise)}</p>
              )}
            </Link>
          ))}
          {!items.length && <p>No matching records.</p>}
        </div>
      ) : (
        <>
          <DataTable rows={items} />
          {resource === "inventory" && items.length > 0 && (
            <nav
              className="flex flex-wrap gap-4"
              aria-label="Variant inventory settings"
            >
              {items.map((r) => (
                <Link
                  key={String(r.variantId)}
                  className="text-link"
                  href={`${base}/${r.variantId}`}
                >
                  {String(r.variant)}: lots and threshold
                </Link>
              ))}
            </nav>
          )}
        </>
      )}
      <p>
        {result.total} records · Page {result.page} of{" "}
        {Math.max(result.pages, 1)}
      </p>
      <nav className="flex gap-4" aria-label="Operations pagination">
        {[result.page - 1, result.page + 1]
          .filter((p) => p > 0 && p <= result.pages)
          .map((p) => (
            <Link
              className="text-link"
              key={p}
              href={`?${new URLSearchParams({ ...Object.fromEntries(Object.entries(input).filter((e): e is [string, string] => typeof e[1] === "string")), page: String(p) })}`}
            >
              {p < result.page ? "Previous" : "Next"}
            </Link>
          ))}
      </nav>
      {resource === "stock-adjustments" && (
        <section className="info-panel">
          <h2 className="mb-6 text-xl font-semibold">
            Record a stock adjustment
          </h2>
          <AdjustmentEditor {...await options(actor)} />
        </section>
      )}
      {resource === "inventory" && (
        <>
          <h2 className="text-xl font-semibold">Recent stock movements</h2>
          <DataTable rows={await recentMovements(actor)} />
        </>
      )}
    </Workspace>
  );
}
