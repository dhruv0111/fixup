export default function Loading() {
  return (
    <main
      id="main"
      className="mx-auto min-h-[60vh] max-w-5xl px-5 py-16"
      role="status"
      aria-live="polite"
    >
      <p className="text-muted">Loading FIXUP…</p>
      <div
        aria-hidden="true"
        className="mt-6 h-40 animate-pulse rounded-xl bg-line motion-reduce:animate-none"
      />
    </main>
  );
}
