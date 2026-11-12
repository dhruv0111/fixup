import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto min-h-[60vh] max-w-3xl px-5 py-20">
      <p className="eyebrow">404 / PAGE NOT FOUND</p>
      <h1 className="mt-4 text-4xl font-semibold">This page isn’t here.</h1>
      <p className="my-5 text-muted">
        Check the address or head back to FIXUP.
      </p>
      <Link href="/" className="button">
        Back to home
      </Link>
    </main>
  );
}
