import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const [{ fetchWithBackoff }, { geocodeAddress }, { parseSwtchListingHtml }] =
    await Promise.all([
      import("@/lib/swtch/fetch"),
    import("@/lib/swtch/geocode"),
    import("@/lib/swtch/parser"),
    ]);

  const arg = process.argv[2];
  const listingId = Number(arg);

  if (!arg || Number.isNaN(listingId)) {
    throw new Error("Usage: npm run scrape:listing -- <listing-id>");
  }

  const response = await fetchWithBackoff(
    `https://charge.swtchenergy.com/listings/${listingId}`,
    {
      cache: "no-store",
    },
    {
      userAgent: "charger-map/0.1 (manual listing scraper)",
      baseDelayMs: 1200,
      maxDelayMs: 10000,
      jitterMs: 250,
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch listing ${listingId}: ${response.status}`);
  }

  const html = await response.text();
  const parsed = parseSwtchListingHtml(html, listingId);

  if (!parsed) {
    console.log(
      JSON.stringify(
        {
          listingId,
          exists: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const geocoded = parsed.addressText
    ? parsed.lat != null && parsed.lng != null
      ? null
      : await geocodeAddress(parsed.addressText)
    : null;

  console.log(
    JSON.stringify(
      {
        ...parsed,
        coordinates: {
          lat: parsed.lat ?? geocoded?.lat ?? null,
          lng: parsed.lng ?? geocoded?.lng ?? null,
        },
        geocode: geocoded,
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
