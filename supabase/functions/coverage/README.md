# coverage

The Teplus company coverage collector. A scheduled edge function that runs
inside your own Supabase project, pulls public signals for the companies you
track, and writes them back as `company_events`. It also decides the reach
out flag and the plain "why now" sentence shown in the app. Nothing runs on
Teplus infrastructure, and there is no capital score — that stays in the
paid engine.

Each run reads every user's `app_settings` row, skips anyone with coverage
off, and works through their oldest-checked companies first (`coverage_batch`
at a time, default 8). Sources: SEC EDGAR full text search (Form D/D-A, 8-K,
S-1), a probe for a live investors page, job board postings (Greenhouse,
Lever, Ashby), Google News RSS, and DNS (MX/NS) changes. See
`docs/SPEC-companies.md` §4 for the exact rules per source, and `rules.ts` /
`rules_test.ts` for the classifiers as testable, pure functions.

## Env vars

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — injected automatically by the
  platform, no action needed.
- `COVERAGE_SECRET` — a random string you choose. The function checks it
  against the `x-coverage-secret` request header and returns 401 without it.
  This is what stops anyone but your own project's cron job (or you, by hand)
  from triggering a run.

## Deploy

```
supabase secrets set COVERAGE_SECRET=<a random string>
supabase functions deploy coverage --no-verify-jwt
```

`--no-verify-jwt` is required: this function is called by `pg_cron`/`pg_net`
inside your project, not by a signed-in browser, so it has no user JWT to
check. The `x-coverage-secret` header is the auth instead.

Then run `supabase/coverage-schedule.sql` in the SQL editor (fill in the two
placeholders) to put it on a 15-minute schedule, and turn on company coverage
in the Company coverage card on the Home tab, with a contact email.

## Run it once by hand

Useful for a smoke test after deploying, or to force a run without waiting
for the next schedule tick:

```
curl -i -X POST \
  -H "x-coverage-secret: <your COVERAGE_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://<project-ref>.supabase.co/functions/v1/coverage
```

A healthy response looks like `{"companies":3,"events":5,"ms":8421,"errors":[]}`.
A non-empty `errors` array is not necessarily a failure — a single source
failing for one company (a site down, a rate limit) is logged there and
still lets the rest of the batch finish.

Each batch of 8 takes 60 to 80 seconds. If a run's `ms` gets close to the
140 second wall clock, lower `app_settings.coverage_batch`.

## Reading `coverage_runs`

Every run writes one row per user to `coverage_runs`: `companies` checked,
`events` written, `ms` elapsed, and `errors` (an array of short strings, one
per source-level failure). The collector keeps only the newest 200 rows per
user and deletes older ones itself. If `coverage_last_run_at` in Settings
looks stale, check the newest `coverage_runs` row for that user first — an
empty `errors` array with `companies: 0` usually means there was nothing
left in the batch (everyone was checked recently), not a break.

## What the reach out flag means

| Trigger | Window | Why now |
|---|---|---|
| Form D, S-1, financing 8-K, fundraise news | 30 days | "Filed a Form D 6 days ago" etc. |
| Leadership-change 8-K, senior arrival, exec departure | 45 days | "New CFO announced 12 days ago" etc. |
| Investors page goes live | 60 days | "Investors page went live 30 days ago" |
| Finance/IR or ERP hiring | 60 days | "Hiring a VP Finance 3 days ago" |

No matching event in its window → no flag. The app never recomputes this; it
only renders `reach_out`, `why_now`, and `reach_out_until` as the collector
wrote them.
