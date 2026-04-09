begin;

insert into public.app_settings (setting_key, value_text, updated_at)
values (
  'global_status_tracking_started_at',
  '2026-04-09T00:00:00-04:00',
  now()
)
on conflict (setting_key) do update
set
  value_text = excluded.value_text,
  updated_at = excluded.updated_at;

truncate table
  public.charger_current_status,
  public.charger_status_events,
  public.charger_sessions,
  public.charger_stats;

update public.chargers
set
  total_sessions = 0,
  estimated_all_time_kwh = 0,
  estimated_all_time_revenue = 0,
  updated_at = now();

commit;
