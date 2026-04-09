import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { getStatusStaleMessage } from "@/lib/status-freshness";

type StatusStaleNoticeProps = {
  lastCheckedAt: string;
  className?: string;
  variant?: "default" | "compact";
};

export function StatusStaleNotice({
  lastCheckedAt,
  className,
  variant = "default",
}: StatusStaleNoticeProps) {
  return (
    <div
      className={cn(
        variant === "default" &&
          "flex items-start gap-2 rounded-[18px] border border-[rgba(198,162,75,0.35)] bg-[rgba(198,162,75,0.12)] px-3 py-2 text-sm text-[var(--ink-700)]",
        variant === "compact" &&
          "inline-flex items-center gap-1.5 rounded-full border border-[rgba(198,162,75,0.3)] bg-[rgba(198,162,75,0.1)] px-2.5 py-1 text-[11px] font-medium leading-4 text-[var(--ink-700)]",
        className,
      )}
    >
      <AlertTriangle
        className={cn(
          "shrink-0 text-[#a57c1b]",
          variant === "default" && "mt-0.5 h-4 w-4",
          variant === "compact" && "h-3.5 w-3.5",
        )}
      />
      <p>{getStatusStaleMessage(lastCheckedAt)}</p>
    </div>
  );
}
