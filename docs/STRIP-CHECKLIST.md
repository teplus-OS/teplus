# Teplus open source strip checklist

Working rule: the fresh folder starts EMPTY and files are copied IN one by
one, each one reviewed. Nothing is ever bulk-copied from the old repo, so the
contacts xlsx and any secret can never ride along by accident.

## Copy in (after review)
- [ ] index.html (v1.15) — the app itself
- [ ] Consolidated schema.sql (migration 009 reconverging repo and prod),
      including all RLS policies and the anon DML revokes
- [ ] Any static assets the single file actually references

## Strip / replace inside the code
- [ ] Hardcoded Supabase URL + anon key → read from window.SUPABASE_CONFIG
      (supabase-config.js, gitignored)
- [ ] rickycrm-sync edge function — stays out entirely (hardcoded secret)
- [ ] SignalTwin collectors and all ingest secrets — stay out (paid layer)
- [ ] SignalTwin-fed features that assume the engine (signals/news sync):
      decide per feature — degrade gracefully or hide when company_events
      is empty
- [ ] Any personal identifiers: name, email, firm names, seeded data,
      Hermes references, chat-transcript URLs
- [ ] Branding: RickyCRM → Teplus (name, titles, footer "Built by Ricky"
      decision)

## Gates before this folder ever hits GitHub
- [ ] Tightened CSP applied + full auth/realtime smoke test
- [ ] Final secrets sweep: grep every shipped file for keys, tokens, project
      refs, personal emails
- [ ] git log shows a clean history (fresh init, no imported history)
- [ ] Naive-user deploy test: fresh Claude conversation, paste repo link,
      "deploy this for me", end to end
- [ ] On Ricky: PAT revoked, OBA filed, teplus.ai confirmed

## Deliberately skipped (decided 2026-08-28)
- inline onclick cleanup
- birthday schema drop
