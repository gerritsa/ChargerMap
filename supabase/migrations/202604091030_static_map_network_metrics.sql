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
    where c.is_active = true
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
