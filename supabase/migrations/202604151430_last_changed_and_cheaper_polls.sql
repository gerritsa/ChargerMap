create table if not exists public.charger_poll_state (
  charger_id uuid primary key references public.chargers (id) on delete cascade,
  last_polled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists charger_poll_state_last_polled_at_idx
  on public.charger_poll_state (last_polled_at desc);

create or replace function public.refresh_charger_poll_runtime(
  target_charger_id uuid,
  checked_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_checked_at timestamptz := coalesce(checked_at, now());
  tracking_started_at timestamptz;
  observed_occupied_seconds bigint;
  current_session_started_at timestamptz;
  next_tracked_seconds bigint;
  next_observed_occupancy_rate numeric;
begin
  insert into public.charger_poll_state (
    charger_id,
    last_polled_at,
    updated_at
  )
  values (
    target_charger_id,
    effective_checked_at,
    effective_checked_at
  )
  on conflict (charger_id) do update
    set last_polled_at = excluded.last_polled_at,
        updated_at = excluded.updated_at;

  select
    c.first_seen_at,
    coalesce(cs.observed_occupied_seconds, 0)::bigint,
    cs.current_session_started_at
  into
    tracking_started_at,
    observed_occupied_seconds,
    current_session_started_at
  from public.charger_stats cs
  join public.chargers c
    on c.id = cs.charger_id
  where cs.charger_id = target_charger_id;

  if not found then
    return;
  end if;

  next_tracked_seconds :=
    greatest(0, extract(epoch from effective_checked_at - tracking_started_at))::bigint;

  next_observed_occupancy_rate :=
    case
      when next_tracked_seconds > 0 then (
        observed_occupied_seconds +
        case
          when current_session_started_at is not null then
            greatest(0, extract(epoch from effective_checked_at - current_session_started_at))::bigint
          else 0
        end
      )::numeric / next_tracked_seconds::numeric
      else 0
    end;

  update public.charger_stats
  set
    last_checked_at = effective_checked_at,
    tracked_seconds = next_tracked_seconds,
    observed_occupancy_rate = next_observed_occupancy_rate,
    updated_at = effective_checked_at
  where charger_id = target_charger_id;
end;
$$;

revoke execute on function public.refresh_charger_poll_runtime(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.refresh_charger_poll_runtime(uuid, timestamptz) to service_role;

create or replace function public.get_due_poll_targets(
  target_scope text,
  target_shard_index integer,
  target_shard_count integer,
  target_batch_size integer,
  target_due_before timestamptz
)
returns table (
  id uuid,
  listing_id integer,
  charger_identifier text,
  price_model_type text,
  output_kw numeric,
  pricing_base_type text,
  pricing_structure_type text,
  base_rate numeric,
  base_unit text,
  charging_rate_per_hour numeric,
  tier_1_rate_per_hour numeric,
  tier_1_max_hours numeric,
  tier_2_rate_per_hour numeric,
  has_guest_fee boolean,
  guest_fee numeric,
  has_flat_fee boolean,
  flat_fee numeric,
  has_idle_fee boolean,
  idle_rate numeric,
  idle_unit text,
  idle_grace_hours numeric,
  energy_rate_per_kwh numeric,
  region text,
  lat double precision,
  lng double precision,
  first_seen_at timestamptz,
  last_checked_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.listing_id,
    c.charger_identifier,
    c.price_model_type,
    c.output_kw,
    c.pricing_base_type,
    c.pricing_structure_type,
    c.base_rate,
    c.base_unit,
    c.charging_rate_per_hour,
    c.tier_1_rate_per_hour,
    c.tier_1_max_hours,
    c.tier_2_rate_per_hour,
    c.has_guest_fee,
    c.guest_fee,
    c.has_flat_fee,
    c.flat_fee,
    c.has_idle_fee,
    c.idle_rate,
    c.idle_unit,
    c.idle_grace_hours,
    c.energy_rate_per_kwh,
    c.region,
    c.lat,
    c.lng,
    c.first_seen_at,
    coalesce(ps.last_polled_at, s.last_checked_at) as last_checked_at
  from public.chargers c
  left join public.charger_current_status s
    on s.charger_id = c.id
  left join public.charger_poll_state ps
    on ps.charger_id = c.id
  where c.tracking_scope = target_scope
    and c.is_active = true
    and c.is_decommissioned = false
    and mod(c.listing_id, target_shard_count) = target_shard_index
    and coalesce(ps.last_polled_at, s.last_checked_at, '-infinity'::timestamptz) < target_due_before
  order by coalesce(ps.last_polled_at, s.last_checked_at, '-infinity'::timestamptz) asc, c.listing_id asc
  limit greatest(target_batch_size, 1);
$$;

drop function if exists public.get_map_charger_group(uuid);

create function public.get_map_charger_group(
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
  last_changed_at timestamptz,
  last_checked_at timestamptz,
  total_sessions integer,
  estimated_all_time_revenue numeric,
  estimated_all_time_kwh numeric,
  unavailable_since timestamptz
)
language sql
stable
set search_path = public
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
    cur.last_changed_at,
    coalesce(ps.last_polled_at, cs.last_checked_at) as last_checked_at,
    cs.total_sessions,
    cs.estimated_all_time_revenue,
    cs.estimated_all_time_kwh,
    cs.unavailable_since
  from public.charger_stats cs
  join public.chargers c
    on c.id = cs.charger_id
  join selected s
    on true
  left join public.charger_current_status cur
    on cur.charger_id = cs.charger_id
  left join public.charger_poll_state ps
    on ps.charger_id = cs.charger_id
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

drop function if exists public.get_public_dashboard_occupancy_rows(text, text, text, boolean, integer, integer);

create function public.get_public_dashboard_occupancy_rows(
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
  last_changed_at timestamptz,
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
    cur.last_changed_at,
    coalesce(ps.last_polled_at, cs.last_checked_at) as last_checked_at,
    cs.observed_occupancy_rate,
    cs.tracked_seconds,
    cs.total_sessions,
    cs.estimated_all_time_revenue,
    cs.current_session_started_at
  from public.charger_stats cs
  join public.chargers c
    on c.id = cs.charger_id
  left join public.charger_current_status cur
    on cur.charger_id = cs.charger_id
  left join public.charger_poll_state ps
    on ps.charger_id = cs.charger_id
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

revoke execute on function public.get_public_dashboard_occupancy_rows(text, text, text, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.get_public_dashboard_occupancy_rows(text, text, text, boolean, integer, integer) to service_role;

drop function if exists public.get_public_dashboard_charger_detail_payload(uuid, integer);

create function public.get_public_dashboard_charger_detail_payload(
  target_charger_id uuid,
  target_limit integer default 8
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
  last_changed_at timestamptz,
  last_checked_at timestamptz,
  tracked_seconds bigint,
  observed_occupied_seconds bigint,
  observed_occupancy_rate numeric,
  current_session_started_at timestamptz,
  recent_sessions jsonb
)
language sql
stable
set search_path = public
as $$
  with target as (
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
      cur.last_changed_at,
      coalesce(ps.last_polled_at, cs.last_checked_at) as last_checked_at,
      cs.tracked_seconds,
      cs.observed_occupied_seconds,
      cs.observed_occupancy_rate,
      cs.current_session_started_at
    from public.charger_stats cs
    join public.chargers c
      on c.id = cs.charger_id
    left join public.charger_current_status cur
      on cur.charger_id = cs.charger_id
    left join public.charger_poll_state ps
      on ps.charger_id = cs.charger_id
    where cs.charger_id = target_charger_id
      and c.tracking_scope = 'toronto'
      and c.is_active = true
      and c.is_decommissioned = false
    limit 1
  ),
  sessions as (
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
    limit greatest(target_limit, 1)
  )
  select
    t.charger_id,
    t.listing_id,
    t.charger_identifier,
    t.title,
    t.image_url,
    t.address_text,
    t.map_url,
    t.lat,
    t.lng,
    t.region,
    t.output_kw,
    t.output_bucket,
    t.output_text,
    t.price_text,
    t.schedule_text,
    t.price_model_type,
    t.price_bucket,
    t.estimated_all_time_revenue,
    t.estimated_all_time_kwh,
    t.total_sessions,
    t.first_seen_at,
    t.status_text,
    t.status_normalized,
    t.unavailable_since,
    t.last_changed_at,
    t.last_checked_at,
    t.tracked_seconds,
    t.observed_occupied_seconds,
    t.observed_occupancy_rate,
    t.current_session_started_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'started_at', s.started_at,
            'ended_at', s.ended_at,
            'estimated_kwh', s.estimated_kwh,
            'estimated_revenue', s.estimated_revenue
          )
          order by s.started_at desc
        )
        from sessions s
      ),
      '[]'::jsonb
    ) as recent_sessions
  from target t;
$$;

revoke execute on function public.get_public_dashboard_charger_detail_payload(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_public_dashboard_charger_detail_payload(uuid, integer) to service_role;
