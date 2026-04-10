# Edge Polling Rollout

## Required secrets

Create the shared poller secret for the Edge Function runtime:

- `POLLER_SECRET`

Create matching Vault secrets for the SQL scheduler:

- `poll_status_project_url`
- `poll_status_poller_secret`

Example SQL:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'poll_status_project_url');
select vault.create_secret('<same-value-as-poller-secret>', 'poll_status_poller_secret');
```

## Deployment steps

1. Deploy the database migrations.
2. Set the Edge Function secret:

```bash
supabase secrets set POLLER_SECRET=your-shared-secret --project-ref <project-ref>
```

3. Deploy the Edge Function:

```bash
supabase functions deploy poll-status-batch --project-ref <project-ref>
```

4. Manually invoke one shard and confirm a JSON summary returns:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/poll-status-batch" \
  -H "Content-Type: application/json" \
  -H "x-poller-secret: your-shared-secret" \
  -d '{"scope":"toronto","shardIndex":0,"shardCount":5,"batchSize":35,"concurrency":5,"dueAfterMinutes":15}'
```

5. Verify that `cron.job` contains the five `poll-status-batch-toronto-shard-*` schedules.

## Operational checks

- Inspect `public.poll_shard_leases` to confirm each shard updates `last_finished_at` and `last_summary`.
- Inspect `net._http_response` if a cron-triggered request needs debugging.
- Confirm that Toronto chargers converge to roughly `15` minute freshness in `charger_current_status.last_checked_at`.
