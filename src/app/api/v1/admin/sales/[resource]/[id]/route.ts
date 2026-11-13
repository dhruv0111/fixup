import { apiError, json, AppError } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { orderDetail, orderAction } from "@/modules/sales/orders";
import { reviewPayment, refund } from "@/modules/sales/payments";
type Context = { params: Promise<{ resource: string; id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await requirePermission(request.headers, "orders.manage");
    const { resource, id } = await context.params;
    if (resource === "orders") return json(await orderDetail(actor, id, true));
    throw new AppError(404, "NOT_FOUND", "Resource not found.");
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requirePermission(request.headers, "orders.manage");
    const { resource, id } = await context.params;
    const input = await readJson(request);
    if (resource === "orders")
      return json(await orderAction(actor, id, input, true));
    if (resource === "payments")
      return json(await reviewPayment(actor, id, input));
    if (resource === "refunds") return json(await refund(actor, id, input));
    throw new AppError(404, "NOT_FOUND", "Resource not found.");
  } catch (e) {
    return apiError(e);
  }
}
