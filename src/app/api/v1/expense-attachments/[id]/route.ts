import { apiError } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { expenseAttachment } from "@/modules/reports/expenses";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return await expenseAttachment(
      await requirePermission(request.headers, "expenses.manage"),
      (await context.params).id,
    );
  } catch (e) {
    return apiError(e);
  }
}
