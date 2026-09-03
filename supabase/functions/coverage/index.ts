// Teplus coverage collector.
//
// A scheduled edge function (see supabase/coverage-schedule.sql) that pulls
// public signals for the companies a user tracks: EDGAR filings, an
// investors page, job board postings, news, and DNS changes. Writes
// company_events, updates tracked_companies (including the reach out flag),
// and logs a coverage_runs row. See docs/SPEC-companies.md for the full
// contract this implements section by section (§4 collector, §5 reach out).
//
// Auth: this function is deployed with --no-verify-jwt (it is not called by
// a signed-in browser — it is called by pg_cron/pg_net from inside the same
// project, or by hand for a smoke test). Every request must carry
// `x-coverage-secret` equal to the COVERAGE_SECRET env var, or it is 401'd.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both injected automatically
// by the platform), COVERAGE_SECRET (set with `supabase secrets set`).

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  classify8kItems,
  classifyJobTitle,
  classifyNewsTitle,
  computeReachOut,
  parseFundraiseFromTitle,
} from "./rules.ts";

// ───────────────────────── constants ─────────────────────────

const FETCH_TIMEOUT_MS = 8000;
const EDGAR_MIN_SPACING_MS = 350;
const MAX_ELAPSED_MS = 110_000; // stop starting new companies past this; leaves headroom under the 150s platform limit
const IR_PROBE_STALE_MS = 7 * 86400000;
const DNS_PROBE_STALE_MS = 7 * 86400000;
const ATS_NONE_STALE_MS = 30 * 86400000;
const COVERAGE_RUNS_KEEP = 200;
const IR_BODY_CAP_BYTES = 200_000;

// ───────────────────────── small utilities ─────────────────────────

function todayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function sha1Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Fetch with an 8s timeout. Returns null (never throws) on any failure so
// callers can treat "no data" and "error" the same way when that's fine, or
// check for null explicitly when they need to distinguish it.
async function timedFetch(url: string, init: RequestInit = {}): Promise<Response | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Reads at most capBytes of the response body as text (for the investors
// page probe, which only needs to sniff the word "investor").
async function readCapped(resp: Response, capBytes: number): Promise<string> {
  if (!resp.body) return await resp.text();
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < capBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
  return new TextDecoder().decode(merged);
}

// EDGAR requires we not exceed ~10 req/s; we self-limit to one request per
// 350ms (under 3/s) across the whole invocation.
let lastEdgarRequestAt = 0;
async function edgarFetch(url: string, contactEmail: string): Promise<Response | null> {
  const wait = EDGAR_MIN_SPACING_MS - (Date.now() - lastEdgarRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastEdgarRequestAt = Date.now();
  return await timedFetch(url, {
    headers: {
      "User-Agent": `Teplus ${contactEmail}`,
      "Accept-Encoding": "gzip, deflate",
    },
  });
}

// Strip Inc/LLC/Corp/Ltd and punctuation, lowercase, collapse whitespace —
// used to loosely match an EDGAR display name against a tracked company name.
function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")                            // efts appends "(TICKER)" and "(CIK 0001234)"
    .replace(/\b(inc|incorporated|llc|l\.l\.c|corp|corporation|ltd|limited|co|company|pbc|plc|holdings|group|technologies|labs)\b\.?/g, "")
    .replace(/[.,'"()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// An EDGAR entity counts as this company only when the names are equal after
// stripping corporate suffixes. Plain substring matching pulled in SPVs and
// feeder funds ("Anthropic Capital Fund LP", "Anthropic II a Series of ... LLC")
// for any well known private company, which is exactly the noise we do not want.
function entityMatches(displayName: string, wanted: string): boolean {
  const d = normalizeForMatch(displayName);
  return d === wanted || d === `the ${wanted}` || `the ${d}` === wanted;
}

function safeJson(text: string): any {
  try { return JSON.parse(text); } catch { return null; }
}

// Minimal hand-rolled tag extraction — no DOMParser assumption in Deno's
// edge runtime. Good enough for the flat XML/RSS shapes we read here.
function tagValue(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "i"));
  if (!m) return null;
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .trim();
}

function allMatches(xml: string, tag: string, inner: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function daysAgo(from: Date, days: number): Date {
  return new Date(from.getTime() - days * 86400000);
}

function isStale(checkedAt: string | null, staleMs: number, now: Date): boolean {
  if (!checkedAt) return true;
  const t = new Date(checkedAt).getTime();
  if (isNaN(t)) return true;
  return now.getTime() - t >= staleMs;
}

// ───────────────────────── types ─────────────────────────

type Company = {
  id: string;
  user_id: string;
  name: string;
  domain: string | null;
  cik: string | null;
  ats: { vendor: string; slug?: string } | null;
  dns_snapshot: { mx: string[]; ns: string[] } | null;
  ir_seen_at: string | null;
  checked_at: string | null;
  last_fundraise_date: string | null;
  last_fundraise_round: string | null;
  last_fundraise_amount_usd: number | null;
};

type NewEvent = {
  user_id: string;
  tracked_company_id: string;
  company_name: string;
  event_type: string;
  subtype: string | null;
  title: string;
  summary: string | null;
  source: string;
  source_url: string | null;
  occurred_at: string | null;
  external_id: string;
};

type CompanyPatch = Partial<{
  cik: string;
  ats: { vendor: string; slug?: string };
  dns_snapshot: { mx: string[]; ns: string[] };
  ir_seen_at: string;
  last_fundraise_date: string;
  last_fundraise_round: string;
  last_fundraise_amount_usd: number;
}>;

// ───────────────────────── source A: EDGAR full text search ─────────────────

async function collectEdgar(
  company: Company,
  now: Date,
  contactEmail: string,
  events: NewEvent[],
  patch: CompanyPatch,
): Promise<void> {
  const since = company.checked_at ? new Date(new Date(company.checked_at).getTime() - 86400000) : daysAgo(now, 90);
  const url =
    `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${company.name}"`)}` +
    `&forms=D,8-K,S-1&dateRange=custom&startdt=${todayStr(since)}&enddt=${todayStr(now)}`;

  const resp = await edgarFetch(url, contactEmail);
  if (!resp || !resp.ok) return;
  const data = safeJson(await resp.text());
  const hits: any[] = data?.hits?.hits || [];
  const wanted = normalizeForMatch(company.name);

  for (const hit of hits) {
    const src = hit._source || {};
    const displayNames: string[] = src.display_names || [];
    const matched = displayNames.some((d: string) => entityMatches(String(d), wanted));
    if (!matched) continue;

    const ciks: string[] = src.ciks || [];
    if (ciks[0] && !patch.cik && !company.cik) patch.cik = String(ciks[0]).replace(/^0+/, "") || String(ciks[0]);

    const id: string = hit._id || "";
    const accession = id.split(":")[0];
    if (!accession) continue;
    const cikForPath = (ciks[0] || company.cik || "").replace(/^0+/, "");
    const adshNoDash = accession.replace(/-/g, "");
    const filingIndexUrl = cikForPath
      ? `https://www.sec.gov/Archives/edgar/data/${cikForPath}/${adshNoDash}/${accession}-index.htm`
      : null;
    const occurredAt = src.file_date ? new Date(`${src.file_date}T00:00:00Z`).toISOString() : null;
    const form: string = src.form || "";

    if (form === "D" || form === "D/A") {
      let title = "Form D";
      if (cikForPath) {
        const docUrl = `https://www.sec.gov/Archives/edgar/data/${cikForPath}/${adshNoDash}/primary_doc.xml`;
        const docResp = await edgarFetch(docUrl, contactEmail);
        if (docResp && docResp.ok) {
          const xml = await docResp.text();
          const sold = tagValue(xml, "totalAmountSold");
          const offering = tagValue(xml, "totalOfferingAmount");
          const amountStr = sold || offering;
          const amount = amountStr ? Number(amountStr.replace(/[^0-9.]/g, "")) : null;
          if (amount && occurredAt) {
            const isNewer = !company.last_fundraise_date || new Date(occurredAt) > new Date(company.last_fundraise_date);
            if (isNewer) {
              patch.last_fundraise_date = occurredAt.slice(0, 10);
              patch.last_fundraise_round = "Form D";
              patch.last_fundraise_amount_usd = amount;
            }
          }
        }
      }
      events.push({
        user_id: company.user_id,
        tracked_company_id: company.id,
        company_name: company.name,
        event_type: "fundraise",
        subtype: "form_d",
        title,
        summary: null,
        source: "edgar",
        source_url: filingIndexUrl,
        occurred_at: occurredAt,
        external_id: accession,
      });
    } else if (form === "8-K" || form === "8-K/A") {
      const { subtype, title } = classify8kItems(src.items);
      events.push({
        user_id: company.user_id,
        tracked_company_id: company.id,
        company_name: company.name,
        event_type: "filing",
        subtype,
        title,
        summary: null,
        source: "edgar",
        source_url: filingIndexUrl,
        occurred_at: occurredAt,
        external_id: accession,
      });
    } else if (form === "S-1" || form === "S-1/A") {
      events.push({
        user_id: company.user_id,
        tracked_company_id: company.id,
        company_name: company.name,
        event_type: "filing",
        subtype: "s_1",
        title: "Filed an S-1",
        summary: null,
        source: "edgar",
        source_url: filingIndexUrl,
        occurred_at: occurredAt,
        external_id: accession,
      });
    }
  }
}

// ───────────────────────── source B: investors page ─────────────────────────

async function collectInvestorsPage(
  company: Company,
  now: Date,
  userAgent: string,
  events: NewEvent[],
  patch: CompanyPatch,
): Promise<void> {
  if (!company.domain) return;
  if (company.ir_seen_at) return; // only emitted once
  if (!isStale(company.checked_at, IR_PROBE_STALE_MS, now)) return;

  const candidates = [
    `https://${company.domain}/investors`,
    `https://${company.domain}/investor-relations`,
    `https://${company.domain}/investors/`,
    `https://ir.${company.domain}/`,
  ];

  for (const url of candidates) {
    const resp = await timedFetch(url, { headers: { "User-Agent": userAgent } });
    if (!resp || !resp.ok) continue;
    const body = await readCapped(resp, IR_BODY_CAP_BYTES);
    if (/investor/i.test(body)) {
      patch.ir_seen_at = now.toISOString();
      // First visit is a baseline: a page that already existed is not news.
      // Only a page that appears on a LATER check becomes an event/flag.
      if (!company.checked_at) return;
      events.push({
        user_id: company.user_id,
        tracked_company_id: company.id,
        company_name: company.name,
        event_type: "filing",
        subtype: "ir_page_live",
        title: "Investors page is live",
        summary: null,
        source: "ir",
        source_url: url,
        occurred_at: now.toISOString(),
        external_id: `ir:${company.domain}`,
      });
      return;
    }
  }
}

// ───────────────────────── source C: job boards ─────────────────────────────

function slugCandidates(company: Company): string[] {
  const out: string[] = [];
  if (company.domain) {
    const label = company.domain.split(".")[0];
    if (label) out.push(label.toLowerCase());
  }
  const nameSlug = company.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (nameSlug && !out.includes(nameSlug)) out.push(nameSlug);
  return out;
}

type Job = { id: string; title: string; url: string; postedAt: string | null };
const JOB_MAX_AGE_MS = 45 * 86400000;

async function fetchGreenhouse(slug: string): Promise<Job[] | null> {
  const resp = await timedFetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  if (!resp || !resp.ok) return null;
  const data = safeJson(await resp.text());
  const jobs = data?.jobs;
  if (!Array.isArray(jobs)) return null;
  return jobs.map((j: any) => ({ id: String(j.id), title: String(j.title || ""), url: String(j.absolute_url || ""), postedAt: j.updated_at ? new Date(j.updated_at).toISOString() : null }));
}

async function fetchLever(slug: string): Promise<Job[] | null> {
  const resp = await timedFetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!resp || !resp.ok) return null;
  const data = safeJson(await resp.text());
  if (!Array.isArray(data)) return null;
  return data.map((j: any) => ({ id: String(j.id), title: String(j.text || ""), url: String(j.hostedUrl || ""), postedAt: j.createdAt ? new Date(Number(j.createdAt)).toISOString() : null }));
}

async function fetchAshby(slug: string): Promise<Job[] | null> {
  const resp = await timedFetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  if (!resp || !resp.ok) return null;
  const data = safeJson(await resp.text());
  const jobs = data?.jobs;
  if (!Array.isArray(jobs)) return null;
  return jobs.map((j: any) => ({ id: String(j.id), title: String(j.title || ""), url: String(j.jobUrl || j.applyUrl || ""), postedAt: j.publishedAt ? new Date(j.publishedAt).toISOString() : null }));
}

async function collectJobBoards(
  company: Company,
  now: Date,
  events: NewEvent[],
  patch: CompanyPatch,
): Promise<void> {
  let vendor = company.ats?.vendor;
  let slug = company.ats?.slug;

  const shouldProbe =
    !company.ats || (company.ats.vendor === "none" && isStale(company.checked_at, ATS_NONE_STALE_MS, now));

  if (shouldProbe) {
    let found: { vendor: string; slug: string; jobs: Job[] } | null = null;
    for (const candidate of slugCandidates(company)) {
      const gh = await fetchGreenhouse(candidate);
      if (gh) { found = { vendor: "greenhouse", slug: candidate, jobs: gh }; break; }
      const lv = await fetchLever(candidate);
      if (lv) { found = { vendor: "lever", slug: candidate, jobs: lv }; break; }
      const ab = await fetchAshby(candidate);
      if (ab) { found = { vendor: "ashby", slug: candidate, jobs: ab }; break; }
    }
    if (found) {
      patch.ats = { vendor: found.vendor, slug: found.slug };
      vendor = found.vendor;
      slug = found.slug;
      emitJobEvents(company, found.jobs, found.vendor, events, now);
    } else {
      patch.ats = { vendor: "none" };
    }
    return;
  }

  if (vendor && vendor !== "none" && slug) {
    let jobs: Job[] | null = null;
    if (vendor === "greenhouse") jobs = await fetchGreenhouse(slug);
    else if (vendor === "lever") jobs = await fetchLever(slug);
    else if (vendor === "ashby") jobs = await fetchAshby(slug);
    if (jobs) emitJobEvents(company, jobs, vendor, events, now);
  }
}

function emitJobEvents(company: Company, jobs: Job[], vendor: string, events: NewEvent[], now: Date): void {
  for (const job of jobs) {
    const cls = classifyJobTitle(job.title);
    if (!cls) continue; // "N other roles posted" is not an event — keep noise down
    // Only roles posted recently count. A board's long-standing openings are
    // baseline, not a signal; without a posted date we cannot tell, so skip.
    if (!job.postedAt) continue;
    if (now.getTime() - new Date(job.postedAt).getTime() > JOB_MAX_AGE_MS) continue;
    events.push({
      user_id: company.user_id,
      tracked_company_id: company.id,
      company_name: company.name,
      event_type: "hire",
      subtype: cls,
      title: job.title,
      summary: null,
      source: vendor,
      source_url: job.url || null,
      occurred_at: job.postedAt,
      external_id: job.id,
    });
  }
}

// ───────────────────────── source D: news RSS ────────────────────────────────

function domainEndsWith(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

async function collectNews(
  company: Company,
  now: Date,
  userAgent: string,
  events: NewEvent[],
  patch: CompanyPatch,
): Promise<void> {
  const window = company.checked_at ? "7d" : "14d";
  const NEWS_PLAIN_CAP = 8; // plain "news" items per company per run; classified items are never capped
  let plainCount = 0;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${company.name}"`)}+when:${window}&hl=en-US&gl=US&ceid=US:en`;
  const resp = await timedFetch(url, { headers: { "User-Agent": userAgent } });
  if (!resp || !resp.ok) return;
  const xml = await resp.text();
  const itemsXml = allMatches(xml, "item", "");
  // Whole-word, case-insensitive match on the company name: lookarounds keep
  // "Ramp" from matching inside "On-ramp" or "rampant" (hyphen-adjacent
  // characters are treated as word-adjacent, not as a boundary).
  const escapedName = company.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wantedRe = new RegExp(`(?<![\\w-])${escapedName}(?![\\w-])`, "i");

  for (const itemXml of itemsXml) {
    const title = tagValue(itemXml, "title") || "";
    const link = tagValue(itemXml, "link") || "";
    const pubDate = tagValue(itemXml, "pubDate");
    const source = tagValue(itemXml, "source");
    if (!title || !link) continue;

    let hostMatches = false;
    try { hostMatches = domainEndsWith(new URL(link).hostname, company.domain || ""); } catch { /* ignore */ }
    if (!wantedRe.test(title) && !hostMatches) continue;

    const cls = classifyNewsTitle(title);
    const occurredAt = pubDate ? new Date(pubDate).toISOString() : null;
    const externalId = await sha1Hex(link);

    if (cls === "news") { if (plainCount >= NEWS_PLAIN_CAP) continue; plainCount++; }
    let eventType = "news";
    if (cls === "news_fundraise") eventType = "fundraise";
    else if (cls === "product_launch") eventType = "product";

    if (cls === "news_fundraise" && occurredAt) {
      const { round, amount } = parseFundraiseFromTitle(title);
      const isNewer = !company.last_fundraise_date || new Date(occurredAt) > new Date(company.last_fundraise_date);
      if (isNewer && (round || amount)) {
        patch.last_fundraise_date = occurredAt.slice(0, 10);
        if (round) patch.last_fundraise_round = round;
        if (amount) patch.last_fundraise_amount_usd = amount;
      }
    }

    events.push({
      user_id: company.user_id,
      tracked_company_id: company.id,
      company_name: company.name,
      event_type: eventType,
      subtype: cls,
      title,
      summary: source,
      source: "news",
      source_url: link,
      occurred_at: occurredAt,
      external_id: externalId,
    });
  }
}

// ───────────────────────── source E: DNS ─────────────────────────────────────

async function fetchDnsRecords(domain: string, type: "MX" | "NS"): Promise<string[]> {
  const resp = await timedFetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`);
  if (!resp || !resp.ok) return [];
  const data = safeJson(await resp.text());
  const answers: any[] = data?.Answer || [];
  return answers.map((a) => String(a.data || "").trim()).sort();
}

async function collectDns(
  company: Company,
  now: Date,
  events: NewEvent[],
  patch: CompanyPatch,
): Promise<void> {
  if (!company.domain) return;
  if (!isStale(company.checked_at, DNS_PROBE_STALE_MS, now)) return;

  const [mx, ns] = await Promise.all([fetchDnsRecords(company.domain, "MX"), fetchDnsRecords(company.domain, "NS")]);
  const snapshot = { mx, ns };

  if (!company.dns_snapshot) {
    patch.dns_snapshot = snapshot;
    return;
  }

  const prevMx = (company.dns_snapshot.mx || []).slice().sort();
  const prevNs = (company.dns_snapshot.ns || []).slice().sort();

  if (JSON.stringify(prevMx) !== JSON.stringify(mx) && mx.length) {
    events.push({
      user_id: company.user_id,
      tracked_company_id: company.id,
      company_name: company.name,
      event_type: "other",
      subtype: "mx_change",
      title: "Mail provider changed",
      summary: null,
      source: "dns",
      source_url: null,
      occurred_at: now.toISOString(),
      external_id: `dns:mx:${company.domain}:${now.toISOString().slice(0, 10)}`,
    });
  }
  if (JSON.stringify(prevNs) !== JSON.stringify(ns) && ns.length) {
    events.push({
      user_id: company.user_id,
      tracked_company_id: company.id,
      company_name: company.name,
      event_type: "other",
      subtype: "ns_change",
      title: "DNS provider changed",
      summary: null,
      source: "dns",
      source_url: null,
      occurred_at: now.toISOString(),
      external_id: `dns:ns:${company.domain}:${now.toISOString().slice(0, 10)}`,
    });
  }
  patch.dns_snapshot = snapshot;
}

// ───────────────────────── per-company run ─────────────────────────────────

async function collectForCompany(
  company: Company,
  now: Date,
  contactEmail: string,
  errors: string[],
): Promise<{ events: NewEvent[]; patch: CompanyPatch }> {
  const events: NewEvent[] = [];
  const patch: CompanyPatch = {};
  const userAgent = `Teplus/1.1 (${contactEmail})`;

  const sources: Array<[string, () => Promise<void>]> = [
    ["edgar", () => collectEdgar(company, now, contactEmail, events, patch)],
    ["investors", () => collectInvestorsPage(company, now, userAgent, events, patch)],
    ["jobs", () => collectJobBoards(company, now, events, patch)],
    ["news", () => collectNews(company, now, userAgent, events, patch)],
    ["dns", () => collectDns(company, now, events, patch)],
  ];

  for (const [label, run] of sources) {
    try {
      await run();
    } catch (e) {
      errors.push(`${company.name} [${label}]: ${(e as Error)?.message || String(e)}`);
    }
  }

  return { events, patch };
}

// ───────────────────────── per-user run ─────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function runForUser(admin: any, userId: string, contactEmail: string, batchSize: number, startedAt: number, errors: string[]): Promise<{ companies: number; events: number }> {
  const { data: companies, error: companiesErr } = await admin
    .from("tracked_companies")
    .select("id,user_id,name,domain,cik,ats,dns_snapshot,ir_seen_at,checked_at,last_fundraise_date,last_fundraise_round,last_fundraise_amount_usd")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("checked_at", { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (companiesErr) {
    errors.push(`select companies: ${companiesErr.message}`);
    return { companies: 0, events: 0 };
  }

  let companiesChecked = 0;
  let eventsWritten = 0;

  for (const company of (companies || []) as Company[]) {
    if (Date.now() - startedAt > MAX_ELAPSED_MS) break; // stop starting new companies past the time budget

    const now = new Date();
    const { events, patch } = await collectForCompany(company, now, contactEmail, errors);

    if (events.length) {
      const { error: insertErr } = await admin
        .from("company_events")
        .upsert(events, { onConflict: "user_id,source,external_id", ignoreDuplicates: true });
      if (insertErr) errors.push(`${company.name} [write events]: ${insertErr.message}`);
      else eventsWritten += events.length;
    }

    // Reach out is computed from the DB's events for this company (not just
    // this run's new ones), so a company whose window is still open keeps
    // showing the flag even on a run with no new events.
    const { data: allEvents } = await admin
      .from("company_events")
      .select("subtype,occurred_at,detected_at,title")
      .eq("tracked_company_id", company.id);

    const reachOut = computeReachOut((allEvents || []) as any, now);

    let lastSignalAt: string | null = null;
    if (allEvents && allEvents.length) {
      const times = allEvents.map((e: any) => e.occurred_at || e.detected_at).filter(Boolean);
      if (times.length) lastSignalAt = times.sort().slice(-1)[0];
    }

    const update: Record<string, unknown> = {
      checked_at: now.toISOString(),
      reach_out: reachOut.reach_out,
      why_now: reachOut.why_now,
      reach_out_until: reachOut.reach_out_until,
      ...patch,
    };
    if (lastSignalAt) update.last_signal_at = lastSignalAt;

    const { error: updateErr } = await admin.from("tracked_companies").update(update).eq("id", company.id);
    if (updateErr) errors.push(`${company.name} [update company]: ${updateErr.message}`);

    companiesChecked++;
  }

  return { companies: companiesChecked, events: eventsWritten };
}

// ───────────────────────── entry point ─────────────────────────────────────

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const secret = Deno.env.get("COVERAGE_SECRET");
  if (!secret || req.headers.get("x-coverage-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  // deno-lint-ignore no-explicit-any
  const admin: any = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const errors: string[] = [];
  let totalCompanies = 0;
  let totalEvents = 0;

  try {
    const { data: settingsRows, error: settingsErr } = await admin
      .from("app_settings")
      .select("user_id,coverage_enabled,coverage_contact_email,coverage_batch");

    if (settingsErr) {
      errors.push(`select app_settings: ${settingsErr.message}`);
    }

    for (const settings of settingsRows || []) {
      if (Date.now() - startedAt > MAX_ELAPSED_MS) break;
      // Keep-alive heartbeat. Free Supabase projects pause after 7 days without
      // a database request; this write happens on EVERY scheduled call, even
      // with coverage switched off, so the schedule alone keeps the project
      // awake. If a project still pauses, see "Keep-alive" in README.md.
      await admin.from("app_settings").update({ keepalive_at: new Date().toISOString() }).eq("user_id", settings.user_id);
      if (!settings.coverage_enabled) continue;
      if (!settings.coverage_contact_email) {
        errors.push(`user ${settings.user_id}: coverage_enabled but no coverage_contact_email set`);
        continue;
      }

      const batchSize = settings.coverage_batch && settings.coverage_batch > 0 ? settings.coverage_batch : 8;
      const userErrors: string[] = [];
      let result = { companies: 0, events: 0 };
      try {
        result = await runForUser(admin, settings.user_id, settings.coverage_contact_email, batchSize, startedAt, userErrors);
      } catch (e) {
        userErrors.push(`user ${settings.user_id}: ${(e as Error)?.message || String(e)}`);
      }

      totalCompanies += result.companies;
      totalEvents += result.events;
      errors.push(...userErrors);

      const ranAt = new Date();
      await admin.from("app_settings").update({ coverage_last_run_at: ranAt.toISOString() }).eq("user_id", settings.user_id);
      await admin.from("coverage_runs").insert({
        user_id: settings.user_id,
        ran_at: ranAt.toISOString(),
        companies: result.companies,
        events: result.events,
        ms: Date.now() - startedAt,
        errors: userErrors,
      });

      // Keep only the newest COVERAGE_RUNS_KEEP rows for this user.
      const { data: oldRuns } = await admin
        .from("coverage_runs")
        .select("id")
        .eq("user_id", settings.user_id)
        .order("ran_at", { ascending: false })
        .range(COVERAGE_RUNS_KEEP, COVERAGE_RUNS_KEEP + 500);
      if (oldRuns && oldRuns.length) {
        await admin.from("coverage_runs").delete().in("id", oldRuns.map((r: any) => r.id));
      }
    }
  } catch (e) {
    errors.push((e as Error)?.message || String(e));
  }

  return json({
    companies: totalCompanies,
    events: totalEvents,
    ms: Date.now() - startedAt,
    errors,
  });
});
