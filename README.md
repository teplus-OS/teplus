# Teplus

A free, open source relationship manager for investors. It tracks your
coverage universe and your referral network, tells you who's going cold, and
runs entirely on your own private infrastructure — your data never touches
anyone else's servers.

MIT licensed. © 2026 RS Standard LLC.

## Deploy it with Claude (~20 minutes)

The fastest way to set up Teplus is to let an AI assistant do it:

1. Open a new conversation with Claude.
2. Paste this repository's link and say: **"Deploy this for me."**
3. Claude will walk you through creating a free Supabase project, running the
   schema, and getting the app on your screen.

You'll need: a Supabase account (free tier is fine) and about 20 minutes.

## Try it first (demo mode)

Open `app/index.html` in a browser with no configuration at all and Teplus
runs in demo mode with sample people, touches, and tasks, so you can see the
whole UI before creating anything.

## Manual setup

1. Create a Supabase project at supabase.com.
2. In the SQL editor, run `supabase/schema.sql` in full. This creates every
   table AND the Row Level Security policies — do not skip it or run it
   partially. (The security model is documented at the top of that file.)
3. In Authentication settings, disable public signups (each deployment is
   personal — you are the only user) and enable leaked password protection.
4. Create your account: Authentication → Add user (email + password).
5. Copy `app/supabase-config.example.js` to `app/supabase-config.js` and fill
   in your project URL and publishable key (Project Settings → API). The real
   config file is gitignored so your values stay local.
6. Serve the `app/` folder (any static host, or locally e.g.
   `python3 -m http.server` from `app/`) and sign in.

Optional: deploying on Vercel picks up `app/vercel.json` (security headers).
Optional: the calendar widget needs the `calendar-feed` edge function
deployed (`supabase functions deploy calendar-feed`) and your calendar's
secret ICS URL saved in Settings.

## Customizing (the fun part)

Teplus is a single HTML file. That means you can change it with a prompt:
open the file in a Claude conversation and describe what you want — a new
field, a different cadence, a view your workflow needs. This is a supported,
intended way to use it.

## Signals (optional, bring your own)

The Companies tab and the Home live feed read from two tables
(`tracked_companies` and `company_events`) that ship empty. Teplus includes
no data collector; if you have your own process that finds company news,
write rows into those tables and the app picks them up. Everything else
works fully without them.

## Your data and privacy

Teplus is self hosted: you run your own database, and you are the data
controller for whatever you put in it. You are responsible for complying
with privacy law applicable to you and your contacts. Teplus was designed
with US located contacts and minimal personal data in mind.

## What it is not

There is no hosted version, no telemetry, no account with us, and no signal
or news engine in this repository.

---

Built by Ricky. Questions or access to updates: r@agran.co
