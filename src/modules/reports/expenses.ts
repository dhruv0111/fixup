import "server-only";
import { getDb } from "@/server/db/client";
import type { Actor } from "@/server/permissions/service";
import { allowed, conflict } from "@/modules/management/history";
import { lock } from "@/modules/inventory/service";
import { hash } from "@/modules/sales/cart";
import { AppError } from "@/server/http/errors";
import { recordAudit } from "@/server/audit/service";
import { expenseCreate, expenseEdit, expenseCancel } from "./schemas";
import { dayInZone, validTimezone } from "./dates";
import { z } from "zod";
import { proofImage } from "@/modules/sales/proof";
const missing = () => new AppError(404, "NOT_FOUND", "Expense not found.");
export async function expenseDetail(actor: Actor, id: string) {
  allowed(actor, "expenses.manage");
  const e = await getDb().businessExpense.findUnique({
    where: { id },
    include: {
      revisions: { orderBy: { version: "desc" }, take: 100 },
      attachments: {
        select: {
          id: true,
          originalName: true,
          fileSize: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!e) throw missing();
  return e;
}
export async function saveExpense(
  actor: Actor,
  id: string | undefined,
  input: unknown,
  cancel = false,
) {
  allowed(actor, "expenses.manage");
  const parsed = cancel
    ? expenseCancel.parse(input)
    : id
      ? expenseEdit.parse(input)
      : expenseCreate.parse(input);
  const digest = hash(parsed);
  return getDb().$transaction(async (tx) => {
    await lock(tx, `expense-request:${parsed.requestId}`);
    if (id) await lock(tx, `expense:${id}`);
    const previous = await tx.expenseRevision.findUnique({
      where: { requestId: parsed.requestId },
    });
    if (previous) {
      if (
        previous.payloadDigest !== digest ||
        (id && previous.expenseId !== id)
      )
        throw conflict();
      return tx.businessExpense.findUniqueOrThrow({
        where: { id: previous.expenseId },
      });
    }
    const before = id
      ? await tx.businessExpense.findUnique({ where: { id } })
      : null;
    if (id && !before) throw missing();
    if (
      before &&
      (before.status !== "ACTIVE" ||
        !("version" in parsed) ||
        parsed.version !== before.version)
    )
      throw conflict();
    if (cancel && !before) throw missing();
    const data =
      "data" in parsed
        ? parsed.data
        : {
            title: before!.title,
            category: before!.category,
            amountPaise: before!.amountPaise,
            expenseDate: before!.expenseDate.toISOString().slice(0, 10),
            paymentMethod: before!.paymentMethod,
            reference: before!.reference,
            description: before!.description,
          };
    const settings = await tx.businessSettings.findUnique({
      where: { id: "singleton" },
      select: { timezone: true },
    });
    const zone = settings?.timezone || "Asia/Kolkata";
    if (!validTimezone(zone))
      throw new AppError(
        409,
        "INVALID_TIMEZONE",
        "Confirm the configured business timezone.",
      );
    if (
      data.expenseDate > dayInZone(new Date(), zone) ||
      data.expenseDate < "2000-01-01"
    )
      throw new AppError(
        422,
        "INVALID_DATE",
        "Record an actual expense date, not a future date.",
      );
    const values = {
      ...data,
      expenseDate: new Date(data.expenseDate),
      status: cancel ? "CANCELLED" : "ACTIVE",
    };
    const expense = id
      ? await tx.businessExpense.update({
          where: { id },
          data: { ...values, version: { increment: 1 } },
        })
      : await tx.businessExpense.create({
          data: {
            ...values,
            requestId: parsed.requestId,
            payloadDigest: digest,
            createdById: actor.id,
          },
        });
    await tx.expenseRevision.create({
      data: {
        ...values,
        expenseId: expense.id,
        version: expense.version,
        requestId: parsed.requestId,
        payloadDigest: digest,
        actorId: actor.id,
        reason: parsed.reason,
      },
    });
    await recordAudit(
      {
        actorId: actor.id,
        action: "EXPENSE_CHANGED",
        entityType: "BusinessExpense",
        entityId: expense.id,
        reason: parsed.reason,
      },
      tx,
    );
    return expense;
  });
}
export async function uploadExpenseAttachment(
  actor: Actor,
  id: string,
  input: Record<string, unknown>,
) {
  allowed(actor, "expenses.manage");
  const { file, ...fields } = input;
  const data = z.object({ requestId: z.uuid() }).strict().parse(fields);
  const e = await getDb().businessExpense.findUnique({ where: { id } });
  if (!e) throw missing();
  if (!(file instanceof File))
    throw new AppError(422, "MISSING_FILE", "Choose a receipt image.");
  const image = await proofImage(file);
  return getDb().$transaction(async (tx) => {
    await lock(tx, `expense-file:${data.requestId}`);
    await lock(tx, `expense:${id}`);
    const current = await tx.businessExpense.findUniqueOrThrow({
      where: { id },
    });
    if (current.status !== "ACTIVE") throw conflict();
    const old = await tx.expenseAttachment.findUnique({
      where: { requestId: data.requestId },
    });
    if (old) {
      if (old.expenseId !== id || old.fileHash !== image.imageHash)
        throw conflict();
      return { id: old.id };
    }
    if ((await tx.expenseAttachment.count({ where: { expenseId: id } })) >= 5)
      throw new AppError(
        422,
        "ATTACHMENT_LIMIT",
        "Maximum five receipt images per expense.",
      );
    const a = await tx.expenseAttachment.create({
      data: {
        expenseId: id,
        requestId: data.requestId,
        fileBytes: image.imageBytes,
        fileHash: image.imageHash,
        fileSize: image.imageSize,
        originalName: image.originalName,
        uploadedById: actor.id,
      },
    });
    await recordAudit(
      {
        actorId: actor.id,
        action: "EXPENSE_CHANGED",
        entityType: "BusinessExpense",
        entityId: id,
        reason: "Private expense receipt image attached.",
      },
      tx,
    );
    return { id: a.id };
  });
}
export async function expenseAttachment(actor: Actor, id: string) {
  allowed(actor, "expenses.manage");
  const a = await getDb().expenseAttachment.findUnique({
    where: { id },
    select: { fileBytes: true },
  });
  if (!a) throw missing();
  return new Response(new Uint8Array(a.fileBytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline; filename=expense-receipt.png",
    },
  });
}
