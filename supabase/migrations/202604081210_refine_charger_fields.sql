alter table public.chargers
  add column if not exists price_text_raw text,
  add column if not exists price_note_text text,
  add column if not exists pricing_unit text,
  add column if not exists energy_rate_per_kwh numeric,
  add column if not exists idle_grace_hours numeric,
  add column if not exists address_line_1 text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists postal_code text,
  add column if not exists country_code text;
