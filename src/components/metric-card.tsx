import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
};

export function MetricCard({ label, value, helper, icon }: MetricCardProps) {
  return (
    <article className="glass-card rounded-[26px] p-5">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--ink-500)]">{label}</p>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--line-soft)]">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-3xl font-semibold tracking-tight text-[var(--ink-900)]">
          {value}
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-500)]">{helper}</p>
      </div>
    </article>
  );
}
