import { apiError } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { deliveryProof } from "@/modules/dispatch/proof";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return await deliveryProof(
      await requirePermission(request.headers, "account.read"),
      (await context.params).id,
    );
  } catch (e) {
    return apiError(e);
  }
}
