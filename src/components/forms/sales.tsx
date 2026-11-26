"use client";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DeliveryTracking } from "./dispatch";
import {
  orderStatus,
  paymentStatus,
  submissionStatus,
  buildTimeline,
  customerExplanation,
} from "@/components/orders/status";
import {
  Card,
  Facts,
  ProgressTimeline,
  StatusBadge,
} from "@/components/orders/ui";
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
function Message({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <p role={error ? "alert" : "status"} className="my-4 text-sm">
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
            const cart = await call<Cart>("/api/v1/me/cart");
            if (cart.lines.some((line) => line.variantId === variantId)) {
              setMessage(
                "Already in your cart. Update quantities in your cart.",
              );
              return;
            }
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
        <>
          <span role="status" className="block text-sm">
            {message}
          </span>
          {(message === "Added to cart." ||
            message ===
              "Already in your cart. Update quantities in your cart.") && (
            <Link href="/account/cart" className="text-link">
              View cart
            </Link>
          )}
        </>
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
function CartQuantity({
  line,
  busy,
  update,
  onDraft,
}: {
  line: CartLine;
  busy: boolean;
  update: (id: string, quantity: number) => Promise<void>;
  onDraft: (id: string, changed: boolean) => void;
}) {
  const [quantity, setQuantity] = useState(String(line.quantity));
  return (
    <form
      className="cart-quantity"
      onSubmit={(event) => {
        event.preventDefault();
        void update(line.variantId, Number(quantity));
      }}
    >
      <label>
        Quantity
        <input
          aria-label={`Quantity ${line.packSize}`}
          className="field"
          type="number"
          inputMode="numeric"
          min="1"
          max="10000"
          step="1"
          required
          value={quantity}
          disabled={busy}
          onChange={(event) => {
            setQuantity(event.target.value);
            onDraft(
              line.variantId,
              Number(event.target.value) !== line.quantity,
            );
          }}
        />
      </label>
      <button className="button button-secondary" disabled={busy} type="submit">
        Update quantity
      </button>
    </form>
  );
}
export function CartView() {
  const { data, error, reload } = useData<Cart>("/api/v1/me/cart");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  async function update(id: string, quantity: number) {
    setBusy(true);
    setMessage("Updating cart…");
    try {
      await call("/api/v1/me/cart", "PATCH", { variantId: id, quantity });
      await reload();
      setDraftIds((ids) => ids.filter((value) => value !== id));
      setMessage("Cart updated.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="info-panel">
      <Message
        text={error || message || (!data ? "Loading cart…" : "")}
        error={!!error}
      />
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
                    {l.quantity > l.available && (
                      <p role="status">
                        Only {l.available} available. Reduce the quantity before
                        checkout.
                      </p>
                    )}
                    <CartQuantity
                      key={`${l.variantId}-${l.quantity}`}
                      line={l}
                      busy={busy}
                      update={update}
                      onDraft={(id, changed) =>
                        setDraftIds((ids) =>
                          changed
                            ? [...new Set([...ids, id])]
                            : ids.filter((value) => value !== id),
                        )
                      }
                    />
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
              {draftIds.length ? (
                <p role="status">
                  Update each changed quantity before checkout. Your total still
                  reflects saved quantities.
                </p>
              ) : (
                <Link
                  className="button button-primary"
                  href="/account/checkout"
                >
                  Review checkout
                </Link>
              )}
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
  const captions: Record<string, string> = {
    line1: "Address line 1",
    line2: "Address line 2",
    postalCode: "PIN code",
    upiId: "UPI ID",
    ifsc: "IFSC",
    holderName: "Account holder",
    verifiedNetPayment: "Verified payment",
    remaining: "Amount still to verify",
    reservationDeadline: "Stock reservation deadline",
    finalPayable: "Total to pay",
  };
  return (
    <dl className="grid gap-2 my-4">
      {Object.entries(values)
        .filter(([, v]) => v !== "" && v !== null)
        .map(([k, v]) => (
          <div key={k} className="flex flex-wrap gap-2">
            <dt className="text-muted">
              {captions[k] ??
                k.charAt(0).toUpperCase() +
                  k.slice(1).replace(/([A-Z])/g, " $1")}
              :
            </dt>
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
      <Message
        text={
          error || message || (!addresses ? "Loading delivery addresses…" : "")
        }
        error={!!error}
      />
      <p className="mb-5 text-sm">
        Choose a saved delivery address, review the total, then place your
        order. Payment instructions follow after the order is placed.
      </p>
      {addresses?.length === 0 && (
        <p className="mb-5" role="status">
          Add a delivery address before reviewing your order.{" "}
          <Link className="text-link" href="/account/addresses">
            Add delivery address
          </Link>
        </p>
      )}
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
        <button
          disabled={busy || !addresses?.length}
          className="button button-secondary"
        >
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
    sku?: string | null;
    imageUrl?: string | null;
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
const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAYMENT_UNDER_REVIEW",
  "PAYMENT_REJECTED",
  "ADMIN_REVIEW",
  "READY_FOR_DISPATCH",
  "DISPATCHED",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNED",
  "CANCELLED",
  "RESERVATION_EXPIRED",
];
const PAYMENT_STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "OVERPAID"];
const dateText = (v: string) =>
  new Date(v).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
// Dispatch progress is shown from the order's existing status; no new state is created.
const dispatchText = (status: string) =>
  status === "READY_FOR_DISPATCH"
    ? "Ready to dispatch"
    : ["DISPATCHED", "DELIVERED", "DELIVERY_FAILED", "RETURNED"].includes(
          status,
        )
      ? orderStatus(status).label
      : "Not dispatched";
function Select({
  name,
  label: caption,
  options,
  defaultValue = "",
}: {
  name: string;
  label: string;
  options: [string, string][];
  defaultValue?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {caption}
      <select className="field mt-1" name={name} defaultValue={defaultValue}>
        <option value="">All</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
function QuickAction({ o }: { o: Order }) {
  if (o.status === "READY_FOR_DISPATCH")
    return (
      <Link
        className="button compact"
        href={`/admin/dispatch/new?orderId=${encodeURIComponent(o.id)}`}
      >
        Dispatch
      </Link>
    );
  if (o.status === "PAYMENT_UNDER_REVIEW")
    return (
      <Link
        className="button button-secondary compact"
        href={`/admin/sales/orders/${o.id}#payment`}
      >
        Verify payment
      </Link>
    );
  return null;
}
export function OrderList({
  admin = false,
  initialStatus = "",
  initialPaymentStatus = "",
}: {
  admin?: boolean;
  initialStatus?: string;
  initialPaymentStatus?: string;
}) {
  const [query, setQuery] = useState(() => {
    const q = new URLSearchParams();
    if (ORDER_STATUSES.includes(initialStatus)) q.set("status", initialStatus);
    if (PAYMENT_STATUSES.includes(initialPaymentStatus))
      q.set("paymentStatus", initialPaymentStatus);
    return q.size ? `?${q}` : "";
  });
  const [category, setCategory] = useState("");
  const { data, error } = useData<{ orders: Order[] }>(
    `${admin ? "/api/v1/admin/sales" : "/api/v1/me"}/orders${query}`,
  );
  const orders = (data?.orders ?? []).filter(
    (o) => !category || o.category === category,
  );
  const base = admin ? "/admin/sales/orders" : "/account/orders";
  return (
    <section className="space-y-5" aria-label="Orders">
      {admin && (
        <form
          className="o-card o-filters"
          onSubmit={(e) => {
            e.preventDefault();
            const fields = new FormData(e.currentTarget);
            const q = new URLSearchParams();
            for (const [key, value] of fields)
              if (value && key !== "category") q.set(key, String(value));
            setCategory(String(fields.get("category") ?? ""));
            setQuery(q.size ? `?${q}` : "");
          }}
        >
          <Field
            name="q"
            label="Order number or customer/dealer"
            required={false}
          />
          <Select
            name="status"
            label="Order status"
            defaultValue={initialStatus}
            options={ORDER_STATUSES.map((v) => [v, orderStatus(v).label])}
          />
          <Select
            name="paymentStatus"
            label="Payment status"
            defaultValue={initialPaymentStatus}
            options={PAYMENT_STATUSES.map((v) => [v, paymentStatus(v).label])}
          />
          <Select
            name="category"
            label="Customer category"
            options={[
              ["RETAIL", "Retail"],
              ["APPROVED_DEALER", "Approved dealer"],
            ]}
          />
          <Field name="from" label="From date" type="date" required={false} />
          <Field name="to" label="To date" type="date" required={false} />
          <button className="button">Search orders</button>
        </form>
      )}
      {error && (
        <p role="alert" className="o-callout status-red">
          <strong>Orders could not be loaded</strong>
          <span>{error}</span>
        </p>
      )}
      {!error && !data && (
        <p role="status" className="text-muted">
          Loading orders…
        </p>
      )}
      {data && !orders.length && (
        <div className="o-card text-center">
          <p className="font-semibold">
            {query || category
              ? "No orders match these filters"
              : "No orders yet."}
          </p>
          <p className="mt-1 text-sm text-muted">
            {admin
              ? "Adjust or clear the filters to see more orders."
              : "When you place an order it will appear here."}
          </p>
          {!admin && (
            <Link href="/products" className="button mt-4">
              Browse products
            </Link>
          )}
        </div>
      )}
      {!!orders.length && admin && (
        <div
          className="o-card o-responsive"
          role="region"
          aria-label="Orders table"
          tabIndex={0}
        >
          <table className="o-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Date</th>
                <th className="num">Items</th>
                <th className="num">Total</th>
                <th>Payment</th>
                <th>Order status</th>
                <th>Dispatch</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td data-label="Order">
                    <Link
                      href={`${base}/${o.id}`}
                      className="text-link font-semibold"
                    >
                      {o.number}
                    </Link>
                  </td>
                  <td data-label="Customer">
                    {o.customerSnapshot.businessName || o.customerSnapshot.name}
                    <div className="text-xs text-muted">
                      {o.category === "APPROVED_DEALER" ? "Dealer" : "Retail"}
                    </div>
                  </td>
                  <td data-label="Date">{dateText(o.createdAt)}</td>
                  <td data-label="Items" className="num">
                    {o.lines.length}
                  </td>
                  <td data-label="Total" className="num">
                    {money(o.totalPaise)}
                  </td>
                  <td data-label="Payment">
                    <StatusBadge {...paymentStatus(o.paymentStatus)} />
                  </td>
                  <td data-label="Status">
                    <StatusBadge {...orderStatus(o.status)} />
                  </td>
                  <td data-label="Dispatch" className="text-sm">
                    {dispatchText(o.status)}
                  </td>
                  <td>
                    <QuickAction o={o} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!!orders.length && !admin && (
        <ul className="o-order-cards">
          {orders.map((o) => {
            const first = o.lines[0];
            return (
              <li key={o.id} className="o-order-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {!admin && first?.imageUrl && (
                      <Image
                        unoptimized
                        src={first.imageUrl}
                        alt=""
                        width={44}
                        height={44}
                        className="o-thumb"
                      />
                    )}
                    <div>
                      <Link
                        href={`${base}/${o.id}`}
                        className="text-link font-semibold"
                      >
                        {o.number}
                      </Link>
                      <p className="text-xs text-muted">
                        {dateText(o.createdAt)}
                      </p>
                    </div>
                  </div>
                  <strong>{money(o.totalPaise)}</strong>
                </div>
                {admin && (
                  <p className="text-sm">
                    {o.customerSnapshot.businessName || o.customerSnapshot.name}{" "}
                    · {o.category === "APPROVED_DEALER" ? "Dealer" : "Retail"}
                  </p>
                )}
                <p className="text-sm text-muted">
                  {first
                    ? `${first.productName} ${first.packSize}${
                        o.lines.length > 1
                          ? ` + ${o.lines.length - 1} more`
                          : ""
                      }`
                    : ""}{" "}
                  · {o.lines.length} {o.lines.length === 1 ? "item" : "items"}
                </p>
                <p className="sr-only">
                  {label(o.status)} · {label(o.paymentStatus)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge {...orderStatus(o.status)} />
                  <StatusBadge {...paymentStatus(o.paymentStatus)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`${base}/${o.id}`}
                    className="button button-secondary compact"
                  >
                    View details
                  </Link>
                  {admin && <QuickAction o={o} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {admin && !!data?.orders.length && (
        <p className="text-sm text-muted">
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
  const [failed, setFailed] = useState(false);
  return (
    <section className="info-panel">
      <h2 className="text-xl font-semibold">Submit payment proof</h2>
      <p className="my-4">
        {["CANCELLED", "RESERVATION_EXPIRED"].includes(order.status)
          ? "Do not send a new payment for this cancelled or expired order. If you already transferred money, submit proof for admin review; stock is not restored automatically."
          : order.remainingPaise === 0
            ? "No further payment is requested. You may submit missing evidence for an earlier transfer."
            : order.submissions.some((s) =>
                  ["SUBMITTED", "UNDER_REVIEW"].includes(s.status),
                )
              ? "A payment proof is already awaiting review. Check its status below before making another transfer. A screenshot does not confirm payment."
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
          setFailed(false);
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
            setFailed(true);
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
      <Message text={message} error={failed} />
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
  const closed = ["CANCELLED", "RESERVATION_EXPIRED"].includes(o?.status ?? "");
  const payPending = o?.submissions.some((s) =>
    ["SUBMITTED", "UNDER_REVIEW"].includes(s.status),
  );
  const latestSubmission = o?.submissions.at(-1);
  const latestPayment = o?.payments.at(-1);
  const explanation = o && customerExplanation(o);
  return (
    <>
      {error && (
        <p role="alert" className="o-callout status-red">
          <strong>Order could not be loaded</strong>
          <span>{error}</span>
        </p>
      )}
      {!error && !o && (
        <p role="status" className="min-h-screen text-muted">
          Loading order details…
        </p>
      )}
      {o && explanation && (
        <>
          <header className="o-card">
            <div className="o-header">
              <div>
                <p className="eyebrow">
                  {admin ? "Sales order" : "Your order"}
                </p>
                <h2 className="text-2xl font-semibold">{o.number}</h2>
                <p className="mt-1 text-sm text-muted">
                  Placed {dateText(o.createdAt)}
                  {admin &&
                    ` · ${
                      o.customerSnapshot.businessName || o.customerSnapshot.name
                    }`}
                </p>
                <p className="sr-only">
                  {label(o.status)} · {label(o.paymentStatus)} ·{" "}
                  {label(o.category)}
                </p>
                <div className="o-badges">
                  <StatusBadge {...orderStatus(o.status)} />
                  <StatusBadge {...paymentStatus(o.paymentStatus)} />
                  <StatusBadge
                    label={`Dispatch: ${dispatchText(o.status)}`}
                    tone={
                      ["DISPATCHED", "DELIVERED"].includes(o.status)
                        ? "blue"
                        : "gray"
                    }
                  />
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted">Order total</p>
                <p className="text-2xl font-semibold">{money(o.totalPaise)}</p>
                {admin && (
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {payPending && (
                      <a className="button compact" href="#payment">
                        Review payment
                      </a>
                    )}
                    {o.status === "READY_FOR_DISPATCH" && (
                      <Link
                        className="button compact"
                        href={`/admin/dispatch/new?orderId=${encodeURIComponent(o.id)}`}
                      >
                        Create dispatch
                      </Link>
                    )}
                    <Link
                      className="button button-secondary compact"
                      href={`/admin/dispatch?q=${encodeURIComponent(o.number)}`}
                    >
                      Dispatch & delivery
                    </Link>
                  </div>
                )}
                {!admin && !closed && o.remainingPaise > 0 && (
                  <a
                    className="button compact mt-3"
                    href="#payment-instructions"
                  >
                    Payment instructions
                  </a>
                )}
              </div>
            </div>
          </header>
          {!admin && (
            <div className={`o-callout status-${explanation.tone}`}>
              <strong>{explanation.title}</strong>
              {explanation.body}
            </div>
          )}
          {admin && (o.lateReviewRequired || o.refundDecisionRequired) && (
            <div className="o-callout status-amber">
              <strong>Admin decision required</strong>
              {o.lateReviewRequired &&
                "Late payment / reservation review required. Stock will not be restored automatically. "}
              {o.refundDecisionRequired &&
                "Manual refund decision required. No refund has been initiated by this website."}
            </div>
          )}
          <Card title="Order progress">
            <ProgressTimeline
              steps={buildTimeline(o, admin ? "admin" : "customer")}
            />
          </Card>
          <div className="o-grid">
            <div className="o-stack">
              <Card title="Ordered products">
                <div
                  className="o-scroll o-responsive"
                  role="region"
                  aria-label="Ordered products"
                  tabIndex={0}
                >
                  <table className="o-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th className="num">Qty</th>
                        <th className="num">Unit price</th>
                        <th className="num">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.lines.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <div className="flex items-center gap-3">
                              {l.imageUrl && (
                                <Image
                                  unoptimized
                                  src={l.imageUrl}
                                  alt=""
                                  width={44}
                                  height={44}
                                  className="o-thumb"
                                />
                              )}
                              <span>
                                <strong>{l.productName}</strong>
                                <br />
                                <span className="text-xs text-muted">
                                  {l.variantName} · {l.packSize}
                                </span>
                              </span>
                            </div>
                          </td>
                          <td data-label="SKU">{l.sku ?? "—"}</td>
                          <td className="num" data-label="Quantity">
                            {l.quantity}
                          </td>
                          <td className="num" data-label="Unit price">
                            {money(l.unitPricePaise)}
                          </td>
                          <td className="num" data-label="Line total">
                            {money(l.linePricePaise)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 ml-auto max-w-xs">
                  <Facts
                    items={[
                      ["Subtotal", money(o.subtotalPaise)],
                      [`Tax (${o.taxMode.toLowerCase()})`, money(o.taxPaise)],
                      ["Delivery", money(o.deliveryPaise)],
                      [
                        "Grand total",
                        <strong key="t">{money(o.totalPaise)}</strong>,
                      ],
                    ]}
                  />
                </div>
                {o.notes && (
                  <p className="mt-4 text-sm">
                    <span className="text-muted">Customer notes: </span>
                    {o.notes}
                  </p>
                )}
              </Card>
              <Card title="Payment" id="payment">
                <Facts
                  items={[
                    ["Required amount", money(o.totalPaise)],
                    ["Verified received", money(o.verifiedPaise)],
                    [
                      "Remaining balance",
                      o.remainingPaise ? money(o.remainingPaise) : null,
                    ],
                    [
                      "Method",
                      latestPayment?.method ?? latestSubmission?.method,
                    ],
                    [
                      "Reference",
                      latestPayment?.bankReference ??
                        latestSubmission?.reference,
                    ],
                    [
                      "Submitted",
                      latestSubmission && dateText(latestSubmission.createdAt),
                    ],
                    [
                      "Verification",
                      latestSubmission && (
                        <StatusBadge
                          key="v"
                          {...submissionStatus(latestSubmission.status)}
                        />
                      ),
                    ],
                  ]}
                />
                {!o.submissions.length && (
                  <p className="mt-3 text-sm text-muted">
                    No payment proof submitted yet.
                  </p>
                )}
                {o.submissions.map((s) => (
                  <article
                    key={s.id}
                    className="mt-5 border-t border-line pt-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge {...submissionStatus(s.status)} />
                      <h3 className="text-sm font-semibold">
                        {label(s.status)} · {s.method} · {s.reference}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      Paid on {s.paidOn.slice(0, 10)} · Submitted{" "}
                      {dateText(s.createdAt)}
                    </p>
                    {s.duplicateReference && (
                      <p className="o-callout status-amber mt-2">
                        Possible duplicate reference or screenshot. Admin review
                        required.
                      </p>
                    )}
                    {s.late && (
                      <p className="o-callout status-amber mt-2">
                        Submission close to or after reservation expiry.
                      </p>
                    )}
                    {s.publicMessage && (
                      <p className="mt-2 text-sm">{s.publicMessage}</p>
                    )}
                    {admin && (s.internalNotes || s.reviewedById) && (
                      <p className="mt-2 text-sm text-muted">
                        Internal: {s.internalNotes}
                        {s.reviewedById && ` · Reviewer ${s.reviewedById}`}
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
                      className="my-4 max-h-80 w-auto max-w-full rounded-lg border border-line object-contain"
                    />
                    {admin &&
                      ["SUBMITTED", "UNDER_REVIEW"].includes(s.status) && (
                        <ReviewForm submission={s} reload={reload} />
                      )}
                  </article>
                ))}
                {!!o.payments.length && (
                  <div className="mt-5 border-t border-line pt-5">
                    <h3 className="mb-2 text-sm font-semibold">
                      Verified payment history
                    </h3>
                    <ul className="space-y-2 text-sm">
                      {o.payments.map((p) => (
                        <li key={p.id}>
                          {p.kind === "REFUND" ? "Refund" : "Payment"} ·{" "}
                          {money(p.amountPaise)} · {p.method} ·{" "}
                          {p.bankReference} · {dateText(p.createdAt)}
                          {admin && (
                            <span className="text-muted">
                              {" "}
                              · Verifier {p.verifiedById} {p.notes}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
              {!admin && <ProofUpload order={o} reload={reload} />}
              {(admin ||
                !o.reservations.some((r) => r.status === "CONSUMED")) && (
                <OrderActions order={o} admin={admin} reload={reload} />
              )}
              <Card title={admin ? "Activity history" : "Order status history"}>
                <ul className="divide-y divide-line">
                  {o.events.map((e) => (
                    <li className="py-3 text-sm" key={e.id}>
                      <p className="font-semibold">
                        {label(e.kind)}{" "}
                        <span className="font-normal text-muted">
                          · {dateText(e.createdAt)}
                        </span>
                      </p>
                      <p>{e.message}</p>
                      {admin && e.internalNotes && (
                        <p className="mt-1 rounded-md bg-[#f8f6fa] px-2 py-1 text-muted">
                          Internal note: {e.internalNotes}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted">
                  Status updates appear here. No external message delivery is
                  implied.
                </p>
              </Card>
            </div>
            <aside className="o-stack">
              <Card title="Customer">
                <Facts
                  items={[
                    ["Name", o.customerSnapshot.name],
                    ["Business", o.customerSnapshot.businessName],
                    ["Email", o.customerSnapshot.email],
                    ["Phone", o.customerSnapshot.phone],
                    [
                      "Category",
                      o.category === "APPROVED_DEALER"
                        ? "Approved dealer"
                        : "Retail",
                    ],
                    ["GSTIN", o.customerSnapshot.gstin],
                  ]}
                />
                <h3 className="mb-2 mt-4 text-sm font-semibold">
                  Shipping address
                </h3>
                <p className="text-sm">
                  {[
                    o.addressSnapshot.line1,
                    o.addressSnapshot.line2,
                    o.addressSnapshot.city,
                    o.addressSnapshot.state,
                    o.addressSnapshot.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {admin && (
                  <Link
                    href="/admin/customers"
                    className="text-link mt-3 inline-block"
                  >
                    Customers list
                  </Link>
                )}
              </Card>
              {admin ? (
                <Card title="Dispatch">
                  <p className="text-sm">
                    Status: <strong>{dispatchText(o.status)}</strong>
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    Courier, AWB, packages, delivery events and proof are
                    managed on the dispatch screen.
                  </p>
                  <Link
                    href={`/admin/dispatch?q=${encodeURIComponent(o.number)}`}
                    className="button button-secondary compact mt-3"
                  >
                    Open dispatch & delivery
                  </Link>
                </Card>
              ) : (
                <DeliveryTracking orderId={o.id} />
              )}
              {!admin && (
                <Card title="Payment instructions" id="payment-instructions">
                  <Facts
                    items={Object.entries(o.paymentDetails).map(([k, v]) => [
                      k === "upiId"
                        ? "UPI ID"
                        : k === "ifsc"
                          ? "IFSC"
                          : k === "holderName"
                            ? "Account holder"
                            : k.charAt(0).toUpperCase() +
                              k.slice(1).replace(/([A-Z])/g, " $1"),
                      v,
                    ])}
                  />
                  <p className="mt-3 text-sm">
                    {closed
                      ? "Do not make a new transfer. Existing payments require admin review."
                      : o.remainingPaise === 0
                        ? "No further payment is requested. Verified funds are recorded."
                        : `Amount to pay: ${money(o.remainingPaise)}. Use your order number as the payment remark, then upload proof; FIXUP verifies the actual bank record.`}
                  </p>
                  {!closed && o.remainingPaise > 0 && (
                    <p className="mt-2 text-sm">
                      Reservation deadline:{" "}
                      <strong>{dateText(o.reservationExpiresAt)}</strong>
                    </p>
                  )}
                </Card>
              )}
              <Card title="Stock reservation">
                <ul className="space-y-1 text-sm">
                  {o.reservations.map((r) => (
                    <li key={r.id}>
                      {o.lines.find((l) => l.variantId === r.variantId)
                        ?.packSize ?? r.variantId}{" "}
                      · {r.quantity} units · {label(r.status)} ·{" "}
                      {r.expiresAt
                        ? dateText(r.expiresAt)
                        : r.status === "CONSUMED"
                          ? "Dispatched"
                          : "Held after full verified payment"}
                    </li>
                  ))}
                </ul>
              </Card>
              {admin && o.internalNotes && (
                <Card title="Internal notes (admin only)">
                  <p className="text-sm">{o.internalNotes}</p>
                </Card>
              )}
            </aside>
          </div>
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
  const pending = (data ?? []).filter((s) =>
    ["SUBMITTED", "UNDER_REVIEW"].includes(s.status),
  );
  const reviewed = (data ?? []).filter(
    (s) => !["SUBMITTED", "UNDER_REVIEW"].includes(s.status),
  );
  const row = (s: NonNullable<typeof data>[number]) => (
    <li key={s.id} className="o-queue-row">
      <div className="o-queue-main">
        <Link
          className="text-link font-semibold"
          href={`/admin/sales/orders/${s.orderId}#payment`}
        >
          {s.order.number}
        </Link>
        <span>{s.order.customerSnapshot.name}</span>
        <strong>{money(s.order.totalPaise)}</strong>
      </div>
      <div className="o-badges">
        <StatusBadge {...submissionStatus(s.status)} />
        <StatusBadge {...paymentStatus(s.order.paymentStatus)} />
        {s.duplicateReference && (
          <StatusBadge label="Possible duplicate" tone="amber" />
        )}
        {s.late && <StatusBadge label="Late review required" tone="amber" />}
      </div>
      <p className="text-sm text-muted">
        {s.method} · Ref {s.reference} · Paid {s.paidOn.slice(0, 10)} ·
        Submitted {dateText(s.createdAt)}
      </p>
      {["SUBMITTED", "UNDER_REVIEW"].includes(s.status) && (
        <Link
          className="button compact"
          href={`/admin/sales/orders/${s.orderId}#payment`}
        >
          Inspect proof & verify
        </Link>
      )}
    </li>
  );
  return (
    <section className="space-y-5" aria-label="Payment submissions">
      {error && (
        <p role="alert" className="o-callout status-red">
          <strong>Payments could not be loaded</strong>
          <span>{error}</span>
        </p>
      )}
      {!error && !data && (
        <p role="status" className="text-muted">
          Loading payment submissions…
        </p>
      )}
      {data && !data.length && (
        <div className="o-card text-center">
          <p className="font-semibold">No payment submissions yet.</p>
          <p className="mt-1 text-sm text-muted">
            Submitted payment proofs will appear here for verification.
          </p>
        </div>
      )}
      {!!pending.length && (
        <Card
          title={`Waiting for verification (${pending.length})`}
          action={
            <span className="text-sm text-muted">
              Open a submission to check the proof against the bank record.
            </span>
          }
        >
          <ul className="o-queue">{pending.map(row)}</ul>
        </Card>
      )}
      {!!reviewed.length && (
        <Card title={`Reviewed (${reviewed.length})`}>
          <ul className="o-queue">{reviewed.map(row)}</ul>
        </Card>
      )}
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
