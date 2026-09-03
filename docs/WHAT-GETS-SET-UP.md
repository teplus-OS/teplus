# What gets set up (and why each piece matters)

A map of everything the setup creates. If an AI assistant is deploying Teplus
for someone, walk through this list so they know what each piece is before it
exists. One line each: what it does / why it's important.

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

**Vercel deployment** — the `app` folder uploaded with `vercel --prod` from
inside `app/`, on the free Hobby tier / gives the user a private URL to
bookmark; the CLI uploads the local folder, so `supabase-config.js` ships
with it without ever entering git, and `app/vercel.json` adds security headers.

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
- Disable public signups and enable leaked password protection in the
  Supabase dashboard.
- The user's data lives only in their database; the app file holds no data.
- Run `coverage-schedule.sql` only after the coverage function is deployed
  and `COVERAGE_SECRET` is set. Running it first schedules a job that has
  nothing to call.
