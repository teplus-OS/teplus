# Teplus

A free, open source relationship manager for investors. It tracks your
network and the companies you cover. It runs on your own private
infrastructure.

MIT licensed. © 2026 RS Standard LLC.

## Deploy it with your AI

Paste this prompt into an AI assistant:

> Deploy this for me: github.com/teplus-OS/teplus. I'm not technical. Set up
> Teplus step by step, explain each step before I do it, and don't move on
> until it works. Host it on Vercel's free tier so I get a URL I can
> bookmark. Then turn on company coverage, then help me load my contacts and
> build my coverage list, following docs/SETUP-GUIDE.md in the repo.

Time: setup is about an hour, 20 minutes of it is you. Then 30 to 60
minutes of your decisions for people and companies. Regular chat: add
about 30 minutes.

If you're the AI doing this: read `docs/WHAT-GETS-SET-UP.md` first, then
`docs/SETUP-GUIDE.md` for the people and companies steps.

## Try it first

Open `app/index.html` in a browser with no setup at all. Teplus runs in
demo mode with sample data, so you can see the whole thing before you
create anything.

## Setup

Do these four dashboard steps first, by hand, in the Supabase dashboard
(about 10 minutes):

1. Create a Supabase project at supabase.com. Save the database password
   somewhere safe; Teplus never needs it again.
2. In the SQL editor, click New query, paste all of `supabase/schema.sql`,
   and press Run. It creates the tables and the security policies (RLS)
   in one go; there is nothing else to click.
3. In Authentication → Sign In / Providers, turn off "Allow new users to
   sign up", and under the Email provider set the minimum password length
   to 12, then press Save at the bottom. (Leaked password protection is
   a Pro plan feature; this is the free-plan equivalent.)
4. Add your own user under Authentication → Users → Add user → Create new
   user, with "Auto Confirm User" ticked. This email and password are
   your Teplus login.

Then finish the rest one of two ways.

### Path A: an assistant that can run commands

Claude Code, Cowork, ChatGPT agent mode, and cloud assistants with no
browser can all do this.

First, make two tokens so your AI can work without a browser login (name
both `teplus-setup`, and delete both when setup is done):

- Supabase: supabase.com/dashboard/account/tokens → Generate new token.
- Vercel: vercel.com/account/tokens → Create.

Give your AI five things: the project ref (the short code in your
project's URL), the Project URL (Project Settings → Data API), the
publishable key (Project Settings → API keys), and the two tokens. Never
give it the database password or the secret key; Path A never uses them.

Have connectors? If your assistant has Supabase and Vercel connectors
(Claude's Cowork does), connect them to the account you're using for
Teplus and skip the tokens. Your AI can then create the project and run
the schema itself; it will tell you which clicks are still yours.

Then have it run, from the repo root:

```
SUPABASE_ACCESS_TOKEN=... VERCEL_TOKEN=... PROJECT_REF=... SUPABASE_URL=... \
  PUBLISHABLE_KEY=... bash setup.sh
```

The script links the project, sets a random `COVERAGE_SECRET`, deploys
the `coverage` and `calendar-feed` functions, writes
`app/supabase-config.js`, runs the coverage schedule SQL through
Supabase's management API, deploys a copy of `app/` to Vercel (see
Vercel notes below), and prints your public URL.

Open the URL, sign in with the user you created in step 4 above, and
enter your contact email in the Company coverage card on the Home tab
(right rail). The SEC requires it in requests.

### Path B: a regular chat

Paste these into Terminal yourself, one at a time, waiting for each to
finish:

1. Download Teplus: on github.com/teplus-OS/teplus click the green Code
   button, then Download ZIP, and unzip it. Then `cd` into that folder:
   type `cd ` with a trailing space, drag the folder from Finder into the
   Terminal window, press Enter.
2. `npx supabase login`
3. `npx supabase link --project-ref YOUR_PROJECT_REF`
4. `PROJECT_REF=... SUPABASE_URL=... PUBLISHABLE_KEY=... bash setup.sh`
   — the Project URL is under Project Settings → Data API, the
   publishable key under Project Settings → API keys, and the ref is the
   short code in your project's URL.
5. If the script could not run the schedule SQL itself, it prints the
   name of a SQL file. Open it, copy everything, paste it into the
   Supabase SQL editor, and run it. (The script runs it itself only when
   `SUPABASE_ACCESS_TOKEN` is set, which Path B doesn't use.)
6. Open the URL the script printed. See Vercel notes below if it asks
   you to log in.
7. Sign in with the user you created in the Supabase dashboard.
8. Loading people or companies from a regular chat: ask your AI to turn
   your file into SQL insert statements for Teplus (it can read
   `supabase/schema.sql` for the columns), then paste the result into the
   SQL editor and run it.

### Vercel notes

- Deployment Protection is on by default on the Hobby plan, but
  `setup.sh` now prints the project's public alias
  (`https://<project>.vercel.app`), which works without any settings
  change. Only the per-deployment URLs (the long ones with a hash) sit
  behind Vercel Authentication. If your URL still redirects to a Vercel
  login, turn it off at Settings → Deployment Protection → Vercel
  Authentication.
- Vercel also blocks deploys made from inside a git folder whose last
  commit email isn't the deploying account's. `setup.sh` avoids this by
  deploying from a copy outside the repo; do the same if you deploy by
  hand.
- Vercel names the project after the folder it deploys from. `setup.sh`
  deploys from a copy called `teplus-app`, so the project is
  `teplus-app` and the URL is `https://teplus-app-<something>.vercel.app`
  or `https://teplus-app.vercel.app`, whichever Vercel has free. Set
  `VERCEL_PROJECT_NAME=yourname` before `bash setup.sh` to choose a
  different name.

## Your people

Bring a spreadsheet. Any contact export or tracker you already have works.

Bring a LinkedIn export. Your connections file becomes your starting
network.

Either way, the setup guide has three prompts for your AI: cutting the
list down, scoring each person key, standard, or annual and each firm A,
B, or C, and spreading out your check-in cadences so they don't all land
on the same day. The guide lives at `docs/SETUP-GUIDE.md`.

Time: 30 to 60 minutes of your decisions.

The setup guide's first prompt loads everyone and archives the ones you
cut, so a dropped contact still shows up under a company you cover.

## Your companies

The Companies tab shows updates on the companies you cover, the people you
know there, and a reach out flag with a plain reason why.

### Turn on coverage

`setup.sh` already did the first three steps below. Only the fourth is
left: your contact email, in the Company coverage card on the Home tab
(right rail).

By hand, if you skipped `setup.sh`:

1. `supabase secrets set COVERAGE_SECRET=<a random string>`
2. `supabase functions deploy coverage --no-verify-jwt`
3. Run `supabase/coverage-schedule.sql` with the two placeholders filled in.
4. In Teplus, set your contact email and switch coverage on.

### Build your list

Paste a list of companies to your AI and have it load them in.

Or give your AI a few parameters and let it build a list, review it in
batches, and load it in.

You can also add a company by hand any time with Add company in the app.

### What it pulls

- SEC filings: Form D, 8-K, S-1
- An investors page appearing on the company's site
- Job postings from public boards: finance, IR, ERP, and senior roles
- News mentions
- Mail and DNS provider changes

### What Reach out means

| Trigger | Window | Why now |
|---|---|---|
| Form D, S-1, financing 8-K, fundraise news | 30 days | "Filed a Form D 6 days ago" etc. |
| Leadership-change 8-K, senior arrival, exec departure | 45 days | "New CFO announced 12 days ago" etc. |
| Investors page goes live | 60 days | "Investors page went live 30 days ago" |
| Finance/IR or ERP hiring | 60 days | "Hiring a VP Finance 3 days ago" |

No matching event in its window means no flag.

### Limits on the free plan

About 300 companies is comfortable on the free plan. Checks run in
batches of 8 every 15 minutes, so each company refreshes a few times a
day. The collector checks 8 companies every 15 minutes, 768 a day, so
200 companies refresh about every 6 hours and 500 about every 16.

If you skipped company coverage, open Teplus at least once a week so the
free project stays awake. The SEC requires your email in requests, so
coverage asks for it.

### Keep-alive

A second scheduled job keeps your Supabase project from pausing, even if
coverage itself is off or broken. To tell it is working, open the
Supabase table editor and check that `app_settings.keepalive_at` moves
forward every week. If it stops, the
fix notes are in `supabase/coverage-schedule.sql`.

## It's yours

Teplus is one file. Change it with a prompt, and try the change before you
commit to it. If a change is good for everyone, email r@agran.co and it
can go into the next version.

To update, tell your AI: "update my Teplus to the latest version from the
repo." Your data is untouched.

## If your AI can read your email

Connected Gmail or Outlook to Claude or ChatGPT? Then one prompt a week
keeps Teplus current. It works because Teplus is a plain database your AI
can write to.

> Read my sent mail since last Monday. For each person I actually wrote
> to who is in my Teplus, log a touch with the date and a one line
> summary. Show me the list before you write anything.

First time, use a longer window to backfill history. Needs an assistant
with email access and access to your Teplus database.

## Your data and privacy

Teplus is self hosted. You are the data controller for what you put in it.
It was designed for US located contacts and minimal personal data.
Coverage only fetches public sources: Google News RSS as a public feed,
and SEC EDGAR under its fair access policy.

## What it is not

There is no hosted version, no telemetry, and no account with us. There is
no scoring or prediction in this repository.

---

Built by Ricky Agran. Questions: r@agran.co
