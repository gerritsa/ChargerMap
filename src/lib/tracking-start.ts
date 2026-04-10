import { createServerSupabaseClient } from "@/lib/supabase/server";

type TrackingStartRow = {
  value_text: string | null;
};

export async function getTrackingStartedAtForHeader() {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc("get_public_tracking_started_at");

  if (error) {
    console.error("Failed to load tracking start for header", error.message);
    return null;
  }

  const row = ((data ?? []) as TrackingStartRow[])[0];
  return row?.value_text ?? null;
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
