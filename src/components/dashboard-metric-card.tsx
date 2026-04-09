import type { ReactNode } from "react";

import { DashboardInfoButton } from "@/components/dashboard-info-button";
import { cn } from "@/lib/utils";

type DashboardMetricCardProps = {
  eyebrow: string;
  label: string;
  value: string;
  helper?: string;
  icon: ReactNode;
  info?: string;
  infoAlign?: "left" | "right";
  className?: string;
  compact?: boolean;
};

export function DashboardMetricCard({
  eyebrow,
  label,
  value,
  helper,
  icon,
  info,
  infoAlign = "left",
  className,
  compact = false,
}: DashboardMetricCardProps) {
  return (
    <article
      className={cn(
        compact
          ? "glass-card min-w-0 rounded-[22px] bg-[rgba(255,250,243,0.82)] p-3.5"
          : "glass-card min-w-0 rounded-[26px] bg-[rgba(255,250,243,0.82)] p-4 md:p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "font-mono uppercase text-[var(--ink-500)]",
              compact ? "text-[9px] tracking-[0.16em]" : "text-[11px] tracking-[0.22em]",
            )}
          >
            {eyebrow}
          </p>
          <div className="mt-2 flex items-start gap-2">
            <div>
              <p
                className={cn(
                  "font-medium text-[var(--ink-700)]",
                  compact ? "text-[12px]" : "text-sm",
                )}
              >
                {label}
              </p>
              <p
                className={cn(
                  "mt-1.5 font-semibold tracking-tight text-[var(--ink-900)]",
                  compact ? "text-[1.35rem]" : "text-[1.8rem] md:text-3xl",
                )}
              >
                {value}
              </p>
            </div>
            {info ? (
              <DashboardInfoButton
                label={label}
                content={info}
                align={infoAlign}
              />
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "flex shrink-0 items-center justify-center bg-white/90 text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--line-soft)]",
            compact ? "h-9 w-9 rounded-[16px]" : "h-11 w-11 rounded-2xl",
          )}
        >
          {icon}
        </div>
      </div>

      {helper ? (
        <p
          className={cn(
            "text-[var(--ink-500)]",
            compact ? "mt-2 text-[11px] leading-5" : "mt-3 text-sm leading-6",
          )}
        >
          {helper}
        </p>
      ) : null}
    </article>
  );
}
