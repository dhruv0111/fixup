import { apiError, json } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import {
  dispatchDetail,
  editDispatch,
  dispatchAction,
} from "@/modules/dispatch/service";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    return json(
      await dispatchDetail(
        await requirePermission(request.headers, "dispatch.manage"),
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
    const actor = await requirePermission(request.headers, "dispatch.manage");
    return json(
      await editDispatch(
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
    const actor = await requirePermission(request.headers, "dispatch.manage");
    return json(
      await dispatchAction(
        actor,
        (await context.params).id,
        await readJson(request),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
