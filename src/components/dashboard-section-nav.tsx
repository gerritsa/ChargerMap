"use client";

import { useEffect } from "react";

type DashboardSectionNavProps = {
  items: Array<{
    href: string;
    label: string;
  }>;
};

export function DashboardSectionNav({ items }: DashboardSectionNavProps) {
  useEffect(() => {
    function openHashedSection() {
      const hash = window.location.hash.replace("#", "");

      if (!hash) {
        return;
      }

      const target = document.getElementById(hash);

      if (target instanceof HTMLDetailsElement) {
        target.open = true;
      }
    }

    openHashedSection();
    window.addEventListener("hashchange", openHashedSection);

    return () => {
      window.removeEventListener("hashchange", openHashedSection);
    };
  }, []);

  function handleClick(href: string) {
    const hash = href.replace("#", "");
    const target = document.getElementById(hash);

    if (target instanceof HTMLDetailsElement) {
      target.open = true;
    }

    requestAnimationFrame(() => {
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", href);
    });
  }

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Overview sections">
      <span className="mr-2 text-sm font-medium text-[var(--ink-600)]">
        On this page:
      </span>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          onClick={(event) => {
            event.preventDefault();
            handleClick(item.href);
          }}
          className="rounded-full border border-[var(--line-soft)] bg-white/60 px-3 py-1.5 text-sm font-medium text-[var(--ink-600)] transition-colors hover:bg-white hover:text-[var(--ink-900)]"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
