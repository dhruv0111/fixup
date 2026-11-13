"use client";
import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export type Field = { name: string; label: string; type?: "text" | "email" | "tel" | "textarea" | "checkbox" | "number" | "money" | "select"; required?: boolean; nullable?: boolean; options?: { value: string; label: string }[]; hint?: string; min?: number; max?: number };
export function ManagedForm({ url, method = "POST", fields, initial = {}, base = {}, envelope, submitLabel = "Save changes", redirectTo, resetOnSuccess = false }: { url: string; method?: string; fields: Field[]; initial?: Record<string, unknown>; base?: Record<string, unknown>; envelope?: { id?: string }; submitLabel?: string; redirectTo?: string; resetOnSuccess?: boolean }) {
  const id = useId(); const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget; const values = new FormData(form); const data: Record<string, unknown> = structuredClone(base);
    for (const field of fields) { const value = values.get(field.name); const parsed = field.type === "checkbox" ? value === "on" : field.nullable && !value ? null : field.type === "number" ? Number(value) : field.type === "money" ? Math.round(Number(value) * 100) : String(value ?? "");
      const imageField = /^images\.(\d+)\.(url|alt|approved)$/.exec(field.name);
      if (imageField) { const images = data.images as Record<string, unknown>[]; images[Number(imageField[1])][imageField[2]] = parsed; } else data[field.name] = parsed;
    }
    if (Array.isArray(data.images)) data.images = data.images.filter(i => i.url);
    let body = data;
    if (envelope) { const { reason, ...content } = data; body = { ...envelope, data: content, reason }; }
    setBusy(true); setMessage("");
    try { const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json();
      setMessage(response.ok ? "Saved successfully." : [result.error?.message ?? "Unable to save.", ...Object.entries(result.error?.fields ?? {}).map(([k,v]) => `${k}: ${String(v)}`)].join(" "));
      if (response.ok) { if (resetOnSuccess) form.reset(); if (redirectTo) router.push(redirectTo); router.refresh(); }
    } catch { setMessage("Unable to save. Check your connection and try again."); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="management-form space-y-5">
    <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2">{fields.map(field => {
      const fieldId = `${id}-${field.name}`; const value = field.name.split(".").reduce<unknown>((v,k) => v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined, initial);
      return <div key={field.name} className={field.type === "textarea" ? "sm:col-span-2" : "min-w-0"}>
        <label htmlFor={fieldId} className="mb-2 block text-sm font-medium">{field.label}{field.required && " *"}</label>
        {field.type === "textarea" ? <textarea id={fieldId} name={field.name} required={field.required} defaultValue={String(value ?? "")} rows={4} maxLength={8000} />
        : field.type === "select" ? <select id={fieldId} name={field.name} defaultValue={String(value ?? "")} required={field.required}>{field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : field.type === "checkbox" ? <input id={fieldId} name={field.name} type="checkbox" defaultChecked={value === true} />
        : <input id={fieldId} name={field.name} type={field.type === "money" ? "number" : field.type ?? "text"} required={field.required} defaultValue={field.type === "money" && typeof value === "number" ? value / 100 : String(value ?? "")} step={field.type === "money" ? "0.01" : field.type === "number" ? "1" : undefined} min={field.min ?? (field.type === "money" ? 0.01 : undefined)} max={field.max} maxLength={field.type === "number" || field.type === "money" ? undefined : 500} />}
        {field.hint && <p className="mt-1 text-xs text-muted">{field.hint}</p>}
      </div>;
    })}</fieldset>
    <button disabled={busy} className="button" type="submit">{busy ? "Saving…" : submitLabel}</button>
    <p role="status" className="text-sm break-words">{message}</p>
  </form>;
}
