create or replace function public.get_public_map_viewport_payload(
  bounds_west double precision,
  bounds_south double precision,
  bounds_east double precision,
  bounds_north double precision
)
returns table (
  summaries jsonb,
  total_chargers bigint,
  currently_occupied bigint,
  available_now bigint,
  unavailable_now bigint,
  not_live_now bigint,
  all_time_sessions bigint,
  estimated_all_time_revenue numeric,
  estimated_all_time_kwh numeric,
  last_24_hours_estimated_kwh numeric,
  raw_status_breakdown jsonb
)
language sql
stable
set search_path = public
as $$
  with filtered as (
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
  ),
  status_breakdown as (
    select
      coalesce(f.status_text, 'UNKNOWN') as status_text,
      coalesce(f.status_normalized, 'unknown') as status_normalized,
      count(*)::bigint as status_count
    from filtered f
    group by
      coalesce(f.status_text, 'UNKNOWN'),
      coalesce(f.status_normalized, 'unknown')
  ),
  recent_kwh as (
    select coalesce(sum(cs.estimated_kwh), 0) as total_estimated_kwh
    from public.charger_sessions cs
    join filtered f
      on f.charger_id = cs.charger_id
    where cs.started_at >= (now() - interval '24 hours')
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'charger_id', f.charger_id,
          'listing_id', f.listing_id,
          'charger_identifier', f.charger_identifier,
          'status_text', f.status_text,
          'status_normalized', f.status_normalized,
          'lat', f.lat,
          'lng', f.lng
        )
        order by f.listing_id asc
      ),
      '[]'::jsonb
    ) as summaries,
    count(*)::bigint as total_chargers,
    count(*) filter (where f.status_normalized = 'occupied')::bigint as currently_occupied,
    count(*) filter (where f.status_normalized = 'available')::bigint as available_now,
    count(*) filter (where f.status_normalized = 'unavailable')::bigint as unavailable_now,
    count(*) filter (where f.status_normalized = 'not_live')::bigint as not_live_now,
    coalesce(sum(f.total_sessions), 0)::bigint as all_time_sessions,
    coalesce(sum(f.estimated_all_time_revenue), 0) as estimated_all_time_revenue,
    coalesce(sum(f.estimated_all_time_kwh), 0) as estimated_all_time_kwh,
    (select rk.total_estimated_kwh from recent_kwh rk) as last_24_hours_estimated_kwh,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'status_text', sb.status_text,
            'status_normalized', sb.status_normalized,
            'count', sb.status_count
          )
          order by sb.status_count desc, sb.status_text asc
        )
        from status_breakdown sb
      ),
      '[]'::jsonb
    ) as raw_status_breakdown
  from filtered f;
$$;

create or replace function public.get_public_dashboard_unavailable_rows(
  filter_raw_status text default null,
  filter_price text default null,
  filter_output text default null,
  target_limit integer default 10,
  target_offset integer default 0
)
returns table (
  charger_id uuid,
  listing_id integer,
  charger_identifier text,
  title text,
  output_text text,
  price_text text,
  status_text text,
  status_normalized text,
  unavailable_since timestamptz,
  observed_occupancy_rate numeric,
  total_sessions integer
)
language sql
stable
set search_path = public
as $$
  select
    cs.charger_id,
    c.listing_id,
    c.charger_identifier,
    c.title,
    c.output_text,
    c.price_text,
    cs.status_text,
    cs.status_normalized,
    cs.unavailable_since,
    cs.observed_occupancy_rate,
    cs.total_sessions
  from public.charger_stats cs
  join public.chargers c
    on c.id = cs.charger_id
  where c.tracking_scope = 'toronto'
    and c.is_active = true
    and c.is_decommissioned = false
    and cs.status_normalized = 'unavailable'
    and (filter_raw_status is null or cs.status_text = filter_raw_status)
    and (filter_price is null or cs.price_bucket = filter_price)
    and (filter_output is null or cs.output_bucket = filter_output)
  order by cs.unavailable_since asc nulls last, cs.total_sessions desc, c.listing_id asc
  limit greatest(target_limit, 1)
  offset greatest(target_offset, 0);
$$;

create or replace function public.get_public_dashboard_occupancy_rows(
  filter_raw_status text default null,
  filter_price text default null,
  filter_output text default null,
  exclude_not_live boolean default true,
  target_limit integer default 10,
  target_offset integer default 0
)
returns table (
  charger_id uuid,
  listing_id integer,
  charger_identifier text,
  title text,
  output_text text,
  price_text text,
  status_text text,
  status_normalized text,
  last_checked_at timestamptz,
  observed_occupancy_rate numeric,
  tracked_seconds bigint,
  total_sessions integer,
  estimated_all_time_revenue numeric,
  current_session_started_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select
    cs.charger_id,
    c.listing_id,
    c.charger_identifier,
    c.title,
    c.output_text,
    c.price_text,
    cs.status_text,
    cs.status_normalized,
    cs.last_checked_at,
    cs.observed_occupancy_rate,
    cs.tracked_seconds,
    cs.total_sessions,
    cs.estimated_all_time_revenue,
    cs.current_session_started_at
  from public.charger_stats cs
  join public.chargers c
    on c.id = cs.charger_id
  where c.tracking_scope = 'toronto'
    and c.is_active = true
    and c.is_decommissioned = false
    and (not exclude_not_live or cs.status_normalized <> 'not_live')
    and (filter_raw_status is null or cs.status_text = filter_raw_status)
    and (filter_price is null or cs.price_bucket = filter_price)
    and (filter_output is null or cs.output_bucket = filter_output)
  order by cs.observed_occupancy_rate desc nulls last, cs.total_sessions desc, c.listing_id asc
  limit greatest(target_limit, 1)
  offset greatest(target_offset, 0);
$$;

create or replace function public.get_public_dashboard_profitability_rows(
  filter_price text default null,
  filter_output text default null,
  exclude_not_live boolean default true,
  target_limit integer default 10,
  target_offset integer default 0
)
returns table (
  charger_id uuid,
  listing_id integer,
  charger_identifier text,
  title text,
  output_text text,
  price_text text,
  status_text text,
  status_normalized text,
  estimated_all_time_revenue numeric,
  estimated_all_time_kwh numeric,
  total_sessions integer,
  observed_occupancy_rate numeric
)
language sql
stable
set search_path = public
as $$
  select
    cs.charger_id,
    c.listing_id,
    c.charger_identifier,
    c.title,
    c.output_text,
    c.price_text,
    cs.status_text,
    cs.status_normalized,
    cs.estimated_all_time_revenue,
    cs.estimated_all_time_kwh,
    cs.total_sessions,
    cs.observed_occupancy_rate
  from public.charger_stats cs
  join public.chargers c
    on c.id = cs.charger_id
  where c.tracking_scope = 'toronto'
    and c.is_active = true
    and c.is_decommissioned = false
    and (not exclude_not_live or cs.status_normalized <> 'not_live')
    and (filter_price is null or cs.price_bucket = filter_price)
    and (filter_output is null or cs.output_bucket = filter_output)
  order by
    cs.estimated_all_time_revenue desc nulls last,
    cs.total_sessions desc,
    c.listing_id asc
  limit greatest(target_limit, 1)
  offset greatest(target_offset, 0);
$$;

create or replace function public.get_public_dashboard_list_meta(
  target_kind text,
  exclude_not_live boolean default false,
  filter_raw_status text default null,
  filter_price text default null,
  filter_output text default null
)
returns table (
  total_count bigint,
  output_options jsonb,
  raw_status_options jsonb
)
language sql
stable
set search_path = public
as $$
  with settings as (
    select
      case when target_kind = 'unavailable' then 'unavailable' else null end as target_status_filter,
      case when target_kind in ('occupancy', 'unavailable') then true else false end as include_raw_statuses
  ),
  base as (
    select
      cs.status_text,
      cs.status_normalized,
      cs.output_bucket,
      cs.price_bucket
    from public.charger_stats cs
    join public.chargers c
      on c.id = cs.charger_id
    cross join settings s
    where c.tracking_scope = 'toronto'
      and c.is_active = true
      and c.is_decommissioned = false
      and (s.target_status_filter is null or cs.status_normalized = s.target_status_filter)
      and (not exclude_not_live or cs.status_normalized <> 'not_live')
  ),
  count_rows as (
    select count(*)::bigint as total_count
    from base b
    where (filter_raw_status is null or b.status_text = filter_raw_status)
      and (filter_price is null or b.price_bucket = filter_price)
      and (filter_output is null or b.output_bucket = filter_output)
  ),
  output_rows as (
    select distinct
      b.output_bucket,
      case
        when b.output_bucket = 'unknown' then 2147483647
        else b.output_bucket::integer
      end as sort_key
    from base b
    where b.output_bucket is not null
      and (filter_raw_status is null or b.status_text = filter_raw_status)
      and (filter_price is null or b.price_bucket = filter_price)
  ),
  raw_status_rows as (
    select
      coalesce(b.status_text, 'UNKNOWN') as status_text,
      count(*)::bigint as status_count
    from base b
    where (filter_price is null or b.price_bucket = filter_price)
      and (filter_output is null or b.output_bucket = filter_output)
    group by coalesce(b.status_text, 'UNKNOWN')
  )
  select
    cr.total_count,
    coalesce(
      (
        select jsonb_agg(orows.output_bucket order by orows.sort_key asc, orows.output_bucket asc)
        from output_rows orows
      ),
      '[]'::jsonb
    ) as output_options,
    case
      when (select s.include_raw_statuses from settings s)
        then coalesce(
          (
            select jsonb_agg(rrows.status_text order by rrows.status_count desc, rrows.status_text asc)
            from raw_status_rows rrows
          ),
          '[]'::jsonb
        )
      else '[]'::jsonb
    end as raw_status_options
  from count_rows cr;
$$;

revoke execute on function public.get_public_map_viewport_payload(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.get_public_dashboard_unavailable_rows(text, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.get_public_dashboard_occupancy_rows(text, text, text, boolean, integer, integer) from public, anon, authenticated;
revoke execute on function public.get_public_dashboard_profitability_rows(text, text, boolean, integer, integer) from public, anon, authenticated;
revoke execute on function public.get_public_dashboard_list_meta(text, boolean, text, text, text) from public, anon, authenticated;

grant execute on function public.get_public_map_viewport_payload(double precision, double precision, double precision, double precision) to service_role;
grant execute on function public.get_public_dashboard_unavailable_rows(text, text, text, integer, integer) to service_role;
grant execute on function public.get_public_dashboard_occupancy_rows(text, text, text, boolean, integer, integer) to service_role;
grant execute on function public.get_public_dashboard_profitability_rows(text, text, boolean, integer, integer) to service_role;
grant execute on function public.get_public_dashboard_list_meta(text, boolean, text, text, text) to service_role;
