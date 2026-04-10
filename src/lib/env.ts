const optional = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

export const env = optional;

export function hasPublicSupabaseEnv() {
  return Boolean(optional.supabaseUrl && optional.supabasePublishableKey);
}

export function hasServerSupabaseEnv() {
  return Boolean(
    optional.supabaseUrl &&
      (optional.supabaseServiceRoleKey || optional.supabasePublishableKey),
  );
}
