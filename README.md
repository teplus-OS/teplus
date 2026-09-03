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
> bookmark. Then turn on company coverage.

Time: about an hour. Around 20 minutes of that is you: creating two free
accounts, approving a few steps, and pasting two keys. Your AI does the
rest.

If you're the AI doing this: read `docs/WHAT-GETS-SET-UP.md` first.

## Try it first

Open `app/index.html` in a browser with no setup at all. Teplus runs in
demo mode with sample data, so you can see the whole thing before you
create anything.

## Manual setup

1. Create a Supabase project at supabase.com.
2. In the SQL editor, run `supabase/schema.sql` in full.
3. In Authentication settings, disable public signups and enable leaked
   password protection. Then add your own user under Authentication.
4. Copy `app/supabase-config.example.js` to `app/supabase-config.js` and
   fill in your project URL and publishable key.
5. Deploy the `app` folder with the Vercel CLI: `npm i -g vercel`, then
   `vercel --prod` from inside `app/`. The CLI uploads the folder as it is
   on your machine, so your `supabase-config.js` goes with it while staying
   out of git. `app/vercel.json` adds the security headers.
6. Open your URL and sign in.

## Your people

Bring a spreadsheet. Any contact export or tracker you already have works.

Bring a LinkedIn export. Your connections file becomes your starting
network.

Either way, the setup guide has three prompts for your AI: cutting the
list down, scoring each person key, standard, or annual and each firm A,
B, or C, and spreading out your check-in cadences so they don't all land
on the same day.

Time: 30 to 60 minutes of your decisions.

The setup guide's first prompt loads everyone and archives the ones you
cut, so a dropped contact still shows up under a company you cover.

## Your companies

The Companies tab shows updates on the companies you cover, the people you
know there, and a reach out flag with a plain reason why.

### Turn on coverage

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
