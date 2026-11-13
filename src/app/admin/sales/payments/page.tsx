import { pageActor, Workspace } from "@/components/management/shared";
import { PaymentQueue } from "@/components/forms/sales";
export const metadata = { title: "Payment verification" };
export default async function Page() {
  await pageActor("payments.verify");
  return (
    <Workspace title="Payment verification" admin={true}>
      <PaymentQueue />
    </Workspace>
  );
}
