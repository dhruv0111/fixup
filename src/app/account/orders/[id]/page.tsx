import { pageActor, Workspace } from "@/components/management/shared";
import { OrderView } from "@/components/forms/sales";
export const metadata = { title: "Order details" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await pageActor("account.read");
  return (
    <Workspace title="Order details" admin={false}>
      <OrderView id={(await params).id} admin={false} />
    </Workspace>
  );
}
