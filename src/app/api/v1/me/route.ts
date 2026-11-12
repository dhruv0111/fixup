import { json, withApi } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { readProfile, updateProfile } from "@/modules/customers/service";

export const runtime = "nodejs";
export const GET = withApi(async (request) => {
  const actor = await requirePermission(request.headers, "account.read");
  return json({
    user: {
      id: actor.id,
      name: actor.name,
      email: actor.email,
      role: actor.role,
    },
    permissions: actor.permissions,
    customer: await readProfile(actor),
  });
});
export const PATCH = withApi(async (request) => {
  assertSameOrigin(request);
  const actor = await requirePermission(request.headers, "account.update");
  return json(await updateProfile(actor, await readJson(request)));
});
