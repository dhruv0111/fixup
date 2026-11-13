import { json, withApi } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
export const GET = withApi(async request => { await requirePermission(request.headers, "account.read"); return json({ available: false, orders: [], message: "Order history will become available when ordering launches." }); });

