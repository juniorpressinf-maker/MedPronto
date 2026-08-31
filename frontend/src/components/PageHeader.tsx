import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <header className="page-header flex flex-wrap items-start justify-between gap-4 px-6 py-5 shrink-0">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text)]">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
