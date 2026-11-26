"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function OperationsTabs({
  links,
}: {
  links: readonly (readonly [string, string])[];
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Purchasing and inventory" className="o-tabs">
      {links.map(([label, path]) => {
        const href = `/admin/operations/${path}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={path}
            href={href}
            className="o-tab"
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
