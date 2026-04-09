create extension if not exists postgis;

alter table public.charger_stats
  add column if not exists geom geometry(Point, 4326)
  generated always as (
    case
      when lat is null or lng is null then null
      else st_setsrid(st_makepoint(lng, lat), 4326)
    end
  ) stored;

create index if not exists charger_stats_geom_idx
  on public.charger_stats
  using gist (geom);

create or replace function public.get_map_charger_summaries(
  bounds_west double precision,
  bounds_south double precision,
  bounds_east double precision,
  bounds_north double precision
)
returns table (
  charger_id uuid,
  listing_id integer,
  charger_identifier text,
  status_text text,
  status_normalized text,
  lat double precision,
  lng double precision,
  total_sessions integer,
  estimated_all_time_revenue numeric,
  estimated_all_time_kwh numeric
)
language sql
stable
as $$
  select
    cs.charger_id,
    c.listing_id,
    c.charger_identifier,
    cs.status_text,
    cs.status_normalized,
    cs.lat,
    cs.lng,
    cs.total_sessions,
    cs.estimated_all_time_revenue,
    cs.estimated_all_time_kwh
  from public.charger_stats cs
  join public.chargers c
    on c.id = cs.charger_id
  where c.is_active = true
    and c.is_decommissioned = false
    and cs.geom is not null
    and cs.geom && st_makeenvelope(
      bounds_west,
      bounds_south,
      bounds_east,
      bounds_north,
      4326
    )
    and st_intersects(
      cs.geom,
      st_makeenvelope(
        bounds_west,
        bounds_south,
        bounds_east,
        bounds_north,
        4326
      )
    )
  order by c.listing_id asc;
$$;

create or replace function public.get_map_charger_group(
  target_charger_id uuid
)
returns table (
  charger_id uuid,
  listing_id integer,
  charger_identifier text,
  title text,
  image_url text,
  address_text text,
  map_url text,
  lat double precision,
  lng double precision,
  output_text text,
  price_text text,
  schedule_text text,
  status_text text,
  status_normalized text,
  last_checked_at timestamptz,
  total_sessions integer,
  estimated_all_time_revenue numeric,
  estimated_all_time_kwh numeric,
  unavailable_since timestamptz
)
language sql
stable
as $$
  with selected as (
    select lat, lng
    from public.charger_stats
    where charger_id = target_charger_id
  )
  select
    cs.charger_id,
    c.listing_id,
    c.charger_identifier,
    c.title,
    c.image_url,
    c.address_text,
    c.map_url,
    cs.lat,
    cs.lng,
    c.output_text,
    c.price_text,
    c.schedule_text,
    cs.status_text,
    cs.status_normalized,
    cs.last_checked_at,
    cs.total_sessions,
    cs.estimated_all_time_revenue,
    cs.estimated_all_time_kwh,
    cs.unavailable_since
  from public.charger_stats cs
  join public.chargers c
    on c.id = cs.charger_id
  join selected s
    on true
  where c.is_active = true
    and c.is_decommissioned = false
    and (
      cs.charger_id = target_charger_id
      or (
        s.lat is not null
        and s.lng is not null
        and cs.lat = s.lat
        and cs.lng = s.lng
      )
    )
  order by c.charger_identifier asc nulls last, c.listing_id asc;
$$;
