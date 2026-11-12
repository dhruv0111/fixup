import type { ReactNode } from "react";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main
      id="main"
      className="mx-auto grid min-h-[70vh] max-w-5xl items-center gap-12 px-5 py-14 md:grid-cols-2 md:px-8"
    >
      <div>
        <p className="eyebrow mb-5">WELCOME TO FIXUP</p>
        <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-sm leading-7 text-muted">{description}</p>
        <div
          aria-hidden="true"
          className="mt-9 h-1 w-16 rounded-full bg-brand"
        />
      </div>
      <section
        aria-label={title}
        className="rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-9"
      >
        {children}
      </section>
    </main>
  );
}
