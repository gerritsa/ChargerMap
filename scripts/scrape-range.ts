import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type RangeArgs = {
  start: number;
  end: number;
  write: boolean;
};

type DiscoveryRow = {
  listing_id: number;
  charger_identifier: string;
  title: string;
  status_text_last_scraped: string;
  status_normalized_last_scraped: string;
  price_text: string;
  price_text_raw: string;
  price_note_text: string | null;
  schedule_text: string;
  output_text: string;
  output_kw: number | null;
  pricing_unit: string | null;
  pricing_base_type: string | null;
  pricing_structure_type: string | null;
  pricing_parse_status: string | null;
  base_rate: number | null;
  base_unit: string | null;
  has_guest_fee: boolean;
  has_flat_fee: boolean;
  has_idle_fee: boolean;
  idle_rate: number | null;
  idle_unit: string | null;
  idle_trigger_text: string | null;
  energy_rate_per_kwh: number | null;
  image_url: string | null;
  map_url: string | null;
  address_text: string | null;
  address_line_1: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  lat: number | null;
  lng: number | null;
  currency: string;
  price_model_type: string | null;
  price_parse_confidence: number | null;
  charging_rate_per_hour: number | null;
  idle_rate_per_hour: number | null;
  tier_1_rate_per_hour: number | null;
  tier_1_max_hours: number | null;
  tier_2_rate_per_hour: number | null;
  guest_fee: number | null;
  flat_fee: number | null;
  idle_grace_hours: number | null;
  idle_grace_minutes: number | null;
  idle_fee_trigger_text: string | null;
  is_active: boolean;
  is_decommissioned: boolean;
  last_seen_at: string;
};

function parseArgs(): RangeArgs {
  const start = Number(process.argv[2] ?? "1");
  const end = Number(process.argv[3] ?? "100");
  const write = process.argv.includes("--write");

  if (Number.isNaN(start) || Number.isNaN(end) || start < 1 || end < start) {
    throw new Error(
      "Usage: npm run scrape:range -- <start> <end> [--write]",
    );
  }

  return { start, end, write };
}

function parseOutputKw(outputText: string): number | null {
  const match = outputText.match(/(\d+(?:\.\d+)?)\s*kW/i);
  return match ? Number(match[1]) : null;
}

async function markDecommissioned(listingId: number) {
  const { createServiceRoleSupabaseClient } = await import(
    "@/lib/supabase/server"
  );
  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    return;
  }

  await supabase
    .from("chargers")
    .update({
      is_active: false,
      is_decommissioned: true,
      last_seen_at: new Date().toISOString(),
    })
    .eq("listing_id", listingId);
}

async function upsertDiscoveryRow(row: DiscoveryRow) {
  const { createServiceRoleSupabaseClient } = await import(
    "@/lib/supabase/server"
  );
  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required to run scrape:range with --write",
    );
  }

  const { data, error } = await supabase
    .from("chargers")
    .upsert(row, {
      onConflict: "listing_id",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert listing ${row.listing_id}: ${error?.message}`);
  }
}

async function main() {
  const [
    { createServiceRoleSupabaseClient },
    { fetchWithBackoff, sleepWithJitter },
    { geocodeAddress },
    { parseSwtchListingHtml },
  ] = await Promise.all([
    import("@/lib/supabase/server"),
    import("@/lib/swtch/fetch"),
    import("@/lib/swtch/geocode"),
    import("@/lib/swtch/parser"),
  ]);

  const { start, end, write } = parseArgs();
  const serviceRoleSupabase = write ? createServiceRoleSupabaseClient() : null;

  if (write && !serviceRoleSupabase) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be set in .env.local before using --write",
    );
  }

  const summary = {
    range: `${start}-${end}`,
    write,
    found: 0,
    missingOrDecommissioned: 0,
    rowsWritten: 0,
    items: [] as unknown[],
  };

  console.log(
    `Starting discovery scrape for listings ${start}-${end}${write ? " with Supabase writes" : " in dry-run mode"}...`,
  );

  for (let listingId = start; listingId <= end; listingId += 1) {
    const progress = `[${listingId - start + 1}/${end - start + 1}]`;
    const result = await (async () => {
      const response = await fetchWithBackoff(
        `https://charge.swtchenergy.com/listings/${listingId}`,
        {
          cache: "no-store",
        },
        {
          userAgent: "charger-map/0.1 (bounded discovery scraper)",
          baseDelayMs: 1200,
          maxDelayMs: 10000,
          jitterMs: 250,
          onRetry: ({ attempt, delayMs, reason }) => {
            console.log(
              `${progress} listing ${listingId}: retry ${attempt} after ${delayMs}ms (${reason})`,
            );
          },
        },
      );

      if (!response.ok) {
        return {
          listingId,
          exists: false as const,
          reason: `http_${response.status}`,
        };
      }

      const html = await response.text();
      const parsed = parseSwtchListingHtml(html, listingId);

      if (!parsed) {
        return {
          listingId,
          exists: false as const,
          reason: "not_parseable_or_decommissioned",
        };
      }

      const geocoded = parsed.addressText
        ? parsed.lat != null && parsed.lng != null
          ? null
          : await geocodeAddress(parsed.addressText)
        : null;

      const row: DiscoveryRow = {
        listing_id: parsed.listingId,
        charger_identifier: parsed.chargerIdentifier,
        title: parsed.title,
        status_text_last_scraped: parsed.statusText,
        status_normalized_last_scraped: parsed.statusNormalized,
        price_text: parsed.priceText,
        price_text_raw: parsed.priceTextRaw,
        price_note_text: parsed.priceNoteText,
        schedule_text: parsed.scheduleText,
        output_text: parsed.outputText,
        output_kw: parseOutputKw(parsed.outputText),
        pricing_unit: parsed.pricingUnit,
        pricing_base_type: parsed.pricingBaseType,
        pricing_structure_type: parsed.pricingStructureType,
        pricing_parse_status: parsed.priceParseStatus,
        base_rate: parsed.baseRate,
        base_unit: parsed.baseUnit,
        has_guest_fee: parsed.hasGuestFee,
        has_flat_fee: parsed.hasFlatFee,
        has_idle_fee: parsed.hasIdleFee,
        idle_rate: parsed.idleRate,
        idle_unit: parsed.idleUnit,
        idle_trigger_text: parsed.idleFeeTriggerText,
        idle_grace_hours: parsed.idleGraceHours,
        energy_rate_per_kwh: parsed.energyRatePerKwh,
        image_url: parsed.imageUrl,
        map_url: parsed.mapUrl,
        address_text: geocoded?.displayName ?? parsed.addressText,
        address_line_1: parsed.addressLine1,
        city: parsed.city,
        region: parsed.region,
        postal_code: parsed.postalCode,
        country_code: parsed.countryCode,
        lat: parsed.lat ?? geocoded?.lat ?? null,
        lng: parsed.lng ?? geocoded?.lng ?? null,
        currency: parsed.currency,
        price_model_type: parsed.priceModelType,
        price_parse_confidence: parsed.priceParseConfidence,
        charging_rate_per_hour: parsed.chargingRatePerHour,
        idle_rate_per_hour: parsed.idleRatePerHour,
        tier_1_rate_per_hour: parsed.tier1RatePerHour,
        tier_1_max_hours: parsed.tier1MaxHours,
        tier_2_rate_per_hour: parsed.tier2RatePerHour,
        guest_fee: parsed.guestFee,
        flat_fee: parsed.flatFee,
        idle_grace_minutes: parsed.idleGraceMinutes,
        idle_fee_trigger_text: parsed.idleFeeTriggerText,
        is_active: true,
        is_decommissioned: false,
        last_seen_at: new Date().toISOString(),
      };

      return {
        listingId,
        exists: true as const,
        parsed,
        geocoded,
        row,
      };
    })();
    summary.items.push(result);
    const row = "row" in result ? result.row : null;

    if (!result.exists || !row) {
      summary.missingOrDecommissioned += 1;
      console.log(
        `${progress} listing ${listingId}: missing or decommissioned (${result.reason})`,
      );

      if (write) {
        await markDecommissioned(listingId);
      }

      await sleepWithJitter(150, 50);
      continue;
    }

    summary.found += 1;
    console.log(
      `${progress} listing ${listingId}: found ${row.charger_identifier} | ${row.status_text_last_scraped} | ${row.address_text ?? "no address"}`,
    );

    if (write) {
      await upsertDiscoveryRow(row);
      summary.rowsWritten += 1;
      console.log(`${progress} listing ${listingId}: written to Supabase`);
    }

    await sleepWithJitter(100, 50);
  }

  console.log("Discovery scrape complete.");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
