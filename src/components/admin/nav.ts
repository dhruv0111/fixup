import type { Permission } from "@/server/permissions/service";

export type IconName =
  | "home"
  | "cart"
  | "card"
  | "truck"
  | "inbox"
  | "users"
  | "badge"
  | "box"
  | "tag"
  | "globe"
  | "factory"
  | "layers"
  | "book"
  | "list"
  | "receipt"
  | "chart"
  | "gear";
export type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  permission: Permission;
  // Prefix matching keeps a parent highlighted on its detail pages.
  exact?: boolean;
};
export type NavGroup = { id: string; label: string; items: NavItem[] };
export type VisibleItem = Omit<NavItem, "permission">;
export type VisibleGroup = { id: string; label: string; items: VisibleItem[] };

// The single navigation definition used by the desktop sidebar and the mobile drawer.
export const adminNav: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/admin",
        icon: "home",
        permission: "admin.access",
        exact: true,
      },
    ],
  },
  {
    id: "sales",
    label: "Sales & orders",
    items: [
      {
        label: "Sales orders",
        href: "/admin/sales/orders",
        icon: "cart",
        permission: "orders.manage",
      },
      {
        label: "Payment verification",
        href: "/admin/sales/payments",
        icon: "card",
        permission: "payments.verify",
      },
      {
        label: "Dispatch & delivery",
        href: "/admin/dispatch",
        icon: "truck",
        permission: "dispatch.manage",
      },
      {
        label: "Customer enquiries",
        href: "/admin/enquiries",
        icon: "inbox",
        permission: "enquiries.read",
      },
    ],
  },
  {
    id: "people",
    label: "Customers & dealers",
    items: [
      {
        label: "Customers",
        href: "/admin/customers",
        icon: "users",
        permission: "customers.manage",
      },
      {
        label: "Dealers",
        href: "/admin/dealers",
        icon: "badge",
        permission: "dealers.manage",
      },
    ],
  },
  {
    id: "catalogue",
    label: "Catalogue",
    items: [
      {
        label: "Products & variants",
        href: "/admin/products",
        icon: "box",
        permission: "catalogue.write",
      },
      {
        label: "Price lists",
        href: "/admin/price-lists",
        icon: "tag",
        permission: "pricing.manage",
      },
      {
        label: "Website content",
        href: "/admin/content",
        icon: "globe",
        permission: "catalogue.write",
      },
    ],
  },
  {
    id: "stock",
    label: "Purchasing & inventory",
    items: [
      {
        label: "Suppliers",
        href: "/admin/operations/suppliers",
        icon: "factory",
        permission: "inventory.read",
      },
      {
        label: "Purchase orders",
        href: "/admin/operations/purchase-orders",
        icon: "list",
        permission: "inventory.read",
      },
      {
        label: "Goods receiving",
        href: "/admin/operations/goods-receiving",
        icon: "box",
        permission: "inventory.read",
      },
      {
        label: "Inventory",
        href: "/admin/operations/inventory",
        icon: "layers",
        permission: "inventory.read",
      },
      {
        label: "Stock ledger",
        href: "/admin/operations/stock-ledger",
        icon: "book",
        permission: "inventory.read",
      },
      {
        label: "Stock adjustments",
        href: "/admin/operations/stock-adjustments",
        icon: "gear",
        permission: "inventory.read",
      },
    ],
  },
  {
    id: "finance",
    label: "Finance & reports",
    items: [
      {
        label: "Record expense",
        href: "/admin/expenses/new",
        icon: "receipt",
        permission: "expenses.manage",
      },
      {
        label: "Business dashboard",
        href: "/admin/business",
        icon: "chart",
        permission: "reports.read",
      },
      {
        label: "Reports & analytics",
        href: "/admin/reports",
        icon: "chart",
        permission: "reports.read",
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      {
        label: "Sales settings",
        href: "/admin/sales/settings",
        icon: "gear",
        permission: "settings.update",
      },
    ],
  },
];

// Server-side filter so unauthorised links are never sent to the browser.
export function visibleNav(permissions: readonly string[]): VisibleGroup[] {
  return adminNav
    .map((g) => ({
      id: g.id,
      label: g.label,
      items: g.items
        .filter((i) => permissions.includes(i.permission))
        .map(({ permission, ...rest }) => {
          void permission;
          return rest;
        }),
    }))
    .filter((g) => g.items.length);
}

export const isActive = (item: VisibleItem, pathname: string) =>
  item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
