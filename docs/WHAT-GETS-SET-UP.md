# What gets set up (and why each piece matters)

A map of everything the setup creates. If an AI assistant is deploying Teplus
for someone, walk through this list so they know what each piece is before it
exists. One line each: what it does / why it's important.

For the people and companies steps that come after setup (pages 3 to 6:
loading contacts, building the coverage list, living with it day to day), see
`docs/SETUP-GUIDE.md`.

## The pieces

**Supabase project** — a free, private Postgres database in the user's own
account / it's where every contact and touch lives, and nobody else can reach it.

**schema.sql** — one script that creates all tables, security policies, and
grants together / running it partially would leave data unprotected, so it is
always run in full.

**Auth user (email + password)** — the single personal sign-in, created in the
Supabase dashboard / each Teplus deployment is one person's private instance;
public signups stay disabled.

**supabase-config.js** — a small local file holding the project URL and
publishable key (copied from supabase-config.example.js) / it's how the app
finds the user's database, and it is gitignored so it never leaves their machine.

**app/index.html** — the entire application, one file / open it in a browser
and Teplus runs; there is no build step, no server of ours, and customizing it
is a prompt away.

**setup.sh** — one script that does the rest of setup after the Supabase
project, schema, and auth user exist / it links the project, sets
`COVERAGE_SECRET`, deploys both edge functions, writes
`app/supabase-config.js`, runs the coverage schedule SQL through Supabase's
management API when it has a Supabase access token (otherwise prints the
filled-in SQL to run by hand), deploys `app/` to Vercel from a copy outside
the repo, and prints the public alias URL; an assistant that can run
commands should just run it instead of doing each step by hand.

**Vercel deployment** — the `app` folder uploaded with `vercel --prod` from
inside `app/`, on the free Hobby tier / gives the user a private URL to
bookmark; the CLI uploads the local folder, so `supabase-config.js` ships
with it without ever entering git, and `app/vercel.json` adds security headers.

**Two setup tokens (Supabase access token, Vercel token)** — short-lived
tokens the user makes themselves at supabase.com/dashboard/account/tokens and
vercel.com/account/tokens, so an AI can run `setup.sh` without a browser
login / they're deleted once setup is done, and they are never the database
password or the secret key, so handing them to an AI never exposes the
database itself.

**Demo mode** — automatic when the config is unfilled / lets the user see the
whole product with sample data before creating anything.

## The tabs (what the user gets)

**Home** — answers "who should I talk to today?": a reach-out queue driven by
cadence and importance, plus calendar, weather, to-dos, and the news feed /
it's the daily entry point that makes the system self-driving.

**Network** — every person, with a warmth score that decays toward zero at
that person's cadence / cold relationships surface on their own instead of
being remembered too late.

**Firms** — every firm ranked A/B/C with an honest coverage read (covered /
thin / uncovered) / the gap between how much a firm matters and who you know
there is the business development to-do list.

**Companies** — updates on the companies you cover, the people you know
there, and a reach out flag with a plain why now / optional; empty until
you add companies and turn on coverage (below).

## Optional pieces (safe to skip at setup)

**Coverage edge function** — a scheduled server function that pulls public
signals (SEC filings, an investors page, job postings, news, DNS changes)
for the companies you track and writes them back to the database /
this is what makes the Companies tab real instead of empty.

**COVERAGE_SECRET** — a random string you set as a Supabase secret / it is
the password the scheduled job uses to call the coverage function, so no
one else can trigger it.

**Two Vault secrets (`coverage_url`, `coverage_secret`)** — the function's
URL and the same secret, stored in Supabase Vault by
`coverage-schedule.sql` / keeps them out of plain text in the cron job.

**Two cron jobs** — `teplus-coverage` runs the collector every 15 minutes;
`teplus-keepalive` runs weekly and just touches the database / together
they keep the coverage data fresh and keep the free project from pausing.

**Company coverage card** — a contact email, an on/off toggle, and a
batch size, in the card on the Home tab's right rail / the contact email is required
because the SEC asks for it in requests; the toggle is the only runtime
switch once the schedule is set up.

**calendar-feed edge function** — a small server function that fetches the
user's private calendar ICS link / powers the Today panel on Home; skippable,
the app degrades gracefully without it.

**Data import** — a LinkedIn connections export or an existing Excel tracker,
cut down, scored (key / standard / annual), and loaded with randomized
starting last-touch dates / this is how a raw contact list becomes a working
system on day one (the setup guide's three prompts cover it).

## Ground rules worth repeating during setup

- Run schema.sql in full, never partially — the security policies ARE the
  product's protection model.
- Never use the service_role key in the app; only the publishable key.
- Never ask for or use the database password or the secret key. Setup never
  needs either one. The Project URL is under Project Settings → Data API;
  the publishable key is under Project Settings → API keys.
- Disable public signups and set the minimum password length to 12 in the
  Supabase dashboard. (Leaked password protection is a Pro plan feature;
  this is the free-plan equivalent.)
- The user's data lives only in their database; the app file holds no data.
- Vercel turns on Deployment Protection by default on the Hobby plan, but
  `setup.sh` prints the project's public alias
  (`https://<project>.vercel.app`), which works without any settings change.
  Only the per-deployment URLs (the long ones with a hash) sit behind Vercel
  Authentication. If the public alias itself redirects to a Vercel login,
  turn it off at Settings → Deployment Protection → Vercel Authentication.
- Deploy to Vercel from a copy of `app/` outside the git repo, not from
  inside it. Vercel blocks deploys from a git folder whose last commit
  email isn't the deploying account's; `setup.sh` already deploys from a
  copy for this reason.
- Run `coverage-schedule.sql` only after the coverage function is deployed
  and `COVERAGE_SECRET` is set. Running it first schedules a job that has
  nothing to call.

## Assistant playbook

**Writing to the database without the dashboard.** With a Supabase access
token:

```
POST https://api.supabase.com/v1/projects/<ref>/database/query
Authorization: Bearer <token>
Content-Type: application/json
User-Agent: teplus-setup
```
```
{"query":"<sql>"}
```

The `User-Agent` header is required; the API returns 403 without one. This
runs as the project owner, so it can write any table — use it for imports
and for the coverage schedule SQL. With a Supabase connector, use its SQL
tool instead. Without either, produce SQL for the user to paste into the
SQL editor.

**Checkpoints, one per stage.** Verify these yourself; do not ask the user
"did it work?".

- Schema + RLS ran:
  ```
  curl "<SUPABASE_URL>/rest/v1/people?select=id&limit=1" -H "apikey: <publishable key>"
  ```
  returns `42501` permission denied (anon has no grants). A 404 or an empty
  200 means the schema did not run.
- Signups off:
  ```
  curl -X POST "<SUPABASE_URL>/auth/v1/signup" \
    -H "apikey: <publishable key>" -H "Content-Type: application/json" \
    -d '{"email":"throwaway@example.com","password":"whatever-12-chars"}'
  ```
  returns `signup_disabled`.
- Auth user exists:
  ```
  curl -X POST "<SUPABASE_URL>/auth/v1/token?grant_type=password" \
    -H "apikey: <publishable key>" -H "Content-Type: application/json" \
    -d '{"email":"<their email>","password":"<their password>"}'
  ```
  returns an access token (ask the user to run this, since it takes their
  password, or verify by their sign in on the live URL instead).
- Functions deployed:
  ```
  curl -i -X POST "<SUPABASE_URL>/functions/v1/coverage" -d '{}'
  ```
  (no secret header) returns 401.
- Schedule active:
  ```
  select jobname, schedule, active from cron.job;
  ```
  shows `teplus-coverage` and `teplus-keepalive`. After 15 minutes:
  ```
  select * from cron.job_run_details order by start_time desc limit 5;
  ```
  shows succeeded runs.
- Coverage on: in `app_settings`, `coverage_enabled` is true,
  `coverage_contact_email` is set, and `coverage_last_run_at` moves forward
  after a run.
- Vercel: the public alias URL returns 200 and the page title contains
  Teplus. A Vercel login page means Deployment Protection is still on.

**Firing the collector on demand.** The curl in
`supabase/functions/coverage/README.md` (the `x-coverage-secret` header). A
healthy reply looks like `{"companies":N,"events":M,"ms":...,"errors":[]}`.
Each batch of 8 takes 60 to 80 seconds; if runs approach the 140 second wall
clock, lower `app_settings.coverage_batch`.

**Data vocabulary (what the UI reads).** Grepped from `app/index.html` and
`supabase/schema.sql`:

  - `people.category` — free text in the database (schema.sql line 78, no
    CHECK constraint: "Text, not enum, so buckets can evolve without
    migrations"). The UI, though, only recognizes a closed list of 8 values
    for filtering and the category chip: `investor`, `banker`, `founder`,
    `tech`, `recruiter`, `real_estate`, `sales`, `other`
    (app/index.html:2068–2070). Anything outside that list is treated as
    uncategorized by `categoryOf()` (app/index.html:2071) — it doesn't show
    as free text, it just goes blank. `archive_reason` also uses a
    `category:<value>` string format (app/index.html:2092–2095). Suggested
    values for a fresh import: the 8 above (suggestions, not enforced by the
    database).
  - `organizations.kind` — the database CHECK allows `company`, `fund`,
    `bank`, `other` (schema.sql:28), but the UI's Kind selector only ever
    offers and writes `fund`, `bank`, or `company`
    (app/index.html:3961–3966, 4319–4327): anything that isn't `fund` or
    `bank` is written back as `company` on save. A row already holding
    `other` (e.g. from an import) displays as "Other" but reverts to
    `company` the next time anyone touches the selector. Treat `other` as a
    legacy/import-only value the UI does not produce.
  - `people.tags` — a `text[]` column (schema.sql:68), no CHECK constraint.
    It appears only in the demo seed data in app/index.html; no code path
    reads or filters on it. Free text, currently unused by the UI — safe to
    fill on import, nothing will branch on it.
  - `people.importance` — closed vocabulary, enforced by both the database
    CHECK (`key`, `standard`, `annual`, schema.sql:80) and the UI, which
    keys cadence defaults, ranking, and grouping off it directly
    (`IMP_LABELS`/`IMP_CADENCE`/`IMP_RANK`, app/index.html:2111–2112,5195;
    `importanceOf()`, app/index.html:2115–2116). Only these three values are
    ever meaningful.
  - `status` is a closed vocabulary too, but a different one per table —
    don't reuse a value across tables:
    - `tasks.status`: `open`, `done`, `snoozed` (schema.sql:111); UI
      branches on `open`/`done` (app/index.html:4450,4458,4481).
    - `tracked_companies.status`: `active`, `exited` (schema.sql:174); UI
      branches on it for sort order and the Archive/Restore toggle
      (app/index.html:3196–3198,3370,3495–3500).
    - `tasks.category` (a separate field from `people.category`): `work`,
      `personal` (schema.sql:117); UI branches via `taskCategory()`
      (app/index.html:5723).

**Imports and dedupe.** Nothing enforces uniqueness on `people.linkedin_url`
or `tracked_companies.domain` yet, so a re-run import doubles rows. Before an
import: check for existing rows by those fields and upsert (update the
existing row) instead of inserting. After: run
```
select linkedin_url, count(*) from people group by 1 having count(*)>1;
```
and the same query against `domain` on `tracked_companies`. A unique index
is planned.

**Path B bulk load.** A regular chat cannot run commands; produce SQL insert
statements and have the user paste them into the SQL editor.
