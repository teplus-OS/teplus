#!/usr/bin/env bash
# Teplus one-command setup.
#
# Run this from the repo root AFTER:
#   1. A Supabase project exists.
#   2. supabase/schema.sql has been run in the SQL editor.
#   3. An auth user has been created (Authentication -> Users -> Create user).
#
# Usage:
#   PROJECT_REF=abcdefghijklmnop SUPABASE_URL=https://abcdefghijklmnop.supabase.co \
#     PUBLISHABLE_KEY=sb_publishable_xxx bash setup.sh
#
# Any of the three values may instead be typed in when prompted.
#
# macOS ships zsh as the default shell; this script is bash, so it is always
# invoked as `bash setup.sh`, never `./setup.sh` or `sh setup.sh`.

set -u

# ── helpers ──────────────────────────────────────────────────────────────

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }        # "What this does" line
info() { printf '    %s\n' "$1"; }
fail() { printf '\n\033[31mFAILED at step: %s\033[0m\n' "$1" >&2; exit 1; }

run() {
  # run <step-name> -- <command...>
  local name="$1"; shift
  "$@" || fail "$name"
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$REPO_ROOT" || { echo "Could not cd to repo root ($REPO_ROOT)"; exit 1; }

# ── 0. node / npx present? ──────────────────────────────────────────────

step "Checking for Node.js (needed to run the Supabase and Vercel CLIs via npx)"
if ! command -v npx >/dev/null 2>&1; then
  cat >&2 <<'EOF'

Node.js does not seem to be installed (the `npx` command was not found).

Teplus setup needs Node.js to run the Supabase and Vercel command-line
tools. Please install it from https://nodejs.org (the LTS version is
fine), then run this script again.

EOF
  exit 1
fi
info "npx found: $(command -v npx)"

# ── 1. collect required values ──────────────────────────────────────────

step "Collecting your Supabase project details"
info "These come from your Supabase project's dashboard (Project Settings -> API,"
info "and the project ref shown in the project URL / General settings)."

if [ -z "${PROJECT_REF:-}" ]; then
  printf 'Supabase project ref (e.g. abcdefghijklmnop): '
  read -r PROJECT_REF
fi
if [ -z "${SUPABASE_URL:-}" ]; then
  printf 'Supabase project URL (e.g. https://abcdefghijklmnop.supabase.co): '
  read -r SUPABASE_URL
fi
if [ -z "${PUBLISHABLE_KEY:-}" ]; then
  printf 'Supabase publishable key (starts with sb_publishable_ or is the anon key): '
  read -r PUBLISHABLE_KEY
fi

if [ -z "${PROJECT_REF:-}" ] || [ -z "${SUPABASE_URL:-}" ] || [ -z "${PUBLISHABLE_KEY:-}" ]; then
  echo "PROJECT_REF, SUPABASE_URL and PUBLISHABLE_KEY are all required." >&2
  exit 1
fi

info "Will use:"
info "  PROJECT_REF     = $PROJECT_REF"
info "  SUPABASE_URL    = $SUPABASE_URL"
info "  PUBLISHABLE_KEY = ${PUBLISHABLE_KEY:0:12}... (truncated)"

# ── 2. supabase login / link ────────────────────────────────────────────

step "Checking Supabase CLI login"
if npx supabase projects list >/dev/null 2>&1; then
  info "Already logged in to the Supabase CLI — skipping login."
else
  info "Not logged in yet. Opening 'npx supabase login'..."
  run "supabase login" npx supabase login
fi

step "Linking this repo to your Supabase project ($PROJECT_REF)"
run "supabase link" npx supabase link --project-ref "$PROJECT_REF"

# ── 3. coverage secret + function deploys ───────────────────────────────

step "Generating a random COVERAGE_SECRET (used to authenticate the cron job to the coverage function)"
COVERAGE_SECRET="$(openssl rand -hex 24)" || fail "openssl rand"
info "Generated a 48-character hex secret."

step "Setting COVERAGE_SECRET on your Supabase project"
run "supabase secrets set" npx supabase secrets set "COVERAGE_SECRET=$COVERAGE_SECRET"

step "Deploying the 'coverage' edge function"
run "deploy coverage function" npx supabase functions deploy coverage --no-verify-jwt

step "Deploying the 'calendar-feed' edge function"
run "deploy calendar-feed function" npx supabase functions deploy calendar-feed --no-verify-jwt

# ── 4. app/supabase-config.js ───────────────────────────────────────────

step "Writing app/supabase-config.js from the example file"
info "Replacing __SUPABASE_URL__ and __PUBLISHABLE_KEY__ with your values."
if [ ! -f app/supabase-config.example.js ]; then
  fail "app/supabase-config.example.js not found"
fi
sed \
  -e "s#__SUPABASE_URL__#${SUPABASE_URL}#g" \
  -e "s#__PUBLISHABLE_KEY__#${PUBLISHABLE_KEY}#g" \
  app/supabase-config.example.js > app/supabase-config.js \
  || fail "writing app/supabase-config.js"
info "Wrote app/supabase-config.js."

# ── 5. filled coverage-schedule.sql ─────────────────────────────────────

step "Filling in supabase/coverage-schedule.sql placeholders"
FILLED_SQL="$(mktemp -t teplus-coverage-schedule.XXXXXX.sql)" || fail "mktemp"
sed \
  -e "s#<PROJECT_REF>#${PROJECT_REF}#g" \
  -e "s#<COVERAGE_SECRET>#${COVERAGE_SECRET}#g" \
  supabase/coverage-schedule.sql > "$FILLED_SQL" \
  || fail "filling coverage-schedule.sql"
info "Wrote the filled schedule SQL to: $FILLED_SQL"
info "Run this file in the Supabase SQL editor (this script does not run SQL itself)."

# ── 6. deploy the app to Vercel, from a copy outside the git repo ──────

step "Deploying app/ to Vercel (from a temporary copy outside this git repo)"
rm -rf /tmp/teplus-app
run "copy app for deploy" cp -R app /tmp/teplus-app

VERCEL_LOG="$(mktemp -t teplus-vercel.XXXXXX.log)" || fail "mktemp"
(
  cd /tmp/teplus-app || exit 1
  if ! npx vercel whoami >/dev/null 2>&1; then
    npx vercel login || exit 1
  fi
  npx vercel --prod --yes
) | tee "$VERCEL_LOG"
VERCEL_STATUS=${PIPESTATUS[0]:-1}
if [ "$VERCEL_STATUS" -ne 0 ]; then
  fail "vercel deploy"
fi

DEPLOY_URL="$(grep -Eo 'https://[a-zA-Z0-9.-]+\.vercel\.app' "$VERCEL_LOG" | tail -n 1)"
if [ -z "$DEPLOY_URL" ]; then
  info "Could not automatically find the production URL in Vercel's output above."
  info "Look for the line Vercel printed starting with 'Production:' and use that URL."
else
  info "Production URL: $DEPLOY_URL"
fi

# ── 7. final checklist ───────────────────────────────────────────────────

step "Setup finished. Final checklist:"
cat <<EOF

1) Open your URL${DEPLOY_URL:+ ($DEPLOY_URL)}. If it redirects to a Vercel
   login page instead of Teplus, go to the Vercel dashboard for this
   project -> Settings -> Deployment Protection, and turn off
   "Vercel Authentication".

2) Run the schedule SQL in the Supabase SQL editor:
   $FILLED_SQL

3) Sign in with the auth user you created, then set your contact email in
   the Company coverage card in Settings (required by the SEC's EDGAR
   fair-access policy for the coverage collector to run).

EOF
