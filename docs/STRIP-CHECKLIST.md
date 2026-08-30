# Teplus open source strip checklist

Working rule: the fresh folder starts EMPTY and files are copied IN one by
one, each one reviewed. Nothing is ever bulk-copied from the old repo, so the
contacts xlsx and any secret can never ride along by accident.

## Copy in (after review)
- [x] app/index.html (from v1.15) — reviewed, no credentials inside
- [x] app/signin.html
- [x] app/vendor/ (supabase-js 2.45.4 + its MIT notice)
- [x] app/vercel.json (security headers)
- [x] supabase/schema.sql — consolidated fresh-install schema, written from
      migrations 001–008 PLUS live-prod drift (snoozed_until, tasks.category,
      tracked_companies.status, importance key/standard/annual, current
      people_warmth definition). Includes all RLS policies, security_invoker
      view, trigger EXECUTE revoke, and full anon grant revoke.
      Deliberately omitted: the dead people.birthday column (v1.15 removed
      the feature; a fresh install has no drift to preserve).
- [x] supabase/functions/calendar-feed (secrets via Deno.env only — verified)

## Strip / replace inside the code
- [x] Supabase credentials: none were in index.html; supabase-config.js NOT
      copied (holds Ricky's project URL/key) — replaced by
      app/supabase-config.example.js with placeholders; real file gitignored
- [x] rickycrm-sync edge function — stays out (hardcoded secret)
- [x] SignalTwin collectors and all ingest secrets — stay out (paid layer)
- [x] SignalTwin name genericized to "signal engine"/"your signal feed" in
      comments and the 3 user-visible strings; tables ship empty and the app
      degrades gracefully (verified in demo smoke)
- [x] Personal identifiers: hardcoded "Good morning, Ricky" greeting replaced
      with name from the signed-in user's metadata/email; personal comment
      details genericized. "Built by Ricky" footer kept deliberately (brand).
- [x] Branding: RickyCRM → Teplus everywhere (titles, console tags, __teplus
      JS namespace, teplus.* localStorage keys, footers); APP_VERSION reset
      to v1.0
- [x] No contacts xlsx or any personal data file entered this folder

## Gates before this folder ever hits GitHub
- [x] Tightened CSP applied (connect-src 'self' + *.supabase.co + wss +
      open-meteo; wildcard because each self-hoster has their own project ref)
- [x] Demo-mode smoke: boots clean, all 4 tabs render, zero page errors
      (only expected 404 on absent config + sandbox-blocked Google Fonts)
- [ ] Auth + realtime smoke against a REAL Supabase project (needs a live
      test project — not doable in the sandbox)
- [x] Final secrets sweep: no keys, tokens, project refs, or personal
      identifiers in any shipped file (r@agran.co in README is intentional)
- [x] git history clean (fresh init, scaffold + strip commits only)
- [ ] Naive-user deploy test: fresh Claude conversation, paste repo link,
      "deploy this for me", end to end (Ricky runs this)
- [ ] On Ricky: PAT revoked, OBA decision noted (deferred until monetization
      — Ricky's call 2026-08-29), buy teplus.ai (Vercel showed it AVAILABLE
      at $160/2yr on 2026-08-30 — not yet purchased)

## Deliberately skipped (decided 2026-08-28)
- inline onclick cleanup
- birthday schema drop in PROD (the fresh schema simply never creates it)
