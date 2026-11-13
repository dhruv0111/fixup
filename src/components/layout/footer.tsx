import Link from "next/link";
import { getWebsite } from "@/modules/catalogue/service";
import { WhatsAppLink } from "@/components/public/shared";
export async function Footer() {
  const site = await getWebsite();
  return (
    <footer className="site-footer">
      <div className="container grid gap-10 py-14 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Link className="text-3xl font-black tracking-tight" href="/">
            FIXUP<span className="text-violet-300">.</span>
          </Link>
          <p className="mt-4 max-w-xs leading-7 text-gray-300">
            Strong Bond. Lasting Trust.
            <br />
            Adhesive sourcing and distribution for your next project.
          </p>
          <p className="mt-5 text-xs text-gray-400">
            Website preview · Product information under review
          </p>
        </div>
        <nav
          aria-label="Footer navigation"
          className="grid content-start gap-3 text-sm"
        >
          {[
            ["About FIXUP", "/about"],
            ["Products", "/products"],
            ["Applications", "/applications"],
            ["Become a dealer", "/become-a-dealer"],
            ["Bulk orders", "/bulk-orders"],
            ["FAQs", "/faq"],
          ].map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="space-y-3 text-sm">
          <h2 className="font-semibold">Let’s talk</h2>
          {site.phone && (
            <p>
              <a href={`tel:${site.phone.replace(/[^+0-9]/g, "")}`}>
                {site.phone}
              </a>
            </p>
          )}
          {site.email && (
            <p className="break-words">
              <a href={`mailto:${site.email}`}>{site.email}</a>
            </p>
          )}
          {site.address && <p>{site.address}</p>}
          {site.workingHours && <p>{site.workingHours}</p>}
          <Link href="/contact" className="block underline underline-offset-4">
            Send an enquiry
          </Link>
          <WhatsAppLink number={site.whatsapp} />
        </div>
      </div>
      <div className="container flex flex-wrap justify-between gap-5 border-t border-white/15 py-6 text-xs text-gray-300">
        <p>FIXUP · Adhesives & bonding solutions</p>
        <nav aria-label="Policies" className="flex flex-wrap gap-5">
          {[
            ["Privacy", "privacy"],
            ["Terms", "terms"],
            ["Shipping", "shipping"],
            ["Returns & refunds", "returns"],
          ].map(([title, slug]) => (
            <Link key={slug} href={`/policies/${slug}`}>
              {title}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
