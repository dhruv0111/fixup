import { pageActor, Workspace } from "@/components/management/shared";
import { SalesSettings } from "@/components/forms/sales";
export const metadata = { title: "Sales and payment settings" };
export default async function Page() {
  await pageActor("settings.update");
  return (
    <Workspace title="Sales and payment settings" admin={true}>
      <SalesSettings />
    </Workspace>
  );
}
