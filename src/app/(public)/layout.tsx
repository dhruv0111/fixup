import { SiteFrame } from "@/components/layout/site-frame";
// Catalogue publication and contact settings are evaluated on every request.
export const dynamic = "force-dynamic";
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteFrame>{children}</SiteFrame>;
}
