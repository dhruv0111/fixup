import { pageActor, Workspace } from "@/components/management/shared";
import { ExpenseEditor } from "@/components/forms/reports";
export const metadata = { title: "Expense detail" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await pageActor("expenses.manage");
  return (
    <Workspace admin title="Expense detail">
      <ExpenseEditor id={(await params).id} />
    </Workspace>
  );
}
