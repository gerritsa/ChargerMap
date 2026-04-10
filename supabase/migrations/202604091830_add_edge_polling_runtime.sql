create table if not exists public.poll_shard_leases (
  scope text not null,
  shard_index integer not null,
  locked_until timestamptz not null default now(),
  run_id uuid,
  started_at timestamptz,
  last_finished_at timestamptz,
  last_summary jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope, shard_index)
);

create or replace function public.try_acquire_poll_shard_lease(
  target_scope text,
  target_shard_index integer,
  target_ttl_seconds integer,
  target_run_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  next_locked_until timestamptz := now() + make_interval(secs => greatest(target_ttl_seconds, 1));
begin
  insert into public.poll_shard_leases (
    scope,
    shard_index,
    locked_until,
    run_id,
    started_at,
    last_error,
    updated_at
  )
  values (
    target_scope,
    target_shard_index,
    next_locked_until,
    target_run_id,
    now(),
    null,
    now()
  )
  on conflict (scope, shard_index) do update
  set
    locked_until = excluded.locked_until,
    run_id = excluded.run_id,
    started_at = excluded.started_at,
    last_error = null,
    updated_at = now()
  where public.poll_shard_leases.locked_until < now();

  return found;
end;
$$;

create or replace function public.release_poll_shard_lease(
  target_scope text,
  target_shard_index integer,
  target_run_id uuid,
  target_summary jsonb,
  target_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.poll_shard_leases
  set
    locked_until = now(),
    run_id = null,
    last_finished_at = now(),
    last_summary = target_summary,
    last_error = target_error,
    updated_at = now()
  where scope = target_scope
    and shard_index = target_shard_index
    and run_id = target_run_id;

  return found;
end;
$$;

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
    s.last_checked_at
  from public.chargers c
  left join public.charger_current_status s
    on s.charger_id = c.id
  where c.tracking_scope = target_scope
    and c.is_active = true
    and c.is_decommissioned = false
    and mod(c.listing_id, target_shard_count) = target_shard_index
    and coalesce(s.last_checked_at, '-infinity'::timestamptz) < target_due_before
  order by coalesce(s.last_checked_at, '-infinity'::timestamptz) asc, c.listing_id asc
  limit greatest(target_batch_size, 1);
$$;

create index if not exists poll_shard_leases_locked_until_idx
  on public.poll_shard_leases (locked_until);
