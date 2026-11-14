import { pageActor, Workspace } from "@/components/management/shared";
import { BusinessReports } from "@/components/forms/reports";
export const metadata = { title: "Business dashboard" };
export default async function Page() {
  const actor = await pageActor("reports.read");
  return (
    <Workspace admin title="FIXUP business dashboard">
      <p className="text-muted">
        Orders, verified collections and delivered sales are distinct. Explore
        recorded performance using the same business date filters.
      </p>
      <BusinessReports
        financial={actor.permissions.includes("reports.financial")}
      />
    </Workspace>
  );
}
