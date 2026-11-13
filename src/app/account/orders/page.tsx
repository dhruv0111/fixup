import { pageActor, Workspace } from "@/components/management/shared";
export const metadata = { title: "Order history" };
export default async function Page() { await pageActor("account.read"); return <Workspace title="Order history"><section className="info-panel"><h2 className="text-xl font-semibold">Ordering is not available yet</h2><p className="mt-4 text-muted">Your order history will appear here when ordering launches. Product enquiries and price estimates do not create orders.</p></section></Workspace>; }

