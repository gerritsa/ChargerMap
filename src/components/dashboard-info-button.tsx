"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

type DashboardInfoButtonProps = {
  label: string;
  content: string;
  align?: "left" | "right";
};

export function DashboardInfoButton({
  label,
  content,
  align = "left",
}: DashboardInfoButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full border border-[var(--line-soft)] bg-white/90 text-[var(--accent)] transition-colors",
          isOpen ? "bg-[var(--accent-soft)]" : "",
        )}
        aria-label={`${label} details`}
        aria-expanded={isOpen}
      >
        <Info className="h-3 w-3" />
      </button>

      {isOpen ? (
        <div
          className={cn(
            "absolute top-[calc(100%+10px)] z-[70] w-[min(320px,calc(100vw-3rem))] rounded-[18px] border border-[var(--line-soft)] bg-white p-3 text-xs leading-5 text-[var(--ink-700)] shadow-[0_18px_44px_rgba(27,38,46,0.18)]",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {content}
        </div>
      ) : null}
    </div>
  );
}
