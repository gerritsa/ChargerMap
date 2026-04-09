export type PricingBaseType = "free" | "hourly" | "energy" | "unknown";
export type PricingStructureType =
  | "free"
  | "simple"
  | "idle_after_charging"
  | "tiered_time"
  | "time_of_day"
  | "pending"
  | "unknown";
export type PricingParseStatus = "parsed" | "partial" | "unparsed";
export type PricingRateUnit = "hr" | "kwh" | null;
export type IdleRateUnit = "hr" | null;

export type ParsedPricing = {
  priceText: string;
  priceTextRaw: string;
  priceNoteText: string | null;
  priceModelType: string | null;
  priceParseConfidence: number | null;
  priceParseStatus: PricingParseStatus;
  pricingBaseType: PricingBaseType;
  pricingStructureType: PricingStructureType;
  currency: string;
  baseRate: number | null;
  baseUnit: PricingRateUnit;
  hasGuestFee: boolean;
  hasFlatFee: boolean;
  hasIdleFee: boolean;
  idleRate: number | null;
  idleUnit: IdleRateUnit;
  pricingUnit: string | null;
  chargingRatePerHour: number | null;
  idleRatePerHour: number | null;
  tier1RatePerHour: number | null;
  tier1MaxHours: number | null;
  tier2RatePerHour: number | null;
  guestFee: number | null;
  flatFee: number | null;
  energyRatePerKwh: number | null;
  idleGraceHours: number | null;
  idleGraceMinutes: number | null;
  idleFeeTriggerText: string | null;
};

function parseMoney(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferCurrency(countryCode: string | null) {
  if (countryCode === "US") {
    return "USD";
  }

  return "CAD";
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function parseDurationToMinutes(value: string | null) {
  if (!value) {
    return null;
  }

  const hours = parseMoney(value.match(/(\d+(?:\.\d+)?)\s*hours?/i)?.[1]) ?? 0;
  const minutes =
    parseMoney(value.match(/(\d+(?:\.\d+)?)\s*minutes?/i)?.[1]) ?? 0;
  const totalMinutes = hours * 60 + minutes;

  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return null;
  }

  return roundTo(totalMinutes, 2);
}

function toHours(minutes: number | null) {
  if (minutes == null) {
    return null;
  }

  return roundTo(minutes / 60, 4);
}

function derivePriceModelType(input: {
  pricingBaseType: PricingBaseType;
  pricingStructureType: PricingStructureType;
  hasGuestFee: boolean;
}) {
  if (input.pricingStructureType === "pending") {
    return "pricing_pending";
  }

  if (input.pricingStructureType === "time_of_day") {
    return "time_of_day";
  }

  if (input.pricingStructureType === "tiered_time") {
    return input.hasGuestFee ? "tiered_time_plus_guest_fee" : "tiered_time";
  }

  if (input.pricingStructureType === "idle_after_charging") {
    return input.hasGuestFee ? "base_plus_idle_plus_guest_fee" : "base_plus_idle";
  }

  if (input.pricingStructureType === "free") {
    return input.hasGuestFee ? "free_plus_guest_fee" : "free";
  }

  if (input.pricingStructureType === "simple") {
    if (input.pricingBaseType === "energy") {
      return input.hasGuestFee ? "energy_plus_guest_fee" : "energy_simple";
    }

    if (input.pricingBaseType === "hourly") {
      return input.hasGuestFee ? "hourly_plus_guest_fee" : "hourly_simple";
    }
  }

  return "unknown";
}

function buildParsedPricing(
  priceText: string,
  priceTextRaw: string,
  priceNoteText: string | null,
  currency: string,
  overrides: Partial<ParsedPricing>,
): ParsedPricing {
  return {
    priceText,
    priceTextRaw,
    priceNoteText,
    priceModelType: null,
    priceParseConfidence: 0,
    priceParseStatus: "unparsed",
    pricingBaseType: "unknown",
    pricingStructureType: "unknown",
    currency,
    baseRate: null,
    baseUnit: null,
    hasGuestFee: false,
    hasFlatFee: false,
    hasIdleFee: false,
    idleRate: null,
    idleUnit: null,
    pricingUnit: null,
    chargingRatePerHour: null,
    idleRatePerHour: null,
    tier1RatePerHour: null,
    tier1MaxHours: null,
    tier2RatePerHour: null,
    guestFee: null,
    flatFee: null,
    energyRatePerKwh: null,
    idleGraceHours: null,
    idleGraceMinutes: null,
    idleFeeTriggerText: null,
    ...overrides,
  };
}

export function parsePricing(
  priceParagraphs: string[],
  countryCode: string | null,
): ParsedPricing {
  const [display = "Pricing pending", ...notes] = priceParagraphs;
  const priceText = display.trim();
  const priceNoteText = notes.length ? notes.join("\n").trim() : null;
  const priceTextRaw = [...priceParagraphs].join("\n").trim();
  const priceParseText = priceTextRaw.replace(/\s+/g, " ").trim() || priceText;
  const currency = inferCurrency(countryCode);
  const guestFee = parseMoney(
    priceParseText.match(/\$([\d.]+)\s*guest fee/i)?.[1],
  );
  const hasGuestFee = guestFee != null;
  const flatFee = parseMoney(
    priceParseText.match(/\$([\d.]+)\s*flat fee/i)?.[1],
  );
  const hasFlatFee = flatFee != null;
  const hourRates = [...priceParseText.matchAll(/\$([\d.]+)\s*\/hr/gi)].map(
    (match) => parseMoney(match[1]) ?? 0,
  );
  const energyRatePerKwh = parseMoney(
    priceParseText.match(/\$([\d.]+)\s*\/kWh/i)?.[1],
  );
  const idleFeeTriggerText =
    priceParseText.match(
      /added after\s+((?:\d+(?:\.\d+)?)\s*hours?(?:\s+\d+(?:\.\d+)?\s*minutes?)?|(?:\d+(?:\.\d+)?)\s*minutes?)/i,
    )?.[1] ?? null;
  const idleGraceMinutes = parseDurationToMinutes(idleFeeTriggerText);
  const idleGraceHours = toHours(idleGraceMinutes);
  const firstWindowText =
    priceParseText.match(
      /for the first\s+((?:\d+(?:\.\d+)?)\s*hours?(?:\s+\d+(?:\.\d+)?\s*minutes?)?|(?:\d+(?:\.\d+)?)\s*minutes?)/i,
    )?.[1] ?? null;
  const firstHours = toHours(parseDurationToMinutes(firstWindowText));
  const hasIdleLanguage =
    /while actively charging/i.test(priceParseText) &&
    /(loitering|thereafter)/i.test(priceParseText);

  if (
    /^pricing pending$/i.test(priceText) ||
    /^pricing pending$/i.test(priceParseText)
  ) {
    return buildParsedPricing(
      priceText,
      priceTextRaw,
      priceNoteText,
      currency,
      {
        priceParseStatus: "unparsed",
        pricingBaseType: "unknown",
        pricingStructureType: "pending",
        hasGuestFee,
        hasFlatFee,
        guestFee,
        flatFee,
        priceModelType: derivePriceModelType({
          pricingBaseType: "unknown",
          pricingStructureType: "pending",
          hasGuestFee,
        }),
      },
    );
  }

  if (/time of day/i.test(priceParseText)) {
    return buildParsedPricing(
      priceText,
      priceTextRaw,
      priceNoteText,
      currency,
      {
        priceParseConfidence: 0.25,
        priceParseStatus: "partial",
        pricingBaseType: "unknown",
        pricingStructureType: "time_of_day",
        hasGuestFee,
        hasFlatFee,
        guestFee,
        flatFee,
        priceModelType: derivePriceModelType({
          pricingBaseType: "unknown",
          pricingStructureType: "time_of_day",
          hasGuestFee,
        }),
      },
    );
  }

  if (/^free$/i.test(priceText) || /^free$/i.test(priceParseText)) {
    return buildParsedPricing(
      priceText,
      priceTextRaw,
      priceNoteText,
      currency,
      {
        priceParseConfidence: 1,
        priceParseStatus: "parsed",
        pricingBaseType: "free",
        pricingStructureType: "free",
        hasGuestFee,
        hasFlatFee,
        pricingUnit: "free",
        guestFee,
        flatFee,
        priceModelType: derivePriceModelType({
          pricingBaseType: "free",
          pricingStructureType: "free",
          hasGuestFee,
        }),
      },
    );
  }

  if (
    firstHours != null &&
    hourRates.length >= 2 &&
    /thereafter/i.test(priceParseText)
  ) {
    return buildParsedPricing(
      priceText,
      priceTextRaw,
      priceNoteText,
      currency,
      {
        priceParseConfidence: 0.95,
        priceParseStatus: "parsed",
        pricingBaseType: "hourly",
        pricingStructureType: "tiered_time",
        baseRate: hourRates[0] ?? null,
        baseUnit: "hr",
        hasGuestFee,
        hasFlatFee,
        pricingUnit: "hour",
        chargingRatePerHour: hourRates[0] ?? null,
        tier1RatePerHour: hourRates[0] ?? null,
        tier1MaxHours: firstHours,
        tier2RatePerHour: hourRates[1] ?? null,
        guestFee,
        flatFee,
        priceModelType: derivePriceModelType({
          pricingBaseType: "hourly",
          pricingStructureType: "tiered_time",
          hasGuestFee,
        }),
      },
    );
  }

  if (hasIdleLanguage) {
    if (
      /^free while actively charging/i.test(priceParseText) &&
      hourRates.length >= 1
    ) {
      return buildParsedPricing(
        priceText,
        priceTextRaw,
        priceNoteText,
        currency,
        {
          priceParseConfidence: 0.96,
          priceParseStatus: "parsed",
          pricingBaseType: "free",
          pricingStructureType: "idle_after_charging",
          hasGuestFee,
          hasFlatFee,
          hasIdleFee: true,
          idleRate: hourRates[0] ?? null,
          idleUnit: "hr",
          pricingUnit: "free",
          idleRatePerHour: hourRates[0] ?? null,
          guestFee,
          flatFee,
          idleGraceHours,
          idleGraceMinutes,
          idleFeeTriggerText,
          priceModelType: derivePriceModelType({
            pricingBaseType: "free",
            pricingStructureType: "idle_after_charging",
            hasGuestFee,
          }),
        },
      );
    }

    if (energyRatePerKwh != null && hourRates.length >= 1) {
      return buildParsedPricing(
        priceText,
        priceTextRaw,
        priceNoteText,
        currency,
        {
          priceParseConfidence: 0.97,
          priceParseStatus: "parsed",
          pricingBaseType: "energy",
          pricingStructureType: "idle_after_charging",
          baseRate: energyRatePerKwh,
          baseUnit: "kwh",
          hasGuestFee,
          hasFlatFee,
          hasIdleFee: true,
          idleRate: hourRates[0] ?? null,
          idleUnit: "hr",
          pricingUnit: "kwh",
          idleRatePerHour: hourRates[0] ?? null,
          guestFee,
          flatFee,
          energyRatePerKwh,
          idleGraceHours,
          idleGraceMinutes,
          idleFeeTriggerText,
          priceModelType: derivePriceModelType({
            pricingBaseType: "energy",
            pricingStructureType: "idle_after_charging",
            hasGuestFee,
          }),
        },
      );
    }

    if (hourRates.length >= 2) {
      return buildParsedPricing(
        priceText,
        priceTextRaw,
        priceNoteText,
        currency,
        {
          priceParseConfidence: 0.95,
          priceParseStatus: "parsed",
          pricingBaseType: "hourly",
          pricingStructureType: "idle_after_charging",
          baseRate: hourRates[0] ?? null,
          baseUnit: "hr",
          hasGuestFee,
          hasFlatFee,
          hasIdleFee: true,
          idleRate: hourRates[1] ?? null,
          idleUnit: "hr",
          pricingUnit: "hour",
          chargingRatePerHour: hourRates[0] ?? null,
          idleRatePerHour: hourRates[1] ?? null,
          guestFee,
          flatFee,
          idleGraceHours,
          idleGraceMinutes,
          idleFeeTriggerText,
          priceModelType: derivePriceModelType({
            pricingBaseType: "hourly",
            pricingStructureType: "idle_after_charging",
            hasGuestFee,
          }),
        },
      );
    }
  }

  if (energyRatePerKwh != null) {
    return buildParsedPricing(
      priceText,
      priceTextRaw,
      priceNoteText,
      currency,
      {
        priceParseConfidence: 0.98,
        priceParseStatus: "parsed",
        pricingBaseType: "energy",
        pricingStructureType: "simple",
        baseRate: energyRatePerKwh,
        baseUnit: "kwh",
        hasGuestFee,
        hasFlatFee,
        pricingUnit: "kwh",
        guestFee,
        flatFee,
        energyRatePerKwh,
        priceModelType: derivePriceModelType({
          pricingBaseType: "energy",
          pricingStructureType: "simple",
          hasGuestFee,
        }),
      },
    );
  }

  if (hourRates.length >= 1) {
    return buildParsedPricing(
      priceText,
      priceTextRaw,
      priceNoteText,
      currency,
      {
        priceParseConfidence: 0.92,
        priceParseStatus: "parsed",
        pricingBaseType: "hourly",
        pricingStructureType: "simple",
        baseRate: hourRates[0] ?? null,
        baseUnit: "hr",
        hasGuestFee,
        hasFlatFee,
        pricingUnit: "hour",
        chargingRatePerHour: hourRates[0] ?? null,
        guestFee,
        flatFee,
        idleGraceHours,
        idleGraceMinutes,
        idleFeeTriggerText,
        priceModelType: derivePriceModelType({
          pricingBaseType: "hourly",
          pricingStructureType: "simple",
          hasGuestFee,
        }),
      },
    );
  }

  return buildParsedPricing(priceText, priceTextRaw, priceNoteText, currency, {
    hasGuestFee,
    hasFlatFee,
    priceModelType: "unknown",
    guestFee,
    flatFee,
    idleGraceHours,
    idleGraceMinutes,
    idleFeeTriggerText,
  });
}
