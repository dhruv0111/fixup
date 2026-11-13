import { apiError } from "@/server/http/errors";
import { requireActor } from "@/server/permissions/service";
import { proof } from "@/modules/sales/payments";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return await proof(
      await requireActor(request.headers),
      (await context.params).id,
    );
  } catch (e) {
    return apiError(e);
  }
}
