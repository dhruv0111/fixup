import { json, withApi } from "@/server/http/errors";
import { requireActor } from "@/server/permissions/service";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { cart, setCart } from "@/modules/sales/cart";
export const GET = withApi(async (request) =>
  json(await cart(await requireActor(request.headers))),
);
export const PATCH = withApi(async (request) => {
  assertSameOrigin(request);
  return json(
    await setCart(await requireActor(request.headers), await readJson(request)),
  );
});
