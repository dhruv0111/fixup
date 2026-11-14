import "server-only";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import type { Actor } from "@/server/permissions/service";
import { allowed, conflict } from "@/modules/management/history";
import { proofImage } from "@/modules/sales/proof";
import { lock } from "@/modules/inventory/service";
import { missing, invalid } from "@/modules/sales/cart";
import { recordAudit } from "@/server/audit/service";
export async function uploadDeliveryProof(
  actor: Actor,
  id: string,
  input: Record<string, unknown>,
) {
  allowed(actor, "dispatch.manage");
  const { file, ...fields } = input;
  const data = z
    .object({
      requestId: z.uuid(),
      source: z.string().trim().min(3).max(200),
      sharedWithCustomer: z.enum(["true", "false"]),
    })
    .strict()
    .parse(fields);
  const d = await getDb().dispatch.findUnique({
    where: { id },
    select: { orderId: true, status: true },
  });
  if (!d) throw missing();
  if (d.status !== "CONFIRMED")
    throw invalid(
      "Dispatch must be confirmed before recording delivery evidence.",
    );
  if (!(file instanceof File))
    throw invalid("Choose a photograph or scanned document image.");
  const image = await proofImage(file);
  return getDb().$transaction(async (tx) => {
    await lock(tx, `delivery-proof:${data.requestId}`);
    await lock(tx, `order:${d.orderId}`);
    const old = await tx.deliveryProof.findUnique({
      where: { requestId: data.requestId },
    });
    if (old) {
      if (
        old.dispatchId !== id ||
        old.fileHash !== image.imageHash ||
        old.source !== data.source ||
        old.sharedWithCustomer !== (data.sharedWithCustomer === "true")
      )
        throw conflict();
      return { id: old.id };
    }
    if ((await tx.deliveryProof.count({ where: { dispatchId: id } })) >= 10)
      throw invalid("A dispatch supports at most 10 proof images.");
    const proof = await tx.deliveryProof.create({
      data: {
        dispatchId: id,
        requestId: data.requestId,
        fileBytes: image.imageBytes,
        fileHash: image.imageHash,
        fileSize: image.imageSize,
        mimeType: "image/png",
        originalName: image.originalName,
        source: data.source,
        sharedWithCustomer: data.sharedWithCustomer === "true",
        uploadedById: actor.id,
      },
    });
    await recordAudit(
      {
        actorId: actor.id,
        action: "DISPATCH_CHANGED",
        entityType: "Dispatch",
        entityId: id,
        reason: "Private delivery evidence uploaded; status unchanged.",
      },
      tx,
    );
    return { id: proof.id };
  });
}
export async function deliveryProof(actor: Actor, id: string) {
  // Check metadata and authorization before loading the private bytes.
  const row = await getDb().deliveryProof.findUnique({
    where: { id },
    select: {
      sharedWithCustomer: true,
      dispatch: { select: { order: { select: { customerId: true } } } },
    },
  });
  if (!row) throw missing();
  if (
    !actor.permissions.includes("dispatch.manage") &&
    (!row.sharedWithCustomer ||
      actor.customer?.id !== row.dispatch.order.customerId)
  )
    throw missing();
  const proof = await getDb().deliveryProof.findUniqueOrThrow({
    where: { id },
    select: { fileBytes: true },
  });
  return new Response(new Uint8Array(proof.fileBytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline; filename=delivery-proof.png",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
