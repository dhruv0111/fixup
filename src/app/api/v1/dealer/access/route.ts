import { json, withApi } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";

export const GET = withApi(async (request) => {
  await requirePermission(request.headers, "dealer.access");
  return json({ approved: true });
});
