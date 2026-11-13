import { json, withApi } from "@/server/http/errors";
import { requireActor } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { preview } from "@/modules/sales/cart";
export const POST = withApi(async (request) => {
  assertSameOrigin(request);
  return json(
    await preview(await requireActor(request.headers), await readJson(request)),
  );
});
