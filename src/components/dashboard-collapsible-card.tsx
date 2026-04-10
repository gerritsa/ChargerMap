"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { DashboardInfoButton } from "@/components/dashboard-info-button";
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
  headerAction?: ReactNode;
  infoContent?: string;
  infoAlign?: "left" | "right";
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
  headerAction,
  infoContent,
  infoAlign = "left",
}: DashboardCollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  return (
    <section
      id={id}
      className={cn(
        "glass-card group relative overflow-visible rounded-[28px] px-4 py-3.5 has-[article[data-info-open='true']]:z-40 md:px-5 md:py-4",
        isInfoOpen ? "z-40" : "z-0",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-500)]">
            {eyebrow}
          </p>
          <div className="mt-1 flex items-start gap-2">
            <h3 className="text-lg font-semibold tracking-tight text-[var(--ink-900)] md:text-xl">
              {title}
            </h3>
            {infoContent ? (
              <DashboardInfoButton
                label={title}
                content={infoContent}
                align={infoAlign}
                onOpenChange={setIsInfoOpen}
              />
            ) : null}
          </div>
          <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-[var(--ink-700)]">
            {description}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {headerAction}
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-white/76 px-3 py-1.5 text-xs font-medium text-[var(--ink-700)] transition-colors hover:bg-white"
            aria-expanded={isOpen}
            aria-controls={id ? `${id}-body` : undefined}
          >
            <span className="hidden sm:inline">{isOpen ? "Collapse" : "Expand"}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen ? "rotate-180" : "")} />
          </button>
        </div>
      </div>

      {isOpen ? (
        <div id={id ? `${id}-body` : undefined} className={cn("mt-3", bodyClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
