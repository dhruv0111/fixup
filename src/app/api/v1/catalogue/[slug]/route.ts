import { json, apiError, AppError } from "@/server/http/errors";
import { getPublicProduct } from "@/modules/catalogue/service";
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const product = await getPublicProduct((await context.params).slug);
    if (!product) throw new AppError(404, "NOT_FOUND", "Product not found.");
    return json(product);
  } catch (error) {
    return apiError(error);
  }
}
