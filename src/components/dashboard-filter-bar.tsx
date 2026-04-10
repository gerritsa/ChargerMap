"use client";

import { useMemo, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

import type {
  DashboardFilterOptions,
  DashboardFilters,
  DashboardVisibleFilter,
} from "@/types/dashboard";

type DashboardFilterBarProps = {
  filters: DashboardFilters;
  options: DashboardFilterOptions;
  visibleFilters?: DashboardVisibleFilter[];
  filterLabels?: Partial<Record<DashboardVisibleFilter, string>>;
};

export function DashboardFilterBar({
  filters,
  options,
  visibleFilters = ["status", "price", "output"],
  filterLabels,
}: DashboardFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const currentParams = useMemo(() => {
    const params = new URLSearchParams();

    if (visibleFilters.includes("status") && filters.status !== "all") {
      params.set("status", filters.status);
    }

    if (visibleFilters.includes("rawStatus") && filters.rawStatus !== "all") {
      params.set("rawStatus", filters.rawStatus);
    }

    if (visibleFilters.includes("price") && filters.price !== "all") {
      params.set("price", filters.price);
    }

    if (visibleFilters.includes("output") && filters.output !== "all") {
      params.set("output", filters.output);
    }

    return params;
  }, [filters, visibleFilters]);

  function updateFilter(name: keyof DashboardFilters, value: string) {
    const params = new URLSearchParams(currentParams.toString());

    if (value === "all") {
      params.delete(name);
    } else {
      params.set(name, value);
    }

    const query = params.toString();
    const hash = typeof window === "undefined" ? "" : window.location.hash;

    startTransition(() => {
      router.replace(`${pathname}${query ? `?${query}` : ""}${hash}`);
    });
  }

  function clearFilters() {
    const hash = typeof window === "undefined" ? "" : window.location.hash;

    startTransition(() => {
      router.replace(`${pathname}${hash}`);
    });
  }

  return (
    <section className="sticky top-[5.35rem] z-30">
      <div className="flex flex-col gap-2">
        <p className="pl-1 text-sm font-medium text-[var(--ink-600)]">
          Show only:
        </p>
        <div className="flex min-w-0 flex-wrap items-end gap-2 xl:flex-nowrap">
          {visibleFilters.map((filterName) => {
            if (filterName === "status") {
              return (
                <FilterSelect
                  key={filterName}
                  label={filterLabels?.status ?? "Status"}
                  value={filters.status}
                  options={options.status}
                  onChange={(value) => updateFilter("status", value)}
                  disabled={isPending}
                />
              );
            }

            if (filterName === "rawStatus") {
              return (
                <FilterSelect
                  key={filterName}
                  label={filterLabels?.rawStatus ?? "Status"}
                  value={filters.rawStatus}
                  options={options.rawStatus}
                  onChange={(value) => updateFilter("rawStatus", value)}
                  disabled={isPending}
                />
              );
            }

            if (filterName === "price") {
              return (
                <FilterSelect
                  key={filterName}
                  label={filterLabels?.price ?? "Pricing"}
                  value={filters.price}
                  options={options.price}
                  onChange={(value) => updateFilter("price", value)}
                  disabled={isPending}
                />
              );
            }

            return (
              <FilterSelect
                key={filterName}
                label={filterLabels?.output ?? "Output"}
                value={filters.output}
                options={options.output}
                onChange={(value) => updateFilter("output", value)}
                disabled={isPending}
              />
            );
          })}

          <button
            type="button"
            onClick={clearFilters}
            disabled={isPending}
            className="h-10 shrink-0 self-end px-2 text-sm font-semibold text-[var(--ink-600)] transition-colors hover:text-[var(--ink-900)] disabled:cursor-wait disabled:opacity-70 xl:w-auto"
          >
            Clear filters
          </button>
        </div>
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: DashboardFilterOptions[keyof DashboardFilterOptions];
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="min-w-[170px] flex-1">
      <span className="mb-1.5 block shrink-0 pl-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-500)]">
        {label}
      </span>
      <div className="relative flex h-10 items-center rounded-[16px] border border-[var(--line-soft)] bg-white/78 px-3 text-sm text-[var(--ink-700)] shadow-[0_6px_14px_rgba(27,38,46,0.05)]">
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="block min-w-0 flex-1 appearance-none bg-transparent pr-6 text-sm font-semibold text-[var(--ink-900)] outline-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-500)]" />
      </div>
    </label>
  );
}
