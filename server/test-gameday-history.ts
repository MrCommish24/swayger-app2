/**
 * Disposable integration fixtures for account-owned Game Day history.
 * Creates only synthetic rooms/users and deletes them in finally.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import type { AddressInfo } from "node:net";
import { applyPickCardWinnerSemantics, registerGamedayRoutes } from "./routes-gameday";
import { getServiceSupabase } from "./supabase-service";
import { rankStandardGameDayStandings, standardGameDayScoringProps } from "./gameday-standard-standings";
import { classifyGameDayHistory } from "./gameday-history";

let passed = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  passed++;
  console.log(`PASS ${name}`);
}

function testPureRules() {
  const score = (id: string, correct: number) => ({
    participant_id: id, game_day_sp: correct * 10, correct_picks: correct,
  });
  const tied = rankStandardGameDayStandings(
    [score("c", 1), score("b", 2), score("d", 1), score("a", 2)], true,
  );
  check("standard tie at first gives two rank-1 co-winners",
    tied.filter((row) => row.rank === 1 && row.is_winner).length === 2);
  check("lower ties use competition rank 3, not rank 1",
    tied.filter((row) => row.rank === 3 && !row.is_winner).length === 2);
  const distinct = rankStandardGameDayStandings([score("a", 0), score("b", 2), score("c", 1)], true);
  check("non-tied standard results rank 1, 2, 3 with one winner",
    distinct.map((row) => row.rank).join() === "1,2,3" && distinct.filter((row) => row.is_winner).length === 1);
  check("unfinalized results declare no winner",
    rankStandardGameDayStandings([score("a", 2), score("b", 2)], false).every((row) => !row.is_winner));
  check("partially settled finalized stays results pending",
    classifyGameDayHistory("finalized", [{ status: "settled" }, { status: "pending" }]) === "results_pending");
  check("only fully settled finalized is final",
    classifyGameDayHistory("finalized", [{ status: "settled" }]) === "final");
  check("unsettled active rooms are not history",
    classifyGameDayHistory("active", [{ status: "pending" }]) === null);
  const soccerCards = [
    { phase: "pregame", status: "settled", gameday_props: [{ id: "pre" }] },
    { phase: "penalties", status: "open", gameday_props: [{ id: "pen" }] },
  ];
  const soccerProps = [{ id: "pre", status: "settled" }, { id: "pen", status: "pending" }];
  check("unused optional soccer penalties do not block final results",
    standardGameDayScoringProps({ sport: "soccer", status: "finalized" }, soccerCards, soccerProps, []).length === 1);
  check("picked soccer penalties still require a result",
    standardGameDayScoringProps({ sport: "soccer", status: "finalized" }, soccerCards, soccerProps, [{ prop_id: "pen" }]).length === 2);
  const madden = [
    { participant_id: "a", correct_picks: 2, total_picks: 3 },
    { participant_id: "b", correct_picks: 2, total_picks: 3 },
  ];
  check("Madden Perfect Card retains its no-winner format rule",
    applyPickCardWinnerSemantics(madden, "all_correct", true).every((row) => !row.is_winner));
  check("Madden Most Correct retains its co-winner format rule",
    applyPickCardWinnerSemantics(madden, "most_correct", true).every((row) => row.is_winner));
}

async function main() {
  testPureRules();
  const db = getServiceSupabase();
  const anon = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const seed = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const password = `Fixture-${seed}-A1!`;
  const users: string[] = [];
  const rooms: string[] = [];
  const identities: string[] = [];
  const propIds: string[] = [];
  const app = express();
  app.use(express.json());
  registerGamedayRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = async (path: string, token?: string, extra: Record<string, string> = {}) => {
    const result = await fetch(base + path, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    });
    return { status: result.status, body: await result.json() as any };
  };
  const insert = async (table: string, row: Record<string, unknown>) => {
    const result = await db.from(table).insert(row).select().single();
    if (result.error || !result.data) throw result.error ?? new Error(`Could not insert ${table}`);
    return result.data as any;
  };
  const createUser = async (label: string) => {
    const email = `history-${label}-${seed}@example.test`;
    const result = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (result.error || !result.data.user) throw result.error;
    users.push(result.data.user.id);
    const session = await anon.auth.signInWithPassword({ email, password });
    if (session.error || !session.data.session) throw session.error;
    return { id: result.data.user.id, token: session.data.session.access_token };
  };
  const createRoom = async (name: string, status: string, archived = false, extra: Record<string, unknown> = {}) => {
    const code = `GDS-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const room = await insert("gameday_rooms", {
      room_code: code,
      room_name: name,
      team_a_name: "Alpha",
      team_b_name: "Beta",
      team_a_star: "A Star",
      team_b_star: "B Star",
      game_date: "2026-11-01",
      status,
      archived_at: archived ? new Date().toISOString() : null,
      source: "app",
      sport: "nba",
      is_private: true,
      ...extra,
    });
    rooms.push(room.id);
    return room;
  };
  const participant = (roomId: string, userId: string, name: string) =>
    insert("gameday_participants", { room_id: roomId, user_id: userId, display_name: name, is_guest: false });
  const cardWithProps = async (roomId: string, statuses: string[]) => {
    const card = await insert("gameday_pick_cards", {
      room_id: roomId, phase: "pregame", title: "Pregame", status: statuses.every((status) => status === "settled") ? "settled" : "locked",
    });
    const props = [];
    for (const [index, status] of statuses.entries()) {
      const prop = await insert("gameday_props", {
        card_id: card.id, question: `Call ${index + 1}`, answer_options: ["Alpha", "Beta"],
        display_order: index, status, correct_answer: status === "settled" ? "Alpha" : null,
      });
      props.push(prop);
      propIds.push(prop.id);
    }
    return props;
  };
  const pick = (propId: string, participantId: string, correct: boolean | null) =>
    insert("gameday_picks", {
      prop_id: propId, participant_id: participantId,
      selected_answer: correct === false ? "Beta" : "Alpha", is_correct: correct,
    });
  try {
    const owner = await createUser("owner");
    const rival = await createUser("rival");
    const outsider = await createUser("outsider");
    const title = `Same-title competition ${seed}`;
    const completed = await createRoom(title, "finalized");
    const [mine, other, lowA, lowB] = await Promise.all([
      participant(completed.id, owner.id, "Owner"),
      participant(completed.id, rival.id, "Rival"),
      insert("gameday_participants", { room_id: completed.id, display_name: "Low A", is_guest: true }),
      insert("gameday_participants", { room_id: completed.id, display_name: "Low B", is_guest: true }),
    ]);
    const [propA, propB] = await cardWithProps(completed.id, ["settled", "settled"]);
    for (const person of [mine, other, lowA, lowB]) {
      await pick(propA.id, person.id, true);
      await pick(propB.id, person.id, person === mine || person === other);
    }

    const archived = await createRoom(title, "finalized", true, { game_date: null });
    const archivedMine = await participant(archived.id, owner.id, "Owner");
    const [archivedProp] = await cardWithProps(archived.id, ["settled"]);
    await pick(archivedProp.id, archivedMine.id, true);

    const archivedPending = await createRoom(`Archived pending ${seed}`, "active", true);
    const archivedPendingMine = await participant(archivedPending.id, owner.id, "Owner");
    const [archivedSettled] = await cardWithProps(archivedPending.id, ["settled", "pending"]);
    await pick(archivedSettled.id, archivedPendingMine.id, true);

    const partial = await createRoom(`Partial ${seed}`, "finalized");
    const partialMine = await participant(partial.id, owner.id, "Owner");
    const [settledProp, pendingProp] = await cardWithProps(partial.id, ["settled", "pending"]);
    await pick(settledProp.id, partialMine.id, true);
    await pick(pendingProp.id, partialMine.id, null);

    const madden = await createRoom(`Madden ${seed}`, "finalized", false, {
      sport: "madden", template_type: "weekly_pick_card",
      format_config: { week_label: "Week 5", scoring_mode: "all_correct", minimum_matchups: 2, bonus: { enabled: false } },
    });
    const maddenMine = await participant(madden.id, owner.id, "Owner");
    const [mainA, mainB] = await cardWithProps(madden.id, ["settled", "settled"]);
    await pick(mainA.id, maddenMine.id, true);
    await pick(mainB.id, maddenMine.id, false);

    const custom = await createRoom(`Unrecognized format ${seed}`, "finalized", false, {
      format_config: { scoring_mode: "custom_points" },
    });
    const customMine = await participant(custom.id, owner.id, "Owner");
    const [customProp] = await cardWithProps(custom.id, ["settled"]);
    await pick(customProp.id, customMine.id, true);

    const soccer = await createRoom(`Soccer ${seed}`, "finalized", false, { sport: "soccer" });
    const soccerMine = await participant(soccer.id, owner.id, "Owner");
    const [soccerPregame] = await cardWithProps(soccer.id, ["settled"]);
    await pick(soccerPregame.id, soccerMine.id, true);
    const penaltyCard = await insert("gameday_pick_cards", {
      room_id: soccer.id, phase: "penalties", title: "Penalty shootout", status: "open", display_order: 1,
    });
    const penaltyProp = await insert("gameday_props", {
      card_id: penaltyCard.id, question: "Penalty winner", answer_options: ["Alpha", "Beta"],
      status: "pending",
    });
    propIds.push(penaltyProp.id);

    const fantasy = await createRoom(`Fantasy ${seed}`, "finalized", false, {
      experience_type: "fantasy", competition_type: "weekly",
    });
    await participant(fantasy.id, owner.id, "Owner");
    await cardWithProps(fantasy.id, ["settled"]);

    const privateOther = await createRoom(`Private ${seed}`, "finalized");
    await participant(privateOther.id, rival.id, "Rival");
    await cardWithProps(privateOther.id, ["settled"]);

    const discordOnly = await createRoom(`Discord only ${seed}`, "finalized", false, {
      source: "discord", sport: "madden", template_type: "weekly_pick_card",
      discord_guild_id: `${Date.now()}001`,
      format_config: {
        week_label: "Week 5", minimum_matchups: 1, scoring_mode: "all_correct",
        reward_text: "Test", bonus: { enabled: false },
      },
    });
    const discordId = await insert("gameday_discord_identities", {
      discord_guild_id: discordOnly.discord_guild_id,
      discord_user_id: `${Date.now()}002`,
      latest_display_name: "Owner",
    });
    identities.push(discordId.id);
    await insert("gameday_participants", {
      room_id: discordOnly.id, display_name: "Owner",
      discord_identity_id: discordId.id, is_guest: true,
    });
    await cardWithProps(discordOnly.id, ["settled"]);

    const inspectedTables = ["gameday_participants", "gameday_events",
      "gameday_discord_participant_links", "gameday_discord_participant_sessions"];
    const before = await Promise.all(inspectedTables
      .map((table) => db.from(table).select("*", { count: "exact", head: true })
        .in("room_id", rooms)));
    const picksBefore = await db.from("gameday_picks")
      .select("id", { count: "exact", head: true }).in("prop_id", propIds);
    const roomsBefore = await db.from("gameday_rooms")
      .select("id, status, archived_at").in("id", rooms).order("id");
    check("fixture baselines can be read", before.every((result) => !result.error));
    check("history rejects anonymous access", (await get("/api/gameday/my-history")).status === 401);
    check("history rejects guest or bot-like credentials", (await get("/api/gameday/my-history", undefined, { "X-Guest-Session": "any" })).status === 401);
    const history = await get("/api/gameday/my-history", owner.token);
    check("account-owned history returns seven eligible Game Day records",
      history.status === 200 && history.body.records?.length === 7);
    const byRoom = new Map<string, any>(history.body.records?.map((row: any) => [row.room.room_id, row]) ?? []);
    check("identical titles remain separate with distinct room code and date fallback",
      byRoom.get(completed.id)?.room.room_name === byRoom.get(archived.id)?.room.room_name &&
      byRoom.get(completed.id)?.room.room_code !== byRoom.get(archived.id)?.room.room_code &&
      byRoom.get(archived.id)?.room.game_date === null && !!byRoom.get(archived.id)?.room.created_at);
    check("account-linked finalized result has score, own picks, answers and co-winners",
      byRoom.get(completed.id)?.state === "final" &&
      byRoom.get(completed.id)?.participant_count === 4 &&
      byRoom.get(completed.id)?.participant.correct_picks === 2 &&
      byRoom.get(completed.id)?.cards[0].props[0].own_pick.outcome === "correct" &&
      byRoom.get(completed.id)?.cards[0].props[0].correct_answers.answer_ids[0] === "Alpha" &&
      byRoom.get(completed.id)?.final_standings.filter((row: any) => row.is_winner).length === 2 &&
      byRoom.get(completed.id)?.final_standings.filter((row: any) => row.rank === 3).length === 2);
    const publicFinal = await get(`/api/gameday/rooms/${completed.id}/final-standings`);
    const publicLive = await get(`/api/gameday/rooms/${completed.id}/leaderboard`);
    check("existing public final and leaderboard endpoints share corrected tie semantics",
      publicFinal.status === 200 && publicLive.status === 200 &&
      publicFinal.body.winners?.length === 2 && publicFinal.body.winner === null && publicFinal.body.tie === true &&
      publicFinal.body.leaderboard.filter((row: any) => row.rank === 3).length === 2 &&
      publicLive.body.leaderboard.filter((row: any) => row.is_winner).length === 2 &&
      publicLive.body.leaderboard.filter((row: any) => row.rank === 3).length === 2);
    check("archived account-owned final result remains readable",
      byRoom.get(archived.id)?.state === "final" &&
      byRoom.get(archived.id)?.room.archived === true &&
      (await get(`/api/gameday/my-history/${archived.room_code}`, owner.token)).body.record?.room.room_id === archived.id);
    check("archived active room with settled results remains pending and readable",
      byRoom.get(archivedPending.id)?.state === "results_pending" &&
      byRoom.get(archivedPending.id)?.room.archived === true &&
      byRoom.get(archivedPending.id)?.final_standings === null);
    check("unsettled prop does not reveal answers or pretend result is final",
      byRoom.get(partial.id)?.state === "results_pending" &&
      byRoom.get(partial.id)?.final_standings === null &&
      byRoom.get(partial.id)?.cards[0].props[1].correct_answers === null &&
      byRoom.get(partial.id)?.cards[0].props[1].own_pick.outcome === "pending");
    check("Madden Perfect Card does not award a winner for a partial main card",
      byRoom.get(madden.id)?.state === "final" &&
      byRoom.get(madden.id)?.scoring.format === "madden_weekly_pick_card" &&
      byRoom.get(madden.id)?.participant.correct_picks === 1 &&
      byRoom.get(madden.id)?.final_standings.every((row: any) => !row.is_winner));
    check("unknown custom rules do not inherit standard SP or winner",
      byRoom.get(custom.id)?.scoring.format === "unsupported_custom" &&
      byRoom.get(custom.id)?.participant.game_day_sp === null &&
      byRoom.get(custom.id)?.final_standings === null);
    const soccerFinal = await get(`/api/gameday/rooms/${soccer.id}/final-standings`);
    check("finalized soccer receipt ignores unused, unpicked penalty phase only",
      byRoom.get(soccer.id)?.state === "final" &&
      byRoom.get(soccer.id)?.participant.is_winner === true &&
      byRoom.get(soccer.id)?.cards.find((card: any) => card.phase === "penalties")?.props[0].correct_answers === null &&
      soccerFinal.body.winner_determined === true &&
      soccerFinal.body.winner?.participant_id === soccerMine.id);
    check("private and Discord-only rooms are not enumerated as account history",
      !byRoom.has(privateOther.id) && !byRoom.has(discordOnly.id) && !byRoom.has(fantasy.id));
    check("history payload exposes neither host controls nor Discord guild identifiers",
      !/host_link|host_user_id|discord_guild_id|session_hash|guest_session_id|bonus_game_selected_option|predicted_total/.test(JSON.stringify(history.body)));
    check("unowned private history record is indistinguishable from missing",
      (await get(`/api/gameday/my-history/${privateOther.room_code}`, owner.token)).status === 404 &&
      (await get(`/api/gameday/my-history/${completed.room_code}`, outsider.token)).status === 404 &&
      (await get("/api/gameday/my-history/GDS-NOTFOUND", owner.token)).status === 404);
    check("Discord bearer-like credential cannot convert a Discord-only record into account history",
      (await get(`/api/gameday/my-history/${discordOnly.id}`, owner.token, { "X-Gameday-Participant-Session": "invalid" })).status === 404);
    const after = await Promise.all(inspectedTables
      .map((table) => db.from(table).select("*", { count: "exact", head: true }).in("room_id", rooms)));
    const picksAfter = await db.from("gameday_picks")
      .select("id", { count: "exact", head: true }).in("prop_id", propIds);
    const roomsAfter = await db.from("gameday_rooms")
      .select("id, status, archived_at").in("id", rooms).order("id");
    check("history reads create no participants, events, Discord links or sessions",
      before.every((result, i) => result.count === after[i].count && !after[i].error));
    check("history reads change neither picks nor room status/archive metadata",
      !picksBefore.error && !picksAfter.error &&
      picksBefore.count === picksAfter.count &&
      !roomsBefore.error && !roomsAfter.error &&
      JSON.stringify(roomsBefore.data) === JSON.stringify(roomsAfter.data));
    const account = await db.from("gameday_participants")
      .select("user_id, is_guest, claimed_by_user_id, discord_identity_id").eq("id", mine.id).single();
    check("history reads do not claim or merge existing identity",
      account.data?.user_id === owner.id && account.data?.is_guest === false &&
      account.data?.claimed_by_user_id === null && account.data?.discord_identity_id === null);
    const publicArchived = await get(`/api/gameday/rooms/${archived.id}/final-standings`);
    check("existing public archive protection stays in force",
      publicArchived.status === 410 && publicArchived.body.archived === true);
  } finally {
    if (rooms.length) {
      const deleted = await db.from("gameday_rooms").delete().in("id", rooms);
      if (deleted.error) console.error("Fixture room cleanup failed:", deleted.error);
    }
    if (identities.length) {
      const deleted = await db.from("gameday_discord_identities").delete().in("id", identities);
      if (deleted.error) console.error("Fixture identity cleanup failed:", deleted.error);
    }
    for (const id of users) {
      const deleted = await db.auth.admin.deleteUser(id);
      if (deleted.error) console.error("Fixture user cleanup failed:", deleted.error);
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  console.log(`Game Day history: ${passed} passed, 0 failed`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
