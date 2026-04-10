import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import {
  DEFAULT_ASSUMED_BATTERY_KWH,
  DEFAULT_ASSUMED_END_SOC,
  DEFAULT_ASSUMED_START_SOC,
  DEFAULT_ASSUMED_VEHICLE,
  DEFAULT_ESTIMATION_METHOD,
  estimateSession,
  type SessionEstimatorCharger,
  type SessionStatusEvent,
} from "@/lib/swtch/session-estimation";
import type { ChargerStatusNormalized } from "@/types/charger";

type ScriptArgs = {
  chargerId: string | null;
  dryRun: boolean;
  limit: number | null;
};

type ClosedSessionRow = {
  id: string;
  charger_id: string;
  started_at: string;
  ended_at: string;
  start_status_text: string;
  end_status_text: string | null;
  duration_minutes: number | null;
  estimated_kwh: number | null;
  estimated_revenue: number | null;
  estimation_method: string | null;
};

type ChargerConfigRow = {
  id: string;
  output_kw: number | null;
  price_model_type: string | null;
  pricing_base_type: string | null;
  pricing_structure_type: string | null;
  base_rate: number | null;
  base_unit: string | null;
  charging_rate_per_hour: number | null;
  tier_1_rate_per_hour: number | null;
  tier_1_max_hours: number | null;
  tier_2_rate_per_hour: number | null;
  guest_fee: number | null;
  flat_fee: number | null;
  idle_rate: number | null;
  idle_unit: string | null;
  idle_grace_hours: number | null;
  energy_rate_per_kwh: number | null;
};

type StatusEventRow = {
  changed_at: string;
  to_status_text: string;
  to_status_normalized: ChargerStatusNormalized;
};

type SessionRecalculation = {
  id: string;
  chargerId: string;
  durationMinutes: number;
  estimatedKwh: number | null;
  estimatedRevenue: number | null;
  previousEstimatedKwh: number | null;
  previousEstimatedRevenue: number | null;
  previousMethod: string | null;
};

type ChargerAggregate = {
  totalSessions: number;
  estimatedAllTimeKwh: number;
  estimatedAllTimeRevenue: number;
};

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function parseArgs() {
  const chargerIdIndex = process.argv.indexOf("--charger-id");
  const chargerId =
    chargerIdIndex >= 0 ? (process.argv[chargerIdIndex + 1] ?? null) : null;
  const limitIndex = process.argv.indexOf("--limit");
  const limitValue =
    limitIndex >= 0 ? Number(process.argv[limitIndex + 1] ?? "") : null;
  const dryRun = process.argv.includes("--dry-run");

  if (
    limitValue != null &&
    (!Number.isFinite(limitValue) || Math.floor(limitValue) < 1)
  ) {
    throw new Error(
      "Usage: npm run backfill:session-estimates -- [--charger-id <uuid>] [--limit <count>] [--dry-run]",
    );
  }

  return {
    chargerId,
    dryRun,
    limit: limitValue == null ? null : Math.floor(limitValue),
  } satisfies ScriptArgs;
}

function mapChargerConfig(row: ChargerConfigRow): SessionEstimatorCharger {
  return {
    outputKw: row.output_kw,
    priceModelType: row.price_model_type,
    pricingBaseType: row.pricing_base_type,
    pricingStructureType: row.pricing_structure_type,
    baseRate: row.base_rate,
    baseUnit: row.base_unit,
    chargingRatePerHour: row.charging_rate_per_hour,
    tier1RatePerHour: row.tier_1_rate_per_hour,
    tier1MaxHours: row.tier_1_max_hours,
    tier2RatePerHour: row.tier_2_rate_per_hour,
    guestFee: row.guest_fee,
    flatFee: row.flat_fee,
    idleRate: row.idle_rate,
    idleUnit: row.idle_unit,
    idleGraceHours: row.idle_grace_hours,
    energyRatePerKwh: row.energy_rate_per_kwh,
  };
}

async function loadClosedSessions(
  supabase: NonNullable<
    ReturnType<
      typeof import("@/lib/supabase/server")["createServiceRoleSupabaseClient"]
    >
  >,
  args: ScriptArgs,
) {
  const pageSize = 1000;
  const sessions: ClosedSessionRow[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from("charger_sessions")
      .select(
        "id, charger_id, started_at, ended_at, start_status_text, end_status_text, duration_minutes, estimated_kwh, estimated_revenue, estimation_method",
      )
      .not("ended_at", "is", null)
      .order("started_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (args.chargerId) {
      query = query.eq("charger_id", args.chargerId);
    }

    if (args.limit != null) {
      const remaining = args.limit - sessions.length;

      if (remaining <= 0) {
        break;
      }

      query = query.range(offset, offset + Math.min(pageSize, remaining) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to load closed sessions: ${error.message}`);
    }

    if (!data?.length) {
      break;
    }

    sessions.push(...(data as ClosedSessionRow[]));

    if (data.length < pageSize || (args.limit != null && sessions.length >= args.limit)) {
      break;
    }

    offset += pageSize;
  }

  return sessions;
}

async function loadChargerConfigs(
  supabase: NonNullable<
    ReturnType<
      typeof import("@/lib/supabase/server")["createServiceRoleSupabaseClient"]
    >
  >,
  chargerIds: string[],
) {
  const chargers = new Map<string, SessionEstimatorCharger>();

  for (const batch of chunk(chargerIds, 500)) {
    const { data, error } = await supabase
      .from("chargers")
      .select(
        "id, output_kw, price_model_type, pricing_base_type, pricing_structure_type, base_rate, base_unit, charging_rate_per_hour, tier_1_rate_per_hour, tier_1_max_hours, tier_2_rate_per_hour, guest_fee, flat_fee, idle_rate, idle_unit, idle_grace_hours, energy_rate_per_kwh",
      )
      .in("id", batch);

    if (error) {
      throw new Error(`Failed to load charger configs: ${error.message}`);
    }

    for (const row of (data ?? []) as ChargerConfigRow[]) {
      chargers.set(row.id, mapChargerConfig(row));
    }
  }

  return chargers;
}

async function loadStatusEventsForCharger(
  supabase: NonNullable<
    ReturnType<
      typeof import("@/lib/supabase/server")["createServiceRoleSupabaseClient"]
    >
  >,
  chargerId: string,
  startedAt: string,
  endedAt: string,
) {
  const pageSize = 1000;
  const events: SessionStatusEvent[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("charger_status_events")
      .select("changed_at, to_status_text, to_status_normalized")
      .eq("charger_id", chargerId)
      .gt("changed_at", startedAt)
      .lt("changed_at", endedAt)
      .order("changed_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(
        `Failed to load status events for charger ${chargerId}: ${error.message}`,
      );
    }

    if (!data?.length) {
      break;
    }

    for (const row of data as StatusEventRow[]) {
      events.push({
        changedAt: row.changed_at,
        statusText: row.to_status_text,
        statusNormalized: row.to_status_normalized,
      });
    }

    if (data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return events;
}

async function updateSessionBatch(
  supabase: NonNullable<
    ReturnType<
      typeof import("@/lib/supabase/server")["createServiceRoleSupabaseClient"]
    >
  >,
  batch: SessionRecalculation[],
) {
  await Promise.all(
    batch.map(async (session) => {
      const { error } = await supabase
        .from("charger_sessions")
        .update({
          duration_minutes: session.durationMinutes,
          estimated_kwh: session.estimatedKwh,
          estimated_revenue: session.estimatedRevenue,
          assumed_vehicle: DEFAULT_ASSUMED_VEHICLE,
          assumed_battery_kwh: DEFAULT_ASSUMED_BATTERY_KWH,
          assumed_start_soc: DEFAULT_ASSUMED_START_SOC,
          assumed_end_soc: DEFAULT_ASSUMED_END_SOC,
          estimation_method: DEFAULT_ESTIMATION_METHOD,
        })
        .eq("id", session.id);

      if (error) {
        throw new Error(
          `Failed to update session ${session.id}: ${error.message}`,
        );
      }
    }),
  );
}

async function loadChargerAggregates(
  supabase: NonNullable<
    ReturnType<
      typeof import("@/lib/supabase/server")["createServiceRoleSupabaseClient"]
    >
  >,
  chargerIds: string[],
) {
  const aggregates = new Map<string, ChargerAggregate>();
  const pageSize = 1000;

  for (const batch of chunk(chargerIds, 500)) {
    for (const chargerId of batch) {
      aggregates.set(chargerId, {
        totalSessions: 0,
        estimatedAllTimeKwh: 0,
        estimatedAllTimeRevenue: 0,
      });
    }

    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from("charger_sessions")
        .select("charger_id, estimated_kwh, estimated_revenue")
        .not("ended_at", "is", null)
        .in("charger_id", batch)
        .order("started_at", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        throw new Error(`Failed to reload charger aggregates: ${error.message}`);
      }

      if (!data?.length) {
        break;
      }

      for (const row of
        data as Array<{
          charger_id: string;
          estimated_kwh: number | null;
          estimated_revenue: number | null;
        }>) {
        const aggregate = aggregates.get(row.charger_id);

        if (!aggregate) {
          continue;
        }

        aggregate.totalSessions += 1;
        aggregate.estimatedAllTimeKwh = roundTo(
          aggregate.estimatedAllTimeKwh + (row.estimated_kwh ?? 0),
          2,
        );
        aggregate.estimatedAllTimeRevenue = roundTo(
          aggregate.estimatedAllTimeRevenue + (row.estimated_revenue ?? 0),
          2,
        );
      }

      if (data.length < pageSize) {
        break;
      }

      offset += pageSize;
    }
  }

  return aggregates;
}

async function updateChargerAggregateTables(
  supabase: NonNullable<
    ReturnType<
      typeof import("@/lib/supabase/server")["createServiceRoleSupabaseClient"]
    >
  >,
  aggregates: Map<string, ChargerAggregate>,
) {
  for (const [chargerId, aggregate] of aggregates.entries()) {
    const chargerUpdate = await supabase
      .from("chargers")
      .update({
        total_sessions: aggregate.totalSessions,
        estimated_all_time_kwh: aggregate.estimatedAllTimeKwh,
        estimated_all_time_revenue: aggregate.estimatedAllTimeRevenue,
      })
      .eq("id", chargerId);

    if (chargerUpdate.error) {
      throw new Error(
        `Failed to update charger aggregate for ${chargerId}: ${chargerUpdate.error.message}`,
      );
    }

    const chargerStatsUpdate = await supabase
      .from("charger_stats")
      .update({
        total_sessions: aggregate.totalSessions,
        estimated_all_time_kwh: aggregate.estimatedAllTimeKwh,
        estimated_all_time_revenue: aggregate.estimatedAllTimeRevenue,
      })
      .eq("charger_id", chargerId);

    if (chargerStatsUpdate.error) {
      throw new Error(
        `Failed to update charger_stats aggregate for ${chargerId}: ${chargerStatsUpdate.error.message}`,
      );
    }
  }
}

async function main() {
  const [{ createServiceRoleSupabaseClient }] = await Promise.all([
    import("@/lib/supabase/server"),
  ]);
  const args = parseArgs();
  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be set in .env.local before using backfill:session-estimates",
    );
  }

  const sessions = await loadClosedSessions(supabase, args);

  if (!sessions.length) {
    console.log(
      JSON.stringify(
        {
          dryRun: args.dryRun,
          totalSessions: 0,
          recalculatedSessions: 0,
          affectedChargers: 0,
        },
        null,
        2,
      ),
    );
    return;
  }

  const sessionsByCharger = new Map<string, ClosedSessionRow[]>();

  for (const session of sessions) {
    const group = sessionsByCharger.get(session.charger_id) ?? [];
    group.push(session);
    sessionsByCharger.set(session.charger_id, group);
  }

  const chargerConfigs = await loadChargerConfigs(
    supabase,
    [...sessionsByCharger.keys()],
  );
  const recalculations: SessionRecalculation[] = [];

  for (const [chargerId, chargerSessions] of sessionsByCharger.entries()) {
    const charger = chargerConfigs.get(chargerId);

    if (!charger) {
      throw new Error(`Missing charger config for ${chargerId}`);
    }

    const sortedSessions = [...chargerSessions].sort(
      (left, right) =>
        new Date(left.started_at).getTime() - new Date(right.started_at).getTime(),
    );
    const statusEvents = await loadStatusEventsForCharger(
      supabase,
      chargerId,
      sortedSessions[0].started_at,
      sortedSessions[sortedSessions.length - 1].ended_at!,
    );

    for (const session of sortedSessions) {
      const sessionEvents = statusEvents.filter(
        (event) =>
          new Date(event.changedAt).getTime() >
            new Date(session.started_at).getTime() &&
          new Date(event.changedAt).getTime() <
            new Date(session.ended_at!).getTime(),
      );
      const estimation = estimateSession({
        charger,
        startedAt: session.started_at,
        endedAt: session.ended_at!,
        startStatusText: session.start_status_text,
        statusEvents: sessionEvents,
      });

      recalculations.push({
        id: session.id,
        chargerId,
        durationMinutes: estimation.durationMinutes,
        estimatedKwh: estimation.estimatedKwh,
        estimatedRevenue: estimation.estimatedRevenue,
        previousEstimatedKwh: session.estimated_kwh,
        previousEstimatedRevenue: session.estimated_revenue,
        previousMethod: session.estimation_method,
      });
    }
  }

  const changedSessions = recalculations.filter(
    (session) =>
      roundTo(session.previousEstimatedKwh ?? 0, 2) !==
        roundTo(session.estimatedKwh ?? 0, 2) ||
      roundTo(session.previousEstimatedRevenue ?? 0, 2) !==
        roundTo(session.estimatedRevenue ?? 0, 2) ||
      session.previousMethod !== DEFAULT_ESTIMATION_METHOD,
  );
  const deltaKwh = roundTo(
    changedSessions.reduce(
      (sum, session) =>
        sum + (session.estimatedKwh ?? 0) - (session.previousEstimatedKwh ?? 0),
      0,
    ),
    2,
  );
  const deltaRevenue = roundTo(
    changedSessions.reduce(
      (sum, session) =>
        sum +
        (session.estimatedRevenue ?? 0) -
        (session.previousEstimatedRevenue ?? 0),
      0,
    ),
    2,
  );

  if (!args.dryRun) {
    for (const batch of chunk(recalculations, 25)) {
      await updateSessionBatch(supabase, batch);
    }

    const aggregates = await loadChargerAggregates(
      supabase,
      [...sessionsByCharger.keys()],
    );
    await updateChargerAggregateTables(supabase, aggregates);
  }

  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun,
        totalSessions: sessions.length,
        recalculatedSessions: recalculations.length,
        changedSessions: changedSessions.length,
        affectedChargers: sessionsByCharger.size,
        deltaEstimatedKwh: deltaKwh,
        deltaEstimatedRevenue: deltaRevenue,
        estimationMethod: DEFAULT_ESTIMATION_METHOD,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
