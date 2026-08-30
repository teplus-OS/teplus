// Teplus — Supabase client configuration (EXAMPLE)
//
// Copy this file to app/supabase-config.js and fill in your own project's
// values. The real supabase-config.js is gitignored so your values stay on
// your machine. Both values are safe to expose in the browser — they are
// public by design; real access control happens via row-level security in
// Postgres (see supabase/schema.sql, which you must run first).
//
// WHERE THESE COME FROM:
//   Supabase project → Project Settings → API
//     url            = Project URL
//     publishableKey = the "anon" / "publishable" key (NOT the service_role key)
//
// DEMO MODE: while these are left as the placeholders below, the app does not
// create a Supabase client and instead renders sample people / touches /
// tasks / weather / calendar, so the UI is fully reviewable before the
// database exists. Fill both values in to go live.

window.SUPABASE_CONFIG = {
  url: '__SUPABASE_URL__',
  publishableKey: '__PUBLISHABLE_KEY__',
};

// Values that mean "not configured yet" rather than a real credential.
window.SUPABASE_CONFIG_PLACEHOLDERS = ['__PUBLISHABLE_KEY__', '__SUPABASE_URL__'];

// Instantiate the shared client. Every page that needs data loads the
// vendored supabase-js script *before* this file, then reads
// window.supabaseClient.
(function initSupabaseClient () {
  if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
    console.error('[Teplus] supabase-js not loaded before supabase-config.js. Check script order.');
    return;
  }
  const { url, publishableKey } = window.SUPABASE_CONFIG;
  const placeholders = window.SUPABASE_CONFIG_PLACEHOLDERS || [];
  const unset = v => !v || placeholders.indexOf(v) !== -1;
  if (unset(url) || unset(publishableKey)) {
    console.warn('[Teplus] Supabase config not filled in — running in DEMO MODE with sample data.');
    return;
  }
  window.supabaseClient = window.supabase.createClient(url, publishableKey);
})();
