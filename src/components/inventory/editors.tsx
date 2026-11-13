"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
type Choice = { id: string; name: string };
type Line = {
  variantId: string;
  quantity: number;
  ratePaise: number;
  taxBps: number;
  discountPaise: number;
};
export function PurchaseEditor({
  suppliers,
  variants,
  initial,
}: {
  suppliers: Choice[];
  variants: Choice[];
  initial?: {
    id: string;
    requestId: string;
    supplierId: string;
    expectedDate: string;
    notes: string;
    version: number;
    lines: Line[];
  };
}) {
  const requestId = useRef(initial?.requestId ?? crypto.randomUUID());
  const [lines, setLines] = useState(
    () =>
      initial?.lines.map((l, i) => ({
        key: String(i),
        variantId: l.variantId,
        quantity: String(l.quantity),
        rate: String(l.ratePaise / 100),
        tax: String(l.taxBps / 100),
        discount: String(l.discountPaise / 100),
      })) ?? [],
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(
        `/api/v1/admin/operations/purchase-orders${initial ? `/${initial.id}` : ""}`,
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: requestId.current,
            supplierId: f.get("supplierId"),
            expectedDate: f.get("expectedDate"),
            notes: f.get("notes"),
            reason: f.get("reason"),
            ...(initial ? { version: initial.version } : {}),
            lines: lines.map((l) => ({
              variantId: l.variantId,
              quantity: Number(l.quantity),
              ratePaise: Math.round(Number(l.rate) * 100),
              taxBps: Math.round(Number(l.tax) * 100),
              discountPaise: Math.round(Number(l.discount) * 100),
            })),
          }),
        },
      );
      const body = await r.json();
      if (r.ok) {
        router.push(`/admin/operations/purchase-orders/${body.data.id}`);
        router.refresh();
        setMessage("Draft saved. Review calculated totals before submitting.");
      } else setMessage(body.error?.message ?? "Unable to save.");
    } catch {
      setMessage(
        "Unable to confirm save. Retry without changing data to reuse this request safely.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="management-form space-y-5">
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        <label className="block">
          Supplier
          <select
            aria-label="Supplier"
            name="supplierId"
            required
            defaultValue={initial?.supplierId ?? ""}
          >
            <option value="">Choose an active supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Expected delivery date (optional)
          <input
            name="expectedDate"
            type="date"
            defaultValue={initial?.expectedDate}
          />
        </label>
        <p className="text-sm text-muted">
          Quantities are units of each pack. Enter actual supplier rates in INR.
          Discount is a fixed amount per line; explicit tax percent applies
          after discount, rounded to the nearest paise. No tax rate is assumed.
          Totals are calculated when saved; stock changes only after GRN
          confirmation.
        </p>
        {lines.map((l, i) => (
          <section
            className="grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-2"
            key={l.key}
          >
            <label className="sm:col-span-2">
              Variant {i + 1}
              <select
                aria-label={`Variant ${i + 1}`}
                required
                value={l.variantId}
                onChange={(e) =>
                  setLines(
                    lines.map((x, j) =>
                      i === j ? { ...x, variantId: e.target.value } : x,
                    ),
                  )
                }
              >
                <option value="">Choose variant</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["quantity", "Quantity", "1", "1000000", "1"],
                ["rate", "Purchase rate (₹)", "0.01", "1000000", "0.01"],
                ["tax", "Tax (%)", "0", "100", "0.01"],
                ["discount", "Line discount (₹)", "0", "20000000", "0.01"],
              ] as const
            ).map(([key, label, min, max, step]) => (
              <label key={key}>
                {label}
                <input
                  aria-label={`${label} ${i + 1}`}
                  type="number"
                  required
                  min={min}
                  max={max}
                  step={step}
                  value={l[key]}
                  onChange={(e) =>
                    setLines(
                      lines.map((x, j) =>
                        i === j ? { ...x, [key]: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
            ))}
            <button
              type="button"
              className="text-link"
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
            >
              Remove line {i + 1}
            </button>
          </section>
        ))}
        <button
          type="button"
          className="button button-secondary"
          disabled={lines.length >= 50}
          onClick={() =>
            setLines([
              ...lines,
              {
                key: crypto.randomUUID(),
                variantId: "",
                quantity: "",
                rate: "",
                tax: "",
                discount: "0",
              },
            ])
          }
        >
          Add variant
        </button>
        <label className="block">
          Internal notes
          <textarea
            name="notes"
            defaultValue={initial?.notes}
            maxLength={2000}
          />
        </label>
        <label className="block">
          Reason for change
          <input name="reason" required minLength={5} maxLength={350} />
        </label>
        <button className="button" disabled={!lines.length}>
          Save PO draft
        </button>
      </fieldset>
      <p role="status">{message}</p>
    </form>
  );
}
type ReceiveLine = {
  id: string;
  name: string;
  remaining: number;
  quantity?: number;
  batchNumber?: string | null;
  manufacturedAt?: string | null;
  expiresAt?: string | null;
};
export function ReceiptEditor({
  purchaseOrderId,
  lines,
  initial,
}: {
  purchaseOrderId: string;
  lines: ReceiveLine[];
  initial?: {
    id: string;
    requestId: string;
    invoiceReference: string;
    notes: string;
    version: number;
  };
}) {
  const requestId = useRef(initial?.requestId ?? crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(
        `/api/v1/admin/operations/goods-receiving${initial ? `/${initial.id}` : ""}`,
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: requestId.current,
            purchaseOrderId,
            invoiceReference: f.get("invoiceReference"),
            notes: f.get("notes"),
            reason: f.get("reason"),
            ...(initial ? { version: initial.version } : {}),
            lines: lines
              .filter((l) => Number(f.get(`qty-${l.id}`)) > 0)
              .map((l) => ({
                purchaseLineId: l.id,
                quantity: Number(f.get(`qty-${l.id}`)),
                batchNumber: f.get(`batch-${l.id}`) || null,
                manufacturedAt: f.get(`mfg-${l.id}`) || null,
                expiresAt: f.get(`expiry-${l.id}`) || null,
              })),
          }),
        },
      );
      const body = await r.json();
      if (r.ok) {
        router.push(`/admin/operations/goods-receiving/${body.data.id}`);
        router.refresh();
        setMessage("GRN draft saved. Stock is unchanged until confirmation.");
      } else setMessage(body.error?.message ?? "Unable to save.");
    } catch {
      setMessage("Unable to confirm save. Retry the same request safely.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="management-form space-y-5">
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        <p className="text-sm text-muted">
          Enter only quantities actually received. Leave other lines at zero.
          Dates and batch numbers are optional supplied information; expiry is
          never calculated.
        </p>
        <label className="block">
          Supplier invoice / reference (optional)
          <input
            name="invoiceReference"
            defaultValue={initial?.invoiceReference}
            maxLength={150}
          />
        </label>
        {lines.map((l) => (
          <section
            key={l.id}
            className="grid gap-4 rounded-lg border border-line p-4 sm:grid-cols-2"
          >
            <h2 className="font-semibold sm:col-span-2">
              {l.name} · Remaining {l.remaining}
            </h2>
            <label>
              Received quantity
              <input
                name={`qty-${l.id}`}
                aria-label={`Received quantity ${l.name}`}
                type="number"
                min="0"
                max={l.remaining}
                step="1"
                defaultValue={l.quantity ?? 0}
              />
            </label>
            <label>
              Batch number (optional)
              <input
                name={`batch-${l.id}`}
                defaultValue={l.batchNumber ?? ""}
                maxLength={100}
              />
            </label>
            <label>
              Manufacturing date (optional)
              <input
                type="date"
                name={`mfg-${l.id}`}
                defaultValue={l.manufacturedAt ?? ""}
              />
            </label>
            <label>
              Expiry date (optional)
              <input
                type="date"
                name={`expiry-${l.id}`}
                defaultValue={l.expiresAt ?? ""}
              />
            </label>
          </section>
        ))}
        <label className="block">
          Internal notes
          <textarea
            name="notes"
            defaultValue={initial?.notes}
            maxLength={2000}
          />
        </label>
        <label className="block">
          Reason for change
          <input name="reason" required minLength={5} maxLength={350} />
        </label>
        <button className="button">Save GRN draft</button>
      </fieldset>
      <p role="status">{message}</p>
    </form>
  );
}
export function AdjustmentEditor({
  variants,
  lots,
}: {
  variants: Choice[];
  lots: {
    id: string;
    variantId: string;
    name: string;
    available: number;
    damaged: number;
  }[];
}) {
  const requestId = useRef(crypto.randomUUID());
  const [variantId, setVariant] = useState("");
  const [lotId, setLot] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/v1/admin/operations/stock-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: requestId.current,
          variantId,
          lotId: lotId || null,
          kind: f.get("kind"),
          quantity: Number(f.get("quantity")),
          reason: f.get("reason"),
          confirmed: f.get("confirmed") === "on",
          batchNumber: f.get("batchNumber") || null,
          manufacturedAt: f.get("manufacturedAt") || null,
          expiresAt: f.get("expiresAt") || null,
        }),
      });
      const body = await r.json();
      if (r.ok) {
        setMessage("Stock adjusted and ledger recorded.");
        router.push("/admin/operations/stock-ledger");
        router.refresh();
      } else setMessage(body.error?.message ?? "Unable to adjust.");
    } catch {
      setMessage(
        "Unable to confirm adjustment. Retry the same request safely.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="management-form space-y-5">
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        <label className="block">
          Variant
          <select
            required
            aria-label="Variant"
            value={variantId}
            onChange={(e) => {
              setVariant(e.target.value);
              setLot("");
            }}
          >
            <option value="">Choose variant</option>
            {variants.map((v) => (
              <option value={v.id} key={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Stock lot
          <select
            aria-label="Stock lot"
            value={lotId}
            onChange={(e) => setLot(e.target.value)}
          >
            <option value="">New lot (positive additions only)</option>
            {lots
              .filter((l) => l.variantId === variantId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · Available {l.available} · Damaged {l.damaged}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          Adjustment type
          <select aria-label="Adjustment type" name="kind">
            {["OPENING", "CORRECTION", "DAMAGE", "MISSING", "OTHER"].map(
              (k) => (
                <option key={k}>{k}</option>
              ),
            )}
          </select>
        </label>
        <label className="block">
          Quantity change
          <input
            name="quantity"
            required
            type="number"
            step="1"
            min="-1000000"
            max="1000000"
          />
        </label>
        <p className="text-sm text-muted">
          Opening/additions use positive units. Corrections use a signed
          difference. Missing stock uses negative units and an existing lot.
          Damage uses a positive quantity to transfer available units into
          damaged stock. Opening is recorded once per variant. No balance is
          silently overwritten.
        </p>
        {!lotId && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Batch number (optional)
              <input name="batchNumber" maxLength={100} />
            </label>
            <label>
              Manufacturing date (optional)
              <input name="manufacturedAt" type="date" />
            </label>
            <label>
              Expiry date (optional)
              <input name="expiresAt" type="date" />
            </label>
          </div>
        )}
        <label className="block">
          Reason for change
          <textarea name="reason" required minLength={5} maxLength={350} />
        </label>
        <label className="flex gap-3">
          <input name="confirmed" type="checkbox" required />I confirm the
          variant, lot, quantity and reason are correct.
        </label>
        <button className="button">Apply stock adjustment</button>
      </fieldset>
      <p role="status">{message}</p>
    </form>
  );
}
