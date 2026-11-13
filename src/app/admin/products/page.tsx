import Link from "next/link";
import { pageActor, Workspace } from "@/components/management/shared";
import { ManagedForm } from "@/components/forms/managed-form";
import { reasonField } from "@/components/management/fields";
import { getDb } from "@/server/db/client";
export const metadata = { title: "Products and variants" };
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await pageActor("catalogue.write"); const { q = "" } = await searchParams; const db = getDb();
  const [products, categories] = await Promise.all([db.product.findMany({ where: q ? { name: { contains: q.slice(0,100), mode: "insensitive" } } : {}, include: { _count: { select: { variants: true } } }, orderBy: { name: "asc" }, take: 100 }), db.category.findMany({ orderBy: { name: "asc" }, take: 100 })]);
  return <Workspace admin title="Products & variants"><Link className="button" href="/admin/products/new">Create parent product</Link><form className="management-form flex gap-4"><label className="grow">Search products<input name="q" defaultValue={q} maxLength={100} /></label><button className="button self-end">Search</button></form><div className="grid gap-4 sm:grid-cols-2">{products.map(p => <Link className="info-panel" key={p.id} href={`/admin/products/${p.id}`}><h2 className="text-xl font-semibold">{p.name}</h2><p className="mt-3">{p.published && p.active ? "Published" : "Unpublished / inactive"} · {p._count.variants} variants</p></Link>)}</div><h2 className="text-2xl font-semibold">Categories</h2>{[...categories, { id: "", name: "", slug: "", description: "", active: true }].map(c => <details className="info-panel" key={c.id}><summary className="cursor-pointer font-semibold">{c.name || "Add category"}</summary><div className="mt-5"><ManagedForm url="/api/v1/admin/content/categories" envelope={c.id ? { id: c.id } : {}} initial={c} fields={[{ name: "name", label: "Category name", required: true }, { name: "slug", label: "URL slug", required: true }, { name: "description", label: "Description", type: "textarea" }, { name: "active", label: "Active category", type: "checkbox" }, reasonField]} /></div></details>)}</Workspace>;
}
