import Link from "next/link";
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
  return (
    <nav aria-label="Purchasing and inventory" className="flex flex-wrap gap-3">
      {operationLinks.map(([label, path]) => (
        <Link
          className="button button-secondary compact"
          key={path}
          href={`/admin/operations/${path}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
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
    <div
      className="max-w-full overflow-x-auto rounded-xl border border-line"
      tabIndex={0}
      role="region"
      aria-label="Report data"
    >
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-violet-50">
          <tr>
            {keys.map((k) => (
              <th key={k} className="whitespace-nowrap p-3 font-semibold">
                {k.replace(/([A-Z])/g, " $1")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {keys.map((k) => (
                <td key={k} className="max-w-xs break-words p-3">
                  {r[k] === null || r[k] === undefined
                    ? "Not supplied"
                    : k.endsWith("Paise") && typeof r[k] === "number"
                      ? money(r[k] as number)
                      : typeof r[k] === "boolean"
                        ? r[k]
                          ? "Yes"
                          : "No"
                        : String(r[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
