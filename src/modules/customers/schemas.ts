import { z } from "zod";

export const profileSchema = z
  .object({
    businessName: z.string().trim().min(2).max(160).nullable().optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide a profile field.");

export const addressSchema = z
  .object({
    recipient: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/),
    line1: z.string().trim().min(3).max(200),
    line2: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().min(2).max(100),
    postalCode: z.string().regex(/^[1-9][0-9]{5}$/),
    country: z.literal("IN").default("IN"),
  })
  .strict();
