import { json, withApi } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { saveExpense } from "@/modules/reports/expenses";
export const POST = withApi(async (request) => {
  assertSameOrigin(request);
  const actor = await requirePermission(request.headers, "expenses.manage");
  return json(
    await saveExpense(actor, undefined, await readJson(request)),
    201,
  );
});
