import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/server/db/client";

export type AuditAction =
  | "USER_REGISTERED"
  | "SESSION_CREATED"
  | "SESSION_REVOKED"
  | "USER_LOGGED_OUT"
  | "PASSWORD_RESET"
  | "PROFILE_UPDATED"
  | "ADDRESS_CREATED"
  | "ADDRESS_UPDATED"
  | "BUSINESS_SETTINGS_UPDATED"
  | "ROLE_CHANGED"
  | "CATALOGUE_UPDATED"
  | "CONTENT_UPDATED"
  | "ENQUIRY_RECEIVED"
  | "ADDRESS_DELETED"
  | "ACCOUNT_STATUS_CHANGED"
  | "DEALER_APPLIED"
  | "DEALER_STATUS_CHANGED"
  | "PRICE_LIST_CHANGED"
  | "CATEGORY_PRICE_LIST_CHANGED"
  | "VARIANT_CHANGED"
  | "SUPPLIER_CHANGED"
  | "PURCHASE_CHANGED"
  | "GOODS_RECEIPT_CHANGED"
  | "STOCK_ADJUSTED"
  | "STOCK_THRESHOLD_CHANGED"
  | "SALES_CHANGED";

type AuditEntry = {
  actorId: string | null;
  action: AuditAction;
  entityType:
    | "User"
    | "Session"
    | "Customer"
    | "Address"
    | "BusinessSettings"
    | "Product"
    | "Category"
    | "WebsiteContent"
    | "Faq"
    | "Policy"
    | "Enquiry"
    | "DealerProfile"
    | "PriceList"
    | "CategoryPriceList"
    | "ProductVariant"
    | "Supplier"
    | "PurchaseOrder"
    | "GoodsReceipt"
    | "StockAdjustment"
    | "StockSetting"
    | "SalesOrder"
    | "SalesSettings";
  // No account credentials or private documents belong in audit records.
  entityId: string;
  reason?: string;
};

// Explicit allowlist: no arbitrary request bodies, metadata, passwords or tokens.
export async function recordAudit(
  entry: AuditEntry,
  db: Pick<Prisma.TransactionClient, "auditLog"> = getDb(),
) {
  return db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      reason: entry.reason?.slice(0, 500),
    },
  });
}
