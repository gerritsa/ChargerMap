"use client";

import { type ReactNode, useMemo, useRef, useState } from "react";
import {
  BatteryCharging,
  ChevronDown,
  CircleDollarSign,
  Info,
  MapPinned,
  TimerReset,
  X,
} from "lucide-react";

import { ChargerDetailCard } from "@/components/charger-detail-card";
import { ChargerMap } from "@/components/charger-map";
import { StatusPill } from "@/components/status-pill";
import { cn, formatCompactNumber, formatEnergyVolume, formatMoney } from "@/lib/utils";
import type {
  Charger,
  ChargerMapMetrics,
  MapBounds,
  MapChargerSummary,
} from "@/types/charger";

const STATUS_FILTERS: Charger["statusNormalized"][] = [
  "available",
  "occupied",
  "unavailable",
  "not_live",
  "unknown",
];

type MapExperienceProps = {
  initialChargers: MapChargerSummary[];
  initialMetrics: ChargerMapMetrics;
  initialSelectedGroup?: Charger[];
  initialSelectedId?: string | null;
  trackingStartedAtLabel?: string | null;
};

export function MapExperience({
  initialChargers,
  initialMetrics,
  initialSelectedGroup = [],
  initialSelectedId = null,
  trackingStartedAtLabel = null,
}: MapExperienceProps) {
  const [allChargers, setAllChargers] = useState(initialChargers);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [selectedGroup, setSelectedGroup] = useState<Charger[]>(initialSelectedGroup);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [selectionView, setSelectionView] = useState<"list" | "details">(
    initialSelectedGroup.length > 1 && !initialSelectedId ? "list" : "details",
  );
  const [selectedStatuses, setSelectedStatuses] =
    useState<Charger["statusNormalized"][]>(STATUS_FILTERS);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [openInfoCard, setOpenInfoCard] = useState<string | null>(null);
  const viewportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportRequestRef = useRef(0);
  const selectionRequestRef = useRef(0);
  const selected =
    selectedGroup.find((charger) => charger.id === selectedId) ?? selectedGroup[0] ?? null;
  const hasSelectionSheet = selected != null;
  const visibleChargers = useMemo(
    () =>
      allChargers.filter((charger) =>
        selectedStatuses.includes(charger.statusNormalized),
      ),
    [allChargers, selectedStatuses],
  );
  const isFiltered = selectedStatuses.length !== STATUS_FILTERS.length;

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
      metrics: ChargerMapMetrics;
    };

    setAllChargers(payload.summaries);
    setMetrics(payload.metrics);

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
    setSelectionView(payload.chargers.length > 1 ? "list" : "details");
  }

  function handleClearSelection() {
    setSelectedGroup([]);
    setSelectedId(null);
    setSelectionView("details");
  }

  function handleShowChargerDetails(chargerId: string) {
    setSelectedId(chargerId);
    setSelectionView("details");
  }

  function handleBackToList() {
    if (selectedGroup.length > 1) {
      setSelectionView("list");
    }
  }

  function handleToggleStatus(status: Charger["statusNormalized"]) {
    let nextStatuses = STATUS_FILTERS;

    setSelectedStatuses((current) => {
      const isSelected = current.includes(status);
      nextStatuses = isSelected
        ? current.length === 1
          ? STATUS_FILTERS
          : current.filter((value) => value !== status)
        : STATUS_FILTERS.filter((value) => value === status || current.includes(value));
      return nextStatuses;
    });

    if (selected && !nextStatuses.includes(selected.statusNormalized)) {
      handleClearSelection();
    }
  }

  function handleResetStatuses() {
    setSelectedStatuses(STATUS_FILTERS);
  }

  return (
    <div className="pb-0 pt-0">
      <section className="relative w-full">
        <ChargerMap
          chargers={visibleChargers}
          selectedId={selectedId}
          selectedGroupSize={selectedGroup.length}
          onSelect={handleSelectCharger}
          onClearSelection={handleClearSelection}
          onViewportChange={handleViewportChange}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-30">
          <div
            className={cn(
              "pointer-events-auto px-3 pt-3 md:hidden",
              hasSelectionSheet ? "md:pr-[320px] lg:pr-[336px]" : "",
            )}
          >
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
              "mt-2 gap-2 overflow-x-auto px-3 pb-1 md:mt-0 md:grid md:w-full md:grid-cols-[0.95fr_1.3fr_0.9fr_0.9fr_1fr] md:gap-1.5 md:overflow-visible md:px-3 md:pb-0 md:pt-1.5",
              statsExpanded ? "flex" : "hidden",
              "md:flex-none md:items-stretch",
              "md:grid",
              hasSelectionSheet ? "md:pr-[320px] lg:pr-[336px]" : "",
            )}
          >
            <CompactMetricCard
              label="Toronto tracked chargers"
              value={`${formatCompactNumber(metrics.totalChargers)} chargers`}
              helper={
                isFiltered
                  ? `${formatCompactNumber(visibleChargers.length)} markers currently shown on the map.`
                  : undefined
              }
              icon={<MapPinned className="h-5 w-5" />}
              className="w-[168px] shrink-0 md:w-auto"
            />
            <StatusOverviewCard
              metrics={metrics}
              selectedStatuses={selectedStatuses}
              isInfoOpen={openInfoCard === "status-overview"}
              onToggleInfo={() =>
                setOpenInfoCard((current) =>
                  current === "status-overview" ? null : "status-overview",
                )
              }
              onToggleStatus={handleToggleStatus}
              onResetStatuses={handleResetStatuses}
              className="w-[250px] shrink-0 md:w-auto"
            />
            <CompactMetricCard
              label="Estimated energy sold"
              value={formatEnergyVolume(metrics.allTimeEstimatedKwh)}
              helper={`Last 24hr volume: ${formatEnergyVolume(metrics.last24HoursEstimatedKwh)}`}
              icon={<BatteryCharging className="h-5 w-5" />}
              infoContent={
                <ul className="space-y-1 pl-4 marker:text-[var(--ink-500)]">
                  <li>
                    Estimated per tracked session using energy-active occupied
                    time, a 5 minute buffer, and an output-based power factor
                    before applying the 45 kWh cap.
                  </li>
                  <li>
                    Suspended EV and suspended EVSE intervals keep the session
                    alive but add 0 kWh.
                  </li>
                </ul>
              }
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
              value={formatMoney(metrics.allTimeEstimatedRevenue)}
              icon={<CircleDollarSign className="h-5 w-5" />}
              infoContent={
                <ul className="space-y-1 pl-4 marker:text-[var(--ink-500)]">
                  <li>Derived from the parsed pricing model on each charger.</li>
                  <li>
                    kWh chargers bill estimated energy sold, while time-priced
                    chargers still bill by occupied session time.
                  </li>
                  <li>Flat and guest fees are included when present.</li>
                  <li>
                    Idle fees are added after estimated charging completes and
                    any parsed idle grace window has elapsed.
                  </li>
                </ul>
              }
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
            <CompactMetricCard
              label="Tracking started"
              value={trackingStartedAtLabel ?? "Not set"}
              helper={trackingStartedAtLabel ? "Toronto time" : "Tracking start not available"}
              icon={<TimerReset className="h-5 w-5" />}
              className="w-[190px] shrink-0 md:w-auto"
            />
          </div>
        </div>

        {selected ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 top-auto z-40 md:inset-x-auto md:bottom-0 md:right-0 md:top-0 md:w-[320px] lg:w-[336px]">
            {selectedGroup.length > 1 && selectionView === "list" ? (
              <ChargerLocationListCard
                chargers={selectedGroup}
                selectedId={selectedId}
                onSelectCharger={handleShowChargerDetails}
                onClose={handleClearSelection}
                className="pointer-events-auto max-h-[calc(100dvh-7rem)] bg-[rgba(255,250,243,0.94)] md:h-full md:max-h-none md:rounded-none md:rounded-l-[22px] md:border-y-0 md:border-r-0 md:bg-[rgba(255,250,243,0.98)] md:shadow-[-18px_0_40px_rgba(27,38,46,0.12)]"
              />
            ) : (
              <ChargerDetailCard
                charger={selected}
                chargersAtLocation={selectedGroup}
                onBackToLocationList={
                  selectedGroup.length > 1 ? handleBackToList : undefined
                }
                onClose={handleClearSelection}
                className="pointer-events-auto max-h-[calc(100dvh-7rem)] overflow-y-auto bg-[rgba(255,250,243,0.94)] md:h-full md:max-h-none md:rounded-none md:rounded-l-[22px] md:border-y-0 md:border-r-0 md:bg-[rgba(255,250,243,0.98)] md:shadow-[-18px_0_40px_rgba(27,38,46,0.12)]"
              />
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ChargerLocationListCard({
  chargers,
  selectedId,
  onSelectCharger,
  onClose,
  className,
}: {
  chargers: Charger[];
  selectedId: string | null;
  onSelectCharger: (chargerId: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const sortedChargers = useMemo(
    () =>
      [...chargers].sort((left, right) => {
        const priorityDifference =
          getStatusSortPriority(left.statusNormalized) -
          getStatusSortPriority(right.statusNormalized);

        if (priorityDifference !== 0) {
          return priorityDifference;
        }

        return left.chargerIdentifier.localeCompare(right.chargerIdentifier);
      }),
    [chargers],
  );

  return (
    <aside
      className={cn(
        "flex h-full flex-col rounded-[18px] border border-[var(--line-soft)] bg-[rgba(255,250,243,0.94)] p-3 shadow-[0_12px_28px_rgba(27,38,46,0.12)]",
        className,
      )}
    >
      <div className="mb-2.5 flex items-start justify-between gap-2 border-b border-[var(--line-soft)] pb-2.5">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-500)]">
            Chargers at this location
          </p>
          <h2 className="mt-0.5 text-[1.15rem] font-semibold tracking-tight text-[var(--ink-900)]">
            {formatCompactNumber(chargers.length)} available choices
          </h2>
          <p className="mt-0.5 text-[11px] leading-[1rem] text-[var(--ink-600)]">
            Pick one to open the full charger details.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] border border-[var(--line-soft)] bg-white/80 text-[var(--ink-700)] transition-colors hover:bg-white"
          aria-label="Close charger list"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {sortedChargers.map((charger) => {
          const hasDistinctTitle =
            charger.title.trim().toLowerCase() !==
            charger.chargerIdentifier.trim().toLowerCase();
          const isSelected = charger.id === selectedId;

          return (
            <button
              key={charger.id}
              type="button"
              onClick={() => onSelectCharger(charger.id)}
              className={cn(
                "w-full rounded-[14px] border px-3 py-2 text-left transition-all",
                isSelected
                  ? "border-[var(--accent)] bg-white shadow-[0_10px_22px_rgba(27,38,46,0.08)]"
                  : "border-[var(--line-soft)] bg-white/72 hover:bg-white",
              )}
            >
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold leading-4 text-[var(--ink-900)]">
                      {charger.chargerIdentifier}
                    </p>
                    {hasDistinctTitle ? (
                      <p className="mt-0.5 truncate text-[11px] leading-4 text-[var(--ink-600)]">
                        {charger.title}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-500)]">
                    {charger.outputText}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-[var(--ink-700)] break-words">
                  {getPriceHeadline(charger.priceText)}
                </p>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <StatusPill
                  statusText={charger.statusText}
                  statusNormalized={charger.statusNormalized}
                />
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function getPriceHeadline(priceText: string) {
  return priceText.split("\n")[0] ?? priceText;
}

function getStatusSortPriority(status: Charger["statusNormalized"]) {
  switch (status) {
    case "available":
      return 0;
    case "occupied":
      return 1;
    case "unavailable":
      return 2;
    case "not_live":
      return 3;
    default:
      return 4;
  }
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
  infoContent?: ReactNode;
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
  selectedStatuses,
  isInfoOpen = false,
  onToggleInfo,
  onToggleStatus,
  onResetStatuses,
  className,
}: {
  metrics: ChargerMapMetrics;
  selectedStatuses: Charger["statusNormalized"][];
  isInfoOpen?: boolean;
  onToggleInfo?: () => void;
  onToggleStatus?: (status: Charger["statusNormalized"]) => void;
  onResetStatuses?: () => void;
  className?: string;
}) {
  const unknownCount = Math.max(
    metrics.totalChargers -
      metrics.availableNow -
      metrics.currentlyOccupied -
      metrics.unavailableNow -
      metrics.notLiveNow,
    0,
  );
  const statuses: Array<{
    key: Charger["statusNormalized"];
    label: string;
    count: number;
    color: string;
  }> = [
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
      key: "not_live",
      label: "Not live",
      count: metrics.notLiveNow,
      color: getStatusColor("not_live"),
    },
    {
      key: "unknown",
      label: "Unknown",
      count: unknownCount,
      color: getStatusColor("unknown"),
    },
  ];
  const isFiltered = selectedStatuses.length !== STATUS_FILTERS.length;

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
              <div className="space-y-2">
                <p>
                  Raw SWTCH statuses are grouped into five normalized buckets for
                  the map summary.
                </p>
                <p>
                  <strong>Occupied</strong>: Charging, Preparing, Finishing,
                  SuspendedEV, and SuspendedEVSE.
                </p>
                <p>
                  <strong>Unavailable</strong>: Under Repair, Offline, Faulted,
                  and Out of Service.
                </p>
                <p>
                  <strong>Available</strong>: Available, Active, Ready, and
                  Open.
                </p>
                <p>
                  <strong>Not live</strong>: Awaiting Commissioning,
                  Commissioned, Activating, and Decommissioned.
                </p>
                <p>
                  <strong>Unknown</strong>: Anything unmapped.
                </p>
                <p>Select one or more chips below to filter the markers on the map.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs font-medium text-[var(--ink-700)]">
        {statuses.map((status) => (
          <StatusDot
            key={status.key}
            status={status.key}
            label={`${status.label} ${formatCompactNumber(status.count)}`}
            color={status.color}
            selected={selectedStatuses.includes(status.key)}
            onClick={onToggleStatus}
          />
        ))}
        {isFiltered ? (
          <button
            type="button"
            onClick={onResetStatuses}
            className="inline-flex items-center rounded-full border border-[var(--line-soft)] bg-white/72 px-2 py-1 text-[11px] font-semibold text-[var(--ink-600)] transition-colors hover:bg-white"
          >
            Show all
          </button>
        ) : null}
      </div>
    </article>
  );
}

function StatusDot({
  status,
  label,
  color,
  selected,
  onClick,
}: {
  status: Charger["statusNormalized"];
  label: string;
  color: string;
  selected: boolean;
  onClick?: (status: Charger["statusNormalized"]) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(status)}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-left transition-all",
        selected
          ? "border-transparent bg-white/88 text-[var(--ink-900)] shadow-[0_4px_12px_rgba(27,38,46,0.08)]"
          : "border-[var(--line-soft)] bg-white/38 text-[var(--ink-500)] opacity-80",
      )}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </button>
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
    case "not_live":
      return "#c6a24b";
    default:
      return "#8b95a1";
  }
}
