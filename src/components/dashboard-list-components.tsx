import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ServerCrash } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

import { DashboardFilterBar } from "@/components/dashboard-filter-bar";
import { StatusPill } from "@/components/status-pill";
import { getStatusStaleLabel, isStatusStale } from "@/lib/status-freshness";
import { cn, formatCompactNumber, formatMoney, formatNumber, formatPercent } from "@/lib/utils";
import { buildDashboardListHref } from "@/lib/dashboard";
import type {
  DashboardFilterOptions,
  DashboardFilters,
  DashboardOccupancyRow,
  DashboardPagination,
  DashboardProfitabilityRow,
  DashboardUnavailableRow,
  DashboardVisibleFilter,
} from "@/types/dashboard";

type DashboardListLayoutProps = {
  title: string;
  description: string;
  pathname: string;
  filters: DashboardFilters;
  options: DashboardFilterOptions;
  visibleFilters: DashboardVisibleFilter[];
  pagination: DashboardPagination;
  children: ReactNode;
};

const TABLE_CHARGER_CELL = "min-w-[220px]";
const TABLE_META_CELL = "whitespace-nowrap";
const TABLE_NUMERIC_CELL = "whitespace-nowrap text-right";
const TABLE_OBSERVED_CELL = "min-w-[180px] whitespace-nowrap";
const TABLE_STATUS_CELL = "min-w-[200px] whitespace-nowrap";

export function DashboardListLayout({
  title,
  description,
  pathname,
  filters,
  options,
  visibleFilters,
  pagination,
  children,
}: DashboardListLayoutProps) {
  return (
    <div className="mx-auto flex w-[min(1240px,calc(100%-24px))] flex-col gap-5 py-5 md:w-[min(1240px,calc(100%-32px))]">
      <section className="glass-card soft-grid rounded-[32px] px-5 py-4 md:px-6 md:py-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h2 className="text-[1.2rem] font-semibold tracking-tight text-[var(--ink-900)] md:text-[1.55rem]">
                {title}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-[var(--ink-700)]">
                {description}
              </p>
            </div>

            <div className="shrink-0 rounded-full border border-[var(--line-soft)] bg-white/72 px-3 py-1.5 text-sm font-medium text-[var(--ink-600)] shadow-[0_6px_14px_rgba(27,38,46,0.05)]">
              {pagination.totalItems
                ? `${formatCompactNumber(pagination.totalItems)} chargers`
                : "No chargers yet"}
            </div>
          </div>

          <DashboardFilterBar
            filters={filters}
            options={options}
            visibleFilters={visibleFilters}
          />
        </div>
      </section>

      {children}

      <DashboardPaginationNav
        pathname={pathname}
        filters={filters}
        visibleFilters={visibleFilters}
        pagination={pagination}
      />
    </div>
  );
}

export function UnavailableListTable({
  rows,
}: {
  rows: DashboardUnavailableRow[];
}) {
  return (
    <>
      <DesktopTable>
        <TableHeaderRow>
          <HeaderCell>Charger</HeaderCell>
          <HeaderCell>Out since</HeaderCell>
          <HeaderCell>Down for</HeaderCell>
          <HeaderCell>Observed occupancy</HeaderCell>
          <HeaderCell className="text-right">Sessions</HeaderCell>
        </TableHeaderRow>
        {rows.length ? (
          rows.map((row) => (
            <UnavailableDesktopRow
              key={row.id}
              row={row}
              href={`/chargers/${row.id}`}
            />
          ))
        ) : (
          <EmptyRow
            title="No unavailable chargers right now"
            body="Every tracked Toronto charger is currently reporting as available or occupied."
            colSpan={5}
          />
        )}
      </DesktopTable>

      <MobileCards>
        {rows.length ? (
          rows.map((row) => (
            <UnavailableMobileCard key={row.id} row={row} href={`/chargers/${row.id}`} />
          ))
        ) : (
          <EmptyStateCard
            title="No unavailable chargers right now"
            body="Every tracked Toronto charger is currently reporting as available or occupied."
          />
        )}
      </MobileCards>
    </>
  );
}

export function OccupancyListTable({
  rows,
}: {
  rows: DashboardOccupancyRow[];
}) {
  return (
    <>
      <DesktopTable>
        <TableHeaderRow>
          <HeaderCell>Charger</HeaderCell>
          <HeaderCell>Current status</HeaderCell>
          <HeaderCell>Observed occupancy</HeaderCell>
          <HeaderCell>Tracked time</HeaderCell>
          <HeaderCell className="text-right">Sessions</HeaderCell>
          <HeaderCell className="text-right">Revenue</HeaderCell>
        </TableHeaderRow>
        {rows.length ? (
          rows.map((row) => (
            <OccupancyDesktopRow key={row.id} row={row} href={`/chargers/${row.id}`} />
          ))
        ) : (
          <EmptyRow
            title="No occupancy data available"
            body="Tracked occupancy rankings will appear here as more status history accumulates."
            colSpan={6}
          />
        )}
      </DesktopTable>

      <MobileCards>
        {rows.length ? (
          rows.map((row) => (
            <OccupancyMobileCard key={row.id} row={row} href={`/chargers/${row.id}`} />
          ))
        ) : (
          <EmptyStateCard
            title="No occupancy data available"
            body="Tracked occupancy rankings will appear here as more status history accumulates."
          />
        )}
      </MobileCards>
    </>
  );
}

export function ProfitabilityListTable({
  rows,
}: {
  rows: DashboardProfitabilityRow[];
}) {
  return (
    <>
      <DesktopTable>
        <TableHeaderRow>
          <HeaderCell>Charger</HeaderCell>
          <HeaderCell className="text-right">Revenue</HeaderCell>
          <HeaderCell className="text-right">Sessions</HeaderCell>
          <HeaderCell className="text-right">Energy sold</HeaderCell>
          <HeaderCell>Observed occupancy</HeaderCell>
        </TableHeaderRow>
        {rows.length ? (
          rows.map((row) => (
            <ProfitabilityDesktopRow key={row.id} row={row} href={`/chargers/${row.id}`} />
          ))
        ) : (
          <EmptyRow
            title="No profitability data yet"
            body="Revenue rankings will appear here as more tracked sessions accumulate."
            colSpan={5}
          />
        )}
      </DesktopTable>

      <MobileCards>
        {rows.length ? (
          rows.map((row) => (
            <ProfitabilityMobileCard key={row.id} row={row} href={`/chargers/${row.id}`} />
          ))
        ) : (
          <EmptyStateCard
            title="No profitability data yet"
            body="Revenue rankings will appear here as more tracked sessions accumulate."
          />
        )}
      </MobileCards>
    </>
  );
}

function DashboardPaginationNav({
  pathname,
  filters,
  visibleFilters,
  pagination,
}: {
  pathname: string;
  filters: DashboardFilters;
  visibleFilters: DashboardVisibleFilter[];
  pagination: DashboardPagination;
}) {
  const { page, totalPages, totalItems, pageSize } = pagination;
  const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = totalItems === 0 ? 0 : Math.min(page * pageSize, totalItems);

  return (
    <div className="glass-card flex flex-col gap-3 rounded-[28px] px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
      <p className="text-sm text-[var(--ink-600)]">
        Showing <span className="font-semibold text-[var(--ink-900)]">{startItem}</span>
        {" "}to{" "}
        <span className="font-semibold text-[var(--ink-900)]">{endItem}</span>
        {" "}of{" "}
        <span className="font-semibold text-[var(--ink-900)]">{formatCompactNumber(totalItems)}</span>
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={buildDashboardListHref(pathname, filters, Math.max(page - 1, 1), visibleFilters)}
          aria-disabled={page <= 1}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] px-4 py-2 text-sm font-semibold transition-colors",
            page <= 1
              ? "pointer-events-none bg-white/45 text-[var(--ink-400)]"
              : "bg-white/78 text-[var(--ink-700)] hover:bg-white",
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Link>
        <div className="rounded-full bg-white/72 px-3 py-2 text-sm font-medium text-[var(--ink-700)]">
          Page {page} of {totalPages}
        </div>
        <Link
          href={buildDashboardListHref(pathname, filters, Math.min(page + 1, totalPages), visibleFilters)}
          aria-disabled={page >= totalPages}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] px-4 py-2 text-sm font-semibold transition-colors",
            page >= totalPages
              ? "pointer-events-none bg-white/45 text-[var(--ink-400)]"
              : "bg-white/78 text-[var(--ink-700)] hover:bg-white",
          )}
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function DesktopTable({ children }: { children: ReactNode }) {
  return (
    <div className="hidden overflow-x-auto rounded-[26px] border border-[var(--line-soft)] bg-white/78 md:block">
      <table className="min-w-[860px] w-full border-collapse">
        {children}
      </table>
    </div>
  );
}

function TableHeaderRow({ children }: { children: ReactNode }) {
  return <thead className="bg-[rgba(247,239,225,0.75)]"><tr>{children}</tr></thead>;
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
  colSpan,
}: {
  title: string;
  body: string;
  colSpan: number;
}) {
  return (
    <tbody>
      <tr>
        <td colSpan={colSpan} className="px-6 py-10">
          <div className="rounded-[22px] border border-dashed border-[var(--line-soft)] bg-[rgba(255,250,243,0.72)] p-6 text-center">
            <p className="text-lg font-semibold text-[var(--ink-900)]">{title}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-700)]">{body}</p>
          </div>
        </td>
      </tr>
    </tbody>
  );
}

function MobileCards({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 md:hidden">{children}</div>;
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

function UnavailableDesktopRow({
  row,
  href,
}: {
  row: DashboardUnavailableRow;
  href: string;
}) {
  return (
    <tbody>
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
}: {
  row: DashboardOccupancyRow;
  href: string;
}) {
  const isStale = isStatusStale(row.lastCheckedAt);

  return (
    <tbody>
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
                <span className="text-xs text-[var(--ink-500)]">
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
}: {
  row: DashboardProfitabilityRow;
  href: string;
}) {
  return (
    <tbody>
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
}: {
  row: DashboardUnavailableRow;
  href: string;
}) {
  return (
    <MobileChargerCard href={href}>
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
}: {
  row: DashboardOccupancyRow;
  href: string;
}) {
  const isStale = isStatusStale(row.lastCheckedAt);

  return (
    <MobileChargerCard href={href}>
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
}: {
  row: DashboardProfitabilityRow;
  href: string;
}) {
  return (
    <MobileChargerCard href={href}>
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
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-[24px] border border-[var(--line-soft)] bg-white/78 p-4 shadow-[0_12px_28px_rgba(27,38,46,0.08)]"
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
