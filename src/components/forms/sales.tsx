"use client";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
const money = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    v / 100,
  );
const label = (s: string) => s.replaceAll("_", " ");
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
    throw new Error(body.error?.message ?? "Unable to complete request.");
  return body.data;
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
    let active = true;
    call<T>(url).then(
      (value) => {
        if (active) {
          setData(value);
          setError("");
        }
      },
      (e) => {
        if (active) setError((e as Error).message);
      },
    );
    return () => {
      active = false;
    };
  }, [url]);
  return { data, error, reload };
}
function Message({ text }: { text: string }) {
  return (
    <p role="status" className="my-4 text-sm">
      {text}
    </p>
  );
}
function Field({
  name,
  label: caption,
  type = "text",
  required = true,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
}) {
  return (
    <label className="block text-sm">
      {caption}
      <input
        className="field mt-1"
        name={name}
        type={type}
        step={type === "number" ? "any" : undefined}
        required={required}
        defaultValue={defaultValue}
      />
    </label>
  );
}
function Check({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" name={name} className="mt-1" />
      {children}
    </label>
  );
}
export function AddCart({ variantId }: { variantId: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <span>
      <button
        className="button button-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await call("/api/v1/me/cart", "PATCH", { variantId, quantity: 1 });
            setMessage("Added to cart.");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Add to cart
      </button>
      {message && (
        <span role="status" className="block text-sm">
          {message}
        </span>
      )}
    </span>
  );
}
type CartLine = {
  variantId: string;
  quantity: number;
  name: string;
  variant: string;
  packSize: string;
  imageUrl: string | null;
  unitPricePaise: number | null;
  linePricePaise: number | null;
  available: number;
  changed: boolean;
  orderable: boolean;
};
type Cart = { category: string; lines: CartLine[] };
export function CartView() {
  const { data, error, reload } = useData<Cart>("/api/v1/me/cart");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function update(id: string, quantity: number) {
    setBusy(true);
    try {
      await call("/api/v1/me/cart", "PATCH", { variantId: id, quantity });
      await reload();
      setMessage("Cart updated.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="info-panel">
      <Message text={error || message} />
      {data && (
        <>
          <p>
            {label(data.category)} pricing · Stock is reserved only after
            checkout.
          </p>
          {!data.lines.length ? (
            <p className="my-6">
              Your cart is empty.{" "}
              <Link href="/products" className="text-link">
                Browse products
              </Link>
            </p>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {data.lines.map((l) => (
                  <li
                    className="py-6 flex flex-wrap items-center gap-5"
                    key={l.variantId}
                  >
                    {l.imageUrl && (
                      <Image
                        src={l.imageUrl}
                        alt={`${l.name} ${l.packSize}`}
                        width={80}
                        height={80}
                        className="object-contain"
                      />
                    )}
                    <div className="flex-1 min-w-40">
                      <h2 className="font-semibold">
                        {l.name} · {l.packSize}
                      </h2>
                      <p>
                        {l.unitPricePaise === null
                          ? "Price unavailable"
                          : `${money(l.unitPricePaise)} each`}{" "}
                        · {l.available} available
                      </p>
                      {l.changed && (
                        <p className="text-sm">
                          Price or category changed. Review the updated price.
                        </p>
                      )}
                      {!l.orderable && <p>Item is no longer available.</p>}
                    </div>
                    <label>
                      Quantity{" "}
                      <input
                        aria-label={`Quantity ${l.packSize}`}
                        className="field w-24"
                        type="number"
                        min="1"
                        max="10000"
                        value={l.quantity}
                        disabled={busy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isInteger(n) && n > 0)
                            void update(l.variantId, n);
                        }}
                      />
                    </label>
                    <strong>
                      {l.linePricePaise !== null
                        ? money(l.linePricePaise)
                        : "—"}
                    </strong>
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() => update(l.variantId, 0)}
                    >
                      Remove {l.packSize}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="my-5 font-semibold">
                Subtotal{" "}
                {money(
                  data.lines.reduce((s, l) => s + (l.linePricePaise ?? 0), 0),
                )}
              </p>
              <p className="mb-5 text-sm">
                Configured tax, delivery charges and final payable amount are
                shown for review at checkout.
              </p>
              <Link className="button button-primary" href="/account/checkout">
                Review checkout
              </Link>
            </>
          )}
        </>
      )}
    </section>
  );
}
type Address = {
  id: string;
  recipient: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
};
type Preview = Cart & {
  reviewToken: string;
  subtotalPaise: number;
  taxPaise: number;
  taxMode: string;
  deliveryPaise: number;
  totalPaise: number;
  reservationMinutes: number;
  lateReviewMinutes: number;
  addressSnapshot: Address;
  customerSnapshot: { name: string; email: string; phone: string };
  paymentDetails: Record<string, string>;
  cancellationRules: Record<string, boolean>;
};
function Details({ values }: { values: Record<string, unknown> }) {
  return (
    <dl className="grid gap-2 my-4">
      {Object.entries(values)
        .filter(([, v]) => v !== "" && v !== null)
        .map(([k, v]) => (
          <div key={k} className="flex flex-wrap gap-2">
            <dt className="text-muted">{k.replace(/([A-Z])/g, " $1")}:</dt>
            <dd className="break-all">{String(v)}</dd>
          </div>
        ))}
    </dl>
  );
}
export function Checkout() {
  const router = useRouter();
  const { data: addresses, error } = useData<Address[]>("/api/v1/me/addresses");
  const [review, setReview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState({
    addressId: "",
    paymentMethod: "UPI",
  });
  const [notes, setNotes] = useState("");
  const [key, setKey] = useState("");
  return (
    <section className="info-panel">
      <Message text={error || message} />
      <form
        className="space-y-5"
        onChange={() => setReview(null)}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            setReview(
              await call<Preview>(
                "/api/v1/me/checkout/preview",
                "POST",
                selection,
              ),
            );
            setKey(crypto.randomUUID());
            setMessage(
              "Review current prices, address and terms before submitting.",
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          Delivery address
          <select
            className="field"
            required
            aria-label="Delivery address"
            value={selection.addressId}
            onChange={(e) =>
              setSelection({ ...selection, addressId: e.target.value })
            }
          >
            <option value="">Choose a saved address</option>
            {addresses?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.recipient} · {a.line1}, {a.city}, {a.postalCode}
              </option>
            ))}
          </select>
        </label>
        <Link href="/account/addresses" className="text-link">
          Manage saved addresses
        </Link>
        <label className="block">
          Payment method
          <select
            className="field"
            aria-label="Payment method"
            value={selection.paymentMethod}
            onChange={(e) =>
              setSelection({ ...selection, paymentMethod: e.target.value })
            }
          >
            <option value="UPI">UPI</option>
            <option value="BANK">Bank Transfer</option>
          </select>
        </label>
        <label className="block">
          Customer notes
          <textarea
            className="field"
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <button disabled={busy} className="button button-secondary">
          Review current total
        </button>
      </form>
      {review && (
        <div className="mt-8 border-t border-line pt-6">
          <h2 className="text-xl font-semibold">Confirm order</h2>
          <Details values={review.customerSnapshot} />
          <Details values={review.addressSnapshot} />
          <ul>
            {review.lines.map((l) => (
              <li key={l.variantId}>
                {l.name} {l.packSize} × {l.quantity} ·{" "}
                {money(l.unitPricePaise!)} each · {money(l.linePricePaise!)}
              </li>
            ))}
          </ul>
          <Details
            values={{
              subtotal: money(review.subtotalPaise),
              tax: `${money(review.taxPaise)} (${review.taxMode.toLowerCase()})`,
              delivery: money(review.deliveryPaise),
              finalPayable: money(review.totalPaise),
              reservationMinutes: review.reservationMinutes,
              lateReviewWindowMinutes: review.lateReviewMinutes,
              customerUnpaidCancellation: review.cancellationRules
                .customerCancelUnpaid
                ? "Permitted"
                : "Contact admin",
              adminUnpaidCancellation: review.cancellationRules
                .adminCancelUnpaid
                ? "Permitted"
                : "Restricted",
              adminPaidCancellation: review.cancellationRules.adminCancelPaid
                ? "Permitted; refund decision required"
                : "Restricted",
            }}
          />
          <h3 className="font-semibold">Direct payment instructions</h3>
          <Details values={review.paymentDetails} />
          <p className="my-4">
            Place the order first, then transfer exactly{" "}
            {money(review.totalPaise)} and upload proof. Screenshots require
            manual bank verification. Dispatch is available only after full
            verified payment and all checks pass.
          </p>
          <button
            className="button button-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const row = await call<{ id: string }>(
                  "/api/v1/me/orders",
                  "POST",
                  {
                    ...selection,
                    reviewToken: review.reviewToken,
                    requestId: key,
                    notes,
                  },
                );
                router.push(`/account/orders/${row.id}`);
              } catch (e) {
                setMessage((e as Error).message);
                setReview(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            Place sales order
          </button>
        </div>
      )}
    </section>
  );
}
type Submission = {
  id: string;
  method: string;
  reference: string;
  paidOn: string;
  createdAt: string;
  status: string;
  version: number;
  duplicateReference: boolean;
  late: boolean;
  width: number;
  height: number;
  publicMessage: string;
  internalNotes?: string;
  reviewedById?: string;
};
type Order = {
  id: string;
  number: string;
  createdAt: string;
  category: string;
  status: string;
  paymentStatus: string;
  totalPaise: number;
  subtotalPaise: number;
  taxPaise: number;
  taxMode: string;
  deliveryPaise: number;
  remainingPaise: number;
  verifiedPaise: number;
  version: number;
  reservationExpiresAt: string;
  lateReviewRequired: boolean;
  refundDecisionRequired: boolean;
  internalNotes?: string;
  notes: string;
  customerSnapshot: Record<string, string>;
  addressSnapshot: Record<string, string>;
  paymentDetails: Record<string, string>;
  lines: {
    id: string;
    productName: string;
    variantName: string;
    variantId: string;
    packSize: string;
    quantity: number;
    unitPricePaise: number;
    linePricePaise: number;
  }[];
  reservations: {
    id: string;
    variantId: string;
    quantity: number;
    status: string;
    expiresAt: string | null;
  }[];
  submissions: Submission[];
  payments: {
    id: string;
    kind: string;
    method: string;
    amountPaise: number;
    bankReference: string;
    createdAt: string;
    notes?: string;
    verifiedById?: string;
  }[];
  events: {
    id: string;
    kind: string;
    message: string;
    internalNotes?: string;
    createdAt: string;
  }[];
};
export function OrderList({ admin = false }: { admin?: boolean }) {
  const [query, setQuery] = useState("");
  const { data, error } = useData<{ orders: Order[] }>(
    `${admin ? "/api/v1/admin/sales" : "/api/v1/me"}/orders${query}`,
  );
  return (
    <section className="info-panel">
      {admin && (
        <form
          className="grid sm:grid-cols-3 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fields = new FormData(e.currentTarget);
            const q = new URLSearchParams();
            for (const [key, value] of fields)
              if (value) q.set(key, String(value));
            setQuery(`?${q}`);
          }}
        >
          <Field
            name="q"
            label="Order number or customer/dealer"
            required={false}
          />
          <Field
            name="status"
            label="Order status (e.g. READY_FOR_DISPATCH)"
            required={false}
          />
          <Field
            name="paymentStatus"
            label="Payment status (e.g. UNPAID)"
            required={false}
          />
          <Field name="from" label="From date" type="date" required={false} />
          <Field name="to" label="To date" type="date" required={false} />
          <button className="button button-secondary">Search orders</button>
        </form>
      )}
      <Message text={error} />
      {data && !data.orders.length && <p className="my-6">No orders yet.</p>}
      <ul className="divide-y divide-line">
        {data?.orders.map((o) => (
          <li className="py-5" key={o.id}>
            <Link
              href={`${admin ? "/admin/sales" : "/account"}/orders/${o.id}`}
              className="text-link font-semibold"
            >
              {o.number}
            </Link>
            <p>
              {new Date(o.createdAt).toLocaleString()} · {money(o.totalPaise)} ·{" "}
              {label(o.category)}
            </p>
            <p>
              {label(o.status)} · {label(o.paymentStatus)}
            </p>
            <p>
              {o.lines
                .map((l) => `${l.productName} ${l.packSize} × ${l.quantity}`)
                .join(", ")}
            </p>
            <p>
              Payment proof:{" "}
              {o.submissions.length
                ? label(o.submissions.at(-1)!.status)
                : "Not submitted"}
            </p>
          </li>
        ))}
      </ul>
      {admin && (
        <p className="text-sm mt-4">
          Latest 200 matching orders. Narrow filters for older records.
        </p>
      )}
    </section>
  );
}
function ProofUpload({
  order,
  reload,
}: {
  order: Order;
  reload: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="info-panel">
      <h2 className="text-xl font-semibold">Submit payment proof</h2>
      <p className="my-4">
        {["CANCELLED", "RESERVATION_EXPIRED"].includes(order.status)
          ? "Do not send a new payment for this cancelled or expired order. If you already transferred money, submit proof for admin review; stock is not restored automatically."
          : order.remainingPaise === 0
            ? "No further payment is requested. You may submit missing evidence for an earlier transfer."
            : "Transfer the exact remaining amount using the instructions. A screenshot supports manual review and does not confirm payment."}{" "}
        PNG, JPEG or WebP, up to 5 MiB and 16 megapixels.
      </p>
      <form
        className="grid gap-5 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          data.set(
            "requestId",
            form.dataset.requestId ??
              (form.dataset.requestId = crypto.randomUUID()),
          );
          setBusy(true);
          try {
            const r = await fetch(`/api/v1/me/orders/${order.id}/payments`, {
              method: "POST",
              body: data,
            });
            const result = await r.json();
            if (!r.ok)
              throw new Error(result.error?.message ?? "Upload failed.");
            setMessage("Proof submitted for manual verification.");
            form.reset();
            delete form.dataset.requestId;
            await reload();
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Payment method
          <select aria-label="Payment method" name="method" className="field">
            <option value="UPI">UPI</option>
            <option value="BANK">Bank Transfer</option>
          </select>
        </label>
        <Field name="reference" label="Transaction reference / UTR" />
        <Field name="paidOn" label="Payment date" type="date" />
        <label>
          Payment screenshot
          <input
            className="field"
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp"
            required
          />
        </label>
        <Field name="remarks" label="Remarks" required={false} />
        <button disabled={busy} className="button button-primary">
          Submit for verification
        </button>
      </form>
      <Message text={message} />
    </section>
  );
}
function ReviewForm({
  submission: s,
  reload,
}: {
  submission: Submission;
  reload: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4 mt-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const form = e.currentTarget;
        const f = new FormData(form);
        const action = String(f.get("action"));
        const data = {
          action,
          version: s.version,
          requestId: crypto.randomUUID(),
          reason: f.get("reason"),
          internalNotes: f.get("internalNotes"),
          publicMessage: f.get("publicMessage"),
          checkedBankRecord: f.get("checkedBankRecord") === "on",
          duplicateReviewed: f.get("duplicateReviewed") === "on",
          ...(action === "VERIFY"
            ? {
                amountPaise: Math.round(Number(f.get("amount")) * 100),
                bankReference: f.get("bankReference"),
              }
            : {}),
        };
        try {
          await call(`/api/v1/admin/sales/payments/${s.id}`, "POST", data);
          setMessage("Review recorded.");
          await reload();
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Review action
        <select aria-label="Review action" className="field" name="action">
          <option value="REVIEW">Under review</option>
          <option value="VERIFY">Verify actual received payment</option>
          <option value="REJECT">Reject proof</option>
          <option value="RESUBMISSION_REQUIRED">Request resubmission</option>
        </select>
      </label>
      <Field
        name="amount"
        label="Actual bank-confirmed received amount (INR)"
        type="number"
        required={false}
      />
      <Field
        name="bankReference"
        label="Actual bank transaction reference"
        required={false}
      />
      <Check name="checkedBankRecord">
        I independently checked the actual bank or UPI transaction record.
      </Check>
      <Check name="duplicateReviewed">
        I reviewed the possible duplicate reference/proof warning.
      </Check>
      <Field name="reason" label="Review reason" />
      <Field name="internalNotes" label="Private verification notes" />
      <Field
        name="publicMessage"
        label="Message for customer"
        required={false}
      />
      <button disabled={busy} className="button button-primary">
        Record manual review
      </button>
      <Message text={message} />
    </form>
  );
}
function OrderActions({
  order: o,
  admin,
  reload,
}: {
  order: Order;
  admin: boolean;
  reload: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  return (
    <section className="info-panel">
      <h2 className="text-xl font-semibold">
        {admin ? "Order actions" : "Request cancellation"}
      </h2>
      <form
        className="space-y-4 mt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await call(
              `${admin ? "/api/v1/admin/sales" : "/api/v1/me"}/orders/${o.id}`,
              "POST",
              {
                action: admin ? f.get("action") : "CANCEL",
                version: o.version,
                reason: f.get("reason"),
                internalNotes: admin ? f.get("internalNotes") : "",
              },
            );
            setMessage("Action recorded.");
            await reload();
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        {admin && (
          <label>
            Action
            <select aria-label="Action" className="field" name="action">
              <option value="NOTE">Add internal note</option>
              <option value="CANCEL">Cancel under configured policy</option>
              <option value="RESOLVE_LATE">
                Resolve late payment and recheck/re-reserve stock
              </option>
              <option value="RESOLVE_OVERPAYMENT">
                Record overpayment resolution
              </option>
              <option value="REFUND_DECISION">
                Record manual refund decision
              </option>
            </select>
          </label>
        )}
        <Field name="reason" label="Reason / resolution" />
        {admin && (
          <Field name="internalNotes" label="Private notes" required={false} />
        )}
        <button className="button button-secondary">
          {admin ? "Apply order action" : "Cancel eligible order"}
        </button>
      </form>
      {admin && (
        <form
          className="space-y-4 mt-8 border-t border-line pt-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await call(`/api/v1/admin/sales/refunds/${o.id}`, "POST", {
                requestId: crypto.randomUUID(),
                amountPaise: Math.round(Number(f.get("amount")) * 100),
                method: f.get("method"),
                bankReference: f.get("bankReference"),
                checkedBankRecord: f.get("checkedBankRecord") === "on",
                reason: f.get("reason"),
                internalNotes: f.get("internalNotes"),
              });
              setMessage("Completed manual refund recorded.");
              await reload();
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <h3 className="font-semibold">Record completed manual refund</h3>
          <p className="text-sm">
            This records an external transfer you already completed. It does not
            move money.
          </p>
          <Field name="amount" label="Refund amount (INR)" type="number" />
          <label>
            Method
            <select className="field" name="method">
              <option value="UPI">UPI</option>
              <option value="BANK">Bank Transfer</option>
            </select>
          </label>
          <Field name="bankReference" label="Refund bank reference" />
          <Field name="reason" label="Refund reason" />
          <Field name="internalNotes" label="Private refund notes" />
          <Check name="checkedBankRecord">
            I checked the actual completed bank refund transfer.
          </Check>
          <button className="button button-secondary">
            Record completed refund
          </button>
        </form>
      )}
      <Message text={message} />
    </section>
  );
}
export function OrderView({
  id,
  admin = false,
}: {
  id: string;
  admin?: boolean;
}) {
  const {
    data: o,
    error,
    reload,
  } = useData<Order>(
    `${admin ? "/api/v1/admin/sales" : "/api/v1/me"}/orders/${id}`,
  );
  return (
    <>
      <Message text={error} />
      {o && (
        <>
          <section className="info-panel">
            <h2 className="text-xl font-semibold">{o.number}</h2>
            <p className="my-3">
              {label(o.status)} · {label(o.paymentStatus)} · {label(o.category)}
            </p>
            <p>{new Date(o.createdAt).toLocaleString()}</p>
            <Details values={o.customerSnapshot} />
            <Details values={o.addressSnapshot} />
            <ul className="divide-y divide-line">
              {o.lines.map((l) => (
                <li className="py-3" key={l.id}>
                  {l.productName} · {l.packSize} × {l.quantity} ·{" "}
                  {money(l.unitPricePaise)} each · {money(l.linePricePaise)}
                </li>
              ))}
            </ul>
            <Details
              values={{
                subtotal: money(o.subtotalPaise),
                tax: `${money(o.taxPaise)} (${o.taxMode.toLowerCase()})`,
                delivery: money(o.deliveryPaise),
                total: money(o.totalPaise),
                verifiedNetPayment: money(o.verifiedPaise),
                remaining: money(o.remainingPaise),
                reservationDeadline: new Date(
                  o.reservationExpiresAt,
                ).toLocaleString(),
                customerNotes: o.notes,
              }}
            />
            {o.lateReviewRequired && (
              <p>
                Late payment / reservation review required. Stock will not be
                restored automatically.
              </p>
            )}
            {o.refundDecisionRequired && (
              <p>
                Manual refund decision required. No refund has been initiated by
                this website.
              </p>
            )}
            <h3 className="font-semibold mt-6">Payment instructions</h3>
            <Details values={o.paymentDetails} />
            <p>
              {["CANCELLED", "RESERVATION_EXPIRED"].includes(o.status)
                ? "Do not make a new transfer. Existing payments require admin review."
                : o.remainingPaise === 0
                  ? "No further payment is requested. Verified funds are recorded below."
                  : "Use your order number as payment remarks. Upload proof after your direct transfer; FIXUP will verify the actual bank record."}
            </p>
            <h3 className="font-semibold mt-6">Stock reservations</h3>
            <ul>
              {o.reservations.map((r) => (
                <li key={r.id}>
                  {o.lines.find((l) => l.variantId === r.variantId)?.packSize ??
                    r.variantId}{" "}
                  · {r.quantity} units · {r.status} ·{" "}
                  {r.expiresAt
                    ? new Date(r.expiresAt).toLocaleString()
                    : "Held after full verified payment"}
                </li>
              ))}
            </ul>
            {admin && <Details values={{ internalNotes: o.internalNotes }} />}
          </section>
          {!admin && <ProofUpload order={o} reload={reload} />}
          <section className="info-panel">
            <h2 className="text-xl font-semibold">Payment submissions</h2>
            {!o.submissions.length && <p className="mt-4">Not submitted.</p>}
            {o.submissions.map((s) => (
              <article key={s.id} className="border-t border-line py-6">
                <h3 className="font-semibold">
                  {label(s.status)} · {s.method} · {s.reference}
                </h3>
                <p>
                  Payment date {s.paidOn.slice(0, 10)} · Submitted{" "}
                  {new Date(s.createdAt).toLocaleString()}
                </p>
                {s.duplicateReference && (
                  <p>
                    Possible duplicate reference or screenshot. Admin review
                    required.
                  </p>
                )}
                {s.late && (
                  <p>Submission close to or after reservation expiry.</p>
                )}
                <p>{s.publicMessage}</p>
                {admin && (
                  <p>
                    {s.internalNotes} · Reviewer {s.reviewedById}
                  </p>
                )}
                <a
                  className="text-link"
                  href={`/api/v1/payments/${s.id}/proof`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open private payment proof
                </a>
                <Image
                  unoptimized
                  src={`/api/v1/payments/${s.id}/proof`}
                  alt="Private payment screenshot"
                  width={s.width}
                  height={s.height}
                  className="my-4 max-h-80 w-auto max-w-full object-contain"
                />
                {admin && ["SUBMITTED", "UNDER_REVIEW"].includes(s.status) && (
                  <ReviewForm submission={s} reload={reload} />
                )}
              </article>
            ))}
          </section>
          <section className="info-panel">
            <h2 className="text-xl font-semibold">Verified payment history</h2>
            {!o.payments.length && (
              <p className="mt-4">No verified payments.</p>
            )}
            {o.payments.map((p) => (
              <div className="my-4" key={p.id}>
                <p>
                  {p.kind} · {money(p.amountPaise)} · {p.method} ·{" "}
                  {p.bankReference} · {new Date(p.createdAt).toLocaleString()}
                </p>
                {admin && (
                  <p>
                    Verifier {p.verifiedById} · {p.notes}
                  </p>
                )}
              </div>
            ))}
          </section>
          <OrderActions order={o} admin={admin} reload={reload} />
          <section className="info-panel">
            <h2 className="text-xl font-semibold">Order status history</h2>
            <ul className="divide-y divide-line">
              {o.events.map((e) => (
                <li className="py-4" key={e.id}>
                  <p>
                    {new Date(e.createdAt).toLocaleString()} · {label(e.kind)}
                  </p>
                  <p>{e.message}</p>
                  {admin && <p className="text-muted">{e.internalNotes}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">
              Status updates appear here. No external message delivery is
              implied.
            </p>
          </section>
        </>
      )}
    </>
  );
}
export function PaymentQueue() {
  const { data, error } = useData<
    {
      id: string;
      orderId: string;
      status: string;
      method: string;
      reference: string;
      paidOn: string;
      createdAt: string;
      duplicateReference: boolean;
      late: boolean;
      order: {
        number: string;
        totalPaise: number;
        paymentStatus: string;
        customerSnapshot: Record<string, string>;
      };
    }[]
  >("/api/v1/admin/sales/payments");
  return (
    <section className="info-panel">
      <Message text={error} />
      {data && !data.length && <p>No payment submissions yet.</p>}
      <ul className="divide-y divide-line">
        {data?.map((s) => (
          <li className="py-5" key={s.id}>
            <Link
              className="text-link"
              href={`/admin/sales/orders/${s.orderId}`}
            >
              {s.order.number} · {s.order.customerSnapshot.name}
            </Link>
            <p>
              {money(s.order.totalPaise)} · {label(s.order.paymentStatus)} ·{" "}
              {label(s.status)}
            </p>
            <p>
              {s.method} · {s.reference} · Payment date {s.paidOn.slice(0, 10)}{" "}
              · Submitted {new Date(s.createdAt).toLocaleString()}
            </p>
            {s.duplicateReference && <p>Possible duplicate</p>}
            {s.late && <p>Late review required</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
type Settings = {
  version: number;
  enabled: boolean;
  upiId: string;
  holderName: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
  instructions: string;
  taxBps: number | null;
  taxMode: string | null;
  deliveryPaise: number | null;
  reservationMinutes: number | null;
  lateReviewMinutes: number | null;
  customerCancelUnpaid: boolean | null;
  adminCancelUnpaid: boolean | null;
  adminCancelPaid: boolean | null;
};
export function SalesSettings() {
  const { data, error, reload } = useData<Settings>(
    "/api/v1/admin/sales/settings",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="info-panel">
      <p>
        Confirm your real payment instructions and business rules. Empty
        settings keep checkout disabled. Tax is in basis points (100 = 1%);
        charges are in paise (100 = ₹1). Explicit zero tax and delivery charges
        are allowed.
      </p>
      <Message text={error || message} />
      <form
        key={data?.version ?? 0}
        className="grid sm:grid-cols-2 gap-5 mt-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const values: Record<string, unknown> = {
            version: data?.version ?? 0,
            confirmed: f.get("confirmed") === "on",
            reason: f.get("reason"),
          };
          for (const name of [
            "upiId",
            "holderName",
            "bankName",
            "accountNumber",
            "ifsc",
            "branch",
            "instructions",
            "taxMode",
          ])
            values[name] = String(f.get(name) ?? "");
          for (const name of [
            "taxBps",
            "deliveryPaise",
            "reservationMinutes",
            "lateReviewMinutes",
          ])
            values[name] = f.get(name) === "" ? null : Number(f.get(name));
          for (const name of [
            "customerCancelUnpaid",
            "adminCancelUnpaid",
            "adminCancelPaid",
          ])
            values[name] = f.get(name) === "" ? null : f.get(name) === "true";
          values.enabled = f.get("enabled") === "on";
          setBusy(true);
          try {
            await call("/api/v1/admin/sales/settings", "POST", values);
            setMessage("Payment details and business rules confirmed.");
            await reload();
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {(
          [
            ["upiId", "Business UPI ID"],
            ["holderName", "Account holder name"],
            ["bankName", "Bank name"],
            ["accountNumber", "Account number"],
            ["ifsc", "IFSC"],
            ["branch", "Branch"],
            ["instructions", "Payment instructions"],
          ] as const
        ).map(([name, caption]) => (
          <Field
            key={name}
            name={name}
            label={caption}
            required={false}
            defaultValue={data?.[name] ?? ""}
          />
        ))}
        {(
          [
            ["taxBps", "Tax basis points"],
            ["deliveryPaise", "Delivery charge in paise"],
            ["reservationMinutes", "Reservation duration in minutes"],
            ["lateReviewMinutes", "Near-expiry review window in minutes"],
          ] as const
        ).map(([name, caption]) => (
          <Field
            key={name}
            name={name}
            label={caption}
            type="number"
            defaultValue={data?.[name] ?? ""}
          />
        ))}
        <label>
          Tax mode
          <select
            className="field"
            name="taxMode"
            required
            defaultValue={data?.taxMode ?? ""}
          >
            <option value="">Choose explicitly</option>
            <option value="EXCLUSIVE">Add tax to item subtotal</option>
            <option value="INCLUSIVE">Tax included in item prices</option>
          </select>
        </label>
        {(
          [
            ["customerCancelUnpaid", "Customer may cancel unpaid orders"],
            ["adminCancelUnpaid", "Admin may cancel unpaid orders"],
            [
              "adminCancelPaid",
              "Admin may cancel paid orders with refund decision",
            ],
          ] as const
        ).map(([name, caption]) => (
          <label key={name}>
            {caption}
            <select
              className="field"
              name={name}
              required
              defaultValue={
                data?.[name] === null || data?.[name] === undefined
                  ? ""
                  : String(data[name])
              }
            >
              <option value="">Choose explicitly</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
        ))}
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={data?.enabled ?? false}
          />
          Enable checkout
        </label>
        <Check name="confirmed">
          I confirm these payment details, charges, reservation timing and
          cancellation policies.
        </Check>
        <Field name="reason" label="Confirmation reason" />
        <button disabled={busy} className="button button-primary">
          Save confirmed settings
        </button>
      </form>
      <form
        className="mt-10"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const result = await call<{ expired: number }>(
              "/api/v1/admin/sales/expire",
              "POST",
              {},
            );
            setMessage(`${result.expired} orders expired in this batch.`);
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        <p className="mb-3 text-sm">
          Run reservation cleanup safely in batches of 100. No automated
          scheduler is configured.
        </p>
        <button className="button button-secondary">
          Expire due reservations
        </button>
      </form>
    </section>
  );
}
