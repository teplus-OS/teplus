-- ============================================================================
-- Teplus v1.1.0 — company coverage schedule
-- ============================================================================
-- Runs the coverage collector edge function every 15 minutes from inside your
-- own Supabase project. Nothing runs on Teplus infrastructure. Fill in the
-- two placeholders below, then run this whole file once in the SQL editor.
--
-- Before running this: `supabase secrets set COVERAGE_SECRET=<a random string>`
-- and `supabase functions deploy coverage --no-verify-jwt`.
--
-- Placeholders to replace:
--   <PROJECT_REF>       your project ref, e.g. abcdefghijklmnop
--   <COVERAGE_SECRET>   the same random string you set with `supabase secrets set`
-- ============================================================================

-- Turn on the extensions the schedule needs.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the function URL in Vault so it isn't sitting in plain text in cron.job.
select vault.create_secret('https://<PROJECT_REF>.supabase.co/functions/v1/coverage', 'coverage_url');

-- Store the shared secret in Vault the same way; this is what proves a
-- request to the coverage function came from your own project's cron.
select vault.create_secret('<COVERAGE_SECRET>', 'coverage_secret');

-- Schedule the collector to run every 15 minutes.
select cron.schedule('teplus-coverage', '*/15 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'coverage_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-coverage-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'coverage_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000
  );
$$);

-- ───────────────────────── keep-alive (free plan) ─────────────────────────
-- Free Supabase projects pause after 7 days without a database request. The
-- coverage job above already writes a heartbeat every 15 minutes, even when
-- coverage is switched off in Settings. This second job is a plain database
-- write with no function call in the path, so the project stays awake even if
-- the edge function is ever undeployed or broken. It runs every Monday 09:00 UTC.
select cron.schedule('teplus-keepalive', '0 9 * * 1', $$
  update public.app_settings set keepalive_at = now();
$$);

-- If something breaks (how to tell and how to fix):
--   * "keepalive_at" never changes and the project still pauses → pg_cron is not
--     running; check Database → Extensions → pg_cron is enabled and re-run the
--     two cron.schedule lines in this file.
--   * The coverage job errors but keep-alive works → the function or its secret
--     is the problem; see supabase/functions/coverage/README.md.
--   * To remove both jobs: select cron.unschedule('teplus-coverage');
--                          select cron.unschedule('teplus-keepalive');
--   * To see what cron did: select * from cron.job_run_details order by start_time desc limit 20;

-- ───────────────────────── off switch ─────────────────────────
-- Run this line by itself whenever you want to stop the schedule; it leaves
-- the Vault secrets and the function deployed, it just stops the cron job.

-- select cron.unschedule('teplus-coverage');
-- select cron.unschedule('teplus-keepalive');   -- only if you also want the project to be allowed to pause

-- ───────────────────────── run it now (smoke test) ─────────────────────────
-- Run this line by itself to fire the collector immediately instead of
-- waiting for the next 15-minute tick, right after setup or after a change.

-- select net.http_post(
--   url := (select decrypted_secret from vault.decrypted_secrets where name = 'coverage_url'),
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'x-coverage-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'coverage_secret')
--   ),
--   body := '{}'::jsonb,
--   timeout_milliseconds := 140000
-- );
