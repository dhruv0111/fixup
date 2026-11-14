import Link from "next/link";
import { pageActor, Workspace } from "@/components/management/shared";
import { reportKinds, reportNames } from "@/modules/reports/schemas";
export const metadata = { title: "Business reports" };
export default async function Page() {
  const actor = await pageActor("reports.read");
  return (
    <Workspace admin title="Business reports">
      <Link className="button" href="/admin/business">
        Business dashboard
      </Link>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {reportKinds
          .filter(
            (k) =>
              k !== "profitability" ||
              actor.permissions.includes("reports.financial"),
          )
          .map((k) => (
            <Link className="info-panel" key={k} href={`/admin/reports/${k}`}>
              <h2 className="text-xl font-semibold">{reportNames[k]}</h2>
              <p className="mt-3 text-sm text-muted">
                Recorded activity, date filters and protected CSV export.
              </p>
            </Link>
          ))}
      </div>
      <Link className="text-link" href="/admin/expenses/new">
        Record a business expense
      </Link>
    </Workspace>
  );
}
