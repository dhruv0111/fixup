import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getActor } from "@/server/permissions/service";
import { SignOutButton } from "@/components/forms/session-actions";

export const metadata = { title: "My account" };
export default async function AccountPage() {
  const actor = await getActor(await headers());
  if (!actor) redirect("/login");
  return (
    <main
      id="main"
      className="mx-auto min-h-[70vh] max-w-5xl px-5 py-12 sm:px-8"
    >
      <p className="eyebrow">YOUR FIXUP</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">My account</h1>
      <p className="mt-3 text-muted">Welcome, {actor.name}.</p>
      <nav
        aria-label="Account management"
        className="mt-6 flex flex-wrap gap-3"
      >
        <Link className="button button-secondary" href="/account/profile">
          Edit profile
        </Link>
        <Link className="button button-secondary" href="/account/addresses">
          Delivery addresses
        </Link>
        <Link className="button button-secondary" href="/account/dealer">
          Dealer application
        </Link>
        <Link className="button button-secondary" href="/account/cart">
          Shopping cart
        </Link>
        <Link className="button button-secondary" href="/account/orders">
          Order history
        </Link>
      </nav>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-7">
          <h2 className="text-lg font-semibold">Your profile</h2>
          <dl className="mt-6 space-y-5">
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted">
                Name
              </dt>
              <dd className="mt-1">{actor.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted">
                Email
              </dt>
              <dd className="mt-1 break-all">{actor.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted">
                Account access
              </dt>
              <dd className="mt-1">
                {actor.role.replaceAll("_", " ").toLowerCase()}
                {actor.customer?.dealer && (
                  <span className="ml-2 text-sm text-muted">
                    · Dealer {actor.customer.dealer.status.toLowerCase()}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </section>
        <section className="rounded-2xl border border-line bg-white p-7">
          <h2 className="text-lg font-semibold">Account security</h2>
          <p className="mb-6 mt-3 text-sm leading-6 text-muted">
            Using a shared device? Sign out when you’re finished. You can also
            end your sessions on every device.
          </p>
          <SignOutButton all />
        </section>
      </div>
      <p className="mt-7 text-sm text-muted">
        <Link href="/products" className="text-link">
          Explore the product catalogue →
        </Link>
      </p>
    </main>
  );
}
