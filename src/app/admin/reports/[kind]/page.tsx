import { notFound } from "next/navigation";
import { pageActor, Workspace } from "@/components/management/shared";
import { BusinessReports } from "@/components/forms/reports";
import { reportKinds, reportNames } from "@/modules/reports/schemas";
export default async function Page({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  const key = reportKinds.find((k) => k === kind);
  if (!key) notFound();
  const actor = await pageActor(
    key === "profitability" ? "reports.financial" : "reports.read",
  );
  return (
    <Workspace admin title={reportNames[key]}>
      <BusinessReports
        kind={key}
        financial={actor.permissions.includes("reports.financial")}
      />
    </Workspace>
  );
}
