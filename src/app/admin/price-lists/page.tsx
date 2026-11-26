import Link from "next/link";
import { pageActor, Workspace, History } from "@/components/management/shared";
import { ManagedForm } from "@/components/forms/managed-form";
import { reasonField } from "@/components/management/fields";
import { getDb } from "@/server/db/client";
export const metadata = { title: "Shared price lists" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await pageActor("pricing.manage");
  const rawQuery = (await searchParams).q;
  const invalidQuery =
    rawQuery !== undefined &&
    (typeof rawQuery !== "string" || rawQuery.length > 100);
  const q =
    typeof rawQuery === "string" && !invalidQuery ? rawQuery.trim() : "";
  const db = getDb();
  const [lists, assignments, events] = await Promise.all([
    db.priceList.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : {},
      orderBy: { createdAt: "desc" },
      take: 101,
    }),
    db.categoryPriceList.findMany({ orderBy: { category: "asc" } }),
    db.auditLog.findMany({
      where: { entityType: "CategoryPriceList" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const assignedLists = await db.priceList.findMany({
    where: {
      id: {
        in: assignments.flatMap((a) => (a.priceListId ? [a.priceListId] : [])),
      },
    },
  });
  const choices = [
    ...new Map(
      [...assignedLists, ...lists.slice(0, 100)].map((list) => [list.id, list]),
    ).values(),
  ];
  return (
    <Workspace admin title="Shared price lists">
      <Link className="button" href="/admin/price-lists/new">
        Create price list
      </Link>
      <form
        action="/admin/price-lists"
        className="info-panel flex flex-wrap items-end gap-4"
      >
        <label className="w-full min-w-0 sm:w-auto sm:flex-1">
          Search price lists
          <input
            className="field mt-2"
            name="q"
            maxLength={100}
            defaultValue={q}
          />
        </label>
        <button className="button" type="submit">
          Find price lists
        </button>
        <Link className="text-link" href="/admin/price-lists">
          Clear search
        </Link>
        {invalidQuery && (
          <p role="alert">Enter a single search of at most 100 characters.</p>
        )}
        <p role="status" className="w-full text-sm">
          {lists.length > 100
            ? "Showing the latest 100 matching lists. Search by name to find older lists."
            : `${lists.length} matching lists.`}{" "}
          Current category assignments remain available below, even outside
          these results.
        </p>
      </form>
      <div className="grid gap-4 sm:grid-cols-2">
        {lists.slice(0, 100).map((list) => (
          <Link
            key={list.id}
            className="info-panel"
            href={`/admin/price-lists/${list.id}`}
          >
            <h2 className="text-xl font-semibold">{list.name}</h2>
            <p className="mt-3">
              {list.active ? "Active" : "Inactive"} · INR · Revision{" "}
              {list.version}
            </p>
          </Link>
        ))}
      </div>
      {!lists.length && (
        <p>
          {q
            ? "No matching price lists. Try another name or clear search."
            : "No price lists configured yet."}
        </p>
      )}
      <h2 className="text-2xl font-semibold">Customer category assignments</h2>
      {assignments.map((a) => (
        <section className="info-panel" key={a.category}>
          <h3 className="mb-5 text-lg font-semibold">
            {a.category.replaceAll("_", " ")}
          </h3>
          <ManagedForm
            url="/api/v1/admin/management/assignments"
            base={{ category: a.category, version: a.version }}
            initial={{ priceListId: a.priceListId }}
            fields={[
              {
                name: "priceListId",
                label: "Assigned price list",
                type: "select",
                nullable: true,
                options: [
                  { value: "", label: "No price list" },
                  ...choices
                    .filter((l) => l.active || l.id === a.priceListId)
                    .map((l) => ({
                      value: l.id,
                      label: `${l.name}${l.active ? "" : " (inactive)"}`,
                    })),
                ],
              },
              reasonField,
            ]}
          />
        </section>
      ))}
      <History events={events} />
    </Workspace>
  );
}
