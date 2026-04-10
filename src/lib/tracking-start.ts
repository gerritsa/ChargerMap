import { GLOBAL_STATUS_TRACKING_STARTED_AT_KEY } from "@/lib/status-tracking";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type AppSettingRow = {
  value_text: string | null;
};

export async function getTrackingStartedAtForHeader() {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("app_settings")
    .select("value_text")
    .eq("setting_key", GLOBAL_STATUS_TRACKING_STARTED_AT_KEY)
    .maybeSingle<AppSettingRow>();

  if (error) {
    console.error("Failed to load tracking start for header", error.message);
    return null;
  }

  return data?.value_text ?? null;
}

export function formatTrackingStartedAtLabel(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(date);
}

export async function getTrackingStartedAtLabel() {
  const value = await getTrackingStartedAtForHeader();
  return formatTrackingStartedAtLabel(value);
}
