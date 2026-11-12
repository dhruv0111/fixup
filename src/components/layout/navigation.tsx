import Link from "next/link";
import { headers } from "next/headers";
import { getActor } from "@/server/permissions/service";
import { SignOutButton } from "@/components/forms/session-actions";

export async function Navigation() {
  // Pending profile setup must not break public navigation or the logout control.
  const actor = await getActor(await headers(), false);
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link
          href="/"
          aria-label="FIXUP home"
          className="flex items-center gap-3"
        >
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-lg bg-brand text-xl font-black text-white"
          >
            F<span className="text-lime-200">.</span>
          </span>
          <span>
            <span className="block text-xl font-black tracking-tight">
              FIXUP
            </span>
            <span className="block text-[10px] tracking-widest text-muted">
              ADHESIVES & BONDING SOLUTIONS
            </span>
          </span>
        </Link>
        <nav
          aria-label="Main navigation"
          className="flex flex-wrap items-center gap-4 text-sm font-medium sm:gap-6"
        >
          <Link href="/" className="hover:underline">
            Home
          </Link>
          {actor ? (
            <>
              <Link href="/account" className="hover:underline">
                My account
              </Link>
              {actor.permissions.includes("admin.access") && (
                <Link href="/admin" className="hover:underline">
                  Admin
                </Link>
              )}
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login">Sign in</Link>
              <Link href="/register" className="button">
                Create account <span aria-hidden="true">↗</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
