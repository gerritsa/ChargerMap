alter table public.charger_poll_state
  add column if not exists next_poll_at timestamptz;

create index if not exists charger_poll_state_next_poll_at_idx
  on public.charger_poll_state (next_poll_at asc nulls first);

create or replace function public.get_poll_interval_for_status(
  target_status_normalized text
)
returns interval
language sql
immutable
set search_path = public
as $$
  select case coalesce(target_status_normalized, 'unknown')
    when 'occupied' then interval '15 minutes'
    when 'available' then interval '15 minutes'
    when 'unavailable' then interval '2 hours'
    when 'not_live' then interval '12 hours'
    else interval '15 minutes'
  end;
$$;

create or replace function public.refresh_charger_poll_runtime(
  target_charger_id uuid,
  checked_at timestamptz default now(),
  target_status_normalized text default null
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
  effective_status_normalized text;
  effective_next_poll_at timestamptz;
begin
  select coalesce(
    target_status_normalized,
    (
      select status_normalized
      from public.charger_current_status
      where charger_id = target_charger_id
      limit 1
    ),
    'unknown'
  )
  into effective_status_normalized;

  effective_next_poll_at :=
    effective_checked_at + public.get_poll_interval_for_status(effective_status_normalized);

  insert into public.charger_poll_state (
    charger_id,
    last_polled_at,
    next_poll_at,
    updated_at
  )
  values (
    target_charger_id,
    effective_checked_at,
    effective_next_poll_at,
    effective_checked_at
  )
  on conflict (charger_id) do update
    set last_polled_at = excluded.last_polled_at,
        next_poll_at = excluded.next_poll_at,
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

revoke execute on function public.refresh_charger_poll_runtime(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.refresh_charger_poll_runtime(uuid, timestamptz, text) to service_role;

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'refresh_charger_poll_runtime'
      and oidvectortypes(proargtypes) = 'uuid, timestamp with time zone'
  ) then
    revoke execute on function public.refresh_charger_poll_runtime(uuid, timestamptz) from public, anon, authenticated;
    grant execute on function public.refresh_charger_poll_runtime(uuid, timestamptz) to service_role;
  end if;
end;
$$;

insert into public.charger_poll_state (
  charger_id,
  last_polled_at,
  next_poll_at,
  updated_at
)
select
  c.id,
  coalesce(ps.last_polled_at, s.last_checked_at, now()) as last_polled_at,
  coalesce(
    ps.next_poll_at,
    coalesce(ps.last_polled_at, s.last_checked_at, now()) +
      public.get_poll_interval_for_status(s.status_normalized)
  ) as next_poll_at,
  coalesce(ps.updated_at, now()) as updated_at
from public.chargers c
left join public.charger_current_status s
  on s.charger_id = c.id
left join public.charger_poll_state ps
  on ps.charger_id = c.id
where c.tracking_scope = 'toronto'
  and c.is_active = true
  and c.is_decommissioned = false
on conflict (charger_id) do update
  set next_poll_at = excluded.next_poll_at,
      updated_at = greatest(public.charger_poll_state.updated_at, excluded.updated_at);

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
    and coalesce(
      ps.next_poll_at,
      case
        when s.last_checked_at is not null
          then s.last_checked_at + public.get_poll_interval_for_status(s.status_normalized)
        else '-infinity'::timestamptz
      end,
      '-infinity'::timestamptz
    ) <= now()
  order by
    coalesce(
      ps.next_poll_at,
      case
        when s.last_checked_at is not null
          then s.last_checked_at + public.get_poll_interval_for_status(s.status_normalized)
        else '-infinity'::timestamptz
      end,
      '-infinity'::timestamptz
    ) asc,
    c.listing_id asc
  limit greatest(target_batch_size, 1);
$$;

create or replace function public.invoke_poll_status_batch_shard(
  target_shard_index integer
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  function_base_url text;
  poller_secret text;
  request_id bigint;
begin
  select decrypted_secret
  into function_base_url
  from vault.decrypted_secrets
  where name = 'poll_status_project_url';

  select decrypted_secret
  into poller_secret
  from vault.decrypted_secrets
  where name = 'poll_status_poller_secret';

  if function_base_url is null then
    raise exception 'Vault secret poll_status_project_url is required before scheduling the poller.';
  end if;

  if poller_secret is null then
    raise exception 'Vault secret poll_status_poller_secret is required before scheduling the poller.';
  end if;

  select net.http_post(
    url := function_base_url || '/functions/v1/poll-status-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-poller-secret', poller_secret
    ),
    body := jsonb_build_object(
      'scope', 'toronto',
      'shardIndex', target_shard_index,
      'shardCount', 5,
      'batchSize', 35,
      'concurrency', 5,
      'dueAfterMinutes', 15
    )
  )
  into request_id;

  return request_id;
end;
$$;
