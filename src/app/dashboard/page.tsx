import { Children, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BatteryCharging,
  CircleDollarSign,
  Gauge,
  MapPinned,
  ServerCrash,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

import { DashboardCollapsibleCard } from "@/components/dashboard-collapsible-card";
import { DashboardMetricCard } from "@/components/dashboard-metric-card";
import { DashboardSectionNav } from "@/components/dashboard-section-nav";
import { StatusPill } from "@/components/status-pill";
import { getDashboardData } from "@/lib/dashboard";
import { getStatusStaleLabel, isStatusStale } from "@/lib/status-freshness";
import {
  cn,
  formatCompactNumber,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/utils";
import type {
  DashboardOccupancyRow,
  DashboardProfitabilityRow,
  DashboardUnavailableRow,
} from "@/types/dashboard";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  await searchParams;
  const data = await getDashboardData();
  const currentOccupancyRate =
    data.kpis.totalChargers > 0
      ? data.kpis.currentlyOccupied / data.kpis.totalChargers
      : 0;
  const topUnavailableRows = data.unavailableRows.slice(0, 10);
  const topOccupancyRows = data.occupancyRows.slice(0, 10);
  const topProfitableRows = data.profitableRows.slice(0, 10);

  return (
    <div className="mx-auto flex w-[min(1240px,calc(100%-24px))] flex-col gap-5 py-5 md:w-[min(1240px,calc(100%-32px))]">
      <section
        id="snapshot"
        className="glass-card soft-grid scroll-mt-40 rounded-[36px] px-5 py-5 md:px-6 md:py-6"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-500)]">
                Toronto live snapshot
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--ink-900)] md:text-2xl">
                City of Toronto charger overview
              </h2>
            </div>

            <div className="flex shrink-0 justify-start md:justify-end">
              <div className="flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-white/72 px-3 py-1.5 text-xs text-[var(--ink-700)] shadow-[0_6px_14px_rgba(27,38,46,0.05)]">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    data.hasLiveData ? "bg-[#2f9a61]" : "bg-[#c6a24b]",
                  )}
                />
                <span className="font-medium">
                  Dashboard refreshed {formatDateTime(data.generatedAt)}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--line-soft)]/70 pt-3">
            <DashboardSectionNav items={sectionAnchors} />
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <MetricGroup
          eyebrow="Current snapshot"
          title="Toronto overview."
          description="Live status totals across the Toronto charger network."
          columnsClassName="md:grid-cols-4"
        >
          <DashboardMetricCard
            eyebrow="Current"
            label="Chargers in Toronto live scope"
            value={formatCompactNumber(data.kpis.totalChargers)}
            icon={<MapPinned className="h-5 w-5" />}
            compact
          />
          <DashboardMetricCard
            eyebrow="Current"
            label="Currently occupied"
            value={formatCompactNumber(data.kpis.currentlyOccupied)}
            icon={<BatteryCharging className="h-5 w-5" />}
            compact
          />
          <DashboardMetricCard
            eyebrow="Current"
            label="Currently unavailable"
            value={formatCompactNumber(data.kpis.currentlyUnavailable)}
            icon={<Wrench className="h-5 w-5" />}
            compact
          />
          <DashboardMetricCard
            eyebrow="Current"
            label="Current occupancy"
            value={formatPercent(currentOccupancyRate)}
            icon={<Gauge className="h-5 w-5" />}
            info="Current occupancy is the share of chargers in Toronto live scope that are occupied right now."
            infoAlign="right"
            compact
          />
        </MetricGroup>

        <MetricGroup
          eyebrow="Tracked all-time"
          title="Accumulated Toronto totals."
          description="All-time metrics across tracked Toronto chargers."
          columnsClassName="md:grid-cols-3"
        >
          <DashboardMetricCard
            eyebrow="Tracked"
            label="All-time sessions"
            value={formatCompactNumber(data.kpis.allTimeSessions)}
            icon={<TrendingUp className="h-5 w-5" />}
            info="Session volume is the all-time tracked session count across tracked Toronto chargers."
            compact
          />
          <DashboardMetricCard
            eyebrow="Tracked"
            label="Estimated revenue"
            value={formatMoney(data.kpis.estimatedAllTimeRevenue)}
            icon={<CircleDollarSign className="h-5 w-5" />}
            info="Estimated revenue comes from already-computed closed-session estimates. Open sessions do not inflate this KPI."
            compact
          />
          <DashboardMetricCard
            eyebrow="Tracked"
            label="Estimated energy sold"
            value={`${formatCompactNumber(data.kpis.estimatedAllTimeEnergySold)} kWh`}
            icon={<BatteryCharging className="h-5 w-5" />}
            info="Estimated energy sold uses tracked session estimates already stored per charger. It is an all-time total across tracked Toronto chargers."
            compact
          />
        </MetricGroup>
      </section>

      <DashboardSection
        id="reliability"
        eyebrow="Reliability"
        title="Unavailable chargers ranked by ongoing downtime."
        description="Only chargers currently normalized as unavailable appear here, sorted by the longest active downtime interval."
      >
        <div className="mb-4 flex justify-end">
          <Link
            href="/dashboard/reliability"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-white/72 px-4 py-2 text-sm font-semibold text-[var(--ink-700)] transition-colors hover:bg-white"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <DesktopTable>
          <TableHeaderRow>
            <HeaderCell>Charger</HeaderCell>
            <HeaderCell>Out since</HeaderCell>
            <HeaderCell>Down for</HeaderCell>
            <HeaderCell>Observed occupancy</HeaderCell>
            <HeaderCell className="text-right">Sessions</HeaderCell>
          </TableHeaderRow>
          {topUnavailableRows.length ? (
            topUnavailableRows.map((row, index) => (
              <UnavailableDesktopRow
                key={row.id}
                row={row}
                href={buildChargerHref(row.id)}
                className={index >= 5 ? "hidden md:table-row-group" : ""}
              />
            ))
          ) : (
            <EmptyRow
              title="No unavailable chargers right now"
              body="Every tracked Toronto charger is currently reporting as available or occupied."
            />
          )}
        </DesktopTable>

        <MobileCards>
          {topUnavailableRows.length ? (
            topUnavailableRows.map((row, index) => (
              <UnavailableMobileCard
                key={row.id}
                row={row}
                href={buildChargerHref(row.id)}
                className={index >= 5 ? "hidden md:block" : ""}
              />
            ))
          ) : (
            <EmptyStateCard
              title="No unavailable chargers right now"
              body="Every tracked Toronto charger is currently reporting as available or occupied."
            />
          )}
        </MobileCards>
      </DashboardSection>

      <DashboardSection
        id="occupancy"
        eyebrow="Occupancy"
        title="Chargers ranked by observed tracked occupancy."
        description="Occupancy is based on tracked occupied intervals since first seen, including any currently open session up to the last successful check."
      >
        <div className="mb-4 flex justify-end">
          <Link
            href="/dashboard/occupancy"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-white/72 px-4 py-2 text-sm font-semibold text-[var(--ink-700)] transition-colors hover:bg-white"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <DesktopTable>
          <TableHeaderRow>
            <HeaderCell>Charger</HeaderCell>
            <HeaderCell>Current status</HeaderCell>
            <HeaderCell>Observed occupancy</HeaderCell>
            <HeaderCell>Tracked time</HeaderCell>
            <HeaderCell className="text-right">Sessions</HeaderCell>
            <HeaderCell className="text-right">Revenue</HeaderCell>
          </TableHeaderRow>
          {topOccupancyRows.length ? (
            topOccupancyRows.map((row, index) => (
              <OccupancyDesktopRow
                key={row.id}
                row={row}
                href={buildChargerHref(row.id)}
                className={index >= 5 ? "hidden md:table-row-group" : ""}
              />
            ))
          ) : (
            <EmptyRow
              title="No occupancy data available"
              body="Tracked occupancy rankings will appear here as more status history accumulates."
            />
          )}
        </DesktopTable>

        <MobileCards>
          {topOccupancyRows.length ? (
            topOccupancyRows.map((row, index) => (
              <OccupancyMobileCard
                key={row.id}
                row={row}
                href={buildChargerHref(row.id)}
                className={index >= 5 ? "hidden md:block" : ""}
              />
            ))
          ) : (
            <EmptyStateCard
              title="No occupancy data available"
              body="Tracked occupancy rankings will appear here as more status history accumulates."
            />
          )}
        </MobileCards>
      </DashboardSection>

      <DashboardSection
        id="profitability"
        eyebrow="Expected revenue"
        title="Expected revenue leaders across the Toronto charger network."
        description="These rankings use all-time estimated revenue, with supporting session, energy, and occupancy context."
      >
        <div className="mb-4 flex justify-end">
          <Link
            href="/dashboard/expected-revenue"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-white/72 px-4 py-2 text-sm font-semibold text-[var(--ink-700)] transition-colors hover:bg-white"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <DesktopTable>
          <TableHeaderRow>
            <HeaderCell>Charger</HeaderCell>
            <HeaderCell className="text-right">Revenue</HeaderCell>
            <HeaderCell className="text-right">Sessions</HeaderCell>
            <HeaderCell className="text-right">Energy sold</HeaderCell>
            <HeaderCell>Observed occupancy</HeaderCell>
          </TableHeaderRow>
          {topProfitableRows.length ? (
            topProfitableRows.map((row, index) => (
              <ProfitabilityDesktopRow
                key={row.id}
                row={row}
                href={buildChargerHref(row.id)}
                className={index >= 5 ? "hidden md:table-row-group" : ""}
              />
            ))
          ) : (
            <EmptyRow
              title="No profitability data yet"
              body="Revenue rankings will appear here as more tracked sessions accumulate."
            />
          )}
        </DesktopTable>

        <MobileCards>
          {topProfitableRows.length ? (
            topProfitableRows.map((row, index) => (
              <ProfitabilityMobileCard
                key={row.id}
                row={row}
                href={buildChargerHref(row.id)}
                className={index >= 5 ? "hidden md:block" : ""}
              />
            ))
          ) : (
            <EmptyStateCard
              title="No profitability data yet"
              body="Revenue rankings will appear here as more tracked sessions accumulate."
            />
          )}
        </MobileCards>
      </DashboardSection>
    </div>
  );
}

function MetricGroup({
  eyebrow,
  title,
  description,
  children,
  columnsClassName,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  columnsClassName?: string;
}) {
  return (
    <DashboardCollapsibleCard
      eyebrow={eyebrow}
      title={title}
      description={description}
      bodyClassName={cn("grid gap-2 sm:grid-cols-2", columnsClassName)}
    >
        {children}
    </DashboardCollapsibleCard>
  );
}

const sectionAnchors = [
  { href: "#reliability", label: "Reliability" },
  { href: "#occupancy", label: "Occupancy" },
  { href: "#profitability", label: "Expected revenue" },
];

function DashboardSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <DashboardCollapsibleCard
      id={id}
      eyebrow={eyebrow}
      title={title}
      description={description}
      className="scroll-mt-40 rounded-[32px] px-5 py-5 md:px-6"
      bodyClassName="mt-5"
    >
      <section>{children}</section>
    </DashboardCollapsibleCard>
  );
}

function DesktopTable({ children }: { children: ReactNode }) {
  const childArray = Children.toArray(children);
  const [header, ...body] = childArray;

  return (
    <div className="hidden overflow-x-auto rounded-[26px] border border-[var(--line-soft)] bg-white/78 md:block">
      <table className="min-w-[860px] w-full border-collapse">
        <thead className="bg-[rgba(247,239,225,0.75)]">{header}</thead>
        {body}
      </table>
    </div>
  );
}

function TableHeaderRow({ children }: { children: ReactNode }) {
  return <tr>{children}</tr>;
}

function HeaderCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-500)]",
        className,
      )}
    >
      {children}
    </th>
  );
}

function EmptyRow({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <tbody>
      <tr>
        <td colSpan={6} className="px-6 py-10">
          <div className="rounded-[22px] border border-dashed border-[var(--line-soft)] bg-[rgba(255,250,243,0.72)] p-6 text-center">
            <p className="text-lg font-semibold text-[var(--ink-900)]">{title}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{body}</p>
          </div>
        </td>
      </tr>
    </tbody>
  );
}

function MobileCards({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 md:hidden">{children}</div>;
}

const TABLE_CHARGER_CELL = "min-w-[220px]";
const TABLE_META_CELL = "whitespace-nowrap";
const TABLE_NUMERIC_CELL = "whitespace-nowrap text-right";
const TABLE_OBSERVED_CELL = "min-w-[180px] whitespace-nowrap";
const TABLE_STATUS_CELL = "min-w-[200px] whitespace-nowrap";

function UnavailableDesktopRow({
  row,
  href,
  className,
}: {
  row: DashboardUnavailableRow;
  href: string;
  className?: string;
}) {
  return (
    <tbody className={className}>
      <tr className="border-t border-[var(--line-soft)] align-top">
        <Cell className={TABLE_CHARGER_CELL}>
          <ChargerLinkSummary row={row} href={href} showStatus={false} />
        </Cell>
        <Cell className={TABLE_META_CELL}>{formatDateTime(row.unavailableSince)}</Cell>
        <Cell className={TABLE_META_CELL}>
          {formatDurationCompact(row.unavailableDurationSeconds)}
        </Cell>
        <Cell className={TABLE_OBSERVED_CELL}>{formatPercent(row.observedOccupancyRate)}</Cell>
        <Cell className={TABLE_NUMERIC_CELL}>{formatNumber(row.totalSessions)}</Cell>
      </tr>
    </tbody>
  );
}

function OccupancyDesktopRow({
  row,
  href,
  className,
}: {
  row: DashboardOccupancyRow;
  href: string;
  className?: string;
}) {
  const isStale = isStatusStale(row.lastCheckedAt);

  return (
    <tbody className={className}>
      <tr className="border-t border-[var(--line-soft)] align-top">
        <Cell className={TABLE_CHARGER_CELL}>
          <ChargerLinkSummary row={row} href={href} showStatus={false} />
        </Cell>
        <Cell className={TABLE_STATUS_CELL}>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                statusText={row.statusText}
                statusNormalized={row.statusNormalized}
              />
              {row.currentSessionStartedAt && !isStale ? (
                <span
                  className="text-xs text-[var(--ink-500)]"
                >
                  {`Live since ${formatDistanceToNowStrict(row.currentSessionStartedAt, {
                    addSuffix: true,
                  })}`}
                </span>
              ) : null}
            </div>
            {isStale ? (
              <p className="text-xs font-medium text-[#8a6712]">
                {getStatusStaleLabel(row.lastCheckedAt)}
              </p>
            ) : null}
          </div>
        </Cell>
        <Cell className={TABLE_OBSERVED_CELL}>
          <div className="flex items-center gap-3 whitespace-nowrap">
            <span className="font-semibold text-[var(--ink-900)]">
              {formatPercent(row.observedOccupancyRate)}
            </span>
            <OccupancyBar value={row.observedOccupancyRate} />
          </div>
        </Cell>
        <Cell className={TABLE_META_CELL}>{formatDurationCompact(row.trackedSeconds)}</Cell>
        <Cell className={TABLE_NUMERIC_CELL}>{formatNumber(row.totalSessions)}</Cell>
        <Cell className={TABLE_NUMERIC_CELL}>{formatMoney(row.estimatedAllTimeRevenue)}</Cell>
      </tr>
    </tbody>
  );
}

function ProfitabilityDesktopRow({
  row,
  href,
  className,
}: {
  row: DashboardProfitabilityRow;
  href: string;
  className?: string;
}) {
  return (
    <tbody className={className}>
      <tr className="border-t border-[var(--line-soft)] align-top">
        <Cell className={TABLE_CHARGER_CELL}>
          <ChargerLinkSummary row={row} href={href} showStatus={false} />
        </Cell>
        <Cell className={TABLE_NUMERIC_CELL}>{formatMoney(row.estimatedAllTimeRevenue)}</Cell>
        <Cell className={TABLE_NUMERIC_CELL}>{formatNumber(row.totalSessions)}</Cell>
        <Cell className={TABLE_NUMERIC_CELL}>
          {formatCompactNumber(row.estimatedAllTimeEnergySold)} kWh
        </Cell>
        <Cell className={TABLE_OBSERVED_CELL}>{formatPercent(row.observedOccupancyRate)}</Cell>
      </tr>
    </tbody>
  );
}

function UnavailableMobileCard({
  row,
  href,
  className,
}: {
  row: DashboardUnavailableRow;
  href: string;
  className?: string;
}) {
  return (
    <MobileChargerCard href={href} className={className}>
      <MobileCardHeader row={row} />
      <MobileStats
        items={[
          { label: "Unavailable since", value: formatDateTime(row.unavailableSince) },
          { label: "Down for", value: formatDurationCompact(row.unavailableDurationSeconds) },
          { label: "Observed occupancy", value: formatPercent(row.observedOccupancyRate) },
          { label: "Sessions", value: formatNumber(row.totalSessions) },
        ]}
      />
    </MobileChargerCard>
  );
}

function OccupancyMobileCard({
  row,
  href,
  className,
}: {
  row: DashboardOccupancyRow;
  href: string;
  className?: string;
}) {
  const isStale = isStatusStale(row.lastCheckedAt);

  return (
    <MobileChargerCard href={href} className={className}>
      <MobileCardHeader row={row} />
      {isStale ? (
        <p className="mt-4 text-sm font-medium text-[#8a6712]">
          {getStatusStaleLabel(row.lastCheckedAt)}
        </p>
      ) : null}
      <div className="mt-4 rounded-[18px] border border-[var(--line-soft)] bg-white/75 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--ink-500)]">
              Observed occupancy
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-[var(--ink-900)]">
              {formatPercent(row.observedOccupancyRate)}
            </p>
          </div>
          <OccupancyBar value={row.observedOccupancyRate} />
        </div>
      </div>
      <MobileStats
        items={[
          { label: "Tracked time", value: formatDurationCompact(row.trackedSeconds) },
          { label: "Sessions", value: formatNumber(row.totalSessions) },
          { label: "Revenue", value: formatMoney(row.estimatedAllTimeRevenue) },
          {
            label: "Current",
            value: row.currentSessionStartedAt
              ? isStale
                ? row.statusText
                : `Live since ${formatDistanceToNowStrict(row.currentSessionStartedAt, {
                    addSuffix: true,
                  })}`
              : row.statusText,
          },
        ]}
      />
    </MobileChargerCard>
  );
}

function ProfitabilityMobileCard({
  row,
  href,
  className,
}: {
  row: DashboardProfitabilityRow;
  href: string;
  className?: string;
}) {
  return (
    <MobileChargerCard href={href} className={className}>
      <MobileCardHeader row={row} />
      <MobileStats
        items={[
          { label: "Revenue", value: formatMoney(row.estimatedAllTimeRevenue) },
          { label: "Sessions", value: formatNumber(row.totalSessions) },
          {
            label: "Energy sold",
            value: `${formatCompactNumber(row.estimatedAllTimeEnergySold)} kWh`,
          },
          { label: "Observed occupancy", value: formatPercent(row.observedOccupancyRate) },
        ]}
      />
    </MobileChargerCard>
  );
}

function ChargerLinkSummary({
  row,
  href,
  showStatus = true,
}: {
  row: {
    chargerIdentifier: string;
    title: string;
    outputText: string;
    priceText: string;
    statusText: string;
    statusNormalized: DashboardUnavailableRow["statusNormalized"];
  };
  href: string;
  showStatus?: boolean;
}) {
  return (
    <Link href={href} className="block rounded-[16px] p-1 transition-colors hover:bg-[rgba(247,239,225,0.42)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--ink-900)]">
            {row.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-500)]">
            {row.outputText} • {row.priceText.split("\n")[0]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showStatus ? (
            <StatusPill
              statusText={row.statusText}
              statusNormalized={row.statusNormalized}
            />
          ) : null}
          <ArrowRight className="h-4 w-4 text-[var(--ink-500)]" />
        </div>
      </div>
    </Link>
  );
}

function MobileChargerCard({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-[24px] border border-[var(--line-soft)] bg-white/78 p-4 shadow-[0_12px_28px_rgba(27,38,46,0.08)]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function MobileCardHeader({
  row,
}: {
  row: {
    chargerIdentifier: string;
    title: string;
    outputText: string;
    statusText: string;
    statusNormalized: DashboardUnavailableRow["statusNormalized"];
  };
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-500)]">
          {row.chargerIdentifier}
        </p>
        <p className="mt-1 text-lg font-semibold tracking-tight text-[var(--ink-900)]">
          {row.title}
        </p>
        <p className="mt-1 text-sm text-[var(--ink-500)]">{row.outputText}</p>
      </div>
      <StatusPill statusText={row.statusText} statusNormalized={row.statusNormalized} />
    </div>
  );
}

function MobileStats({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <dl className="mt-4 grid gap-3 rounded-[18px] border border-[var(--line-soft)] bg-[rgba(255,250,243,0.72)] p-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-4">
          <dt className="text-sm text-[var(--ink-500)]">{item.label}</dt>
          <dd className="text-right text-sm font-semibold text-[var(--ink-900)]">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyStateCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-[var(--line-soft)] bg-white/72 p-5 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <ServerCrash className="h-5 w-5" />
      </div>
      <p className="mt-4 text-lg font-semibold text-[var(--ink-900)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{body}</p>
    </div>
  );
}

function Cell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("px-4 py-4 text-sm text-[var(--ink-700)]", className)}>
      {children}
    </td>
  );
}

function OccupancyBar({ value }: { value: number }) {
  return (
    <div className="h-2.5 w-28 overflow-hidden rounded-full bg-[rgba(47,142,201,0.12)]">
      <div
        className="h-full rounded-full bg-[var(--accent)]"
        style={{ width: `${Math.min(value * 100, 100)}%` }}
      />
    </div>
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

function buildChargerHref(chargerId: string) {
  return `/chargers/${chargerId}`;
}
