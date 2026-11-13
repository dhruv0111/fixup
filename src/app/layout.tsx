import type { Metadata } from "next";
import { Navigation } from "@/components/layout/navigation";
import { Footer } from "@/components/layout/footer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FIXUP — Adhesives & Bonding Solutions",
    template: "%s | FIXUP",
  },
  description:
    "Adhesive sourcing and distribution for customers, hardware shops and business partners.",
  robots: { index: false, follow: false },
};
export const runtime = "nodejs";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded bg-white p-3 focus:not-sr-only focus:absolute"
        >
          Skip to main content
        </a>
        <Navigation />
        {children}
        <Footer />
      </body>
    </html>
  );
}
