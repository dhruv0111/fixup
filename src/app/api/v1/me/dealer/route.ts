import { json, withApi } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { ownDealer, applyDealer } from "@/modules/management/accounts";
export const GET = withApi(async request => json(await ownDealer(await requirePermission(request.headers, "account.read"))));
export const POST = withApi(async request => { assertSameOrigin(request); const actor = await requirePermission(request.headers, "account.update"); return json(await applyDealer(actor, await readJson(request))); });

