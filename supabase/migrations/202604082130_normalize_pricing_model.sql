alter table public.chargers
  add column if not exists pricing_base_type text,
  add column if not exists pricing_structure_type text,
  add column if not exists pricing_parse_status text,
  add column if not exists base_rate numeric,
  add column if not exists base_unit text,
  add column if not exists has_guest_fee boolean not null default false,
  add column if not exists has_flat_fee boolean not null default false,
  add column if not exists has_idle_fee boolean not null default false,
  add column if not exists idle_rate numeric,
  add column if not exists idle_unit text,
  add column if not exists idle_trigger_text text,
  add column if not exists flat_fee numeric,
  add column if not exists idle_grace_minutes numeric,
  add column if not exists idle_fee_trigger_text text;

with source as (
  select
    id,
    trim(coalesce(price_text, '')) as price_text
  from public.chargers
),
extracted as (
  select
    s.id,
    s.price_text,
    nullif(
      substring(s.price_text from '\$([0-9]+(?:\.[0-9]+)?)\s*guest fee'),
      ''
    )::numeric as guest_fee_amount,
    nullif(
      substring(s.price_text from '\$([0-9]+(?:\.[0-9]+)?)\s*flat fee'),
      ''
    )::numeric as flat_fee_amount,
    nullif(
      substring(s.price_text from '\$([0-9]+(?:\.[0-9]+)?)\s*/kWh'),
      ''
    )::numeric as energy_rate_per_kwh_value,
    substring(
      s.price_text
      from 'added after\s+((?:\d+(?:\.\d+)?)\s*hours?(?:\s+\d+(?:\.\d+)?\s*minutes?)?|(?:\d+(?:\.\d+)?)\s*minutes?)'
    ) as idle_trigger_text,
    substring(
      s.price_text
      from 'for the first\s+((?:\d+(?:\.\d+)?)\s*hours?(?:\s+\d+(?:\.\d+)?\s*minutes?)?|(?:\d+(?:\.\d+)?)\s*minutes?)'
    ) as first_window_text,
    hour_rates.hour_rate_1,
    hour_rates.hour_rate_2,
    coalesce(hour_rates.hour_rate_count, 0) as hour_rate_count,
    s.price_text ~* '^pricing pending$' as is_pricing_pending,
    s.price_text ~* 'time of day' as is_time_of_day,
    (
      s.price_text ~* 'while actively charging'
      and s.price_text ~* '(loitering|thereafter)'
    ) as has_idle_language
  from source s
  left join lateral (
    select
      max(case when ord = 1 then (match[1])::numeric end) as hour_rate_1,
      max(case when ord = 2 then (match[1])::numeric end) as hour_rate_2,
      count(*)::integer as hour_rate_count
    from regexp_matches(
      s.price_text,
      '\$([0-9]+(?:\.[0-9]+)?)\s*/hr',
      'gi'
    ) with ordinality as rates(match, ord)
  ) as hour_rates on true
),
parsed as (
  select
    e.id,
    e.price_text,
    e.guest_fee_amount,
    e.flat_fee_amount,
    e.energy_rate_per_kwh_value,
    e.hour_rate_1,
    e.hour_rate_2,
    e.hour_rate_count,
    e.idle_trigger_text,
    e.first_window_text,
    (
      coalesce(
        nullif(
          substring(e.idle_trigger_text from '([0-9]+(?:\.[0-9]+)?)\s*hours?'),
          ''
        )::numeric,
        0
      ) * 60
      + coalesce(
        nullif(
          substring(e.idle_trigger_text from '([0-9]+(?:\.[0-9]+)?)\s*minutes?'),
          ''
        )::numeric,
        0
      )
    ) as idle_grace_minutes,
    round(
      (
        coalesce(
          nullif(
            substring(e.idle_trigger_text from '([0-9]+(?:\.[0-9]+)?)\s*hours?'),
            ''
          )::numeric,
          0
        ) * 60
        + coalesce(
          nullif(
            substring(e.idle_trigger_text from '([0-9]+(?:\.[0-9]+)?)\s*minutes?'),
            ''
          )::numeric,
          0
        )
      ) / 60.0,
      4
    ) as idle_grace_hours,
    round(
      (
        coalesce(
          nullif(
            substring(e.first_window_text from '([0-9]+(?:\.[0-9]+)?)\s*hours?'),
            ''
          )::numeric,
          0
        ) * 60
        + coalesce(
          nullif(
            substring(e.first_window_text from '([0-9]+(?:\.[0-9]+)?)\s*minutes?'),
            ''
          )::numeric,
          0
        )
      ) / 60.0,
      4
    ) as first_window_hours,
    case
      when e.is_pricing_pending then 'unparsed'
      when e.is_time_of_day then 'partial'
      when e.price_text ~* '^free$' then 'parsed'
      when e.first_window_text is not null and e.hour_rate_count >= 2 and e.price_text ~* 'thereafter' then 'parsed'
      when e.has_idle_language then 'parsed'
      when e.energy_rate_per_kwh_value is not null then 'parsed'
      when e.hour_rate_count >= 1 then 'parsed'
      else 'unparsed'
    end as pricing_parse_status,
    case
      when e.is_pricing_pending or e.is_time_of_day then 'unknown'
      when e.price_text ~* '^free$' then 'free'
      when e.first_window_text is not null and e.hour_rate_count >= 2 and e.price_text ~* 'thereafter' then 'hourly'
      when e.has_idle_language and e.energy_rate_per_kwh_value is not null and e.hour_rate_count >= 1 then 'energy'
      when e.has_idle_language and e.hour_rate_count >= 2 then 'hourly'
      when e.has_idle_language and e.price_text ~* '^free while actively charging' and e.hour_rate_count >= 1 then 'free'
      when e.energy_rate_per_kwh_value is not null then 'energy'
      when e.hour_rate_count >= 1 then 'hourly'
      else 'unknown'
    end as pricing_base_type,
    case
      when e.is_pricing_pending then 'pending'
      when e.is_time_of_day then 'time_of_day'
      when e.price_text ~* '^free$' then 'free'
      when e.first_window_text is not null and e.hour_rate_count >= 2 and e.price_text ~* 'thereafter' then 'tiered_time'
      when e.has_idle_language then 'idle_after_charging'
      when e.energy_rate_per_kwh_value is not null or e.hour_rate_count >= 1 then 'simple'
      else 'unknown'
    end as pricing_structure_type,
    case
      when e.price_text ~* '^free$' then 'free'
      when e.first_window_text is not null and e.hour_rate_count >= 2 and e.price_text ~* 'thereafter' then 'hour'
      when e.has_idle_language and e.energy_rate_per_kwh_value is not null and e.hour_rate_count >= 1 then 'kwh'
      when e.has_idle_language and e.hour_rate_count >= 2 then 'hour'
      when e.has_idle_language and e.price_text ~* '^free while actively charging' and e.hour_rate_count >= 1 then 'free'
      when e.energy_rate_per_kwh_value is not null then 'kwh'
      when e.hour_rate_count >= 1 then 'hour'
      else null
    end as pricing_unit,
    case
      when e.first_window_text is not null and e.hour_rate_count >= 2 and e.price_text ~* 'thereafter' then e.hour_rate_1
      when e.has_idle_language and e.energy_rate_per_kwh_value is not null and e.hour_rate_count >= 1 then e.energy_rate_per_kwh_value
      when e.has_idle_language and e.hour_rate_count >= 2 then e.hour_rate_1
      when e.energy_rate_per_kwh_value is not null then e.energy_rate_per_kwh_value
      when e.hour_rate_count >= 1 then e.hour_rate_1
      else null
    end as base_rate,
    case
      when e.first_window_text is not null and e.hour_rate_count >= 2 and e.price_text ~* 'thereafter' then 'hr'
      when e.has_idle_language and e.energy_rate_per_kwh_value is not null and e.hour_rate_count >= 1 then 'kwh'
      when e.has_idle_language and e.hour_rate_count >= 2 then 'hr'
      when e.energy_rate_per_kwh_value is not null then 'kwh'
      when e.hour_rate_count >= 1 then 'hr'
      else null
    end as base_unit,
    (e.guest_fee_amount is not null) as has_guest_fee,
    (e.flat_fee_amount is not null) as has_flat_fee,
    (
      e.has_idle_language
      and (
        (e.energy_rate_per_kwh_value is not null and e.hour_rate_count >= 1)
        or e.hour_rate_count >= 2
        or (e.price_text ~* '^free while actively charging' and e.hour_rate_count >= 1)
      )
    ) as has_idle_fee,
    case
      when e.has_idle_language and e.energy_rate_per_kwh_value is not null and e.hour_rate_count >= 1 then e.hour_rate_1
      when e.has_idle_language and e.hour_rate_count >= 2 then e.hour_rate_2
      when e.has_idle_language and e.price_text ~* '^free while actively charging' and e.hour_rate_count >= 1 then e.hour_rate_1
      else null
    end as idle_rate,
    case
      when e.has_idle_language then 'hr'
      else null
    end as idle_unit,
    case
      when e.first_window_text is not null and e.hour_rate_count >= 2 and e.price_text ~* 'thereafter' then e.hour_rate_1
      when e.has_idle_language and e.hour_rate_count >= 2 then e.hour_rate_1
      when e.hour_rate_count >= 1 and e.energy_rate_per_kwh_value is null then e.hour_rate_1
      else null
    end as charging_rate_per_hour,
    case
      when e.first_window_text is not null and e.hour_rate_count >= 2 and e.price_text ~* 'thereafter' then e.hour_rate_1
      else null
    end as tier_1_rate_per_hour,
    case
      when e.first_window_text is not null and e.hour_rate_count >= 2 and e.price_text ~* 'thereafter' then round(
        (
          coalesce(
            nullif(
              substring(e.first_window_text from '([0-9]+(?:\.[0-9]+)?)\s*hours?'),
              ''
            )::numeric,
            0
          ) * 60
          + coalesce(
            nullif(
              substring(e.first_window_text from '([0-9]+(?:\.[0-9]+)?)\s*minutes?'),
              ''
            )::numeric,
            0
          )
        ) / 60.0,
        4
      )
      else null
    end as tier_1_max_hours,
    case
      when e.first_window_text is not null and e.hour_rate_count >= 2 and e.price_text ~* 'thereafter' then e.hour_rate_2
      else null
    end as tier_2_rate_per_hour,
    case
      when e.is_pricing_pending then 0
      when e.is_time_of_day then 0.25
      when e.price_text ~* '^free$' then 1
      when e.first_window_text is not null and e.hour_rate_count >= 2 and e.price_text ~* 'thereafter' then 0.95
      when e.has_idle_language and e.energy_rate_per_kwh_value is not null and e.hour_rate_count >= 1 then 0.97
      when e.has_idle_language and e.hour_rate_count >= 1 then 0.96
      when e.energy_rate_per_kwh_value is not null then 0.98
      when e.hour_rate_count >= 1 then 0.92
      else 0
    end as price_parse_confidence
  from extracted e
),
finalized as (
  select
    p.*,
    case
      when p.pricing_structure_type = 'pending' then 'pricing_pending'
      when p.pricing_structure_type = 'time_of_day' then 'time_of_day'
      when p.pricing_structure_type = 'tiered_time' then case when p.has_guest_fee then 'tiered_time_plus_guest_fee' else 'tiered_time' end
      when p.pricing_structure_type = 'idle_after_charging' then case when p.has_guest_fee then 'base_plus_idle_plus_guest_fee' else 'base_plus_idle' end
      when p.pricing_structure_type = 'free' then case when p.has_guest_fee then 'free_plus_guest_fee' else 'free' end
      when p.pricing_structure_type = 'simple' and p.pricing_base_type = 'energy' then case when p.has_guest_fee then 'energy_plus_guest_fee' else 'energy_simple' end
      when p.pricing_structure_type = 'simple' and p.pricing_base_type = 'hourly' then case when p.has_guest_fee then 'hourly_plus_guest_fee' else 'hourly_simple' end
      else 'unknown'
    end as price_model_type
  from parsed p
)
update public.chargers as c
set
  price_model_type = f.price_model_type,
  price_parse_confidence = f.price_parse_confidence,
  pricing_base_type = f.pricing_base_type,
  pricing_structure_type = f.pricing_structure_type,
  pricing_parse_status = f.pricing_parse_status,
  pricing_unit = f.pricing_unit,
  base_rate = f.base_rate,
  base_unit = f.base_unit,
  has_guest_fee = f.has_guest_fee,
  guest_fee = f.guest_fee_amount,
  has_flat_fee = f.has_flat_fee,
  flat_fee = f.flat_fee_amount,
  has_idle_fee = f.has_idle_fee,
  idle_rate = f.idle_rate,
  idle_unit = f.idle_unit,
  idle_trigger_text = f.idle_trigger_text,
  charging_rate_per_hour = f.charging_rate_per_hour,
  idle_rate_per_hour = f.idle_rate,
  tier_1_rate_per_hour = f.tier_1_rate_per_hour,
  tier_1_max_hours = f.tier_1_max_hours,
  tier_2_rate_per_hour = f.tier_2_rate_per_hour,
  energy_rate_per_kwh = f.energy_rate_per_kwh_value,
  idle_grace_hours = case
    when f.has_idle_fee then f.idle_grace_hours
    else null
  end,
  idle_grace_minutes = case
    when f.has_idle_fee then f.idle_grace_minutes
    else null
  end,
  idle_fee_trigger_text = f.idle_trigger_text
from finalized f
where f.id = c.id;

update public.charger_stats as stats
set
  region = chargers.region,
  price_bucket = case
    when chargers.pricing_structure_type in ('idle_after_charging', 'tiered_time') then 'complex'
    when chargers.pricing_base_type = 'free' then 'free'
    when chargers.pricing_base_type = 'hourly' then 'hourly'
    when chargers.pricing_base_type = 'energy' then 'energy'
    else 'unknown'
  end,
  output_bucket = case
    when chargers.output_kw is null then 'unknown'
    else round(chargers.output_kw)::text
  end,
  lat = chargers.lat,
  lng = chargers.lng,
  updated_at = now()
from public.chargers
where chargers.id = stats.charger_id;
