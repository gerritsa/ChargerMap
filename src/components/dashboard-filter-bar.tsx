"use client";

import { useMemo, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import type { DashboardFilterOptions, DashboardFilters } from "@/types/dashboard";

type DashboardFilterBarProps = {
  filters: DashboardFilters;
  options: DashboardFilterOptions;
};

export function DashboardFilterBar({
  filters,
  options,
}: DashboardFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const currentParams = useMemo(() => {
    const params = new URLSearchParams();

    if (filters.status !== "all") {
      params.set("status", filters.status);
    }

    if (filters.region !== "all") {
      params.set("region", filters.region);
    }

    if (filters.price !== "all") {
      params.set("price", filters.price);
    }

    if (filters.output !== "all") {
      params.set("output", filters.output);
    }

    return params;
  }, [filters]);

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
      <div className="flex flex-wrap items-end gap-3 xl:flex-nowrap">
        <div className="flex h-11 shrink-0 items-center gap-2 px-1 text-sm font-semibold text-[var(--ink-700)]">
          <SlidersHorizontal className="h-4 w-4 text-[var(--accent)]" />
          Filters
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2 xl:flex-nowrap">
          <FilterSelect
            label="Status"
            value={filters.status}
            options={options.status}
            onChange={(value) => updateFilter("status", value)}
            disabled={isPending}
          />
          <FilterSelect
            label="Region"
            value={filters.region}
            options={options.region}
            onChange={(value) => updateFilter("region", value)}
            disabled={isPending}
          />
          <FilterSelect
            label="Pricing"
            value={filters.price}
            options={options.price}
            onChange={(value) => updateFilter("price", value)}
            disabled={isPending}
          />
          <FilterSelect
            label="Output"
            value={filters.output}
            options={options.output}
            onChange={(value) => updateFilter("output", value)}
            disabled={isPending}
          />

          <button
            type="button"
            onClick={clearFilters}
            disabled={isPending}
            className="h-11 shrink-0 self-end rounded-[18px] border border-[var(--line-soft)] bg-white/78 px-4 text-sm font-semibold text-[var(--ink-700)] shadow-[0_8px_18px_rgba(27,38,46,0.06)] transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-70 xl:w-auto"
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
    <label className="min-w-[150px] flex-1">
      <span className="mb-1.5 block shrink-0 pl-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-500)]">
        {label}
      </span>
      <div className="relative flex h-11 items-center rounded-[18px] border border-[var(--line-soft)] bg-white/78 px-3 text-sm text-[var(--ink-700)] shadow-[0_8px_18px_rgba(27,38,46,0.06)]">
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
