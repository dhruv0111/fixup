import { apiError, json } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { readProofForm } from "@/modules/sales/proof";
import { uploadExpenseAttachment } from "@/modules/reports/expenses";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission(request.headers, "expenses.manage");
    return json(
      await uploadExpenseAttachment(
        actor,
        (await context.params).id,
        await readProofForm(request, ["requestId", "file"]),
      ),
      201,
    );
  } catch (e) {
    return apiError(e);
  }
}
