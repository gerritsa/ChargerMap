import { differenceInSeconds } from "date-fns";

export const STATUS_POLL_INTERVAL_SECONDS = 5 * 60;
export const STATUS_STALE_THRESHOLD_SECONDS = 60 * 60;

export function isStatusStale(lastCheckedAt: string, now = new Date()) {
  return (
    differenceInSeconds(now, new Date(lastCheckedAt)) >
    STATUS_STALE_THRESHOLD_SECONDS
  );
}

export function formatStatusStaleSince(lastCheckedAt: string) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(lastCheckedAt));
}

export function getStatusStaleMessage(lastCheckedAt: string) {
  return `Status hasn't refreshed since ${formatStatusStaleSince(lastCheckedAt)}, so the data may be stale.`;
}

export function getStatusStaleLabel(lastCheckedAt: string) {
  return `Stale since ${formatStatusStaleSince(lastCheckedAt)}`;
}
