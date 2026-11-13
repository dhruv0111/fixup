import { apiError, AppError, json } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { accountDetail, reviewDealer, setCustomerStatus } from "@/modules/management/accounts";
import { pricingAdmin, savePriceList, saveVariant } from "@/modules/management/pricing";
type Context = { params: Promise<{ resource: string; id: string }> };
export async function GET(request: Request, context: Context) {
 try {
 const actor = await requirePermission(request.headers, "admin.access");
 const { resource, id } = await context.params;
 if(resource === "customers" || resource === "dealers") return json(await accountDetail(actor, resource, id));
 if(resource === "price-lists") return json(await pricingAdmin(actor, id));
 throw new AppError(404, "NOT_FOUND", "Resource not found.");
 } catch(error) { return apiError(error); }
}
export async function PATCH(request: Request, context: Context) {
 try {
 assertSameOrigin(request);
 const actor = await requirePermission(request.headers, "admin.access");
 const { resource, id } = await context.params;
 const input = await readJson(request);
 if(resource === "customers") return json(await setCustomerStatus(actor, id, input));
 if(resource === "dealers") return json(await reviewDealer(actor, id, input));
 if(resource === "price-lists") return json(await savePriceList(actor, id, input));
 if(resource === "variants") return json(await saveVariant(actor, new URL(request.url).searchParams.get("productId") ?? "", id, input));
 throw new AppError(404, "NOT_FOUND", "Resource not found.");
 } catch(error) { return apiError(error); }
}

