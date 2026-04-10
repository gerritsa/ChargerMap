import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BatteryCharging,
  CircleDollarSign,
  ExternalLink,
  Gauge,
  History,
  MapPinned,
  TimerReset,
  TrendingUp,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

import { AppHeader } from "@/components/app-header";
import { ChargerMiniMapPreview } from "@/components/charger-mini-map-preview";
import { DashboardMetricCard } from "@/components/dashboard-metric-card";
import { StatusPill } from "@/components/status-pill";
import { getDashboardChargerDetail } from "@/lib/dashboard";
import { getStatusStaleLabel, isStatusStale } from "@/lib/status-freshness";
import { getTrackingStartedAtLabel } from "@/lib/tracking-start";
import {
  formatCompactNumber,
  formatMoney,
  formatPercent,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

type ChargerDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ChargerDetailPage({
  params,
  searchParams,
}: ChargerDetailPageProps) {
  const [{ id }, rawSearchParams, trackingStartedAtLabel] = await Promise.all([
    params,
    searchParams,
    getTrackingStartedAtLabel(),
  ]);
  const detail = await getDashboardChargerDetail(id);

  if (!detail) {
    notFound();
  }

  const dashboardHref = buildDashboardReturnHref(rawSearchParams);
  const charger = detail.charger;
  const hasDistinctTitle =
    charger.title.trim().toLowerCase() !== charger.chargerIdentifier.trim().toLowerCase();
  const mapHref = buildMapHref(charger.id);
  const pricingHeadline = charger.priceText.split("\n")[0] ?? charger.priceText;
  const isStale = isStatusStale(charger.lastCheckedAt);

  return (
    <main className="min-h-screen overflow-x-hidden pb-10 pt-0">
      <AppHeader trackingStartedAtLabel={trackingStartedAtLabel} />

      <div className="mx-auto flex w-[min(1240px,calc(100%-24px))] flex-col gap-5 py-5 md:w-[min(1240px,calc(100%-32px))]">
        <section className="glass-card soft-grid rounded-[36px] px-6 py-6 md:px-8 md:py-7">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={dashboardHref}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-white/76 px-4 py-2 text-sm font-semibold text-[var(--ink-700)]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to overview
                  </Link>
                  <Link
                    href={mapHref}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-white/76 px-4 py-2 text-sm font-semibold text-[var(--ink-700)]"
                  >
                    View map
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>

                <div className="flex shrink-0 justify-start lg:justify-end">
                  <div className="flex flex-wrap items-center gap-2 rounded-full border border-[var(--line-soft)] bg-white/78 px-3 py-1.5 text-xs text-[var(--ink-700)]">
                    <span
                      className={`h-2 w-2 rounded-full ${detail.hasLiveData && !isStale ? "bg-[#2f9a61]" : "bg-[#c6a24b]"}`}
                    />
                    <span className="font-medium">
                      Status checked{" "}
                      {formatDistanceToNowStrict(charger.lastCheckedAt, {
                        addSuffix: true,
                      })}
                    </span>
                    {isStale ? (
                      <span className="inline-flex items-center rounded-full border border-[rgba(198,162,75,0.32)] bg-[rgba(198,162,75,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a6712]">
                        Stale
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              {isStale ? (
                <p className="text-sm text-[#8a6712]">
                  {getStatusStaleLabel(charger.lastCheckedAt)}
                </p>
              ) : null}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_320px] xl:items-start">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--ink-500)]">
                  Charger detail
                </p>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[var(--ink-900)] md:text-[3.3rem]">
                  {charger.chargerIdentifier}
                </h1>
                {hasDistinctTitle ? (
                  <p className="mt-2 text-lg text-[var(--ink-700)]">{charger.title}</p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <StatusPill
                    statusText={charger.statusText}
                    statusNormalized={charger.statusNormalized}
                  />
                  <MetaChip label={charger.region ?? "Unknown region"} />
                  <MetaChip label={charger.outputText} />
                  <MetaChip label={pricingHeadline} />
                  <MetaChip label={charger.scheduleText} />
                </div>
              </div>

              {charger.lat != null && charger.lng != null ? (
                <ChargerMiniMapPreview
                  lat={charger.lat}
                  lng={charger.lng}
                  href={mapHref}
                  label={charger.address ?? charger.chargerIdentifier}
                />
              ) : (
                <div className="rounded-[24px] border border-dashed border-[var(--line-soft)] bg-white/74 p-5 text-sm text-[var(--ink-700)]">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-500)]">
                    Map view
                  </p>
                  <p className="mt-2 font-semibold text-[var(--ink-900)]">
                    Location preview unavailable
                  </p>
                  <p className="mt-2 leading-6">
                    This charger is missing coordinates, so only the address summary is available.
                  </p>
                </div>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <DashboardMetricCard
                eyebrow="Tracked"
                label="Observed occupancy"
                value={formatPercent(charger.observedOccupancyRate)}
                helper="Tracked occupied time versus tracked lifetime."
                icon={<Gauge className="h-5 w-5" />}
                info="Observed occupancy is charger-level occupied time divided by tracked time from first seen until the last successful check."
                compact
              />
              <DashboardMetricCard
                eyebrow="Tracked"
                label="All-time sessions"
                value={formatCompactNumber(charger.totalSessions)}
                helper="Closed and open tracked sessions combined."
                icon={<TrendingUp className="h-5 w-5" />}
                info="Session volume is the charger's all-time tracked session count."
                compact
              />
              <DashboardMetricCard
                eyebrow="Tracked"
                label="Estimated revenue"
                value={formatMoney(charger.estimatedAllTimeRevenue)}
                helper="Stored closed-session estimate."
                icon={<CircleDollarSign className="h-5 w-5" />}
                info="Estimated revenue is derived from stored closed-session estimates. kWh chargers bill estimated energy sold, while time-priced chargers still bill by occupied session time."
                compact
              />
              <DashboardMetricCard
                eyebrow="Tracked"
                label="Estimated energy sold"
                value={`${formatCompactNumber(charger.estimatedAllTimeEnergySold)} kWh`}
                helper="Stored all-time tracked energy estimate."
                icon={<BatteryCharging className="h-5 w-5" />}
                info="Estimated energy sold is the charger's stored all-time tracked total using energy-active occupied time, a 5 minute buffer, output-based power factors, and a 45 kWh cap. Suspended EV and suspended EVSE intervals keep the session alive but add 0 kWh."
                compact
              />
              <DashboardMetricCard
                eyebrow="Current"
                label="Current state"
                value={getCurrentStateValue(charger)}
                helper={getCurrentStateHelper(charger, isStale)}
                icon={<TimerReset className="h-5 w-5" />}
                compact
              />
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <article className="glass-card rounded-[30px] px-5 py-5 md:px-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--line-soft)]">
                <MapPinned className="h-5 w-5" />
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-500)]">
                  Charger profile
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-900)]">
                  Operational details
                </h2>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[168px_minmax(0,1fr)]">
              <div className="overflow-hidden rounded-[24px] border border-[var(--line-soft)] bg-white/78">
                <div className="relative flex min-h-[168px] items-center justify-center p-4">
                  {charger.imageUrl ? (
                    <Image
                      src={charger.imageUrl}
                      alt={charger.chargerIdentifier}
                      width={180}
                      height={180}
                      className="h-auto max-h-[160px] w-auto object-contain"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-[136px] w-full items-center justify-center rounded-[18px] border border-dashed border-[var(--line-soft)] bg-[var(--surface-2)] text-sm text-[var(--ink-500)]">
                      No image
                    </div>
                  )}
                </div>
              </div>

              <dl className="grid gap-3 rounded-[24px] border border-[var(--line-soft)] bg-white/72 p-4 sm:grid-cols-2">
                <DetailGridItem
                  label="Address"
                  value={charger.address ?? "Address pending"}
                  className="sm:col-span-2"
                />
                <DetailGridItem label="Pricing" value={charger.priceText} />
                <DetailGridItem label="Schedule" value={charger.scheduleText} />
                <DetailGridItem label="Output" value={charger.outputText} />
                <DetailGridItem label="Region" value={charger.region ?? "Unknown"} />
                <DetailGridItem
                  label="Tracked time"
                  value={formatDurationCompact(charger.trackedSeconds)}
                />
                <DetailGridItem
                  label="Observed occupied"
                  value={formatDurationCompact(charger.observedOccupiedSeconds)}
                />
              </dl>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              {charger.mapUrl ? (
                <a
                  href={charger.mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ink-900)] underline underline-offset-4"
                >
                  Open Google Maps
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
              <Link
                href={mapHref}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ink-900)] underline underline-offset-4"
              >
                Open this charger on map
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </article>

          <article className="glass-card rounded-[30px] px-5 py-5 md:px-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--line-soft)]">
                <History className="h-5 w-5" />
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-500)]">
                  Recent sessions
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink-900)]">
                  Latest tracked activity
                </h2>
              </div>
            </div>

            {detail.recentSessions.length ? (
              <>
                <div className="mt-5 hidden overflow-hidden rounded-[24px] border border-[var(--line-soft)] bg-white/78 md:block">
                  <table className="w-full border-collapse">
                    <thead className="bg-[rgba(247,239,225,0.75)]">
                      <tr>
                        <HeaderCell>Started</HeaderCell>
                        <HeaderCell>Ended</HeaderCell>
                        <HeaderCell>Duration</HeaderCell>
                        <HeaderCell className="text-right">Energy</HeaderCell>
                        <HeaderCell className="text-right">Revenue</HeaderCell>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.recentSessions.map((session) => (
                        <tr
                          key={session.id}
                          className="border-t border-[var(--line-soft)]"
                        >
                          <BodyCell>{formatDateTime(session.startedAt)}</BodyCell>
                          <BodyCell>
                            {session.isOpen
                              ? isStale
                                ? "Not ended at last successful check"
                                : "Still ongoing"
                              : formatDateTime(session.endedAt!)}
                          </BodyCell>
                          <BodyCell>
                            {session.durationSeconds != null
                              ? formatDurationCompact(session.durationSeconds)
                              : "In progress"}
                          </BodyCell>
                          <BodyCell className="text-right">
                            {formatCompactNumber(session.estimatedKwh)} kWh
                          </BodyCell>
                          <BodyCell className="text-right">
                            {formatMoney(session.estimatedRevenue)}
                          </BodyCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 grid gap-3 md:hidden">
                  {detail.recentSessions.map((session) => (
                    <article
                      key={session.id}
                      className="rounded-[22px] border border-[var(--line-soft)] bg-white/78 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-500)]">
                            {session.isOpen ? "Open session" : "Closed session"}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[var(--ink-900)]">
                            {formatDateTime(session.startedAt)}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-[var(--ink-700)]">
                          {session.durationSeconds != null
                            ? formatDurationCompact(session.durationSeconds)
                            : "In progress"}
                        </p>
                      </div>

                      <dl className="mt-4 grid gap-2 text-sm">
                        <DetailRow
                          label="Ended"
                          value={
                            session.isOpen
                              ? isStale
                                ? "Not ended at last successful check"
                                : "Still ongoing"
                              : formatDateTime(session.endedAt!)
                          }
                        />
                        <DetailRow
                          label="Energy"
                          value={`${formatCompactNumber(session.estimatedKwh)} kWh`}
                        />
                        <DetailRow
                          label="Revenue"
                          value={formatMoney(session.estimatedRevenue)}
                        />
                      </dl>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-[24px] border border-dashed border-[var(--line-soft)] bg-white/72 p-6 text-center">
                <p className="text-lg font-semibold text-[var(--ink-900)]">
                  No tracked sessions yet
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">
                  This charger still renders cleanly, and observed occupancy
                  stays at 0% until session history starts accumulating.
                </p>
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}

function MetaChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[var(--line-soft)] bg-white/76 px-3 py-1.5 text-sm font-medium text-[var(--ink-700)]">
      {label}
    </span>
  );
}

function DetailGridItem({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-500)]">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-line text-sm font-semibold leading-6 text-[var(--ink-900)]">
        {value}
      </dd>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-sm text-[var(--ink-500)]">{label}</dt>
      <dd className="max-w-[60%] text-right text-sm font-semibold text-[var(--ink-900)]">
        {value}
      </dd>
    </div>
  );
}

function HeaderCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-500)] ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function BodyCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-4 py-4 text-sm text-[var(--ink-700)] ${className ?? ""}`}>
      {children}
    </td>
  );
}

function formatDurationCompact(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  const minutes = Math.max(0, Math.floor((totalSeconds % 3600) / 60));

  return `${Math.floor(totalSeconds / 3600)}h ${minutes}m`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getCurrentStateValue(charger: {
  unavailableSince: string | null;
  currentSessionStartedAt: string | null;
  statusNormalized: string;
  statusText: string;
}) {
  if (charger.unavailableSince) {
    return "Unavailable";
  }

  if (charger.currentSessionStartedAt || charger.statusNormalized === "occupied") {
    return "Occupied";
  }

  if (charger.statusNormalized === "available") {
    return "Healthy";
  }

  if (charger.statusNormalized === "not_live") {
    return "Not live";
  }

  return charger.statusText;
}

function getCurrentStateHelper(charger: {
  unavailableSince: string | null;
  currentSessionStartedAt: string | null;
  statusNormalized: string;
}, isStale: boolean) {
  if (isStale) {
    if (charger.unavailableSince) {
      return "Unavailable at the last successful check.";
    }

    if (charger.currentSessionStartedAt) {
      return "Occupied at the last successful check.";
    }

    if (charger.statusNormalized === "not_live") {
      return "Not live at the last successful check.";
    }

    return "No open occupied interval at the last successful check.";
  }

  if (charger.unavailableSince) {
    return `Since ${formatDistanceToNowStrict(charger.unavailableSince, { addSuffix: true })}.`;
  }

  if (charger.currentSessionStartedAt) {
    return `Live session since ${formatDistanceToNowStrict(
      charger.currentSessionStartedAt,
      { addSuffix: true },
    )}.`;
  }

  if (charger.statusNormalized === "not_live") {
    return "Currently outside the live charging network.";
  }

  return "No currently open occupied interval.";
}

function buildDashboardReturnHref(
  rawSearchParams: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();

  for (const key of ["status", "region", "price", "output"]) {
    const value = rawSearchParams[key];
    const normalized = Array.isArray(value) ? value[0] : value;

    if (normalized) {
      params.set(key, normalized);
    }
  }

  const query = params.toString();

  return query ? `/dashboard?${query}` : "/dashboard";
}

function buildMapHref(chargerId: string) {
  const params = new URLSearchParams({ charger: chargerId });

  return `/?${params.toString()}`;
}
