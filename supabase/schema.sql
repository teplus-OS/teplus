-- ============================================================================
-- Teplus — consolidated schema (fresh install)
-- ============================================================================
-- Run this ONCE, in full, in your Supabase project's SQL editor before opening
-- the app. It creates every table, index, trigger, and view — AND the Row
-- Level Security policies and grants that make it safe to ship the publishable
-- (anon) key in the browser. Do not run it partially.
--
-- Security model, in one paragraph: every row in every table belongs to the
-- signed-in user (user_id = auth.uid(), enforced by RLS on read AND write).
-- The anon role holds no data grants at all, so even a table accidentally
-- created later without RLS is not reachable with the public key. The
-- people_warmth view runs with security_invoker so it cannot bypass RLS.
-- Passwords live in Supabase Auth, never in these tables.
--
-- After running this, in the Supabase dashboard:
--   1. Authentication → disable public signups (each deployment is personal).
--   2. Authentication → enable leaked password protection.
-- ============================================================================

-- ───────────────────────── core tables ─────────────────────────

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  kind text not null default 'company' check (kind in ('company','fund','bank','other')),
  domain text,
  notes text,
  created_at timestamptz not null default now(),
  -- org tiering: tier is your manual call; is_target flags the target-fund
  -- universe; tier_suggested/_note carry an accept-or-veto triage proposal.
  tier integer check (tier is null or tier in (1, 2, 3)),
  is_target boolean not null default false,
  tier_suggested integer check (tier_suggested is null or tier_suggested in (1, 2, 3)),
  tier_suggestion_note text
);

create table public.target_funds (
  -- The universe of firms you want coverage relationships at. Optional:
  -- leave empty and the target features simply stay quiet.
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  category text,
  fund_type text,
  stage_size text,
  focus text,
  created_at timestamptz not null default now()
);

alter table public.organizations
  add column target_fund_id uuid references public.target_funds(id) on delete set null;

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  full_name text not null,
  email text,
  phone text,
  linkedin_url text,
  title text,
  org_id uuid references public.organizations(id) on delete set null,
  location text,
  -- sphere drives the Work / Personal mode toggle. 'both' shows in either mode.
  sphere text not null default 'work' check (sphere in ('work','personal','both')),
  tags text[] not null default '{}',
  notes text,
  -- Target contact frequency in days; feeds the warmth calculation.
  touch_cadence_days integer not null default 90 check (touch_cadence_days > 0),
  last_touch_at timestamptz,
  created_at timestamptz not null default now(),
  -- from a LinkedIn connections export, if you import one
  connected_on date,
  -- broad bucket for filtering (investor | banker | founder | tech | ...).
  -- Text, not enum, so buckets can evolve without migrations. Null = unclassified.
  category text,
  -- importance buckets: key (tight cadence), standard, annual
  importance text not null default 'standard' check (importance in ('key','standard','annual')),
  -- true when touch_cadence_days was hand-tuned, so recalculation leaves it alone
  cadence_set_manually boolean not null default false,
  -- archive instead of delete: retire contacts without losing touch history
  archived boolean not null default false,
  archived_at timestamptz,
  archive_reason text,
  -- "not this week" snooze on the reach-out queue
  snoozed_until timestamptz
);

create table public.touches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  person_id uuid not null references public.people(id) on delete cascade,
  channel text not null default 'other' check (channel in ('email','call','text','meeting','social','intro','other')),
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  occurred_at timestamptz not null default now(),
  summary text,
  next_step text,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text not null,
  details text,
  sphere text not null default 'work' check (sphere in ('work','personal')),
  -- The three to-do buckets: due today, this week, this month.
  priority text not null default 'week' check (priority in ('day','week','month')),
  status text not null default 'open' check (status in ('open','done','snoozed')),
  person_id uuid references public.people(id) on delete set null,
  org_id uuid references public.organizations(id) on delete set null,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  category text not null default 'work' check (category in ('work','personal'))
);

create table public.app_settings (
  -- One row per user: Home-tab weather location and (optional) calendar ICS URL.
  user_id uuid primary key default auth.uid(),
  weather_lat double precision not null default 40.7128,
  weather_lon double precision not null default -74.0060,
  weather_label text not null default 'New York, NY',
  -- Secret calendar ICS address. Only readable by the owner (RLS) and by the
  -- calendar-feed edge function (service role). Optional feature.
  ics_url text,
  updated_at timestamptz not null default now()
);

-- ───────────── companies / events (signal-fed, optional) ─────────────
-- These two tables power the Companies tab and the Home live feed. Teplus
-- ships no collector: they stay empty unless you populate them yourself
-- (any process writing rows with your user_id works). The app degrades
-- gracefully while they are empty.

create table public.tracked_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  st_id uuid not null,               -- stable external id for your own sync's dedupe
  name text not null,
  domain text,
  sector text,
  stage text,
  hq_location text,
  coverage_tier text,
  capital_score numeric,
  score_state text,
  reach_out boolean default false,
  score_delta_7d numeric,
  last_fundraise_date date,
  last_fundraise_round text,
  last_fundraise_amount_usd numeric,
  last_signal_at timestamptz,
  synced_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','exited'))
);

create table public.company_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tracked_company_id uuid references public.tracked_companies(id) on delete cascade,
  company_name text not null,
  event_type text not null default 'other' check (event_type in ('hire','fundraise','filing','news','product','mention','other')),
  title text not null,
  summary text,
  source text,
  source_url text,
  occurred_at timestamptz,
  detected_at timestamptz not null default now(),
  external_id text
);

-- ───────────────────────── indexes ─────────────────────────

create index people_user_idx on public.people (user_id);
create index people_org_idx on public.people (org_id);
create index people_category_idx on public.people (category);
create index people_importance_idx on public.people (importance);
create index people_archived_idx on public.people (archived) where archived;
-- Imports dedupe on linkedin_url per user.
create unique index people_linkedin_unique
  on public.people (user_id, linkedin_url) where linkedin_url is not null;

create index touches_person_idx on public.touches (person_id, occurred_at desc);
create index tasks_user_open_idx on public.tasks (user_id, status, priority);

create index organizations_target_idx on public.organizations (target_fund_id) where target_fund_id is not null;
create index organizations_tier_idx on public.organizations (tier) where tier is not null;
create index organizations_suggested_idx on public.organizations (tier_suggested) where tier_suggested is not null;

create unique index tracked_companies_st_unique on public.tracked_companies (user_id, st_id);
-- Dedupe on (user, source, external_id) so repeat syncs don't double-insert.
create unique index company_events_source_unique on public.company_events (user_id, source, external_id);
create index company_events_company_idx on public.company_events (tracked_company_id);
create index company_events_feed_idx on public.company_events (user_id, occurred_at desc);

-- ───────────────────────── trigger ─────────────────────────

-- Keep people.last_touch_at current without client bookkeeping.
create or replace function public.on_touch_update_last_touch()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update public.people p
  set last_touch_at = greatest(coalesce(p.last_touch_at, 'epoch'::timestamptz), new.occurred_at)
  where p.id = new.person_id;
  return new;
end $$;

-- security definer functions must not be callable by clients directly
revoke execute on function public.on_touch_update_last_touch() from public, anon, authenticated;

create trigger touches_update_last_touch
after insert on public.touches
for each row execute function public.on_touch_update_last_touch();

-- ───────────────────────── warmth view ─────────────────────────

-- Warmth: 100 right after a touch, decaying linearly to 0 at touch_cadence_days.
-- security_invoker is REQUIRED: without it the view runs as its owner and
-- bypasses RLS. Never recreate this view without the flag.
create view public.people_warmth
with (security_invoker = true) as
select
  p.*,
  o.name as org_name,
  o.kind as org_kind,
  o.target_fund_id as org_target_fund_id,
  greatest(0, least(100, round(
    100 * (1 - extract(epoch from (now() - coalesce(p.last_touch_at, p.created_at)))
              / (p.touch_cadence_days * 86400.0))
  )))::int as warmth
from public.people p
left join public.organizations o on o.id = p.org_id;

-- ───────────────────────── RLS: every row belongs to the signed-in user ─────

alter table public.organizations enable row level security;
alter table public.target_funds enable row level security;
alter table public.people enable row level security;
alter table public.touches enable row level security;
alter table public.tasks enable row level security;
alter table public.app_settings enable row level security;
alter table public.tracked_companies enable row level security;
alter table public.company_events enable row level security;

create policy org_owner on public.organizations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy target_funds_owner on public.target_funds for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy people_owner on public.people for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy touches_owner on public.touches for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tasks_owner on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy settings_owner on public.app_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tracked_owner on public.tracked_companies for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy company_events_owner on public.company_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── grants: defense in depth ─────────────────────────
-- Strip ALL data grants from anon (stricter than the Supabase default). RLS is
-- the real gate for authenticated users; this makes the public key inert even
-- against future mistakes (a new table with no RLS, a 'true' policy, etc).

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant select on public.people_warmth to authenticated, service_role;
