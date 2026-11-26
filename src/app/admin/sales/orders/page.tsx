import { pageActor, Workspace } from "@/components/management/shared";
import { OrderList } from "@/components/forms/sales";
export const metadata = { title: "Sales orders" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; paymentStatus?: string }>;
}) {
  await pageActor("orders.manage");
  const query = await searchParams;
  return (
    <Workspace title="Sales orders" admin={true}>
      <OrderList
        admin
        initialStatus={query.status}
        initialPaymentStatus={query.paymentStatus}
      />
    </Workspace>
  );
}
