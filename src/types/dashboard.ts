import type { ChargerStatusNormalized } from "@/types/charger";

export type DashboardStatusFilter = "all" | ChargerStatusNormalized;

export type DashboardPriceBucket =
  | "all"
  | "free"
  | "hourly"
  | "energy"
  | "complex"
  | "unknown";

export type DashboardFilters = {
  status: DashboardStatusFilter;
  region: string;
  price: DashboardPriceBucket;
  output: string;
};

export type DashboardFilterOption = {
  value: string;
  label: string;
};

export type DashboardFilterOptions = {
  status: DashboardFilterOption[];
  region: DashboardFilterOption[];
  price: DashboardFilterOption[];
  output: DashboardFilterOption[];
};

export type DashboardKpis = {
  totalChargers: number;
  currentlyOccupied: number;
  currentlyUnavailable: number;
  observedOccupancyRate: number;
  allTimeSessions: number;
  estimatedAllTimeRevenue: number;
  estimatedAllTimeEnergySold: number;
};

export type DashboardTableCharger = {
  id: string;
  listingId: number;
  chargerIdentifier: string;
  title: string;
  imageUrl: string | null;
  address: string | null;
  mapUrl: string | null;
  lat: number | null;
  lng: number | null;
  region: string | null;
  outputText: string;
  priceText: string;
  scheduleText: string;
  statusText: string;
  statusNormalized: ChargerStatusNormalized;
  lastCheckedAt: string;
};

export type DashboardOccupancyRow = DashboardTableCharger & {
  observedOccupancyRate: number;
  observedOccupiedSeconds: number;
  trackedSeconds: number;
  totalSessions: number;
  estimatedAllTimeRevenue: number;
  currentSessionStartedAt: string | null;
};

export type DashboardUnavailableRow = DashboardTableCharger & {
  unavailableSince: string;
  unavailableDurationSeconds: number;
  observedOccupancyRate: number;
  totalSessions: number;
};

export type DashboardProfitabilityRow = DashboardTableCharger & {
  estimatedAllTimeRevenue: number;
  estimatedAllTimeEnergySold: number;
  totalSessions: number;
  observedOccupancyRate: number;
};

export type DashboardData = {
  filters: DashboardFilters;
  options: DashboardFilterOptions;
  kpis: DashboardKpis;
  occupancyRows: DashboardOccupancyRow[];
  unavailableRows: DashboardUnavailableRow[];
  profitableRows: DashboardProfitabilityRow[];
  generatedAt: string;
  hasLiveData: boolean;
};

export type DashboardChargerSession = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  estimatedKwh: number;
  estimatedRevenue: number;
  isOpen: boolean;
};

export type DashboardChargerDetail = {
  charger: DashboardTableCharger & {
    firstSeenAt: string;
    lastCheckedAt: string;
    priceBucket: Exclude<DashboardPriceBucket, "all">;
    outputBucket: string;
    totalSessions: number;
    estimatedAllTimeRevenue: number;
    estimatedAllTimeEnergySold: number;
    observedOccupancyRate: number;
    observedOccupiedSeconds: number;
    trackedSeconds: number;
    unavailableSince: string | null;
    currentSessionStartedAt: string | null;
  };
  recentSessions: DashboardChargerSession[];
  hasLiveData: boolean;
};
