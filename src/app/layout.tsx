import type { Metadata } from "next";
import { Navigation } from "@/components/layout/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FIXUP — Adhesives & Bonding Solutions",
    template: "%s | FIXUP",
  },
  description: "The FIXUP account portal for customers and business partners.",
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
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5 py-7 text-xs text-muted sm:px-8">
            <p>FIXUP · Adhesives & Bonding Solutions</p>
            <p>Preview · Temporary branding</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
