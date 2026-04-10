import { NextResponse, type NextRequest } from "next/server";

type RateLimitPolicy = {
  bucket: string;
  limit: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore =
  (globalThis as typeof globalThis & {
    __chargerMapRateLimitStore?: Map<string, RateLimitEntry>;
  }).__chargerMapRateLimitStore ??
  new Map<string, RateLimitEntry>();

(globalThis as typeof globalThis & {
  __chargerMapRateLimitStore?: Map<string, RateLimitEntry>;
}).__chargerMapRateLimitStore = rateLimitStore;

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

function getRateLimitPolicy(pathname: string): RateLimitPolicy | null {
  if (pathname.startsWith("/api/map/chargers")) {
    return {
      bucket: "map-api",
      limit: 90,
      windowMs: 60_000,
    };
  }

  if (pathname.startsWith("/dashboard")) {
    return {
      bucket: "dashboard-page",
      limit: 45,
      windowMs: 60_000,
    };
  }

  if (pathname.startsWith("/chargers/")) {
    return {
      bucket: "charger-page",
      limit: 45,
      windowMs: 60_000,
    };
  }

  if (pathname === "/") {
    return {
      bucket: "home-page",
      limit: 60,
      windowMs: 60_000,
    };
  }

  return null;
}

function applyRateLimit(
  clientIp: string,
  policy: RateLimitPolicy,
) {
  const now = Date.now();
  const key = `${policy.bucket}:${clientIp}`;
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt <= now) {
    const next = {
      count: 1,
      resetAt: now + policy.windowMs,
    };

    rateLimitStore.set(key, next);
    return {
      allowed: true,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - next.count),
      retryAfterSeconds: Math.ceil(policy.windowMs / 1000),
    };
  }

  existing.count += 1;
  rateLimitStore.set(key, existing);

  return {
    allowed: existing.count <= policy.limit,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - existing.count),
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((existing.resetAt - now) / 1000),
    ),
  };
}

export function proxy(request: NextRequest) {
  const policy = getRateLimitPolicy(request.nextUrl.pathname);

  if (!policy) {
    return NextResponse.next();
  }

  const result = applyRateLimit(getClientIp(request), policy);

  if (result.allowed) {
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(result.limit));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    return response;
  }

  const isApiRequest = request.nextUrl.pathname.startsWith("/api/");
  const body = isApiRequest
    ? JSON.stringify({ error: "Too many requests. Please try again soon." })
    : "Too many requests. Please try again soon.";
  const response = new NextResponse(body, {
    status: 429,
    headers: {
      "Content-Type": isApiRequest ? "application/json" : "text/plain; charset=utf-8",
      "Retry-After": String(result.retryAfterSeconds),
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
    },
  });

  return response;
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/chargers/:path*", "/api/map/chargers/:path*"],
};
