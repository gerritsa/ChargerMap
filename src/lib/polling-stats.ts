import { differenceInSeconds } from "date-fns";

export type ChargerStatsBuckets = {
  priceBucket: string;
  outputBucket: string;
};

function getPriceBucket(priceModelType: string | null) {
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

function getOutputBucket(outputKw: number | null) {
  if (outputKw == null) {
    return "unknown";
  }

  return Math.round(outputKw).toString();
}

function derivePriceBucketFromLegacyFields(input: {
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
    Math.max(
      0,
      differenceInSeconds(args.now ?? new Date(), new Date(args.currentSessionStartedAt)),
    )
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
