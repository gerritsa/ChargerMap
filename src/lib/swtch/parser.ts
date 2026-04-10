import * as cheerio from "cheerio";
import { z } from "zod";

import { parsePricing } from "@/lib/swtch/pricing";
import { normalizeStatus } from "@/lib/swtch/normalize-status";

const parsedListingSchema = z.object({
  listingId: z.number(),
  chargerIdentifier: z.string(),
  title: z.string(),
  statusText: z.string(),
  statusNormalized: z.enum([
    "available",
    "occupied",
    "unavailable",
    "not_live",
    "unknown",
  ]),
  priceText: z.string(),
  priceTextRaw: z.string(),
  priceNoteText: z.string().nullable(),
  priceModelType: z.string().nullable(),
  priceParseConfidence: z.number().nullable(),
  priceParseStatus: z.enum(["parsed", "partial", "unparsed"]),
  pricingBaseType: z.enum(["free", "hourly", "energy", "unknown"]),
  pricingStructureType: z.enum([
    "free",
    "simple",
    "idle_after_charging",
    "tiered_time",
    "time_of_day",
    "pending",
    "unknown",
  ]),
  currency: z.string(),
  baseRate: z.number().nullable(),
  baseUnit: z.enum(["hr", "kwh"]).nullable(),
  hasGuestFee: z.boolean(),
  hasFlatFee: z.boolean(),
  hasIdleFee: z.boolean(),
  idleRate: z.number().nullable(),
  idleUnit: z.enum(["hr"]).nullable(),
  pricingUnit: z.string().nullable(),
  chargingRatePerHour: z.number().nullable(),
  idleRatePerHour: z.number().nullable(),
  tier1RatePerHour: z.number().nullable(),
  tier1MaxHours: z.number().nullable(),
  tier2RatePerHour: z.number().nullable(),
  guestFee: z.number().nullable(),
  flatFee: z.number().nullable(),
  energyRatePerKwh: z.number().nullable(),
  idleGraceHours: z.number().nullable(),
  idleGraceMinutes: z.number().nullable(),
  idleFeeTriggerText: z.string().nullable(),
  scheduleText: z.string(),
  outputText: z.string(),
  imageUrl: z.string().nullable(),
  mapUrl: z.string().nullable(),
  addressText: z.string().nullable(),
  addressLine1: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  postalCode: z.string().nullable(),
  countryCode: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});

export type ParsedSwtchListing = z.infer<typeof parsedListingSchema>;

const parsedStatusSnapshotSchema = z.object({
  listingId: z.number(),
  chargerIdentifier: z.string(),
  statusText: z.string(),
  statusNormalized: z.enum([
    "available",
    "occupied",
    "unavailable",
    "not_live",
    "unknown",
  ]),
});

export type ParsedSwtchStatusSnapshot = z.infer<
  typeof parsedStatusSnapshotSchema
>;

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toTitleCaseWord(word: string) {
  if (!/[a-z]/.test(word)) {
    return word;
  }

  if (/^(nw|ne|sw|se|n|s|e|w|po)$/i.test(word)) {
    return word.toUpperCase();
  }

  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function toTitleCaseAddress(value: string) {
  return value
    .split(/\s+/)
    .map((word) =>
      word
        .split("-")
        .map((segment) => toTitleCaseWord(segment))
        .join("-"),
    )
    .join(" ");
}

function trimTrailingSequence(value: string, parts: Array<string | null | undefined>) {
  const normalizedParts = parts
    .map((part) => cleanText(part ?? ""))
    .filter(Boolean);

  if (!normalizedParts.length) {
    return value;
  }

  const pattern = normalizedParts
    .map((part) => escapeRegExp(part))
    .join("\\s*,?\\s*");

  return value.replace(new RegExp(`(?:,?\\s*${pattern})$`, "i"), "").trim();
}

function normalizeAddressLine1(
  value: string,
  context: {
    city: string | null;
    region: string | null;
    postalCode: string | null;
    countryCode: string | null;
  },
) {
  let cleaned = cleanText(value);

  if (!cleaned) {
    return null;
  }

  const countryName =
    context.countryCode === "CA"
      ? "Canada"
      : context.countryCode === "US"
        ? "USA"
        : null;

  cleaned = trimTrailingSequence(cleaned, [
    context.city,
    context.region,
    context.postalCode,
    countryName,
  ]);
  cleaned = trimTrailingSequence(cleaned, [context.postalCode, countryName]);
  cleaned = trimTrailingSequence(cleaned, [countryName]);
  cleaned = trimTrailingSequence(cleaned, [context.postalCode]);
  cleaned = cleaned.replace(/[,\s]+$/, "").trim();

  const lettersOnly = cleaned.replace(/[^a-z]/gi, "");
  if (lettersOnly && lettersOnly === lettersOnly.toLowerCase()) {
    cleaned = toTitleCaseAddress(cleaned);
  }

  return cleaned || null;
}

function extractMapAddress(mapUrl: string | null) {
  if (!mapUrl) {
    return null;
  }

  try {
    const url = new URL(mapUrl);
    const query = url.searchParams.get("q");

    return query ? decodeURIComponent(query.replace(/\+/g, " ")) : null;
  } catch {
    return null;
  }
}

function readInfoSectionParagraphs($: cheerio.CheerioAPI, heading: string) {
  const headingNode = $(".info-section h3")
    .filter((_, element) => cleanText($(element).text()) === heading)
    .first();

  if (!headingNode.length) {
    return null;
  }

  const column = headingNode.closest("div");
  const paragraphs = column
    .find("> p")
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);

  return paragraphs.length ? paragraphs : null;
}

function buildAddress($: cheerio.CheerioAPI, fallback: string | null) {
  const address = cleanText($("#origin_loc_address").val()?.toString() ?? "");
  const city = cleanText($("#origin_loc_city").val()?.toString() ?? "");
  const province = cleanText($("#origin_loc_province").val()?.toString() ?? "");
  const postalCode = cleanText(
    $("#origin_loc_postal_code").val()?.toString() ?? "",
  );
  const country = cleanText($("#origin_loc_country").val()?.toString() ?? "");

  const parts = [address, city, province, postalCode, country].filter(Boolean);
  return parts.length ? parts.join(", ") : fallback;
}

function readAddressParts($: cheerio.CheerioAPI) {
  const city = cleanText($("#origin_loc_city").val()?.toString() ?? "");
  const region = cleanText($("#origin_loc_province").val()?.toString() ?? "");
  const postalCode = cleanText(
    $("#origin_loc_postal_code").val()?.toString() ?? "",
  );
  const countryCode = cleanText(
    $("#origin_loc_country").val()?.toString() ?? "",
  );
  const addressLine1 = normalizeAddressLine1(
    $("#origin_loc_address").val()?.toString() ?? "",
    {
      city: city || null,
      region: region || null,
      postalCode: postalCode || null,
      countryCode: countryCode || null,
    },
  );

  return {
    addressLine1,
    city: city || null,
    region: region || null,
    postalCode: postalCode || null,
    countryCode: countryCode || null,
  };
}

function readCoordinate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function loadListingPage(html: string) {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());

  if (
    !bodyText ||
    /404|page not found/i.test(bodyText) ||
    !$(".listing-details-container").length
  ) {
    return null;
  }

  return $;
}

export function parseSwtchListingStatusHtml(
  html: string,
  listingId: number,
): ParsedSwtchStatusSnapshot | null {
  const $ = loadListingPage(html);

  if (!$) {
    return null;
  }

  const chargerIdentifier = cleanText(
    $(".listing-description-column h1").first().text(),
  );
  const statusText = cleanText($("#charger-status").first().text());

  if (!chargerIdentifier || !statusText) {
    return null;
  }

  return parsedStatusSnapshotSchema.parse({
    listingId,
    chargerIdentifier,
    statusText,
    statusNormalized: normalizeStatus(statusText),
  });
}

export function parseSwtchListingHtml(
  html: string,
  listingId: number,
): ParsedSwtchListing | null {
  const $ = loadListingPage(html);

  if (!$) {
    return null;
  }

  const chargerIdentifier = cleanText(
    $(".listing-description-column h1").first().text(),
  );
  const pageTitle = chargerIdentifier || `SWTCH Listing ${listingId}`;
  const statusText = cleanText($("#charger-status").first().text());

  const mapUrl =
    $('a[href*="maps.google"], a[href*="google.com/maps"], a[href*="maps?q="]')
      .first()
      .attr("href") ?? null;

  const imageUrl =
    $('.listing-image-div img[alt="Charger Image"]').first().attr("src") ??
    $("img")
      .map((_, element) => $(element).attr("src"))
      .get()
      .find((src) => typeof src === "string" && /listing_images|charger/i.test(src)) ??
    null;

  const fallbackAddress = extractMapAddress(mapUrl);
  const priceParagraphs = readInfoSectionParagraphs(
    $,
    "Price (set by station owners):",
  );
  const scheduleParagraphs = readInfoSectionParagraphs($, "Schedule:");
  const outputParagraphs = readInfoSectionParagraphs($, "Output:");
  const addressParts = readAddressParts($);
  const addressText = buildAddress($, fallbackAddress);
  const lat = readCoordinate($("#origin_loc_latitude").val()?.toString());
  const lng = readCoordinate($("#origin_loc_longitude").val()?.toString());
  const scheduleText = scheduleParagraphs?.join("\n") ?? null;
  const outputText = outputParagraphs?.join("\n") ?? null;

  if (
    !chargerIdentifier ||
    !statusText ||
    !priceParagraphs ||
    !scheduleText ||
    !outputText
  ) {
    return null;
  }

  const pricing = parsePricing(priceParagraphs, addressParts.countryCode);

  return parsedListingSchema.parse({
    listingId,
    chargerIdentifier,
    title: pageTitle,
    statusText,
    statusNormalized: normalizeStatus(statusText),
    priceText: pricing.priceText,
    priceTextRaw: pricing.priceTextRaw,
    priceNoteText: pricing.priceNoteText,
    priceModelType: pricing.priceModelType,
    priceParseConfidence: pricing.priceParseConfidence,
    priceParseStatus: pricing.priceParseStatus,
    pricingBaseType: pricing.pricingBaseType,
    pricingStructureType: pricing.pricingStructureType,
    currency: pricing.currency,
    baseRate: pricing.baseRate,
    baseUnit: pricing.baseUnit,
    hasGuestFee: pricing.hasGuestFee,
    hasFlatFee: pricing.hasFlatFee,
    hasIdleFee: pricing.hasIdleFee,
    idleRate: pricing.idleRate,
    idleUnit: pricing.idleUnit,
    pricingUnit: pricing.pricingUnit,
    chargingRatePerHour: pricing.chargingRatePerHour,
    idleRatePerHour: pricing.idleRatePerHour,
    tier1RatePerHour: pricing.tier1RatePerHour,
    tier1MaxHours: pricing.tier1MaxHours,
    tier2RatePerHour: pricing.tier2RatePerHour,
    guestFee: pricing.guestFee,
    flatFee: pricing.flatFee,
    energyRatePerKwh: pricing.energyRatePerKwh,
    idleGraceHours: pricing.idleGraceHours,
    idleGraceMinutes: pricing.idleGraceMinutes,
    idleFeeTriggerText: pricing.idleFeeTriggerText,
    scheduleText,
    outputText,
    imageUrl,
    mapUrl,
    addressText,
    addressLine1: addressParts.addressLine1,
    city: addressParts.city,
    region: addressParts.region,
    postalCode: addressParts.postalCode,
    countryCode: addressParts.countryCode,
    lat,
    lng,
  });
}
