import { z } from "zod";
import { dateQuery } from "./dates";
export const reportKinds = [
  "sales",
  "payments",
  "purchases",
  "suppliers",
  "inventory",
  "expenses",
  "profitability",
  "deliveries",
  "customers",
  "dealers",
  "products",
] as const;
export const reportNames = {
  sales: "Sales",
  payments: "Payments & collections",
  purchases: "Purchases",
  suppliers: "Suppliers",
  inventory: "Inventory",
  expenses: "Expenses",
  profitability: "Estimated profitability",
  deliveries: "Dispatch & delivery",
  customers: "Customers",
  dealers: "Dealers",
  products: "Products & variants",
} as const;
export const expenseCategories = [
  "TRANSPORTATION",
  "LOCAL_DELIVERY",
  "COURIER",
  "PACKAGING",
  "RENT",
  "ELECTRICITY",
  "INTERNET_TELEPHONE",
  "MARKETING",
  "STAFF",
  "OFFICE",
  "MAINTENANCE",
  "OTHER",
] as const;
const id = z.string().max(100).default("");
export const reportQuery = dateQuery
  .extend({
    q: z.string().trim().max(150).default(""),
    method: z.enum(["", "UPI", "BANK", "CASH", "OTHER"]).default(""),
    status: z.string().max(40).default(""),
    paymentStatus: z
      .enum(["", "UNPAID", "PARTIALLY_PAID", "PAID", "OVERPAID"])
      .default(""),
    reviewStatus: z
      .enum([
        "",
        "SUBMITTED",
        "UNDER_REVIEW",
        "VERIFIED",
        "REJECTED",
        "RESUBMISSION_REQUIRED",
      ])
      .default(""),
    customerId: id,
    dealerId: id,
    supplierId: id,
    productId: id,
    variantId: id,
    deliveryMethod: z.enum(["", "LOCAL", "COURIER"]).default(""),
    courier: z.string().trim().max(100).default(""),
    category: z.union([z.enum(expenseCategories), z.literal("")]).default(""),
    customerCategory: z.enum(["", "RETAIL", "APPROVED_DEALER"]).default(""),
    period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
    view: z
      .enum(["summary", "movements", "receipts", "history"])
      .default("summary"),
    format: z.enum(["json", "csv"]).default("json"),
  })
  .strict();
export const reason = z.string().trim().min(5).max(500);
export const expenseFields = z
  .object({
    title: z.string().trim().min(3).max(150),
    category: z.enum(expenseCategories),
    amountPaise: z.number().int().min(1).max(1000000000),
    expenseDate: z.iso.date(),
    paymentMethod: z.enum(["UPI", "BANK", "CASH", "OTHER"]),
    reference: z.string().trim().max(150).default(""),
    description: z.string().trim().max(2000).default(""),
  })
  .strict();
export const expenseCreate = z
  .object({ requestId: z.uuid(), reason, data: expenseFields })
  .strict();
export const expenseEdit = z
  .object({
    requestId: z.uuid(),
    version: z.number().int().nonnegative(),
    reason,
    data: expenseFields,
  })
  .strict();
export const expenseCancel = z
  .object({
    requestId: z.uuid(),
    version: z.number().int().nonnegative(),
    reason,
    action: z.literal("CANCEL"),
  })
  .strict();
