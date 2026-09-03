// Deno tests for the pure coverage rules: classifyJobTitle, classifyNewsTitle,
// classify8kItems, and computeReachOut. Run with: deno test
// supabase/functions/coverage/rules_test.ts
//
// Covers every subtype row in docs/SPEC-companies.md §5, plus the reach-out
// window edges (just inside / just outside).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classify8kItems, classifyJobTitle, classifyNewsTitle, computeReachOut } from "./rules.ts";

// ───────────────────────── classifyJobTitle ─────────────────────────

Deno.test("classifyJobTitle: finance/IR titles", () => {
  assertEquals(classifyJobTitle("Chief Financial Officer"), "finance_hiring");
  assertEquals(classifyJobTitle("VP, Finance"), "finance_hiring");
  assertEquals(classifyJobTitle("Head of Finance"), "finance_hiring");
  assertEquals(classifyJobTitle("Finance Director"), "finance_hiring");
  assertEquals(classifyJobTitle("Controller"), "finance_hiring");
  assertEquals(classifyJobTitle("Investor Relations Manager"), "finance_hiring");
  assertEquals(classifyJobTitle("Head of IR"), "finance_hiring");
  assertEquals(classifyJobTitle("Treasurer"), "finance_hiring");
  assertEquals(classifyJobTitle("FP&A Analyst"), "finance_hiring");
});

Deno.test("classifyJobTitle: ERP titles", () => {
  assertEquals(classifyJobTitle("NetSuite Administrator"), "erp_hiring");
  assertEquals(classifyJobTitle("Workday Analyst"), "erp_hiring");
  assertEquals(classifyJobTitle("SAP Consultant"), "erp_hiring");
  assertEquals(classifyJobTitle("Oracle ERP Specialist"), "erp_hiring");
  assertEquals(classifyJobTitle("ERP Implementation Lead"), "erp_hiring");
});

Deno.test("classifyJobTitle: senior titles", () => {
  assertEquals(classifyJobTitle("Chief Marketing Officer"), "senior_hiring");
  assertEquals(classifyJobTitle("VP of Sales"), "senior_hiring");
  assertEquals(classifyJobTitle("Vice President, Engineering"), "senior_hiring");
  assertEquals(classifyJobTitle("Head of Product"), "senior_hiring");
  assertEquals(classifyJobTitle("General Counsel"), "senior_hiring");
});

Deno.test("classifyJobTitle: finance/IR wins over generic senior when both match", () => {
  // "Chief Financial Officer" contains "chief" (senior) and "chief financial" (finance).
  // Finance/IR check runs first, so it should win.
  assertEquals(classifyJobTitle("Chief Financial Officer"), "finance_hiring");
});

Deno.test("classifyJobTitle: everything else is not emitted", () => {
  assertEquals(classifyJobTitle("Software Engineer"), null);
  assertEquals(classifyJobTitle("Customer Support Specialist"), null);
  assertEquals(classifyJobTitle(""), null);
});

// ───────────────────────── classifyNewsTitle ─────────────────────────

Deno.test("classifyNewsTitle: senior_arrival", () => {
  assertEquals(classifyNewsTitle("Acme Corp Appoints Jane Doe as CFO"), "senior_arrival");
  assertEquals(classifyNewsTitle("Acme names new Chief Executive"), "senior_arrival");
  assertEquals(classifyNewsTitle("Acme hires a VP of Sales"), "senior_arrival");
  assertEquals(classifyNewsTitle("Jane Doe joins Acme as President"), "senior_arrival");
  assertEquals(classifyNewsTitle("Acme promotes John Smith to COO"), "senior_arrival");
});

Deno.test("classifyNewsTitle: exec_departure", () => {
  assertEquals(classifyNewsTitle("Acme CFO steps down"), "exec_departure");
  assertEquals(classifyNewsTitle("Acme CEO departs after five years"), "exec_departure");
  assertEquals(classifyNewsTitle("Jane Doe resigns as COO of Acme"), "exec_departure");
  assertEquals(classifyNewsTitle("Longtime exec exits Acme"), "exec_departure");
  assertEquals(classifyNewsTitle("Acme CTO leaves the company"), "exec_departure");
});

Deno.test("classifyNewsTitle: news_fundraise", () => {
  assertEquals(classifyNewsTitle("Acme raises $20 million Series B"), "news_fundraise");
  assertEquals(classifyNewsTitle("Acme closes $5M seed round"), "news_fundraise");
  assertEquals(classifyNewsTitle("Acme secures $1 billion in funding"), "news_fundraise");
});

Deno.test("classifyNewsTitle: partner_pr", () => {
  assertEquals(classifyNewsTitle("Acme partners with Globex"), "partner_pr");
  assertEquals(classifyNewsTitle("Acme announces partnership with Initech"), "partner_pr");
  assertEquals(classifyNewsTitle("Acme teams up with Umbrella Corp"), "partner_pr");
  assertEquals(classifyNewsTitle("Globex selects Acme as vendor"), "partner_pr");
  assertEquals(classifyNewsTitle("Initech chooses Acme for cloud services"), "partner_pr");
});

Deno.test("classifyNewsTitle: product_launch", () => {
  assertEquals(classifyNewsTitle("Acme launches new platform"), "product_launch");
  assertEquals(classifyNewsTitle("Acme unveils next-gen product"), "product_launch");
  assertEquals(classifyNewsTitle("Acme introduces AI assistant"), "product_launch");
  assertEquals(classifyNewsTitle("Acme releases version 2.0"), "product_launch");
});

Deno.test("classifyNewsTitle: fallback news", () => {
  assertEquals(classifyNewsTitle("Acme reports quarterly earnings"), "news");
  assertEquals(classifyNewsTitle(""), "news");
});

Deno.test("classifyNewsTitle: fundraise verb without amount doesn't match", () => {
  // "raises" alone (no $/million/billion/Series/seed) should not be news_fundraise.
  assertEquals(classifyNewsTitle("Acme raises concerns about market"), "news");
});

// ───────────────────────── classify8kItems ─────────────────────────

Deno.test("classify8kItems: each mapped item", () => {
  assertEquals(classify8kItems("5.02").subtype, "8_k_leadership_change");
  assertEquals(classify8kItems("1.01").subtype, "8_k_material_contract");
  assertEquals(classify8kItems("2.01").subtype, "8_k_acquisition");
  assertEquals(classify8kItems("3.02").subtype, "8_k_financing");
  assertEquals(classify8kItems("1.03").subtype, "8_k_bankruptcy");
  assertEquals(classify8kItems("4.02").subtype, "8_k_restatement");
  assertEquals(classify8kItems("2.02").subtype, "8_k_results");
});

Deno.test("classify8kItems: unmapped item falls back to other", () => {
  assertEquals(classify8kItems("7.01").subtype, "8_k_other");
  assertEquals(classify8kItems("").subtype, "8_k_other");
  assertEquals(classify8kItems(null).subtype, "8_k_other");
  assertEquals(classify8kItems(undefined).subtype, "8_k_other");
});

Deno.test("classify8kItems: multiple items picks first recognized, title lists all in words", () => {
  const result = classify8kItems("1.01,5.02");
  assertEquals(result.subtype, "8_k_material_contract");
  assertEquals(result.title, "8-K: Material Agreement, Leadership Change");
});

Deno.test("classify8kItems: accepts array form", () => {
  const result = classify8kItems(["2.02"]);
  assertEquals(result.subtype, "8_k_results");
  assertEquals(result.title, "8-K: Results of Operations");
});

// ───────────────────────── computeReachOut ─────────────────────────

const NOW = new Date("2026-09-03T12:00:00Z");

function daysBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86400000).toISOString();
}

Deno.test("computeReachOut: no events -> no flag", () => {
  const result = computeReachOut([], NOW);
  assertEquals(result, { reach_out: false, why_now: null, reach_out_until: null });
});

Deno.test("computeReachOut: unrecognized subtype never triggers", () => {
  const result = computeReachOut(
    [{ subtype: "news", occurred_at: daysBefore(NOW, 1), detected_at: null, title: "Acme in the news" }],
    NOW,
  );
  assertEquals(result.reach_out, false);
});

// --- 30-day window subtypes ---

Deno.test("computeReachOut: form_d inside window (today)", () => {
  const result = computeReachOut(
    [{ subtype: "form_d", occurred_at: NOW.toISOString(), detected_at: null, title: null }],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "Filed a Form D today");
});

Deno.test("computeReachOut: form_d just inside window (29 days)", () => {
  const result = computeReachOut(
    [{ subtype: "form_d", occurred_at: daysBefore(NOW, 29), detected_at: null, title: null }],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "Filed a Form D 29 days ago");
});

Deno.test("computeReachOut: form_d just outside window (31 days)", () => {
  const result = computeReachOut(
    [{ subtype: "form_d", occurred_at: daysBefore(NOW, 31), detected_at: null, title: null }],
    NOW,
  );
  assertEquals(result.reach_out, false);
  assertEquals(result.why_now, null);
  assertEquals(result.reach_out_until, null);
});

Deno.test("computeReachOut: s_1 inside window", () => {
  const result = computeReachOut(
    [{ subtype: "s_1", occurred_at: daysBefore(NOW, 10), detected_at: null, title: null }],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "Filed an S-1 10 days ago");
});

Deno.test("computeReachOut: 8_k_financing inside window", () => {
  const result = computeReachOut(
    [{ subtype: "8_k_financing", occurred_at: daysBefore(NOW, 1), detected_at: null, title: null }],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "Financing 8-K yesterday");
});

Deno.test("computeReachOut: news_fundraise inside window", () => {
  const result = computeReachOut(
    [{ subtype: "news_fundraise", occurred_at: daysBefore(NOW, 5), detected_at: null, title: "Acme raises $10M" }],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "Raised money 5 days ago");
});

// --- 45-day window subtypes ---

Deno.test("computeReachOut: 8_k_leadership_change with parseable role", () => {
  const result = computeReachOut(
    [{
      subtype: "8_k_leadership_change",
      occurred_at: daysBefore(NOW, 12),
      detected_at: null,
      title: "8-K: Leadership Change — Jane Doe appointed as Chief Financial Officer",
    }],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "New Chief Financial Officer announced 12 days ago");
});

Deno.test("computeReachOut: 8_k_leadership_change without parseable role falls back", () => {
  const result = computeReachOut(
    [{ subtype: "8_k_leadership_change", occurred_at: daysBefore(NOW, 12), detected_at: null, title: "8-K: Leadership Change" }],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "New leadership change 12 days ago");
});

Deno.test("computeReachOut: senior_arrival with role", () => {
  const result = computeReachOut(
    [{ subtype: "senior_arrival", occurred_at: daysBefore(NOW, 12), detected_at: null, title: "Acme appoints Jane Doe as CFO" }],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "New CFO announced 12 days ago");
});

Deno.test("computeReachOut: exec_departure with role", () => {
  const result = computeReachOut(
    [{ subtype: "exec_departure", occurred_at: daysBefore(NOW, 3), detected_at: null, title: "Acme CFO steps down" }],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "CFO departed 3 days ago");
});

Deno.test("computeReachOut: exec_departure without parseable role falls back", () => {
  const result = computeReachOut(
    [{ subtype: "exec_departure", occurred_at: daysBefore(NOW, 3), detected_at: null, title: "Longtime exec exits Acme" }],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "Leadership change 3 days ago");
});

Deno.test("computeReachOut: 45-day window just inside (44 days)", () => {
  const result = computeReachOut(
    [{ subtype: "senior_arrival", occurred_at: daysBefore(NOW, 44), detected_at: null, title: "Acme names new CEO" }],
    NOW,
  );
  assertEquals(result.reach_out, true);
});

Deno.test("computeReachOut: 45-day window just outside (46 days)", () => {
  const result = computeReachOut(
    [{ subtype: "senior_arrival", occurred_at: daysBefore(NOW, 46), detected_at: null, title: "Acme names new CEO" }],
    NOW,
  );
  assertEquals(result.reach_out, false);
});

// --- 60-day window subtypes ---

Deno.test("computeReachOut: ir_page_live inside window", () => {
  const result = computeReachOut(
    [{ subtype: "ir_page_live", occurred_at: daysBefore(NOW, 30), detected_at: null, title: null }],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "Investors page went live 30 days ago");
});

Deno.test("computeReachOut: ir_page_live just inside window (59 days)", () => {
  const result = computeReachOut(
    [{ subtype: "ir_page_live", occurred_at: daysBefore(NOW, 59), detected_at: null, title: null }],
    NOW,
  );
  assertEquals(result.reach_out, true);
});

Deno.test("computeReachOut: ir_page_live just outside window (61 days)", () => {
  const result = computeReachOut(
    [{ subtype: "ir_page_live", occurred_at: daysBefore(NOW, 61), detected_at: null, title: null }],
    NOW,
  );
  assertEquals(result.reach_out, false);
});

Deno.test("computeReachOut: finance_hiring with parseable title", () => {
  const result = computeReachOut(
    [{ subtype: "finance_hiring", occurred_at: daysBefore(NOW, 40), detected_at: null, title: "VP, Finance" }],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "Hiring a VP, Finance 40 days ago");
});

Deno.test("computeReachOut: erp_hiring uses fixed phrasing", () => {
  const result = computeReachOut(
    [{ subtype: "erp_hiring", occurred_at: daysBefore(NOW, 2), detected_at: null, title: "NetSuite Administrator" }],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "Hiring for an ERP migration 2 days ago");
});

// --- multiple events: most recent qualifying trigger wins ---

Deno.test("computeReachOut: most recent qualifying event wins across subtypes", () => {
  const result = computeReachOut(
    [
      { subtype: "form_d", occurred_at: daysBefore(NOW, 20), detected_at: null, title: null },
      { subtype: "finance_hiring", occurred_at: daysBefore(NOW, 2), detected_at: null, title: "Controller" },
    ],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "Hiring a Controller 2 days ago");
});

Deno.test("computeReachOut: expired event ignored even if only event", () => {
  const result = computeReachOut(
    [{ subtype: "form_d", occurred_at: daysBefore(NOW, 200), detected_at: null, title: null }],
    NOW,
  );
  assertEquals(result.reach_out, false);
});

Deno.test("computeReachOut: falls back to detected_at when occurred_at is missing", () => {
  const result = computeReachOut(
    [{ subtype: "form_d", occurred_at: null, detected_at: daysBefore(NOW, 5), title: null }],
    NOW,
  );
  assertEquals(result.reach_out, true);
  assertEquals(result.why_now, "Filed a Form D 5 days ago");
});

Deno.test("computeReachOut: reach_out_until equals event date plus window", () => {
  const eventIso = daysBefore(NOW, 10);
  const result = computeReachOut([{ subtype: "form_d", occurred_at: eventIso, detected_at: null, title: null }], NOW);
  const expected = new Date(new Date(eventIso).getTime() + 30 * 86400000).toISOString();
  assertEquals(result.reach_out_until, expected);
});
