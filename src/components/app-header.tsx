import Link from "next/link";

import { cn } from "@/lib/utils";

type AppHeaderProps = {
  current: "map" | "dashboard";
};

const navItems = [
  { href: "/", label: "Map", value: "map" },
  { href: "/dashboard", label: "Dashboard", value: "dashboard" },
];

export function AppHeader({ current }: AppHeaderProps) {
  return (
    <header className="glass-card sticky top-0 z-40 flex w-full items-center justify-between gap-4 rounded-none border-x-0 border-t-0 px-4 py-4 md:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-semibold text-white shadow-[0_18px_34px_rgba(14,124,102,0.28)]">
          SW
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--ink-500)]">
            Swtch Toronto
          </p>
          <h1 className="truncate text-lg font-semibold text-[var(--ink-900)] md:text-[1.4rem]">
            City of Toronto charger intelligence
          </h1>
        </div>
      </div>

      <nav
        className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--line-soft)] bg-white/85 p-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]"
        aria-label="Primary navigation"
      >
        {navItems.map((item) => {
          const isActive = item.value === current;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              style={isActive ? { color: "#ffffff" } : undefined}
              className={cn(
                "flex min-w-[120px] items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-colors md:min-w-[136px] md:text-base",
                isActive
                  ? "bg-[var(--ink-900)] !text-white shadow-[0_12px_24px_rgba(23,33,43,0.18)]"
                  : "text-[var(--ink-700)] hover:bg-white",
              )}
            >
              <span
                className={cn(isActive ? "!text-white" : "text-current")}
                style={isActive ? { color: "#ffffff" } : undefined}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
