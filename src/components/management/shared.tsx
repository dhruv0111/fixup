import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requirePermission, type Permission } from "@/server/permissions/service";
import { AppError } from "@/server/http/errors";
export async function pageActor(permission: Permission) {
  try { return await requirePermission(await headers(), permission); }
  catch (error) { if (error instanceof AppError && error.status === 401) redirect("/login"); if (error instanceof AppError && error.status === 403) redirect("/account"); throw error; }
}
export function Workspace({ title, children, admin = false }: { title: string; children: React.ReactNode; admin?: boolean }) {
  return <main id="main" className="container py-12"><Link className="text-link" href={admin ? "/admin" : "/account"}>← {admin ? "Admin dashboard" : "My account"}</Link><h1 className="my-6 text-3xl font-semibold">{title}</h1><div className="space-y-8">{children}</div></main>;
}
export function History({ events }: { events: { id: string; action?: string; reason: string | null; createdAt: Date }[] }) {
  return <section className="info-panel"><h2 className="text-xl font-semibold">Audit history</h2>{events.length ? <ul className="divide-y divide-line">{events.map(e => <li key={e.id} className="py-3 text-sm"><time>{e.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</time>{e.action && <p>{e.action.replaceAll("_", " ")}</p>}<p>{e.reason}</p></li>)}</ul> : <p className="mt-4 text-muted">No changes recorded yet.</p>}<p className="mt-3 text-xs text-muted">Most recent 100 events. Times shown in India time.</p></section>;
}
