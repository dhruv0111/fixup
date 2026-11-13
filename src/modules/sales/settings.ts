import "server-only";
import { getDb } from "@/server/db/client";
import type { Actor } from "@/server/permissions/service";
import { allowed, conflict } from "@/modules/management/history";
import { recordAudit } from "@/server/audit/service";
import { lock } from "@/modules/inventory/service";
import { settingsSchema } from "./rules";
export async function settings(actor: Actor) {
  allowed(actor, "settings.update");
  return getDb().salesSettings.findUnique({ where: { id: "singleton" } });
}
export async function saveSettings(actor: Actor, input: unknown) {
  allowed(actor, "settings.update");
  const { version, confirmed, reason, ...data } = settingsSchema.parse(input);
  void confirmed;
  return getDb().$transaction(async (tx) => {
    await lock(tx, "sales-settings");
    const old = await tx.salesSettings.findUnique({
      where: { id: "singleton" },
    });
    if ((old?.version ?? 0) !== version) throw conflict();
    const row = await tx.salesSettings.upsert({
      where: { id: "singleton" },
      create: {
        ...data,
        confirmedById: actor.id,
        confirmedAt: new Date(),
        version: 1,
      },
      update: {
        ...data,
        confirmedById: actor.id,
        confirmedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await recordAudit(
      {
        actorId: actor.id,
        action: "SALES_CHANGED",
        entityType: "SalesSettings",
        entityId: row.id,
        reason,
      },
      tx,
    );
    return row;
  });
}
