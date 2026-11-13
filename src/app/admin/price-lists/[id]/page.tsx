import { notFound } from "next/navigation";
import { pageActor, Workspace, History } from "@/components/management/shared";
import { PriceListEditor } from "@/components/forms/price-list-editor";
import { getDb } from "@/server/db/client";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await pageActor("pricing.manage"); const { id } = await params; const db = getDb();
  const list = id === "new" ? undefined : await db.priceList.findUnique({ where: { id }, include: { entries: true } });
  if(list === null) notFound();
  const [products, events] = await Promise.all([db.product.findMany({ select: { id: true, name: true, variants: { select: { id: true, name: true } } }, orderBy: { name: "asc" }, take: 500 }), db.managementEvent.findMany({ where: { entityType: "PriceList", entityId: id }, orderBy: { createdAt: "desc" }, take: 100 })]);
  const targets = products.flatMap(p => p.variants.length ? p.variants.map(v => ({ value: `v:${v.id}`, label: `${p.name} — ${v.name}` })) : [{ value: `p:${p.id}`, label: p.name }]);
  return <Workspace admin title={list ? list.name : "Create price list"}><section className="info-panel"><PriceListEditor key={list?.version ?? "new"} initial={list} targets={targets} /></section><History events={events} />{events.length > 0 && <section className="info-panel"><h2 className="text-xl font-semibold">Price revisions</h2>{events.map(e => <details key={e.id} className="mt-4"><summary className="cursor-pointer">{e.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {e.reason}</summary><pre className="mt-3 max-h-72 overflow-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify({ before: e.before, after: e.after }, null, 2)}</pre></details>)}</section>}</Workspace>;
}
