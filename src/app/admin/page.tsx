import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getActor } from "@/server/permissions/service";
import { getDb } from "@/server/db/client";
import { stockRows } from "@/modules/inventory/read";
import { Icon } from "@/components/admin/icons";
import type { IconName } from "@/components/admin/nav";

export const metadata = { title: "Admin dashboard" };
type Tone = "amber" | "blue" | "green" | "red" | "gray";
type Metric = {
  label: string;
  value: number;
  href: string;
  icon: IconName;
  tone: Tone;
  hint: string;
};
const tint: Record<Tone, string> = {
  amber: "status-amber",
  blue: "status-blue",
  green: "status-green",
  red: "status-red",
  gray: "status-gray",
};
export default async function AdminPage() {
  const actor = await getActor(await headers());
  if (!actor) redirect("/login");
  if (!actor.permissions.includes("admin.access"))
    return (
      <main id="main" className="mx-auto min-h-[70vh] max-w-5xl px-5 py-16">
        <h1 className="text-3xl font-semibold">Access restricted</h1>
        <p className="my-5 text-muted">
          Your account does not have administrator access.
        </p>
        <Link href="/account" className="button">
          Back to my account
        </Link>
      </main>
    );
  const can = (p: string) => (actor.permissions as string[]).includes(p);
  const db = getDb();
  const [orderCounts, pendingDealers, lowStock, events] = await Promise.all([
    can("orders.manage")
      ? db.salesOrder.groupBy({ by: ["status"], _count: true })
      : null,
    can("dealers.manage")
      ? db.dealerProfile.count({ where: { status: "PENDING" } })
      : null,
    can("inventory.read")
      ? stockRows(actor, { status: "LOW" }).then((r) => r.length)
      : null,
    db.auditLog.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      select: { id: true, action: true, entityType: true, createdAt: true },
    }),
  ]);
  const count = (status: string) =>
    orderCounts?.find((r) => r.status === status)?._count ?? 0;
  const orderLink = (status?: string) =>
    `/admin/sales/orders${status ? `?status=${status}` : ""}`;
  const metrics: Metric[] = [];
  if (orderCounts)
    metrics.push(
      {
        label: "Total orders",
        value: orderCounts.reduce((n, r) => n + r._count, 0),
        href: orderLink(),
        icon: "cart",
        tone: "gray",
        hint: "All orders",
      },
      {
        label: "Pending payments",
        value: count("PENDING_PAYMENT"),
        href: orderLink("PENDING_PAYMENT"),
        icon: "card",
        tone: "amber",
        hint: "Waiting for the customer to pay",
      },
      {
        label: "Payment verification",
        value: count("PAYMENT_UNDER_REVIEW"),
        href: orderLink("PAYMENT_UNDER_REVIEW"),
        icon: "receipt",
        tone: "blue",
        hint: "Proof submitted, needs review",
      },
      {
        label: "Ready for dispatch",
        value: count("READY_FOR_DISPATCH"),
        href: orderLink("READY_FOR_DISPATCH"),
        icon: "box",
        tone: "green",
        hint: "Paid, waiting to ship",
      },
      {
        label: "Dispatched",
        value: count("DISPATCHED"),
        href: orderLink("DISPATCHED"),
        icon: "truck",
        tone: "blue",
        hint: "On the way",
      },
      {
        label: "Delivered",
        value: count("DELIVERED"),
        href: orderLink("DELIVERED"),
        icon: "badge",
        tone: "green",
        hint: "Completed orders",
      },
    );
  if (pendingDealers !== null)
    metrics.push({
      label: "Pending dealer approvals",
      value: pendingDealers,
      href: "/admin/dealers?status=PENDING",
      icon: "users",
      tone: "amber",
      hint: "Applications to review",
    });
  if (lowStock !== null)
    metrics.push({
      label: "Low-stock products",
      value: lowStock,
      href: "/admin/operations/inventory?status=LOW",
      icon: "layers",
      tone: "red",
      hint: "At or below minimum",
    });
  type Action = { n: number; text: string; href: string; cta: string };
  const actions = [
    orderCounts &&
      can("payments.verify") && {
        n: count("PAYMENT_UNDER_REVIEW"),
        text: "payment proofs waiting for verification",
        href: "/admin/sales/payments",
        cta: "Verify payments",
      },
    orderCounts &&
      can("dispatch.manage") && {
        n: count("READY_FOR_DISPATCH"),
        text: "orders ready for dispatch",
        href: orderLink("READY_FOR_DISPATCH"),
        cta: "View orders",
      },
    orderCounts && {
      n: count("ADMIN_REVIEW"),
      text: "orders need an admin decision (late or overpaid)",
      href: orderLink("ADMIN_REVIEW"),
      cta: "Review",
    },
    orderCounts && {
      n: count("DELIVERY_FAILED"),
      text: "deliveries failed and need action",
      href: orderLink("DELIVERY_FAILED"),
      cta: "Resolve",
    },
    pendingDealers !== null && {
      n: pendingDealers,
      text: "dealer applications waiting for approval",
      href: "/admin/dealers?status=PENDING",
      cta: "Review dealers",
    },
    lowStock !== null && {
      n: lowStock,
      text: "variants at or below minimum stock",
      href: "/admin/operations/inventory?status=LOW",
      cta: "Check stock",
    },
  ].filter((a): a is Action => typeof a === "object" && a !== null && a.n > 0);
  return (
    <main id="main" className="container py-8 sm:py-12">
      <p className="eyebrow">Business workspace</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Admin dashboard
      </h1>
      <p className="mt-2 text-muted">
        What needs attention today, and how the business is moving.
      </p>
      {!!metrics.length && (
        <section aria-label="Key numbers" className="dash-cards mt-6">
          {metrics.map((m) => (
            <Link key={m.label} href={m.href} className="dash-card">
              <span className="dash-card-top">
                {m.label}
                <span className={`dash-icon ${tint[m.tone]}`}>
                  <Icon name={m.icon} className="size-4" />
                </span>
              </span>
              <span className="dash-value">{m.value}</span>
              <span className="dash-hint">{m.hint}</span>
            </Link>
          ))}
        </section>
      )}
      <section className="o-card mt-6" aria-label="Action required">
        <header className="o-card-head">
          <h2>Action required</h2>
        </header>
        {actions.length ? (
          <ul className="divide-y divide-line">
            {actions.map((a) => (
              <li
                key={a.text}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <span>
                  <strong className="mr-2">{a.n}</strong>
                  {a.text}
                </span>
                <Link className="button button-secondary compact" href={a.href}>
                  {a.cta}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Nothing needs attention right now.
          </p>
        )}
      </section>
      <section className="o-card mt-6" aria-label="Recent activity">
        <header className="o-card-head">
          <h2>Recent activity</h2>
        </header>
        <ul className="divide-y divide-line">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap justify-between gap-2 py-3 text-sm"
            >
              <span>
                {event.action.toLowerCase().replaceAll("_", " ")} ·{" "}
                {event.entityType}
              </span>
              <time
                className="text-muted"
                dateTime={event.createdAt.toISOString()}
              >
                {new Intl.DateTimeFormat("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Kolkata",
                }).format(event.createdAt)}
              </time>
            </li>
          ))}
        </ul>
        {events.length === 0 && (
          <p className="text-sm text-muted">No activity recorded yet.</p>
        )}
      </section>
    </main>
  );
}
