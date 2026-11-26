import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="container py-16">
      <p className="eyebrow">404 / NOT FOUND</p>
      <h1 className="mt-3 text-3xl font-semibold">
        This admin page isn’t here.
      </h1>
      <Link href="/admin" className="button mt-6">
        Back to dashboard
      </Link>
    </main>
  );
}
