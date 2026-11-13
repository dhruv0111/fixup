import { apiError, AppError, json } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import {
  saveSupplier,
  savePurchase,
  saveReceipt,
  adjustStock,
} from "@/modules/inventory/service";
import { listRecords, options, report } from "@/modules/inventory/read";
import { querySchema, csv } from "@/modules/inventory/schemas";
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await requirePermission(request.headers, "inventory.read");
    const { resource } = await context.params;
    const input = Object.fromEntries(new URL(request.url).searchParams);
    if (resource === "options") return json(await options(actor));
    if (resource === "reports") {
      const q = querySchema.parse(input);
      const rows = await report(actor, q);
      if (q.format === "csv")
        return new Response(csv(rows), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="fixup-${q.kind}.csv"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      return json({ rows, total: rows.length });
    }
    return json(await listRecords(actor, resource, input));
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requirePermission(request.headers, "inventory.read");
    const { resource } = await context.params;
    const input = await readJson(request);
    if (resource === "suppliers")
      return json(await saveSupplier(actor, undefined, input), 201);
    if (resource === "purchase-orders")
      return json(await savePurchase(actor, undefined, input), 201);
    if (resource === "goods-receiving")
      return json(await saveReceipt(actor, undefined, input), 201);
    if (resource === "stock-adjustments")
      return json(await adjustStock(actor, input), 201);
    throw new AppError(404, "NOT_FOUND", "Resource not found.");
  } catch (e) {
    return apiError(e);
  }
}
