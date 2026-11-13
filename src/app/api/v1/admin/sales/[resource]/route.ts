import { apiError, json, AppError } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { listOrders, expireReservations } from "@/modules/sales/orders";
import { settings, saveSettings } from "@/modules/sales/settings";
import { paymentQueue } from "@/modules/sales/payments";
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await requirePermission(request.headers, "orders.manage");
    const { resource } = await context.params;
    if (resource === "orders")
      return json(
        await listOrders(
          actor,
          Object.fromEntries(new URL(request.url).searchParams),
          true,
        ),
      );
    if (resource === "settings") return json(await settings(actor));
    if (resource === "payments") return json(await paymentQueue(actor));
    throw new AppError(404, "NOT_FOUND", "Resource not found.");
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requirePermission(request.headers, "orders.manage");
    const { resource } = await context.params;
    if (resource === "settings")
      return json(await saveSettings(actor, await readJson(request)));
    if (resource === "expire") {
      const input = await readJson(request);
      if (JSON.stringify(input) !== "{}")
        throw new AppError(422, "INVALID_OPERATION", "Expected empty object.");
      return json(await expireReservations(actor));
    }
    throw new AppError(404, "NOT_FOUND", "Resource not found.");
  } catch (e) {
    return apiError(e);
  }
}
