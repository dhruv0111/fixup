import { apiError, json, AppError } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { saveAllocations, physicalReturn } from "@/modules/dispatch/service";
import { uploadDeliveryProof } from "@/modules/dispatch/proof";
import { readProofForm } from "@/modules/sales/proof";
type Context = { params: Promise<{ id: string; action: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const actor = await requirePermission(request.headers, "dispatch.manage");
    const { id, action } = await context.params;
    if (action === "proofs")
      return json(
        await uploadDeliveryProof(
          actor,
          id,
          await readProofForm(request, [
            "requestId",
            "source",
            "sharedWithCustomer",
            "file",
          ]),
        ),
        201,
      );
    assertSameOrigin(request);
    const input = await readJson(request);
    if (action === "allocations")
      return json(await saveAllocations(actor, id, input));
    if (action === "physical-return")
      return json(await physicalReturn(actor, id, input));
    throw new AppError(404, "NOT_FOUND", "Resource not found.");
  } catch (e) {
    return apiError(e);
  }
}
