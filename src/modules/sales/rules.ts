import { z } from "zod";
export const referenceKey = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const id = z.string().min(1).max(100);
export const requestId = z.string().uuid();
export const method = z.enum(["UPI", "BANK"]);
export const reason = z.string().trim().min(5).max(500);
export const settingsSchema = z
  .object({
    version: z.number().int().nonnegative(),
    enabled: z.boolean(),
    confirmed: z.literal(true),
    reason,
    upiId: z.string().trim().max(150),
    holderName: z.string().trim().max(150),
    bankName: z.string().trim().max(150),
    accountNumber: z.string().trim().max(40),
    ifsc: z.string().trim().max(11),
    branch: z.string().trim().max(150),
    instructions: z.string().trim().max(1000),
    taxBps: z.number().int().min(0).max(10000),
    taxMode: z.enum(["INCLUSIVE", "EXCLUSIVE"]),
    deliveryPaise: z.number().int().min(0).max(100000000),
    reservationMinutes: z.number().int().min(1).max(43200),
    lateReviewMinutes: z.number().int().min(0).max(43200),
    customerCancelUnpaid: z.boolean(),
    adminCancelUnpaid: z.boolean(),
    adminCancelPaid: z.boolean(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.lateReviewMinutes > v.reservationMinutes)
      c.addIssue({
        code: "custom",
        message: "Late review window must fit reservation duration.",
      });
    if (v.upiId && !/^[\w.\-]{2,}@[\w.\-]{2,}$/.test(v.upiId))
      c.addIssue({ code: "custom", message: "Enter a valid UPI ID." });
    if (
      v.accountNumber &&
      (!/^\d{6,40}$/.test(v.accountNumber) ||
        !v.holderName ||
        !v.bankName ||
        !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.ifsc))
    )
      c.addIssue({
        code: "custom",
        message: "Confirm complete bank details and IFSC.",
      });
    if (v.enabled && !v.upiId && !v.accountNumber)
      c.addIssue({
        code: "custom",
        message:
          "Configure UPI or complete bank details before enabling orders.",
      });
  });
export function totals(
  lines: { quantity: number; unitPricePaise: number }[],
  taxBps: number,
  taxMode: string,
  deliveryPaise: number,
) {
  const subtotalPaise = lines.reduce(
    (s, l) => s + l.quantity * l.unitPricePaise,
    0,
  );
  const taxes = lines.map((l) =>
    Math.round(
      (l.quantity * l.unitPricePaise * taxBps) /
        (taxMode === "INCLUSIVE" ? 10000 + taxBps : 10000),
    ),
  );
  const taxPaise = taxes.reduce((s, n) => s + n, 0);
  const totalPaise =
    subtotalPaise + (taxMode === "EXCLUSIVE" ? taxPaise : 0) + deliveryPaise;
  if (
    !Number.isSafeInteger(totalPaise) ||
    totalPaise > 2000000000 ||
    totalPaise < 1
  )
    throw new Error("Amount outside supported bounds.");
  return { subtotalPaise, taxPaise, totalPaise, deliveryPaise, taxes };
}
export function paymentBalance(
  records: { kind: string; amountPaise: number }[],
) {
  return records.reduce(
    (s, p) => s + (p.kind === "REFUND" ? -p.amountPaise : p.amountPaise),
    0,
  );
}
