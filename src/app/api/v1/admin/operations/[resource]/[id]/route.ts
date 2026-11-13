import { apiError, AppError, json } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import {
  saveSupplier,
  savePurchase,
  saveReceipt,
  purchaseDetail,
  receiptDetail,
  purchaseAction,
  receiptAction,
  setThreshold,
} from "@/modules/inventory/service";
import { supplierDetail, lotDetail } from "@/modules/inventory/read";
type Context = { params: Promise<{ resource: string; id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await requirePermission(request.headers, "inventory.read");
    const { resource, id } = await context.params;
    if (resource === "suppliers") return json(await supplierDetail(actor, id));
    if (resource === "purchase-orders")
      return json(await purchaseDetail(actor, id));
    if (resource === "goods-receiving")
      return json(await receiptDetail(actor, id));
    if (resource === "lots") return json(await lotDetail(actor, id));
    throw new AppError(404, "NOT_FOUND", "Resource not found.");
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requirePermission(request.headers, "inventory.read");
    const { resource, id } = await context.params;
    const input = await readJson(request);
    if (resource === "suppliers")
      return json(await saveSupplier(actor, id, input));
    if (resource === "purchase-orders")
      return json(await savePurchase(actor, id, input));
    if (resource === "goods-receiving")
      return json(await saveReceipt(actor, id, input));
    if (resource === "thresholds")
      return json(await setThreshold(actor, id, input));
    throw new AppError(404, "NOT_FOUND", "Resource not found.");
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requirePermission(request.headers, "inventory.read");
    const { resource, id } = await context.params;
    const input = await readJson(request);
    if (resource === "purchase-orders")
      return json(await purchaseAction(actor, id, input));
    if (resource === "goods-receiving")
      return json(await receiptAction(actor, id, input));
    throw new AppError(404, "NOT_FOUND", "Resource not found.");
  } catch (e) {
    return apiError(e);
  }
}
