import { apiError, json } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { ownTracking } from "@/modules/dispatch/service";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return json(
      await ownTracking(
        await requirePermission(request.headers, "account.read"),
        (await context.params).id,
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
