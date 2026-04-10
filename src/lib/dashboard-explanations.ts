export const DASHBOARD_EXPLANATIONS = {
  reliability:
    "Reliability ranks chargers that are currently normalized as unavailable. The list is sorted by the active downtime interval, using the latest unavailable_since timestamp, so the longest ongoing outage appears first.",
  occupancy:
    "Occupancy ranks chargers by observed tracked occupancy since first seen. Observed occupancy is calculated as observed occupied time divided by tracked time, and any currently open live session is included up to the last successful check. Chargers normalized as not live are excluded by default.",
  revenue:
    "Revenue ranks chargers by estimated all-time revenue from tracked closed sessions. Estimates come from the parsed pricing model on each charger, including time, energy, flat, guest, and idle fees when present. Open sessions do not inflate this ranking, and chargers normalized as not live are excluded by default.",
} as const;
