type FetchRetryContext = {
  attempt: number;
  delayMs: number;
  reason: string;
};

type FetchWithBackoffOptions = {
  userAgent: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  timeoutMs?: number;
  onRetry?: (context: FetchRetryContext) => void;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(amountMs: number) {
  if (amountMs <= 0) {
    return 0;
  }

  const spread = amountMs * 2 + 1;
  return Math.floor(Math.random() * spread) - amountMs;
}

function withJitter(baseDelayMs: number, jitterMs: number) {
  return Math.max(0, baseDelayMs + jitter(jitterMs));
}

function parseRetryAfterMs(value: string | null) {
  if (!value) {
    return null;
  }

  const asSeconds = Number(value);

  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }

  const retryAt = Date.parse(value);

  if (!Number.isFinite(retryAt)) {
    return null;
  }

  return Math.max(0, retryAt - Date.now());
}

function shouldRetryStatus(status: number) {
  return status === 429 || status >= 500;
}

export async function sleepWithJitter(baseDelayMs: number, jitterMs: number) {
  await sleep(withJitter(baseDelayMs, jitterMs));
}

export async function fetchWithBackoff(
  url: string,
  init: RequestInit,
  options: FetchWithBackoffOptions,
) {
  const {
    userAgent,
    maxAttempts = 4,
    baseDelayMs = 1200,
    maxDelayMs = 12000,
    jitterMs = 250,
    timeoutMs = 15000,
    onRetry,
  } = options;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          "User-Agent": userAgent,
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!shouldRetryStatus(response.status) || attempt === maxAttempts) {
        return response;
      }

      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      const exponentialDelayMs = Math.min(
        maxDelayMs,
        baseDelayMs * 2 ** (attempt - 1),
      );
      const delayMs = withJitter(
        retryAfterMs != null ? Math.min(retryAfterMs, maxDelayMs) : exponentialDelayMs,
        jitterMs,
      );

      onRetry?.({
        attempt,
        delayMs,
        reason: `http_${response.status}`,
      });

      await sleep(delayMs);
      continue;
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break;
      }

      const delayMs = withJitter(
        Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)),
        jitterMs,
      );

      onRetry?.({
        attempt,
        delayMs,
        reason: error instanceof Error ? error.message : "network_error",
      });

      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to fetch ${url}`);
}
