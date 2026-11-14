import { pageActor, Workspace } from "@/components/management/shared";
import { DispatchQueue } from "@/components/forms/dispatch";
export const metadata = { title: "Dispatch & delivery" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  await pageActor("dispatch.manage");
  const { view = "all", q = "" } = await searchParams;
  return (
    <Workspace title="Dispatch & delivery" admin>
      <DispatchQueue
        key={`${view}:${q}`}
        initialSearch={q.slice(0, 150)}
        initialView={
          [
            "all",
            "ready",
            "blocked",
            "history",
            "failed",
            "local",
            "courier",
          ].includes(view)
            ? view
            : "all"
        }
      />
    </Workspace>
  );
}
