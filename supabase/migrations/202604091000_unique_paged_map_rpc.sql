create or replace function public.get_map_charger_summaries_paged(
  bounds_west double precision,
  bounds_south double precision,
  bounds_east double precision,
  bounds_north double precision,
  page_limit integer default 1000,
  page_offset integer default 0
)
returns table (
  charger_id uuid,
  listing_id integer,
  charger_identifier text,
  status_text text,
  status_normalized text,
  lat double precision,
  lng double precision,
  total_sessions integer,
  estimated_all_time_revenue numeric,
  estimated_all_time_kwh numeric
)
language sql
stable
as $$
  select
    cs.charger_id,
    c.listing_id,
    c.charger_identifier,
    cs.status_text,
    cs.status_normalized,
    cs.lat,
    cs.lng,
    cs.total_sessions,
    cs.estimated_all_time_revenue,
    cs.estimated_all_time_kwh
  from public.charger_stats cs
  join public.chargers c
    on c.id = cs.charger_id
  where c.is_active = true
    and c.is_decommissioned = false
    and cs.geom is not null
    and cs.geom && st_makeenvelope(
      bounds_west,
      bounds_south,
      bounds_east,
      bounds_north,
      4326
    )
    and st_intersects(
      cs.geom,
      st_makeenvelope(
        bounds_west,
        bounds_south,
        bounds_east,
        bounds_north,
        4326
      )
    )
  order by c.listing_id asc
  limit greatest(page_limit, 1)
  offset greatest(page_offset, 0);
$$;
