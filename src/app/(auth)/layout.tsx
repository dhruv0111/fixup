import { SiteFrame } from "@/components/layout/site-frame";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
