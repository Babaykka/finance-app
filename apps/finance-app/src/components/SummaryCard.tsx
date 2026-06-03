import type { ReactNode } from "react";

export function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  tone = "neutral"
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon?: ReactNode;
  tone?: "neutral" | "cash" | "crypto" | "warn";
}) {
  return (
    <section className={`summary-card summary-${tone}`}>
      <div className="summary-row">
        <span className="summary-title">{title}</span>
        {icon ? (
          <span className="summary-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <div className="metric">{value}</div>
      {subtitle ? <div className="muted">{subtitle}</div> : null}
    </section>
  );
}
