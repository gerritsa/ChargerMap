create table if not exists public.app_settings (
  setting_key text primary key,
  value_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (setting_key, value_text)
values ('global_status_tracking_started_at', null)
on conflict (setting_key) do nothing;

alter table public.app_settings enable row level security;

create policy "public can read app settings"
on public.app_settings
for select
to anon, authenticated
using (true);
