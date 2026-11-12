import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActor } from "@/server/permissions/service";
import { getDb } from "@/server/db/client";
import Link from "next/link";

export const metadata = { title: "Admin dashboard" };
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
  const db = getDb();
  const [users, pending, sessions, events] = await Promise.all([
    db.user.count(),
    db.dealerProfile.count({ where: { status: "PENDING" } }),
    db.session.count({ where: { expiresAt: { gt: new Date() } } }),
    db.auditLog.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      select: { id: true, action: true, entityType: true, createdAt: true },
    }),
  ]);
  return (
    <main
      id="main"
      className="mx-auto min-h-[70vh] max-w-6xl px-5 py-12 sm:px-8"
    >
      <p className="eyebrow">BUSINESS WORKSPACE</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">
        Admin dashboard
      </h1>
      <p className="mt-3 text-muted">
        Account activity and access at a glance.
      </p>
      <div className="my-8 grid gap-4 sm:grid-cols-3">
        {[
          ["Registered accounts", users],
          ["Pending dealers", pending],
          ["Active sessions", sessions],
        ].map(([title, number]) => (
          <section
            key={title}
            className="rounded-xl border border-line bg-white p-6"
          >
            <h2 className="text-sm text-muted">{title}</h2>
            <p className="mt-3 text-4xl font-semibold">{number}</p>
          </section>
        ))}
      </div>
      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <ul className="mt-4 divide-y divide-line">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap justify-between gap-2 py-4 text-sm"
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
          <p className="mt-4 text-sm text-muted">No activity recorded yet.</p>
        )}
      </section>
    </main>
  );
}
