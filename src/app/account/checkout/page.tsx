import { pageActor, Workspace } from "@/components/management/shared";
import { Checkout } from "@/components/forms/sales";
export const metadata = { title: "Checkout" };
export default async function Page() {
  await pageActor("account.read");
  return (
    <Workspace title="Checkout" admin={false}>
      <Checkout />
    </Workspace>
  );
}
