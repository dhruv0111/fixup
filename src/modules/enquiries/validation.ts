import { z } from "zod";

const plain = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (s) => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s),
      "Use plain text without markup.",
    );
export const enquirySchema = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(["DEALER", "BULK", "CONTACT"]),
    name: plain(100).pipe(z.string().min(2)),
    businessName: plain(150).default(""),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid mobile number."),
    email: z.union([z.email().max(254), z.literal("")]).default(""),
    address: plain(500).default(""),
    city: plain(100).default(""),
    postalCode: z
      .union([z.string().regex(/^[1-9][0-9]{5}$/), z.literal("")])
      .default(""),
    businessType: plain(100).default(""),
    gstin: z
      .union([
        z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/),
        z.literal(""),
      ])
      .default(""),
    quantity: plain(100).default(""),
    location: plain(200).default(""),
    message: plain(2000).default(""),
    productId: z.string().max(100).optional(),
    consent: z.literal(true),
    website: z.string().max(200).default(""),
    token: z.string().max(300),
  })
  .strict()
  .superRefine((data, ctx) => {
    const required =
      data.kind === "DEALER"
        ? ([
            "businessName",
            "email",
            "address",
            "city",
            "postalCode",
            "businessType",
            "quantity",
          ] as const)
        : data.kind === "BULK"
          ? (["productId", "quantity", "location"] as const)
          : (["message"] as const);
    for (const field of required)
      if (!data[field]?.trim())
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "This field is required.",
        });
  });
export type EnquiryInput = z.input<typeof enquirySchema>;
