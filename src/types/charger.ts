export type ChargerStatusNormalized =
  | "available"
  | "occupied"
  | "unavailable"
  | "unknown";

export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type MapChargerSummary = {
  id: string;
  chargerIdentifier: string;
  lat: number;
  lng: number;
  statusText: string;
  statusNormalized: ChargerStatusNormalized;
};

export type Charger = {
  id: string;
  listingId: number;
  chargerIdentifier: string;
  title: string;
  imageUrl: string | null;
  address: string;
  mapUrl: string | null;
  lat: number;
  lng: number;
  outputText: string;
  priceText: string;
  scheduleText: string;
  statusText: string;
  statusNormalized: ChargerStatusNormalized;
  lastCheckedAt: string;
  totalSessions: number;
  estimatedAllTimeRevenue: number;
  estimatedAllTimeKwh: number;
  unavailableSince: string | null;
  source: "mock" | "supabase";
};

export type MapChargerDetail = Charger;

export type ChargerMapMetrics = {
  totalChargers: number;
  currentlyOccupied: number;
  availableNow: number;
  unavailableNow: number;
  allTimeSessions: number;
  allTimeEstimatedRevenue: number;
  allTimeEstimatedKwh: number;
  rawStatusBreakdown: Array<{
    statusText: string;
    statusNormalized: ChargerStatusNormalized;
    count: number;
  }>;
};
