import { pageActor, Workspace } from "@/components/management/shared";
import { ExpenseEditor } from "@/components/forms/reports";
export const metadata = { title: "Record business expense" };
export default async function Page() {
  await pageActor("expenses.manage");
  return (
    <Workspace admin title="Record business expense">
      <ExpenseEditor />
    </Workspace>
  );
}
