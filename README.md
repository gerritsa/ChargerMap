# Ev network Map

Map-first public charger explorer for specific EV charging network, with a path toward
session analytics, occupancy tracking, and estimated revenue.

## Stack

- Next.js 16
- TypeScript
- Tailwind CSS 4
- Supabase
- MapLibre

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app will:

- use Supabase if the public env vars are present and the tables exist
- fall back to mock charger data otherwise

## Environment Variables

Copy `.env.example` to `.env.local` and fill in values as needed.

Required for the public app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

Required later for scraper upserts and scheduled writes:

- `SUPABASE_SERVICE_ROLE_KEY`

## Database Setup

Apply the SQL in:

- `supabase/migrations/202604080945_init.sql`

That migration creates:

- `chargers`
- `charger_current_status`
- `charger_status_events`
- `charger_sessions`

For pricing parsing and normalized pricing fields, see:

- `docs/pricing-model.md`

## Scraper Foundation

Run a single listing scrape:

```bash
npm run scrape:listing -- 1
```

This currently:

- fetches dedicated EV charging network listing page
- parses visible charger fields
- extracts the Google Maps query URL
- geocodes the derived address with Nominatim
- prints structured JSON

Run a bounded discovery pass:

```bash
npm run scrape:range -- 1 100
```

This will:

- scan listings `1..100`
- keep a conservative pause between requests
- identify parseable vs missing/decommissioned listings
- geocode found addresses
- print a JSON summary for review

When you are ready to write into Supabase:

```bash
npm run scrape:range -- 1 100 --write
```

For `--write`, add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` first.

To tag live Toronto coverage after a scrape:

```bash
npm run scope:toronto
```

## Recommended Free Scheduling

For the recurring 10-minute Toronto poller, the current recommendation is:

- GitHub Actions

Reason:

- free to start
- not tied to your local machine
- easy to pair with a public GitHub repo and Vercel deployment

## Next Build Steps

1. Create the Supabase tables from the migration
2. Add the service role key locally
3. Build the discovery scraper for `listings/1..n`
4. Tag Toronto chargers after discovery with `npm run scope:toronto`
5. Run the 5-shard Toronto status poller every 10 minutes
6. Wire dashboard analytics on top of session and event data

For local shard testing, you can run a single shard directly:

```bash
npm run poll:status -- --shard-count 5 --shard-index 0
```
