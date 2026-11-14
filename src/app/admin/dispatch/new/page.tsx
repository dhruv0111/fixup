import { pageActor, Workspace } from "@/components/management/shared";
import { DispatchCreate } from "@/components/forms/dispatch";
export const metadata = { title: "Prepare dispatch" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  await pageActor("dispatch.manage");
  return (
    <Workspace title="Prepare dispatch" admin>
      <DispatchCreate orderId={(await searchParams).orderId} />
    </Workspace>
  );
}
