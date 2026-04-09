create table if not exists public.charger_stats (
  charger_id uuid primary key references public.chargers(id) on delete cascade,
  status_text text not null default 'UNKNOWN',
  status_normalized text not null default 'unknown',
  unavailable_since timestamptz,
  occupied_since timestamptz,
  last_checked_at timestamptz not null default now(),
  region text,
  price_bucket text not null default 'unknown',
  output_bucket text not null default 'unknown',
  total_sessions integer not null default 0,
  estimated_all_time_revenue numeric not null default 0,
  estimated_all_time_kwh numeric not null default 0,
  observed_occupied_seconds bigint not null default 0,
  tracked_seconds bigint not null default 0,
  observed_occupancy_rate numeric not null default 0,
  current_session_started_at timestamptz,
  lat double precision,
  lng double precision,
  updated_at timestamptz not null default now()
);

insert into public.charger_stats (
  charger_id,
  status_text,
  status_normalized,
  unavailable_since,
  occupied_since,
  last_checked_at,
  region,
  price_bucket,
  output_bucket,
  total_sessions,
  estimated_all_time_revenue,
  estimated_all_time_kwh,
  observed_occupied_seconds,
  tracked_seconds,
  observed_occupancy_rate,
  current_session_started_at,
  lat,
  lng,
  updated_at
)
select
  c.id as charger_id,
  coalesce(s.status_text, 'UNKNOWN') as status_text,
  coalesce(s.status_normalized, 'unknown') as status_normalized,
  s.unavailable_since,
  s.occupied_since,
  coalesce(s.last_checked_at, now()) as last_checked_at,
  c.region,
  case
    when c.price_model_type = 'free' then 'free'
    when c.price_model_type in ('hourly_simple', 'hourly_plus_guest_fee') then 'hourly'
    when c.price_model_type in ('energy_simple', 'energy_plus_guest_fee') then 'energy'
    when c.price_model_type in ('charging_plus_idle', 'tiered_time') then 'complex'
    else 'unknown'
  end as price_bucket,
  case
    when c.output_kw is null then 'unknown'
    else round(c.output_kw)::text
  end as output_bucket,
  c.total_sessions,
  c.estimated_all_time_revenue,
  c.estimated_all_time_kwh,
  coalesce(closed.observed_occupied_seconds, 0) as observed_occupied_seconds,
  greatest(0, extract(epoch from now() - c.first_seen_at))::bigint as tracked_seconds,
  case
    when greatest(0, extract(epoch from now() - c.first_seen_at)) <= 0 then 0
    else (
      (
        coalesce(closed.observed_occupied_seconds, 0) +
        case
          when s.status_normalized = 'occupied' and s.occupied_since is not null
            then greatest(0, extract(epoch from now() - s.occupied_since))::bigint
          else 0
        end
      )::numeric /
      greatest(1, extract(epoch from now() - c.first_seen_at))::numeric
    )
  end as observed_occupancy_rate,
  case
    when s.status_normalized = 'occupied' then s.occupied_since
    else null
  end as current_session_started_at,
  c.lat,
  c.lng,
  now() as updated_at
from public.chargers c
left join public.charger_current_status s
  on s.charger_id = c.id
left join (
  select
    charger_id,
    coalesce(sum(greatest(0, extract(epoch from (ended_at - started_at)))::bigint), 0) as observed_occupied_seconds
  from public.charger_sessions
  where ended_at is not null
  group by charger_id
) as closed
  on closed.charger_id = c.id
on conflict (charger_id) do update
set
  status_text = excluded.status_text,
  status_normalized = excluded.status_normalized,
  unavailable_since = excluded.unavailable_since,
  occupied_since = excluded.occupied_since,
  last_checked_at = excluded.last_checked_at,
  region = excluded.region,
  price_bucket = excluded.price_bucket,
  output_bucket = excluded.output_bucket,
  total_sessions = excluded.total_sessions,
  estimated_all_time_revenue = excluded.estimated_all_time_revenue,
  estimated_all_time_kwh = excluded.estimated_all_time_kwh,
  observed_occupied_seconds = excluded.observed_occupied_seconds,
  tracked_seconds = excluded.tracked_seconds,
  observed_occupancy_rate = excluded.observed_occupancy_rate,
  current_session_started_at = excluded.current_session_started_at,
  lat = excluded.lat,
  lng = excluded.lng,
  updated_at = excluded.updated_at;

create index if not exists chargers_active_listing_idx
  on public.chargers (listing_id)
  where is_active = true and is_decommissioned = false;

create index if not exists charger_current_status_status_idx
  on public.charger_current_status (status_normalized, unavailable_since desc, charger_id);

create index if not exists charger_current_status_checked_idx
  on public.charger_current_status (last_checked_at desc);

create index if not exists charger_sessions_open_idx
  on public.charger_sessions (charger_id, started_at desc)
  where ended_at is null;

create index if not exists charger_stats_status_unavailable_idx
  on public.charger_stats (status_normalized, unavailable_since asc);

create index if not exists charger_stats_region_status_idx
  on public.charger_stats (region, status_normalized);

create index if not exists charger_stats_price_output_idx
  on public.charger_stats (price_bucket, output_bucket);

create index if not exists charger_stats_occupancy_idx
  on public.charger_stats (observed_occupancy_rate desc, total_sessions desc);

create index if not exists charger_stats_revenue_idx
  on public.charger_stats (estimated_all_time_revenue desc, total_sessions desc);

create index if not exists charger_stats_lat_lng_idx
  on public.charger_stats (lat, lng);

alter table public.charger_stats enable row level security;

create policy "public can read charger stats"
on public.charger_stats
for select
to anon, authenticated
using (true);
