import { notFound } from "next/navigation";
import { pageActor, Workspace, History } from "@/components/management/shared";
import { PriceListEditor } from "@/components/forms/price-list-editor";
import { getDb } from "@/server/db/client";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await pageActor("pricing.manage");
  const { id } = await params;
  const rawQuery = (await searchParams).q;
  const invalidQuery =
    rawQuery !== undefined &&
    (typeof rawQuery !== "string" || rawQuery.length > 100);
  const q =
    typeof rawQuery === "string" && !invalidQuery ? rawQuery.trim() : "";
  const db = getDb();
  const list =
    id === "new"
      ? undefined
      : await db.priceList.findUnique({
          where: { id },
          include: { entries: true },
        });
  if (list === null) notFound();
  const productSelect = {
    id: true,
    name: true,
    variants: { select: { id: true, name: true } },
  } as const;
  const [matches, savedProducts, events] = await Promise.all([
    db.product.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              {
                variants: {
                  some: {
                    OR: [
                      { name: { contains: q, mode: "insensitive" } },
                      { sku: { contains: q, mode: "insensitive" } },
                    ],
                  },
                },
              },
            ],
          }
        : {},
      select: productSelect,
      orderBy: { name: "asc" },
      take: 501,
    }),
    list?.entries.length
      ? db.product.findMany({
          where: {
            OR: [
              {
                id: {
                  in: list.entries.flatMap((e) =>
                    e.productId ? [e.productId] : [],
                  ),
                },
              },
              {
                variants: {
                  some: {
                    id: {
                      in: list.entries.flatMap((e) =>
                        e.variantId ? [e.variantId] : [],
                      ),
                    },
                  },
                },
              },
            ],
          },
          select: productSelect,
        })
      : Promise.resolve([]),
    db.managementEvent.findMany({
      where: { entityType: "PriceList", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const products = [
    ...new Map(
      [...savedProducts, ...matches.slice(0, 500)].map((p) => [p.id, p]),
    ).values(),
  ];
  const targets = products.flatMap((p) =>
    p.variants.length
      ? p.variants.map((v) => ({
          value: `v:${v.id}`,
          label: `${p.name} — ${v.name}`,
        }))
      : [{ value: `p:${p.id}`, label: p.name }],
  );
  return (
    <Workspace admin title={list ? list.name : "Create price list"}>
      <form
        action={`/admin/price-lists/${id}`}
        className="info-panel flex flex-wrap items-end gap-4"
      >
        <label className="min-w-0 flex-1">
          Find product or variant
          <input
            className="field mt-2"
            name="q"
            maxLength={100}
            defaultValue={q}
            aria-describedby="price-search-help"
          />
        </label>
        <button className="button" type="submit">
          Find items
        </button>
        <p id="price-search-help" className="w-full text-sm text-muted">
          Search by product name, variant name or SKU before editing. Searching
          reloads this page; save price changes first. Items already saved in
          this list remain available.
        </p>
        {invalidQuery && (
          <p role="alert">Enter a single search of at most 100 characters.</p>
        )}
        <p className="w-full text-sm" role="status">
          {matches.length > 500
            ? "Showing the first 500 matching products. Refine your search to find other items."
            : `${matches.length} matching products.`}
        </p>
      </form>
      <section className="info-panel">
        <PriceListEditor
          key={list?.version ?? "new"}
          initial={list}
          targets={targets}
        />
      </section>
      <History events={events} />
      {events.length > 0 && (
        <section className="info-panel">
          <h2 className="text-xl font-semibold">Price revisions</h2>
          {events.map((e) => (
            <details key={e.id} className="mt-4">
              <summary className="cursor-pointer">
                {e.createdAt.toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                })}{" "}
                · {e.reason}
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto rounded bg-slate-50 p-3 text-xs">
                {JSON.stringify({ before: e.before, after: e.after }, null, 2)}
              </pre>
            </details>
          ))}
        </section>
      )}
    </Workspace>
  );
}
