import { json, withApi } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { quote } from "@/modules/management/pricing";
export const POST = withApi(async request => { assertSameOrigin(request); const actor = await requirePermission(request.headers, "account.read"); return json(await quote(actor, await readJson(request))); });

