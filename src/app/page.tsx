import { AppHeader } from "@/components/app-header";
import { MapExperience } from "@/components/map-experience";
import {
  DEFAULT_MAP_BOUNDS,
  getMapChargerGroup,
  getMapDataForBounds,
} from "@/lib/chargers";
import { getTrackingStartedAtLabel } from "@/lib/tracking-start";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const requestedCharger = Array.isArray(params.charger) ? params.charger[0] : params.charger;
  const [mapData, initialSelectedGroup, trackingStartedAtLabel] = await Promise.all([
    getMapDataForBounds(DEFAULT_MAP_BOUNDS),
    requestedCharger ? getMapChargerGroup(requestedCharger) : Promise.resolve(null),
    getTrackingStartedAtLabel(),
  ]);
  const initialSelectedId =
    requestedCharger &&
    initialSelectedGroup?.some((charger) => charger.id === requestedCharger)
      ? requestedCharger
      : null;

  return (
    <main className="min-h-screen overflow-hidden pb-0 pt-0">
      <AppHeader trackingStartedAtLabel={trackingStartedAtLabel} />
      <MapExperience
        initialBounds={DEFAULT_MAP_BOUNDS}
        initialChargers={mapData.summaries}
        initialMetrics={mapData.metrics}
        initialSelectedGroup={initialSelectedGroup ?? []}
        initialSelectedId={initialSelectedId}
        trackingStartedAtLabel={trackingStartedAtLabel}
      />
    </main>
  );
}
