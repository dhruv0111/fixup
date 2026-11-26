import { PaginatedTable } from "./paginated-table";
import { OperationsTabs } from "./operations-tabs";
export const operationLinks = [
  ["Suppliers", "suppliers"],
  ["Purchase Orders", "purchase-orders"],
  ["Goods Receiving", "goods-receiving"],
  ["Inventory Dashboard", "inventory"],
  ["Stock Ledger", "stock-ledger"],
  ["Stock Adjustments", "stock-adjustments"],
  ["Inventory Reports", "reports"],
] as const;
export function OperationsNav() {
  return <OperationsTabs links={operationLinks} />;
}
export const money = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    v / 100,
  );
export function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return <p className="info-panel">No matching records.</p>;
  const primary = [
    "number",
    "product",
    "variant",
    "pack",
    "packSize",
    "quantity",
    "ordered",
    "received",
    "remaining",
    "onHand",
    "reserved",
    "available",
    "damaged",
    "total",
    "minimumQuantity",
    "type",
    "status",
    "date",
  ];
  const rank = (key: string) => {
    const index = primary.indexOf(key);
    return index >= 0 ? index : key === "id" || key.endsWith("Id") ? 200 : 100;
  };
  const keys = Object.keys(rows[0])
    .filter(
      (key) => !["productId", "variantId", "settingVersion"].includes(key),
    )
    .sort((a, b) => rank(a) - rank(b));
  return (
    <PaginatedTable
      columns={keys.map((k) => k.replace(/([A-Z])/g, " $1"))}
      rows={rows.map((row) =>
        keys.map((k) =>
          row[k] === null || row[k] === undefined
            ? "Not supplied"
            : k.endsWith("Paise") && typeof row[k] === "number"
              ? money(row[k] as number)
              : typeof row[k] === "boolean"
                ? row[k]
                  ? "Yes"
                  : "No"
                : String(row[k]),
        ),
      )}
    />
  );
}
