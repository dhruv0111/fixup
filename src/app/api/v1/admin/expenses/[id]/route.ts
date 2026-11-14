import { apiError, json } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { expenseDetail, saveExpense } from "@/modules/reports/expenses";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    return json(
      await expenseDetail(
        await requirePermission(request.headers, "expenses.manage"),
        (await context.params).id,
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requirePermission(request.headers, "expenses.manage");
    return json(
      await saveExpense(
        actor,
        (await context.params).id,
        await readJson(request),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requirePermission(request.headers, "expenses.manage");
    return json(
      await saveExpense(
        actor,
        (await context.params).id,
        await readJson(request),
        true,
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
