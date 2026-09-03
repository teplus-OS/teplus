-- ============================================================================
-- Teplus v1.1.0 — companies coverage migration
-- ============================================================================
-- Brings a v1.0 install up to the v1.1 schema. Every statement is safe to run
-- more than once (idempotent) and safe to run against a fresh v1.1 install
-- that already matches schema.sql — it just finds nothing to do. Run this in
-- the Supabase SQL editor, in full, after backing up if you're cautious.
-- ============================================================================

-- ───────────── tracked_companies: drop the score, add coverage fields ─────

-- Drop the capital score and tiering columns; scoring lives in the paid engine now.
alter table public.tracked_companies drop column if exists capital_score;
alter table public.tracked_companies drop column if exists score_state;
alter table public.tracked_companies drop column if exists score_delta_7d;
alter table public.tracked_companies drop column if exists coverage_tier;

-- st_id becomes optional: only an external sync sets it now, user-added companies leave it null.
alter table public.tracked_companies alter column st_id drop not null;

-- New user-writable and collector-written fields.
alter table public.tracked_companies add column if not exists notes text;
alter table public.tracked_companies add column if not exists added_by text not null default 'user';
-- Guard the added_by check constraint so re-running this migration doesn't error.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tracked_companies_added_by_check'
  ) then
    alter table public.tracked_companies
      add constraint tracked_companies_added_by_check check (added_by in ('user','sync'));
  end if;
end $$;
alter table public.tracked_companies add column if not exists cik text;
alter table public.tracked_companies add column if not exists ats jsonb;
alter table public.tracked_companies add column if not exists dns_snapshot jsonb;
alter table public.tracked_companies add column if not exists ir_seen_at timestamptz;
alter table public.tracked_companies add column if not exists checked_at timestamptz;
alter table public.tracked_companies add column if not exists why_now text;
alter table public.tracked_companies add column if not exists reach_out_until timestamptz;

-- The old unique index on (user_id, st_id) rejected the nulls a user-added
-- company now has for st_id; replace it with a partial index.
drop index if exists tracked_companies_st_unique;
create unique index if not exists tracked_companies_st_unique
  on public.tracked_companies (user_id, st_id) where st_id is not null;

-- Batch selection index: oldest checked_at first, nulls (never checked) first.
create index if not exists tracked_companies_batch_idx
  on public.tracked_companies (user_id, status, checked_at nulls first);

-- ───────────── company_events: subtype + created_at ─────

alter table public.company_events add column if not exists subtype text;
alter table public.company_events add column if not exists created_at timestamptz not null default now();

-- ───────────── app_settings: coverage switches ─────

alter table public.app_settings add column if not exists coverage_enabled boolean not null default false;
alter table public.app_settings add column if not exists coverage_contact_email text;
alter table public.app_settings add column if not exists coverage_batch integer not null default 8;
alter table public.app_settings add column if not exists coverage_last_run_at timestamptz,
  add column if not exists keepalive_at timestamptz;

-- ───────────── coverage_runs: new table, log of collector invocations ─────

create table if not exists public.coverage_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  ran_at timestamptz not null default now(),
  companies integer not null default 0,
  events integer not null default 0,
  ms integer,
  errors jsonb not null default '[]'
);

alter table public.coverage_runs enable row level security;

-- Guard the policy the same way: create it only if it doesn't already exist.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'coverage_runs' and policyname = 'coverage_runs_owner_read'
  ) then
    create policy coverage_runs_owner_read on public.coverage_runs
      for select using (user_id = auth.uid());
  end if;
end $$;

-- The anon revoke block in schema.sql runs against "all tables in schema
-- public" at install time, so a table created after that ran (this one, on an
-- existing install) needs the same revoke + grant applied explicitly here.
revoke all on public.coverage_runs from anon;
grant select, insert, update, delete on public.coverage_runs to authenticated, service_role;
grant usage, select on sequence public.coverage_runs_id_seq to authenticated, service_role;
