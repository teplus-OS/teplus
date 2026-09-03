// Teplus coverage collector — pure classification and reach-out rules.
// Kept in its own module (no Deno/network/DB imports) so it can be unit
// tested in isolation. See docs/SPEC-companies.md §5 for the rule table this
// implements, and README.md in this directory for the human-facing version.

// ───────────────────────── job title classifier (§4.C) ─────────────────────

export type JobTitleClass = "finance_hiring" | "erp_hiring" | "senior_hiring" | null;

const FINANCE_IR_RE =
  /\b(chief financial|cfo|vp,? finance|head of finance|finance director|controller|investor relations|head of ir|treasurer|fp&a)\b/i;
const ERP_RE = /\b(netsuite|workday|sap|oracle erp|erp)\b/i;
const SENIOR_RE = /\b(chief|vp|vice president|head of|general counsel)\b/i;

export function classifyJobTitle(title: string): JobTitleClass {
  if (!title) return null;
  if (FINANCE_IR_RE.test(title)) return "finance_hiring";
  if (ERP_RE.test(title)) return "erp_hiring";
  if (SENIOR_RE.test(title)) return "senior_hiring";
  return null;
}

// ───────────────────────── news title classifier (§4.D) ────────────────────

export type NewsTitleClass =
  | "senior_arrival"
  | "exec_departure"
  | "news_fundraise"
  | "partner_pr"
  | "product_launch"
  | "news";

const ARRIVAL_VERB_RE = /\b(appoints|names|hires|taps|joins .* as|promot)\w*\b/i;
const SENIOR_ROLE_RE = /\b(ceo|cfo|coo|cto|cro|chief|president|vp|head of)\b/i;
const DEPARTURE_RE = /\b(steps down|departs|resigns|exits|leaves)\b/i;
const FUNDRAISE_VERB_RE = /\b(raises|raised|closes|secures)\b/i;
const FUNDRAISE_AMOUNT_RE = /\b(\$|million|billion|series [a-e]|seed)\b/i;
// Earnings/results language that should never be classified as a fundraise,
// even when a fundraise-shaped verb ("raises", "raised") shows up in a
// "revenue raised" / "guidance raised" sentence.
const EARNINGS_EXCLUDE_RE =
  /\b(revenue|earnings|guidance|stock|shares|quarter|q[1-4]|fiscal|results|profit|sales rise|arr)\b/i;
// A fundraise needs a funding-specific word alongside the verb — "raises" or
// "secures" alone is also used for revenue/guidance headlines.
const FUNDRAISE_WORD_RE =
  /\b(funding|round|raises?|raised|series [a-e]|seed|investors?|valuation|financing)\b/i;
const PARTNER_RE = /\b(partners with|partnership|teams up|selects|chooses)\b/i;
const PRODUCT_RE = /\b(launches|unveils|introduces|releases)\b/i;

export function classifyNewsTitle(title: string): NewsTitleClass {
  if (!title) return "news";
  if (ARRIVAL_VERB_RE.test(title) && SENIOR_ROLE_RE.test(title)) return "senior_arrival";
  if (DEPARTURE_RE.test(title)) return "exec_departure";
  if (
    FUNDRAISE_VERB_RE.test(title) &&
    FUNDRAISE_AMOUNT_RE.test(title) &&
    FUNDRAISE_WORD_RE.test(title) &&
    !EARNINGS_EXCLUDE_RE.test(title)
  ) return "news_fundraise";
  if (PARTNER_RE.test(title)) return "partner_pr";
  if (PRODUCT_RE.test(title)) return "product_launch";
  return "news";
}

const ROUND_RE = /\bseries\s+([a-e])\b/i;
const AMOUNT_RE = /\$\s?([\d.]+)\s?(million|billion|m|b)?\b/i;

export function parseFundraiseFromTitle(title: string): { round: string | null; amount: number | null } {
  let round: string | null = null;
  const roundMatch = title.match(ROUND_RE);
  if (roundMatch) round = `Series ${roundMatch[1].toUpperCase()}`;
  else if (/\bseed\b/i.test(title)) round = "Seed";

  let amount: number | null = null;
  const amountMatch = title.match(AMOUNT_RE);
  if (amountMatch) {
    const n = parseFloat(amountMatch[1]);
    const unit = (amountMatch[2] || "").toLowerCase();
    if (unit.startsWith("b")) amount = n * 1_000_000_000;
    else if (unit.startsWith("m") || unit === "") amount = n * 1_000_000;
  }
  return { round, amount };
}

// ───────────────────────── 8-K item classifier (§4.A) ───────────────────────

export type EightKSubtype =
  | "8_k_leadership_change"
  | "8_k_material_contract"
  | "8_k_acquisition"
  | "8_k_financing"
  | "8_k_bankruptcy"
  | "8_k_restatement"
  | "8_k_results"
  | "8_k_other";

const EIGHT_K_ITEM_MAP: Record<string, EightKSubtype> = {
  "5.02": "8_k_leadership_change",
  "1.01": "8_k_material_contract",
  "2.01": "8_k_acquisition",
  "3.02": "8_k_financing",
  "1.03": "8_k_bankruptcy",
  "4.02": "8_k_restatement",
  "2.02": "8_k_results",
};

const EIGHT_K_ITEM_WORDS: Record<string, string> = {
  "5.02": "Leadership Change",
  "1.01": "Material Agreement",
  "2.01": "Acquisition",
  "3.02": "Unregistered Sale of Securities",
  "1.03": "Bankruptcy",
  "4.02": "Non-Reliance on Prior Financials",
  "2.02": "Results of Operations",
};

// items: e.g. "1.01,5.02" (as EDGAR full text search returns it) or an array
// of item codes. Returns the subtype for the FIRST recognized item (item
// order as filed) and a human title "8-K: <items in words>".
export function classify8kItems(
  items: string | string[] | null | undefined,
): { subtype: EightKSubtype; title: string } {
  const list = Array.isArray(items)
    ? items
    : (items || "").split(",").map((s) => s.trim()).filter(Boolean);

  if (list.length === 0) {
    return { subtype: "8_k_other", title: "8-K: Other Events" };
  }

  let subtype: EightKSubtype | undefined;
  for (const item of list) {
    const mapped = EIGHT_K_ITEM_MAP[item];
    if (mapped) { subtype = mapped; break; }
  }

  const words = list.map((item) => EIGHT_K_ITEM_WORDS[item] || item).join(", ");
  return { subtype: subtype || "8_k_other", title: `8-K: ${words}` };
}

// ───────────────────────── reach out rule (§5) ─────────────────────────────

export type ReachOutEvent = {
  subtype: string | null;
  occurred_at: string | null; // ISO
  detected_at: string | null; // ISO, fallback
  title?: string | null;
};

export type ReachOutResult = {
  reach_out: boolean;
  why_now: string | null;
  reach_out_until: string | null; // ISO
};

// Windows and phrasing, in priority order — first matching subtype (by most
// recent qualifying event) wins. Order here matters only for tie-breaking
// when two different subtypes' events land on the exact same instant; the
// real tie-break is "most recent event, across all trigger subtypes".
const WINDOWS_DAYS: Record<string, number> = {
  form_d: 30,
  s_1: 30,
  "8_k_financing": 30,
  news_fundraise: 30,
  "8_k_leadership_change": 45,
  senior_arrival: 45,
  exec_departure: 45,
  ir_page_live: 60,
  finance_hiring: 60,
  erp_hiring: 60,
};

const DAY_MS = 86400000;

function ageText(eventDate: Date, now: Date): string {
  const diffDays = Math.floor((startOfDay(now).getTime() - startOfDay(eventDate).getTime()) / DAY_MS);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Best-effort role extraction from a hiring/leadership-change title, e.g.
// "Acme Corp Appoints Jane Doe as Chief Financial Officer" -> "Chief Financial
// Officer". Falls back to null (caller uses "leadership change") when it
// can't find an "as <role>" or a bare title pattern.
function extractRole(title: string | null | undefined): string | null {
  if (!title) return null;
  // Only a recognizable title word counts. "as executive chair to join X"
  // style fragments produced ugly why-now lines, so the loose "as <words>"
  // pattern is gone; a known role word is required.
  const roleMatch = title.match(
    /\b((?:Chief [A-Za-z]+ Officer)|CFO|CEO|COO|CTO|CRO|President|Vice President(?: of [A-Za-z ]+)?|VP(?:,? [A-Za-z ]+)?|General Counsel|Controller|Treasurer|Head of [A-Za-z ]+)\b/,
  );
  if (roleMatch) return roleMatch[1].trim();
  return null;
}

function whyNowFor(subtype: string, title: string | null | undefined, age: string): string | null {
  switch (subtype) {
    case "form_d":
      return `Filed a Form D ${age}`;
    case "s_1":
      return `Filed an S-1 ${age}`;
    case "8_k_financing":
      return `Financing 8-K ${age}`;
    case "news_fundraise":
      return `Raised money ${age}`;
    case "8_k_leadership_change":
    case "senior_arrival": {
      const role = extractRole(title);
      return role ? `New ${role} announced ${age}` : `Leadership change reported ${age}`;
    }
    case "exec_departure": {
      const role = extractRole(title);
      return role ? `${role} departure reported ${age}` : `Leadership departure reported ${age}`;
    }
    case "ir_page_live":
      return `Investors page went live ${age}`;
    case "finance_hiring": {
      const role = extractRole(title);
      return role ? `Hiring a ${role} ${age}` : `Hiring for finance ${age}`;
    }
    case "erp_hiring":
      return `Hiring for an ERP migration ${age}`;
    default:
      return null;
  }
}

// Pure function: given a company's events (any order) and "now", decide the
// reach out flag. Newest qualifying event wins; a subtype not in the table
// never triggers. `now` is injected so this stays pure and testable.
export function computeReachOut(events: ReachOutEvent[], now: Date): ReachOutResult {
  let best: { date: Date; subtype: string; title: string | null | undefined; until: Date } | null = null;

  for (const ev of events) {
    if (!ev.subtype) continue;
    const windowDays = WINDOWS_DAYS[ev.subtype];
    if (windowDays === undefined) continue;

    const rawDate = ev.occurred_at || ev.detected_at;
    if (!rawDate) continue;
    const eventDate = new Date(rawDate);
    if (isNaN(eventDate.getTime())) continue;

    const until = new Date(eventDate.getTime() + windowDays * DAY_MS);
    if (until.getTime() <= now.getTime()) continue; // outside its window

    if (!best || eventDate.getTime() > best.date.getTime()) {
      best = { date: eventDate, subtype: ev.subtype, title: ev.title, until };
    }
  }

  if (!best) {
    return { reach_out: false, why_now: null, reach_out_until: null };
  }

  const age = ageText(best.date, now);
  const why_now = whyNowFor(best.subtype, best.title, age);
  return {
    reach_out: true,
    why_now,
    reach_out_until: best.until.toISOString(),
  };
}
