import { AppHeader } from "@/components/app-header";
import { MapExperience } from "@/components/map-experience";
import {
  DEFAULT_MAP_BOUNDS,
  getMapChargerGroup,
  getMapDataForBounds,
  getMapNetworkMetrics,
} from "@/lib/chargers";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const requestedCharger = Array.isArray(params.charger) ? params.charger[0] : params.charger;
  const [{ summaries }, networkMetrics, initialSelectedGroup] = await Promise.all([
    getMapDataForBounds(DEFAULT_MAP_BOUNDS),
    getMapNetworkMetrics(),
    requestedCharger ? getMapChargerGroup(requestedCharger) : Promise.resolve(null),
  ]);
  const initialSelectedId =
    requestedCharger &&
    initialSelectedGroup?.some((charger) => charger.id === requestedCharger)
      ? requestedCharger
      : null;

  return (
    <main className="min-h-screen overflow-hidden pb-0 pt-0">
      <AppHeader />
      <MapExperience
        initialChargers={summaries}
        initialMetrics={networkMetrics}
        initialSelectedGroup={initialSelectedGroup ?? []}
        initialSelectedId={initialSelectedId}
      />
    </main>
  );
}
