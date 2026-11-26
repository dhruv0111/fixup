import type { ReactNode } from "react";
import type { Step, Tone } from "./status";

export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`status-badge status-${tone}`}>{label}</span>;
}

export function Card({
  title,
  action,
  children,
  id,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="o-card" aria-label={title}>
      <header className="o-card-head">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Facts({
  items,
}: {
  items: [string, ReactNode | null | undefined | false][];
}) {
  const shown = items.filter(([, v]) => v !== "" && v != null && v !== false);
  if (!shown.length) return null;
  return (
    <dl className="o-facts">
      {shown.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const mark = { done: "✓", current: "●", problem: "!", upcoming: "" } as const;
export function ProgressTimeline({ steps }: { steps: Step[] }) {
  const fmt = (v: string) =>
    new Date(v).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });
  return (
    <ol className="o-steps" aria-label="Order progress">
      {steps.map((s) => (
        <li
          key={s.key}
          className={`o-step o-step-${s.state}`}
          aria-current={s.state === "current" ? "step" : undefined}
        >
          <span className="o-step-dot" aria-hidden="true">
            {mark[s.state]}
          </span>
          <span className="o-step-text">
            <strong>{s.label}</strong>
            {s.at && <time dateTime={s.at}>{fmt(s.at)}</time>}
            {s.detail && <small>{s.detail}</small>}
            <span className="sr-only">
              {s.state === "done"
                ? " (completed)"
                : s.state === "current"
                  ? " (current step)"
                  : s.state === "problem"
                    ? " (needs attention)"
                    : " (upcoming)"}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
