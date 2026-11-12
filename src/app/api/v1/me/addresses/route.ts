import { json, withApi } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { createAddress, readProfile } from "@/modules/customers/service";

export const GET = withApi(async (request) => {
  const actor = await requirePermission(request.headers, "account.read");
  return json((await readProfile(actor)).addresses);
});
export const POST = withApi(async (request) => {
  assertSameOrigin(request);
  const actor = await requirePermission(request.headers, "account.update");
  return json(await createAddress(actor, await readJson(request)), 201);
});
