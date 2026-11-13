import { json, withApi } from "@/server/http/errors";
import { requireActor } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { listOrders, createOrder } from "@/modules/sales/orders";
export const GET = withApi(async (request) =>
  json(await listOrders(await requireActor(request.headers))),
);
export const POST = withApi(async (request) => {
  assertSameOrigin(request);
  return json(
    await createOrder(
      await requireActor(request.headers),
      await readJson(request),
    ),
    201,
  );
});
