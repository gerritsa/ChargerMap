create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists vault;

create or replace function public.invoke_poll_status_batch_shard(
  target_shard_index integer
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  function_base_url text;
  poller_secret text;
  request_id bigint;
begin
  select decrypted_secret
  into function_base_url
  from vault.decrypted_secrets
  where name = 'poll_status_project_url';

  select decrypted_secret
  into poller_secret
  from vault.decrypted_secrets
  where name = 'poll_status_poller_secret';

  if function_base_url is null then
    raise exception 'Vault secret poll_status_project_url is required before scheduling the poller.';
  end if;

  if poller_secret is null then
    raise exception 'Vault secret poll_status_poller_secret is required before scheduling the poller.';
  end if;

  select net.http_post(
    url := function_base_url || '/functions/v1/poll-status-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-poller-secret', poller_secret
    ),
    body := jsonb_build_object(
      'scope', 'toronto',
      'shardIndex', target_shard_index,
      'shardCount', 5,
      'batchSize', 35,
      'concurrency', 5,
      'dueAfterMinutes', 15
    )
  )
  into request_id;

  return request_id;
end;
$$;

do $$
declare
  existing_job_id bigint;
  shard_index integer;
  job_name text;
begin
  for shard_index in 0..4 loop
    job_name := format('poll-status-batch-toronto-shard-%s', shard_index);

    select jobid
    into existing_job_id
    from cron.job
    where jobname = job_name;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    perform cron.schedule(
      job_name,
      '* * * * *',
      format(
        'select public.invoke_poll_status_batch_shard(%s);',
        shard_index
      )
    );
  end loop;
end;
$$;
