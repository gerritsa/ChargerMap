# Pricing Model Reference

This document describes how charger pricing is stored and how raw SWTCH pricing
text is interpreted.

## Source Of Truth

The canonical pricing model lives on `public.chargers` and splits pricing into
separate dimensions instead of relying on a single combined enum.

The normalized columns are:

- `pricing_base_type`: `free`, `hourly`, `energy`, `unknown`
- `pricing_structure_type`: `free`, `simple`, `idle_after_charging`, `tiered_time`, `time_of_day`, `pending`, `unknown`
- `pricing_parse_status`: `parsed`, `partial`, `unparsed`
- `price_parse_confidence`: numeric confidence score
- `base_rate`: numeric base charging rate
- `base_unit`: `hr`, `kwh`, or `null`
- `has_guest_fee`: boolean
- `guest_fee`: numeric or `null`
- `has_flat_fee`: boolean
- `flat_fee`: numeric or `null`
- `has_idle_fee`: boolean
- `idle_rate`: numeric or `null`
- `idle_unit`: `hr` or `null`
- `idle_trigger_text`: original trigger phrase, such as `2 hours`
- `idle_grace_minutes`: parsed trigger duration in minutes
- `idle_grace_hours`: parsed trigger duration in hours

`price_model_type` still exists, but it is now a derived reporting label rather
than the source of truth.

## Supporting Fields

These fields are still populated for compatibility and convenience:

- `pricing_unit`
- `charging_rate_per_hour`
- `idle_rate_per_hour`
- `energy_rate_per_kwh`
- `tier_1_rate_per_hour`
- `tier_1_max_hours`
- `tier_2_rate_per_hour`

## Raw Text Inputs

The parser starts from the pricing paragraphs on a listing page:

- `price_text`: the first visible pricing line
- `price_text_raw`: all pricing paragraphs joined together
- `price_note_text`: any remaining pricing paragraphs after the first

It extracts these pieces from `price_text`:

- guest fee via `"$... guest fee"`
- flat fee via `"$... flat fee"`
- hourly rates via every `"$.../hr"`
- energy rate via `"$.../kWh"`
- idle trigger via `"added after ..."`
- tier window via `"for the first ..."`

## Parse Precedence

The parser uses this order so mixed pricing does not get trapped in a simpler
bucket too early:

1. If text is exactly `Pricing pending`:
   `pricing_structure_type = pending`
2. Else if text contains `time of day`:
   `pricing_structure_type = time_of_day`
3. Else if text is exactly `Free`:
   `pricing_base_type = free`
   `pricing_structure_type = free`
4. Else if text contains `for the first ...` and at least two hourly rates and `thereafter`:
   `pricing_structure_type = tiered_time`
5. Else if text contains `while actively charging` and also `loitering` or `thereafter`:
   `pricing_structure_type = idle_after_charging`
6. Else if text contains `/kWh`:
   `pricing_base_type = energy`
   `pricing_structure_type = simple`
7. Else if text contains `/hr`:
   `pricing_base_type = hourly`
   `pricing_structure_type = simple`
8. Else:
   `unknown`

This is the key fix for rows like energy-plus-idle pricing. Idle language is
checked before the plain `/kWh` and `/hr` cases.

## Interpretation Rules

### Free

Example:

```text
Free
```

Result:

- `pricing_base_type = free`
- `pricing_structure_type = free`
- `base_rate = null`
- `base_unit = null`

### Simple Hourly

Example:

```text
$2.00/hr
```

Result:

- `pricing_base_type = hourly`
- `pricing_structure_type = simple`
- `base_rate = 2.00`
- `base_unit = hr`
- `charging_rate_per_hour = 2.00`

### Simple Energy

Example:

```text
$0.45/kWh
```

Result:

- `pricing_base_type = energy`
- `pricing_structure_type = simple`
- `base_rate = 0.45`
- `base_unit = kwh`
- `energy_rate_per_kwh = 0.45`

### Free Plus Idle

Example:

```text
Free while actively charging $3.00/hr loitering, added after 2 hours
```

Result:

- `pricing_base_type = free`
- `pricing_structure_type = idle_after_charging`
- `has_idle_fee = true`
- `idle_rate = 3.00`
- `idle_unit = hr`
- `idle_trigger_text = 2 hours`

### Energy Plus Idle

Example:

```text
$0.45/kWh while actively charging $15.00/hr thereafter + $0.50 guest fee
```

Result:

- `pricing_base_type = energy`
- `pricing_structure_type = idle_after_charging`
- `base_rate = 0.45`
- `base_unit = kwh`
- `has_idle_fee = true`
- `idle_rate = 15.00`
- `has_guest_fee = true`
- `guest_fee = 0.50`

### Tiered Hourly

Example:

```text
$2.00/hr for the first 2 hours, $5.00/hr thereafter
```

Result:

- `pricing_base_type = hourly`
- `pricing_structure_type = tiered_time`
- `base_rate = 2.00`
- `base_unit = hr`
- `tier_1_rate_per_hour = 2.00`
- `tier_1_max_hours = 2`
- `tier_2_rate_per_hour = 5.00`

## Derived `price_model_type`

`price_model_type` is derived from the normalized fields for reporting and
legacy compatibility.

Current derived values include:

- `pricing_pending`
- `time_of_day`
- `free`
- `free_plus_guest_fee`
- `hourly_simple`
- `hourly_plus_guest_fee`
- `energy_simple`
- `energy_plus_guest_fee`
- `tiered_time`
- `tiered_time_plus_guest_fee`
- `base_plus_idle`
- `base_plus_idle_plus_guest_fee`
- `unknown`

## Revenue Interpretation

Session revenue estimation uses the normalized pricing fields:

- for `hourly`, revenue is `base_rate * billable_charging_hours + idle_revenue + guest_fee + flat_fee`
- for `energy`, revenue is `base_rate * estimated_kwh + idle_revenue + guest_fee + flat_fee`
- for `free`, revenue is `idle_revenue + guest_fee + flat_fee`
- for `tiered_time`, revenue is `tier1 + tier2 + guest_fee + flat_fee`

For `idle_after_charging`, the estimator infers charging completion from the
charger power and the 45 kWh cap:

- `estimated_charge_hours = min(session_hours, 45 / output_kw)`
- `idle_start_hours = estimated_charge_hours + idle_grace_hours`
- `idle_hours = max(0, session_hours - idle_start_hours)`

Hourly-plus-idle pricing uses only the estimated charging segment for the base
hourly charge, then applies idle pricing to the remaining billable idle time so
the estimate does not double count time.

## Known Limits

The current model handles the pricing formats we have seen so far, but it is
not fully generic. It does not yet support:

- multiple energy tiers
- multiple flat or guest modifiers
- fully structured time-of-day pricing
- idle fees charged in a unit other than `/hr`

If SWTCH begins exposing those patterns, the model should be extended rather
than folded back into a larger combined enum.
