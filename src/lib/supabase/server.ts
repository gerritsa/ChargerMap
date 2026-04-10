import { createClient } from "@supabase/supabase-js";

import { env, hasServerSupabaseEnv } from "@/lib/env";

export function createServerSupabaseClient() {
  if (!hasServerSupabaseEnv() || !env.supabaseUrl) {
    return null;
  }

  const accessKey =
    env.supabaseServiceRoleKey ?? env.supabasePublishableKey;

  if (!accessKey) {
    return null;
  }

  return createClient(env.supabaseUrl, accessKey, {
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
