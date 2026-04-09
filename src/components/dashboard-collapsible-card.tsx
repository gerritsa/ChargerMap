import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type DashboardCollapsibleCardProps = {
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  defaultOpen?: boolean;
};

export function DashboardCollapsibleCard({
  id,
  eyebrow,
  title,
  description,
  children,
  className,
  bodyClassName,
  defaultOpen = true,
}: DashboardCollapsibleCardProps) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className={cn(
        "glass-card group rounded-[28px] px-4 py-3.5 md:px-5 md:py-4",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-500)]">
            {eyebrow}
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-[var(--ink-900)] md:text-xl">
            {title}
          </h3>
          <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-[var(--ink-700)]">
            {description}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 rounded-full border border-[var(--line-soft)] bg-white/76 px-3 py-1.5 text-xs font-medium text-[var(--ink-700)]">
          <span className="hidden sm:inline group-open:hidden">Expand</span>
          <span className="hidden sm:group-open:inline">Collapse</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div className={cn("mt-3", bodyClassName)}>{children}</div>
    </details>
  );
}
