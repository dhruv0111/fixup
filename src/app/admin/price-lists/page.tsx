import Link from "next/link";
import { pageActor, Workspace, History } from "@/components/management/shared";
import { ManagedForm } from "@/components/forms/managed-form";
import { reasonField } from "@/components/management/fields";
import { getDb } from "@/server/db/client";
export const metadata = { title: "Shared price lists" };
export default async function Page() {
  await pageActor("pricing.manage");
  const db = getDb();
  const [lists, assignments, events] = await Promise.all([
    db.priceList.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    db.categoryPriceList.findMany({ orderBy: { category: "asc" } }),
    db.auditLog.findMany({
      where: { entityType: "CategoryPriceList" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return (
    <Workspace admin title="Shared price lists">
      <Link className="button" href="/admin/price-lists/new">
        Create price list
      </Link>
      <div className="grid gap-4 sm:grid-cols-2">
        {lists.map((list) => (
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
      {!lists.length && <p>No price lists configured yet.</p>}
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
                  ...lists
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
