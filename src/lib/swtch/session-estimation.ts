import type { ChargerStatusNormalized } from "@/types/charger";

export const DEFAULT_ESTIMATION_METHOD =
  "buffer_5m_power_factor_by_output_suspended_zero_kwh_capped_at_45kwh";
export const DEFAULT_ASSUMED_VEHICLE = "Tesla Model Y";
export const DEFAULT_ASSUMED_BATTERY_KWH = 75;
export const DEFAULT_ASSUMED_START_SOC = 20;
export const DEFAULT_ASSUMED_END_SOC = 80;
export const MAX_SESSION_KWH = 45;
export const ENERGY_BUFFER_MINUTES = 5;

export type SessionEstimatorCharger = {
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
  guestFee: number | null;
  flatFee: number | null;
  idleRate: number | null;
  idleUnit: string | null;
  idleGraceHours: number | null;
  energyRatePerKwh: number | null;
};

export type SessionStatusEvent = {
  changedAt: string;
  statusText: string;
  statusNormalized: ChargerStatusNormalized;
};

export type SessionTimingSummary = {
  durationMinutes: number;
  energyActiveMinutes: number;
  suspendedMinutes: number;
  billableEnergyMinutes: number;
};

export type SessionEstimate = SessionTimingSummary & {
  powerFactor: number | null;
  effectiveOutputKw: number | null;
  estimatedKwh: number | null;
  estimatedRevenue: number | null;
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

export function toDurationMinutes(startedAt: string, endedAt: string) {
  const durationMs =
    new Date(endedAt).getTime() - new Date(startedAt).getTime();

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }

  return roundTo(durationMs / 60000, 2);
}

export function getPowerFactorForOutputKw(outputKw: number | null) {
  if (outputKw == null || outputKw <= 0) {
    return null;
  }

  if (outputKw <= 11) {
    return 0.9;
  }

  if (outputKw <= 25) {
    return 0.8;
  }

  return 0.7;
}

function isSuspendedStatusText(statusText: string) {
  const value = statusText.trim().toLowerCase();

  return (
    value.includes("suspendedev") ||
    value.includes("suspended ev") ||
    value.includes("suspendedevse") ||
    value.includes("suspended evse")
  );
}

function isEnergyActiveStatus(
  statusText: string,
  statusNormalized: ChargerStatusNormalized,
) {
  return (
    statusNormalized === "occupied" && !isSuspendedStatusText(statusText)
  );
}

function isSuspendedOccupiedStatus(
  statusText: string,
  statusNormalized: ChargerStatusNormalized,
) {
  return (
    statusNormalized === "occupied" && isSuspendedStatusText(statusText)
  );
}

export function summarizeSessionTiming(args: {
  startedAt: string;
  endedAt: string;
  startStatusText: string;
  statusEvents: SessionStatusEvent[];
}) {
  const durationMinutes = toDurationMinutes(args.startedAt, args.endedAt);

  if (durationMinutes <= 0) {
    return {
      durationMinutes: 0,
      energyActiveMinutes: 0,
      suspendedMinutes: 0,
      billableEnergyMinutes: 0,
    };
  }

  const events = [...args.statusEvents]
    .filter(
      (event) =>
        new Date(event.changedAt).getTime() > new Date(args.startedAt).getTime() &&
        new Date(event.changedAt).getTime() < new Date(args.endedAt).getTime(),
    )
    .sort(
      (left, right) =>
        new Date(left.changedAt).getTime() - new Date(right.changedAt).getTime(),
    );

  let currentStatusText = args.startStatusText;
  let currentStatusNormalized: ChargerStatusNormalized = "occupied";
  let segmentStartedAt = args.startedAt;
  let energyActiveMinutes = 0;
  let suspendedMinutes = 0;

  for (const event of events) {
    const segmentMinutes = toDurationMinutes(segmentStartedAt, event.changedAt);

    if (isEnergyActiveStatus(currentStatusText, currentStatusNormalized)) {
      energyActiveMinutes += segmentMinutes;
    } else if (
      isSuspendedOccupiedStatus(currentStatusText, currentStatusNormalized)
    ) {
      suspendedMinutes += segmentMinutes;
    }

    currentStatusText = event.statusText;
    currentStatusNormalized = event.statusNormalized;
    segmentStartedAt = event.changedAt;
  }

  const finalSegmentMinutes = toDurationMinutes(segmentStartedAt, args.endedAt);

  if (isEnergyActiveStatus(currentStatusText, currentStatusNormalized)) {
    energyActiveMinutes += finalSegmentMinutes;
  } else if (
    isSuspendedOccupiedStatus(currentStatusText, currentStatusNormalized)
  ) {
    suspendedMinutes += finalSegmentMinutes;
  }

  return {
    durationMinutes,
    energyActiveMinutes: roundTo(energyActiveMinutes, 2),
    suspendedMinutes: roundTo(suspendedMinutes, 2),
    billableEnergyMinutes: roundTo(
      Math.max(0, energyActiveMinutes - ENERGY_BUFFER_MINUTES),
      2,
    ),
  };
}

function estimateSessionKwh(
  charger: SessionEstimatorCharger,
  timing: SessionTimingSummary,
) {
  const powerFactor = getPowerFactorForOutputKw(charger.outputKw);

  if (charger.outputKw == null || charger.outputKw <= 0 || powerFactor == null) {
    return {
      powerFactor,
      effectiveOutputKw: null,
      estimatedKwh: null,
    };
  }

  const effectiveOutputKw = charger.outputKw * powerFactor;
  const billableEnergyHours = timing.billableEnergyMinutes / 60;

  return {
    powerFactor,
    effectiveOutputKw,
    estimatedKwh: toKwhNumber(
      Math.min(effectiveOutputKw * billableEnergyHours, MAX_SESSION_KWH),
    ),
  };
}

function estimateChargingHours(
  charger: SessionEstimatorCharger,
  timing: SessionTimingSummary,
  effectiveOutputKw: number | null,
  estimatedKwh: number | null,
) {
  const sessionHours = timing.durationMinutes / 60;

  if (
    charger.outputKw == null ||
    charger.outputKw <= 0 ||
    effectiveOutputKw == null ||
    effectiveOutputKw <= 0
  ) {
    return null;
  }

  if (estimatedKwh != null) {
    return Math.min(sessionHours, estimatedKwh / effectiveOutputKw);
  }

  return Math.min(sessionHours, MAX_SESSION_KWH / effectiveOutputKw);
}

function estimateIdleHours(
  charger: SessionEstimatorCharger,
  timing: SessionTimingSummary,
  effectiveOutputKw: number | null,
  estimatedKwh: number | null,
  effectivePricingStructureType: string | null,
) {
  const sessionHours = timing.durationMinutes / 60;

  if (effectivePricingStructureType !== "idle_after_charging") {
    return 0;
  }

  const chargingHours = estimateChargingHours(
    charger,
    timing,
    effectiveOutputKw,
    estimatedKwh,
  );

  if (chargingHours == null) {
    return 0;
  }

  const idleGraceHours = Math.max(0, charger.idleGraceHours ?? 0);
  return Math.max(0, sessionHours - chargingHours - idleGraceHours);
}

function estimateSessionRevenue(args: {
  charger: SessionEstimatorCharger;
  timing: SessionTimingSummary;
  effectiveOutputKw: number | null;
  estimatedKwh: number | null;
}) {
  const { charger, timing, effectiveOutputKw, estimatedKwh } = args;
  const sessionHours = timing.durationMinutes / 60;
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
    timing,
    effectiveOutputKw,
    estimatedKwh,
  );
  const idleHours = estimateIdleHours(
    charger,
    timing,
    effectiveOutputKw,
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

export function estimateSession(args: {
  charger: SessionEstimatorCharger;
  startedAt: string;
  endedAt: string;
  startStatusText: string;
  statusEvents: SessionStatusEvent[];
}) {
  const timing = summarizeSessionTiming({
    startedAt: args.startedAt,
    endedAt: args.endedAt,
    startStatusText: args.startStatusText,
    statusEvents: args.statusEvents,
  });
  const { powerFactor, effectiveOutputKw, estimatedKwh } = estimateSessionKwh(
    args.charger,
    timing,
  );
  const estimatedRevenue = estimateSessionRevenue({
    charger: args.charger,
    timing,
    effectiveOutputKw,
    estimatedKwh,
  });

  return {
    ...timing,
    powerFactor,
    effectiveOutputKw: effectiveOutputKw == null ? null : roundTo(effectiveOutputKw, 2),
    estimatedKwh,
    estimatedRevenue,
  } satisfies SessionEstimate;
}
