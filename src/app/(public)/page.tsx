import Link from "next/link";

export default function HomePage() {
  return (
    <main id="main">
      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <p className="eyebrow mb-7">A NEW CONNECTION STARTS HERE</p>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.08] tracking-[-.045em] sm:text-6xl lg:text-7xl">
            Welcome to
            <br />
            your <span className="text-brand">FIXUP.</span>
          </h1>
          <p className="mt-7 max-w-md text-lg leading-8 text-muted">
            Adhesives & bonding solutions.
            <br />
            An online home for our customers, retailers and business partners.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/register" className="button">
              Create your account <span aria-hidden="true">↗</span>
            </Link>
            <Link href="/login" className="button button-secondary">
              Sign in
            </Link>
          </div>
          <p className="mt-6 text-xs text-muted">
            Our catalogue is being prepared. Product details will follow.
          </p>
        </div>
        <div
          aria-hidden="true"
          className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-[2rem] bg-[#e5ebdb] sm:min-h-[420px]"
        >
          <div className="absolute -right-16 -top-16 size-72 rounded-full border border-[#c3d1b5]" />
          <div className="absolute -bottom-28 -left-14 size-80 rounded-full border border-[#c3d1b5]" />
          <div className="absolute left-10 top-10 font-mono text-xs tracking-widest text-[#5e7655]">
            FIXUP / CONNECTIONS
          </div>
          <div className="flex -rotate-12 items-center">
            <div className="h-44 w-28 rounded-[4rem] border-[28px] border-[#295c47] sm:h-52 sm:w-36" />
            <div className="-ml-8 h-44 w-28 rounded-[4rem] border-[28px] border-[#b6cc78] sm:h-52 sm:w-36" />
          </div>
          <p className="absolute bottom-9 left-10 text-xs font-semibold tracking-widest text-[#476040]">
            LET’S BUILD THE CONNECTION.
          </p>
        </div>
      </section>
      <section
        aria-label="Getting started"
        className="mx-auto grid max-w-6xl gap-6 border-t border-line px-5 py-10 sm:grid-cols-3 sm:px-8"
      >
        {[
          ["01", "Your own account", "One place to keep your FIXUP profile."],
          [
            "02",
            "For business partners",
            "A foundation for our retailer and dealer community.",
          ],
          [
            "03",
            "More to come",
            "Product information and ordering will arrive in a later release.",
          ],
        ].map(([number, title, text]) => (
          <div key={number}>
            <span className="text-xs font-semibold text-muted">{number} /</span>
            <h2 className="mt-3 text-lg font-semibold">{title}</h2>
            <p className="mt-2 max-w-xs text-sm leading-6 text-muted">{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
