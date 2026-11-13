import { json, apiError } from "@/server/http/errors";
import { assertSameOrigin, readJson } from "@/server/http/request";
import { requirePermission } from "@/server/permissions/service";
import { adminContent, saveContent } from "@/modules/catalogue/admin";
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await requirePermission(request.headers, "catalogue.read");
    return json(await adminContent(actor, (await context.params).resource));
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const actor = await requirePermission(request.headers, "catalogue.write");
    assertSameOrigin(request);
    return json(
      await saveContent(
        actor,
        (await context.params).resource,
        await readJson(request),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
