export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
};

export async function geocodeAddress(
  address: string,
): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    q: address,
    format: "jsonv2",
    limit: "1",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "swtch-map/0.1 (discovery geocoder)",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return null;
  }

  const results = (await response.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;

  const top = results[0];

  if (!top) {
    return null;
  }

  return {
    lat: Number(top.lat),
    lng: Number(top.lon),
    displayName: top.display_name,
  };
}
