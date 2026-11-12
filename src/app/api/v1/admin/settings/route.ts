import { json, withApi } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { getDb } from "@/server/db/client";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { updateSettings } from "@/modules/settings/service";

export const GET = withApi(async (request) => {
  await requirePermission(request.headers, "settings.read");
  return json(
    await getDb().businessSettings.findUniqueOrThrow({
      where: { id: "singleton" },
    }),
  );
});
export const PATCH = withApi(async (request) => {
  assertSameOrigin(request);
  const actor = await requirePermission(request.headers, "settings.update");
  return json(await updateSettings(actor, await readJson(request)));
});
