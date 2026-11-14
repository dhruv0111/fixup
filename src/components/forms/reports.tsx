"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  reportKinds,
  reportNames,
  expenseCategories,
} from "@/modules/reports/schemas";
import type {
  Report,
  Metric,
  Chart,
  Row,
  dashboard,
} from "@/modules/reports/service";
import { presets } from "@/modules/reports/dates";
type Dashboard = Awaited<ReturnType<typeof dashboard>>;
const root = "/api/v1/admin/reports";
const currency = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n / 100);
const caption = (s: string) =>
  s.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
async function call<T>(
  url: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method,
    cache: "no-store",
    ...(data
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : {}),
  });
  const body = await r.json();
  if (!r.ok)
    throw new Error(
      [
        body.error?.message ?? "Unable to load data.",
        ...Object.entries(body.error?.fields ?? {}).map(
          ([k, v]) => `${k}: ${String(v)}`,
        ),
      ].join(" "),
    );
  return body.data;
}
function useLoad<T>(url: string | null) {
  const [state, setState] = useState<{
    url: string;
    data: T | null;
    error: string;
  }>({ url: "", data: null, error: "" });
  useEffect(() => {
    if (url === null) return;
    let live = true;
    call<T>(url).then(
      (data) => {
        if (live) setState({ url, data, error: "" });
      },
      (e) => {
        if (live) setState({ url, data: null, error: e.message });
      },
    );
    return () => {
      live = false;
    };
  }, [url]);
  return state.url === url ? state : { url, data: null, error: "" };
}
function Input({
  name,
  label,
  value,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  value?: string | number;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        className="field mt-2"
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        step={type === "number" ? "0.01" : undefined}
        min={type === "number" ? "0.01" : undefined}
        maxLength={2000}
      />
    </label>
  );
}
type Options = {
  financialAccess: boolean;
  products: {
    id: string;
    name: string;
    variants: { id: string; name: string; packSize: string }[];
  }[];
  customers: {
    id: string;
    user: { name: string };
    dealer: { id: string; businessName: string } | null;
  }[];
  suppliers: { id: string; name: string }[];
};
export function ReportsNav({ financial = false }: { financial?: boolean }) {
  return (
    <nav
      aria-label="Business reports"
      className="flex flex-wrap gap-x-5 gap-y-3 text-sm"
    >
      <Link className="text-link" href="/admin/business">
        Business dashboard
      </Link>
      {reportKinds
        .filter((k) => financial || k !== "profitability")
        .map((k) => (
          <Link key={k} className="text-link" href={`/admin/reports/${k}`}>
            {reportNames[k]}
          </Link>
        ))}
      <Link className="text-link" href="/admin/expenses/new">
        Add expense
      </Link>
    </nav>
  );
}
function Cards({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {metrics.map((m) => (
        <article
          className="rounded-xl border border-line bg-white p-5"
          key={m.key}
        >
          <h2 className="text-sm font-medium text-muted">{m.label}</h2>
          <p className="my-3 break-words text-3xl font-semibold tracking-tight">
            {m.value === null
              ? "Incomplete"
              : m.unit === "INR"
                ? currency(m.value)
                : new Intl.NumberFormat("en-IN").format(m.value)}
          </p>
          <details className="text-xs leading-5 text-muted">
            <summary className="cursor-pointer">How this is calculated</summary>
            <p className="mt-2">{m.definition}</p>
          </details>
        </article>
      ))}
    </div>
  );
}
function BarChart({ chart }: { chart: Chart }) {
  const points = chart.data.slice(0, 36);
  const max = Math.max(1, ...points.map((p) => Math.abs(p.value)));
  return (
    <figure className="min-w-0 rounded-xl border border-line bg-white p-5">
      <figcaption className="mb-5 text-lg font-semibold">
        {chart.title}
      </figcaption>
      {points.length ? (
        <ul className="space-y-3">
          {points.map((p, i) => (
            <li key={`${p.label}:${i}`} className="min-w-0">
              <div className="mb-1 flex justify-between gap-3 text-xs">
                <span className="break-words">{caption(p.label)}</span>
                <span className="shrink-0 font-medium">
                  {chart.unit === "INR"
                    ? currency(p.value)
                    : new Intl.NumberFormat("en-IN").format(p.value)}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded bg-slate-100"
                aria-hidden="true"
              >
                <div
                  className={`h-full rounded ${p.value < 0 ? "bg-rose-500" : "bg-purple-700"}`}
                  style={{ width: `${(Math.abs(p.value) / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-sm text-muted">
          No recorded activity in this range.
        </p>
      )}
      {chart.data.length > 36 && (
        <p className="mt-4 text-xs text-muted">
          First 36 periods shown. Narrow the date range to inspect later
          periods; complete records remain in the report export.
        </p>
      )}
    </figure>
  );
}
export function ReportTable({ rows }: { rows: Row[] }) {
  const [page, setPage] = useState(1);
  const columns = Object.keys(rows[0] ?? {});
  const perPage = 25;
  const pages = Math.ceil(rows.length / perPage);
  return (
    <div>
      {!rows.length ? (
        <p className="rounded-xl border border-line bg-white p-8 text-muted">
          No matching database records.
        </p>
      ) : (
        <>
          <div className="max-w-full overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-purple-50">
                <tr>
                  {columns.map((c) => (
                    <th className="whitespace-nowrap p-4 font-medium" key={c}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows
                  .slice((page - 1) * perPage, page * perPage)
                  .map((row, i) => (
                    <tr key={i}>
                      {columns.map((c) => (
                        <td
                          className="max-w-xs break-words p-4 align-top"
                          key={c}
                        >
                          {row[c] === null ? (
                            "Incomplete / not recorded"
                          ) : typeof row[c] === "boolean" ? (
                            row[c] ? (
                              "Yes"
                            ) : (
                              "No"
                            )
                          ) : c === "Expense ID" ? (
                            <Link
                              className="text-link"
                              href={`/admin/expenses/${row[c]}`}
                            >
                              View expense
                            </Link>
                          ) : (
                            String(row[c])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="my-4 flex flex-wrap items-center gap-4 text-sm">
            <p>
              {rows.length} records · Page {Math.min(page, pages)} of {pages}
            </p>
            <button
              className="text-link"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <button
              className="text-link"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
function Filters({
  kind,
  onSubmit,
  options,
}: {
  kind: string;
  onSubmit: (query: string) => void;
  options: Options | null;
}) {
  const [preset, setPreset] = useState("month");
  const operational = [
    "sales",
    "payments",
    "products",
    "deliveries",
    "customers",
    "dealers",
    "profitability",
    "dashboard",
  ].includes(kind);
  return (
    <form
      className="info-panel grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>label]:min-w-0 [&_select]:min-w-0"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(
          new URLSearchParams(
            Object.fromEntries(new FormData(e.currentTarget)) as Record<
              string,
              string
            >,
          ).toString(),
        );
      }}
    >
      <label className="text-sm">
        Date range
        <select
          aria-label="Date range"
          className="field mt-2"
          name="preset"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
        >
          {presets.map((p) => (
            <option key={p} value={p}>
              {
                {
                  today: "Today",
                  yesterday: "Yesterday",
                  last7: "Last 7 days",
                  last30: "Last 30 days",
                  month: "This month",
                  "previous-month": "Previous month",
                  "financial-year": "This financial year",
                  custom: "Custom dates",
                }[p]
              }
            </option>
          ))}
        </select>
      </label>
      {preset === "custom" && (
        <>
          <Input name="from" label="From date" type="date" required />
          <Input name="to" label="To date" type="date" required />
        </>
      )}
      <Input
        name="q"
        label={
          kind === "expenses"
            ? "Expense title or reference"
            : kind === "inventory"
              ? "Product or variant name"
              : kind === "purchases" || kind === "suppliers"
                ? "PO number or supplier"
                : "SO number or customer / dealer"
        }
      />
      {operational && (
        <>
          <label className="text-sm">
            Customer
            <select
              aria-label="Customer"
              name="customerId"
              className="field mt-2"
            >
              <option value="">All customers</option>
              {options?.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Dealer
            <select aria-label="Dealer" name="dealerId" className="field mt-2">
              <option value="">All dealers</option>
              {options?.customers
                .filter((c) => c.dealer)
                .map((c) => (
                  <option key={c.dealer!.id} value={c.dealer!.id}>
                    {c.dealer!.businessName}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm">
            Customer category
            <select
              aria-label="Customer category"
              name="customerCategory"
              className="field mt-2"
            >
              <option value="">Retail and dealer</option>
              <option value="RETAIL">Retail</option>
              <option value="APPROVED_DEALER">Approved dealer sales</option>
            </select>
          </label>
        </>
      )}
      {["purchases", "suppliers"].includes(kind) && (
        <label className="text-sm">
          Supplier
          <select
            aria-label="Supplier"
            name="supplierId"
            className="field mt-2"
          >
            <option value="">All suppliers</option>
            {options?.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {[
        "sales",
        "products",
        "inventory",
        "profitability",
        "purchases",
      ].includes(kind) && (
        <>
          <label className="text-sm">
            Product
            <select
              aria-label="Product"
              name="productId"
              className="field mt-2"
            >
              <option value="">All products</option>
              {options?.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Variant
            <select
              aria-label="Variant"
              name="variantId"
              className="field mt-2"
            >
              <option value="">All pack sizes</option>
              {options?.products.flatMap((p) =>
                p.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {p.name} · {v.packSize}
                  </option>
                )),
              )}
            </select>
          </label>
        </>
      )}
      {["payments", "expenses"].includes(kind) && (
        <label className="text-sm">
          Payment method
          <select
            aria-label="Payment method"
            name="method"
            className="field mt-2"
          >
            <option value="">All methods</option>
            {(kind === "payments"
              ? ["UPI", "BANK"]
              : ["UPI", "BANK", "CASH", "OTHER"]
            ).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      )}
      {kind === "payments" && (
        <>
          <label className="text-sm">
            Current payment status
            <select
              aria-label="Current payment status"
              name="paymentStatus"
              className="field mt-2"
            >
              <option value="">All payment statuses</option>
              {["UNPAID", "PARTIALLY_PAID", "PAID", "OVERPAID"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Proof review status
            <select
              aria-label="Proof review status"
              name="reviewStatus"
              className="field mt-2"
            >
              <option value="">All proof statuses</option>
              {[
                "SUBMITTED",
                "UNDER_REVIEW",
                "VERIFIED",
                "REJECTED",
                "RESUBMISSION_REQUIRED",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {kind === "expenses" && (
        <label className="text-sm">
          Expense category
          <select
            aria-label="Expense category"
            name="category"
            className="field mt-2"
          >
            <option value="">All expense categories</option>
            {expenseCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
      {["sales", "purchases", "expenses", "deliveries"].includes(kind) && (
        <Input
          name="status"
          label={
            kind === "deliveries"
              ? "Delivery status (e.g. DELIVERED)"
              : "Current status (optional)"
          }
        />
      )}
      {kind === "deliveries" && (
        <>
          <label className="text-sm">
            Delivery method
            <select
              aria-label="Delivery method"
              name="deliveryMethod"
              className="field mt-2"
            >
              <option value="">All delivery methods</option>
              <option value="LOCAL">Local delivery</option>
              <option value="COURIER">Courier</option>
            </select>
          </label>
          <Input name="courier" label="Courier company" />
        </>
      )}
      {["profitability", "purchases", "suppliers"].includes(kind) && (
        <label className="text-sm">
          Trend grouping
          <select
            aria-label="Trend grouping"
            name="period"
            className="field mt-2"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      )}
      {["inventory", "purchases", "suppliers", "customers", "dealers"].includes(
        kind,
      ) && (
        <label className="text-sm">
          Report view
          <select aria-label="Report view" name="view" className="field mt-2">
            <option value="summary">Summary records</option>
            {kind === "inventory" ? (
              <option value="movements">Movement history</option>
            ) : kind === "purchases" || kind === "suppliers" ? (
              <option value="receipts">Actual receiving</option>
            ) : (
              <option value="history">Purchase history</option>
            )}
          </select>
        </label>
      )}
      <button className="button self-end" type="submit">
        Apply report filters
      </button>
      <p className="self-end text-xs text-muted">
        Dates use the configured business timezone. Inventory is shown as of the
        range end.
      </p>
    </form>
  );
}
export function BusinessReports({
  kind = "dashboard",
  financial = false,
}: {
  kind?: string;
  financial?: boolean;
}) {
  const [query, setQuery] = useState("preset=month");
  const { data, error } = useLoad<Report | Dashboard>(
    `${root}/${kind}?${query}`,
  );
  const options = useLoad<Options>(`${root}/options`);
  const router = useRouter();
  const report = data && "summary" in data ? data : null;
  const dash = data && "cards" in data ? data : null;
  return (
    <>
      <ReportsNav financial={financial} />
      <Filters kind={kind} onSubmit={setQuery} options={options.data} />
      {options.error && <p role="status">Filter choices: {options.error}</p>}
      {error && (
        <section role="alert" className="info-panel">
          <p>{error}</p>
          <button
            className="text-link mt-3"
            onClick={() => {
              setQuery(
                `preset=month&knowledgeAsOf=${encodeURIComponent(new Date().toISOString())}`,
              );
              router.refresh();
            }}
          >
            Reload current month
          </button>
        </section>
      )}
      {!data && !error && (
        <p role="status" className="py-8 text-muted">
          Loading recorded business activity…
        </p>
      )}
      {data && (
        <>
          <section>
            <p className="text-sm font-medium">
              {data.range.from} to {data.range.to} · {data.range.timezone}
            </p>
            <p className="mt-2 text-xs text-muted">
              Report knowledge cutoff:{" "}
              {new Date(data.range.knowledgeAsOf).toLocaleString()} · Amounts in
              INR
            </p>
            {report && (
              <a
                className="button button-secondary mt-5"
                href={`${root}/${kind}?${query}&knowledgeAsOf=${encodeURIComponent(data.range.knowledgeAsOf)}&format=csv`}
              >
                Export filtered CSV
              </a>
            )}
          </section>
          <Cards metrics={report?.summary ?? dash!.cards} />
          {dash && (
            <section className="info-panel">
              <h2 className="mb-5 text-xl font-semibold">
                Inventory as of selection end
              </h2>
              <Cards metrics={dash.inventorySummary} />
              {!dash.financialAccess && (
                <p className="mt-5 text-sm text-muted">
                  Valuation and estimated profitability require owner financial
                  access.
                </p>
              )}
            </section>
          )}
          <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            {data.charts.map((c) => (
              <BarChart key={c.title} chart={c} />
            ))}
          </div>
          {report && (
            <>
              <section>
                <h2 className="mb-5 text-2xl font-semibold">
                  {kind === "expenses"
                    ? "Business expense records"
                    : "Detailed report"}
                </h2>
                <ReportTable
                  key={report.range.knowledgeAsOf}
                  rows={report.rows}
                />
              </section>
              {kind === "products" && (
                <section>
                  <h2 className="mb-3 text-xl font-semibold">
                    FIXUP QWIK pack-size comparison
                  </h2>
                  <p className="mb-4 text-sm text-muted">
                    Each row is a separate variant. Quantities are packs, not
                    combined adhesive weight.
                  </p>
                  <ReportTable
                    rows={report.rows.filter((r) =>
                      String(r.Product).includes("FIXUP QWIK"),
                    )}
                  />
                </section>
              )}
              {report.details.map((d) => (
                <details className="info-panel" key={d.title}>
                  <summary className="cursor-pointer font-semibold">
                    {d.title}
                  </summary>
                  <div className="mt-5">
                    <ReportTable
                      key={report.range.knowledgeAsOf}
                      rows={d.rows}
                    />
                  </div>
                </details>
              ))}
            </>
          )}
          <details className="info-panel">
            <summary className="cursor-pointer font-semibold">
              Methodology and data limitations
            </summary>
            <p className="mt-4 text-sm leading-7">
              {report?.methodology ?? dash!.methodology}
            </p>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-sm text-muted">
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </>
  );
}
type Expense = {
  id: string;
  title: string;
  category: string;
  amountPaise: number;
  expenseDate: string;
  paymentMethod: string;
  reference: string;
  description: string;
  status: string;
  version: number;
  createdById: string;
  createdAt: string;
  revisions: {
    id: string;
    version: number;
    title: string;
    amountPaise: number;
    status: string;
    actorId: string;
    reason: string;
    createdAt: string;
  }[];
  attachments: {
    id: string;
    originalName: string;
    fileSize: number;
    createdAt: string;
  }[];
};
export function ExpenseEditor({ id }: { id?: string }) {
  const router = useRouter();
  const [reload, setReload] = useState(0);
  const loaded = useLoad<Expense>(
    id ? `/api/v1/admin/expenses/${id}?refresh=${reload}` : null,
  );
  const e = id ? loaded.data : null;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const result = await call<Expense>(
        `/api/v1/admin/expenses${id ? `/${id}` : ""}`,
        id ? "PATCH" : "POST",
        {
          requestId: key,
          ...(e ? { version: e.version } : {}),
          reason: f.get("reason"),
          data: {
            title: f.get("title"),
            category: f.get("category"),
            amountPaise: Math.round(Number(f.get("amount")) * 100),
            expenseDate: f.get("expenseDate"),
            paymentMethod: f.get("paymentMethod"),
            reference: f.get("reference") || "",
            description: f.get("description") || "",
          },
        },
      );
      setKey(crypto.randomUUID());
      if (!id) router.push(`/admin/expenses/${result.id}`);
      else {
        setReload(reload + 1);
        setMessage("Expense saved.");
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (id && !e)
    return <p role="status">{loaded.error || "Loading expense…"}</p>;
  return (
    <>
      <Link href="/admin/reports/expenses" className="text-link">
        ← Expense report
      </Link>
      {e && (
        <section className="info-panel">
          <h2 className="text-xl font-semibold">
            {e.title} · {e.status}
          </h2>
          <p className="mt-3 text-sm text-muted">
            Created {new Date(e.createdAt).toLocaleString()} · Recorded by{" "}
            {e.createdById} · Revision {e.version}
          </p>
        </section>
      )}
      {(!e || e.status === "ACTIVE") && (
        <form
          className="info-panel space-y-5"
          key={e?.version ?? "new"}
          onSubmit={save}
        >
          <fieldset
            disabled={busy}
            className="grid min-w-0 gap-5 sm:grid-cols-2"
          >
            <Input
              name="title"
              label="Expense title"
              value={e?.title}
              required
            />
            <label>
              Expense category
              <select
                aria-label="Expense category"
                name="category"
                className="field mt-2"
                defaultValue={e?.category ?? "TRANSPORTATION"}
              >
                {expenseCategories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <Input
              name="amount"
              label="Expense amount (₹)"
              type="number"
              value={e ? e.amountPaise / 100 : undefined}
              required
            />
            <Input
              name="expenseDate"
              label="Actual expense date"
              type="date"
              value={e?.expenseDate.slice(0, 10)}
              required
            />
            <label>
              Payment method
              <select
                aria-label="Payment method"
                name="paymentMethod"
                className="field mt-2"
                defaultValue={e?.paymentMethod ?? "UPI"}
              >
                {["UPI", "BANK", "CASH", "OTHER"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <Input
              name="reference"
              label="Reference number (optional)"
              value={e?.reference}
            />
            <label className="sm:col-span-2">
              Description
              <textarea
                className="field mt-2"
                rows={3}
                name="description"
                defaultValue={e?.description}
                maxLength={2000}
              />
            </label>
            <Input
              name="reason"
              label="Reason for expense record / edit"
              required
            />
          </fieldset>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : e ? "Save expense changes" : "Record expense"}
          </button>
        </form>
      )}
      <p role="status">{message}</p>
      {e && (
        <>
          <ExpenseFiles expense={e} reload={() => setReload(reload + 1)} />
          {e.status === "ACTIVE" && (
            <form
              className="info-panel space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                setBusy(true);
                setMessage("");
                try {
                  await call(`/api/v1/admin/expenses/${id}`, "POST", {
                    requestId: crypto.randomUUID(),
                    version: e.version,
                    action: "CANCEL",
                    reason: f.get("reason"),
                  });
                  setReload(reload + 1);
                  setMessage("Expense cancelled. Original history preserved.");
                } catch (error) {
                  setMessage((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2 className="text-xl font-semibold">
                Cancel incorrect expense
              </h2>
              <p className="text-sm text-muted">
                Cancellation removes this record from active expenses and
                preserves every revision. No bank transfer or refund is
                initiated.
              </p>
              <Input name="reason" label="Cancellation reason" required />
              <button className="button button-secondary" disabled={busy}>
                Cancel expense record
              </button>
            </form>
          )}
          <section className="info-panel">
            <h2 className="mb-4 text-xl font-semibold">
              Expense audit history
            </h2>
            <ol className="divide-y divide-line">
              {e.revisions.map((r) => (
                <li key={r.id} className="py-4 text-sm">
                  <p>
                    Revision {r.version} · {r.status} ·{" "}
                    {currency(r.amountPaise)}
                  </p>
                  <p className="mt-2">
                    {r.title} · {r.reason}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {new Date(r.createdAt).toLocaleString()} · Recorded by{" "}
                    {r.actorId}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </>
  );
}
function ExpenseFiles({
  expense,
  reload,
}: {
  expense: Expense;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section className="info-panel">
      <h2 className="mb-4 text-xl font-semibold">Private expense receipts</h2>
      <p className="mb-4 text-sm text-muted">
        Optional PNG, JPEG or WebP photograph/scanned receipt, up to 5 MiB and
        16 megapixels. Access is restricted to authorized expense staff.
      </p>
      {expense.status === "ACTIVE" && (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            f.set("requestId", crypto.randomUUID());
            setBusy(true);
            try {
              const r = await fetch(
                `/api/v1/admin/expenses/${expense.id}/attachments`,
                { method: "POST", body: f },
              );
              const result = await r.json();
              if (!r.ok)
                throw new Error(result.error?.message ?? "Upload failed.");
              setMessage("Private receipt attached.");
              reload();
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Receipt image
            <input
              className="field mt-2"
              name="file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required
            />
          </label>
          <button className="button button-secondary" disabled={busy}>
            Attach private receipt
          </button>
        </form>
      )}
      <p role="status" className="my-3 text-sm">
        {message}
      </p>
      <ul>
        {expense.attachments.map((a) => (
          <li key={a.id} className="my-3">
            <a
              className="text-link"
              href={`/api/v1/expense-attachments/${a.id}`}
              target="_blank"
              rel="noreferrer"
            >
              {a.originalName} ↗
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
