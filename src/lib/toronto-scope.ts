import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";

import torontoRegion from "@/data/toronto-region.json";
import type { MapBounds } from "@/types/charger";

type TorontoRegionFeature = Feature<Polygon | MultiPolygon, { name: string }>;

export const TORONTO_REGION_FEATURES = {
  type: "FeatureCollection",
  features: (
    torontoRegion as FeatureCollection<Polygon | MultiPolygon, { name: string }>
  ).features,
} as FeatureCollection<Polygon | MultiPolygon, { name: string }>;

function isRingClosed(ring: Position[]) {
  if (!ring.length) {
    return false;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];

  return first[0] === last[0] && first[1] === last[1];
}

function toSegments(ring: Position[]) {
  if (ring.length < 3) {
    return [];
  }

  return isRingClosed(ring) ? ring : [...ring, ring[0]];
}

function isPointInRing(lng: number, lat: number, ring: Position[]) {
  let inside = false;
  const closedRing = toSegments(ring);

  for (
    let index = 0, previous = closedRing.length - 1;
    index < closedRing.length;
    previous = index++
  ) {
    const [xi, yi] = closedRing[index];
    const [xj, yj] = closedRing[previous];

    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointInPolygonGeometry(
  lng: number,
  lat: number,
  geometry: Polygon | MultiPolygon,
) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  return polygons.some((polygon) => {
    const [outerRing, ...holes] = polygon;

    if (!outerRing || !isPointInRing(lng, lat, outerRing)) {
      return false;
    }

    return !holes.some((hole) => isPointInRing(lng, lat, hole));
  });
}

function getFeatureBounds(feature: TorontoRegionFeature) {
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;

  const bounds = {
    west: Number.POSITIVE_INFINITY,
    south: Number.POSITIVE_INFINITY,
    east: Number.NEGATIVE_INFINITY,
    north: Number.NEGATIVE_INFINITY,
  };

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        bounds.west = Math.min(bounds.west, lng);
        bounds.south = Math.min(bounds.south, lat);
        bounds.east = Math.max(bounds.east, lng);
        bounds.north = Math.max(bounds.north, lat);
      }
    }
  }

  return bounds;
}

export function isPointInToronto(lat: number, lng: number) {
  return TORONTO_REGION_FEATURES.features.some((feature) =>
    isPointInPolygonGeometry(lng, lat, feature.geometry),
  );
}

export const TORONTO_MAP_BOUNDS: MapBounds = TORONTO_REGION_FEATURES.features.reduce<MapBounds>(
  (bounds, feature) => {
    const featureBounds = getFeatureBounds(feature as TorontoRegionFeature);

    return {
      west: Math.min(bounds.west, featureBounds.west),
      south: Math.min(bounds.south, featureBounds.south),
      east: Math.max(bounds.east, featureBounds.east),
      north: Math.max(bounds.north, featureBounds.north),
    };
  },
  {
    west: Number.POSITIVE_INFINITY,
    south: Number.POSITIVE_INFINITY,
    east: Number.NEGATIVE_INFINITY,
    north: Number.NEGATIVE_INFINITY,
  },
);

export const TORONTO_MAP_CENTER = {
  longitude: (TORONTO_MAP_BOUNDS.west + TORONTO_MAP_BOUNDS.east) / 2,
  latitude: (TORONTO_MAP_BOUNDS.south + TORONTO_MAP_BOUNDS.north) / 2,
};

export const TORONTO_INITIAL_ZOOM = 10;
