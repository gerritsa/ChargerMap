import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_POLL_BATCH_SIZE,
  DEFAULT_POLL_CONCURRENCY,
  DEFAULT_POLL_DUE_AFTER_MINUTES,
  DEFAULT_POLL_SHARD_COUNT,
  POLL_SCOPE,
  getShardForListingId,
  hasRuntimeBudgetRemaining,
  isAuthorizedPollerRequest,
  parsePollBatchRequest,
} from "@/lib/polling";

test("getShardForListingId is deterministic and evenly assigns a range", () => {
  const shardCounts = new Map<number, number>();

  for (let listingId = 1; listingId <= 100; listingId += 1) {
    const shard = getShardForListingId(listingId, 5);
    shardCounts.set(shard, (shardCounts.get(shard) ?? 0) + 1);
    assert.equal(shard, getShardForListingId(listingId, 5));
  }

  assert.deepEqual([...shardCounts.keys()].sort((left, right) => left - right), [
    0,
    1,
    2,
    3,
    4,
  ]);
  assert.deepEqual(
    [...shardCounts.values()].sort((left, right) => left - right),
    [20, 20, 20, 20, 20],
  );
});

test("parsePollBatchRequest applies defaults", () => {
  const parsed = parsePollBatchRequest({
    scope: POLL_SCOPE,
    shardIndex: 0,
  });

  assert.deepEqual(parsed, {
    scope: POLL_SCOPE,
    shardIndex: 0,
    shardCount: DEFAULT_POLL_SHARD_COUNT,
    batchSize: DEFAULT_POLL_BATCH_SIZE,
    concurrency: DEFAULT_POLL_CONCURRENCY,
    dueAfterMinutes: DEFAULT_POLL_DUE_AFTER_MINUTES,
  });
});

test("parsePollBatchRequest rejects an out-of-range shard index", () => {
  assert.throws(
    () =>
      parsePollBatchRequest({
        scope: POLL_SCOPE,
        shardIndex: 5,
        shardCount: 5,
      }),
    /shardIndex must be less than shardCount/,
  );
});

test("hasRuntimeBudgetRemaining uses a strict upper bound", () => {
  assert.equal(hasRuntimeBudgetRemaining(1_000, 45_000, 45_999), true);
  assert.equal(hasRuntimeBudgetRemaining(1_000, 45_000, 46_000), false);
});

test("isAuthorizedPollerRequest requires an exact secret match", () => {
  assert.equal(isAuthorizedPollerRequest("secret-1", "secret-1"), true);
  assert.equal(isAuthorizedPollerRequest("secret-1", "secret-2"), false);
  assert.equal(isAuthorizedPollerRequest(null, "secret-1"), false);
});
