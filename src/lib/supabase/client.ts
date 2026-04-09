import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

export function createBrowserSupabaseClient() {
  if (!env.supabaseUrl || !env.supabasePublishableKey) {
    return null;
  }

  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
