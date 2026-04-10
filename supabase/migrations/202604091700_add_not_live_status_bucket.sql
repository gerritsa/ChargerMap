create or replace function public.normalize_swtch_status(status_text text)
returns text
language sql
immutable
as $$
  select
    case
      when status_text is null or btrim(status_text) = '' then 'unknown'
      when lower(status_text) like '%charging%'
        or lower(status_text) like '%charger in use%'
        or lower(status_text) like '%in use%'
        or lower(status_text) like '%occupied%'
        or lower(status_text) like '%preparing%'
        or lower(status_text) like '%finishing%'
        or lower(status_text) like '%suspendedev%'
        or lower(status_text) like '%suspendedevse%'
        then 'occupied'
      when lower(status_text) like '%awaiting commissioning%'
        or lower(status_text) like '%commissioned%'
        or lower(status_text) like '%activating%'
        or lower(status_text) like '%pending driver subscription%'
        or lower(status_text) like '%pending property%'
        or lower(status_text) like '%decommissioned%'
        then 'not_live'
      when lower(status_text) like '%unavailable%'
        or lower(status_text) like '%out of service%'
        or lower(status_text) like '%fault%'
        or lower(status_text) like '%broken%'
        or lower(status_text) like '%error%'
        or lower(status_text) like '%offline%'
        or lower(status_text) like '%under repair%'
        then 'unavailable'
      when lower(status_text) like '%available%'
        or lower(status_text) like '%active%'
        or lower(status_text) like '%ready%'
        or lower(status_text) like '%open%'
        then 'available'
      else 'unknown'
    end;
$$;

update public.chargers
set
  status_normalized_last_scraped = public.normalize_swtch_status(status_text_last_scraped),
  updated_at = now()
where status_text_last_scraped is not null;

update public.charger_current_status
set
  status_normalized = public.normalize_swtch_status(status_text),
  unavailable_since = case
    when public.normalize_swtch_status(status_text) = 'unavailable' then unavailable_since
    else null
  end,
  occupied_since = case
    when public.normalize_swtch_status(status_text) = 'occupied' then occupied_since
    else null
  end;

update public.charger_status_events
set
  from_status_normalized = case
    when from_status_text is null then null
    else public.normalize_swtch_status(from_status_text)
  end,
  to_status_normalized = public.normalize_swtch_status(to_status_text);

update public.charger_stats
set
  status_normalized = public.normalize_swtch_status(status_text),
  unavailable_since = case
    when public.normalize_swtch_status(status_text) = 'unavailable' then unavailable_since
    else null
  end,
  occupied_since = case
    when public.normalize_swtch_status(status_text) = 'occupied' then occupied_since
    else null
  end,
  current_session_started_at = case
    when public.normalize_swtch_status(status_text) = 'occupied' then current_session_started_at
    else null
  end,
  updated_at = now();

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
    and (filter_status is not null or cs.status_normalized <> 'not_live')
    and (filter_region is null or cs.region = filter_region)
    and (filter_price is null or cs.price_bucket = filter_price)
    and (filter_output is null or cs.output_bucket = filter_output);
$$;
