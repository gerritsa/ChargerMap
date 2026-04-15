import { differenceInSeconds, subDays } from "date-fns";
import { unstable_cache } from "next/cache";

import {
  computeObservedOccupancyRate,
  computeObservedOccupiedSeconds,
  computeTrackedSeconds,
  derivePriceBucketFromLegacyFields,
  getOutputBucket,
  getPriceBucket,
} from "@/lib/charger-stats";
import { mockChargers } from "@/data/mock-chargers";
import { isPointInToronto } from "@/lib/toronto-scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  DashboardChargerDetail,
  DashboardData,
  DashboardFilterOption,
  DashboardFilters,
  DashboardOccupancyRow,
  DashboardOccupancyListData,
  DashboardPriceBucket,
  DashboardProfitabilityRow,
  DashboardProfitabilityListData,
  DashboardUnavailableRow,
  DashboardUnavailableListData,
  DashboardVisibleFilter,
} from "@/types/dashboard";
import type { ChargerStatusNormalized } from "@/types/charger";

type SearchParamValue = string | string[] | undefined;
type DashboardQueryParams = Record<string, SearchParamValue>;

type SupabaseDashboardRow = {
  charger_id: string;
  listing_id: number | null;
  charger_identifier: string | null;
  title: string | null;
  image_url: string | null;
  address_text: string | null;
  map_url: string | null;
  lat: number | null;
  lng: number | null;
  output_kw: number | null;
  output_text: string | null;
  price_text: string | null;
  schedule_text: string | null;
  price_model_type: string | null;
  status_text: string | null;
  status_normalized: ChargerStatusNormalized | null;
  unavailable_since: string | null;
  last_checked_at: string | null;
  region: string | null;
  price_bucket: string | null;
  output_bucket: string | null;
  total_sessions: number | null;
  estimated_all_time_revenue: number | null;
  estimated_all_time_kwh: number | null;
  observed_occupied_seconds: number | null;
  tracked_seconds: number | null;
  observed_occupancy_rate: number | null;
  current_session_started_at: string | null;
  first_seen_at: string | null;
};

type SupabaseSessionRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  estimated_kwh: number | null;
  estimated_revenue: number | null;
};

type SupabaseDashboardDetailPayloadRow = SupabaseDashboardRow & {
  recent_sessions: SupabaseSessionRow[] | null;
};

type SupabaseDashboardSnapshotRow = {
  total_chargers: number | null;
  currently_occupied: number | null;
  currently_unavailable: number | null;
  all_time_sessions: number | null;
  estimated_all_time_revenue: number | null;
  estimated_all_time_kwh: number | null;
  observed_occupied_seconds: number | null;
  tracked_seconds: number | null;
};

type SupabaseCountRow = {
  total_count: number | null;
};

type SupabaseRawStatusRow = {
  status_text: string | null;
  status_count: number | null;
};

type SupabaseUnavailableListRow = {
  charger_id: string;
  listing_id: number | null;
  charger_identifier: string | null;
  title: string | null;
  output_text: string | null;
  price_text: string | null;
  status_text: string | null;
  status_normalized: ChargerStatusNormalized | null;
  unavailable_since: string | null;
  observed_occupancy_rate: number | null;
  total_sessions: number | null;
};

type SupabaseOccupancyListRow = {
  charger_id: string;
  listing_id: number | null;
  charger_identifier: string | null;
  title: string | null;
  output_text: string | null;
  price_text: string | null;
  status_text: string | null;
  status_normalized: ChargerStatusNormalized | null;
  last_checked_at: string | null;
  observed_occupancy_rate: number | null;
  tracked_seconds: number | null;
  total_sessions: number | null;
  estimated_all_time_revenue: number | null;
  current_session_started_at: string | null;
};

type SupabaseProfitabilityListRow = {
  charger_id: string;
  listing_id: number | null;
  charger_identifier: string | null;
  title: string | null;
  output_text: string | null;
  price_text: string | null;
  status_text: string | null;
  status_normalized: ChargerStatusNormalized | null;
  estimated_all_time_revenue: number | null;
  estimated_all_time_kwh: number | null;
  total_sessions: number | null;
  observed_occupancy_rate: number | null;
};

type SupabaseDashboardListMetaRow = {
  total_count: number | null;
  output_options: string[] | null;
  raw_status_options: string[] | null;
};

type DashboardBaseRow = {
  id: string;
  listingId: number;
  chargerIdentifier: string;
  title: string;
  imageUrl: string | null;
  address: string | null;
  mapUrl: string | null;
  lat: number | null;
  lng: number | null;
  region: string | null;
  outputKw: number | null;
  outputBucket: string;
  outputText: string;
  priceText: string;
  scheduleText: string;
  priceModelType: string | null;
  priceBucket: Exclude<DashboardPriceBucket, "all">;
  estimatedAllTimeRevenue: number;
  estimatedAllTimeEnergySold: number;
  totalSessions: number;
  firstSeenAt: string;
  statusText: string;
  statusNormalized: ChargerStatusNormalized;
  unavailableSince: string | null;
  lastCheckedAt: string;
  trackedSeconds: number;
  observedOccupiedSeconds: number;
  observedOccupancyRate: number;
  currentSessionStartedAt: string | null;
};

const STATUS_OPTIONS: DashboardFilterOption[] = [
  { value: "all", label: "All statuses" },
  { value: "available", label: "Available" },
  { value: "occupied", label: "Occupied" },
  { value: "unavailable", label: "Unavailable" },
  { value: "not_live", label: "Not live" },
  { value: "unknown", label: "Unknown" },
];

const PRICE_OPTIONS: DashboardFilterOption[] = [
  { value: "all", label: "All pricing" },
  { value: "free", label: "Free" },
  { value: "hourly", label: "Hourly" },
  { value: "energy", label: "Energy" },
  { value: "complex", label: "Complex" },
  { value: "unknown", label: "Unknown" },
];

const DEFAULT_FILTERS: DashboardFilters = {
  status: "all",
  rawStatus: "all",
  region: "all",
  price: "all",
  output: "all",
};

const DASHBOARD_LIST_PAGE_SIZE = 25;

const mockDashboardMeta = new Map<
  string,
  {
    region: string | null;
    outputKw: number | null;
    priceModelType: string | null;
    firstSeenAt: string;
    sessions: Array<{
      id: string;
      chargerId: string;
      startedAt: string;
      endedAt: string | null;
      estimatedKwh: number;
      estimatedRevenue: number;
    }>;
  }
>([
  [
    "mock-7203",
    {
      region: "BC",
      outputKw: 9.6,
      priceModelType: "charging_plus_idle",
      firstSeenAt: subDays(new Date("2026-04-08T12:00:00.000Z"), 120).toISOString(),
      sessions: [
        {
          id: "session-mock-7203-1",
          chargerId: "mock-7203",
          startedAt: "2026-04-07T14:05:00.000Z",
          endedAt: "2026-04-07T16:35:00.000Z",
          estimatedKwh: 24.1,
          estimatedRevenue: 8,
        },
        {
          id: "session-mock-7203-2",
          chargerId: "mock-7203",
          startedAt: "2026-04-06T18:10:00.000Z",
          endedAt: "2026-04-06T20:00:00.000Z",
          estimatedKwh: 17.6,
          estimatedRevenue: 4,
        },
      ],
    },
  ],
  [
    "mock-100",
    {
      region: "ON",
      outputKw: 9.6,
      priceModelType: "hourly_plus_guest_fee",
      firstSeenAt: subDays(new Date("2026-04-08T12:00:00.000Z"), 180).toISOString(),
      sessions: [
        {
          id: "session-mock-100-1",
          chargerId: "mock-100",
          startedAt: "2026-04-08T10:15:00.000Z",
          endedAt: null,
          estimatedKwh: 0,
          estimatedRevenue: 0,
        },
        {
          id: "session-mock-100-2",
          chargerId: "mock-100",
          startedAt: "2026-04-07T13:00:00.000Z",
          endedAt: "2026-04-07T15:45:00.000Z",
          estimatedKwh: 26.4,
          estimatedRevenue: 5,
        },
        {
          id: "session-mock-100-3",
          chargerId: "mock-100",
          startedAt: "2026-04-05T17:20:00.000Z",
          endedAt: "2026-04-05T19:00:00.000Z",
          estimatedKwh: 16,
          estimatedRevenue: 3.5,
        },
      ],
    },
  ],
  [
    "mock-10000",
    {
      region: "ON",
      outputKw: 9.6,
      priceModelType: "tiered_time",
      firstSeenAt: subDays(new Date("2026-04-08T12:00:00.000Z"), 95).toISOString(),
      sessions: [
        {
          id: "session-mock-10000-1",
          chargerId: "mock-10000",
          startedAt: "2026-04-03T15:00:00.000Z",
          endedAt: "2026-04-03T17:10:00.000Z",
          estimatedKwh: 20.8,
          estimatedRevenue: 4,
        },
      ],
    },
  ],
  [
    "mock-15000",
    {
      region: "BC",
      outputKw: 7.2,
      priceModelType: "hourly_simple",
      firstSeenAt: subDays(new Date("2026-04-08T12:00:00.000Z"), 75).toISOString(),
      sessions: [
        {
          id: "session-mock-15000-1",
          chargerId: "mock-15000",
          startedAt: "2026-04-07T08:45:00.000Z",
          endedAt: "2026-04-07T10:00:00.000Z",
          estimatedKwh: 9,
          estimatedRevenue: 2,
        },
        {
          id: "session-mock-15000-2",
          chargerId: "mock-15000",
          startedAt: "2026-04-06T18:15:00.000Z",
          endedAt: "2026-04-06T19:40:00.000Z",
          estimatedKwh: 10.2,
          estimatedRevenue: 2,
        },
      ],
    },
  ],
]);

function normalizeSupabaseDashboardRow(
  row: SupabaseDashboardRow,
  now: Date,
): DashboardBaseRow | null {
  if (row.listing_id == null) {
    return null;
  }

  const chargerIdentifier =
    row.charger_identifier?.trim() || `SWTCH-${row.listing_id}`;
  const firstSeenAt = row.first_seen_at ?? now.toISOString();
  const lastCheckedAt = row.last_checked_at ?? now.toISOString();
  const referenceTime = new Date(lastCheckedAt);
  const trackedSeconds =
    row.tracked_seconds ?? computeTrackedSeconds(firstSeenAt, referenceTime);
  const observedOccupiedSeconds = computeObservedOccupiedSeconds({
    observedOccupiedSeconds: row.observed_occupied_seconds ?? 0,
    currentSessionStartedAt: row.current_session_started_at ?? null,
    now: referenceTime,
  });
  const observedOccupancyRate = computeObservedOccupancyRate({
    trackedSeconds,
    observedOccupiedSeconds: row.observed_occupied_seconds ?? 0,
    currentSessionStartedAt: row.current_session_started_at ?? null,
    now: referenceTime,
  });

  return {
    id: row.charger_id,
    listingId: row.listing_id,
    chargerIdentifier,
    title: row.title ?? `SWTCH Charger ${chargerIdentifier}`,
    imageUrl: row.image_url,
    address: row.address_text,
    mapUrl: row.map_url,
    lat: row.lat,
    lng: row.lng,
    region: row.region,
    outputKw: row.output_kw,
    outputBucket: row.output_bucket ?? getOutputBucket(row.output_kw),
    outputText: row.output_text ?? "Unknown output",
    priceText: row.price_text ?? "Pricing pending",
    scheduleText: row.schedule_text ?? "Schedule pending",
    priceModelType: row.price_model_type,
    priceBucket:
      (row.price_bucket as Exclude<DashboardPriceBucket, "all"> | null) ??
      derivePriceBucketFromLegacyFields({
        priceModelType: row.price_model_type,
        pricingBaseType: null,
        pricingStructureType: null,
      }),
    estimatedAllTimeRevenue: row.estimated_all_time_revenue ?? 0,
    estimatedAllTimeEnergySold: row.estimated_all_time_kwh ?? 0,
    totalSessions: row.total_sessions ?? 0,
    firstSeenAt,
    statusText: row.status_text ?? "UNKNOWN",
    statusNormalized: row.status_normalized ?? "unknown",
    unavailableSince: row.unavailable_since ?? null,
    lastCheckedAt,
    trackedSeconds,
    observedOccupiedSeconds,
    observedOccupancyRate,
    currentSessionStartedAt: row.current_session_started_at ?? null,
  };
}

function buildDashboardListIdentity(
  listingId: number | null,
  chargerId: string,
  chargerIdentifier: string | null,
  title: string | null,
  outputText: string | null,
  priceText: string | null,
  statusText: string | null,
  statusNormalized: ChargerStatusNormalized | null,
) {
  if (listingId == null) {
    return null;
  }

  const normalizedIdentifier =
    chargerIdentifier?.trim() || `SWTCH-${listingId}`;

  return {
    id: chargerId,
    listingId,
    chargerIdentifier: normalizedIdentifier,
    title: title ?? `SWTCH Charger ${normalizedIdentifier}`,
    imageUrl: null,
    address: null,
    mapUrl: null,
    lat: null,
    lng: null,
    region: null,
    outputText: outputText ?? "Unknown output",
    priceText: priceText ?? "Pricing pending",
    scheduleText: "Schedule pending",
    statusText: statusText ?? "UNKNOWN",
    statusNormalized: statusNormalized ?? "unknown",
  };
}

function normalizeUnavailableListRow(
  row: SupabaseUnavailableListRow,
  now: Date,
): DashboardUnavailableRow | null {
  const base = buildDashboardListIdentity(
    row.listing_id,
    row.charger_id,
    row.charger_identifier,
    row.title,
    row.output_text,
    row.price_text,
    row.status_text,
    row.status_normalized,
  );

  if (!base || !row.unavailable_since) {
    return null;
  }

  return {
    ...base,
    lastCheckedAt: now.toISOString(),
    unavailableSince: row.unavailable_since,
    unavailableDurationSeconds: Math.max(
      0,
      differenceInSeconds(now, new Date(row.unavailable_since)),
    ),
    observedOccupancyRate: row.observed_occupancy_rate ?? 0,
    totalSessions: row.total_sessions ?? 0,
  };
}

function normalizeOccupancyListRow(
  row: SupabaseOccupancyListRow,
  now: Date,
): DashboardOccupancyRow | null {
  const base = buildDashboardListIdentity(
    row.listing_id,
    row.charger_id,
    row.charger_identifier,
    row.title,
    row.output_text,
    row.price_text,
    row.status_text,
    row.status_normalized,
  );

  if (!base) {
    return null;
  }

  return {
    ...base,
    lastCheckedAt: row.last_checked_at ?? now.toISOString(),
    observedOccupancyRate: row.observed_occupancy_rate ?? 0,
    observedOccupiedSeconds: 0,
    trackedSeconds: row.tracked_seconds ?? 0,
    totalSessions: row.total_sessions ?? 0,
    estimatedAllTimeRevenue: row.estimated_all_time_revenue ?? 0,
    currentSessionStartedAt: row.current_session_started_at ?? null,
  };
}

function normalizeProfitabilityListRow(
  row: SupabaseProfitabilityListRow,
  now: Date,
): DashboardProfitabilityRow | null {
  const base = buildDashboardListIdentity(
    row.listing_id,
    row.charger_id,
    row.charger_identifier,
    row.title,
    row.output_text,
    row.price_text,
    row.status_text,
    row.status_normalized,
  );

  if (!base) {
    return null;
  }

  return {
    ...base,
    lastCheckedAt: now.toISOString(),
    estimatedAllTimeRevenue: row.estimated_all_time_revenue ?? 0,
    estimatedAllTimeEnergySold: row.estimated_all_time_kwh ?? 0,
    totalSessions: row.total_sessions ?? 0,
    observedOccupancyRate: row.observed_occupancy_rate ?? 0,
  };
}

function buildMockDashboardRows(now: Date) {
  return mockChargers
    .map<DashboardBaseRow>((charger) => {
      const meta = mockDashboardMeta.get(charger.id);
      const sessions = meta?.sessions ?? [];
      const firstSeenAt = meta?.firstSeenAt ?? subDays(now, 45).toISOString();
      const referenceTime = new Date(charger.lastCheckedAt);
      const trackedSeconds = computeTrackedSeconds(firstSeenAt, referenceTime);
    const observedOccupiedSeconds = sessions.reduce((sum, session) => {
      const end = session.endedAt ? new Date(session.endedAt) : referenceTime;
      return sum + Math.max(0, differenceInSeconds(end, new Date(session.startedAt)));
    }, 0);
    const currentSessionStartedAt =
      sessions.find((session) => session.endedAt == null)?.startedAt ?? null;

    return {
      id: charger.id,
      listingId: charger.listingId,
      chargerIdentifier: charger.chargerIdentifier,
      title: charger.title,
      imageUrl: charger.imageUrl,
      address: charger.address,
      mapUrl: charger.mapUrl,
      lat: charger.lat,
      lng: charger.lng,
      region: meta?.region ?? null,
      outputKw: meta?.outputKw ?? null,
      outputBucket: getOutputBucket(meta?.outputKw ?? null),
      outputText: charger.outputText,
      priceText: charger.priceText,
      scheduleText: charger.scheduleText,
      priceModelType: meta?.priceModelType ?? null,
      priceBucket: getPriceBucket(meta?.priceModelType ?? null),
      estimatedAllTimeRevenue: charger.estimatedAllTimeRevenue,
      estimatedAllTimeEnergySold: charger.estimatedAllTimeKwh,
      totalSessions: charger.totalSessions,
      firstSeenAt,
      statusText: charger.statusText,
      statusNormalized: charger.statusNormalized,
      unavailableSince: charger.unavailableSince,
      lastCheckedAt: charger.lastCheckedAt,
      trackedSeconds,
      observedOccupiedSeconds,
      observedOccupancyRate:
        trackedSeconds > 0 ? observedOccupiedSeconds / trackedSeconds : 0,
      currentSessionStartedAt,
    };
    })
    .filter((row) => isPointInToronto(row.lat ?? 0, row.lng ?? 0));
}

async function getDashboardSnapshot(filters: DashboardFilters, now: Date) {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    const rows = applyDashboardFilters(buildMockDashboardRows(now), filters).filter(
      (row) => filters.status !== "all" || row.statusNormalized !== "not_live",
    );
    return {
      kpis: rows.reduce<DashboardData["kpis"]>(
        (acc, row) => {
          acc.totalChargers += 1;
          acc.currentlyOccupied += row.statusNormalized === "occupied" ? 1 : 0;
          acc.currentlyUnavailable += row.statusNormalized === "unavailable" ? 1 : 0;
          acc.allTimeSessions += row.totalSessions;
          acc.estimatedAllTimeRevenue += row.estimatedAllTimeRevenue;
          acc.estimatedAllTimeEnergySold += row.estimatedAllTimeEnergySold;
          acc.observedOccupancyRate += row.observedOccupiedSeconds;
          return acc;
        },
        {
          totalChargers: 0,
          currentlyOccupied: 0,
          currentlyUnavailable: 0,
          observedOccupancyRate: 0,
          allTimeSessions: 0,
          estimatedAllTimeRevenue: 0,
          estimatedAllTimeEnergySold: 0,
        },
      ),
      trackedSeconds: rows.reduce((sum, row) => sum + row.trackedSeconds, 0),
      hasLiveData: false,
    };
  }

  const { data, error } = await supabase.rpc("get_dashboard_snapshot", {
    filter_status: filters.status === "all" ? null : filters.status,
    filter_region: filters.region === "all" ? null : filters.region,
    filter_price: filters.price === "all" ? null : filters.price,
    filter_output: filters.output === "all" ? null : filters.output,
  });

  if (error || !data) {
    return {
      kpis: {
        totalChargers: 0,
        currentlyOccupied: 0,
        currentlyUnavailable: 0,
        observedOccupancyRate: 0,
        allTimeSessions: 0,
        estimatedAllTimeRevenue: 0,
        estimatedAllTimeEnergySold: 0,
      },
      trackedSeconds: 0,
      hasLiveData: false,
    };
  }

  const snapshotRow = (data as unknown as SupabaseDashboardSnapshotRow[])[0];
  const snapshot = {
    kpis: {
      totalChargers: snapshotRow?.total_chargers ?? 0,
      currentlyOccupied: snapshotRow?.currently_occupied ?? 0,
      currentlyUnavailable: snapshotRow?.currently_unavailable ?? 0,
      observedOccupancyRate: snapshotRow?.observed_occupied_seconds ?? 0,
      allTimeSessions: snapshotRow?.all_time_sessions ?? 0,
      estimatedAllTimeRevenue: snapshotRow?.estimated_all_time_revenue ?? 0,
      estimatedAllTimeEnergySold: snapshotRow?.estimated_all_time_kwh ?? 0,
    },
    trackedSeconds: snapshotRow?.tracked_seconds ?? 0,
  };

  return {
    ...snapshot,
    hasLiveData: true,
  };
}

async function fetchDashboardTopRows(
  filters: DashboardFilters,
  now: Date,
  options: {
    orderBy: string;
    ascending?: boolean;
    limit?: number;
    offset?: number;
    statusFilter?: ChargerStatusNormalized;
    excludeNotLive?: boolean;
  },
) {
  const supabase = createServerSupabaseClient();
  const shouldExcludeNotLive =
    options.excludeNotLive &&
    filters.status === "all" &&
    filters.rawStatus === "all" &&
    !options.statusFilter;

  if (!supabase) {
    let rows = applyDashboardFilters(buildMockDashboardRows(now), filters);

    if (shouldExcludeNotLive) {
      rows = rows.filter((row) => row.statusNormalized !== "not_live");
    }

    if (options.statusFilter) {
      rows = rows.filter((row) => row.statusNormalized === options.statusFilter);
    }

    return rows
      .sort((left, right) => {
        const direction = options.ascending ? 1 : -1;

        if (options.orderBy === "unavailable_since") {
          const leftValue = left.unavailableSince ? new Date(left.unavailableSince).getTime() : 0;
          const rightValue = right.unavailableSince ? new Date(right.unavailableSince).getTime() : 0;
          return (leftValue - rightValue) * direction;
        }

        if (options.orderBy === "observed_occupancy_rate") {
          if (right.observedOccupancyRate !== left.observedOccupancyRate) {
            return right.observedOccupancyRate - left.observedOccupancyRate;
          }
          return right.totalSessions - left.totalSessions;
        }

        if (options.orderBy === "estimated_all_time_revenue") {
          if (right.estimatedAllTimeRevenue !== left.estimatedAllTimeRevenue) {
            return right.estimatedAllTimeRevenue - left.estimatedAllTimeRevenue;
          }
          return right.totalSessions - left.totalSessions;
        }

        return left.chargerIdentifier.localeCompare(right.chargerIdentifier);
      })
      .slice(options.offset ?? 0, (options.offset ?? 0) + (options.limit ?? 10));
  }

  if (options.statusFilter === "unavailable" && options.orderBy === "unavailable_since") {
    const { data, error } = await supabase.rpc("get_public_dashboard_unavailable_rows", {
      filter_raw_status: filters.rawStatus === "all" ? null : filters.rawStatus,
      filter_price: filters.price === "all" ? null : filters.price,
      filter_output: filters.output === "all" ? null : filters.output,
      target_limit: options.limit ?? 10,
      target_offset: options.offset ?? 0,
    });

    if (error || !data) {
      return [] as DashboardBaseRow[];
    }

    return ((data as unknown) as SupabaseUnavailableListRow[])
      .map((row) => normalizeUnavailableListRow(row, now))
      .filter((row): row is DashboardUnavailableRow => Boolean(row));
  }

  if (options.orderBy === "observed_occupancy_rate" && options.excludeNotLive) {
    const { data, error } = await supabase.rpc("get_public_dashboard_occupancy_rows", {
      filter_raw_status: filters.rawStatus === "all" ? null : filters.rawStatus,
      filter_price: filters.price === "all" ? null : filters.price,
      filter_output: filters.output === "all" ? null : filters.output,
      exclude_not_live: shouldExcludeNotLive,
      target_limit: options.limit ?? 10,
      target_offset: options.offset ?? 0,
    });

    if (error || !data) {
      return [] as DashboardBaseRow[];
    }

    return ((data as unknown) as SupabaseOccupancyListRow[])
      .map((row) => normalizeOccupancyListRow(row, now))
      .filter((row): row is DashboardOccupancyRow => Boolean(row));
  }

  if (options.orderBy === "estimated_all_time_revenue" && options.excludeNotLive) {
    const { data, error } = await supabase.rpc("get_public_dashboard_profitability_rows", {
      filter_price: filters.price === "all" ? null : filters.price,
      filter_output: filters.output === "all" ? null : filters.output,
      exclude_not_live: shouldExcludeNotLive,
      target_limit: options.limit ?? 10,
      target_offset: options.offset ?? 0,
    });

    if (error || !data) {
      return [] as DashboardBaseRow[];
    }

    return ((data as unknown) as SupabaseProfitabilityListRow[])
      .map((row) => normalizeProfitabilityListRow(row, now))
      .filter((row): row is DashboardProfitabilityRow => Boolean(row));
  }

  const { data, error } = await supabase.rpc("get_public_dashboard_rows", {
    filter_status: filters.status === "all" ? null : filters.status,
    filter_raw_status: filters.rawStatus === "all" ? null : filters.rawStatus,
    filter_region: filters.region === "all" ? null : filters.region,
    filter_price: filters.price === "all" ? null : filters.price,
    filter_output: filters.output === "all" ? null : filters.output,
    target_status_filter: options.statusFilter ?? null,
    exclude_not_live: shouldExcludeNotLive,
    target_order_by: options.orderBy,
    target_ascending: options.ascending ?? false,
    target_limit: options.limit ?? 10,
    target_offset: options.offset ?? 0,
  });

  if (error || !data) {
    return [] as DashboardBaseRow[];
  }

  return ((data as unknown) as SupabaseDashboardRow[])
    .map((row) => normalizeSupabaseDashboardRow(row, now))
    .filter((row): row is DashboardBaseRow => Boolean(row));
}

async function countDashboardRows(
  filters: DashboardFilters,
  now: Date,
  options: {
    statusFilter?: ChargerStatusNormalized;
    excludeNotLive?: boolean;
  } = {},
) {
  const supabase = createServerSupabaseClient();
  const shouldExcludeNotLive =
    options.excludeNotLive &&
    filters.status === "all" &&
    filters.rawStatus === "all" &&
    !options.statusFilter;

  if (!supabase) {
    let rows = applyDashboardFilters(buildMockDashboardRows(now), filters);

    if (shouldExcludeNotLive) {
      rows = rows.filter((row) => row.statusNormalized !== "not_live");
    }

    if (options.statusFilter) {
      rows = rows.filter((row) => row.statusNormalized === options.statusFilter);
    }

    return rows.length;
  }

  const { data, error } = await supabase.rpc("get_public_dashboard_row_count", {
    filter_status: filters.status === "all" ? null : filters.status,
    filter_raw_status: filters.rawStatus === "all" ? null : filters.rawStatus,
    filter_region: filters.region === "all" ? null : filters.region,
    filter_price: filters.price === "all" ? null : filters.price,
    filter_output: filters.output === "all" ? null : filters.output,
    target_status_filter: options.statusFilter ?? null,
    exclude_not_live: shouldExcludeNotLive,
  });

  if (error) {
    return 0;
  }

  const row = ((data ?? []) as SupabaseCountRow[])[0];
  return row?.total_count ?? 0;
}

async function fetchDashboardListMeta(
  kind: "unavailable" | "occupancy" | "profitability",
  filters: DashboardFilters,
  now: Date,
) {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    const statusFilter = kind === "unavailable" ? "unavailable" : undefined;
    const [totalItems, outputFilterOptions, rawStatusOptions] = await Promise.all([
      countDashboardRows(filters, now, {
        statusFilter,
        excludeNotLive: kind !== "unavailable",
      }),
      fetchDashboardFilterOptions(filters, ["output"]),
      kind === "occupancy" || kind === "unavailable"
        ? fetchDashboardRawStatusOptions(filters, now, {
            statusFilter,
            excludeNotLive: kind === "occupancy",
          })
        : Promise.resolve([] as string[]),
    ]);

    return {
      totalItems,
      outputs: outputFilterOptions.outputs,
      rawStatuses: rawStatusOptions,
      hasLiveData: false,
    };
  }

  const { data, error } = await supabase.rpc("get_public_dashboard_list_meta", {
    target_kind: kind,
    exclude_not_live:
      kind === "profitability" || (kind === "occupancy" && filters.rawStatus === "all"),
    filter_raw_status: filters.rawStatus === "all" ? null : filters.rawStatus,
    filter_price: filters.price === "all" ? null : filters.price,
    filter_output: filters.output === "all" ? null : filters.output,
  });

  if (error || !data) {
    return {
      totalItems: 0,
      outputs: [] as string[],
      rawStatuses: [] as string[],
      hasLiveData: false,
    };
  }

  const row = ((data ?? []) as SupabaseDashboardListMetaRow[])[0];

  return {
    totalItems: row?.total_count ?? 0,
    outputs: ((row?.output_options ?? []) as string[]).filter(
      (value): value is string => Boolean(value),
    ),
    rawStatuses: ((row?.raw_status_options ?? []) as string[]).filter(
      (value): value is string => Boolean(value),
    ),
    hasLiveData: true,
  };
}

async function fetchDashboardFilterOptions(
  filters: DashboardFilters,
  excluded: Array<keyof DashboardFilters>,
) {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    const rows = applyDashboardFilters(buildMockDashboardRows(new Date()), filters, excluded);
    return {
      regions: Array.from(
        new Set(rows.map((row) => row.region).filter((value): value is string => Boolean(value))),
      ).sort((left, right) => left.localeCompare(right)),
      outputs: Array.from(new Set(rows.map((row) => row.outputBucket))).sort(
        (left, right) => Number(left) - Number(right),
      ),
    };
  }

  const effectiveFilters = { ...filters };

  for (const key of excluded) {
    effectiveFilters[key] = "all";
  }

  const shouldFetchRegions = excluded.includes("region");
  const shouldFetchOutputs = excluded.includes("output");
  const [regionResult, outputResult] = await Promise.all([
    shouldFetchRegions
      ? supabase.rpc("get_dashboard_regions", {
          filter_status: effectiveFilters.status === "all" ? null : effectiveFilters.status,
          filter_price: effectiveFilters.price === "all" ? null : effectiveFilters.price,
          filter_output: effectiveFilters.output === "all" ? null : effectiveFilters.output,
        })
      : Promise.resolve({
          data: [] as Array<{ region: string | null }>,
          error: null,
        }),
    shouldFetchOutputs
      ? supabase.rpc("get_dashboard_outputs", {
          filter_status: effectiveFilters.status === "all" ? null : effectiveFilters.status,
          filter_region: effectiveFilters.region === "all" ? null : effectiveFilters.region,
          filter_price: effectiveFilters.price === "all" ? null : effectiveFilters.price,
        })
      : Promise.resolve({
          data: [] as Array<{ output_bucket: string | null }>,
          error: null,
        }),
  ]);

  if (regionResult.error || outputResult.error) {
    return { regions: [] as string[], outputs: [] as string[] };
  }

  return {
    regions: Array.from(
      new Set(
        ((regionResult.data as Array<{ region: string | null }> | undefined) ?? [])
          .map((row) => row.region)
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((left, right) => left.localeCompare(right)),
    outputs: Array.from(
      new Set(
        ((outputResult.data as Array<{ output_bucket: string | null }> | undefined) ?? [])
          .map((row) => row.output_bucket ?? "unknown")
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((left, right) => Number(left) - Number(right)),
  };
}

async function fetchDashboardRawStatusOptions(
  filters: DashboardFilters,
  now: Date,
  options: {
    statusFilter?: ChargerStatusNormalized;
    excludeNotLive?: boolean;
  } = {},
) {
  const supabase = createServerSupabaseClient();
  const shouldExcludeNotLive =
    options.excludeNotLive &&
    filters.status === "all" &&
    filters.rawStatus === "all" &&
    !options.statusFilter;

  if (!supabase) {
    let rows = applyDashboardFilters(buildMockDashboardRows(now), filters, ["rawStatus"]);

    if (shouldExcludeNotLive) {
      rows = rows.filter((row) => row.statusNormalized !== "not_live");
    }

    if (options.statusFilter) {
      rows = rows.filter((row) => row.statusNormalized === options.statusFilter);
    }

    const statusCounts = rows.reduce<Map<string, number>>((counts, row) => {
      counts.set(row.statusText, (counts.get(row.statusText) ?? 0) + 1);
      return counts;
    }, new Map());

    return Array.from(statusCounts.entries())
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }

        return left[0].localeCompare(right[0]);
      })
      .map(([value]) => value);
  }

  const { data, error } = await supabase.rpc("get_public_dashboard_raw_statuses", {
    filter_status: filters.status === "all" ? null : filters.status,
    filter_region: filters.region === "all" ? null : filters.region,
    filter_price: filters.price === "all" ? null : filters.price,
    filter_output: filters.output === "all" ? null : filters.output,
    target_status_filter: options.statusFilter ?? null,
    exclude_not_live: shouldExcludeNotLive,
  });

  if (error || !data) {
    return [] as string[];
  }

  const statusCounts = (((data as unknown) as SupabaseRawStatusRow[]) ?? []).map((row) => [
    row.status_text?.trim() || "UNKNOWN",
    row.status_count ?? 0,
  ] as const);

  return Array.from(statusCounts)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .map(([value]) => value);
}

function applyDashboardFilters(
  rows: DashboardBaseRow[],
  filters: DashboardFilters,
  excludedFilters: Array<keyof DashboardFilters> = [],
) {
  return rows.filter((row) => {
    if (!excludedFilters.includes("status") && filters.status !== "all") {
      if (row.statusNormalized !== filters.status) {
        return false;
      }
    }

    if (!excludedFilters.includes("region") && filters.region !== "all") {
      if (row.region !== filters.region) {
        return false;
      }
    }

    if (!excludedFilters.includes("rawStatus") && filters.rawStatus !== "all") {
      if (row.statusText !== filters.rawStatus) {
        return false;
      }
    }

    if (!excludedFilters.includes("price") && filters.price !== "all") {
      if (row.priceBucket !== filters.price) {
        return false;
      }
    }

    if (!excludedFilters.includes("output") && filters.output !== "all") {
      if (row.outputBucket !== filters.output) {
        return false;
      }
    }

    return true;
  });
}

function ensureSelectedOption(
  options: DashboardFilterOption[],
  selectedValue: string,
  buildOption: (value: string) => DashboardFilterOption,
) {
  if (selectedValue === "all") {
    return options;
  }

  if (options.some((option) => option.value === selectedValue)) {
    return options;
  }

  return [...options, buildOption(selectedValue)];
}

function getSingleParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function isValidPriceBucket(value: string | undefined): value is DashboardPriceBucket {
  return Boolean(
    value &&
      ["all", "free", "hourly", "energy", "complex", "unknown"].includes(value),
  );
}

function normalizeDashboardListFilters(
  rawSearchParams: DashboardQueryParams = {},
): DashboardFilters {
  const rawStatus = getSingleParam(rawSearchParams.rawStatus);
  const price = getSingleParam(rawSearchParams.price);
  const output = getSingleParam(rawSearchParams.output);

  return {
    status: "all",
    rawStatus: rawStatus?.trim() ? rawStatus.trim() : DEFAULT_FILTERS.rawStatus,
    price: isValidPriceBucket(price) ? price : DEFAULT_FILTERS.price,
    region: DEFAULT_FILTERS.region,
    output: output?.trim() ? output.trim() : DEFAULT_FILTERS.output,
  };
}

function normalizeDashboardPage(rawSearchParams: DashboardQueryParams = {}) {
  const pageValue = Number(getSingleParam(rawSearchParams.page));

  if (!Number.isFinite(pageValue) || pageValue < 1) {
    return 1;
  }

  return Math.floor(pageValue);
}

function normalizeDashboardQueryParamsForCache(
  rawSearchParams: DashboardQueryParams = {},
): DashboardQueryParams {
  return Object.fromEntries(
    Object.entries(rawSearchParams)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [
        key,
        Array.isArray(value) ? [...value] : value,
      ]),
  );
}

function buildDashboardFilterOptions(
  filters: DashboardFilters,
  filterOptions: { outputs: string[]; rawStatuses: string[] },
) {
  return {
    status: STATUS_OPTIONS,
    rawStatus: ensureSelectedOption(
      [
        { value: "all", label: "All statuses" },
        ...filterOptions.rawStatuses.map((value) => ({
          value,
          label: value,
        })),
      ],
      filters.rawStatus,
      (value) => ({
        value,
        label: value,
      }),
    ),
    region: [{ value: "all", label: "All regions" }],
    price: PRICE_OPTIONS,
    output: ensureSelectedOption(
      [
        { value: "all", label: "All outputs" },
        ...filterOptions.outputs.map((value) => ({
          value,
          label: value === "unknown" ? "Unknown output" : `${value} kW`,
        })),
      ],
      filters.output,
      (value) => ({
        value,
        label: value === "unknown" ? "Unknown output" : `${value} kW`,
      }),
    ),
  };
}

async function getDashboardDataUncached(
  now = new Date(),
): Promise<DashboardData> {
  const filters = DEFAULT_FILTERS;
  const [snapshot, topUnavailableRows, topOccupancyRows, topProfitableRows] = await Promise.all([
    getDashboardSnapshot(filters, now),
    fetchDashboardTopRows(filters, now, {
      orderBy: "unavailable_since",
      ascending: true,
      limit: 10,
      statusFilter: "unavailable",
    }),
    fetchDashboardTopRows(filters, now, {
      orderBy: "observed_occupancy_rate",
      limit: 10,
      excludeNotLive: true,
    }),
    fetchDashboardTopRows(filters, now, {
      orderBy: "estimated_all_time_revenue",
      limit: 10,
      excludeNotLive: true,
    }),
  ]);

  const kpis = snapshot.kpis;
  const unavailableRows = topUnavailableRows as DashboardUnavailableRow[];
  const occupancyRows = topOccupancyRows as DashboardOccupancyRow[];
  const profitableRows = topProfitableRows as DashboardProfitabilityRow[];
  kpis.observedOccupancyRate =
    snapshot.trackedSeconds > 0
      ? kpis.observedOccupancyRate / snapshot.trackedSeconds
      : 0;

  return {
    kpis,
    occupancyRows: occupancyRows.map((row) => ({
      id: row.id,
      listingId: row.listingId,
      chargerIdentifier: row.chargerIdentifier,
      title: row.title,
      imageUrl: row.imageUrl,
      address: row.address,
      mapUrl: row.mapUrl,
      lat: row.lat,
      lng: row.lng,
      region: row.region,
      outputText: row.outputText,
      priceText: row.priceText,
      scheduleText: row.scheduleText,
      statusText: row.statusText,
      statusNormalized: row.statusNormalized,
      lastCheckedAt: row.lastCheckedAt,
      observedOccupancyRate: row.observedOccupancyRate,
      observedOccupiedSeconds: row.observedOccupiedSeconds,
      trackedSeconds: row.trackedSeconds,
      totalSessions: row.totalSessions,
      estimatedAllTimeRevenue: row.estimatedAllTimeRevenue,
      currentSessionStartedAt: row.currentSessionStartedAt,
    })),
    unavailableRows: unavailableRows
      .filter((row) => row.unavailableSince)
      .map((row) => ({
        id: row.id,
        listingId: row.listingId,
        chargerIdentifier: row.chargerIdentifier,
        title: row.title,
        imageUrl: row.imageUrl,
        address: row.address,
        mapUrl: row.mapUrl,
        lat: row.lat,
        lng: row.lng,
        region: row.region,
        outputText: row.outputText,
        priceText: row.priceText,
        scheduleText: row.scheduleText,
        statusText: row.statusText,
        statusNormalized: row.statusNormalized,
        lastCheckedAt: row.lastCheckedAt,
        unavailableSince: row.unavailableSince!,
        unavailableDurationSeconds: Math.max(
          0,
          differenceInSeconds(now, new Date(row.unavailableSince!)),
        ),
        observedOccupancyRate: row.observedOccupancyRate,
        totalSessions: row.totalSessions,
      })),
    profitableRows: profitableRows.map((row) => ({
      id: row.id,
      listingId: row.listingId,
      chargerIdentifier: row.chargerIdentifier,
      title: row.title,
      imageUrl: row.imageUrl,
      address: row.address,
      mapUrl: row.mapUrl,
      lat: row.lat,
      lng: row.lng,
      region: row.region,
      outputText: row.outputText,
      priceText: row.priceText,
      scheduleText: row.scheduleText,
      statusText: row.statusText,
      statusNormalized: row.statusNormalized,
      lastCheckedAt: row.lastCheckedAt,
      estimatedAllTimeRevenue: row.estimatedAllTimeRevenue,
      estimatedAllTimeEnergySold: row.estimatedAllTimeEnergySold,
      totalSessions: row.totalSessions,
      observedOccupancyRate: row.observedOccupancyRate,
    })),
    generatedAt: now.toISOString(),
    hasLiveData: snapshot.hasLiveData,
  };
}

const getCachedDashboardData = unstable_cache(
  async () => getDashboardDataUncached(new Date()),
  ["dashboard-overview"],
  { revalidate: 450 },
);

export async function getDashboardData(): Promise<DashboardData> {
  return getCachedDashboardData();
}

async function getDashboardListData(
  kind: "unavailable" | "occupancy" | "profitability",
  rawSearchParams: DashboardQueryParams = {},
  now = new Date(),
) {
  const requestedFilters = normalizeDashboardListFilters(rawSearchParams);
  const requestedPage = normalizeDashboardPage(rawSearchParams);
  const visibleFilters: DashboardVisibleFilter[] =
    kind === "occupancy"
      ? ["rawStatus", "price", "output"]
      : kind === "unavailable"
        ? ["rawStatus", "output", "price"]
        : ["price", "output"];
  const filters: DashboardFilters = {
    ...requestedFilters,
    status: "all",
    rawStatus:
      kind === "occupancy" || kind === "unavailable"
        ? requestedFilters.rawStatus
        : "all",
  };
  const statusFilter = kind === "unavailable" ? "unavailable" : undefined;
  const orderBy =
    kind === "unavailable"
      ? "unavailable_since"
      : kind === "occupancy"
        ? "observed_occupancy_rate"
        : "estimated_all_time_revenue";
  const ascending = kind === "unavailable";

  const meta = await fetchDashboardListMeta(kind, filters, now);

  const totalPages = Math.max(1, Math.ceil(meta.totalItems / DASHBOARD_LIST_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * DASHBOARD_LIST_PAGE_SIZE;
  const pageRows = await fetchDashboardTopRows(filters, now, {
    orderBy,
    ascending,
    statusFilter,
    limit: DASHBOARD_LIST_PAGE_SIZE,
    offset,
    excludeNotLive: kind !== "unavailable",
  });

  return {
    filters,
    options: buildDashboardFilterOptions(filters, {
      outputs: meta.outputs,
      rawStatuses: meta.rawStatuses,
    }),
    visibleFilters,
    pagination: {
      page,
      pageSize: DASHBOARD_LIST_PAGE_SIZE,
      totalItems: meta.totalItems,
      totalPages,
    },
    rows: pageRows,
    generatedAt: now.toISOString(),
    hasLiveData: meta.hasLiveData,
  };
}

async function getDashboardUnavailableListDataUncached(
  rawSearchParams: DashboardQueryParams = {},
  now = new Date(),
): Promise<DashboardUnavailableListData> {
  const data = await getDashboardListData("unavailable", rawSearchParams, now);
  const rows = data.rows as DashboardUnavailableRow[];

  return {
    ...data,
    rows: rows
      .filter((row) => row.unavailableSince)
      .map((row) => ({
        id: row.id,
        listingId: row.listingId,
        chargerIdentifier: row.chargerIdentifier,
        title: row.title,
        imageUrl: row.imageUrl,
        address: row.address,
        mapUrl: row.mapUrl,
        lat: row.lat,
        lng: row.lng,
        region: row.region,
        outputText: row.outputText,
        priceText: row.priceText,
        scheduleText: row.scheduleText,
        statusText: row.statusText,
        statusNormalized: row.statusNormalized,
        lastCheckedAt: row.lastCheckedAt,
        unavailableSince: row.unavailableSince!,
        unavailableDurationSeconds: Math.max(
          0,
          differenceInSeconds(now, new Date(row.unavailableSince!)),
        ),
        observedOccupancyRate: row.observedOccupancyRate,
        totalSessions: row.totalSessions,
      })),
  };
}

const getCachedDashboardUnavailableListData = unstable_cache(
  async (rawSearchParams: DashboardQueryParams) =>
    getDashboardUnavailableListDataUncached(rawSearchParams, new Date()),
  ["dashboard-unavailable-list"],
  { revalidate: 450 },
);

export async function getDashboardUnavailableListData(
  rawSearchParams: DashboardQueryParams = {},
): Promise<DashboardUnavailableListData> {
  return getCachedDashboardUnavailableListData(
    normalizeDashboardQueryParamsForCache(rawSearchParams),
  );
}

async function getDashboardOccupancyListDataUncached(
  rawSearchParams: DashboardQueryParams = {},
  now = new Date(),
): Promise<DashboardOccupancyListData> {
  const data = await getDashboardListData("occupancy", rawSearchParams, now);
  const rows = data.rows as DashboardOccupancyRow[];

  return {
    ...data,
    rows: rows.map((row) => ({
      id: row.id,
      listingId: row.listingId,
      chargerIdentifier: row.chargerIdentifier,
      title: row.title,
      imageUrl: row.imageUrl,
      address: row.address,
      mapUrl: row.mapUrl,
      lat: row.lat,
      lng: row.lng,
      region: row.region,
      outputText: row.outputText,
      priceText: row.priceText,
      scheduleText: row.scheduleText,
      statusText: row.statusText,
      statusNormalized: row.statusNormalized,
      lastCheckedAt: row.lastCheckedAt,
      observedOccupancyRate: row.observedOccupancyRate,
      observedOccupiedSeconds: row.observedOccupiedSeconds,
      trackedSeconds: row.trackedSeconds,
      totalSessions: row.totalSessions,
      estimatedAllTimeRevenue: row.estimatedAllTimeRevenue,
      currentSessionStartedAt: row.currentSessionStartedAt,
    })),
  };
}

const getCachedDashboardOccupancyListData = unstable_cache(
  async (rawSearchParams: DashboardQueryParams) =>
    getDashboardOccupancyListDataUncached(rawSearchParams, new Date()),
  ["dashboard-occupancy-list"],
  { revalidate: 450 },
);

export async function getDashboardOccupancyListData(
  rawSearchParams: DashboardQueryParams = {},
): Promise<DashboardOccupancyListData> {
  return getCachedDashboardOccupancyListData(
    normalizeDashboardQueryParamsForCache(rawSearchParams),
  );
}

async function getDashboardProfitabilityListDataUncached(
  rawSearchParams: DashboardQueryParams = {},
  now = new Date(),
): Promise<DashboardProfitabilityListData> {
  const data = await getDashboardListData("profitability", rawSearchParams, now);
  const rows = data.rows as DashboardProfitabilityRow[];

  return {
    ...data,
    rows: rows.map((row) => ({
      id: row.id,
      listingId: row.listingId,
      chargerIdentifier: row.chargerIdentifier,
      title: row.title,
      imageUrl: row.imageUrl,
      address: row.address,
      mapUrl: row.mapUrl,
      lat: row.lat,
      lng: row.lng,
      region: row.region,
      outputText: row.outputText,
      priceText: row.priceText,
      scheduleText: row.scheduleText,
      statusText: row.statusText,
      statusNormalized: row.statusNormalized,
      lastCheckedAt: row.lastCheckedAt,
      estimatedAllTimeRevenue: row.estimatedAllTimeRevenue,
      estimatedAllTimeEnergySold: row.estimatedAllTimeEnergySold,
      totalSessions: row.totalSessions,
      observedOccupancyRate: row.observedOccupancyRate,
    })),
  };
}

const getCachedDashboardProfitabilityListData = unstable_cache(
  async (rawSearchParams: DashboardQueryParams) =>
    getDashboardProfitabilityListDataUncached(rawSearchParams, new Date()),
  ["dashboard-profitability-list"],
  { revalidate: 450 },
);

export async function getDashboardProfitabilityListData(
  rawSearchParams: DashboardQueryParams = {},
): Promise<DashboardProfitabilityListData> {
  return getCachedDashboardProfitabilityListData(
    normalizeDashboardQueryParamsForCache(rawSearchParams),
  );
}

async function getDashboardChargerDetailUncached(
  chargerId: string,
  now = new Date(),
): Promise<DashboardChargerDetail | null> {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    const charger = buildMockDashboardRows(now).find((row) => row.id === chargerId);

    if (!charger) {
      return null;
    }

    const sessions = [...(mockDashboardMeta.get(chargerId)?.sessions ?? [])]
      .sort(
        (left, right) =>
          new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
      )
      .slice(0, 8)
      .map((session) => {
        const endedAt = session.endedAt;
        const end = endedAt ? new Date(endedAt) : new Date(charger.lastCheckedAt);

        return {
          id: session.id,
          startedAt: session.startedAt,
          endedAt,
          durationSeconds: Math.max(
            0,
            differenceInSeconds(end, new Date(session.startedAt)),
          ),
          estimatedKwh: session.estimatedKwh,
          estimatedRevenue: session.estimatedRevenue,
          isOpen: endedAt == null,
        };
      });

    return {
      charger: {
        id: charger.id,
        listingId: charger.listingId,
        chargerIdentifier: charger.chargerIdentifier,
        title: charger.title,
        imageUrl: charger.imageUrl,
        address: charger.address,
        mapUrl: charger.mapUrl,
        lat: charger.lat,
        lng: charger.lng,
        region: charger.region,
        outputText: charger.outputText,
        priceText: charger.priceText,
        scheduleText: charger.scheduleText,
        statusText: charger.statusText,
        statusNormalized: charger.statusNormalized,
        firstSeenAt: charger.firstSeenAt,
        lastCheckedAt: charger.lastCheckedAt,
        priceBucket: charger.priceBucket,
        outputBucket: charger.outputBucket,
        totalSessions: charger.totalSessions,
        estimatedAllTimeRevenue: charger.estimatedAllTimeRevenue,
        estimatedAllTimeEnergySold: charger.estimatedAllTimeEnergySold,
        observedOccupancyRate: charger.observedOccupancyRate,
        observedOccupiedSeconds: charger.observedOccupiedSeconds,
        trackedSeconds: charger.trackedSeconds,
        unavailableSince: charger.unavailableSince,
        currentSessionStartedAt: charger.currentSessionStartedAt,
      },
      recentSessions: sessions,
      hasLiveData: false,
    };
  }

  const { data, error } = await supabase.rpc(
    "get_public_dashboard_charger_detail_payload",
    {
      target_charger_id: chargerId,
      target_limit: 8,
    },
  );

  if (error || !data?.length) {
    return null;
  }

  const payloadRow = (data as unknown as SupabaseDashboardDetailPayloadRow[])[0];
  const charger = normalizeSupabaseDashboardRow(
    payloadRow as SupabaseDashboardRow,
    now,
  );

  if (!charger) {
    return null;
  }

  return {
    charger: {
      id: charger.id,
      listingId: charger.listingId,
      chargerIdentifier: charger.chargerIdentifier,
      title: charger.title,
      imageUrl: charger.imageUrl,
      address: charger.address,
      mapUrl: charger.mapUrl,
      lat: charger.lat,
      lng: charger.lng,
      region: charger.region,
      outputText: charger.outputText,
      priceText: charger.priceText,
      scheduleText: charger.scheduleText,
      statusText: charger.statusText,
      statusNormalized: charger.statusNormalized,
      firstSeenAt: charger.firstSeenAt,
      lastCheckedAt: charger.lastCheckedAt,
      priceBucket: charger.priceBucket,
      outputBucket: charger.outputBucket,
      totalSessions: charger.totalSessions,
      estimatedAllTimeRevenue: charger.estimatedAllTimeRevenue,
      estimatedAllTimeEnergySold: charger.estimatedAllTimeEnergySold,
      observedOccupancyRate: charger.observedOccupancyRate,
      observedOccupiedSeconds: charger.observedOccupiedSeconds,
      trackedSeconds: charger.trackedSeconds,
      unavailableSince: charger.unavailableSince,
      currentSessionStartedAt: charger.currentSessionStartedAt,
    },
    recentSessions: ((payloadRow.recent_sessions ?? []) as SupabaseSessionRow[]).map((session) => {
      const end = session.ended_at ? new Date(session.ended_at) : new Date(charger.lastCheckedAt);

      return {
        id: session.id,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        durationSeconds: Math.max(
          0,
          differenceInSeconds(end, new Date(session.started_at)),
        ),
        estimatedKwh: session.estimated_kwh ?? 0,
        estimatedRevenue: session.estimated_revenue ?? 0,
        isOpen: session.ended_at == null,
      };
    }),
    hasLiveData: true,
  };
}

const getCachedDashboardChargerDetail = unstable_cache(
  async (chargerId: string) =>
    getDashboardChargerDetailUncached(chargerId, new Date()),
  ["dashboard-charger-detail"],
  { revalidate: 450 },
);

export async function getDashboardChargerDetail(
  chargerId: string,
): Promise<DashboardChargerDetail | null> {
  return getCachedDashboardChargerDetail(chargerId);
}

export function buildDashboardListHref(
  pathname: string,
  filters: DashboardFilters,
  page = 1,
  visibleFilters: DashboardVisibleFilter[] = ["status", "price", "output"],
) {
  const params = new URLSearchParams();

  if (visibleFilters.includes("status") && filters.status !== "all") {
    params.set("status", filters.status);
  }

  if (visibleFilters.includes("rawStatus") && filters.rawStatus !== "all") {
    params.set("rawStatus", filters.rawStatus);
  }

  if (visibleFilters.includes("price") && filters.price !== "all") {
    params.set("price", filters.price);
  }

  if (visibleFilters.includes("output") && filters.output !== "all") {
    params.set("output", filters.output);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return query ? `${pathname}?${query}` : pathname;
}
