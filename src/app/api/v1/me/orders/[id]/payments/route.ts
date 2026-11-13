import { apiError, json } from "@/server/http/errors";
import { requireActor } from "@/server/permissions/service";
import { readProofForm } from "@/modules/sales/proof";
import { submitProof } from "@/modules/sales/payments";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(request.headers);
    return json(
      await submitProof(
        actor,
        (await context.params).id,
        await readProofForm(request),
      ),
      201,
    );
  } catch (e) {
    return apiError(e);
  }
}
