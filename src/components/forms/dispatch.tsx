"use client";
import {
  useEffect,
  useState,
  useCallback,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { transition, statuses } from "@/modules/dispatch/rules";
import type {
  dispatchDetail,
  queue,
  customerDispatch,
} from "@/modules/dispatch/service";
type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;
type Shipment = Serialized<Awaited<ReturnType<typeof dispatchDetail>>>;
type Tracking = Serialized<ReturnType<typeof customerDispatch>>;
const root = "/api/v1/admin/dispatch";
const label = (v: string) =>
  v.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
async function call<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method,
    cache: "no-store",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await r.json();
  if (!r.ok)
    throw new Error(result.error?.message ?? "Unable to complete request.");
  return result.data;
}
function useData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setData(await call<T>(url));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [url]);
  useEffect(() => {
    let live = true;
    call<T>(url).then(
      (d) => {
        if (live) setData(d);
      },
      (e) => {
        if (live) setError(e.message);
      },
    );
    return () => {
      live = false;
    };
  }, [url]);
  return { data, error, reload };
}
function Field({
  name,
  caption,
  type = "text",
  value,
  required = false,
}: {
  name: string;
  caption: string;
  type?: string;
  value?: string | number;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      {caption}
      <input
        className="field mt-1"
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={type === "number" ? 1 : undefined}
        maxLength={1000}
      />
    </label>
  );
}
function Summary({ values }: { values: unknown }) {
  return (
    <dl className="my-4 grid gap-3 sm:grid-cols-2">
      {values && typeof values === "object"
        ? Object.entries(values)
            .filter(([, v]) => v !== null && v !== "")
            .map(([key, value]) => (
              <div key={key} className="min-w-0">
                <dt className="text-xs text-muted">{label(key)}</dt>
                <dd className="break-words text-sm">
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
                </dd>
              </div>
            ))
        : null}
    </dl>
  );
}
function Mutation({
  submit,
  children,
  caption,
}: {
  submit: (form: FormData) => Promise<unknown>;
  children: ReactNode;
  caption: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await submit(new FormData(e.currentTarget));
      setMessage("Saved successfully.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={send} className="space-y-5">
      <fieldset className="min-w-0 space-y-5" disabled={busy}>
        {children}
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : caption}
        </button>
      </fieldset>
      <p role="status" className="text-sm">
        {message}
      </p>
    </form>
  );
}
const date = (v?: string | null) => v?.slice(0, 10) ?? "";
function shipmentData(form: FormData) {
  const method = String(form.get("method"));
  const result: Record<string, unknown> = {
    method,
    packageCount: Number(form.get("packageCount")),
    scheduledDate: form.get("scheduledDate"),
    expectedDate: form.get("expectedDate") || null,
    instructions: form.get("instructions") || "",
    internalRemarks: form.get("internalRemarks") || "",
  };
  for (const key of method === "LOCAL"
    ? ["personName", "personPhone", "vehicleNumber"]
    : [
        "courierName",
        "courierService",
        "awb",
        "shippingReference",
        "trackingTemplate",
      ])
    result[key] = form.get(key) || "";
  if (method === "COURIER")
    result.bookingDate = form.get("bookingDate") || null;
  return result;
}
function ShipmentForm({
  initial,
  orderId,
  reload,
}: {
  initial?: Shipment;
  orderId?: string;
  reload?: () => Promise<void>;
}) {
  const [method, setMethod] = useState(initial?.method ?? "LOCAL");
  const router = useRouter();
  const [key] = useState(() => crypto.randomUUID());
  return (
    <Mutation
      caption={initial ? "Save delivery arrangements" : "Create draft dispatch"}
      submit={async (form) => {
        const d = await call<{ id: string }>(
          initial ? `${root}/${initial.id}` : root,
          initial ? "PATCH" : "POST",
          {
            requestId: key,
            ...(initial
              ? { version: initial.version }
              : { orderId: form.get("orderId") }),
            shipment: shipmentData(form),
            reason: form.get("reason"),
          },
        );
        if (initial) await reload?.();
        else router.push(`/admin/dispatch/${d.id}`);
      }}
    >
      {!initial && (
        <Field
          name="orderId"
          caption="Sales order reference"
          value={orderId}
          required
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Delivery method
          <select
            className="field mt-1"
            name="method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="LOCAL">Own local delivery</option>
            <option value="COURIER">External courier</option>
          </select>
        </label>
        <Field
          name="packageCount"
          caption="Actual package count"
          type="number"
          value={initial?.packageCount}
          required
        />
        <Field
          name="scheduledDate"
          caption="Dispatch date"
          type="date"
          value={date(initial?.scheduledDate)}
          required
        />
        <Field
          name="expectedDate"
          caption="Expected delivery date (optional)"
          type="date"
          value={date(initial?.expectedDate)}
        />
      </div>
      {method === "LOCAL" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="personName"
            caption="Delivery person name"
            value={initial?.personName}
          />
          <Field
            name="personPhone"
            caption="Delivery person mobile"
            type="tel"
            value={initial?.personPhone}
          />
          <Field
            name="vehicleNumber"
            caption="Vehicle number (optional)"
            value={initial?.vehicleNumber}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="courierName"
              caption="Courier company"
              value={initial?.courierName}
            />
            <Field
              name="courierService"
              caption="Courier service (optional)"
              value={initial?.courierService}
            />
            <Field
              name="awb"
              caption="AWB / tracking number"
              value={initial?.awb}
            />
            <Field
              name="bookingDate"
              caption="Booking date"
              type="date"
              value={date(initial?.bookingDate)}
            />
            <Field
              name="shippingReference"
              caption="Shipping reference (optional)"
              value={initial?.shippingReference}
            />
            <Field
              name="trackingTemplate"
              caption="Verified tracking URL template (optional)"
              value={initial?.trackingTemplate}
            />
          </div>
          <p className="text-xs text-muted">
            Use the courier’s known HTTPS format with one {"{awb}"} placeholder.
            Tracking is updated manually; no live courier connection.
          </p>
        </>
      )}
      <Field
        name="instructions"
        caption="Delivery instructions (visible to customer)"
        value={initial?.instructions}
      />
      <Field
        name="internalRemarks"
        caption="Internal remarks / courier notes"
        value={initial?.internalRemarks}
      />
      <Field name="reason" caption="Reason for change" required />
    </Mutation>
  );
}
export function DispatchCreate({ orderId }: { orderId?: string }) {
  return (
    <section className="info-panel">
      <p className="mb-6 text-muted">
        Only fully verified, eligible orders can be prepared. A draft does not
        consume reservations or deduct stock. Enter the actual packing and
        delivery details.
      </p>
      <ShipmentForm orderId={orderId} />
    </section>
  );
}
export function DispatchQueue({
  initialView = "all",
  initialSearch = "",
}: {
  initialView?: string;
  initialSearch?: string;
}) {
  const [query, setQuery] = useState(
    `?view=${initialView}&q=${encodeURIComponent(initialSearch)}`,
  );
  const { data, error } = useData<
    Serialized<Awaited<ReturnType<typeof queue>>>
  >(`${root}${query}`);
  const tabs = [
    ["all", "Dispatch dashboard"],
    ["ready", "Ready for dispatch"],
    ["history", "Dispatch history"],
    ["local", "Local deliveries"],
    ["courier", "Courier shipments"],
    ["failed", "Failed deliveries"],
  ];
  return (
    <>
      <nav className="flex flex-wrap gap-3" aria-label="Dispatch navigation">
        {tabs.map(([v, title]) => (
          <Link
            className="text-link"
            key={v}
            href={`/admin/dispatch?view=${v}`}
          >
            {title}
          </Link>
        ))}
        <Link className="text-link" href="/admin/dispatch?view=all">
          Delivery tracking
        </Link>
      </nav>
      <form
        className="info-panel grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(
            `?${new URLSearchParams(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>)}`,
          );
        }}
      >
        <Field
          name="q"
          caption="Order number or customer / dealer"
          value={initialSearch}
        />
        <Field name="from" caption="Order date from" type="date" />
        <Field name="to" caption="Order date to" type="date" />
        <Field name="status" caption="Order status" />
        <label>
          Dispatch status
          <select name="dispatchStatus" className="field">
            <option value="">All dispatch statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="CONFIRMED">Confirmed</option>
          </select>
        </label>
        <label>
          Delivery method
          <select name="method" className="field">
            <option value="">All methods</option>
            <option value="LOCAL">Local</option>
            <option value="COURIER">Courier</option>
          </select>
        </label>
        <label>
          Delivery status
          <select name="deliveryStatus" className="field">
            <option value="">All delivery statuses</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Queue
          <select name="view" className="field" defaultValue={initialView}>
            {[...tabs, ["blocked", "Blocked orders"]].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button className="button self-end">Filter dispatches</button>
      </form>
      <p role="status">{error}</p>
      {data && (
        <>
          <p className="text-sm text-muted">
            Showing up to {data.limit} matching orders. Narrow filters for older
            records.
          </p>
          {[
            ["Ready for dispatch", data.items.filter((i) => i.eligible)],
            [
              "Blocked from dispatch",
              data.items.filter(
                (i) => !i.eligible && i.dispatch?.status !== "CONFIRMED",
              ),
            ],
            [
              "Dispatch & delivery history",
              data.items.filter((i) => i.dispatch?.status === "CONFIRMED"),
            ],
          ].map(([title, rows]) => (
            <section key={String(title)}>
              <h2 className="mb-4 text-2xl font-semibold">{String(title)}</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {(rows as typeof data.items).map((o) => (
                  <article className="info-panel" key={o.id}>
                    <Link
                      href={`/admin/sales/orders/${o.id}`}
                      className="text-link font-semibold"
                    >
                      {o.number}
                    </Link>
                    <Summary values={o.customer} />
                    <p className="text-sm">
                      {new Date(o.createdAt).toLocaleString()} ·{" "}
                      {label(o.paymentStatus)} · {o.productCount} variants ·{" "}
                      {o.totalQuantity} units
                    </p>
                    <Summary values={o.address} />
                    <p className="my-3 text-sm">
                      {label(o.status)} ·{" "}
                      {o.dispatch
                        ? `${o.dispatch.method} / ${label(o.dispatch.deliveryStatus)}`
                        : "Delivery method not selected"}
                    </p>
                    {o.dispatch?.status !== "CONFIRMED" &&
                      o.reasons.length > 0 && (
                        <ul className="my-4 list-disc pl-5 text-sm text-muted">
                          {o.reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      )}
                    {o.dispatch ? (
                      <Link
                        className="button button-secondary"
                        href={`/admin/dispatch/${o.dispatch.id}`}
                      >
                        {o.dispatch.number}
                      </Link>
                    ) : o.eligible ? (
                      <Link
                        className="button"
                        href={`/admin/dispatch/new?orderId=${o.id}`}
                      >
                        Prepare dispatch
                      </Link>
                    ) : null}
                  </article>
                ))}
              </div>
              {!(rows as typeof data.items).length && (
                <p className="text-muted">No matching orders.</p>
              )}
            </section>
          ))}
        </>
      )}
    </>
  );
}
function Packing({ d, reload }: { d: Shipment; reload: () => Promise<void> }) {
  const [rows, setRows] = useState(() =>
    d.lines.flatMap((l) =>
      l.allocations.length
        ? l.allocations.map((a) => ({
            key: a.id,
            lineId: l.id,
            lotId: a.lotId,
            quantity: a.quantity,
          }))
        : [{ key: l.id, lineId: l.id, lotId: "", quantity: l.quantity }],
    ),
  );
  const [key] = useState(() => crypto.randomUUID());
  return (
    <Mutation
      caption="Save full-order allocation"
      submit={async () => {
        await call(`${root}/${d.id}/allocations`, "POST", {
          requestId: key,
          version: d.version,
          reason: "Staff reviewed the actual full-order lot allocation",
          allocations: rows.map(({ lineId, lotId, quantity }) => ({
            lineId,
            lotId,
            quantity,
          })),
        });
        await reload();
      }}
    >
      <p className="text-sm text-muted">
        Choose actual lots. Every ordered unit must be allocated. Multiple lots
        may supply one line. Saving allocations does not deduct stock.
      </p>
      {rows.map((row, i) => {
        const line = d.lines.find((l) => l.id === row.lineId)!;
        return (
          <div
            className="grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-[2fr_1fr_auto]"
            key={row.key}
          >
            <label>
              {line.orderLine.variantName} · ordered {line.quantity}
              <select
                className="field"
                aria-label={`Stock lot ${i + 1}`}
                required
                value={row.lotId}
                onChange={(e) =>
                  setRows(
                    rows.map((r, j) =>
                      i === j ? { ...r, lotId: e.target.value } : r,
                    ),
                  )
                }
              >
                <option value="">Choose actual stock lot</option>
                {d.lots
                  .filter((l) => l.variantId === line.orderLine.variantId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.batchNumber || l.id} · {l.onHand} units
                      {l.expiresAt ? ` · expires ${date(l.expiresAt)}` : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Quantity
              <input
                className="field"
                aria-label={`Allocated quantity ${i + 1}`}
                required
                type="number"
                min="1"
                max="10000"
                value={row.quantity}
                onChange={(e) =>
                  setRows(
                    rows.map((r, j) =>
                      i === j ? { ...r, quantity: Number(e.target.value) } : r,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="text-link"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
            >
              Remove lot
            </button>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3">
        {d.lines.map((l) => (
          <button
            key={l.id}
            type="button"
            className="button button-secondary"
            onClick={() =>
              setRows([
                ...rows,
                {
                  key: crypto.randomUUID(),
                  lineId: l.id,
                  lotId: "",
                  quantity: l.quantity,
                },
              ])
            }
          >
            Add lot for {l.orderLine.packSize}
          </button>
        ))}
      </div>
    </Mutation>
  );
}
function Action({ d, reload }: { d: Shipment; reload: () => Promise<void> }) {
  const options =
    d.status === "DRAFT"
      ? ["CONFIRM"]
      : [
          "IN_TRANSIT",
          "OUT_FOR_DELIVERY",
          "DELIVERED",
          "DELIVERY_FAILED",
          "RESCHEDULE",
          "RETURNED",
          ...(d.canCorrect ? ["CORRECT"] : []),
        ].filter((a) => transition(d.method, d.deliveryStatus, a));
  const [action, setAction] = useState(options[0] ?? "");
  const [key] = useState(() => crypto.randomUUID());
  if (!options.length) return null;
  return (
    <Mutation
      caption={
        action === "CONFIRM"
          ? "Confirm dispatch & deduct stock"
          : "Record delivery update"
      }
      submit={async (form) => {
        await call(`${root}/${d.id}`, "POST", {
          requestId: key,
          version: d.version,
          action,
          reason: form.get("reason"),
          confirmed: form.get("confirmed") === "on",
          occurredAt:
            action === "CONFIRM" || !form.get("occurredAt")
              ? new Date().toISOString()
              : new Date(String(form.get("occurredAt"))).toISOString(),
          publicMessage: form.get("publicMessage") || "",
          internalRemarks: form.get("internalRemarks") || "",
          reference: form.get("reference") || "",
          recipientName: form.get("recipientName") || "",
          confirmationSource: form.get("confirmationSource") || "",
          ...(action === "RESCHEDULE"
            ? { expectedDate: form.get("expectedDate") }
            : {}),
        });
        await reload();
      }}
    >
      <label>
        Delivery action
        <select
          aria-label="Delivery action"
          className="field"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          {options.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      {action !== "CONFIRM" && (
        <Field
          name="occurredAt"
          caption="Actual event date and time (blank for now)"
          type="datetime-local"
        />
      )}
      {action === "DELIVERED" && (
        <>
          <Field name="recipientName" caption="Recipient name" required />
          <Field
            name="confirmationSource"
            caption="Source of delivery confirmation"
            required
          />
        </>
      )}
      {action === "RESCHEDULE" && (
        <Field
          name="expectedDate"
          caption="Rescheduled delivery date"
          type="date"
          required
        />
      )}
      {action === "RETURNED" && (
        <Field name="reference" caption="Return-to-sender reference" required />
      )}
      <Field name="reason" caption="Reason / failure reason" required />
      <Field
        name="publicMessage"
        caption="Customer delivery message (optional)"
      />
      <Field
        name="internalRemarks"
        caption="Internal update remarks (optional)"
      />
      <label className="flex gap-3 items-start">
        <input name="confirmed" type="checkbox" required className="mt-1" />
        {action === "CONFIRM"
          ? "I reviewed the actual packages, all variant quantities and selected lots. Confirm dispatch and deduct these quantities once."
          : "I confirm this delivery event was checked. Status updates do not restore inventory."}
      </label>
    </Mutation>
  );
}
function ProofUpload({
  d,
  reload,
}: {
  d: Shipment;
  reload: () => Promise<void>;
}) {
  const [key] = useState(() => crypto.randomUUID());
  return (
    <Mutation
      caption="Upload private delivery proof"
      submit={async (form) => {
        form.set("requestId", key);
        form.set(
          "sharedWithCustomer",
          form.get("sharedWithCustomer") === "on" ? "true" : "false",
        );
        const r = await fetch(`${root}/${d.id}/proofs`, {
          method: "POST",
          body: form,
        });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error?.message ?? "Upload failed.");
        await reload();
      }}
    >
      <p className="text-sm text-muted">
        PNG, JPEG or WebP photograph/scanned document, up to 5 MiB and 16
        megapixels. Files stay private. Uploading does not mark delivery
        complete.
      </p>
      <Field name="source" caption="Evidence source" required />
      <label className="block">
        Delivery photograph / scanned document
        <input
          name="file"
          className="field mt-2"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
        />
      </label>
      <label className="flex gap-3">
        <input type="checkbox" name="sharedWithCustomer" />
        Allow this order’s customer to view this evidence
      </label>
    </Mutation>
  );
}
function ReturnForm({
  d,
  reload,
}: {
  d: Shipment;
  reload: () => Promise<void>;
}) {
  const [key] = useState(() => crypto.randomUUID());
  return (
    <Mutation
      caption="Record inspected physical return"
      submit={async (f) => {
        await call(`${root}/${d.id}/physical-return`, "POST", {
          requestId: key,
          allocationId: f.get("allocationId"),
          quantity: Number(f.get("quantity")),
          condition: f.get("condition"),
          reference: f.get("reference"),
          reason: f.get("reason"),
          receivedAt: f.get("receivedAt")
            ? new Date(String(f.get("receivedAt"))).toISOString()
            : new Date().toISOString(),
          inspectedPhysicalReturn: f.get("inspectedPhysicalReturn") === "on",
        });
        await reload();
      }}
    >
      <p className="text-sm text-muted">
        Owner-only correction. Record only goods physically received and
        inspected. Original dispatch and deduction remain in the ledger. This
        does not issue a refund or reopen the order.
      </p>
      <label>
        Original dispatched lot
        <select name="allocationId" className="field" required>
          {d.lines.flatMap((l) =>
            l.allocations.map((a) => (
              <option key={a.id} value={a.id}>
                {l.orderLine.variantName} · {a.lot.batchNumber || a.lotId} ·
                dispatched {a.quantity}, returned{" "}
                {a.returns.reduce((s, r) => s + r.quantity, 0)}
              </option>
            )),
          )}
        </select>
      </label>
      <Field
        name="quantity"
        caption="Physically returned quantity"
        type="number"
        required
      />
      <label>
        Inspected condition
        <select name="condition" className="field">
          <option value="GOOD">Good: return to undamaged stock</option>
          <option value="DAMAGED">Damaged: keep out of available stock</option>
        </select>
      </label>
      <Field
        name="receivedAt"
        caption="Physical receipt date and time (blank for now)"
        type="datetime-local"
      />
      <Field
        name="reference"
        caption="Physical receipt / inspection reference"
        required
      />
      <Field name="reason" caption="Correction reason" required />
      <label className="flex gap-3">
        <input name="inspectedPhysicalReturn" type="checkbox" required />I
        inspected these physically returned goods and verified their count and
        condition
      </label>
    </Mutation>
  );
}
export function DispatchView({ id }: { id: string }) {
  const { data: d, error, reload } = useData<Shipment>(`${root}/${id}`);
  return (
    <>
      <p role="status">{error}</p>
      {d && (
        <>
          <section className="info-panel">
            <h2 className="text-2xl font-semibold">{d.number}</h2>
            <p className="my-3">
              {d.status} · {label(d.deliveryStatus)} · {d.method}
            </p>
            <Link
              className="text-link"
              href={`/admin/sales/orders/${d.orderId}`}
            >
              {d.order.number}
            </Link>
            <Summary values={d.order.customerSnapshot} />
            <h3 className="font-semibold">Delivery address</h3>
            <Summary values={d.order.addressSnapshot} />
            <Summary
              values={{
                packages: d.packageCount,
                dispatchDate: date(d.scheduledDate),
                confirmedAt: d.confirmedAt,
                confirmedBy: d.confirmedById,
                expectedDelivery: date(d.expectedDate),
                person: d.personName,
                mobile: d.personPhone,
                vehicle: d.vehicleNumber,
                courier: d.courierName,
                service: d.courierService,
                awb: d.awb,
                bookingDate: date(d.bookingDate),
                shippingReference: d.shippingReference,
                instructions: d.instructions,
                internalRemarks: d.internalRemarks,
              }}
            />
            <ul className="my-4 divide-y divide-line">
              {d.lines.map((l) => (
                <li className="py-3" key={l.id}>
                  {l.orderLine.productName} · {l.orderLine.packSize} ×{" "}
                  {l.quantity}
                  <ul className="text-xs text-muted">
                    {l.allocations.map((a) => (
                      <li className="mt-2 break-words" key={a.id}>
                        Lot {a.lot.batchNumber || a.lotId}: {a.quantity} units ·
                        physical returns{" "}
                        {a.returns.reduce((s, r) => s + r.quantity, 0)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            {d.status === "DRAFT" && (
              <div className="rounded-lg bg-slate-50 p-4">
                <h3 className="font-semibold">
                  {d.eligibility.eligible
                    ? "Order is eligible; review allocation before confirmation"
                    : "Dispatch blocked"}
                </h3>
                <ul>
                  {d.eligibility.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          {(d.status === "DRAFT" || d.deliveryStatus === "DELIVERY_FAILED") && (
            <details className="info-panel">
              <summary className="cursor-pointer text-xl font-semibold">
                Edit delivery arrangements
              </summary>
              <div className="mt-5">
                <ShipmentForm key={d.version} initial={d} reload={reload} />
              </div>
            </details>
          )}
          {d.status === "DRAFT" && (
            <section className="info-panel">
              <h2 className="mb-5 text-xl font-semibold">
                Review packing & stock lots
              </h2>
              <Packing key={d.version} d={d} reload={reload} />
            </section>
          )}
          <section className="info-panel">
            <h2 className="mb-5 text-xl font-semibold">
              {d.status === "DRAFT" ? "Confirm dispatch" : "Update delivery"}
            </h2>
            <Action key={d.version} d={d} reload={reload} />
          </section>
          {d.status === "CONFIRMED" && (
            <section className="info-panel">
              <h2 className="mb-5 text-xl font-semibold">Proof of delivery</h2>
              <ProofUpload key={d.proofs.length} d={d} reload={reload} />
              <ul className="mt-4">
                {d.proofs.map((p) => (
                  <li className="py-2" key={p.id}>
                    <a
                      className="text-link"
                      href={`/api/v1/delivery-proofs/${p.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {p.source} ↗
                    </a>{" "}
                    ·{" "}
                    {p.sharedWithCustomer
                      ? "Shared with customer"
                      : "Staff only"}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {d.canCorrect && d.deliveryStatus === "RETURNED" && (
            <section className="info-panel">
              <h2 className="mb-5 text-xl font-semibold">
                Physical stock-return correction
              </h2>
              <ReturnForm key={d.version} d={d} reload={reload} />
            </section>
          )}
          <section className="info-panel">
            <h2 className="text-xl font-semibold">
              Delivery status & audit history
            </h2>
            <ol className="divide-y divide-line">
              {d.events.map((e) => (
                <li className="py-4" key={e.id}>
                  <p>
                    {label(e.status)} ·{" "}
                    {new Date(e.occurredAt).toLocaleString()}
                  </p>
                  <p className="mt-2">{e.message}</p>
                  <p className="mt-2 text-sm text-muted">
                    Recorded by {e.actorId} · {e.reason}
                    {e.reference && ` · Reference: ${e.reference}`}
                  </p>
                  {e.internalRemarks && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm">
                        Internal record
                      </summary>
                      <p className="mt-2 break-all whitespace-pre-wrap text-xs">
                        {e.internalRemarks}
                      </p>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </>
  );
}
export function DeliveryTracking({ orderId }: { orderId: string }) {
  const { data: d, error } = useData<Tracking>(
    `/api/v1/me/orders/${orderId}/delivery`,
  );
  return (
    <section className="info-panel">
      <h2 className="text-xl font-semibold">Delivery tracking</h2>
      <p role="status">{error}</p>
      {!d && !error ? (
        <p className="mt-4 text-muted">
          Dispatch details will appear here when FIXUP prepares your order.
        </p>
      ) : (
        d && (
          <>
            <p className="my-4">
              {d.number} · {label(d.deliveryStatus)}
            </p>
            <Summary
              values={{
                salesOrder: d.orderNumber,
                payment: d.paymentStatus,
                dispatch: d.status,
                method: d.method,
                dispatchDate: d.confirmedAt
                  ? new Date(d.confirmedAt).toLocaleString()
                  : null,
                expectedDelivery: date(d.expectedDate),
                deliveryPerson: d.personName,
                mobile: d.personPhone,
                courier: d.courierName,
                awb: d.awb,
                instructions: d.instructions,
                deliveredAt: d.deliveredAt
                  ? new Date(d.deliveredAt).toLocaleString()
                  : null,
                recipient: d.recipientName,
              }}
            />
            {d.method === "COURIER" && (
              <p className="my-4 text-sm text-muted">
                Courier updates are recorded manually by FIXUP.{" "}
                {d.trackingUrl && (
                  <a
                    className="text-link"
                    href={d.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Visit courier tracking ↗
                  </a>
                )}
              </p>
            )}
            <ol className="divide-y divide-line">
              {d.events.map((e) => (
                <li key={e.id} className="py-3">
                  <p className="text-xs text-muted">
                    {new Date(e.occurredAt).toLocaleString()}
                  </p>
                  <p>{e.message}</p>
                </li>
              ))}
            </ol>
            {d.proofs.map((p) => (
              <p key={p.id} className="mt-3">
                <a
                  className="text-link"
                  href={`/api/v1/delivery-proofs/${p.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Delivery evidence: {p.source} ↗
                </a>
              </p>
            ))}
          </>
        )
      )}
    </section>
  );
}
