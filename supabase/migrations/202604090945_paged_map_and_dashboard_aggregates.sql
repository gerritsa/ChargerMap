create or replace function public.get_map_charger_summaries(
  bounds_west double precision,
  bounds_south double precision,
  bounds_east double precision,
  bounds_north double precision,
  page_limit integer default 1000,
  page_offset integer default 0
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
  order by c.listing_id asc
  limit greatest(page_limit, 1)
  offset greatest(page_offset, 0);
$$;

create or replace function public.get_dashboard_snapshot(
  filter_status text default null,
  filter_region text default null,
  filter_price text default null,
  filter_output text default null
)
returns table (
  total_chargers bigint,
  currently_occupied bigint,
  currently_unavailable bigint,
  all_time_sessions bigint,
  estimated_all_time_revenue numeric,
  estimated_all_time_kwh numeric,
  observed_occupied_seconds bigint,
  tracked_seconds bigint
)
language sql
stable
as $$
  select
    count(*) as total_chargers,
    count(*) filter (where cs.status_normalized = 'occupied') as currently_occupied,
    count(*) filter (where cs.status_normalized = 'unavailable') as currently_unavailable,
    coalesce(sum(cs.total_sessions), 0)::bigint as all_time_sessions,
    coalesce(sum(cs.estimated_all_time_revenue), 0) as estimated_all_time_revenue,
    coalesce(sum(cs.estimated_all_time_kwh), 0) as estimated_all_time_kwh,
    coalesce(sum(
      cs.observed_occupied_seconds +
      case
        when cs.current_session_started_at is not null
          then greatest(0, extract(epoch from now() - cs.current_session_started_at))::bigint
        else 0
      end
    ), 0)::bigint as observed_occupied_seconds,
    coalesce(sum(cs.tracked_seconds), 0)::bigint as tracked_seconds
  from public.charger_stats cs
  join public.chargers c
    on c.id = cs.charger_id
  where c.is_active = true
    and c.is_decommissioned = false
    and (filter_status is null or cs.status_normalized = filter_status)
    and (filter_region is null or cs.region = filter_region)
    and (filter_price is null or cs.price_bucket = filter_price)
    and (filter_output is null or cs.output_bucket = filter_output);
$$;

create or replace function public.get_dashboard_regions(
  filter_status text default null,
  filter_price text default null,
  filter_output text default null
)
returns table (
  region text
)
language sql
stable
as $$
  select distinct cs.region
  from public.charger_stats cs
  join public.chargers c
    on c.id = cs.charger_id
  where c.is_active = true
    and c.is_decommissioned = false
    and cs.region is not null
    and (filter_status is null or cs.status_normalized = filter_status)
    and (filter_price is null or cs.price_bucket = filter_price)
    and (filter_output is null or cs.output_bucket = filter_output)
  order by cs.region asc;
$$;

create or replace function public.get_dashboard_outputs(
  filter_status text default null,
  filter_region text default null,
  filter_price text default null
)
returns table (
  output_bucket text
)
language sql
stable
as $$
  select distinct_outputs.output_bucket
  from (
    select distinct
      cs.output_bucket,
      case
        when cs.output_bucket = 'unknown' then 2147483647
        else cs.output_bucket::integer
      end as sort_key
    from public.charger_stats cs
    join public.chargers c
      on c.id = cs.charger_id
    where c.is_active = true
      and c.is_decommissioned = false
      and cs.output_bucket is not null
      and (filter_status is null or cs.status_normalized = filter_status)
      and (filter_region is null or cs.region = filter_region)
      and (filter_price is null or cs.price_bucket = filter_price)
  ) as distinct_outputs
  order by distinct_outputs.sort_key asc, distinct_outputs.output_bucket asc;
$$;
