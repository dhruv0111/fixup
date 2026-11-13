import { pageActor, Workspace } from "@/components/management/shared";
import { CartView } from "@/components/forms/sales";
export const metadata = { title: "Shopping cart" };
export default async function Page() {
  await pageActor("account.read");
  return (
    <Workspace title="Shopping cart" admin={false}>
      <CartView />
    </Workspace>
  );
}
