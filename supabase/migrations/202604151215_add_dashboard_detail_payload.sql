create or replace function public.get_public_dashboard_charger_detail_payload(
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
