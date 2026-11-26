// Presentation-only helpers. They translate the existing backend order/payment
// states into labels, colours, progress steps and customer wording. They never
// change, infer or invent a backend state.
export type Tone = "green" | "blue" | "amber" | "red" | "gray";

export const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const orderTone: Record<string, [string, Tone]> = {
  PENDING_PAYMENT: ["Pending Payment", "amber"],
  PAYMENT_UNDER_REVIEW: ["Payment Under Review", "blue"],
  PAYMENT_REJECTED: ["Payment Rejected", "red"],
  ADMIN_REVIEW: ["Admin Review", "amber"],
  READY_FOR_DISPATCH: ["Ready for Dispatch", "green"],
  DISPATCHED: ["Dispatched", "blue"],
  DELIVERED: ["Delivered", "green"],
  DELIVERY_FAILED: ["Delivery Failed", "red"],
  RETURNED: ["Returned", "gray"],
  CANCELLED: ["Cancelled", "gray"],
  RESERVATION_EXPIRED: ["Expired", "gray"],
};
const paymentTone: Record<string, [string, Tone]> = {
  UNPAID: ["Unpaid", "amber"],
  PARTIALLY_PAID: ["Partially Paid", "amber"],
  PAID: ["Paid", "green"],
  OVERPAID: ["Overpaid", "amber"],
};
export const orderStatus = (s: string): { label: string; tone: Tone } => {
  const [label, tone] = orderTone[s] ?? [titleCase(s), "gray" as Tone];
  return { label, tone };
};
export const paymentStatus = (s: string): { label: string; tone: Tone } => {
  const [label, tone] = paymentTone[s] ?? [titleCase(s), "gray" as Tone];
  return { label, tone };
};
export const submissionStatus = (s: string): { label: string; tone: Tone } => ({
  label: titleCase(s),
  tone:
    s === "VERIFIED"
      ? "green"
      : s === "REJECTED"
        ? "red"
        : s === "RESUBMISSION_REQUIRED"
          ? "amber"
          : "blue",
});

export type OrderLike = {
  status: string;
  paymentStatus: string;
  createdAt: string;
  verifiedPaise: number;
  remainingPaise: number;
  events: { kind: string; createdAt: string }[];
};
export type Step = {
  key: string;
  label: string;
  detail: string;
  state: "done" | "current" | "upcoming" | "problem";
  at?: string;
};
const latest = (o: OrderLike, test: (kind: string) => boolean) =>
  o.events
    .filter((e) => test(e.kind))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt;

// Five stages. A time is shown only when a recorded order event provides it.
export function buildTimeline(o: OrderLike, audience: "admin" | "customer") {
  const customer = audience === "customer";
  const verified = o.verifiedPaise > 0 && o.remainingPaise === 0;
  const s = o.status;
  const steps: Step[] = [
    {
      key: "placed",
      label: "Order placed",
      detail: customer
        ? "Your order was received and stock was reserved."
        : "Order created and stock reserved.",
      state: "done",
      at: o.createdAt,
    },
    {
      key: "payment",
      label: "Payment",
      detail: "",
      state: "upcoming",
    },
    {
      key: "ready",
      label: customer ? "Preparing for dispatch" : "Ready for dispatch",
      detail: "",
      state: "upcoming",
    },
    { key: "dispatched", label: "Dispatched", detail: "", state: "upcoming" },
    { key: "delivered", label: "Delivered", detail: "", state: "upcoming" },
  ];
  const [, pay, ready, sent, done] = steps;
  const set = (
    step: Step,
    state: Step["state"],
    detail: string,
    label?: string,
    at?: string,
  ) => {
    step.state = state;
    step.detail = detail;
    if (label) step.label = label;
    if (at) step.at = at;
  };
  const verifiedAt = latest(o, (k) => k === "VERIFIED");
  if (verified || ["READY_FOR_DISPATCH", "DISPATCHED"].includes(s))
    set(
      pay,
      "done",
      customer
        ? "Your payment was verified."
        : "Payment verified against the bank record.",
      "Payment verified",
      verifiedAt,
    );
  else if (s === "PAYMENT_UNDER_REVIEW")
    set(
      pay,
      "current",
      customer
        ? "Payment details received. Our team is verifying the transaction."
        : "Proof submitted. Verify or reject it.",
      "Payment under review",
      latest(o, (k) => k === "PROOF_SUBMITTED"),
    );
  else if (s === "PAYMENT_REJECTED")
    set(
      pay,
      "problem",
      customer
        ? "The payment could not be verified. Check the note and submit again."
        : "Payment proof was rejected or needs resubmission.",
      "Payment rejected",
      latest(o, (k) => k === "REJECTED" || k === "RESUBMISSION_REQUIRED"),
    );
  else if (s === "ADMIN_REVIEW")
    set(
      pay,
      "current",
      customer
        ? "We are reviewing your payment."
        : "Funds are in but an admin decision is needed (late payment or overpayment).",
      "Admin review",
    );
  else if (s === "RESERVATION_EXPIRED")
    set(
      pay,
      "problem",
      customer
        ? "The payment window ended and the stock reservation expired."
        : "Reservation expired before full verified payment.",
      "Reservation expired",
      latest(o, (k) => k === "RESERVATION_EXPIRED"),
    );
  else if (s === "CANCELLED")
    set(
      pay,
      "problem",
      "This order was cancelled.",
      "Cancelled",
      latest(o, (k) => k === "CANCEL"),
    );
  else if (o.paymentStatus === "PARTIALLY_PAID")
    set(
      pay,
      "current",
      customer
        ? "Part of the amount is verified. The balance is still due."
        : "Partially paid. Waiting for the balance.",
      "Partially paid",
    );
  else
    set(
      pay,
      "current",
      customer
        ? "Pay using the instructions below, then upload your proof."
        : "Waiting for the customer to pay and submit proof.",
      "Awaiting payment",
    );
  if (s === "READY_FOR_DISPATCH")
    set(
      ready,
      "current",
      customer
        ? "Your payment is confirmed and your order is ready for shipping."
        : "Paid and stock secured. Create the dispatch.",
    );
  else if (
    ["DISPATCHED", "DELIVERED", "DELIVERY_FAILED", "RETURNED"].includes(s)
  )
    set(
      ready,
      "done",
      customer ? "Packed for shipping." : "Dispatch prepared.",
    );
  if (s === "DISPATCHED")
    set(
      sent,
      "current",
      customer ? "Your package has been shipped." : "Goods shipped.",
    );
  else if (["DELIVERED", "DELIVERY_FAILED", "RETURNED"].includes(s))
    set(
      sent,
      "done",
      customer ? "Your package was shipped." : "Goods shipped.",
    );
  if (s === "DELIVERED")
    set(
      done,
      "done",
      customer ? "Your order was delivered." : "Delivery confirmed.",
    );
  else if (s === "DELIVERY_FAILED")
    set(
      done,
      "problem",
      customer
        ? "Delivery was not completed. FIXUP will arrange the next step."
        : "Delivery failed. Reschedule or record the return.",
      "Delivery failed",
    );
  else if (s === "RETURNED")
    set(
      done,
      "problem",
      customer ? "The package was returned to FIXUP." : "Returned to sender.",
      "Returned",
    );
  return steps;
}

export function customerExplanation(o: OrderLike): {
  title: string;
  body: string;
  tone: Tone;
} {
  const s = o.status;
  if (s === "PAYMENT_UNDER_REVIEW")
    return {
      title: "Payment Under Review",
      body: "We have received your payment details. Our team is verifying the transaction.",
      tone: "blue",
    };
  if (s === "READY_FOR_DISPATCH")
    return {
      title: "Ready for Dispatch",
      body: "Your payment is confirmed, and your order is ready for shipping.",
      tone: "green",
    };
  if (s === "DISPATCHED")
    return {
      title: "Order Dispatched",
      body: "Your package has been shipped. Delivery details appear below.",
      tone: "blue",
    };
  if (s === "DELIVERED")
    return {
      title: "Delivered",
      body: "Your order is marked delivered. Details are below.",
      tone: "green",
    };
  if (s === "RESERVATION_EXPIRED")
    return {
      title: "Payment Window Expired",
      body: "The payment reservation for this order expired and the stock was released. Please do not make a new transfer for it. If you already paid, contact FIXUP; otherwise you can place a new order from your cart.",
      tone: "gray",
    };
  if (s === "CANCELLED")
    return {
      title: "Order Cancelled",
      body: "This order was cancelled. Do not make a new transfer. Contact FIXUP about any payment already made.",
      tone: "gray",
    };
  if (s === "PAYMENT_REJECTED")
    return {
      title: "Payment Could Not Be Verified",
      body: "Check the message on your payment submission and submit the proof again while your reservation is active.",
      tone: "red",
    };
  if (s === "ADMIN_REVIEW")
    return {
      title: "Under Review by FIXUP",
      body: "Your payment is being reviewed by our team. No action is needed from you right now.",
      tone: "amber",
    };
  if (s === "DELIVERY_FAILED")
    return {
      title: "Delivery Not Completed",
      body: "The delivery attempt was not successful. FIXUP will arrange the next step. See the delivery updates below.",
      tone: "red",
    };
  if (s === "RETURNED")
    return {
      title: "Order Returned",
      body: "The package was returned to FIXUP. Contact FIXUP to discuss next steps.",
      tone: "gray",
    };
  if (o.paymentStatus === "PARTIALLY_PAID")
    return {
      title: "Partially Paid",
      body: "Part of your payment is verified. Pay the remaining balance and upload the proof.",
      tone: "amber",
    };
  if (o.paymentStatus === "OVERPAID")
    return {
      title: "Payment Received",
      body: "We received more than the order total. FIXUP will review and contact you.",
      tone: "amber",
    };
  return {
    title: "Awaiting Payment",
    body: "Pay the exact amount using the instructions below, then upload your payment proof.",
    tone: "amber",
  };
}

// Tone for plain status words shown in management tables (suppliers, purchase
// orders, receipts, stock flags). Unknown words stay neutral.
export function wordTone(value: string): Tone | null {
  const v = value.toUpperCase();
  if (
    [
      "ACTIVE",
      "APPROVED",
      "RECEIVED",
      "COMPLETED",
      "CONFIRMED",
      "VERIFIED",
    ].includes(v)
  )
    return "green";
  if (
    [
      "PENDING",
      "DRAFT",
      "PARTIAL",
      "PARTIALLY_RECEIVED",
      "SENT",
      "ORDERED",
      "OPEN",
    ].includes(v)
  )
    return "amber";
  if (["CANCELLED", "REJECTED", "OUT", "OUT_OF_STOCK"].includes(v))
    return "red";
  if (["INACTIVE", "SUSPENDED", "CLOSED"].includes(v)) return "gray";
  return null;
}
