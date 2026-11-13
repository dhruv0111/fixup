"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
type Target = { value: string; label: string };
type Entry = { productId: string | null; variantId: string | null; amountPaise: number };
export function PriceListEditor({ initial, targets }: { initial?: { id: string; name: string; active: boolean; version: number; entries: Entry[] }; targets: Target[] }) {
  const [rows, setRows] = useState(() => initial?.entries.map((e,i) => ({ key: String(i), target: e.variantId ? `v:${e.variantId}` : `p:${e.productId}`, amount: String(e.amountPaise / 100) })) ?? []);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(busy) return; const values = new FormData(event.currentTarget); setBusy(true); setMessage("");
    try { const response = await fetch(`/api/v1/admin/management/price-lists${initial ? `/${initial.id}` : ""}`, { method: initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: values.get("name"), active: values.get("active") === "on", ...(initial ? { version: initial.version } : {}), reason: values.get("reason"), entries: rows.map(row => ({ ...(row.target.startsWith("v:") ? { variantId: row.target.slice(2) } : { productId: row.target.slice(2) }), amountPaise: Math.round(Number(row.amount) * 100) })) }) });
      const result = await response.json(); setMessage(response.ok ? "Price list saved." : result.error?.message ?? "Unable to save.");
      if(response.ok) { router.push(`/admin/price-lists/${result.data.id}`); router.refresh(); }
    } catch { setMessage("Unable to save. Check your connection."); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="management-form space-y-5"><fieldset disabled={busy} className="min-w-0 space-y-5">
    <label className="block">Price list name<input name="name" required minLength={2} maxLength={100} defaultValue={initial?.name} /></label>
    <label className="flex items-center gap-3"><input name="active" type="checkbox" defaultChecked={initial?.active} />Active price list</label>
    <p className="text-sm text-muted">Prices in INR. Each variant has its own price; missing entries require an enquiry. Enter the agreed selling amount; taxes and checkout are not calculated here.</p>
    {rows.map((row,i) => <div key={row.key} className="grid items-end gap-3 rounded-lg border border-line p-4 sm:grid-cols-[2fr_1fr_auto]">
      <label>Product / variant {i+1}<select aria-label={`Price target ${i+1}`} required value={row.target} onChange={e => setRows(rows.map((r,j) => j === i ? { ...r, target: e.target.value } : r))}><option value="">Choose a product or variant</option>{targets.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
      <label>Price (₹)<input aria-label={`Price amount ${i+1}`} type="number" required min="0.01" max="1000000" step="0.01" value={row.amount} onChange={e => setRows(rows.map((r,j) => j === i ? { ...r, amount: e.target.value } : r))} /></label>
      <button type="button" className="text-link py-3" onClick={() => setRows(rows.filter((_,j) => j !== i))}>Remove</button>
    </div>)}
    <button type="button" className="button button-secondary" disabled={rows.length >= 100} onClick={() => setRows([...rows, { key: crypto.randomUUID(), target: "", amount: "" }])}>Add price</button>
    <label className="block">Reason for change<input name="reason" required minLength={5} maxLength={350} /></label>
    <button className="button" disabled={busy}>{busy ? "Saving…" : "Save price list"}</button>
  </fieldset><p role="status">{message}</p></form>;
}
