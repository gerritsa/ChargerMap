create or replace function public.get_public_tracking_started_at()
returns table (
  value_text text
)
language sql
stable
set search_path = public
as $$
  select s.value_text
  from public.app_settings s
  where s.setting_key = 'global_status_tracking_started_at'
  limit 1;
$$;

create or replace function public.get_public_estimated_kwh_for_chargers(
  target_charger_ids uuid[],
  target_since timestamptz default (now() - interval '24 hours')
)
returns table (
  total_estimated_kwh numeric
)
language sql
stable
set search_path = public
as $$
  select coalesce(sum(cs.estimated_kwh), 0) as total_estimated_kwh
  from public.charger_sessions cs
  where coalesce(array_length(target_charger_ids, 1), 0) > 0
    and cs.charger_id = any(target_charger_ids)
    and cs.started_at >= target_since;
$$;

create or replace function public.get_public_estimated_kwh_for_scope(
  target_scope text,
  target_since timestamptz default (now() - interval '24 hours')
)
returns table (
  total_estimated_kwh numeric
)
language sql
stable
set search_path = public
as $$
  select coalesce(sum(cs.estimated_kwh), 0) as total_estimated_kwh
  from public.charger_sessions cs
  join public.chargers c
    on c.id = cs.charger_id
  where c.tracking_scope = target_scope
    and c.is_active = true
    and c.is_decommissioned = false
    and cs.started_at >= target_since;
$$;

create or replace function public.get_public_dashboard_rows(
  filter_status text default null,
  filter_raw_status text default null,
  filter_region text default null,
  filter_price text default null,
  filter_output text default null,
  target_status_filter text default null,
  exclude_not_live boolean default false,
  target_order_by text default 'charger_identifier',
  target_ascending boolean default false,
  target_limit integer default 10,
  target_offset integer default 0
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
  region text,
  output_kw numeric,
  output_bucket text,
  output_text text,
  price_text text,
  schedule_text text,
  price_model_type text,
  price_bucket text,
  estimated_all_time_revenue numeric,
  estimated_all_time_kwh numeric,
  total_sessions integer,
  first_seen_at timestamptz,
  status_text text,
  status_normalized text,
  unavailable_since timestamptz,
  last_checked_at timestamptz,
  tracked_seconds bigint,
  observed_occupied_seconds bigint,
  observed_occupancy_rate numeric,
  current_session_started_at timestamptz
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
      c.title,
      c.image_url,
      c.address_text,
      c.map_url,
      c.lat,
      c.lng,
      cs.region,
      c.output_kw,
      cs.output_bucket,
      c.output_text,
      c.price_text,
      c.schedule_text,
      c.price_model_type,
      cs.price_bucket,
      cs.estimated_all_time_revenue,
      cs.estimated_all_time_kwh,
      cs.total_sessions,
      c.first_seen_at,
      cs.status_text,
      cs.status_normalized,
      cs.unavailable_since,
      cs.last_checked_at,
      cs.tracked_seconds,
      cs.observed_occupied_seconds,
      cs.observed_occupancy_rate,
      cs.current_session_started_at
    from public.charger_stats cs
    join public.chargers c
      on c.id = cs.charger_id
    where c.tracking_scope = 'toronto'
      and c.is_active = true
      and c.is_decommissioned = false
      and (filter_status is null or cs.status_normalized = filter_status)
      and (filter_raw_status is null or cs.status_text = filter_raw_status)
      and (filter_region is null or cs.region = filter_region)
      and (filter_price is null or cs.price_bucket = filter_price)
      and (filter_output is null or cs.output_bucket = filter_output)
      and (target_status_filter is null or cs.status_normalized = target_status_filter)
      and (not exclude_not_live or cs.status_normalized <> 'not_live')
  )
  select
    f.charger_id,
    f.listing_id,
    f.charger_identifier,
    f.title,
    f.image_url,
    f.address_text,
    f.map_url,
    f.lat,
    f.lng,
    f.region,
    f.output_kw,
    f.output_bucket,
    f.output_text,
    f.price_text,
    f.schedule_text,
    f.price_model_type,
    f.price_bucket,
    f.estimated_all_time_revenue,
    f.estimated_all_time_kwh,
    f.total_sessions,
    f.first_seen_at,
    f.status_text,
    f.status_normalized,
    f.unavailable_since,
    f.last_checked_at,
    f.tracked_seconds,
    f.observed_occupied_seconds,
    f.observed_occupancy_rate,
    f.current_session_started_at
  from filtered f
  order by
    case
      when target_order_by = 'unavailable_since' and target_ascending
        then f.unavailable_since
      else null
    end asc nulls last,
    case
      when target_order_by = 'unavailable_since' and not target_ascending
        then f.unavailable_since
      else null
    end desc nulls last,
    case
      when target_order_by = 'observed_occupancy_rate' and target_ascending
        then f.observed_occupancy_rate
      else null
    end asc nulls last,
    case
      when target_order_by = 'observed_occupancy_rate' and not target_ascending
        then f.observed_occupancy_rate
      else null
    end desc nulls last,
    case
      when target_order_by = 'estimated_all_time_revenue' and target_ascending
        then f.estimated_all_time_revenue
      else null
    end asc nulls last,
    case
      when target_order_by = 'estimated_all_time_revenue' and not target_ascending
        then f.estimated_all_time_revenue
      else null
    end desc nulls last,
    case
      when target_order_by = 'charger_identifier' and target_ascending
        then f.charger_identifier
      else null
    end asc nulls last,
    case
      when target_order_by = 'charger_identifier' and not target_ascending
        then f.charger_identifier
      else null
    end desc nulls last,
    f.total_sessions desc,
    f.listing_id asc
  limit greatest(target_limit, 1)
  offset greatest(target_offset, 0);
$$;

create or replace function public.get_public_dashboard_row_count(
  filter_status text default null,
  filter_raw_status text default null,
  filter_region text default null,
  filter_price text default null,
  filter_output text default null,
  target_status_filter text default null,
  exclude_not_live boolean default false
)
returns table (
  total_count bigint
)
language sql
stable
set search_path = public
as $$
  select count(*)::bigint as total_count
  from public.charger_stats cs
  join public.chargers c
    on c.id = cs.charger_id
  where c.tracking_scope = 'toronto'
    and c.is_active = true
    and c.is_decommissioned = false
    and (filter_status is null or cs.status_normalized = filter_status)
    and (filter_raw_status is null or cs.status_text = filter_raw_status)
    and (filter_region is null or cs.region = filter_region)
    and (filter_price is null or cs.price_bucket = filter_price)
    and (filter_output is null or cs.output_bucket = filter_output)
    and (target_status_filter is null or cs.status_normalized = target_status_filter)
    and (not exclude_not_live or cs.status_normalized <> 'not_live');
$$;

create or replace function public.get_public_dashboard_raw_statuses(
  filter_status text default null,
  filter_region text default null,
  filter_price text default null,
  filter_output text default null,
  target_status_filter text default null,
  exclude_not_live boolean default false
)
returns table (
  status_text text,
  status_count bigint
)
language sql
stable
set search_path = public
as $$
  select
    coalesce(cs.status_text, 'UNKNOWN') as status_text,
    count(*)::bigint as status_count
  from public.charger_stats cs
  join public.chargers c
    on c.id = cs.charger_id
  where c.tracking_scope = 'toronto'
    and c.is_active = true
    and c.is_decommissioned = false
    and (filter_status is null or cs.status_normalized = filter_status)
    and (filter_region is null or cs.region = filter_region)
    and (filter_price is null or cs.price_bucket = filter_price)
    and (filter_output is null or cs.output_bucket = filter_output)
    and (target_status_filter is null or cs.status_normalized = target_status_filter)
    and (not exclude_not_live or cs.status_normalized <> 'not_live')
  group by coalesce(cs.status_text, 'UNKNOWN')
  order by count(*) desc, coalesce(cs.status_text, 'UNKNOWN') asc;
$$;

create or replace function public.get_public_dashboard_charger_detail(
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
  region text,
  output_kw numeric,
  output_bucket text,
  output_text text,
  price_text text,
  schedule_text text,
  price_model_type text,
  price_bucket text,
  estimated_all_time_revenue numeric,
  estimated_all_time_kwh numeric,
  total_sessions integer,
  first_seen_at timestamptz,
  status_text text,
  status_normalized text,
  unavailable_since timestamptz,
  last_checked_at timestamptz,
  tracked_seconds bigint,
  observed_occupied_seconds bigint,
  observed_occupancy_rate numeric,
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
    c.image_url,
    c.address_text,
    c.map_url,
    c.lat,
    c.lng,
    cs.region,
    c.output_kw,
    cs.output_bucket,
    c.output_text,
    c.price_text,
    c.schedule_text,
    c.price_model_type,
    cs.price_bucket,
    cs.estimated_all_time_revenue,
    cs.estimated_all_time_kwh,
    cs.total_sessions,
    c.first_seen_at,
    cs.status_text,
    cs.status_normalized,
    cs.unavailable_since,
    cs.last_checked_at,
    cs.tracked_seconds,
    cs.observed_occupied_seconds,
    cs.observed_occupancy_rate,
    cs.current_session_started_at
  from public.charger_stats cs
  join public.chargers c
    on c.id = cs.charger_id
  where cs.charger_id = target_charger_id
    and c.tracking_scope = 'toronto'
    and c.is_active = true
    and c.is_decommissioned = false
  limit 1;
$$;

create or replace function public.get_public_dashboard_recent_sessions(
  target_charger_id uuid,
  target_limit integer default 8
)
returns table (
  id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  estimated_kwh numeric,
  estimated_revenue numeric
)
language sql
stable
set search_path = public
as $$
  select
    cs.id,
    cs.started_at,
    cs.ended_at,
    cs.estimated_kwh,
    cs.estimated_revenue
  from public.charger_sessions cs
  join public.chargers c
    on c.id = cs.charger_id
  where cs.charger_id = target_charger_id
    and c.tracking_scope = 'toronto'
    and c.is_active = true
    and c.is_decommissioned = false
  order by cs.started_at desc
  limit greatest(target_limit, 1);
$$;

revoke execute on function public.get_public_tracking_started_at() from public, anon, authenticated;
revoke execute on function public.get_public_estimated_kwh_for_chargers(uuid[], timestamptz) from public, anon, authenticated;
revoke execute on function public.get_public_estimated_kwh_for_scope(text, timestamptz) from public, anon, authenticated;
revoke execute on function public.get_public_dashboard_rows(text, text, text, text, text, text, boolean, text, boolean, integer, integer) from public, anon, authenticated;
revoke execute on function public.get_public_dashboard_row_count(text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.get_public_dashboard_raw_statuses(text, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.get_public_dashboard_charger_detail(uuid) from public, anon, authenticated;
revoke execute on function public.get_public_dashboard_recent_sessions(uuid, integer) from public, anon, authenticated;

grant execute on function public.get_public_tracking_started_at() to service_role;
grant execute on function public.get_public_estimated_kwh_for_chargers(uuid[], timestamptz) to service_role;
grant execute on function public.get_public_estimated_kwh_for_scope(text, timestamptz) to service_role;
grant execute on function public.get_public_dashboard_rows(text, text, text, text, text, text, boolean, text, boolean, integer, integer) to service_role;
grant execute on function public.get_public_dashboard_row_count(text, text, text, text, text, text, boolean) to service_role;
grant execute on function public.get_public_dashboard_raw_statuses(text, text, text, text, text, boolean) to service_role;
grant execute on function public.get_public_dashboard_charger_detail(uuid) to service_role;
grant execute on function public.get_public_dashboard_recent_sessions(uuid, integer) to service_role;

drop policy if exists "public can read chargers" on public.chargers;
drop policy if exists "public can read charger sessions" on public.charger_sessions;
drop policy if exists "public can read charger stats" on public.charger_stats;
drop policy if exists "public can read app settings" on public.app_settings;
drop policy if exists "public can read tracking start setting" on public.app_settings;

revoke select on table public.chargers from anon, authenticated;
revoke select on table public.charger_stats from anon, authenticated;
revoke select on table public.charger_sessions from anon, authenticated;
revoke select on table public.app_settings from anon, authenticated;
