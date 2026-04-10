import type { ChargerStatusNormalized } from "@/types/charger";

const occupiedPatterns = [
  "charging",
  "charger in use",
  "in use",
  "occupied",
  "preparing",
  "finishing",
  "suspendedev",
  "suspendedevse",
];
const notLivePatterns = [
  "awaiting commissioning",
  "commissioned",
  "activating",
  "pending driver subscription",
  "pending property",
  "decommissioned",
];
const unavailablePatterns = [
  "unavailable",
  "out of service",
  "fault",
  "broken",
  "error",
  "offline",
  "under repair",
];
const availablePatterns = ["available", "active", "ready", "open"];

export function normalizeStatus(statusText: string): ChargerStatusNormalized {
  const value = statusText.trim().toLowerCase();

  if (occupiedPatterns.some((pattern) => value.includes(pattern))) {
    return "occupied";
  }

  if (notLivePatterns.some((pattern) => value.includes(pattern))) {
    return "not_live";
  }

  if (unavailablePatterns.some((pattern) => value.includes(pattern))) {
    return "unavailable";
  }

  if (availablePatterns.some((pattern) => value.includes(pattern))) {
    return "available";
  }

  return "unknown";
}
