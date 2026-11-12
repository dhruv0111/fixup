import { json, withApi } from "@/server/http/errors";
import { requirePermission } from "@/server/permissions/service";
import { getDb } from "@/server/db/client";

export const GET = withApi(async (request) => {
  await requirePermission(request.headers, "admin.access");
  const db = getDb();
  const [users, pendingDealers, activeSessions] = await Promise.all([
    db.user.count(),
    db.dealerProfile.count({ where: { status: "PENDING" } }),
    db.session.count({ where: { expiresAt: { gt: new Date() } } }),
  ]);
  return json({ users, pendingDealers, activeSessions });
});
