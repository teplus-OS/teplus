/* Teplus — Supabase configuration (example)
 *
 * 1. Copy this file to supabase-config.js (same folder).
 * 2. Fill in the two values below from your own Supabase project:
 *    Dashboard → Project Settings → API.
 * 3. supabase-config.js is gitignored — your keys stay on your machine.
 *
 * The anon (publishable) key is safe to use in a browser app ONLY because
 * every table is protected by Row Level Security. Run the schema in
 * schema.sql before pointing the app at your project — it creates the
 * tables AND the RLS policies together. Never use the service_role key here.
 */
window.SUPABASE_CONFIG = {
  url: "https://YOUR-PROJECT-REF.supabase.co",
  anonKey: "YOUR-ANON-PUBLISHABLE-KEY",
};
