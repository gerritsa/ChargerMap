create extension if not exists pgcrypto;

create table if not exists public.chargers (
  id uuid primary key default gen_random_uuid(),
  listing_id integer not null unique,
  charger_identifier text,
  title text,
  status_text_last_scraped text,
  status_normalized_last_scraped text,
  price_text text,
  price_model_type text,
  price_parse_confidence numeric,
  currency text default 'CAD',
  charging_rate_per_hour numeric,
  idle_rate_per_hour numeric,
  tier_1_rate_per_hour numeric,
  tier_1_max_hours numeric,
  tier_2_rate_per_hour numeric,
  guest_fee numeric,
  schedule_text text,
  output_text text,
  output_kw numeric,
  image_url text,
  map_url text,
  address_text text,
  lat double precision,
  lng double precision,
  is_active boolean not null default true,
  is_decommissioned boolean not null default false,
  estimated_all_time_revenue numeric not null default 0,
  estimated_all_time_kwh numeric not null default 0,
  total_sessions integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.charger_current_status (
  charger_id uuid primary key references public.chargers(id) on delete cascade,
  status_text text not null,
  status_normalized text not null default 'unknown',
  broken_since timestamptz,
  occupied_since timestamptz,
  last_changed_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  check_error text
);

create table if not exists public.charger_status_events (
  id uuid primary key default gen_random_uuid(),
  charger_id uuid not null references public.chargers(id) on delete cascade,
  from_status_text text,
  to_status_text text not null,
  from_status_normalized text,
  to_status_normalized text not null,
  changed_at timestamptz not null default now()
);

create table if not exists public.charger_sessions (
  id uuid primary key default gen_random_uuid(),
  charger_id uuid not null references public.chargers(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  start_status_text text not null,
  end_status_text text,
  duration_minutes numeric,
  estimated_kwh numeric,
  estimated_revenue numeric,
  assumed_vehicle text default 'Tesla Model Y',
  assumed_battery_kwh numeric default 75,
  assumed_start_soc numeric default 20,
  assumed_end_soc numeric default 80,
  estimation_method text default 'output_kw_x_session_hours_capped_at_45kwh',
  created_at timestamptz not null default now()
);

create index if not exists chargers_active_idx
  on public.chargers (is_active, is_decommissioned);

create index if not exists charger_status_events_charger_changed_idx
  on public.charger_status_events (charger_id, changed_at desc);

create index if not exists charger_sessions_charger_started_idx
  on public.charger_sessions (charger_id, started_at desc);

alter table public.chargers enable row level security;
alter table public.charger_current_status enable row level security;
alter table public.charger_status_events enable row level security;
alter table public.charger_sessions enable row level security;

create policy "public can read chargers"
on public.chargers
for select
to anon, authenticated
using (true);

create policy "public can read current status"
on public.charger_current_status
for select
to anon, authenticated
using (true);

create policy "public can read charger sessions"
on public.charger_sessions
for select
to anon, authenticated
using (true);

create policy "public can read status events"
on public.charger_status_events
for select
to anon, authenticated
using (true);
