import { json, withApi } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { ownPrices } from "@/modules/management/pricing";
export const GET = withApi(async (request) =>
  json(
    await ownPrices(
      await requirePermission(request.headers, "account.read"),
      Object.fromEntries(new URL(request.url).searchParams),
    ),
  ),
);
