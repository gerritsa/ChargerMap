import { unstable_cache } from "next/cache";

import { mockChargers } from "@/data/mock-chargers";
import {
  buildMapMetricsFromDetails,
  DEFAULT_MAP_BOUNDS,
} from "@/lib/charger-stats";
import { isPointInToronto } from "@/lib/toronto-scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  Charger,
  ChargerMapMetrics,
  MapBounds,
  MapChargerSummary,
} from "@/types/charger";

type MapDataResponse = {
  summaries: MapChargerSummary[];
  metrics: ChargerMapMetrics;
};

type SupabaseMapSummaryRow = {
  charger_id: string;
  listing_id: number;
  charger_identifier: string | null;
  status_text: string | null;
  status_normalized: Charger["statusNormalized"] | null;
  lat: number | null;
  lng: number | null;
};

type SupabaseMapDetailRow = {
  charger_id: string;
  listing_id: number;
  charger_identifier: string | null;
  title: string | null;
  image_url: string | null;
  address_text: string | null;
  map_url: string | null;
  lat: number | null;
  lng: number | null;
  output_text: string | null;
  price_text: string | null;
  schedule_text: string | null;
  status_text: string | null;
  status_normalized: Charger["statusNormalized"] | null;
  last_checked_at: string | null;
  total_sessions: number | null;
  estimated_all_time_revenue: number | null;
  estimated_all_time_kwh: number | null;
  unavailable_since: string | null;
};

type SupabaseMapNetworkMetricRow = {
  status_text: string | null;
  status_normalized: Charger["statusNormalized"] | null;
  status_count: number | null;
  total_chargers: number | null;
  all_time_sessions: number | null;
  estimated_all_time_revenue: number | null;
  estimated_all_time_kwh: number | null;
};

type SupabaseAggregateValueRow = {
  total_estimated_kwh: number | null;
};

type SupabaseMapViewportPayloadRow = {
  summaries: SupabaseMapSummaryRow[] | null;
  total_chargers: number | null;
  currently_occupied: number | null;
  available_now: number | null;
  unavailable_now: number | null;
  not_live_now: number | null;
  all_time_sessions: number | null;
  estimated_all_time_revenue: number | null;
  estimated_all_time_kwh: number | null;
  last_24_hours_estimated_kwh: number | null;
  raw_status_breakdown:
    | Array<{
        status_text: string | null;
        status_normalized: Charger["statusNormalized"] | null;
        count: number | null;
      }>
    | null;
};

function isWithinBounds(bounds: MapBounds, lat: number, lng: number) {
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}

function normalizeSummaryRow(row: SupabaseMapSummaryRow): MapChargerSummary | null {
  if (row.lat == null || row.lng == null) {
    return null;
  }

  const chargerIdentifier =
    row.charger_identifier?.trim() || `SWTCH-${row.listing_id}`;

  return {
    id: row.charger_id,
    chargerIdentifier,
    lat: row.lat,
    lng: row.lng,
    statusText: row.status_text ?? "UNKNOWN",
    statusNormalized: row.status_normalized ?? "unknown",
  };
}

function normalizeDetailRow(row: SupabaseMapDetailRow): Charger | null {
  if (row.lat == null || row.lng == null) {
    return null;
  }

  const chargerIdentifier =
    row.charger_identifier?.trim() || `SWTCH-${row.listing_id}`;

  return {
    id: row.charger_id,
    listingId: row.listing_id,
    chargerIdentifier,
    title: row.title ?? `SWTCH Charger ${chargerIdentifier}`,
    imageUrl: row.image_url,
    address: row.address_text ?? "Address pending",
    mapUrl: row.map_url,
    lat: row.lat,
    lng: row.lng,
    outputText: row.output_text ?? "Unknown output",
    priceText: row.price_text ?? "Pricing pending",
    scheduleText: row.schedule_text ?? "Schedule pending",
    statusText: row.status_text ?? "UNKNOWN",
    statusNormalized: row.status_normalized ?? "unknown",
    lastCheckedAt: row.last_checked_at ?? new Date().toISOString(),
    totalSessions: row.total_sessions ?? 0,
    estimatedAllTimeRevenue: row.estimated_all_time_revenue ?? 0,
    estimatedAllTimeKwh: row.estimated_all_time_kwh ?? 0,
    unavailableSince: row.unavailable_since ?? null,
    source: "supabase",
  };
}

function buildMockMapData(bounds: MapBounds): MapDataResponse {
  const chargers = mockChargers.filter(
    (charger) =>
      isPointInToronto(charger.lat, charger.lng) &&
      isWithinBounds(bounds, charger.lat, charger.lng),
  );

  return {
    summaries: chargers.map((charger) => ({
      id: charger.id,
      chargerIdentifier: charger.chargerIdentifier,
      lat: charger.lat,
      lng: charger.lng,
      statusText: charger.statusText,
      statusNormalized: charger.statusNormalized,
    })),
    metrics: buildMapMetricsFromDetails(chargers),
  };
}

async function getLast24HoursEstimatedKwhForScope(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  scope: string,
) {
  if (!supabase) {
    return 0;
  }

  const { data, error } = await supabase.rpc(
    "get_public_estimated_kwh_for_scope",
    {
      target_scope: scope,
    },
  );

  if (error) {
    return 0;
  }

  const row = ((data ?? []) as SupabaseAggregateValueRow[])[0];
  return row?.total_estimated_kwh ?? 0;
}

function buildMockChargerGroup(chargerId: string) {
  const selected = mockChargers.find((charger) => charger.id === chargerId);

  if (!selected) {
    return null;
  }

  return mockChargers
    .filter(
      (charger) => charger.lat === selected.lat && charger.lng === selected.lng,
    )
    .sort((left, right) =>
      left.chargerIdentifier.localeCompare(right.chargerIdentifier),
    );
}

export async function getMapDataForBounds(
  bounds: MapBounds = DEFAULT_MAP_BOUNDS,
): Promise<MapDataResponse> {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return buildMockMapData(bounds);
  }

  const { data, error } = await supabase.rpc("get_public_map_viewport_payload", {
    bounds_west: bounds.west,
    bounds_south: bounds.south,
    bounds_east: bounds.east,
    bounds_north: bounds.north,
  });

  if (error || !data) {
    return buildMockMapData(bounds);
  }

  const payloadRow = ((data ?? []) as SupabaseMapViewportPayloadRow[])[0];
  const summaryRows = (payloadRow?.summaries ?? []) as SupabaseMapSummaryRow[];
  const summaries = summaryRows
    .map((row) => normalizeSummaryRow(row))
    .filter((summary): summary is MapChargerSummary => Boolean(summary));

  return {
    summaries,
    metrics: {
      totalChargers: payloadRow?.total_chargers ?? summaries.length,
      currentlyOccupied: payloadRow?.currently_occupied ?? 0,
      availableNow: payloadRow?.available_now ?? 0,
      unavailableNow: payloadRow?.unavailable_now ?? 0,
      notLiveNow: payloadRow?.not_live_now ?? 0,
      allTimeSessions: payloadRow?.all_time_sessions ?? 0,
      allTimeEstimatedRevenue: payloadRow?.estimated_all_time_revenue ?? 0,
      allTimeEstimatedKwh: payloadRow?.estimated_all_time_kwh ?? 0,
      last24HoursEstimatedKwh: payloadRow?.last_24_hours_estimated_kwh ?? 0,
      rawStatusBreakdown: ((payloadRow?.raw_status_breakdown ?? []) as NonNullable<
        SupabaseMapViewportPayloadRow["raw_status_breakdown"]
      >).map((row) => ({
        statusText: row.status_text ?? "UNKNOWN",
        statusNormalized: row.status_normalized ?? "unknown",
        count: row.count ?? 0,
      })),
    },
  };
}

export async function getMapNetworkMetrics(): Promise<ChargerMapMetrics> {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return buildMapMetricsFromDetails(
      mockChargers.filter((charger) => isPointInToronto(charger.lat, charger.lng)),
    );
  }

  const { data, error } = await supabase.rpc("get_map_network_metrics");

  if (error || !data) {
    return buildMapMetricsFromDetails(mockChargers);
  }

  const rows = data as unknown as SupabaseMapNetworkMetricRow[];
  const first = rows[0];
  const last24HoursEstimatedKwh = await getLast24HoursEstimatedKwhForScope(
    supabase,
    "toronto",
  );

  return {
    totalChargers: first?.total_chargers ?? 0,
    currentlyOccupied: rows.reduce(
      (sum, row) =>
        sum + (row.status_normalized === "occupied" ? row.status_count ?? 0 : 0),
      0,
    ),
    availableNow: rows.reduce(
      (sum, row) =>
        sum + (row.status_normalized === "available" ? row.status_count ?? 0 : 0),
      0,
    ),
    unavailableNow: rows.reduce(
      (sum, row) =>
        sum + (row.status_normalized === "unavailable" ? row.status_count ?? 0 : 0),
      0,
    ),
    notLiveNow: rows.reduce(
      (sum, row) =>
        sum + (row.status_normalized === "not_live" ? row.status_count ?? 0 : 0),
      0,
    ),
    allTimeSessions: first?.all_time_sessions ?? 0,
    allTimeEstimatedRevenue: first?.estimated_all_time_revenue ?? 0,
    allTimeEstimatedKwh: first?.estimated_all_time_kwh ?? 0,
    last24HoursEstimatedKwh,
    rawStatusBreakdown: rows.map((row) => ({
      statusText: row.status_text ?? "UNKNOWN",
      statusNormalized: row.status_normalized ?? "unknown",
      count: row.status_count ?? 0,
    })),
  };
}

async function getMapChargerGroupUncached(
  chargerId: string,
): Promise<Charger[] | null> {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return buildMockChargerGroup(chargerId);
  }

  const { data, error } = await supabase.rpc("get_map_charger_group", {
    target_charger_id: chargerId,
  });

  if (error || !data?.length) {
    return buildMockChargerGroup(chargerId);
  }

  const chargers = (data as unknown as SupabaseMapDetailRow[])
    .map((row) => normalizeDetailRow(row))
    .filter((charger): charger is Charger => Boolean(charger))
    .sort((left, right) =>
      left.chargerIdentifier.localeCompare(right.chargerIdentifier),
    );

  return chargers.length ? chargers : null;
}

const getCachedMapChargerGroup = unstable_cache(
  async (chargerId: string) => getMapChargerGroupUncached(chargerId),
  ["map-charger-group"],
  { revalidate: 60 },
);

export async function getMapChargerGroup(
  chargerId: string,
): Promise<Charger[] | null> {
  return getCachedMapChargerGroup(chargerId);
}

export { DEFAULT_MAP_BOUNDS };
