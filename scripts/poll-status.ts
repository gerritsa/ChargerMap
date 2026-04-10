import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import {
  DEFAULT_POLL_BATCH_SIZE,
  DEFAULT_POLL_CONCURRENCY,
  DEFAULT_POLL_DUE_AFTER_MINUTES,
  DEFAULT_POLL_SHARD_COUNT,
  POLL_SCOPE,
  parsePollBatchRequest,
  runPollStatusBatch,
} from "@/lib/polling";

type PollArgs = {
  batchSize: number;
  concurrency: number;
  dueAfterMinutes: number;
  shardCount: number;
  shardIndex: number;
};

function parseArgs(): PollArgs {
  const limitIndex = process.argv.indexOf("--limit");
  const limitValue =
    limitIndex >= 0
      ? Number(process.argv[limitIndex + 1] ?? "")
      : DEFAULT_POLL_BATCH_SIZE;
  const batchSizeIndex = process.argv.indexOf("--batch-size");
  const batchSizeValue =
    batchSizeIndex >= 0
      ? Number(process.argv[batchSizeIndex + 1] ?? "")
      : limitValue;
  const concurrencyIndex = process.argv.indexOf("--concurrency");
  const concurrencyValue =
    concurrencyIndex >= 0
      ? Number(process.argv[concurrencyIndex + 1] ?? "")
      : DEFAULT_POLL_CONCURRENCY;
  const dueAfterMinutesIndex = process.argv.indexOf("--due-after-minutes");
  const dueAfterMinutesValue =
    dueAfterMinutesIndex >= 0
      ? Number(process.argv[dueAfterMinutesIndex + 1] ?? "")
      : DEFAULT_POLL_DUE_AFTER_MINUTES;
  const shardCountIndex = process.argv.indexOf("--shard-count");
  const shardIndexIndex = process.argv.indexOf("--shard-index");
  const shardCountValue =
    shardCountIndex >= 0
      ? Number(process.argv[shardCountIndex + 1] ?? "")
      : Number(process.env.POLL_SHARD_COUNT ?? `${DEFAULT_POLL_SHARD_COUNT}`);
  const shardIndexValue =
    shardIndexIndex >= 0
      ? Number(process.argv[shardIndexIndex + 1] ?? "")
      : Number(process.env.POLL_SHARD_INDEX ?? "0");

  if (!Number.isFinite(batchSizeValue) || Math.floor(batchSizeValue) < 1) {
    throw new Error(
      "Usage: npm run poll:status -- [--batch-size <count>] [--limit <count>] [--concurrency <count>] [--due-after-minutes <count>] [--shard-count <count>] [--shard-index <index>]",
    );
  }

  if (
    !Number.isFinite(concurrencyValue) ||
    Math.floor(concurrencyValue) < 1 ||
    !Number.isFinite(dueAfterMinutesValue) ||
    Math.floor(dueAfterMinutesValue) < 1 ||
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
    batchSize: Math.floor(batchSizeValue),
    concurrency: Math.floor(concurrencyValue),
    dueAfterMinutes: Math.floor(dueAfterMinutesValue),
    shardCount: Math.floor(shardCountValue),
    shardIndex: Math.floor(shardIndexValue),
  };
}

async function main() {
  const [{ createServiceRoleSupabaseClient }] = await Promise.all([
    import("@/lib/supabase/server"),
  ]);

  const { batchSize, concurrency, dueAfterMinutes, shardCount, shardIndex } =
    parseArgs();
  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be set in .env.local before using poll:status",
    );
  }

  const request = parsePollBatchRequest({
    scope: POLL_SCOPE,
    shardIndex,
    shardCount,
    batchSize,
    concurrency,
    dueAfterMinutes,
  });
  const summary = await runPollStatusBatch({
    supabase,
    request,
    logger: console,
  });

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
