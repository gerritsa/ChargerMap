import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  getGlobalStatusTrackingStartedAt,
  resolveStatusTrackingStartedAt,
} from "@/lib/status-tracking";
import {
  fetchWithBackoff,
  sleepWithJitter,
} from "@/lib/swtch/fetch";
import { parseSwtchListingStatusHtml } from "@/lib/swtch/parser";
import {
  recordCheckError,
  recordStatusCheck,
  type StatusTrackingCharger,
} from "@/lib/swtch/status-store";

export const POLL_SCOPE = "toronto";
export const DEFAULT_POLL_SHARD_COUNT = 5;
export const DEFAULT_POLL_BATCH_SIZE = 35;
export const DEFAULT_POLL_CONCURRENCY = 5;
export const DEFAULT_POLL_DUE_AFTER_MINUTES = 15;
export const DEFAULT_POLL_LEASE_TTL_SECONDS = 55;
export const DEFAULT_POLL_RUNTIME_GUARD_MS = 45_000;
export const POLLER_SECRET_HEADER = "x-poller-secret";
export const POLLER_USER_AGENT = "charger-map/0.1 (status poller)";

const pollBatchRequestSchema = z
  .object({
    scope: z.literal(POLL_SCOPE),
    shardIndex: z.number().int().min(0),
    shardCount: z.number().int().min(1).default(DEFAULT_POLL_SHARD_COUNT),
    batchSize: z.number().int().min(1).max(100).default(DEFAULT_POLL_BATCH_SIZE),
    concurrency: z.number().int().min(1).max(10).default(DEFAULT_POLL_CONCURRENCY),
    dueAfterMinutes: z
      .number()
      .int()
      .min(1)
      .max(120)
      .default(DEFAULT_POLL_DUE_AFTER_MINUTES),
  })
  .superRefine((value, context) => {
    if (value.shardIndex >= value.shardCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "shardIndex must be less than shardCount.",
        path: ["shardIndex"],
      });
    }
  });

export type PollBatchRequest = z.infer<typeof pollBatchRequestSchema>;

export type PollBatchSummary = {
  scope: typeof POLL_SCOPE;
  shardIndex: number;
  selected: number;
  succeeded: number;
  failed: number;
  missing: number;
  startedAt: string;
  finishedAt: string;
  leaseAcquired: boolean;
};

export type PollTarget = {
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
  last_checked_at: string | null;
};

type PollerLogger = Pick<Console, "log" | "error">;

type PollRunOptions = {
  supabase: SupabaseClient;
  request: PollBatchRequest;
  logger?: PollerLogger;
  leaseTtlSeconds?: number;
  maxRuntimeMs?: number;
};

function toStatusTrackingCharger(
  charger: PollTarget,
  trackingStartedAt: string,
): StatusTrackingCharger {
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

export function parsePollBatchRequest(input: unknown) {
  return pollBatchRequestSchema.parse(input);
}

export function getShardForListingId(listingId: number, shardCount: number) {
  return ((listingId % shardCount) + shardCount) % shardCount;
}

export function hasRuntimeBudgetRemaining(
  startedAtMs: number,
  maxRuntimeMs: number,
  nowMs = Date.now(),
) {
  return nowMs - startedAtMs < maxRuntimeMs;
}

export function isAuthorizedPollerRequest(
  providedSecret: string | null,
  expectedSecret: string | null,
) {
  return Boolean(expectedSecret && providedSecret && providedSecret === expectedSecret);
}

async function tryAcquirePollShardLease(args: {
  supabase: SupabaseClient;
  request: PollBatchRequest;
  runId: string;
  leaseTtlSeconds: number;
}) {
  const { data, error } = await args.supabase.rpc("try_acquire_poll_shard_lease", {
    target_scope: args.request.scope,
    target_shard_index: args.request.shardIndex,
    target_ttl_seconds: args.leaseTtlSeconds,
    target_run_id: args.runId,
  });

  if (error) {
    throw new Error(`Failed to acquire shard lease: ${error.message}`);
  }

  return data === true;
}

async function releasePollShardLease(args: {
  supabase: SupabaseClient;
  request: PollBatchRequest;
  runId: string;
  summary: PollBatchSummary;
  errorMessage: string | null;
}) {
  const { error } = await args.supabase.rpc("release_poll_shard_lease", {
    target_scope: args.request.scope,
    target_shard_index: args.request.shardIndex,
    target_run_id: args.runId,
    target_summary: args.summary,
    target_error: args.errorMessage,
  });

  if (error) {
    throw new Error(`Failed to release shard lease: ${error.message}`);
  }
}

async function loadDuePollTargets(args: {
  supabase: SupabaseClient;
  request: PollBatchRequest;
}) {
  const dueBefore = new Date(
    Date.now() - args.request.dueAfterMinutes * 60_000,
  ).toISOString();
  const { data, error } = await args.supabase.rpc("get_due_poll_targets", {
    target_scope: args.request.scope,
    target_shard_index: args.request.shardIndex,
    target_shard_count: args.request.shardCount,
    target_batch_size: args.request.batchSize,
    target_due_before: dueBefore,
  });

  if (error) {
    throw new Error(`Failed to load due poll targets: ${error.message}`);
  }

  return (data ?? []) as PollTarget[];
}

async function pollTarget(args: {
  supabase: SupabaseClient;
  charger: PollTarget;
  globalStatusTrackingStartedAt: string | null;
  summary: PollBatchSummary;
  logger: PollerLogger;
  index: number;
  total: number;
}) {
  const progress = `[${args.index + 1}/${args.total}]`;
  const trackingStartedAt = resolveStatusTrackingStartedAt(
    args.charger.first_seen_at,
    args.globalStatusTrackingStartedAt,
  );

  try {
    const response = await fetchWithBackoff(
      `https://charge.swtchenergy.com/listings/${args.charger.listing_id}`,
      {
        cache: "no-store",
      },
      {
        userAgent: POLLER_USER_AGENT,
        baseDelayMs: 900,
        maxDelayMs: 8000,
        jitterMs: 200,
        onRetry: ({ attempt, delayMs, reason }) => {
          args.logger.log(
            `${progress} listing ${args.charger.listing_id}: retry ${attempt} after ${delayMs}ms (${reason})`,
          );
        },
      },
    );

    if (!response.ok) {
      args.summary.missing += 1;
      await recordCheckError({
        supabase: args.supabase,
        charger: toStatusTrackingCharger(args.charger, trackingStartedAt),
        errorMessage: `Poll fetch failed with HTTP ${response.status}`,
      });
      args.logger.log(
        `${progress} listing ${args.charger.listing_id}: fetch failed (${response.status})`,
      );
      await sleepWithJitter(150, 50);
      return;
    }

    const html = await response.text();
    const parsed = parseSwtchListingStatusHtml(html, args.charger.listing_id);

    if (!parsed) {
      args.summary.failed += 1;
      await recordCheckError({
        supabase: args.supabase,
        charger: toStatusTrackingCharger(args.charger, trackingStartedAt),
        errorMessage: "Poll parse failed for listing page",
      });
      args.logger.log(
        `${progress} listing ${args.charger.listing_id}: parse failed`,
      );
      await sleepWithJitter(150, 50);
      return;
    }

    await recordStatusCheck({
      supabase: args.supabase,
      charger: toStatusTrackingCharger(args.charger, trackingStartedAt),
      statusText: parsed.statusText,
      statusNormalized: parsed.statusNormalized,
    });

    args.summary.succeeded += 1;
    args.logger.log(
      `${progress} listing ${args.charger.listing_id}: ${parsed.chargerIdentifier} | ${parsed.statusText}`,
    );
    await sleepWithJitter(100, 50);
  } catch (pollError) {
    args.summary.failed += 1;
    const message =
      pollError instanceof Error ? pollError.message : "Unknown poll error";

    await recordCheckError({
      supabase: args.supabase,
      charger: toStatusTrackingCharger(args.charger, trackingStartedAt),
      errorMessage: message,
    });
    args.logger.log(
      `${progress} listing ${args.charger.listing_id}: error | ${message}`,
    );
    await sleepWithJitter(150, 50);
  }
}

async function processPollTargets(args: {
  supabase: SupabaseClient;
  request: PollBatchRequest;
  targets: PollTarget[];
  summary: PollBatchSummary;
  logger: PollerLogger;
  startedAtMs: number;
  maxRuntimeMs: number;
}) {
  const globalStatusTrackingStartedAt =
    await getGlobalStatusTrackingStartedAt(args.supabase);
  let nextIndex = 0;
  const workerCount = Math.min(args.request.concurrency, args.targets.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        if (!hasRuntimeBudgetRemaining(args.startedAtMs, args.maxRuntimeMs)) {
          return;
        }

        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= args.targets.length) {
          return;
        }

        await pollTarget({
          supabase: args.supabase,
          charger: args.targets[currentIndex],
          globalStatusTrackingStartedAt,
          summary: args.summary,
          logger: args.logger,
          index: currentIndex,
          total: args.targets.length,
        });
      }
    }),
  );
}

export async function runPollStatusBatch({
  supabase,
  request,
  logger = console,
  leaseTtlSeconds = DEFAULT_POLL_LEASE_TTL_SECONDS,
  maxRuntimeMs = DEFAULT_POLL_RUNTIME_GUARD_MS,
}: PollRunOptions): Promise<PollBatchSummary> {
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const summary: PollBatchSummary = {
    scope: request.scope,
    shardIndex: request.shardIndex,
    selected: 0,
    succeeded: 0,
    failed: 0,
    missing: 0,
    startedAt,
    finishedAt: startedAt,
    leaseAcquired: false,
  };
  let leaseAcquired = false;
  let runErrorMessage: string | null = null;

  await sleepWithJitter(request.shardIndex * 1000, 0);

  try {
    leaseAcquired = await tryAcquirePollShardLease({
      supabase,
      request,
      runId,
      leaseTtlSeconds,
    });
    summary.leaseAcquired = leaseAcquired;

    if (!leaseAcquired) {
      logger.log(
        `Skipped shard ${request.shardIndex + 1}/${request.shardCount}: lease not acquired.`,
      );
      return summary;
    }

    const targets = await loadDuePollTargets({ supabase, request });
    summary.selected = targets.length;

    if (!targets.length) {
      logger.log(
        `No due ${request.scope} chargers found for shard ${request.shardIndex + 1}/${request.shardCount}.`,
      );
      return summary;
    }

    logger.log(
      `Starting ${request.scope} status poll for shard ${request.shardIndex + 1}/${request.shardCount}: ${targets.length} chargers due.`,
    );

    await processPollTargets({
      supabase,
      request,
      targets,
      summary,
      logger,
      startedAtMs,
      maxRuntimeMs,
    });

    logger.log("Status poll complete.");
    return summary;
  } catch (error) {
    runErrorMessage =
      error instanceof Error ? error.message : "Unknown poll batch error";
    throw error;
  } finally {
    summary.finishedAt = new Date().toISOString();

    if (leaseAcquired) {
      await releasePollShardLease({
        supabase,
        request,
        runId,
        summary,
        errorMessage: runErrorMessage,
      });
    }
  }
}
