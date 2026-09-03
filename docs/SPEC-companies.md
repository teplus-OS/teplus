# SPEC — Companies coverage in the free build (Teplus v1.1.0)

Written 2026-09-03. Scope agreed with Ricky the same night. This is the contract
for the build; the app, the collector, the schema and the docs must all agree
with it. Anything not in here is out of scope for v1.1.

## 0. Why

Teplus v1.0 shipped the Companies tab as a read only mirror of a private signal
engine. A self hoster had no way to add a company and no data ever arrived. v1.1
makes the tab a real feature: the user adds companies, a small collector running
inside their own Supabase project pulls public signals on a schedule, and the tab
shows updates, people you know there, and a reach out flag with a plain "why
now". There is no capital score anywhere in Teplus. Scoring, sequence detection,
paid data sources and outreach drafts stay in the engine (the paid layer).

## 1. Verified platform limits (2026-09-03)

- Supabase edge functions, free plan: 150 s wall clock per invocation, 2 s CPU,
  256 MB. 500k invocations/month. Up to 2 active free projects.
- Free projects pause after 7 days with no database request. A scheduled job
  that touches the database counts as activity, but the docs still tell users to
  open Teplus at least weekly.
- pg_cron and pg_net are available as extensions; the schedule lives in the
  user's own project. Nothing runs on Teplus infrastructure.
- SEC EDGAR: max 10 requests/second, must send `User-Agent: <name> <email>`
  and `Accept-Encoding: gzip, deflate`. We send at most ~3 requests/second.

Design consequence: the collector works in batches. Each run handles
`COVERAGE_BATCH` companies (default 8), oldest `checked_at` first, and the cron
fires every 15 minutes. That is up to ~750 company checks per day, so 200
companies refresh roughly every 6 hours and 500 roughly every 16 hours. Docs
say "keep it to a few hundred companies on the free plan".

## 2. Schema (supabase/schema.sql)

### tracked_companies — becomes user writable
Remove: `capital_score`, `score_state`, `score_delta_7d`, `coverage_tier`.
Make `st_id` nullable (only an external sync sets it; keep the unique index
partial: `where st_id is not null`).
Add:
- `notes text`
- `added_by text not null default 'user' check (added_by in ('user','sync'))`
- `cik text` — EDGAR CIK once resolved (nullable)
- `ats jsonb` — discovered job board, e.g. {"vendor":"greenhouse","slug":"acme"}; null until probed; {"vendor":"none"} once probed with no hit
- `dns_snapshot jsonb` — last seen MX/NS records
- `ir_seen_at timestamptz` — first time an investors page was found
- `checked_at timestamptz` — last collector visit (null = never)
- `why_now text` — plain sentence for the reach out flag, null when not flagged
- `reach_out_until timestamptz` — when the current flag expires
Keep: `id, user_id, name, domain, sector, stage, hq_location, reach_out,
last_fundraise_date, last_fundraise_round, last_fundraise_amount_usd,
last_signal_at, synced_at, status`.
`synced_at` keeps its default now(); the app shows it as "added" when added_by
is 'user'.
Index: `(user_id, status, checked_at nulls first)` for batch selection.

### company_events
Add `subtype text` (see §5 for values). Keep `event_type` check list.
Keep the unique index on `(user_id, source, external_id)`; the collector always
sets `external_id` (accession number, job id, URL hash, or "ir:<domain>").
Add `created_at timestamptz not null default now()` if missing (it uses
detected_at today; keep detected_at, no new column needed).

### app_settings — coverage switches (one row per user)
Add:
- `coverage_enabled boolean not null default false`
- `coverage_contact_email text` — goes into the EDGAR User-Agent
- `coverage_batch integer not null default 8`
- `coverage_last_run_at timestamptz`

### coverage_runs — small log for smoke tests and support
```
create table public.coverage_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  ran_at timestamptz not null default now(),
  companies integer not null default 0,
  events integer not null default 0,
  ms integer,
  errors jsonb not null default '[]'
);
```
RLS owner policy like the others (read only for authenticated is enough:
`for select using (user_id = auth.uid())`). The collector writes with the
service role. Keep the last 200 rows (collector deletes older ones).

### RLS and grants
Unchanged model. Owner policies on the new table; anon revoke block stays at the
end and still covers everything. Everything the collector writes goes through
the service role inside the project.

### One migration file for existing installs
`supabase/migrations/2026-09-03-companies-coverage.sql` with the `alter table`
statements so a v1.0 install can move to v1.1 without a reset. schema.sql stays
the fresh install source of truth.

## 3. App (app/index.html)

Version: `APP_VERSION = 'v1.1.0'`.

### 3.1 Remove the score everywhere
- Companies column header "Capital score" and its cell.
- Sort dropdown option "Capital score"; new default sort is "Recent signal".
- `scorePill`, `TC_SORT_VALUES.score`, `score_delta_7d` delta rendering, the
  detail panel "Capital score" line, and the "score" references in the stat
  strip. No dead code left behind.
- Demo data: drop the score/state/delta positional args from `tc(...)`.

### 3.2 Companies tab states
1. **Coverage off** (`app_settings.coverage_enabled` false, live mode):
   the tab is visible; the body shows one empty state:
   Title: "Company coverage isn't on yet"
   Body: "Ask your AI: turn on company coverage for my Teplus. It runs inside
   your own database and pulls public signals for the companies you add.
   Instructions: github.com/teplus-OS/teplus"
   The add company control still works in this state (companies can be added
   before coverage is on; they just show no signals).
2. **Coverage on, zero companies**:
   Title: "Add the companies you cover"
   Body: "Paste a list into your AI, or give it a few parameters and let it
   build one. Or add one here."  With an inline "+ Add company" button.
3. **Companies present**: the table.
Demo mode behaves as state 3 with coverage on.

### 3.3 Add / edit / archive a company
- Topbar "+ Add ▾" gains a third item: Company. Cmd+K gains "Add company".
- Add form (same modal style as Add firm): name (required), domain (required,
  normalized: strip protocol, www., trailing slash, lowercase), sector, stage
  (select: Seed, Series A, Series B, Series C+, Growth, Public, Other),
  HQ location, notes. Insert with `added_by = 'user'`, `status = 'active'`.
  Duplicate domain for the same user → toast "Already tracking <name>".
- Expanded row: inline edit of name, domain, sector, stage, HQ, notes (same
  pattern as the Firms inline edits), plus Archive (status → exited) / Restore.
- Expanded row detail panel keeps: fundraise line, last signal, reach out +
  why now, "People you know here" (existing domain/org match), latest events
  (existing company_events list), and "added <rel>" or "synced <rel>".

### 3.4 Columns and sort
Columns: expander, Name (+domain), Sector, Reach out, Last signal, Fundraise.
Sorts: Recent signal (default), Name A–Z, Reach out first, Recent fundraise.
Stat strip: "<n> tracked · <m> reach out · last check <rel>" where last check
comes from `app_settings.coverage_last_run_at` (hidden in demo mode → "demo").

### 3.5 Reach out and why now
Both come from the database columns (`reach_out`, `why_now`, `reach_out_until`)
written by the collector. The app does NOT recompute them; it renders:
- Reach out column: pill "Reach out" when `reach_out` is true and
  `reach_out_until > now()`; title attribute = `why_now`.
- Detail panel: "Why now: <why_now>".
- Home reach out queue keeps using `reach_out` as today.
Demo data carries why_now strings.

### 3.6 Home news column
Copy "Feed fills as collectors run." becomes:
- coverage off: "Turn on company coverage to see updates here."
- coverage on, nothing yet: "No updates yet. The first check runs within 15
  minutes of adding a company."
Everything else unchanged.

### 3.7 Settings
Settings gets a small "Company coverage" block: status (On/Off), contact
email field (`coverage_contact_email`, required before enabling; explains it is
sent to the SEC as required by their fair access policy), batch size (default
8, min 2, max 20), "Last run <rel>", and a link to the README section. The
toggle writes `coverage_enabled`. The schedule itself is created by the SQL
step at setup, so the toggle is the only runtime switch.

### 3.8 Demo data (dummy data for the docs)
10 companies, realistic but fictional (keep the existing names: Kestrel Data,
Northwind Labs, Meridian Capital, Sable Energy, Larkspur Bio, Halcyon Robotics,
Bluebird Studio, Orchard Freight, plus two more), each with sector, stage, HQ,
1 to 4 events across types (fundraise from a Form D, finance hiring, leadership
news, partner news, 8-K filing, IR page, MX change), 3 of them flagged reach out
with why_now like "Filed a Form D 6 days ago", "Hiring a VP Finance",
"New CFO announced 12 days ago". Fundraise column populated for 5. Dates
relative to now so the demo never goes stale.

### 3.9 Verification (must pass before commit)
- `node --check` on the inline script (extract and check).
- Playwright, demo mode: all four tabs render, add company modal opens, zero
  page errors, no "score" string in the Companies DOM.
- Playwright, live empty: serve with a config present but a stubbed Supabase
  that returns empty tables and `coverage_enabled=false` → state 1 renders.
  (Stub by intercepting network requests to *.supabase.co and returning `[]`,
  and app_settings returning coverage_enabled=false.)

## 4. Collector (supabase/functions/coverage/index.ts)

Deno edge function, no npm deps beyond `@supabase/supabase-js` via esm.sh.
Auth: deployed with `--no-verify-jwt`; the request must carry header
`x-coverage-secret` equal to env `COVERAGE_SECRET`, else 401. Env:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (both injected automatically),
`COVERAGE_SECRET`.

Run:
1. Read `app_settings` (single row; if several users exist, loop per user).
   Skip if `coverage_enabled` is false. Require `coverage_contact_email`.
2. Select batch: active companies for that user, `order by checked_at nulls
   first, checked_at asc limit coverage_batch`.
3. For each company, run the sources below inside try/catch each; collect
   events; write; update the company row; `checked_at = now()`.
4. Compute reach out / why now (§5) from the company's events in the DB.
5. Insert a `coverage_runs` row; update `coverage_last_run_at`; delete
   coverage_runs older than the newest 200.
6. Stop early if elapsed > 110 s (leave headroom under 150).
All fetches: 8 s timeout, `User-Agent: Teplus/1.1 (<contact_email>)`.
EDGAR requests: `User-Agent: Teplus <contact_email>` exactly per SEC policy,
`Accept-Encoding: gzip, deflate`, minimum 350 ms between EDGAR requests.

Sources (subtype in brackets → event_type):
A. **EDGAR full text search** `https://efts.sec.gov/LATEST/search-index?q="<name>"&forms=D,D/A,8-K,S-1,S-1/A&dateRange=custom&startdt=<since>&enddt=<today>`
   where since = checked_at − 1 day, or today − 90 days on first run. Match a
   hit when a display name contains the company name (case insensitive, after
   stripping Inc/LLC/Corp/Ltd punctuation). Store the CIK on first match.
   - D, D/A → fundraise [form_d]. Fetch
     `https://www.sec.gov/Archives/edgar/data/<cik>/<adsh_nodash>/primary_doc.xml`,
     read totalAmountSold and totalOfferingAmount; set
     last_fundraise_date/amount when newer than the stored one; round text
     "Form D".
   - 8-K → filing; subtype from items: 5.02 [8_k_leadership_change],
     1.01 [8_k_material_contract], 2.01 [8_k_acquisition], 3.02
     [8_k_financing], 1.03 [8_k_bankruptcy], 4.02 [8_k_restatement], 2.02
     [8_k_results], else [8_k_other]. Title "8-K: <items in words>".
   - S-1, S-1/A → filing [s_1]. Title "Filed an S-1".
   external_id = accession number. source = "edgar". url = the filing index.
B. **Investors page** — GET `https://<domain>/investors`,
   `/investor-relations`, `/investors/`, `https://ir.<domain>/` (first 200 with
   "investor" in the body wins, cap 200 KB read). If found and `ir_seen_at` is
   null → set it and emit filing [ir_page_live] "Investors page is live",
   external_id "ir:<domain>". Probe at most once per 7 days per company.
C. **Job boards** — if `ats` is null, probe slugs [domain label, name
   lowercased without spaces/punctuation] against Greenhouse
   `https://boards-api.greenhouse.io/v1/boards/<slug>/jobs`, Lever
   `https://api.lever.co/v0/postings/<slug>?mode=json`, Ashby
   `https://api.ashbyhq.com/posting-api/job-board/<slug>`; store the first hit
   or {"vendor":"none"}. Re-probe "none" every 30 days. With a board: list
   jobs, keep ones first seen since last check (dedupe by job id in
   external_id), classify titles:
   - finance/IR: /\b(chief financial|cfo|vp,? finance|head of finance|
     finance director|controller|investor relations|head of ir|treasurer|
     fp&a)\b/i → hire [finance_hiring]
   - ERP: /\b(netsuite|workday|sap|oracle erp|erp)\b/i → hire [erp_hiring]
   - senior: /\b(chief|vp|vice president|head of|general counsel)\b/i → hire
     [senior_hiring]
   - everything else: counted, not emitted (title "N other roles posted" is
     NOT an event; keep noise down).
   source = "<vendor>", url = job url.
D. **News RSS** — `https://news.google.com/rss/search?q="<name>"+when:30d&hl=en-US&gl=US&ceid=US:en`
   (on later runs `when:7d`). Keep an item only if the title contains the
   company name (case insensitive) OR the link host ends with the company
   domain. Subtype by title:
   - /\b(appoints|names|hires|taps|joins .* as|promot)\w*\b/i and
     /\b(ceo|cfo|coo|cto|cro|chief|president|vp|head of)\b/i → news
     [senior_arrival]
   - /\b(steps down|departs|resigns|exits|leaves)\b/i with a title word →
     news [exec_departure]
   - /\b(raises|raised|closes|secures)\b.*\b(\$|million|billion|series
     [a-e]|seed)\b/i → fundraise [news_fundraise]; parse round letter and
     amount when obvious; set last_fundraise_* when newer.
   - /\b(partners with|partnership|teams up|selects|chooses)\b/i → news
     [partner_pr]
   - /\b(launches|unveils|introduces|releases)\b/i → product [product_launch]
   - else → news [news]
   external_id = sha1(link). source = "news". summary = source publisher.
E. **DNS** — `https://dns.google/resolve?name=<domain>&type=MX` and `type=NS`.
   Compare sorted records with `dns_snapshot`; on first run just store. On
   change → other [mx_change] "Mail provider changed" or [ns_change] "DNS
   provider changed". Probe at most once per 7 days.

Writes: batch upsert into company_events with `on conflict (user_id, source,
external_id) do nothing`; then update tracked_companies (cik, ats,
dns_snapshot, ir_seen_at, last_signal_at = max(occurred_at) across its events,
fundraise fields, checked_at, reach_out, why_now, reach_out_until).

## 5. Reach out rule and why now (single source of truth)

Evaluate against the company's events, newest first. Windows from occurred_at
(fallback detected_at). First matching line wins and provides why_now.

| Trigger (subtype) | Window | why_now text |
|---|---|---|
| form_d, s_1, 8_k_financing, news_fundraise | 30 days | "Filed a Form D <age>" / "Filed an S-1 <age>" / "Financing 8-K <age>" / "Raised money <age>" |
| 8_k_leadership_change, senior_arrival, exec_departure | 45 days | "New <role> announced <age>" / "<Role> departed <age>" (role from the title when parseable, else "leadership change") |
| ir_page_live | 60 days | "Investors page went live <age>" |
| finance_hiring, erp_hiring | 60 days | "Hiring a <title> <age>" / "Hiring for an ERP migration <age>" |

`age` = "today", "yesterday", "<n> days ago". `reach_out_until` = event date +
window. No trigger → reach_out false, why_now null, reach_out_until null.
The same table is reproduced in the README so users can see what flags mean.

## 6. Schedule (supabase/coverage-schedule.sql)

```
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- one time: store the function URL and the shared secret in Vault
select vault.create_secret('<https://PROJECT.supabase.co/functions/v1/coverage>', 'coverage_url');
select vault.create_secret('<COVERAGE_SECRET>', 'coverage_secret');
select cron.schedule('teplus-coverage', '*/15 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'coverage_url'),
    headers := jsonb_build_object('Content-Type','application/json',
                 'x-coverage-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'coverage_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 140000);
$$);
```
Plus `select cron.unschedule('teplus-coverage');` documented as the off switch,
and a "run it now" line using the same http_post for the smoke test.
The AI doing setup: `supabase secrets set COVERAGE_SECRET=<random>`;
`supabase functions deploy coverage --no-verify-jwt`; run the SQL with the two
placeholders filled; set contact email + toggle in Settings.

## 7. Docs (what each must say, shortly)

Tone: short sentences, no parentheticals, plain words. "About an hour, 20
minutes of it is you" for the base setup; data work times on their own pages.
Order everywhere: Deploy → Your people → Your companies → Living with it.

- **README.md**: what it is (3 lines); deploy with AI (prompt); manual setup
  (Supabase → schema → auth user → config → Vercel → sign in); Your people
  (two ways: spreadsheet, LinkedIn export); Your companies (turn on coverage,
  two ways to build the list, what it pulls, the reach out table from §5,
  limits: few hundred companies, open weekly, EDGAR needs your email); It's
  yours (change it with a prompt; send good changes to r@agran.co); Data and
  privacy; What it is not (no hosted version, no telemetry, no score).
- **Setup guide** (4 pages): 1 Deploy, 2 Your people, 3 Your companies,
  4 Living with it. Page 3 has the "turn on coverage" sentence for the deploy
  prompt, the two list building prompts, and the reach out table condensed.
- **Product tour** (4 pages): Companies page rewritten: updates, people you
  know here, reach out + why now, what it pulls, no score. New screenshot from
  the v1.1 demo.
- **WHAT-GETS-SET-UP.md**: add coverage function, Vault secrets, cron job,
  Settings toggle as optional pieces with one liners.
- **STRIP-CHECKLIST.md**: open core line: free = relationship OS + public
  signal collector; engine = score, sequences, paid sources, drafts.

## 8. Out of scope for v1.1
Podcasts, page diffs, certificate logs, EDGAR mentions, WARN, UCC, visa
filings, trademarks, any paid API, any LLM call, capital score, hosted anything.
