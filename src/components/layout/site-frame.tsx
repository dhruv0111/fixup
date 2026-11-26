import { Navigation } from "@/components/layout/navigation";
import { Footer } from "@/components/layout/footer";

// The public website chrome. Admin pages deliberately do not use it.
export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navigation />
      {children}
      <Footer />
    </>
  );
}
