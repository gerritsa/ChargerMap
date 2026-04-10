import { differenceInSeconds } from "date-fns";

import type {
  Charger,
  ChargerMapMetrics,
  ChargerStatusNormalized,
  MapBounds,
  MapChargerSummary,
} from "@/types/charger";
import { TORONTO_MAP_BOUNDS } from "@/lib/toronto-scope";

export const DEFAULT_MAP_BOUNDS: MapBounds = TORONTO_MAP_BOUNDS;

export type ChargerStatsBuckets = {
  priceBucket: string;
  outputBucket: string;
};

export function getPriceBucket(priceModelType: string | null) {
  switch (priceModelType) {
    case "free":
    case "free_plus_guest_fee":
      return "free";
    case "hourly_simple":
    case "hourly_plus_guest_fee":
      return "hourly";
    case "energy_simple":
    case "energy_plus_guest_fee":
      return "energy";
    case "charging_plus_idle":
    case "base_plus_idle":
    case "base_plus_idle_plus_guest_fee":
    case "free_plus_idle":
    case "free_plus_idle_plus_guest_fee":
    case "hourly_plus_idle":
    case "hourly_plus_idle_plus_guest_fee":
    case "energy_plus_idle":
    case "energy_plus_idle_plus_guest_fee":
    case "tiered_time":
    case "tiered_time_plus_guest_fee":
      return "complex";
    default:
      return "unknown";
  }
}

export function getOutputBucket(outputKw: number | null) {
  if (outputKw == null) {
    return "unknown";
  }

  return Math.round(outputKw).toString();
}

export function derivePriceBucketFromLegacyFields(input: {
  priceModelType?: string | null;
  pricingBaseType?: string | null;
  pricingStructureType?: string | null;
}) {
  if (
    input.pricingStructureType === "tiered_time" ||
    input.pricingStructureType === "idle_after_charging"
  ) {
    return "complex";
  }

  if (input.pricingStructureType === "time_of_day") {
    return "unknown";
  }

  switch (input.pricingBaseType) {
    case "free":
      return "free";
    case "hourly":
      return "hourly";
    case "energy":
      return "energy";
    default:
      return getPriceBucket(input.priceModelType ?? null);
  }
}

export function buildChargerStatsBuckets(input: {
  outputKw: number | null;
  priceModelType?: string | null;
  pricingBaseType?: string | null;
  pricingStructureType?: string | null;
}): ChargerStatsBuckets {
  return {
    priceBucket: derivePriceBucketFromLegacyFields(input),
    outputBucket: getOutputBucket(input.outputKw),
  };
}

export function computeTrackedSeconds(firstSeenAt: string, now = new Date()) {
  return Math.max(0, differenceInSeconds(now, new Date(firstSeenAt)));
}

export function computeObservedOccupiedSeconds(args: {
  observedOccupiedSeconds: number;
  currentSessionStartedAt: string | null;
  now?: Date;
}) {
  const base = Math.max(0, args.observedOccupiedSeconds);

  if (!args.currentSessionStartedAt) {
    return base;
  }

  return (
    base +
    Math.max(0, differenceInSeconds(args.now ?? new Date(), new Date(args.currentSessionStartedAt)))
  );
}

export function computeObservedOccupancyRate(args: {
  trackedSeconds: number;
  observedOccupiedSeconds: number;
  currentSessionStartedAt: string | null;
  now?: Date;
}) {
  const trackedSeconds = Math.max(0, args.trackedSeconds);

  if (trackedSeconds === 0) {
    return 0;
  }

  return (
    computeObservedOccupiedSeconds({
      observedOccupiedSeconds: args.observedOccupiedSeconds,
      currentSessionStartedAt: args.currentSessionStartedAt,
      now: args.now,
    }) / trackedSeconds
  );
}

export function buildMapMetricsFromDetails(chargers: Charger[]): ChargerMapMetrics {
  const statusCounts = new Map<
    string,
    {
      statusText: string;
      statusNormalized: ChargerStatusNormalized;
      count: number;
    }
  >();

  const metrics = chargers.reduce<ChargerMapMetrics>(
    (acc, charger) => {
      acc.totalChargers += 1;
      acc.allTimeSessions += charger.totalSessions;
      acc.allTimeEstimatedRevenue += charger.estimatedAllTimeRevenue;
      acc.allTimeEstimatedKwh += charger.estimatedAllTimeKwh;

      const statusKey = `${charger.statusNormalized}::${charger.statusText}`;
      const existing = statusCounts.get(statusKey);

      if (existing) {
        existing.count += 1;
      } else {
        statusCounts.set(statusKey, {
          statusText: charger.statusText,
          statusNormalized: charger.statusNormalized,
          count: 1,
        });
      }

      if (charger.statusNormalized === "occupied") {
        acc.currentlyOccupied += 1;
      } else if (charger.statusNormalized === "unavailable") {
        acc.unavailableNow += 1;
      } else if (charger.statusNormalized === "available") {
        acc.availableNow += 1;
      } else if (charger.statusNormalized === "not_live") {
        acc.notLiveNow += 1;
      }

      return acc;
    },
    {
      totalChargers: 0,
      currentlyOccupied: 0,
      availableNow: 0,
      unavailableNow: 0,
      notLiveNow: 0,
      allTimeSessions: 0,
      allTimeEstimatedRevenue: 0,
      allTimeEstimatedKwh: 0,
      last24HoursEstimatedKwh: 0,
      rawStatusBreakdown: [],
    },
  );

  metrics.rawStatusBreakdown = Array.from(statusCounts.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.statusText.localeCompare(right.statusText);
  });

  return metrics;
}

export function buildMapMetricsFromSummariesAndRows(
  summaries: MapChargerSummary[],
  rows: Array<{
    totalSessions: number;
    estimatedAllTimeRevenue: number;
    estimatedAllTimeKwh: number;
  }>,
  last24HoursEstimatedKwh = 0,
): ChargerMapMetrics {
  const statusCounts = new Map<
    string,
    {
      statusText: string;
      statusNormalized: ChargerStatusNormalized;
      count: number;
    }
  >();

  for (const summary of summaries) {
    const statusKey = `${summary.statusNormalized}::${summary.statusText}`;
    const existing = statusCounts.get(statusKey);

    if (existing) {
      existing.count += 1;
    } else {
      statusCounts.set(statusKey, {
        statusText: summary.statusText,
        statusNormalized: summary.statusNormalized,
        count: 1,
      });
    }
  }

  const totals = rows.reduce(
    (acc, row) => {
      acc.allTimeSessions += row.totalSessions;
      acc.allTimeEstimatedRevenue += row.estimatedAllTimeRevenue;
      acc.allTimeEstimatedKwh += row.estimatedAllTimeKwh;
      return acc;
    },
    {
      allTimeSessions: 0,
      allTimeEstimatedRevenue: 0,
      allTimeEstimatedKwh: 0,
    },
  );

  return {
    totalChargers: summaries.length,
    currentlyOccupied: summaries.filter((summary) => summary.statusNormalized === "occupied")
      .length,
    availableNow: summaries.filter((summary) => summary.statusNormalized === "available")
      .length,
    unavailableNow: summaries.filter((summary) => summary.statusNormalized === "unavailable")
      .length,
    notLiveNow: summaries.filter((summary) => summary.statusNormalized === "not_live").length,
    allTimeSessions: totals.allTimeSessions,
    allTimeEstimatedRevenue: totals.allTimeEstimatedRevenue,
    allTimeEstimatedKwh: totals.allTimeEstimatedKwh,
    last24HoursEstimatedKwh,
    rawStatusBreakdown: Array.from(statusCounts.values()).sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.statusText.localeCompare(right.statusText);
    }),
  };
}
