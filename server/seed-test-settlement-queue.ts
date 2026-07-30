/**
 * seed-test-settlement-queue.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates controlled non-legacy test rooms that exercise every settlement-queue
 * grouping scenario.  All rooms have status='active', cards have status='locked',
 * props have status='pending' — exactly the filter the queue endpoint uses.
 *
 * Room names are prefixed "[TEST-GS]" so they can be cleaned up easily.
 *
 * Run:   npx tsx server/seed-test-settlement-queue.ts
 * Clean: npx tsx server/seed-test-settlement-queue.ts --clean
 *
 * Scenarios seeded
 * ────────────────
 * S1  Same game + same prop across 3 rooms → one Safe group
 * S2  Reversed team order + reversed answer options → still groups with S1
 * S3  Different star player options → two separate groups in same game
 * S4  Same generic question across different games → separate events
 * S5  Same question, different phases → separate groups
 * S6  Ambiguous options (two options collapse to the same normal form) → manual_only
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const MARKER = "[TEST-GS]";
const GAME_DATE = "2026-08-15";

// ── Clean up any previous test data ─────────────────────────────────────────

async function cleanTestData() {
  const { data: rooms } = await supabase
    .from("gameday_rooms")
    .select("id")
    .like("room_name", `${MARKER}%`);

  if (!rooms?.length) {
    console.log("No test rooms found to clean.");
    return;
  }

  const roomIds = rooms.map((r) => r.id);

  // Cards
  const { data: cards } = await supabase
    .from("gameday_pick_cards")
    .select("id")
    .in("room_id", roomIds);
  const cardIds = (cards ?? []).map((c) => c.id);

  // Props
  if (cardIds.length) {
    await supabase.from("gameday_props").delete().in("card_id", cardIds);
    await supabase.from("gameday_pick_cards").delete().in("id", cardIds);
  }
  await supabase.from("gameday_rooms").delete().in("id", roomIds);
  console.log(`Cleaned ${roomIds.length} test room(s).`);
}

// ── Room / card / prop helpers ────────────────────────────────────────────────

const CARD_TITLES: Record<string, string> = {
  pregame:  "Pregame Picks",
  halftime: "Halftime Picks",
  fourth:   "4Q Clutch Picks",
};

async function createRoom(opts: {
  name: string;
  teamA: string;
  teamB: string;
  starA: string;
  starB: string;
  sport: string;
  gameDate: string;
}) {
  const id = randomUUID();
  const { error } = await supabase.from("gameday_rooms").insert({
    id,
    room_name: `${MARKER} ${opts.name}`,
    team_a_name: opts.teamA,
    team_b_name: opts.teamB,
    team_a_star: opts.starA,
    team_b_star: opts.starB,
    sport: opts.sport,
    game_date: opts.gameDate,
    status: "active",
    source: "discord",         // bot-created rooms use discord source
    is_private: false,
    room_code: `TGS-${id.slice(0, 6).toUpperCase()}`,
    host_user_id: null,        // null = bot-created → any authorized host can settle
  });
  if (error) throw new Error(`createRoom(${opts.name}): ${error.message}`);
  return id;
}

async function createCard(roomId: string, phase: string) {
  const id = randomUUID();
  const title = CARD_TITLES[phase] ?? `${phase} Picks`;
  const { error } = await supabase.from("gameday_pick_cards").insert({
    id,
    room_id: roomId,
    title,
    phase,
    status: "locked",          // queue only shows locked cards
    display_order: 0,
  });
  if (error) throw new Error(`createCard(${roomId}, ${phase}): ${error.message}`);
  return id;
}

async function createProp(
  cardId: string,
  question: string,
  answerOptions: string[],
  templatePropId: string | null = null
) {
  const id = randomUUID();
  const { error } = await supabase.from("gameday_props").insert({
    id,
    card_id: cardId,
    question,
    answer_options: answerOptions,
    status: "pending",         // unsettled — eligible for queue
    template_prop_id: templatePropId,
  });
  if (error) throw new Error(`createProp(${question.slice(0, 40)}): ${error.message}`);
  return id;
}

// ── Main seed ─────────────────────────────────────────────────────────────────

async function seed() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  Settlement Queue — Test Room Seeder");
  console.log("══════════════════════════════════════════════════════\n");

  // ── S1 + S2: Same game, same prop, 3 rooms (3rd with reversed teams+options)
  console.log("Creating S1/S2 rooms (Knicks vs Celtics — same game, 3 rooms)…");
  const roomA = await createRoom({ name: "S1-RoomA Knicks-Celtics", teamA: "Knicks", teamB: "Celtics", starA: "Brunson", starB: "Tatum", sport: "nba", gameDate: GAME_DATE });
  const roomB = await createRoom({ name: "S1-RoomB Knicks-Celtics", teamA: "Knicks", teamB: "Celtics", starA: "Brunson", starB: "Tatum", sport: "nba", gameDate: GAME_DATE });
  const roomC = await createRoom({ name: "S2-RoomC Celtics-Knicks reversed", teamA: "Celtics", teamB: "Knicks", starA: "Tatum", starB: "Brunson", sport: "nba", gameDate: GAME_DATE });

  const cardA = await createCard(roomA, "pregame");
  const cardB = await createCard(roomB, "pregame");
  const cardC = await createCard(roomC, "pregame");

  // Same prop question/options — should land in one group
  await createProp(cardA, "Which team scores first?",        ["Knicks", "Celtics"],         null);
  await createProp(cardB, "Which team scores first?",        ["Knicks", "Celtics"],         null);
  // Reversed team order AND reversed answer order — event_key and group_key are order-agnostic
  await createProp(cardC, "Which team scores first?",        ["Celtics", "Knicks"],         null);

  console.log("  ✓ Rooms TGS-A, TGS-B, TGS-C created\n");

  // ── S3: Different star player matchup → two separate groups in the same game
  console.log("Creating S3 rooms (same game, different star matchups)…");
  const roomD = await createRoom({ name: "S3-RoomD Brunson-Tatum stars", teamA: "Knicks", teamB: "Celtics", starA: "Brunson", starB: "Tatum", sport: "nba", gameDate: GAME_DATE });
  const roomE = await createRoom({ name: "S3-RoomE Hart-Brown stars",    teamA: "Knicks", teamB: "Celtics", starA: "Hart",    starB: "Brown",  sport: "nba", gameDate: GAME_DATE });

  const cardD = await createCard(roomD, "pregame");
  const cardE = await createCard(roomE, "pregame");

  // Same question template, but different resolved options → different group_key
  await createProp(cardD, "Which star finishes with more total points?", ["Brunson", "Tatum", "Tie"], null);
  await createProp(cardE, "Which star finishes with more total points?", ["Hart",    "Brown", "Tie"], null);

  console.log("  ✓ Rooms TGS-D, TGS-E created\n");

  // ── S4: Same generic question, different game (different event_key) → separate
  console.log("Creating S4 room (Lakers vs Warriors — same date, different game)…");
  const roomF = await createRoom({ name: "S4-RoomF Lakers-Warriors", teamA: "Lakers", teamB: "Warriors", starA: "LeBron", starB: "Curry", sport: "nba", gameDate: GAME_DATE });
  const cardF  = await createCard(roomF, "pregame");
  await createProp(cardF, "Which team scores first?", ["Lakers", "Warriors"], null);
  console.log("  ✓ Room TGS-F created\n");

  // ── S5: Same question, same game, DIFFERENT phases → separate groups
  console.log("Creating S5 rooms (same question across pregame / halftime)…");
  const roomG = await createRoom({ name: "S5-RoomG Phase-pregame",  teamA: "Knicks", teamB: "Celtics", starA: "Brunson", starB: "Tatum", sport: "nba", gameDate: GAME_DATE });
  const roomH = await createRoom({ name: "S5-RoomH Phase-halftime", teamA: "Knicks", teamB: "Celtics", starA: "Brunson", starB: "Tatum", sport: "nba", gameDate: GAME_DATE });

  const cardG = await createCard(roomG, "pregame");
  const cardH = await createCard(roomH, "halftime");  // ← same question, halftime phase

  await createProp(cardG, "Will there be overtime?", ["Yes", "No"], null);
  await createProp(cardH, "Will there be overtime?", ["Yes", "No"], null);  // same Q, diff phase

  console.log("  ✓ Rooms TGS-G (pregame), TGS-H (halftime) created\n");

  // ── S6: Ambiguous options — "Yes" and "YES" both normalize to "yes"
  console.log("Creating S6 room (ambiguous options)…");
  const roomI = await createRoom({ name: "S6-RoomI Ambiguous-options", teamA: "Knicks", teamB: "Celtics", starA: "Brunson", starB: "Tatum", sport: "nba", gameDate: GAME_DATE });
  const cardI  = await createCard(roomI, "pregame");
  await createProp(cardI, "Will either team score 30+ points in Q1?", ["Yes", "YES"], null);
  console.log("  ✓ Room TGS-I created\n");

  // ── Individual settlement verification target ─────────────────────────────
  // A separate single-prop room with host_user_id = null.
  // We settle this directly via the service-role DB client (exact same SQL the
  // PATCH /api/gameday/props/:propId/settle endpoint runs) to prove the cascade works.
  console.log("Creating TGS-SETTLE (individual settlement verification target)…");
  const roomSettle = await createRoom({ name: "SETTLE-TEST IndivSettlement", teamA: "Knicks", teamB: "Celtics", starA: "Brunson", starB: "Tatum", sport: "nba", gameDate: GAME_DATE });
  const cardSettle  = await createCard(roomSettle, "pregame");
  const propSettleId = await createProp(cardSettle, "Which team wins the 1st quarter?", ["Knicks", "Celtics", "Tie"], null);
  console.log("  ✓ TGS-SETTLE created — prop ID:", propSettleId, "\n");

  return propSettleId;
}

// ── Individual settlement verification ────────────────────────────────────────
// Mirrors EXACTLY what PATCH /api/gameday/props/:propId/settle does, step by step.

async function verifyIndividualSettlement(propId: string) {
  console.log("══════════════════════════════════════════════════════");
  console.log("  Individual Settlement — Functional Verification");
  console.log("══════════════════════════════════════════════════════\n");

  const CORRECT = "Knicks";

  // 1. Fetch prop + card + room (same join the endpoint does)
  const { data: prop } = await supabase
    .from("gameday_props")
    .select("*, gameday_pick_cards(id, phase, status, room_id, gameday_rooms(host_user_id, status))")
    .eq("id", propId)
    .single();

  if (!prop) throw new Error("Settlement-test prop not found");
  const card = (prop as any).gameday_pick_cards;
  const room = card?.gameday_rooms;

  console.log("Before settle:");
  console.log("  prop.status         =", prop.status);
  console.log("  prop.correct_answer =", prop.correct_answer);
  console.log("  card.status         =", card?.status);
  console.log("  room.host_user_id   =", room?.host_user_id, "← null means any host can settle");

  // 2. Validate answer in options
  const options = prop.answer_options as string[];
  if (!options.includes(CORRECT)) throw new Error(`${CORRECT} not in options: ${options}`);

  // 3. Update prop (same as endpoint)
  await supabase.from("gameday_props")
    .update({ correct_answer: CORRECT, status: "settled", updated_at: new Date().toISOString() })
    .eq("id", propId);

  // 4. Picks correct/incorrect (same bulk updates)
  await supabase.from("gameday_picks").update({ is_correct: true  }).eq("prop_id", propId).eq("selected_answer", CORRECT);
  await supabase.from("gameday_picks").update({ is_correct: false }).eq("prop_id", propId).neq("selected_answer", CORRECT);

  // 5. Card cascade (same remaining-props check)
  const { data: remaining } = await supabase
    .from("gameday_props").select("id").eq("card_id", card.id).neq("status", "settled");
  const allSettled = !remaining?.length;
  if (allSettled) {
    await supabase.from("gameday_pick_cards")
      .update({ status: "settled", updated_at: new Date().toISOString() })
      .eq("id", card.id);
  }

  // 6. Verify final state
  const { data: after } = await supabase.from("gameday_props").select("status, correct_answer").eq("id", propId).single();
  const { data: cardAfter } = await supabase.from("gameday_pick_cards").select("status").eq("id", card.id).single();

  console.log("\nAfter settle:");
  console.log("  prop.status         =", after?.status);
  console.log("  prop.correct_answer =", after?.correct_answer);
  console.log("  card.status         =", cardAfter?.status, allSettled ? "(auto-settled ✓ — all props in card done)" : "(other props remain)");

  const pass = after?.status === "settled" && after?.correct_answer === CORRECT && cardAfter?.status === "settled";
  console.log("\n  Individual settlement cascade:", pass ? "✅  PASS" : "❌  FAIL");

  // 7. Also probe the HTTP endpoint to confirm it's registered (expects 401, not 404)
  const BASE = process.env.EXPO_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;
  try {
    const r = await fetch(`${BASE}/api/gameday/props/${propId}/settle`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correct_answer: "Celtics" }),
    });
    console.log("\n  HTTP endpoint probe (no auth):", r.status === 401 ? `✅  ${r.status} Unauthorized (endpoint is live)` : `⚠  got ${r.status}`);
  } catch (e: any) {
    console.log("\n  HTTP endpoint probe: ⚠ could not reach server —", e.message);
  }
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  const clean = process.argv.includes("--clean");

  await cleanTestData();
  if (clean) {
    console.log("Done — test data removed.");
    process.exit(0);
  }

  const settlePropId = await seed();
  await verifyIndividualSettlement(settlePropId);

  console.log("\n══════════════════════════════════════════════════════");
  console.log("  Seed complete.  Open the admin Settlement Queue to");
  console.log("  inspect the live grouping output.");
  console.log("  To remove: npx tsx server/seed-test-settlement-queue.ts --clean");
  console.log("══════════════════════════════════════════════════════\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
