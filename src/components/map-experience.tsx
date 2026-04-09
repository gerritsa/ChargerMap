"use client";

import { type ReactNode, useRef, useState } from "react";
import {
  BatteryCharging,
  ChevronDown,
  CircleDollarSign,
  Info,
  MapPinned,
} from "lucide-react";

import { ChargerDetailCard } from "@/components/charger-detail-card";
import { ChargerMap } from "@/components/charger-map";
import { cn, formatCompactNumber, formatMoney } from "@/lib/utils";
import type {
  Charger,
  ChargerMapMetrics,
  MapBounds,
  MapChargerSummary,
} from "@/types/charger";

type MapExperienceProps = {
  initialChargers: MapChargerSummary[];
  initialMetrics: ChargerMapMetrics;
  initialSelectedGroup?: Charger[];
  initialSelectedId?: string | null;
};

export function MapExperience({
  initialChargers,
  initialMetrics,
  initialSelectedGroup = [],
  initialSelectedId = null,
}: MapExperienceProps) {
  const [chargers, setChargers] = useState(initialChargers);
  const [selectedGroup, setSelectedGroup] = useState<Charger[]>(initialSelectedGroup);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [openInfoCard, setOpenInfoCard] = useState<string | null>(null);
  const viewportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportRequestRef = useRef(0);
  const selectionRequestRef = useRef(0);
  const selected =
    selectedGroup.find((charger) => charger.id === selectedId) ?? selectedGroup[0] ?? null;

  async function loadViewport(bounds: MapBounds) {
    const requestId = ++viewportRequestRef.current;
    const params = new URLSearchParams({
      west: bounds.west.toString(),
      south: bounds.south.toString(),
      east: bounds.east.toString(),
      north: bounds.north.toString(),
    });
    const response = await fetch(`/api/map/chargers?${params.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok || requestId !== viewportRequestRef.current) {
      return;
    }

    const payload = (await response.json()) as {
      summaries: MapChargerSummary[];
    };

    setChargers(payload.summaries);

    if (selectedId && !payload.summaries.some((charger) => charger.id === selectedId)) {
      handleClearSelection();
    }
  }

  function handleViewportChange(bounds: MapBounds) {
    if (viewportTimeoutRef.current) {
      clearTimeout(viewportTimeoutRef.current);
    }

    viewportTimeoutRef.current = setTimeout(() => {
      void loadViewport(bounds);
    }, 250);
  }

  async function handleSelectCharger(chargerId: string) {
    setSelectedId(chargerId);
    const requestId = ++selectionRequestRef.current;
    const response = await fetch(`/api/map/chargers/${chargerId}`, {
      cache: "no-store",
    });

    if (!response.ok || requestId !== selectionRequestRef.current) {
      return;
    }

    const payload = (await response.json()) as {
      chargers: Charger[];
      selectedId: string | null;
    };

    setSelectedGroup(payload.chargers);
    setSelectedId(payload.selectedId ?? chargerId);
  }

  function handleClearSelection() {
    setSelectedGroup([]);
    setSelectedId(null);
  }

  return (
    <div className="pb-0 pt-0">
      <section className="relative w-full">
        <ChargerMap
          chargers={chargers}
          selectedId={selectedId}
          selectedGroupSize={selectedGroup.length}
          onSelect={handleSelectCharger}
          onClearSelection={handleClearSelection}
          onViewportChange={handleViewportChange}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-30">
          <div className="pointer-events-auto px-3 pt-3 md:hidden">
            <button
              type="button"
              onClick={() =>
                setStatsExpanded((current) => {
                  if (current) {
                    setOpenInfoCard(null);
                  }

                  return !current;
                })
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--line-soft)] bg-[rgba(255,250,243,0.82)] px-4 py-2 text-sm font-semibold text-[var(--ink-700)] shadow-[0_10px_24px_rgba(27,38,46,0.1)]"
              aria-expanded={statsExpanded}
              aria-controls="map-stats-overlay"
            >
              {statsExpanded ? "Hide stats" : "Show stats"}
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  statsExpanded ? "rotate-180" : "",
                )}
              />
            </button>
          </div>

          <div
            id="map-stats-overlay"
            className={cn(
              "mt-2 gap-2 overflow-x-auto px-3 pb-1 md:mt-0 md:grid md:w-full md:grid-cols-[0.95fr_1.3fr_0.9fr_0.9fr] md:gap-1.5 md:overflow-visible md:px-3 md:pb-0 md:pt-1.5",
              statsExpanded ? "flex" : "hidden",
              "md:flex-none md:items-stretch",
              "md:grid",
            )}
          >
            <CompactMetricCard
              label="Toronto charger network"
              value={`${formatCompactNumber(initialMetrics.totalChargers)} chargers`}
              icon={<MapPinned className="h-5 w-5" />}
              className="w-[168px] shrink-0 md:w-auto"
            />
            <StatusOverviewCard
              metrics={initialMetrics}
              isInfoOpen={openInfoCard === "status-overview"}
              onToggleInfo={() =>
                setOpenInfoCard((current) =>
                  current === "status-overview" ? null : "status-overview",
                )
              }
              className="w-[250px] shrink-0 md:w-auto"
            />
            <CompactMetricCard
              label="Estimated energy sold"
              value={`${formatCompactNumber(initialMetrics.allTimeEstimatedKwh)} kWh`}
              icon={<BatteryCharging className="h-5 w-5" />}
              infoContent="Estimated per charging session as min(output kW × session hours, 45 kWh). The 45 kWh cap assumes a Tesla Model Y charging from 20% to 80% on a 75 kWh battery."
              infoId="estimated-energy"
              isInfoOpen={openInfoCard === "estimated-energy"}
              onToggleInfo={() =>
                setOpenInfoCard((current) =>
                  current === "estimated-energy" ? null : "estimated-energy",
                )
              }
              className="w-[180px] shrink-0 md:w-auto"
            />
            <CompactMetricCard
              label="Estimated revenue"
              value={formatMoney(initialMetrics.allTimeEstimatedRevenue)}
              icon={<CircleDollarSign className="h-5 w-5" />}
              infoContent="Derived from the parsed pricing model on each charger. Hourly chargers bill estimated charging time, kWh chargers bill estimated energy sold, and flat and guest fees are included when present. Idle fees are added after estimated charging completes and any parsed idle grace window has elapsed."
              infoId="estimated-revenue"
              isInfoOpen={openInfoCard === "estimated-revenue"}
              onToggleInfo={() =>
                setOpenInfoCard((current) =>
                  current === "estimated-revenue" ? null : "estimated-revenue",
                )
              }
              className="w-[180px] shrink-0 md:w-auto"
              popoverAlign="right"
            />
          </div>
        </div>

        {selected ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 top-auto z-40 md:inset-x-auto md:bottom-4 md:right-4 md:top-[5.4rem] md:w-[292px] lg:w-[304px]">
            <ChargerDetailCard
              charger={selected}
              chargersAtLocation={selectedGroup}
              onSelectCharger={setSelectedId}
              onClose={handleClearSelection}
              className="pointer-events-auto max-h-[calc(100dvh-7rem)] overflow-y-auto bg-[rgba(255,250,243,0.94)]"
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function CompactMetricCard({
  label,
  value,
  helper,
  icon,
  infoContent,
  infoId,
  isInfoOpen = false,
  onToggleInfo,
  className,
  popoverAlign = "left",
}: {
  label: string;
  value: string;
  helper?: string;
  icon: ReactNode;
  infoContent?: string;
  infoId?: string;
  isInfoOpen?: boolean;
  onToggleInfo?: () => void;
  className?: string;
  popoverAlign?: "left" | "right";
}) {
  return (
    <article
      className={cn(
        "glass-card pointer-events-auto relative overflow-visible rounded-[16px] bg-[rgba(255,250,243,0.76)] p-2.5 shadow-[0_8px_18px_rgba(27,38,46,0.08)]",
        isInfoOpen ? "z-50" : "z-10",
        className,
      )}
    >
      <div className="grid grid-cols-[1fr_auto] items-start gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-1.5">
            <p className="min-w-0 text-[11px] font-semibold leading-4 text-[var(--ink-500)] md:text-[12px]">
              {label}
            </p>
            {infoContent ? (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={onToggleInfo}
                  className={cn(
                    "flex h-4.5 w-4.5 items-center justify-center rounded-full border border-[var(--line-soft)] bg-white/90 text-[var(--accent)] transition-colors",
                    isInfoOpen ? "bg-[var(--accent-soft)]" : "",
                  )}
                  aria-label={`${label} calculation details`}
                  aria-expanded={isInfoOpen}
                  aria-controls={infoId ? `${infoId}-popover` : undefined}
                  title={`${label} calculation details`}
                >
                  <Info className="h-3 w-3" />
                </button>
                {isInfoOpen ? (
                  <div
                    id={infoId ? `${infoId}-popover` : undefined}
                    className={cn(
                      "absolute top-[calc(100%+10px)] z-[60] w-[min(320px,calc(100vw-4rem))] rounded-[18px] border border-[var(--line-soft)] bg-white p-3 text-xs leading-5 text-[var(--ink-700)] shadow-[0_18px_44px_rgba(27,38,46,0.18)]",
                      popoverAlign === "right" ? "right-0" : "left-0",
                    )}
                  >
                    {infoContent}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <p className="mt-1 text-[1.15rem] font-semibold tracking-tight text-[var(--ink-900)] md:text-[1.25rem]">
            {value}
          </p>
        </div>
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[10px] bg-white/92 text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--line-soft)] md:h-[1.625rem] md:w-[1.625rem]">
          {icon}
        </div>
      </div>
      {helper ? (
        <p className="mt-1 text-[10px] leading-4 text-[var(--ink-500)]">{helper}</p>
      ) : null}
    </article>
  );
}

function StatusOverviewCard({
  metrics,
  isInfoOpen = false,
  onToggleInfo,
  className,
}: {
  metrics: ChargerMapMetrics;
  isInfoOpen?: boolean;
  onToggleInfo?: () => void;
  className?: string;
}) {
  const unknownCount = Math.max(
    metrics.totalChargers -
      metrics.availableNow -
      metrics.currentlyOccupied -
      metrics.unavailableNow,
    0,
  );
  const statuses = [
    {
      key: "available",
      label: "Available",
      count: metrics.availableNow,
      color: getStatusColor("available"),
    },
    {
      key: "occupied",
      label: "Occupied",
      count: metrics.currentlyOccupied,
      color: getStatusColor("occupied"),
    },
    {
      key: "unavailable",
      label: "Unavailable",
      count: metrics.unavailableNow,
      color: getStatusColor("unavailable"),
    },
    {
      key: "unknown",
      label: "Unknown",
      count: unknownCount,
      color: getStatusColor("unknown"),
    },
  ].filter((status) => status.count > 0);

  return (
    <article
      className={cn(
        "glass-card pointer-events-auto relative overflow-visible rounded-[16px] bg-[rgba(255,250,243,0.76)] p-2.5 shadow-[0_8px_18px_rgba(27,38,46,0.08)]",
        isInfoOpen ? "z-50" : "z-10",
        className,
      )}
    >
      <div className="flex items-start gap-1.5">
        <p className="min-w-0 text-[11px] font-semibold text-[var(--ink-500)] md:text-[12px]">
          Status overview
        </p>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={onToggleInfo}
            className={cn(
              "flex h-4.5 w-4.5 items-center justify-center rounded-full border border-[var(--line-soft)] bg-white/90 text-[var(--accent)] transition-colors",
              isInfoOpen ? "bg-[var(--accent-soft)]" : "",
            )}
            aria-label="Status overview normalization details"
            aria-expanded={isInfoOpen}
            aria-controls="status-overview-popover"
            title="Status overview normalization details"
          >
            <Info className="h-3 w-3" />
          </button>
          {isInfoOpen ? (
            <div
              id="status-overview-popover"
              className="absolute left-0 top-[calc(100%+10px)] z-[60] w-[min(340px,calc(100vw-4rem))] rounded-[18px] border border-[var(--line-soft)] bg-white p-3 text-xs leading-5 text-[var(--ink-700)] shadow-[0_18px_44px_rgba(27,38,46,0.18)]"
            >
              Raw SWTCH statuses are grouped into four normalized buckets for the
              map summary. <strong>Occupied</strong> includes statuses like
              Charging, Activating, Preparing, Finishing, and SuspendedEV.
              <strong> Unavailable</strong> includes statuses like Under Repair,
              Offline, Faulted, and Out of Service. <strong>Available</strong>{" "}
              includes Available, Ready, and Open. Anything unmapped is shown as
              <strong> Unknown</strong>.
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs font-medium text-[var(--ink-700)]">
        {statuses.map((status) => (
          <StatusDot
            key={status.key}
            label={`${status.label} ${formatCompactNumber(status.count)}`}
            color={status.color}
          />
        ))}
      </div>
    </article>
  );
}

function StatusDot({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/82 px-2 py-1">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function getStatusColor(status: Charger["statusNormalized"]) {
  switch (status) {
    case "available":
      return "#79b963";
    case "occupied":
      return "#2f8ec9";
    case "unavailable":
      return "#c95d46";
    default:
      return "#8b95a1";
  }
}
