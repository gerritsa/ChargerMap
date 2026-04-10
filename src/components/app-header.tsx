"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type PrimaryNavValue = "map" | "dashboard";
type DashboardSectionValue = "overview" | "reliability" | "occupancy" | "revenue";

const primaryNavItems = [
  { href: "/", label: "Map", value: "map" as const },
  { href: "/dashboard", label: "Analytics", value: "dashboard" as const },
];

const analyticsNavItems = [
  { href: "/dashboard", label: "Overview", value: "overview" as const },
  { href: "/dashboard/reliability", label: "Reliability", value: "reliability" as const },
  { href: "/dashboard/occupancy", label: "Occupancy", value: "occupancy" as const },
  { href: "/dashboard/expected-revenue", label: "Revenue", value: "revenue" as const },
];

type AppHeaderProps = {
  trackingStartedAtLabel?: string | null;
};

export function AppHeader(props: AppHeaderProps = {}) {
  return <AppHeaderContent {...props} />;
}

export function AppHeaderContent({ trackingStartedAtLabel = null }: AppHeaderProps = {}) {
  const pathname = usePathname();
  const primaryCurrent = getPrimaryCurrent(pathname);
  const dashboardSection = getDashboardSection(pathname);
  const showAnalyticsNav = pathname.startsWith("/dashboard");

  return (
    <header className="glass-card sticky top-0 z-40 rounded-none border-x-0 border-t-0 px-4 py-3 md:px-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center md:h-11 md:w-11">
              <Image
                src="/ev-logo.png"
                alt="Green P EV charging logo"
                width={48}
                height={48}
                className="h-full w-full object-contain"
              />
            </div>

            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ink-500)]">
                ChargerMap
              </p>
              <h1 className="mt-1 text-[0.95rem] font-semibold text-[var(--ink-900)] md:text-[1.45rem]">
                City of Toronto charging analytics POC
              </h1>
              {trackingStartedAtLabel ? (
                <p className="mt-1 text-xs text-[var(--ink-600)] md:text-sm">
                  Tracking since {trackingStartedAtLabel}
                </p>
              ) : null}
            </div>
          </div>

          <nav className="flex items-center gap-5" aria-label="Primary navigation">
            {primaryNavItems.map((item) => {
              const isActive = item.value === primaryCurrent;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative text-sm font-semibold transition-colors",
                    isActive ? "text-[var(--ink-900)]" : "text-[var(--ink-600)] hover:text-[var(--ink-900)]",
                  )}
                >
                  <span>{item.label}</span>
                  <span
                    className={cn(
                      "absolute inset-x-0 -bottom-1 h-0.5 rounded-full transition-opacity",
                      isActive ? "bg-[var(--accent)] opacity-100" : "bg-transparent opacity-0",
                    )}
                  />
                </Link>
              );
            })}
          </nav>
        </div>

        {showAnalyticsNav ? (
          <nav
            className="flex min-w-0 items-center gap-2 overflow-x-auto border-t border-[var(--line-soft)]/70 pt-2"
            aria-label="Analytics navigation"
          >
            <span className="shrink-0 text-sm font-medium text-[var(--ink-600)]">
              Analytics:
            </span>
            {analyticsNavItems.map((item) => {
              const isActive = item.value === dashboardSection;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-900)]"
                      : "border-[var(--line-soft)] bg-white/58 text-[var(--ink-600)] hover:bg-white hover:text-[var(--ink-900)]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </header>
  );
}

function getPrimaryCurrent(pathname: string): PrimaryNavValue {
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/chargers/")) {
    return "dashboard";
  }

  return "map";
}

function getDashboardSection(pathname: string): DashboardSectionValue {
  if (pathname.startsWith("/dashboard/reliability")) {
    return "reliability";
  }

  if (pathname.startsWith("/dashboard/occupancy")) {
    return "occupancy";
  }

  if (pathname.startsWith("/dashboard/expected-revenue")) {
    return "revenue";
  }

  return "overview";
}
