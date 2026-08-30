// Teplus calendar-feed edge function.
// Fetches the owner's secret Google Calendar ICS feed server-side (so the
// URL never has to travel through the browser's network tab on every load)
// and returns upcoming events as JSON.
//
// Auth: caller must present a valid user JWT (verify_jwt = true at the
// platform layer, plus an explicit getUser() check here). The ICS URL lives
// in app_settings, RLS-scoped to the owner; this function reads it with the
// service role AFTER identifying the caller, and only reads the caller's row.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type IcsEvent = {
  title: string;
  location: string | null;
  start: string; // ISO
  end: string | null;
  all_day: boolean;
};

function unfold(ics: string): string[] {
  // ICS lines are folded with CRLF + space/tab.
  return ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}

function parseIcsDate(raw: string, params: Record<string, string>): { date: Date; allDay: boolean } | null {
  // Forms: 20260805, 20260805T140000Z, 20260805T140000 (+ TZID param)
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) {
    // All-day: treat as a date (no meaningful timezone math needed for display).
    return { date: new Date(Date.UTC(+y, +mo - 1, +d)), allDay: true };
  }
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
  // Floating or TZID-local time. Google feeds carry TZID; without a full tz
  // database we approximate using the TZID via Intl when possible.
  const tzid = params["TZID"];
  if (tzid) {
    try {
      // Interpret the wall time in tzid by asking Intl for the offset at that moment.
      const utcGuess = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tzid, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      });
      const parts = Object.fromEntries(fmt.formatToParts(utcGuess).map(p => [p.type, p.value]));
      const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +(parts.hour === "24" ? 0 : parts.hour), +parts.minute, +parts.second);
      const offset = asIfUtc - utcGuess.getTime();
      return { date: new Date(utcGuess.getTime() - offset), allDay: false };
    } catch (_e) { /* fall through */ }
  }
  return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
}

// Minimal RRULE expansion: DAILY / WEEKLY (with BYDAY) / MONTHLY / YEARLY,
// honoring UNTIL and COUNT approximately. Good enough for a personal calendar
// view; exotic rules just show their first occurrence if in range.
function expandOccurrences(start: Date, rrule: string | null, exdates: Set<number>, windowStart: Date, windowEnd: Date): Date[] {
  const out: Date[] = [];
  const push = (d: Date) => {
    if (d >= windowStart && d <= windowEnd && !exdates.has(d.getTime())) out.push(d);
  };
  if (!rrule) { push(start); return out; }
  const parts: Record<string, string> = {};
  for (const kv of rrule.split(";")) {
    const [k, v] = kv.split("=");
    if (k && v) parts[k.toUpperCase()] = v;
  }
  const freq = parts["FREQ"];
  const interval = Math.max(1, parseInt(parts["INTERVAL"] || "1", 10));
  let until = windowEnd;
  if (parts["UNTIL"]) {
    const u = parseIcsDate(parts["UNTIL"], {});
    if (u && u.date < until) until = u.date;
  }
  const count = parts["COUNT"] ? parseInt(parts["COUNT"], 10) : Infinity;
  const DAY = 86400000;
  const dowMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  let produced = 0;
  if (freq === "DAILY") {
    for (let t = start.getTime(); t <= until.getTime() && produced < count; t += interval * DAY) {
      produced++; push(new Date(t));
      if (t > windowEnd.getTime()) break;
    }
  } else if (freq === "WEEKLY") {
    const bydays = (parts["BYDAY"] ? parts["BYDAY"].split(",") : []).map(d => dowMap[d.replace(/^[+-]?\d+/, "")]).filter(d => d !== undefined);
    const days = bydays.length ? bydays : [start.getUTCDay()];
    // Walk week by week from the start's week.
    for (let weekStart = start.getTime() - start.getUTCDay() * DAY; weekStart <= until.getTime() && produced < count; weekStart += interval * 7 * DAY) {
      for (const dow of days.slice().sort((a, b) => a - b)) {
        const t = weekStart + dow * DAY;
        if (t < start.getTime() || t > until.getTime() || produced >= count) continue;
        produced++; push(new Date(t));
      }
      if (weekStart > windowEnd.getTime()) break;
    }
  } else if (freq === "MONTHLY") {
    const d = new Date(start.getTime());
    while (d.getTime() <= until.getTime() && produced < count) {
      produced++; push(new Date(d.getTime()));
      d.setUTCMonth(d.getUTCMonth() + interval);
      if (d.getTime() > windowEnd.getTime()) break;
    }
  } else if (freq === "YEARLY") {
    const d = new Date(start.getTime());
    while (d.getTime() <= until.getTime() && produced < count) {
      produced++; push(new Date(d.getTime()));
      d.setUTCFullYear(d.getUTCFullYear() + interval);
      if (d.getTime() > windowEnd.getTime()) break;
    }
  } else {
    push(start);
  }
  return out;
}

function parseIcs(ics: string, windowStart: Date, windowEnd: Date): IcsEvent[] {
  const lines = unfold(ics);
  const events: IcsEvent[] = [];
  let cur: Record<string, { value: string; params: Record<string, string> }> | null = null;
  let exdates: Set<number> = new Set();

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; exdates = new Set(); continue; }
    if (line === "END:VEVENT") {
      if (cur && cur["DTSTART"]) {
        const ds = parseIcsDate(cur["DTSTART"].value, cur["DTSTART"].params);
        if (ds) {
          const de = cur["DTEND"] ? parseIcsDate(cur["DTEND"].value, cur["DTEND"].params) : null;
          const durMs = de ? de.date.getTime() - ds.date.getTime() : 0;
          const rrule = cur["RRULE"] ? cur["RRULE"].value : null;
          for (const occ of expandOccurrences(ds.date, rrule, exdates, windowStart, windowEnd)) {
            events.push({
              title: (cur["SUMMARY"]?.value || "(no title)").replace(/\\([,;nN])/g, (_, c) => (c.toLowerCase() === "n" ? " " : c)),
              location: cur["LOCATION"]?.value?.replace(/\\([,;])/g, "$1") || null,
              start: occ.toISOString(),
              end: durMs ? new Date(occ.getTime() + durMs).toISOString() : null,
              all_day: ds.allDay,
            });
          }
        }
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const ci = line.indexOf(":");
    if (ci < 0) continue;
    const left = line.slice(0, ci);
    const value = line.slice(ci + 1);
    const [name, ...paramParts] = left.split(";");
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const [pk, pv] = p.split("=");
      if (pk && pv) params[pk.toUpperCase()] = pv;
    }
    const key = name.toUpperCase();
    if (key === "EXDATE") {
      for (const raw of value.split(",")) {
        const d = parseIcsDate(raw.trim(), params);
        if (d) exdates.add(d.date.getTime());
      }
      continue;
    }
    cur[key] = { value, params };
  }
  events.sort((a, b) => a.start.localeCompare(b.start));
  return events;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "missing auth" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "invalid auth" }, 401);

    const { data: settings } = await admin
      .from("app_settings")
      .select("ics_url")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!settings?.ics_url) return json({ configured: false, events: [] });

    let icsUrl: URL;
    try { icsUrl = new URL(settings.ics_url); } catch { return json({ configured: false, events: [], error: "bad ics url" }); }
    if (icsUrl.protocol !== "https:") return json({ configured: false, events: [], error: "ics url must be https" });

    const resp = await fetch(icsUrl.toString(), { headers: { "User-Agent": "Teplus/1.0" } });
    if (!resp.ok) return json({ configured: true, events: [], error: `feed fetch failed (${resp.status})` });
    const ics = await resp.text();

    const now = new Date();
    const windowStart = new Date(now.getTime() - 6 * 3600000); // catch in-progress events
    const windowEnd = new Date(now.getTime() + 7 * 86400000);
    const events = parseIcs(ics, windowStart, windowEnd).slice(0, 60);

    return json({ configured: true, events });
  } catch (e) {
    return json({ error: (e as Error).message || "unexpected" }, 500);
  }
});
