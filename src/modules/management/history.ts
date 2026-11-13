import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { recordAudit, type AuditAction } from "@/server/audit/service";
import { AppError } from "@/server/http/errors";
import type { Actor, Permission } from "@/server/permissions/service";
export function allowed(actor: Actor, permission: Permission) {
  if (!actor.permissions.includes(permission)) throw new AppError(403, "FORBIDDEN", "This action is restricted.");
}
export function conflict() { return new AppError(409, "CONFLICT", "This record has changed. Refresh and try again."); }
export async function history(tx: Prisma.TransactionClient, actor: Actor, entityType: "User" | "DealerProfile" | "PriceList" | "CategoryPriceList" | "ProductVariant", entityId: string, action: AuditAction, reason: string, before: unknown, after: unknown) {
  await tx.managementEvent.create({ data: { actorId: actor.id, entityType, entityId, reason, before: JSON.parse(JSON.stringify(before ?? {})), after: JSON.parse(JSON.stringify(after ?? {})) } });
  await recordAudit({ actorId: actor.id, action, entityType, entityId, reason }, tx);
}
