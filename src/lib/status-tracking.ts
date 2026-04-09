import type { SupabaseClient } from "@supabase/supabase-js";

export const GLOBAL_STATUS_TRACKING_STARTED_AT_KEY =
  "global_status_tracking_started_at";

type AppSettingRow = {
  value_text: string | null;
};

function toValidTime(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function resolveStatusTrackingStartedAt(
  firstSeenAt: string,
  globalStatusTrackingStartedAt: string | null,
) {
  const firstSeenTime = toValidTime(firstSeenAt);
  const globalStartTime = toValidTime(globalStatusTrackingStartedAt);

  if (firstSeenTime == null) {
    return globalStatusTrackingStartedAt ?? firstSeenAt;
  }

  if (globalStartTime == null || firstSeenTime >= globalStartTime) {
    return firstSeenAt;
  }

  return globalStatusTrackingStartedAt!;
}

export async function getGlobalStatusTrackingStartedAt(
  supabase: SupabaseClient,
) {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value_text")
    .eq("setting_key", GLOBAL_STATUS_TRACKING_STARTED_AT_KEY)
    .maybeSingle<AppSettingRow>();

  if (error) {
    throw new Error(
      `Failed to load global status tracking setting: ${error.message}`,
    );
  }

  return data?.value_text ?? null;
}
