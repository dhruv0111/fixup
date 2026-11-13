import { json, withApi } from "@/server/http/errors";
import { listProducts, listCategories } from "@/modules/catalogue/service";
export const GET = withApi(async (request) => {
  const [catalogue, categories] = await Promise.all([
    listProducts(Object.fromEntries(new URL(request.url).searchParams)),
    listCategories(),
  ]);
  return json({ ...catalogue, categories });
});
