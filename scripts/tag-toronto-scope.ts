import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

type ChargerScopeCandidate = {
  id: string;
  listing_id: number;
  lat: number | null;
  lng: number | null;
};

async function loadAllChargers(
  supabase: NonNullable<
    ReturnType<
      typeof import("@/lib/supabase/server")["createServiceRoleSupabaseClient"]
    >
  >,
) {
  const pageSize = 1000;
  const chargers: ChargerScopeCandidate[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("chargers")
      .select("id, listing_id, lat, lng")
      .order("listing_id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(
        `Failed to load chargers for Toronto tagging: ${error.message}`,
      );
    }

    if (!data?.length) {
      break;
    }

    chargers.push(...(data as ChargerScopeCandidate[]));

    if (data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return chargers;
}

async function updateScope(
  supabase: NonNullable<
    ReturnType<
      typeof import("@/lib/supabase/server")["createServiceRoleSupabaseClient"]
    >
  >,
  scope: "toronto" | "none",
  ids: string[],
) {
  for (const batch of chunk(ids, 500)) {
    const { error } = await supabase
      .from("chargers")
      .update({ tracking_scope: scope })
      .in("id", batch);

    if (error) {
      throw new Error(
        `Failed to update ${scope} scope batch: ${error.message}`,
      );
    }
  }
}

async function main() {
  const [{ createServiceRoleSupabaseClient }, { isPointInToronto }] =
    await Promise.all([
      import("@/lib/supabase/server"),
      import("@/lib/toronto-scope"),
    ]);

  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be set in .env.local before using scope:toronto",
    );
  }

  const data = await loadAllChargers(supabase);

  const torontoIds: string[] = [];
  const noneIds: string[] = [];
  let missingCoordinates = 0;

  for (const charger of data) {
    if (charger.lat == null || charger.lng == null) {
      noneIds.push(charger.id);
      missingCoordinates += 1;
      continue;
    }

    if (isPointInToronto(charger.lat, charger.lng)) {
      torontoIds.push(charger.id);
    } else {
      noneIds.push(charger.id);
    }
  }

  console.log(
    `Tagging ${data.length} chargers for Toronto live tracking (${torontoIds.length} in scope, ${noneIds.length} out of scope)...`,
  );

  await updateScope(supabase, "toronto", torontoIds);
  await updateScope(supabase, "none", noneIds);

  console.log(
    JSON.stringify(
      {
        totalChargers: data.length,
        torontoChargers: torontoIds.length,
        outOfScopeChargers: noneIds.length,
        missingCoordinates,
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
