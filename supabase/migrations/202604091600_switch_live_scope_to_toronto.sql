alter table public.chargers
  add column if not exists tracking_scope text not null default 'none';

create index if not exists chargers_tracking_scope_active_idx
  on public.chargers (tracking_scope, is_active, is_decommissioned, listing_id);

create or replace function public.get_map_charger_summaries_paged(
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
  where c.tracking_scope = 'toronto'
    and c.is_active = true
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
    select cs.lat, cs.lng
    from public.charger_stats cs
    join public.chargers c
      on c.id = cs.charger_id
    where cs.charger_id = target_charger_id
      and c.tracking_scope = 'toronto'
      and c.is_active = true
      and c.is_decommissioned = false
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
  where c.tracking_scope = 'toronto'
    and c.is_active = true
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

create or replace function public.get_map_network_metrics()
returns table (
  status_text text,
  status_normalized text,
  status_count bigint,
  total_chargers bigint,
  all_time_sessions bigint,
  estimated_all_time_revenue numeric,
  estimated_all_time_kwh numeric
)
language sql
stable
as $$
  with filtered as (
    select
      cs.status_text,
      cs.status_normalized,
      cs.total_sessions,
      cs.estimated_all_time_revenue,
      cs.estimated_all_time_kwh
    from public.charger_stats cs
    join public.chargers c
      on c.id = cs.charger_id
    where c.tracking_scope = 'toronto'
      and c.is_active = true
      and c.is_decommissioned = false
  ),
  totals as (
    select
      count(*)::bigint as total_chargers,
      coalesce(sum(total_sessions), 0)::bigint as all_time_sessions,
      coalesce(sum(estimated_all_time_revenue), 0) as estimated_all_time_revenue,
      coalesce(sum(estimated_all_time_kwh), 0) as estimated_all_time_kwh
    from filtered
  ),
  status_breakdown as (
    select
      status_text,
      status_normalized,
      count(*)::bigint as status_count
    from filtered
    group by status_text, status_normalized
  )
  select
    sb.status_text,
    sb.status_normalized,
    sb.status_count,
    t.total_chargers,
    t.all_time_sessions,
    t.estimated_all_time_revenue,
    t.estimated_all_time_kwh
  from status_breakdown sb
  cross join totals t
  order by sb.status_count desc, sb.status_text asc;
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
  where c.tracking_scope = 'toronto'
    and c.is_active = true
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
  where c.tracking_scope = 'toronto'
    and c.is_active = true
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
    where c.tracking_scope = 'toronto'
      and c.is_active = true
      and c.is_decommissioned = false
      and cs.output_bucket is not null
      and (filter_status is null or cs.status_normalized = filter_status)
      and (filter_region is null or cs.region = filter_region)
      and (filter_price is null or cs.price_bucket = filter_price)
  ) as distinct_outputs
  order by distinct_outputs.sort_key asc, distinct_outputs.output_bucket asc;
$$;
