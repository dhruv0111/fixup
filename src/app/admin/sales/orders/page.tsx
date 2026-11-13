import { pageActor, Workspace } from "@/components/management/shared";
import { OrderList } from "@/components/forms/sales";
export const metadata = { title: "Sales orders" };
export default async function Page() {
  await pageActor("orders.manage");
  return (
    <Workspace title="Sales orders" admin={true}>
      <OrderList admin />
    </Workspace>
  );
}
