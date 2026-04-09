import type { ChargerStatusNormalized } from "@/types/charger";

const occupiedPatterns = [
  "charging",
  "charger in use",
  "in use",
  "occupied",
  "activating",
  "preparing",
  "finishing",
  "suspendedev",
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
const availablePatterns = ["available", "ready", "open"];

export function normalizeStatus(statusText: string): ChargerStatusNormalized {
  const value = statusText.trim().toLowerCase();

  if (occupiedPatterns.some((pattern) => value.includes(pattern))) {
    return "occupied";
  }

  if (unavailablePatterns.some((pattern) => value.includes(pattern))) {
    return "unavailable";
  }

  if (availablePatterns.some((pattern) => value.includes(pattern))) {
    return "available";
  }

  return "unknown";
}
