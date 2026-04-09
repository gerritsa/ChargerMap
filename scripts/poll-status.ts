import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type PollArgs = {
  limit: number | null;
  shardCount: number;
  shardIndex: number;
};

type PollTarget = {
  id: string;
  listing_id: number;
  charger_identifier: string | null;
  price_model_type: string | null;
  output_kw: number | null;
  pricing_base_type: string | null;
  pricing_structure_type: string | null;
  base_rate: number | null;
  base_unit: string | null;
  charging_rate_per_hour: number | null;
  tier_1_rate_per_hour: number | null;
  tier_1_max_hours: number | null;
  tier_2_rate_per_hour: number | null;
  has_guest_fee: boolean | null;
  guest_fee: number | null;
  has_flat_fee: boolean | null;
  flat_fee: number | null;
  has_idle_fee: boolean | null;
  idle_rate: number | null;
  idle_unit: string | null;
  idle_grace_hours: number | null;
  energy_rate_per_kwh: number | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  first_seen_at: string;
};

function toStatusTrackingCharger(
  charger: PollTarget,
  trackingStartedAt: string,
) {
  return {
    chargerId: charger.id,
    listingId: charger.listing_id,
    outputKw: charger.output_kw,
    priceModelType: charger.price_model_type,
    pricingBaseType: charger.pricing_base_type,
    pricingStructureType: charger.pricing_structure_type,
    baseRate: charger.base_rate,
    baseUnit: charger.base_unit,
    chargingRatePerHour: charger.charging_rate_per_hour,
    tier1RatePerHour: charger.tier_1_rate_per_hour,
    tier1MaxHours: charger.tier_1_max_hours,
    tier2RatePerHour: charger.tier_2_rate_per_hour,
    hasGuestFee: charger.has_guest_fee ?? false,
    guestFee: charger.guest_fee,
    hasFlatFee: charger.has_flat_fee ?? false,
    flatFee: charger.flat_fee,
    hasIdleFee: charger.has_idle_fee ?? false,
    idleRate: charger.idle_rate,
    idleUnit: charger.idle_unit,
    idleGraceHours: charger.idle_grace_hours,
    energyRatePerKwh: charger.energy_rate_per_kwh,
    region: charger.region,
    lat: charger.lat,
    lng: charger.lng,
    firstSeenAt: charger.first_seen_at,
    trackingStartedAt,
  };
}

function parseArgs(): PollArgs {
  const limitIndex = process.argv.indexOf("--limit");
  const limitValue =
    limitIndex >= 0 ? Number(process.argv[limitIndex + 1] ?? "") : null;
  const shardCountIndex = process.argv.indexOf("--shard-count");
  const shardIndexIndex = process.argv.indexOf("--shard-index");
  const shardCountValue =
    shardCountIndex >= 0
      ? Number(process.argv[shardCountIndex + 1] ?? "")
      : Number(process.env.POLL_SHARD_COUNT ?? "1");
  const shardIndexValue =
    shardIndexIndex >= 0
      ? Number(process.argv[shardIndexIndex + 1] ?? "")
      : Number(process.env.POLL_SHARD_INDEX ?? "0");

  if (limitIndex >= 0 && (!Number.isFinite(limitValue) || limitValue! < 1)) {
    throw new Error(
      "Usage: npm run poll:status -- [--limit <count>] [--shard-count <count>] [--shard-index <index>]",
    );
  }

  if (
    !Number.isFinite(shardCountValue) ||
    Math.floor(shardCountValue) < 1 ||
    !Number.isFinite(shardIndexValue) ||
    Math.floor(shardIndexValue) < 0 ||
    Math.floor(shardIndexValue) >= Math.floor(shardCountValue)
  ) {
    throw new Error(
      "Shard configuration must satisfy shard-count >= 1 and 0 <= shard-index < shard-count.",
    );
  }

  return {
    limit: limitValue ? Math.floor(limitValue) : null,
    shardCount: Math.floor(shardCountValue),
    shardIndex: Math.floor(shardIndexValue),
  };
}

async function loadPollTargets(
  supabase: NonNullable<
    ReturnType<
      typeof import("@/lib/supabase/server")["createServiceRoleSupabaseClient"]
    >
  >,
) {
  const pageSize = 1000;
  const chargers: PollTarget[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("chargers")
      .select(
        "id, listing_id, charger_identifier, price_model_type, output_kw, pricing_base_type, pricing_structure_type, base_rate, base_unit, charging_rate_per_hour, tier_1_rate_per_hour, tier_1_max_hours, tier_2_rate_per_hour, has_guest_fee, guest_fee, has_flat_fee, flat_fee, has_idle_fee, idle_rate, idle_unit, idle_grace_hours, energy_rate_per_kwh, region, lat, lng, first_seen_at",
      )
      .eq("tracking_scope", "toronto")
      .eq("is_active", true)
      .eq("is_decommissioned", false)
      .order("listing_id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load active chargers: ${error.message}`);
    }

    if (!data?.length) {
      break;
    }

    chargers.push(...(data as PollTarget[]));

    if (data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return chargers;
}

async function main() {
  const [
    { createServiceRoleSupabaseClient },
    { fetchWithBackoff, sleepWithJitter },
    { parseSwtchListingStatusHtml },
    { recordCheckError, recordStatusCheck },
    { getGlobalStatusTrackingStartedAt, resolveStatusTrackingStartedAt },
  ] = await Promise.all([
    import("@/lib/supabase/server"),
    import("@/lib/swtch/fetch"),
    import("@/lib/swtch/parser"),
    import("@/lib/swtch/status-store"),
    import("@/lib/status-tracking"),
  ]);

  const { limit, shardCount, shardIndex } = parseArgs();
  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be set in .env.local before using poll:status",
    );
  }

  const globalStatusTrackingStartedAt =
    await getGlobalStatusTrackingStartedAt(supabase);

  const allChargers = await loadPollTargets(supabase);
  const shardChargers = allChargers.filter(
    (charger) => charger.listing_id % shardCount === shardIndex,
  );
  const chargers =
    limit != null ? shardChargers.slice(0, limit) : shardChargers;

  if (!chargers.length) {
    console.log(
      `No active Toronto chargers found to poll for shard ${shardIndex + 1}/${shardCount}.`,
    );
    return;
  }

  const summary = {
    total: chargers.length,
    succeeded: 0,
    failed: 0,
    missing: 0,
  };

  console.log(
    `Starting Toronto status poll for shard ${shardIndex + 1}/${shardCount}: ${chargers.length} chargers selected from ${allChargers.length} active Toronto chargers${limit != null ? ` (limit ${limit})` : ""}...`,
  );

  for (const [index, charger] of chargers.entries()) {
    const progress = `[${index + 1}/${chargers.length}]`;
    const trackingStartedAt = resolveStatusTrackingStartedAt(
      charger.first_seen_at,
      globalStatusTrackingStartedAt,
    );

    try {
      const response = await fetchWithBackoff(
        `https://charge.swtchenergy.com/listings/${charger.listing_id}`,
        {
          cache: "no-store",
        },
        {
          userAgent: "swtch-map/0.1 (status poller)",
          baseDelayMs: 900,
          maxDelayMs: 8000,
          jitterMs: 200,
          onRetry: ({ attempt, delayMs, reason }) => {
            console.log(
              `${progress} listing ${charger.listing_id}: retry ${attempt} after ${delayMs}ms (${reason})`,
            );
          },
        },
      );

      if (!response.ok) {
        summary.missing += 1;
        await recordCheckError({
          supabase,
          charger: toStatusTrackingCharger(charger, trackingStartedAt),
          errorMessage: `Poll fetch failed with HTTP ${response.status}`,
        });
        console.log(
          `${progress} listing ${charger.listing_id}: fetch failed (${response.status})`,
        );
        await sleepWithJitter(250, 75);
        continue;
      }

      const html = await response.text();
      const parsed = parseSwtchListingStatusHtml(html, charger.listing_id);

      if (!parsed) {
        summary.failed += 1;
        await recordCheckError({
          supabase,
          charger: toStatusTrackingCharger(charger, trackingStartedAt),
          errorMessage: "Poll parse failed for listing page",
        });
        console.log(
          `${progress} listing ${charger.listing_id}: parse failed`,
        );
        await sleepWithJitter(250, 75);
        continue;
      }

      await recordStatusCheck({
        supabase,
        charger: toStatusTrackingCharger(charger, trackingStartedAt),
        statusText: parsed.statusText,
        statusNormalized: parsed.statusNormalized,
      });

      summary.succeeded += 1;
      console.log(
        `${progress} listing ${charger.listing_id}: ${parsed.chargerIdentifier} | ${parsed.statusText}`,
      );
      await sleepWithJitter(300, 75);
    } catch (pollError) {
      summary.failed += 1;
      const message =
        pollError instanceof Error ? pollError.message : "Unknown poll error";

      await recordCheckError({
        supabase,
        charger: toStatusTrackingCharger(charger, trackingStartedAt),
        errorMessage: message,
      });
      console.log(`${progress} listing ${charger.listing_id}: error | ${message}`);
      await sleepWithJitter(250, 75);
    }
  }

  console.log("Status poll complete.");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
