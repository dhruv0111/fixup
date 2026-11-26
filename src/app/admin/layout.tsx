import { headers } from "next/headers";
import { getActor } from "@/server/permissions/service";
import { AdminShell } from "@/components/admin/shell";
import { visibleNav } from "@/components/admin/nav";
import { SiteFrame } from "@/components/layout/site-frame";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor(await headers(), false);
  // Pages perform their own sign-in and permission checks. People without admin
  // access (for example the "Access restricted" page) stay in the public layout.
  if (!actor?.permissions.includes("admin.access"))
    return <SiteFrame>{children}</SiteFrame>;
  return (
    <AdminShell groups={visibleNav(actor.permissions)} userName={actor.name}>
      {children}
    </AdminShell>
  );
}
