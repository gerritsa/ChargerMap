import { differenceInSeconds, subDays } from "date-fns";

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
  DashboardOccupancyListData,
  DashboardPriceBucket,
  DashboardProfitabilityListData,
  DashboardStatusFilter,
  DashboardUnavailableListData,
  DashboardVisibleFilter,
} from "@/types/dashboard";
import type { ChargerStatusNormalized } from "@/types/charger";

type SearchParamValue = string | string[] | undefined;
type DashboardQueryParams = Record<string, SearchParamValue>;

type SupabaseDashboardJoinedChargerRow = {
  listing_id: number;
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
  pricing_base_type: string | null;
  pricing_structure_type: string | null;
  first_seen_at: string | null;
  is_active?: boolean | null;
  is_decommissioned?: boolean | null;
};

type SupabaseDashboardStatsRow = {
  charger_id: string;
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
  chargers: SupabaseDashboardJoinedChargerRow | SupabaseDashboardJoinedChargerRow[] | null;
};

type SupabaseSessionRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  estimated_kwh: number | null;
  estimated_revenue: number | null;
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

function normalizeJoinedCharger(
  value:
    | SupabaseDashboardJoinedChargerRow
    | SupabaseDashboardJoinedChargerRow[]
    | null,
) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function getDashboardBaseSelect() {
  return `
    charger_id,
    status_text,
    status_normalized,
    unavailable_since,
    last_checked_at,
    region,
    price_bucket,
    output_bucket,
    total_sessions,
    estimated_all_time_revenue,
    estimated_all_time_kwh,
    observed_occupied_seconds,
    tracked_seconds,
    observed_occupancy_rate,
    current_session_started_at,
    chargers!inner(
      listing_id,
      charger_identifier,
      title,
      image_url,
      address_text,
      map_url,
      lat,
      lng,
      output_kw,
      output_text,
      price_text,
      schedule_text,
      price_model_type,
      pricing_base_type,
      pricing_structure_type,
      first_seen_at,
      is_active,
      is_decommissioned
    )
  `;
}

function normalizeSupabaseDashboardRow(
  row: SupabaseDashboardStatsRow,
  now: Date,
): DashboardBaseRow | null {
  const joined = normalizeJoinedCharger(row.chargers);

  if (!joined) {
    return null;
  }

  const chargerIdentifier =
    joined.charger_identifier?.trim() || `SWTCH-${joined.listing_id}`;
  const firstSeenAt = joined.first_seen_at ?? now.toISOString();
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
    listingId: joined.listing_id,
    chargerIdentifier,
    title: joined.title ?? `SWTCH Charger ${chargerIdentifier}`,
    imageUrl: joined.image_url,
    address: joined.address_text,
    mapUrl: joined.map_url,
    lat: joined.lat,
    lng: joined.lng,
    region: row.region,
    outputKw: joined.output_kw,
    outputBucket: row.output_bucket ?? getOutputBucket(joined.output_kw),
    outputText: joined.output_text ?? "Unknown output",
    priceText: joined.price_text ?? "Pricing pending",
    scheduleText: joined.schedule_text ?? "Schedule pending",
    priceModelType: joined.price_model_type,
    priceBucket:
      (row.price_bucket as Exclude<DashboardPriceBucket, "all"> | null) ??
      derivePriceBucketFromLegacyFields({
        priceModelType: joined.price_model_type,
        pricingBaseType: joined.pricing_base_type,
        pricingStructureType: joined.pricing_structure_type,
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

async function fetchDashboardUniverseOptions() {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    const rows = buildMockDashboardRows(new Date());
    return {
      regions: Array.from(
        new Set(rows.map((row) => row.region).filter((value): value is string => Boolean(value))),
      ).sort((left, right) => left.localeCompare(right)),
      outputs: Array.from(new Set(rows.map((row) => row.outputBucket))).sort(
        (left, right) => Number(left) - Number(right),
      ),
      hasLiveData: false,
    };
  }

  const [{ data: regionData, error: regionError }, { data: outputData, error: outputError }] =
    await Promise.all([
      supabase.rpc("get_dashboard_regions", {
        filter_status: null,
        filter_price: null,
        filter_output: null,
      }),
      supabase.rpc("get_dashboard_outputs", {
        filter_status: null,
        filter_region: null,
        filter_price: null,
      }),
    ]);

  if (regionError || outputError || !regionData || !outputData) {
    return {
      regions: [] as string[],
      outputs: [] as string[],
      hasLiveData: false,
    };
  }

  return {
    regions: Array.from(
      new Set(
        (regionData as Array<{ region: string | null }>)
          .map((row) => row.region)
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((left, right) => left.localeCompare(right)),
    outputs: Array.from(
      new Set(
        ((outputData as Array<{ output_bucket: string | null }>) ?? [])
          .map((row) => row.output_bucket ?? "unknown")
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((left, right) => Number(left) - Number(right)),
    hasLiveData: true,
  };
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

  let query = supabase
    .from("charger_stats")
    .select(getDashboardBaseSelect())
    .eq("chargers.tracking_scope", "toronto")
    .eq("chargers.is_active", true)
    .eq("chargers.is_decommissioned", false);

  if (filters.status !== "all") {
    query = query.eq("status_normalized", filters.status);
  }

  if (filters.region !== "all") {
    query = query.eq("region", filters.region);
  }

  if (filters.rawStatus !== "all") {
    query = query.eq("status_text", filters.rawStatus);
  }

  if (filters.price !== "all") {
    query = query.eq("price_bucket", filters.price);
  }

  if (filters.output !== "all") {
    query = query.eq("output_bucket", filters.output);
  }

  if (shouldExcludeNotLive) {
    query = query.neq("status_normalized", "not_live");
  }

  if (options.statusFilter) {
    query = query.eq("status_normalized", options.statusFilter);
  }

  query = query
    .order(options.orderBy, { ascending: options.ascending ?? false })
    .order("total_sessions", { ascending: false })
    .range(
      options.offset ?? 0,
      (options.offset ?? 0) + (options.limit ?? 10) - 1,
    );

  const { data, error } = await query;

  if (error || !data) {
    return [] as DashboardBaseRow[];
  }

  return ((data as unknown) as SupabaseDashboardStatsRow[])
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

  let query = supabase
    .from("charger_stats")
    .select("charger_id, chargers!inner(id)", { count: "exact", head: true })
    .eq("chargers.tracking_scope", "toronto")
    .eq("chargers.is_active", true)
    .eq("chargers.is_decommissioned", false);

  if (filters.status !== "all") {
    query = query.eq("status_normalized", filters.status);
  }

  if (filters.region !== "all") {
    query = query.eq("region", filters.region);
  }

  if (filters.rawStatus !== "all") {
    query = query.eq("status_text", filters.rawStatus);
  }

  if (filters.price !== "all") {
    query = query.eq("price_bucket", filters.price);
  }

  if (filters.output !== "all") {
    query = query.eq("output_bucket", filters.output);
  }

  if (shouldExcludeNotLive) {
    query = query.neq("status_normalized", "not_live");
  }

  if (options.statusFilter) {
    query = query.eq("status_normalized", options.statusFilter);
  }

  const { count, error } = await query;

  if (error) {
    return 0;
  }

  return count ?? 0;
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

  let query = supabase
    .from("charger_stats")
    .select("status_text, chargers!inner(id)")
    .eq("chargers.tracking_scope", "toronto")
    .eq("chargers.is_active", true)
    .eq("chargers.is_decommissioned", false);

  if (filters.status !== "all") {
    query = query.eq("status_normalized", filters.status);
  }

  if (filters.region !== "all") {
    query = query.eq("region", filters.region);
  }

  if (filters.price !== "all") {
    query = query.eq("price_bucket", filters.price);
  }

  if (filters.output !== "all") {
    query = query.eq("output_bucket", filters.output);
  }

  if (shouldExcludeNotLive) {
    query = query.neq("status_normalized", "not_live");
  }

  if (options.statusFilter) {
    query = query.eq("status_normalized", options.statusFilter);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [] as string[];
  }

  const statusCounts = (((data as unknown) as Array<{ status_text: string | null }>) ?? []).reduce(
    (counts, row) => {
      const statusText = row.status_text?.trim() || "UNKNOWN";
      counts.set(statusText, (counts.get(statusText) ?? 0) + 1);
      return counts;
    },
    new Map<string, number>(),
  );

  return Array.from(statusCounts.entries())
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

function isValidStatusFilter(value: string | undefined): value is DashboardStatusFilter {
  return Boolean(
    value &&
      ["all", "available", "occupied", "unavailable", "not_live", "unknown"].includes(
        value,
      ),
  );
}

function isValidPriceBucket(value: string | undefined): value is DashboardPriceBucket {
  return Boolean(
    value &&
      ["all", "free", "hourly", "energy", "complex", "unknown"].includes(value),
  );
}

function normalizeDashboardFilters(
  rawSearchParams: DashboardQueryParams = {},
  options: { regions: string[]; outputs: string[] },
): DashboardFilters {
  const status = getSingleParam(rawSearchParams.status);
  const rawStatus = getSingleParam(rawSearchParams.rawStatus);
  const price = getSingleParam(rawSearchParams.price);
  const region = getSingleParam(rawSearchParams.region);
  const output = getSingleParam(rawSearchParams.output);

  return {
    status: isValidStatusFilter(status) ? status : DEFAULT_FILTERS.status,
    rawStatus: rawStatus?.trim() ? rawStatus.trim() : DEFAULT_FILTERS.rawStatus,
    price: isValidPriceBucket(price) ? price : DEFAULT_FILTERS.price,
    region: region && options.regions.includes(region) ? region : DEFAULT_FILTERS.region,
    output:
      output && (output === "unknown" || options.outputs.includes(output))
        ? output
        : DEFAULT_FILTERS.output,
  };
}

function normalizeDashboardPage(rawSearchParams: DashboardQueryParams = {}) {
  const pageValue = Number(getSingleParam(rawSearchParams.page));

  if (!Number.isFinite(pageValue) || pageValue < 1) {
    return 1;
  }

  return Math.floor(pageValue);
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

export async function getDashboardData(now = new Date()): Promise<DashboardData> {
  const filters = DEFAULT_FILTERS;
  const [{ hasLiveData }, snapshot, topUnavailableRows, topOccupancyRows, topProfitableRows] =
    await Promise.all([
      fetchDashboardUniverseOptions(),
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
  kpis.observedOccupancyRate =
    snapshot.trackedSeconds > 0
      ? kpis.observedOccupancyRate / snapshot.trackedSeconds
      : 0;

  return {
    kpis,
    occupancyRows: topOccupancyRows.map((row) => ({
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
    unavailableRows: topUnavailableRows
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
    profitableRows: topProfitableRows.map((row) => ({
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
    hasLiveData: hasLiveData && snapshot.hasLiveData,
  };
}

async function getDashboardListData(
  kind: "unavailable" | "occupancy" | "profitability",
  rawSearchParams: DashboardQueryParams = {},
  now = new Date(),
) {
  const universeOptions = await fetchDashboardUniverseOptions();
  const requestedFilters = normalizeDashboardFilters(rawSearchParams, universeOptions);
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

  const totalPages = Math.max(1, Math.ceil(totalItems / DASHBOARD_LIST_PAGE_SIZE));
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
      ...outputFilterOptions,
      rawStatuses: rawStatusOptions,
    }),
    visibleFilters,
    pagination: {
      page,
      pageSize: DASHBOARD_LIST_PAGE_SIZE,
      totalItems,
      totalPages,
    },
    rows: pageRows,
    generatedAt: now.toISOString(),
    hasLiveData: universeOptions.hasLiveData,
  };
}

export async function getDashboardUnavailableListData(
  rawSearchParams: DashboardQueryParams = {},
  now = new Date(),
): Promise<DashboardUnavailableListData> {
  const data = await getDashboardListData("unavailable", rawSearchParams, now);

  return {
    ...data,
    rows: data.rows
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

export async function getDashboardOccupancyListData(
  rawSearchParams: DashboardQueryParams = {},
  now = new Date(),
): Promise<DashboardOccupancyListData> {
  const data = await getDashboardListData("occupancy", rawSearchParams, now);

  return {
    ...data,
    rows: data.rows.map((row) => ({
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

export async function getDashboardProfitabilityListData(
  rawSearchParams: DashboardQueryParams = {},
  now = new Date(),
): Promise<DashboardProfitabilityListData> {
  const data = await getDashboardListData("profitability", rawSearchParams, now);

  return {
    ...data,
    rows: data.rows.map((row) => ({
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

export async function getDashboardChargerDetail(
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

  const rowQuery = supabase
    .from("charger_stats")
    .select(getDashboardBaseSelect())
    .eq("charger_id", chargerId)
    .eq("chargers.tracking_scope", "toronto")
    .eq("chargers.is_active", true)
    .eq("chargers.is_decommissioned", false)
    .limit(1);

  const { data: rows, error: rowError } = await rowQuery;

  if (rowError || !rows?.length) {
    return null;
  }

  const charger = normalizeSupabaseDashboardRow(
    rows[0] as unknown as SupabaseDashboardStatsRow,
    now,
  );

  if (!charger) {
    return null;
  }

  const { data: sessions, error: sessionError } = await supabase
    .from("charger_sessions")
    .select("id, started_at, ended_at, estimated_kwh, estimated_revenue")
    .eq("charger_id", chargerId)
    .order("started_at", { ascending: false })
    .limit(8);

  if (sessionError) {
    console.error("Failed to load charger sessions", sessionError.message);
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
    recentSessions: (((sessions ?? []) as unknown) as SupabaseSessionRow[]).map((session) => {
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
