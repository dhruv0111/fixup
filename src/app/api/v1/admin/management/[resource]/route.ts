import { apiError, AppError, json } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { listAccounts } from "@/modules/management/accounts";
import { pricingAdmin, savePriceList, assignPriceList, saveVariant } from "@/modules/management/pricing";
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, context: Context) {
 try {
 const { resource } = await context.params;
 const actor = await requirePermission(request.headers, "admin.access");
 if(resource === "customers" || resource === "dealers") return json(await listAccounts(actor, resource, Object.fromEntries(new URL(request.url).searchParams)));
 if(resource === "price-lists") return json(await pricingAdmin(actor));
 throw new AppError(404, "NOT_FOUND", "Resource not found.");
 } catch(error) { return apiError(error); }
}
export async function POST(request: Request, context: Context) {
 try {
 assertSameOrigin(request);
 const actor = await requirePermission(request.headers, "admin.access");
 const { resource } = await context.params;
 const input = await readJson(request);
 if(resource === "price-lists") return json(await savePriceList(actor, undefined, input), 201);
 if(resource === "assignments") return json(await assignPriceList(actor, input));
 if(resource === "variants") return json(await saveVariant(actor, new URL(request.url).searchParams.get("productId") ?? "", undefined, input), 201);
 throw new AppError(404, "NOT_FOUND", "Resource not found.");
 } catch(error) { return apiError(error); }
}

