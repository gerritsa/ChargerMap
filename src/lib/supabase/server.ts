import { createClient } from "@supabase/supabase-js";

import { env, hasPublicSupabaseEnv } from "@/lib/env";

export function createServerSupabaseClient() {
  if (!hasPublicSupabaseEnv()) {
    return null;
  }

  return createClient(env.supabaseUrl!, env.supabasePublishableKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        "X-Client-Info": "charger-map-web",
      },
    },
  });
}

export function createServiceRoleSupabaseClient() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    return null;
  }

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
