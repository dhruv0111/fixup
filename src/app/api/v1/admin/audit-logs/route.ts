import { z } from "zod";
import { json, withApi } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { getDb } from "@/server/db/client";

export const GET = withApi(async (request) => {
  await requirePermission(request.headers, "audit.read");
  const params = new URL(request.url).searchParams;
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .parse(params.get("page") ?? 1);
  const pageSize = 25;
  const items = await getDb().auditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize,
    skip: (page - 1) * pageSize,
  });
  return json({ items, page, pageSize });
});
