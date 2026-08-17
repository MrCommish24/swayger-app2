/**
 * server/test-open-roster-parity.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 6A — Open-Roster Parity verification fixture.
 *
 * Answers THREE questions with real HTTP + DB observations:
 *
 *   Q1. When single-add is called during an OPEN weekly Swayger:
 *       does the weekly card's roster_revision increment?
 *       do answer_options expand for roster-target props?
 *
 *   Q2. Same questions for the bulk endpoint.
 *
 *   Q3. When the weekly card is LOCKED, do both endpoints correctly leave the
 *       weekly answer universe untouched?
 *
 * Uses a real fixture:
 *   Commissioner + Darius / Mike / Chris   (initial roster)
 *   Publish Week 3 while card is OPEN
 *   Add Rob / Grim via each path
 */

import { createClient } from "@supabase/supabase-js";

const BASE          = process.env.TEST_API_BASE       ?? "http://localhost:5000";
const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON_KEY      = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── helpers ────────────────────────────────────────────────────────────────────

function uuid(): string { return crypto.randomUUID(); }

async function signIn(email: string, pw: string): Promise<string> {
  const { data, error } = await createClient(SUPABASE_URL, ANON_KEY)
    .auth.signInWithPassword({ email, password: pw });
  if (error || !data.session) throw new Error(`signIn: ${error?.message}`);
  return data.session.access_token;
}

async function mkUser(prefix: string) {
  const ts    = Date.now() + Math.floor(Math.random() * 99999);
  const email = `${prefix}-${ts}@orp-fixture.test`;
  const pw    = "P@ssw0rd123!";
  const { data, error } = await supa.auth.admin.createUser({
    email, password: pw, email_confirm: true,
  });
  if (error || !data.user) throw new Error(`mkUser(${prefix}): ${error?.message}`);
  return { email, pw, userId: data.user.id };
}

async function api(
  method: string,
  path: string,
  token: string | null,
  body?: object
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

async function apiIK(
  method: string,
  path: string,
  token: string | null,
  body?: object
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Idempotency-Key": uuid(),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

async function getRosterRevision(cardId: string): Promise<number> {
  const { data } = await supa
    .from("gameday_pick_cards")
    .select("roster_revision")
    .eq("id", cardId)
    .maybeSingle();
  return (data as any)?.roster_revision ?? 0;
}

async function getAnswerOptions(cardId: string): Promise<{ propId: string; type: string; count: number; labels: string[] }[]> {
  const { data: props } = await supa
    .from("gameday_props")
    .select("id, answer_target_type, answer_options")
    .eq("card_id", cardId);
  return ((props ?? []) as any[]).map((p: any) => ({
    propId: p.id,
    type:   p.answer_target_type,
    count:  Array.isArray(p.answer_options) ? p.answer_options.length : 0,
    labels: Array.isArray(p.answer_options)
      ? (p.answer_options as any[]).map((o: any) => o.label ?? o.id ?? "?")
      : [],
  }));
}

// ── Fixture builder ─────────────────────────────────────────────────────────────

interface Fixture {
  commToken:  string;
  leagueId:   string;
  seasonId:   string;
  cardId:     string;         // weekly pick card ID (Week 3)
  roomId:     string;
  templatePropIds: string[];
}

async function buildFixture(tag: string): Promise<Fixture> {
  const comm = await mkUser(`${tag}-comm`);
  const commToken = await signIn(comm.email, comm.pw);

  // League + season setup
  const setup = await apiIK("POST", "/api/fantasy/leagues/setup", commToken, {
    league_name:  `ORP-${tag} League`,
    sport:        "football",
    display_name: "Commissioner",
    team_name:    "Commissioner Team",
    season_year:  2026,
  });
  if (setup.status !== 201) throw new Error(`setup: ${JSON.stringify(setup.data)}`);
  const { league_id: leagueId, season_id: seasonId } = setup.data;

  // Add initial roster: Darius, Mike, Chris
  for (const [dn, tn] of [["Darius", "The Monstars"], ["Mike", "Sunday Scaries"], ["Chris", "Chrissy's Angels"]]) {
    const r = await apiIK("POST", `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/participants`, commToken, {
      display_name: dn, team_name: tn,
    });
    if (r.status !== 201) throw new Error(`addMember(${dn}): ${JSON.stringify(r.data)}`);
  }

  // Get template prop IDs for a weekly publish
  const tRes = await api("GET",
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/3/templates`,
    commToken
  );
  const templatePropIds: string[] = ((tRes.data?.templates ?? []) as any[])
    .filter((t: any) => t.is_default)
    .map((t: any) => t.id)
    .slice(0, 5);

  if (templatePropIds.length === 0) throw new Error("No template props available");

  // Publish Week 1 — card is immediately open
  const pubRes = await apiIK("POST",
    `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/1/publish`,
    commToken,
    { selected_prop_ids: templatePropIds }
  );
  if (![200, 201].includes(pubRes.status)) throw new Error(`publish: ${JSON.stringify(pubRes.data)}`);
  const roomId = pubRes.data.room_id;
  const cardId = pubRes.data.card_id;

  return { commToken, leagueId, seasonId, cardId, roomId, templatePropIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// OBSERVATION REPORT (no assertions — just log what actually happens)
// ─────────────────────────────────────────────────────────────────────────────

async function observeSingleAdd(fix: Fixture, label: string): Promise<void> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${label}`);
  console.log("═".repeat(70));

  // Verify card is open
  const { data: card } = await supa
    .from("gameday_pick_cards")
    .select("status, phase, roster_revision")
    .eq("id", fix.cardId)
    .maybeSingle();
  console.log(`  Card phase: ${(card as any)?.phase}  status: ${(card as any)?.status}  roster_revision before: ${(card as any)?.roster_revision}`);

  // Answer options BEFORE
  const optsBefore = await getAnswerOptions(fix.cardId);
  const rosterProps = optsBefore.filter((p) => p.type === "season_member" || p.type === "fantasy_team");
  console.log(`  Roster-target props: ${rosterProps.length}`);
  rosterProps.forEach((p) => {
    console.log(`    prop(${p.type}): ${p.count} options — [${p.labels.join(", ")}]`);
  });

  const rrBefore = await getRosterRevision(fix.cardId);

  // Single-add Rob / Grim while weekly is OPEN
  const addRes = await apiIK(
    "POST",
    `/api/fantasy/leagues/${fix.leagueId}/seasons/${fix.seasonId}/participants`,
    fix.commToken,
    { display_name: "Rob", team_name: "Grim" }
  );
  console.log(`\n  Single-add Rob/Grim → status=${addRes.status}  draft_day_eligible=${addRes.data.draft_day_eligible}  already_exists=${addRes.data.already_exists}`);

  // roster_revision AFTER
  const rrAfter = await getRosterRevision(fix.cardId);
  console.log(`  roster_revision: before=${rrBefore}  after=${rrAfter}  delta=${rrAfter - rrBefore}`);

  // answer_options AFTER
  const optsAfter = await getAnswerOptions(fix.cardId);
  const rosterPropsAfter = optsAfter.filter((p) => p.type === "season_member" || p.type === "fantasy_team");
  rosterPropsAfter.forEach((p) => {
    console.log(`    prop(${p.type}): ${p.count} options — [${p.labels.join(", ")}]`);
  });

  // VERDICT
  if (rrAfter > rrBefore) {
    console.log("\n  ✅ VERDICT: roster_revision DID increment → open-roster expansion IS working for weekly");
  } else {
    console.log("\n  ❌ VERDICT: roster_revision did NOT increment → open-roster expansion NOT working for weekly");
    console.log("     (matches Draft-Day-only implementation: p_room_id was null or RPC filtered by phase='draft_day')");
  }

  const countBefore = rosterProps.reduce((s, p) => s + p.count, 0);
  const countAfter  = rosterPropsAfter.reduce((s, p) => s + p.count, 0);
  if (countAfter > countBefore) {
    console.log("  ✅ answer_options DID expand");
  } else {
    console.log("  ❌ answer_options did NOT expand");
  }
}

async function observeBulkAdd(fix: Fixture, label: string): Promise<void> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${label}`);
  console.log("═".repeat(70));

  const { data: card } = await supa
    .from("gameday_pick_cards")
    .select("status, phase, roster_revision")
    .eq("id", fix.cardId)
    .maybeSingle();
  console.log(`  Card phase: ${(card as any)?.phase}  status: ${(card as any)?.status}  roster_revision before: ${(card as any)?.roster_revision}`);

  const rrBefore = await getRosterRevision(fix.cardId);
  const optsBefore = await getAnswerOptions(fix.cardId);
  const rosterPropsBefore = optsBefore.filter((p) => p.type === "season_member" || p.type === "fantasy_team");
  rosterPropsBefore.forEach((p) => {
    console.log(`    prop(${p.type}): ${p.count} options — [${p.labels.join(", ")}]`);
  });

  const batchRes = await api(
    "POST",
    `/api/fantasy/leagues/${fix.leagueId}/seasons/${fix.seasonId}/participants/batch`,
    fix.commToken,
    { batch_key: uuid(), members: [{ display_name: "Rob2", team_name: "Grim2" }] }
  );
  const firstResult = batchRes.data?.results?.[0];
  console.log(`\n  Bulk-add Rob2/Grim2 → status=${batchRes.status}  row_status=${firstResult?.status}  draft_day_eligible=${firstResult?.draft_day_eligible}`);

  const rrAfter = await getRosterRevision(fix.cardId);
  console.log(`  roster_revision: before=${rrBefore}  after=${rrAfter}  delta=${rrAfter - rrBefore}`);

  const optsAfter = await getAnswerOptions(fix.cardId);
  const rosterPropsAfter = optsAfter.filter((p) => p.type === "season_member" || p.type === "fantasy_team");
  rosterPropsAfter.forEach((p) => {
    console.log(`    prop(${p.type}): ${p.count} options — [${p.labels.join(", ")}]`);
  });

  if (rrAfter > rrBefore) {
    console.log("\n  ✅ VERDICT: bulk roster_revision DID increment → parity with single-add (if single-add also increments)");
  } else {
    console.log("\n  ❌ VERDICT: bulk roster_revision did NOT increment");
  }
  const countBefore = rosterPropsBefore.reduce((s, p) => s + p.count, 0);
  const countAfter  = rosterPropsAfter.reduce((s, p) => s + p.count, 0);
  if (countAfter > countBefore) {
    console.log("  ✅ answer_options DID expand");
  } else {
    console.log("  ❌ answer_options did NOT expand");
  }
}

async function observeLockedAdd(fix: Fixture, label: string): Promise<void> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${label} — LOCKED card`);
  console.log("═".repeat(70));

  // Lock the weekly card
  const lockRes = await apiIK("POST",
    `/api/fantasy/leagues/${fix.leagueId}/seasons/${fix.seasonId}/weeks/1/lock`,
    fix.commToken
  );
  console.log(`  Lock → status=${lockRes.status}  data=${JSON.stringify(lockRes.data)}`);

  const { data: card } = await supa
    .from("gameday_pick_cards")
    .select("status, roster_revision")
    .eq("id", fix.cardId)
    .maybeSingle();
  console.log(`  Card status after lock: ${(card as any)?.status}  roster_revision: ${(card as any)?.roster_revision}`);

  const rrBefore = await getRosterRevision(fix.cardId);

  // Single-add
  const addRes = await apiIK("POST",
    `/api/fantasy/leagues/${fix.leagueId}/seasons/${fix.seasonId}/participants`,
    fix.commToken,
    { display_name: "LateSingle", team_name: "Late Team S" }
  );
  console.log(`\n  Single-add (locked) → status=${addRes.status}  draft_day_eligible=${addRes.data.draft_day_eligible}`);

  const rrMid = await getRosterRevision(fix.cardId);
  console.log(`  roster_revision after single-add: ${rrMid}  (delta: ${rrMid - rrBefore})`);

  // Bulk-add
  const batchRes = await api("POST",
    `/api/fantasy/leagues/${fix.leagueId}/seasons/${fix.seasonId}/participants/batch`,
    fix.commToken,
    { batch_key: uuid(), members: [{ display_name: "LateBulk", team_name: "Late Team B" }] }
  );
  const r0 = batchRes.data?.results?.[0];
  console.log(`  Bulk-add (locked) → status=${batchRes.status}  row_status=${r0?.status}  draft_day_eligible=${r0?.draft_day_eligible}`);

  const rrAfter = await getRosterRevision(fix.cardId);
  console.log(`  roster_revision after bulk-add: ${rrAfter}  (delta from before lock: ${rrAfter - rrBefore})`);

  if (rrAfter === rrBefore) {
    console.log("  ✅ LOCKED: roster_revision unchanged (correct — neither add expands a locked card)");
  } else {
    console.log("  ❌ LOCKED: roster_revision changed (regression — locked card should not expand)");
  }

  // Confirm members are in the league (season detail)
  const detRes = await api("GET",
    `/api/fantasy/leagues/${fix.leagueId}/seasons/${fix.seasonId}`,
    fix.commToken
  );
  const participants = detRes.data?.participants ?? [];
  const lateSingle = participants.find((p: any) => p.display_name === "LateSingle");
  const lateBulk   = participants.find((p: any) => p.display_name === "LateBulk");
  console.log(`  LateSingle in league: ${!!lateSingle}  LateBulk in league: ${!!lateBulk}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════════════╗");
  console.log("║  PHASE 6A — Open-Roster Parity Observation Fixture               ║");
  console.log("╚═══════════════════════════════════════════════════════════════════╝");
  console.log("\nBuilding fixtures...");

  // Two independent leagues so single-add and bulk-add are on clean state
  let fixSingle: Fixture;
  let fixBulk:   Fixture;
  let fixLocked: Fixture;

  try {
    [fixSingle, fixBulk, fixLocked] = await Promise.all([
      buildFixture("single"),
      buildFixture("bulk"),
      buildFixture("locked"),
    ]);
    console.log("  Fixtures ready.");
  } catch (e: any) {
    console.error("Fixture setup failed:", e.message);
    process.exit(1);
  }

  await observeSingleAdd(fixSingle, "TEST 1 — Single-add during OPEN weekly");
  await observeBulkAdd(fixBulk, "TEST 2 — Bulk-add during OPEN weekly");
  await observeLockedAdd(fixLocked, "TEST 3 — Both paths during LOCKED weekly");

  console.log("\n" + "─".repeat(70));
  console.log("  Fixture observation complete.");
  console.log("─".repeat(70) + "\n");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
