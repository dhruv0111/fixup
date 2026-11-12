import { apiError, json } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { readAddress, updateAddress } from "@/modules/customers/service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const actor = await requirePermission(request.headers, "account.read");
    return json(await readAddress(actor, (await context.params).id));
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requirePermission(request.headers, "account.update");
    return json(
      await updateAddress(
        actor,
        (await context.params).id,
        await readJson(request),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
