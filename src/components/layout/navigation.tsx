import Link from "next/link";
import { headers } from "next/headers";
import { getActor } from "@/server/permissions/service";
import { SignOutButton } from "@/components/forms/session-actions";
export async function Navigation() {
  const actor = await getActor(await headers(), false);
  return (
    <header className="site-header">
      <div className="container flex flex-wrap items-center justify-between gap-5 py-5">
        <Link href="/" aria-label="FIXUP home" className="brand-logo">
          FIXUP<span>.</span>
          <small>ADHESIVES & BONDING SOLUTIONS</small>
        </Link>
        <nav aria-label="Main navigation" className="main-nav">
          <Link href="/">Home</Link>
          <Link href="/products">Products</Link>
          <Link href="/applications">Applications</Link>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {actor ? (
            <>
              <Link href="/account">My account</Link>
              {actor.permissions.includes("admin.access") && (
                <Link href="/admin">Admin</Link>
              )}
              <SignOutButton />
            </>
          ) : (
            <Link href="/login">Sign in</Link>
          )}
          <Link href="/become-a-dealer" className="button compact">
            Become a dealer ↗
          </Link>
        </div>
      </div>
    </header>
  );
}
