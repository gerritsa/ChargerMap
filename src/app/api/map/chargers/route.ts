import { NextResponse } from "next/server";

import { DEFAULT_MAP_BOUNDS, getMapDataForBounds } from "@/lib/chargers";

export const dynamic = "force-dynamic";

const MAP_CACHE_CONTROL =
  "public, s-maxage=120, stale-while-revalidate=300";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bounds = {
    west: Number(searchParams.get("west") ?? DEFAULT_MAP_BOUNDS.west),
    south: Number(searchParams.get("south") ?? DEFAULT_MAP_BOUNDS.south),
    east: Number(searchParams.get("east") ?? DEFAULT_MAP_BOUNDS.east),
    north: Number(searchParams.get("north") ?? DEFAULT_MAP_BOUNDS.north),
  };

  const data = await getMapDataForBounds(bounds);
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": MAP_CACHE_CONTROL,
    },
  });
}
