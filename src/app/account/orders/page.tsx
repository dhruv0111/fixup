import { pageActor, Workspace } from "@/components/management/shared";
import { OrderList } from "@/components/forms/sales";
export const metadata = { title: "Order history" };
export default async function Page() {
  await pageActor("account.read");
  return (
    <Workspace title="Order history" admin={false}>
      <OrderList />
    </Workspace>
  );
}
