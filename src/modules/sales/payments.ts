import "server-only";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import type { Actor } from "@/server/permissions/service";
import { allowed, conflict } from "@/modules/management/history";
import { lock } from "@/modules/inventory/service";
import { hash, invalid, missing } from "./cart";
import {
  authorize,
  load,
  dto,
  event,
  refresh,
  expireOne,
  stockLocks,
} from "./orders";
import {
  requestId,
  method,
  reason,
  referenceKey,
  paymentBalance,
} from "./rules";
import { proofImage } from "./proof";
const reference = z
  .string()
  .trim()
  .min(6)
  .max(100)
  .refine((v) => referenceKey(v).length >= 6);
const submissionSchema = z
  .object({
    requestId,
    method,
    reference,
    paidOn: z.iso
      .date()
      .refine((v) => new Date(v).getTime() <= Date.now() + 86400000),
    remarks: z.string().trim().max(1000).default(""),
  })
  .strict();
export async function submitProof(
  actor: Actor,
  id: string,
  input: Record<string, unknown>,
) {
  // Ownership is checked before decoding an uploaded image.
  const own = await getDb().salesOrder.findUnique({
    where: { id },
    select: { customerId: true },
  });
  if (!own) throw missing();
  authorize(actor, own);
  const { file, ...fields } = input;
  const data = submissionSchema.parse(fields);
  if (!(file instanceof File)) throw invalid("Choose a screenshot.");
  const image = await proofImage(file);
  const digest = hash({ ...data, imageHash: image.imageHash });
  return getDb().$transaction(
    async (tx) => {
      await lock(tx, `proof-request:${data.requestId}`);
      await expireOne(tx, id, actor);
      const row = await load(tx, id);
      authorize(actor, row);
      const old = await tx.paymentSubmission.findUnique({
        where: { requestId: data.requestId },
      });
      if (old) {
        if (
          old.orderId !== id ||
          old.submittedById !== actor.id ||
          old.payloadDigest !== digest
        )
          throw conflict();
        return dto(row);
      }
      if (
        row.submissions.some((s) =>
          ["SUBMITTED", "UNDER_REVIEW"].includes(s.status),
        )
      )
        throw invalid("An existing submission is awaiting review.");
      const key = referenceKey(data.reference);
      await lock(tx, `payment-reference:${key}`);
      await lock(tx, `payment-image:${image.imageHash}`);
      const duplicate =
        !!(await tx.paymentSubmission.findFirst({
          where: {
            OR: [{ referenceKey: key }, { imageHash: image.imageHash }],
          },
        })) ||
        !!(await tx.paymentRecord.findUnique({ where: { referenceKey: key } }));
      const late =
        row.cancelledAt !== null ||
        row.reservations.some((r) => r.status !== "ACTIVE") ||
        Date.now() >=
          row.reservationExpiresAt.getTime() - row.lateReviewMinutes * 60000;
      await tx.paymentSubmission.create({
        data: {
          ...data,
          paidOn: new Date(data.paidOn),
          referenceKey: key,
          payloadDigest: digest,
          orderId: id,
          submittedById: actor.id,
          ...image,
          duplicateReference: duplicate,
          late,
        },
      });
      if (late)
        await tx.salesOrder.update({
          where: { id },
          data: { lateReviewRequired: true },
        });
      await event(
        tx,
        actor,
        id,
        "PROOF_SUBMITTED",
        late
          ? "Payment proof submitted for review. Reservation timing requires explicit admin resolution."
          : "Payment proof submitted for manual verification. This does not confirm payment.",
      );
      return dto(await refresh(tx, id));
    },
    { timeout: 15000 },
  );
}
export async function proof(actor: Actor, id: string) {
  const row = await getDb().paymentSubmission.findUnique({
    where: { id },
    select: { imageBytes: true, order: { select: { customerId: true } } },
  });
  if (!row) throw missing();
  if (actor.customer?.id !== row.order.customerId)
    allowed(actor, "payments.verify");
  return new Response(new Uint8Array(row.imageBytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline; filename=payment-proof.png",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
const reviewSchema = z
  .object({
    action: z.enum(["REVIEW", "REJECT", "RESUBMISSION_REQUIRED", "VERIFY"]),
    version: z.number().int().nonnegative(),
    reason,
    internalNotes: z.string().trim().min(5).max(1000),
    publicMessage: z.string().trim().max(500).default(""),
    checkedBankRecord: z.boolean().optional(),
    duplicateReviewed: z.boolean().optional(),
    amountPaise: z.number().int().positive().max(1000000000).optional(),
    bankReference: reference.optional(),
    requestId: requestId.optional(),
  })
  .strict();
export async function reviewPayment(actor: Actor, id: string, input: unknown) {
  allowed(actor, "payments.verify");
  const data = reviewSchema.parse(input);
  const source = await getDb().paymentSubmission.findUnique({
    where: { id },
    select: { orderId: true },
  });
  if (!source) throw missing();
  return getDb().$transaction(async (tx) => {
    await expireOne(tx, source.orderId, actor);
    let row = await load(tx, source.orderId);
    if (actor.customer?.id === row.customerId)
      throw new AppError(
        403,
        "SELF_VERIFICATION",
        "You cannot review your own payment.",
      );
    await stockLocks(tx, row);
    const s = await tx.paymentSubmission.findUniqueOrThrow({ where: { id } });
    if (data.action === "VERIFY" && s.status === "VERIFIED") {
      const record = await tx.paymentRecord.findUnique({
        where: { submissionId: id },
      });
      if (
        record &&
        record.bankReference === data.bankReference &&
        record.amountPaise === data.amountPaise &&
        data.checkedBankRecord === true
      )
        return dto(row, true);
      throw conflict();
    }
    if (
      s.version !== data.version ||
      !["SUBMITTED", "UNDER_REVIEW"].includes(s.status)
    )
      throw conflict();
    if (data.action === "VERIFY") {
      if (
        data.checkedBankRecord !== true ||
        !data.amountPaise ||
        !data.bankReference ||
        !data.requestId
      )
        throw invalid(
          "Confirm the actual bank/UPI record, received amount, bank reference and request ID.",
        );
      if (s.duplicateReference && data.duplicateReviewed !== true)
        throw invalid("Review the duplicate-reference warning explicitly.");
      const key = referenceKey(data.bankReference);
      await lock(tx, `payment-reference:${key}`);
      if (await tx.paymentRecord.findUnique({ where: { referenceKey: key } }))
        throw new AppError(
          409,
          "DUPLICATE_BANK_REFERENCE",
          "This bank transaction was already recorded.",
        );
      // A stock/reference lock may have waited beyond the reservation deadline.
      // Linearize approval at this check, after all potentially blocking locks.
      const verifiedAt = new Date();
      if (
        row.reservations.some(
          (r) =>
            r.status === "ACTIVE" && r.expiresAt && r.expiresAt <= verifiedAt,
        )
      ) {
        await expireOne(tx, row.id, actor);
        row = await load(tx, row.id);
      }
      await tx.paymentRecord.create({
        data: {
          createdAt: verifiedAt,
          requestId: data.requestId,
          payloadDigest: hash(data),
          orderId: row.id,
          submissionId: id,
          kind: "RECEIPT",
          method: s.method,
          amountPaise: data.amountPaise,
          bankReference: data.bankReference,
          referenceKey: key,
          verifiedById: actor.id,
          notes: data.internalNotes,
        },
      });
      await tx.salesOrder.update({
        where: { id: row.id },
        data: { overpaymentResolved: false },
      });
      if (row.cancelledAt)
        await tx.salesOrder.update({
          where: { id: row.id },
          data: { refundDecisionRequired: true },
        });
    }
    const status =
      data.action === "VERIFY"
        ? "VERIFIED"
        : data.action === "REJECT"
          ? "REJECTED"
          : data.action === "REVIEW"
            ? "UNDER_REVIEW"
            : "RESUBMISSION_REQUIRED";
    await tx.paymentSubmission.update({
      where: { id },
      data: {
        status,
        version: { increment: 1 },
        reviewedById: actor.id,
        reviewedAt: new Date(),
        internalNotes: data.internalNotes,
        publicMessage: data.publicMessage,
      },
    });
    await event(
      tx,
      actor,
      row.id,
      status,
      data.publicMessage ||
        {
          VERIFIED: "Payment amount manually verified against bank records.",
          REJECTED: "Payment proof rejected. Please review and resubmit.",
          UNDER_REVIEW: "Payment is under review.",
          RESUBMISSION_REQUIRED: "A new payment submission is required.",
        }[status],
      data.internalNotes,
    );
    row = await refresh(tx, row.id);
    return dto(row, true);
  });
}
export async function refund(actor: Actor, id: string, input: unknown) {
  allowed(actor, "payments.verify");
  const data = z
    .object({
      requestId,
      amountPaise: z.number().int().positive().max(1000000000),
      method,
      bankReference: reference,
      checkedBankRecord: z.literal(true),
      reason,
      internalNotes: z.string().trim().min(5).max(1000),
    })
    .strict()
    .parse(input);
  const digest = hash(data);
  return getDb().$transaction(async (tx) => {
    await lock(tx, `refund-request:${data.requestId}`);
    await expireOne(tx, id, actor);
    const row = await load(tx, id);
    if (actor.customer?.id === row.customerId)
      throw new AppError(
        403,
        "SELF_VERIFICATION",
        "You cannot verify your own refund.",
      );
    await stockLocks(tx, row);
    const old = await tx.paymentRecord.findUnique({
      where: { requestId: data.requestId },
    });
    if (old) {
      if (old.orderId !== id || old.payloadDigest !== digest) throw conflict();
      return dto(row, true);
    }
    const net = paymentBalance(row.payments);
    const refundable = row.cancelledAt
      ? net
      : Math.max(0, net - row.totalPaise);
    if (data.amountPaise > refundable)
      throw invalid("Refund exceeds the refundable verified amount.");
    const key = referenceKey(data.bankReference);
    await lock(tx, `payment-reference:${key}`);
    await tx.paymentRecord.create({
      data: {
        requestId: data.requestId,
        payloadDigest: digest,
        orderId: id,
        kind: "REFUND",
        method: data.method,
        amountPaise: data.amountPaise,
        bankReference: data.bankReference,
        referenceKey: key,
        verifiedById: actor.id,
        notes: data.internalNotes,
      },
    });
    if (row.cancelledAt && net === data.amountPaise)
      await tx.salesOrder.update({
        where: { id },
        data: { refundDecisionRequired: false },
      });
    await event(
      tx,
      actor,
      id,
      "MANUAL_REFUND_RECORDED",
      "A manually completed refund was recorded. No transfer was initiated by this website.",
      data.internalNotes,
    );
    return dto(await refresh(tx, id), true);
  });
}
export async function paymentQueue(actor: Actor) {
  allowed(actor, "payments.verify");
  return getDb().paymentSubmission.findMany({
    select: {
      id: true,
      orderId: true,
      status: true,
      method: true,
      reference: true,
      paidOn: true,
      createdAt: true,
      duplicateReference: true,
      late: true,
      order: {
        select: {
          number: true,
          totalPaise: true,
          paymentStatus: true,
          customerSnapshot: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
