import { json, withApi } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { queue, createDispatch } from "@/modules/dispatch/service";
export const GET = withApi(async (request) =>
  json(
    await queue(
      await requirePermission(request.headers, "dispatch.manage"),
      Object.fromEntries(new URL(request.url).searchParams),
    ),
  ),
);
export const POST = withApi(async (request) => {
  assertSameOrigin(request);
  const actor = await requirePermission(request.headers, "dispatch.manage");
  return json(await createDispatch(actor, await readJson(request)), 201);
});
