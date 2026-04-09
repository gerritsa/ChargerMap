import { NextResponse } from "next/server";

import { getMapChargerGroup } from "@/lib/chargers";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const chargers = await getMapChargerGroup(id);

  if (!chargers) {
    return NextResponse.json(
      { message: "Charger not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    chargers,
    selectedId: chargers.some((charger) => charger.id === id) ? id : chargers[0]?.id ?? null,
  });
}
