"use client";

import { useEffect, useMemo, useRef } from "react";
import Map, {
  GeolocateControl,
  Layer,
  type LayerProps,
  type MapLayerMouseEvent,
  type MapMouseEvent,
  type MapRef,
  NavigationControl,
  Source,
} from "react-map-gl/maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";

import {
  TORONTO_INITIAL_ZOOM,
  TORONTO_MAP_CENTER,
  TORONTO_REGION_FEATURES,
} from "@/lib/toronto-scope";
import type { MapBounds, MapChargerSummary } from "@/types/charger";

const clusterLayer: LayerProps = {
  id: "clusters",
  type: "circle",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": "#0e7c66",
    "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 25, 28],
    "circle-stroke-width": 4,
    "circle-stroke-color": "rgba(255,255,255,0.75)",
  },
};

const clusterCountLayer: LayerProps = {
  id: "cluster-count",
  type: "symbol",
  filter: ["has", "point_count"],
  layout: {
    "text-field": ["get", "point_count_abbreviated"],
    "text-font": ["Open Sans Semibold"],
    "text-size": 12,
  },
  paint: {
    "text-color": "#ffffff",
  },
};

const unclusteredPointLayer: LayerProps = {
  id: "unclustered-point",
  type: "circle",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-radius": 10,
    "circle-stroke-width": 3,
    "circle-stroke-color": "rgba(255,255,255,0.92)",
    "circle-color": [
      "match",
      ["get", "statusNormalized"],
      "available",
      "#79b963",
      "occupied",
      "#2f8ec9",
      "unavailable",
      "#c95d46",
      "#8b95a1",
    ],
  },
};

const torontoFillLayer: LayerProps = {
  id: "toronto-region-fill",
  type: "fill",
  paint: {
    "fill-color": "#0e7c66",
    "fill-opacity": 0.08,
    "fill-outline-color": "rgba(14,124,102,0.36)",
  },
};

const torontoLineLayer: LayerProps = {
  id: "toronto-region-line",
  type: "line",
  paint: {
    "line-color": "rgba(14,124,102,0.52)",
    "line-width": 2,
  },
};

type ChargerMapProps = {
  chargers: MapChargerSummary[];
  selectedId: string | null;
  selectedGroupSize?: number;
  onSelect: (chargerId: string) => void;
  onClearSelection: () => void;
  onViewportChange: (bounds: MapBounds) => void;
  className?: string;
};

function getBoundsPayload(map: MapRef) {
  const bounds = map.getBounds();

  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  };
}

export function ChargerMap({
  chargers,
  selectedId,
  selectedGroupSize = 0,
  onSelect,
  onClearSelection,
  onViewportChange,
  className,
}: ChargerMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const previousSelectedIdRef = useRef<string | null>(null);
  const chargerById = useMemo(
    () => new globalThis.Map(chargers.map((charger) => [charger.id, charger])),
    [chargers],
  );

  function focusCharger(charger: MapChargerSummary) {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const isDesktop = map.getContainer().clientWidth >= 768;

    map.easeTo({
      center: [charger.lng, charger.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 900,
      padding: isDesktop
        ? { top: 96, right: 360, bottom: 32, left: 32 }
        : { top: 96, right: 24, bottom: 320, left: 24 },
    });
  }

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      previousSelectedIdRef.current = selectedId;
      return;
    }

    if (selectedId && previousSelectedIdRef.current !== selectedId) {
      const selectedCharger = chargerById.get(selectedId);

      if (selectedCharger) {
        focusCharger(selectedCharger);
      }
    }

    if (previousSelectedIdRef.current && !selectedId) {
      map.easeTo({
        center: map.getCenter(),
        zoom: Math.max(map.getZoom() - 2, 4.5),
        duration: 700,
        padding: { top: 80, right: 24, bottom: 32, left: 24 },
      });
    }

    previousSelectedIdRef.current = selectedId;
  }, [chargerById, selectedId]);

  const featureCollection = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: chargers.map<Feature<Point>>((charger) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [charger.lng, charger.lat],
        },
        properties: {
          id: charger.id,
          chargerIdentifier: charger.chargerIdentifier,
          statusText: charger.statusText,
          statusNormalized: charger.statusNormalized,
        },
      })),
    }),
    [chargers],
  );
  const torontoRegions = useMemo(
    () =>
      TORONTO_REGION_FEATURES as FeatureCollection<Polygon | MultiPolygon>,
    [],
  );

  async function handleMapClick(event: MapLayerMouseEvent) {
    const map = mapRef.current;
    const clusterFeature = map?.queryRenderedFeatures(event.point, {
      layers: ["clusters"],
    })[0];

    if (clusterFeature?.properties?.cluster) {
      const clusterId = clusterFeature.properties.cluster_id;
      const source = map?.getSource("chargers") as GeoJSONSource | undefined;

      if (!source) {
        return;
      }

      try {
        const zoom = await source.getClusterExpansionZoom(clusterId);

        map?.easeTo({
          center: (clusterFeature.geometry as Point).coordinates as [number, number],
          zoom,
          duration: 700,
        });
      } catch {
        return;
      }

      return;
    }

    const feature = event.features?.[0];

    if (!feature) {
      onClearSelection();
      return;
    }

    const selected = chargerById.get(feature.properties?.id as string);

    if (!selected) {
      return;
    }

    focusCharger(selected);
    onSelect(selected.id);
  }

  function handleMouseMove(event: MapMouseEvent) {
    const canvas = mapRef.current?.getCanvas();

    if (!canvas) {
      return;
    }

    canvas.style.cursor = event.features?.length ? "pointer" : "";
  }

  function handleMouseLeave() {
    const canvas = mapRef.current?.getCanvas();

    if (!canvas) {
      return;
    }

    canvas.style.cursor = "";
  }

  return (
    <div
      className={`glass-card relative h-[calc(100dvh-5.5rem)] min-h-[540px] overflow-hidden rounded-none border-x-0 border-b-0 md:min-h-[600px] ${className ?? ""}`}
    >
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: TORONTO_MAP_CENTER.longitude,
          latitude: TORONTO_MAP_CENTER.latitude,
          zoom: TORONTO_INITIAL_ZOOM,
        }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        interactiveLayerIds={["clusters", "cluster-count", "unclustered-point"]}
        onClick={handleMapClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onLoad={() => {
          if (mapRef.current) {
            onViewportChange(getBoundsPayload(mapRef.current));
          }
        }}
        onMoveEnd={() => {
          if (mapRef.current) {
            onViewportChange(getBoundsPayload(mapRef.current));
          }
        }}
      >
        <Source id="toronto-regions" type="geojson" data={torontoRegions}>
          <Layer {...torontoFillLayer} />
          <Layer {...torontoLineLayer} />
        </Source>
        <GeolocateControl
          position="bottom-right"
          showAccuracyCircle={false}
          trackUserLocation={false}
          showUserLocation
        />
        <NavigationControl position="bottom-right" visualizePitch={false} />
        <Source
          id="chargers"
          type="geojson"
          data={featureCollection}
          cluster
          clusterMaxZoom={14}
          clusterRadius={42}
        >
          <Layer {...clusterLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...unclusteredPointLayer} />
        </Source>
      </Map>

      <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex max-w-[min(32rem,calc(100%-7rem))] flex-col gap-3">
        <div className="pointer-events-auto self-start rounded-full bg-[rgba(23,33,43,0.88)] px-4 py-3 text-sm text-white">
          {selectedId
            ? `Selected: ${chargerById.get(selectedId)?.chargerIdentifier ?? "Unknown"}${selectedGroupSize > 1 ? ` (${selectedGroupSize} at this location)` : ""}`
            : "No charger selected"}
        </div>
      </div>
    </div>
  );
}
