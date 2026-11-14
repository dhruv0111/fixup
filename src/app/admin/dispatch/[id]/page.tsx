import { pageActor, Workspace } from "@/components/management/shared";
import { DispatchView } from "@/components/forms/dispatch";
export const metadata = { title: "Dispatch detail" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await pageActor("dispatch.manage");
  return (
    <Workspace title="Dispatch detail" admin>
      <DispatchView id={(await params).id} />
    </Workspace>
  );
}
