"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="mx-auto min-h-[60vh] max-w-3xl px-5 py-20">
      <p className="eyebrow">PLEASE TRY AGAIN</p>
      <h1 className="mt-4 text-3xl font-semibold">Something went wrong.</h1>
      <p className="my-5 text-muted">
        We couldn’t load this page. Please try again in a moment.
      </p>
      <button type="button" onClick={reset} className="button">
        Try again
      </button>
    </main>
  );
}
