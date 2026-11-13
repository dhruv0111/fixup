"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
type RecordValue = { id: string; [key: string]: string | boolean | number };
export function ContentEditor({
  resource,
  initial,
  fields,
}: {
  resource: string;
  initial: RecordValue;
  fields: Array<{
    name: string;
    label: string;
    type?: "checkbox" | "textarea" | "number" | "email";
  }>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(
      fields.map((field) => [
        field.name,
        field.type === "checkbox"
          ? form.get(field.name) === "on"
          : field.type === "number"
            ? Number(form.get(field.name))
            : String(form.get(field.name) ?? ""),
      ]),
    );
    try {
      const response = await fetch(`/api/v1/admin/content/${resource}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(initial.id ? { id: initial.id } : {}),
          data,
          reason: form.get("reason"),
        }),
      });
      const body = await response.json();
      setMessage(
        response.ok
          ? "Saved successfully."
          : `${body.error?.message ?? "Save failed."} ${Object.entries(
              body.error?.fields ?? {},
            )
              .map(([key, value]) => `${key}: ${String(value)}`)
              .join(" ")}`,
      );
      if (response.ok) router.refresh();
    } catch {
      setMessage("Unable to save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="info-panel space-y-5">
      {fields.map((field) => {
        const id = `${resource}-${initial.id || "new"}-${field.name}`;
        return (
          <div key={field.name}>
            {field.type === "checkbox" ? (
              <label className="flex items-center gap-3" htmlFor={id}>
                <input
                  id={id}
                  name={field.name}
                  type="checkbox"
                  defaultChecked={Boolean(initial[field.name])}
                />
                {field.label}
              </label>
            ) : (
              <>
                <label className="label" htmlFor={id}>
                  {field.label}
                </label>
                {field.type === "textarea" ? (
                  <textarea
                    className="field"
                    id={id}
                    name={field.name}
                    rows={6}
                    maxLength={8000}
                    defaultValue={String(initial[field.name] ?? "")}
                  />
                ) : (
                  <input
                    className="field"
                    id={id}
                    name={field.name}
                    type={field.type ?? "text"}
                    defaultValue={String(initial[field.name] ?? "")}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
      <label className="label">
        Reason for change
        <input
          className="field mt-2"
          name="reason"
          required
          minLength={5}
          maxLength={350}
        />
      </label>
      <button className="button" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
