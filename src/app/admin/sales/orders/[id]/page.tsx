import { pageActor, Workspace } from "@/components/management/shared";
import { OrderView } from "@/components/forms/sales";
export const metadata = { title: "Sales order" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await pageActor("orders.manage");
  return (
    <Workspace title="Sales order" admin={true}>
      <OrderView id={(await params).id} admin={true} />
    </Workspace>
  );
}
