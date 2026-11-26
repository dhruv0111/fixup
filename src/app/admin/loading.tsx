export default function Loading() {
  return (
    <main
      id="main"
      className="container py-12"
      role="status"
      aria-live="polite"
    >
      <p className="text-muted">Loading…</p>
      <div
        aria-hidden="true"
        className="mt-6 h-40 animate-pulse rounded-xl bg-line motion-reduce:animate-none"
      />
    </main>
  );
}
