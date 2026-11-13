import { apiError, json } from "@/server/http/errors";
import { requireActor } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { orderDetail, orderAction } from "@/modules/sales/orders";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    return json(
      await orderDetail(
        await requireActor(request.headers),
        (await context.params).id,
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    return json(
      await orderAction(
        await requireActor(request.headers),
        (await context.params).id,
        await readJson(request),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
