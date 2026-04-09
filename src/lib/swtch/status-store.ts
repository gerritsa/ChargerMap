import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildChargerStatsBuckets,
  computeObservedOccupancyRate,
  computeTrackedSeconds,
} from "@/lib/charger-stats";
import type { ChargerStatusNormalized } from "@/types/charger";

const DEFAULT_ASSUMED_VEHICLE = "Tesla Model Y";
const DEFAULT_ASSUMED_BATTERY_KWH = 75;
const DEFAULT_ASSUMED_START_SOC = 20;
const DEFAULT_ASSUMED_END_SOC = 80;
const DEFAULT_ESTIMATION_METHOD = "output_kw_x_session_hours_capped_at_45kwh";
const MAX_SESSION_KWH = 45;

type CurrentStatusRow = {
  status_text: string;
  status_normalized: ChargerStatusNormalized;
  unavailable_since: string | null;
  occupied_since: string | null;
  last_changed_at: string;
  last_checked_at: string;
  check_error: string | null;
};

type OpenSessionRow = {
  id: string;
  started_at: string;
};

export type StatusTrackingCharger = {
  chargerId: string;
  listingId: number;
  outputKw: number | null;
  priceModelType?: string | null;
  pricingBaseType: string | null;
  pricingStructureType: string | null;
  baseRate: number | null;
  baseUnit: string | null;
  chargingRatePerHour: number | null;
  tier1RatePerHour: number | null;
  tier1MaxHours: number | null;
  tier2RatePerHour: number | null;
  hasGuestFee: boolean;
  guestFee: number | null;
  hasFlatFee: boolean;
  flatFee: number | null;
  hasIdleFee: boolean;
  idleRate: number | null;
  idleUnit: string | null;
  idleGraceHours: number | null;
  energyRatePerKwh: number | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  firstSeenAt: string;
  trackingStartedAt: string;
};

type RecordStatusCheckInput = {
  supabase: SupabaseClient;
  charger: StatusTrackingCharger;
  statusText: string;
  statusNormalized: ChargerStatusNormalized;
  checkedAt?: string;
};

type RecordCheckErrorInput = {
  supabase: SupabaseClient;
  charger: StatusTrackingCharger;
  checkedAt?: string;
  errorMessage: string;
};

type ChargerStatsRow = {
  observed_occupied_seconds: number | null;
  total_sessions: number | null;
  estimated_all_time_kwh: number | null;
  estimated_all_time_revenue: number | null;
  current_session_started_at: string | null;
};

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toRevenueNumber(value: number | null) {
  return value == null ? null : roundTo(value, 2);
}

function toKwhNumber(value: number | null) {
  return value == null ? null : roundTo(value, 2);
}

function toDurationMinutes(startedAt: string, endedAt: string) {
  const durationMs =
    new Date(endedAt).getTime() - new Date(startedAt).getTime();

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }

  return roundTo(durationMs / 60000, 2);
}

function estimateSessionKwh(outputKw: number | null, durationMinutes: number) {
  if (outputKw == null) {
    return null;
  }

  const sessionHours = durationMinutes / 60;
  return toKwhNumber(Math.min(outputKw * sessionHours, MAX_SESSION_KWH));
}

function estimateChargingHours(
  charger: StatusTrackingCharger,
  sessionHours: number,
  estimatedKwh: number | null,
) {
  if (charger.outputKw == null || charger.outputKw <= 0) {
    return null;
  }

  if (estimatedKwh != null) {
    return Math.min(sessionHours, estimatedKwh / charger.outputKw);
  }

  return Math.min(sessionHours, MAX_SESSION_KWH / charger.outputKw);
}

function estimateIdleHours(
  charger: StatusTrackingCharger,
  sessionHours: number,
  estimatedKwh: number | null,
  effectivePricingStructureType: string | null,
) {
  if (effectivePricingStructureType !== "idle_after_charging") {
    return 0;
  }

  const chargingHours = estimateChargingHours(charger, sessionHours, estimatedKwh);

  if (chargingHours == null) {
    return 0;
  }

  const idleGraceHours = Math.max(0, charger.idleGraceHours ?? 0);
  return Math.max(0, sessionHours - chargingHours - idleGraceHours);
}

function estimateSessionRevenue(
  charger: StatusTrackingCharger,
  durationMinutes: number,
  estimatedKwh: number | null,
) {
  const sessionHours = durationMinutes / 60;
  const guestFee = charger.guestFee ?? 0;
  const flatFee = charger.flatFee ?? 0;
  const fixedFees = guestFee + flatFee;
  const effectivePricingStructureType =
    charger.pricingStructureType ??
    (charger.priceModelType === "tiered_time" ||
    charger.priceModelType === "tiered_time_plus_guest_fee"
      ? "tiered_time"
      : charger.priceModelType === "base_plus_idle" ||
          charger.priceModelType === "base_plus_idle_plus_guest_fee" ||
          charger.priceModelType === "charging_plus_idle"
        ? "idle_after_charging"
        : charger.priceModelType === "time_of_day"
          ? "time_of_day"
          : null);
  const effectivePricingBaseType =
    charger.pricingBaseType ??
    (charger.baseUnit === "kwh" || charger.energyRatePerKwh != null
      ? "energy"
      : charger.baseUnit === "hr" || charger.chargingRatePerHour != null
        ? "hourly"
        : charger.priceModelType === "free" ||
            charger.priceModelType === "free_plus_guest_fee"
          ? "free"
          : charger.priceModelType === "energy_simple" ||
              charger.priceModelType === "energy_plus_guest_fee"
            ? "energy"
            : charger.priceModelType === "hourly_simple" ||
                charger.priceModelType === "hourly_plus_guest_fee" ||
                charger.priceModelType === "charging_plus_idle"
              ? "hourly"
              : null);
  const chargingHours = estimateChargingHours(
    charger,
    sessionHours,
    estimatedKwh,
  );
  const idleHours = estimateIdleHours(
    charger,
    sessionHours,
    estimatedKwh,
    effectivePricingStructureType,
  );
  const idleRevenue =
    effectivePricingStructureType === "idle_after_charging" &&
    charger.idleUnit === "hr" &&
    charger.idleRate != null
      ? charger.idleRate * idleHours
      : 0;

  if (effectivePricingStructureType === "tiered_time") {
    if (
      charger.tier1RatePerHour == null ||
      charger.tier1MaxHours == null ||
      charger.tier2RatePerHour == null
    ) {
      return null;
    }

    const tier1Hours = Math.min(sessionHours, charger.tier1MaxHours);
    const tier2Hours = Math.max(0, sessionHours - charger.tier1MaxHours);

    return toRevenueNumber(
      tier1Hours * charger.tier1RatePerHour +
        tier2Hours * charger.tier2RatePerHour +
        fixedFees,
    );
  }

  switch (effectivePricingBaseType) {
    case "free":
      return toRevenueNumber(fixedFees + idleRevenue);

    case "hourly":
      if (
        charger.baseUnit !== "hr" &&
        charger.baseRate == null &&
        charger.chargingRatePerHour == null
      ) {
        return null;
      }

      return toRevenueNumber(
        ((charger.baseUnit === "hr" ? charger.baseRate : null) ??
          charger.chargingRatePerHour ??
          0) *
          (effectivePricingStructureType === "idle_after_charging"
            ? (chargingHours ?? sessionHours)
            : sessionHours) +
          fixedFees +
          idleRevenue,
      );

    case "energy":
      if (
        ((charger.baseUnit === "kwh" ? charger.baseRate : null) ??
          charger.energyRatePerKwh) == null ||
        estimatedKwh == null
      ) {
        return null;
      }

      return toRevenueNumber(
        (((charger.baseUnit === "kwh" ? charger.baseRate : null) ??
          charger.energyRatePerKwh) ??
          0) *
          estimatedKwh +
          fixedFees +
          idleRevenue,
      );

    default:
      return null;
  }
}

async function getCurrentStatus(
  supabase: SupabaseClient,
  chargerId: string,
) {
  const { data, error } = await supabase
    .from("charger_current_status")
    .select(
      "status_text, status_normalized, unavailable_since, occupied_since, last_changed_at, last_checked_at, check_error",
    )
    .eq("charger_id", chargerId)
    .maybeSingle<CurrentStatusRow>();

  if (error) {
    throw new Error(
      `Failed to load current status for charger ${chargerId}: ${error.message}`,
    );
  }

  return data;
}

async function getCurrentChargerStats(
  supabase: SupabaseClient,
  chargerId: string,
) {
  const { data, error } = await supabase
    .from("charger_stats")
    .select(
      "observed_occupied_seconds, total_sessions, estimated_all_time_kwh, estimated_all_time_revenue, current_session_started_at",
    )
    .eq("charger_id", chargerId)
    .maybeSingle<ChargerStatsRow>();

  if (error) {
    throw new Error(
      `Failed to load charger stats for charger ${chargerId}: ${error.message}`,
    );
  }

  return data;
}

async function upsertCurrentStatus(
  supabase: SupabaseClient,
  chargerId: string,
  payload: {
    statusText: string;
    statusNormalized: ChargerStatusNormalized;
    unavailableSince: string | null;
    occupiedSince: string | null;
    lastChangedAt: string;
    lastCheckedAt: string;
    checkError: string | null;
  },
) {
  const { error } = await supabase.from("charger_current_status").upsert(
    {
      charger_id: chargerId,
      status_text: payload.statusText,
      status_normalized: payload.statusNormalized,
      unavailable_since: payload.unavailableSince,
      occupied_since: payload.occupiedSince,
      last_changed_at: payload.lastChangedAt,
      last_checked_at: payload.lastCheckedAt,
      check_error: payload.checkError,
    },
    {
      onConflict: "charger_id",
    },
  );

  if (error) {
    throw new Error(
      `Failed to update current status for charger ${chargerId}: ${error.message}`,
    );
  }
}

async function upsertChargerStats(
  supabase: SupabaseClient,
  input: {
    charger: StatusTrackingCharger;
    statusText: string;
    statusNormalized: ChargerStatusNormalized;
    unavailableSince: string | null;
    occupiedSince: string | null;
    lastCheckedAt: string;
    currentSessionStartedAt: string | null;
    observedOccupiedSeconds: number;
    totalSessions: number;
    estimatedAllTimeKwh: number;
    estimatedAllTimeRevenue: number;
  },
) {
  const trackedSeconds = computeTrackedSeconds(
    input.charger.trackingStartedAt,
    new Date(input.lastCheckedAt),
  );
  const observedOccupancyRate = computeObservedOccupancyRate({
    trackedSeconds,
    observedOccupiedSeconds: input.observedOccupiedSeconds,
    currentSessionStartedAt: input.currentSessionStartedAt,
    now: new Date(input.lastCheckedAt),
  });
  const buckets = buildChargerStatsBuckets({
    outputKw: input.charger.outputKw,
    priceModelType: input.charger.priceModelType,
    pricingBaseType: input.charger.pricingBaseType,
    pricingStructureType: input.charger.pricingStructureType,
  });

  const { error } = await supabase.from("charger_stats").upsert(
    {
      charger_id: input.charger.chargerId,
      status_text: input.statusText,
      status_normalized: input.statusNormalized,
      unavailable_since: input.unavailableSince,
      occupied_since: input.occupiedSince,
      last_checked_at: input.lastCheckedAt,
      region: input.charger.region,
      price_bucket: buckets.priceBucket,
      output_bucket: buckets.outputBucket,
      total_sessions: input.totalSessions,
      estimated_all_time_kwh: input.estimatedAllTimeKwh,
      estimated_all_time_revenue: input.estimatedAllTimeRevenue,
      observed_occupied_seconds: input.observedOccupiedSeconds,
      tracked_seconds: trackedSeconds,
      observed_occupancy_rate: observedOccupancyRate,
      current_session_started_at: input.currentSessionStartedAt,
      lat: input.charger.lat,
      lng: input.charger.lng,
      updated_at: input.lastCheckedAt,
    },
    {
      onConflict: "charger_id",
    },
  );

  if (error) {
    throw new Error(
      `Failed to update charger stats for charger ${input.charger.chargerId}: ${error.message}`,
    );
  }
}

async function hasTransitionEventRecorded(
  supabase: SupabaseClient,
  chargerId: string,
  existingStatus: CurrentStatusRow,
  nextStatusText: string,
  nextStatusNormalized: ChargerStatusNormalized,
) {
  const { data, error } = await supabase
    .from("charger_status_events")
    .select("changed_at")
    .eq("charger_id", chargerId)
    .eq("from_status_text", existingStatus.status_text)
    .eq("to_status_text", nextStatusText)
    .eq("from_status_normalized", existingStatus.status_normalized)
    .eq("to_status_normalized", nextStatusNormalized)
    .gte("changed_at", existingStatus.last_changed_at)
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ changed_at: string }>();

  if (error) {
    throw new Error(
      `Failed to inspect prior transition events for charger ${chargerId}: ${error.message}`,
    );
  }

  return Boolean(data);
}

async function insertStatusEvent(
  supabase: SupabaseClient,
  chargerId: string,
  existingStatus: CurrentStatusRow,
  nextStatusText: string,
  nextStatusNormalized: ChargerStatusNormalized,
  changedAt: string,
) {
  const alreadyRecorded = await hasTransitionEventRecorded(
    supabase,
    chargerId,
    existingStatus,
    nextStatusText,
    nextStatusNormalized,
  );

  if (alreadyRecorded) {
    return;
  }

  const { error } = await supabase.from("charger_status_events").insert({
    charger_id: chargerId,
    from_status_text: existingStatus.status_text,
    to_status_text: nextStatusText,
    from_status_normalized: existingStatus.status_normalized,
    to_status_normalized: nextStatusNormalized,
    changed_at: changedAt,
  });

  if (error) {
    throw new Error(
      `Failed to insert status event for charger ${chargerId}: ${error.message}`,
    );
  }
}

async function getOpenSession(
  supabase: SupabaseClient,
  chargerId: string,
) {
  const { data, error } = await supabase
    .from("charger_sessions")
    .select("id, started_at")
    .eq("charger_id", chargerId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<OpenSessionRow>();

  if (error) {
    throw new Error(
      `Failed to load open session for charger ${chargerId}: ${error.message}`,
    );
  }

  return data;
}

async function startSession(
  supabase: SupabaseClient,
  charger: StatusTrackingCharger,
  startedAt: string,
  startStatusText: string,
) {
  const existingOpenSession = await getOpenSession(supabase, charger.chargerId);

  if (existingOpenSession) {
    return;
  }

  const { error } = await supabase.from("charger_sessions").insert({
    charger_id: charger.chargerId,
    started_at: startedAt,
    start_status_text: startStatusText,
  });

  if (error) {
    throw new Error(
      `Failed to open session for listing ${charger.listingId}: ${error.message}`,
    );
  }
}

async function closeOpenSession(
  supabase: SupabaseClient,
  charger: StatusTrackingCharger,
  stats: ChargerStatsRow | null,
  endedAt: string,
  endStatusText: string,
) {
  const base = {
    observedOccupiedSeconds: stats?.observed_occupied_seconds ?? 0,
    totalSessions: stats?.total_sessions ?? 0,
    estimatedAllTimeKwh: stats?.estimated_all_time_kwh ?? 0,
    estimatedAllTimeRevenue: stats?.estimated_all_time_revenue ?? 0,
    currentSessionStartedAt: null,
  };
  const openSession = await getOpenSession(supabase, charger.chargerId);

  if (!openSession) {
    return base;
  }

  const durationMinutes = toDurationMinutes(openSession.started_at, endedAt);
  const estimatedKwh = estimateSessionKwh(charger.outputKw, durationMinutes);
  const estimatedRevenue = estimateSessionRevenue(
    charger,
    durationMinutes,
    estimatedKwh,
  );

  const { error } = await supabase
    .from("charger_sessions")
    .update({
      ended_at: endedAt,
      end_status_text: endStatusText,
      duration_minutes: durationMinutes,
      estimated_kwh: estimatedKwh,
      estimated_revenue: estimatedRevenue,
      assumed_vehicle: DEFAULT_ASSUMED_VEHICLE,
      assumed_battery_kwh: DEFAULT_ASSUMED_BATTERY_KWH,
      assumed_start_soc: DEFAULT_ASSUMED_START_SOC,
      assumed_end_soc: DEFAULT_ASSUMED_END_SOC,
      estimation_method: DEFAULT_ESTIMATION_METHOD,
    })
    .eq("id", openSession.id);

  if (error) {
    throw new Error(
      `Failed to close session for listing ${charger.listingId}: ${error.message}`,
    );
  }

  const nextTotalSessions = (stats?.total_sessions ?? 0) + 1;
  const nextEstimatedAllTimeKwh = toKwhNumber(
    (stats?.estimated_all_time_kwh ?? 0) + (estimatedKwh ?? 0),
  );
  const nextEstimatedAllTimeRevenue = toRevenueNumber(
    (stats?.estimated_all_time_revenue ?? 0) + (estimatedRevenue ?? 0),
  );
  const nextObservedOccupiedSeconds =
    (stats?.observed_occupied_seconds ?? 0) + Math.max(0, Math.round(durationMinutes * 60));

  const { error: chargerError } = await supabase
    .from("chargers")
    .update({
      total_sessions: nextTotalSessions,
      estimated_all_time_kwh: nextEstimatedAllTimeKwh ?? 0,
      estimated_all_time_revenue: nextEstimatedAllTimeRevenue ?? 0,
    })
    .eq("id", charger.chargerId);

  if (chargerError) {
    throw new Error(
      `Failed to update charger aggregates for charger ${charger.chargerId}: ${chargerError.message}`,
    );
  }

  return {
    observedOccupiedSeconds: nextObservedOccupiedSeconds,
    totalSessions: nextTotalSessions,
    estimatedAllTimeKwh: nextEstimatedAllTimeKwh ?? 0,
    estimatedAllTimeRevenue: nextEstimatedAllTimeRevenue ?? 0,
    currentSessionStartedAt: null,
  };
}

export async function recordCheckError({
  supabase,
  charger,
  checkedAt = new Date().toISOString(),
  errorMessage,
}: RecordCheckErrorInput) {
  const [existingStatus, existingStats] = await Promise.all([
    getCurrentStatus(supabase, charger.chargerId),
    getCurrentChargerStats(supabase, charger.chargerId),
  ]);

  await upsertCurrentStatus(supabase, charger.chargerId, {
    statusText: existingStatus?.status_text ?? "UNKNOWN",
    statusNormalized: existingStatus?.status_normalized ?? "unknown",
    unavailableSince: existingStatus?.unavailable_since ?? null,
    occupiedSince: existingStatus?.occupied_since ?? null,
    lastChangedAt: existingStatus?.last_changed_at ?? checkedAt,
    lastCheckedAt: checkedAt,
    checkError: errorMessage,
  });

  await upsertChargerStats(supabase, {
    charger,
    statusText: existingStatus?.status_text ?? "UNKNOWN",
    statusNormalized: existingStatus?.status_normalized ?? "unknown",
    unavailableSince: existingStatus?.unavailable_since ?? null,
    occupiedSince: existingStatus?.occupied_since ?? null,
    lastCheckedAt: checkedAt,
    currentSessionStartedAt:
      existingStats?.current_session_started_at ??
      existingStatus?.occupied_since ??
      null,
    observedOccupiedSeconds: existingStats?.observed_occupied_seconds ?? 0,
    totalSessions: existingStats?.total_sessions ?? 0,
    estimatedAllTimeKwh: existingStats?.estimated_all_time_kwh ?? 0,
    estimatedAllTimeRevenue: existingStats?.estimated_all_time_revenue ?? 0,
  });
}

export async function recordStatusCheck({
  supabase,
  charger,
  statusText,
  statusNormalized,
  checkedAt = new Date().toISOString(),
}: RecordStatusCheckInput) {
  const [existingStatus, existingStats] = await Promise.all([
    getCurrentStatus(supabase, charger.chargerId),
    getCurrentChargerStats(supabase, charger.chargerId),
  ]);
  const rawStatusChanged =
    !existingStatus || existingStatus.status_text !== statusText;
  const normalizedStatusChanged =
    !existingStatus || existingStatus.status_normalized !== statusNormalized;

  if (!rawStatusChanged && !normalizedStatusChanged) {
    await upsertCurrentStatus(supabase, charger.chargerId, {
      statusText,
      statusNormalized,
      unavailableSince: existingStatus.unavailable_since,
      occupiedSince: existingStatus.occupied_since,
      lastChangedAt: existingStatus.last_changed_at,
      lastCheckedAt: checkedAt,
      checkError: null,
    });

    await upsertChargerStats(supabase, {
      charger,
      statusText,
      statusNormalized,
      unavailableSince: existingStatus.unavailable_since,
      occupiedSince: existingStatus.occupied_since,
      lastCheckedAt: checkedAt,
      currentSessionStartedAt:
        existingStats?.current_session_started_at ??
        existingStatus.occupied_since ??
        null,
      observedOccupiedSeconds: existingStats?.observed_occupied_seconds ?? 0,
      totalSessions: existingStats?.total_sessions ?? 0,
      estimatedAllTimeKwh: existingStats?.estimated_all_time_kwh ?? 0,
      estimatedAllTimeRevenue: existingStats?.estimated_all_time_revenue ?? 0,
    });
    return;
  }

  if (existingStatus) {
    await insertStatusEvent(
      supabase,
      charger.chargerId,
      existingStatus,
      statusText,
      statusNormalized,
      checkedAt,
    );
  }

  if (normalizedStatusChanged) {
    const previousNormalized = existingStatus?.status_normalized ?? "unknown";
    let aggregateUpdate = {
      observedOccupiedSeconds: existingStats?.observed_occupied_seconds ?? 0,
      totalSessions: existingStats?.total_sessions ?? 0,
      estimatedAllTimeKwh: existingStats?.estimated_all_time_kwh ?? 0,
      estimatedAllTimeRevenue: existingStats?.estimated_all_time_revenue ?? 0,
      currentSessionStartedAt:
        existingStats?.current_session_started_at ??
        existingStatus?.occupied_since ??
        null,
    };

    if (previousNormalized !== "occupied" && statusNormalized === "occupied") {
      await startSession(supabase, charger, checkedAt, statusText);
      aggregateUpdate = {
        ...aggregateUpdate,
        currentSessionStartedAt: checkedAt,
      };
    } else if (
      previousNormalized === "occupied" &&
      statusNormalized !== "occupied"
    ) {
      aggregateUpdate = await closeOpenSession(
        supabase,
        charger,
        existingStats,
        checkedAt,
        statusText,
      );
    }

    await upsertCurrentStatus(supabase, charger.chargerId, {
      statusText,
      statusNormalized,
      unavailableSince:
        statusNormalized === "unavailable"
          ? checkedAt
          : null,
      occupiedSince:
        statusNormalized === "occupied"
          ? checkedAt
          : null,
      lastChangedAt: checkedAt,
      lastCheckedAt: checkedAt,
      checkError: null,
    });

    await upsertChargerStats(supabase, {
      charger,
      statusText,
      statusNormalized,
      unavailableSince: statusNormalized === "unavailable" ? checkedAt : null,
      occupiedSince: statusNormalized === "occupied" ? checkedAt : null,
      lastCheckedAt: checkedAt,
      currentSessionStartedAt:
        statusNormalized === "occupied"
          ? aggregateUpdate.currentSessionStartedAt
          : null,
      observedOccupiedSeconds: aggregateUpdate.observedOccupiedSeconds,
      totalSessions: aggregateUpdate.totalSessions,
      estimatedAllTimeKwh: aggregateUpdate.estimatedAllTimeKwh,
      estimatedAllTimeRevenue: aggregateUpdate.estimatedAllTimeRevenue,
    });
    return;
  }

  await upsertCurrentStatus(supabase, charger.chargerId, {
    statusText,
    statusNormalized,
    unavailableSince: existingStatus?.unavailable_since ?? null,
    occupiedSince: existingStatus?.occupied_since ?? null,
    lastChangedAt: existingStatus?.last_changed_at ?? checkedAt,
    lastCheckedAt: checkedAt,
    checkError: null,
  });

  await upsertChargerStats(supabase, {
    charger,
    statusText,
    statusNormalized,
    unavailableSince: existingStatus?.unavailable_since ?? null,
    occupiedSince: existingStatus?.occupied_since ?? null,
    lastCheckedAt: checkedAt,
    currentSessionStartedAt:
      existingStats?.current_session_started_at ??
      existingStatus?.occupied_since ??
      null,
    observedOccupiedSeconds: existingStats?.observed_occupied_seconds ?? 0,
    totalSessions: existingStats?.total_sessions ?? 0,
    estimatedAllTimeKwh: existingStats?.estimated_all_time_kwh ?? 0,
    estimatedAllTimeRevenue: existingStats?.estimated_all_time_revenue ?? 0,
  });
}
