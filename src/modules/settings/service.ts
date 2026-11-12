import { z } from "zod";
import { getDb } from "@/server/db/client";
import { recordAudit } from "@/server/audit/service";
import type { Actor } from "@/server/permissions/service";
import { AppError } from "@/server/http/errors";

const settingsSchema = z
  .object({
    displayName: z.string().trim().min(2).max(100),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();

export async function updateSettings(actor: Actor, input: unknown) {
  // Protect the service as well as its HTTP entrypoint.
  if (!actor.permissions.includes("settings.update"))
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only the business owner can change settings.",
    );
  const { reason, displayName } = settingsSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    const settings = await tx.businessSettings.update({
      where: { id: "singleton" },
      data: { displayName },
    });
    await recordAudit(
      {
        actorId: actor.id,
        action: "BUSINESS_SETTINGS_UPDATED",
        entityType: "BusinessSettings",
        entityId: settings.id,
        reason,
      },
      tx,
    );
    return settings;
  });
}
