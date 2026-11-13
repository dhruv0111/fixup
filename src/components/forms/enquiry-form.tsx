"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { enquirySchema } from "@/modules/enquiries/validation";
type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  isDemo: boolean;
};
type Props = {
  kind: "DEALER" | "BULK" | "CONTACT";
  token: string;
  products?: ProductOption[];
  selectedProduct?: string;
};
export function EnquiryForm({
  kind,
  token: initialToken,
  products = [],
  selectedProduct = "",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>(
    {},
  );
  const [token, setToken] = useState(initialToken);
  const requestId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const dealer = kind === "DEALER";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    requestId.current ??= crypto.randomUUID();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!values.productId) delete values.productId;
    const result = enquirySchema.safeParse({
      ...values,
      kind,
      requestId: requestId.current,
      token,
      consent: values.consent === "on",
    });
    setErrors({});
    setMessage("");
    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors);
      setMessage("Please check the highlighted fields.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/v1/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      const body = await response.json();
      if (!response.ok) {
        setErrors(body.error?.fields ?? {});
        setMessage(body.error?.message ?? "Unable to send. Please try again.");
        if (body.error?.code === "FORM_EXPIRED") {
          const refresh = await fetch("/api/v1/enquiries/challenge");
          if (refresh.ok) setToken((await refresh.json()).data.token);
        }
        if (body.error?.code === "REQUEST_CONFLICT") requestId.current = null;
        return;
      }
      setSuccess(true);
    } catch {
      setMessage(
        "We could not confirm your submission. Check your connection and retry; your request will not be saved twice.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function field(
    name: string,
    label: string,
    required = false,
    type = "text",
    maxLength = 100,
  ) {
    return (
      <div key={name}>
        <label className="label" htmlFor={name}>
          {label}
          {required ? " *" : " (optional)"}
        </label>
        <input
          className="field"
          id={name}
          name={name}
          type={type}
          required={required}
          maxLength={maxLength}
          minLength={name === "name" ? 2 : undefined}
          autoComplete={
            name === "name"
              ? "name"
              : name === "phone"
                ? "tel"
                : name === "email"
                  ? "email"
                  : undefined
          }
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
        />
        {errors[name] && (
          <p className="field-error" id={`${name}-error`}>
            {errors[name]?.join(" ")}
          </p>
        )}
      </div>
    );
  }
  if (success)
    return (
      <div role="status" className="success-panel">
        <h2 className="text-2xl font-semibold">
          Thank you. Your enquiry has been received.
        </h2>
        <p className="mt-3">
          FIXUP will review the details and contact you. This is an enquiry, not
          an order or dealer approval.
        </p>
        <Link className="text-link mt-5 inline-block" href="/products">
          Explore the catalogue →
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} className="enquiry-form">
      <p className="mb-6 text-sm text-muted">Fields marked * are required.</p>
      <div className="form-grid">
        {field("name", dealer ? "Contact person" : "Your name", true)}
        {field("businessName", "Business name", dealer, "text", 150)}
        {field("phone", "Mobile number", true, "tel", 20)}
        {field("email", "Email", dealer, "email", 254)}
        {dealer && (
          <>
            {field("address", "Business address", true, "text", 500)}
            {field("city", "City", true)}
            {field("postalCode", "PIN code", true, "text", 6)}
            {field("businessType", "Business type", true)}
            {field("gstin", "GSTIN", false, "text", 15)}
            {field("quantity", "Expected purchase quantity", true)}
          </>
        )}
        {!dealer && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="productId">
              Product{kind === "BULK" ? " *" : " (optional)"}
            </label>
            <select
              className="field"
              id="productId"
              name="productId"
              defaultValue={selectedProduct}
              required={kind === "BULK"}
              aria-invalid={!!errors.productId}
            >
              <option value="">
                {products.length
                  ? "Select a product"
                  : "No approved products published yet"}
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.sku ? ` · ${p.sku}` : ""}
                  {p.isDemo ? " (Demo)" : ""}
                </option>
              ))}
            </select>
            {errors.productId && (
              <p className="field-error">{errors.productId.join(" ")}</p>
            )}
          </div>
        )}
        {kind === "BULK" && (
          <>
            {field("quantity", "Required quantity (include units)", true)}
            {field("location", "Delivery location", true, "text", 200)}
          </>
        )}
        <div className="sm:col-span-2">
          <label className="label" htmlFor="message">
            {dealer ? "Additional message" : "Message"}
            {kind === "CONTACT" ? " *" : " (optional)"}
          </label>
          <textarea
            className="field"
            id="message"
            name="message"
            rows={5}
            maxLength={2000}
            required={kind === "CONTACT"}
            aria-invalid={!!errors.message}
          />
          {errors.message && (
            <p className="field-error">{errors.message.join(" ")}</p>
          )}
        </div>
      </div>
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="mt-6 flex items-start gap-3 text-sm leading-6">
        <input
          className="mt-1 size-4 accent-purple-700"
          name="consent"
          type="checkbox"
          required
        />
        I agree that FIXUP may use these details to respond to my enquiry.
      </label>
      <p className="mt-2 text-xs text-muted">
        Read our{" "}
        <Link className="underline" href="/policies/privacy">
          Privacy Policy
        </Link>
        . WhatsApp conversations are not automatically stored in this
        application.
      </p>
      {message && (
        <div role="alert" className="field-error my-5">
          {message}
          {errors.consent && <p>Please agree to contact about your enquiry.</p>}
        </div>
      )}
      {kind === "BULK" && !products.length && (
        <p className="my-5 text-sm">
          The bulk product form will be available when products are published.
          Please{" "}
          <Link className="text-link" href="/contact">
            send a general enquiry
          </Link>{" "}
          or use WhatsApp meanwhile.
        </p>
      )}
      <button
        className="button mt-7"
        disabled={busy || (kind === "BULK" && !products.length)}
        type="submit"
      >
        {busy
          ? "Sending…"
          : dealer
            ? "Send dealer application"
            : "Send enquiry"}{" "}
        ↗
      </button>
    </form>
  );
}
