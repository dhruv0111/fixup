import { apiError, json, AppError } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { getReport, dashboard, reportCsv } from "@/modules/reports/service";
import { reportKinds } from "@/modules/reports/schemas";
import { getDb } from "@/server/db/client";
import { z } from "zod";
export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  try {
    const actor = await requirePermission(request.headers, "reports.read");
    const { kind } = await context.params;
    const query = Object.fromEntries(new URL(request.url).searchParams);
    if (kind === "dashboard") return json(await dashboard(actor, query));
    if (kind === "options") {
      const db = getDb();
      const [products, customers, suppliers] = await Promise.all([
        db.product.findMany({
          select: {
            id: true,
            name: true,
            variants: { select: { id: true, name: true, packSize: true } },
          },
          orderBy: { name: "asc" },
          take: 10001,
        }),
        db.customer.findMany({
          where: { user: { role: { in: ["CUSTOMER", "DEALER"] } } },
          select: {
            id: true,
            user: { select: { name: true } },
            dealer: { select: { id: true, businessName: true } },
          },
          orderBy: { id: "asc" },
          take: 10001,
        }),
        db.supplier.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 10001,
        }),
      ]);
      if ([products, customers, suppliers].some((x) => x.length > 10000))
        throw new AppError(
          422,
          "OPTIONS_LIMIT",
          "More than 10,000 entities. Narrow reporting through a specific entity ID.",
        );
      return json({
        products,
        customers,
        suppliers,
        financialAccess: actor.permissions.includes("reports.financial"),
      });
    }
    const key = z.enum(reportKinds).parse(kind);
    const result = await getReport(actor, key, query);
    if (query.format === "csv")
      return new Response(reportCsv(result), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=fixup-${key}-${result.range.from}-${result.range.to}.csv`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    return json(result);
  } catch (e) {
    return apiError(e);
  }
}
