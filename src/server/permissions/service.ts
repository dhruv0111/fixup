import "server-only";
import { getAuth } from "@/server/auth/config";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import { ensureCustomerProfile } from "@/modules/identity/provisioning";

export type Permission =
  | "account.read"
  | "account.update"
  | "dealer.access"
  | "leads.assigned"
  | "admin.access"
  | "audit.read"
  | "settings.read"
  | "settings.update"
  | "catalogue.read"
  | "catalogue.write"
  | "enquiries.read"
  | "customers.manage"
  | "dealers.manage"
  | "pricing.manage";
// Management permissions remain separate from website publication permission.

const rolePermissions: Record<string, readonly Permission[]> = {
  CUSTOMER: ["account.read", "account.update"],
  DEALER: ["account.read", "account.update"],
  SALES_REP: ["account.read", "account.update", "leads.assigned"],
  ADMIN: [
    "customers.manage", "dealers.manage", "pricing.manage",
    "catalogue.read",
    "enquiries.read",
    "account.read",
    "account.update",
    "admin.access",
    "audit.read",
    "settings.read",
  ],
  SUPER_ADMIN: [
    "customers.manage", "dealers.manage", "pricing.manage",
    "catalogue.read",
    "catalogue.write",
    "enquiries.read",
    "account.read",
    "account.update",
    "admin.access",
    "audit.read",
    "settings.read",
    "settings.update",
  ],
};

export async function getActor(headers: Headers, repairProfile = true) {
  if (!headers.has("cookie")) return null;
  const session = await getAuth().api.getSession({ headers });
  if (!session) return null;
  // Current database role/status are authoritative, never client input or a cached cookie.
  let user = await getDb().user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      profileProvisionedAt: true,
      customer: { select: { id: true, dealer: { select: { status: true } } } },
    },
  });
  if (!user?.active) return null;
  if (repairProfile && (!user.profileProvisionedAt || !user.customer)) {
    await ensureCustomerProfile(user.id);
    // Re-read after recovery; never grant permissions from stale status or input.
    user = await getDb().user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        profileProvisionedAt: true,
        customer: {
          select: { id: true, dealer: { select: { status: true } } },
        },
      },
    });
    if (!user?.active) return null;
  }
  const permissions = [...(rolePermissions[user.role] ?? [])];
  if (user.role === "DEALER" && user.customer?.dealer?.status === "APPROVED")
    permissions.push("dealer.access");
  return { ...user, sessionId: session.session.id, permissions };
}

export type Actor = NonNullable<Awaited<ReturnType<typeof getActor>>>;

export async function requireActor(headers: Headers) {
  const actor = await getActor(headers);
  if (!actor)
    throw new AppError(401, "UNAUTHENTICATED", "Please sign in to continue.");
  return actor;
}

export async function requirePermission(
  headers: Headers,
  permission: Permission,
) {
  const actor = await requireActor(headers);
  if (!actor.permissions.includes(permission))
    throw new AppError(
      403,
      "FORBIDDEN",
      "You do not have access to this action.",
    );
  return actor;
}
