import type { ChargerStatusNormalized } from "@/types/charger";

import { cn } from "@/lib/utils";

type StatusPillProps = {
  statusText: string;
  statusNormalized: ChargerStatusNormalized;
};

export function StatusPill({
  statusText,
  statusNormalized,
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "pill whitespace-nowrap",
        statusNormalized === "available" && "status-available",
        statusNormalized === "occupied" && "status-occupied",
        statusNormalized === "unavailable" && "status-unavailable",
        statusNormalized === "unknown" && "status-unknown",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {statusText}
    </span>
  );
}
