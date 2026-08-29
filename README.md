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

## Manual setup

1. Create a Supabase project at supabase.com.
2. In the SQL editor, run `schema.sql` in full. This creates every table AND
   the Row Level Security policies — do not skip it or run it partially.
3. In Authentication settings, disable public signups (you are the only
   user) and enable leaked password protection.
4. Copy `supabase-config.example.js` to `supabase-config.js` and fill in your
   project URL and anon key (Project Settings → API).
5. Open `index.html`. Create your account, sign in, add your first contacts.

<!-- TODO before publish: verify these steps against the real deploy test;
     add hosting note (static host vs local file) once decided. -->

## Customizing (the fun part)

Teplus is a single HTML file. That means you can change it with a prompt:
open the file in a Claude conversation and describe what you want — a new
field, a different cadence, a view your workflow needs. This is a supported,
intended way to use it.

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
