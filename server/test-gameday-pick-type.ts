/**
 * Disposable private fake-guild fixtures only. No Discord delivery.
 * Covers parser/UI presentation, schema constraints, API persistence, identity,
 * transactional event snapshots, manual settlement and existing winner semantics.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerGamedayRoutes } from "./routes-gameday";
import { getServiceSupabase } from "./supabase-service";
import { buildTeamPickDisplay, getPickType, normalizeAtsLine, normalizePickType, parseTeamBSpread } from "../lib/gameday-pick-type";

let passed = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  passed++;
  console.log(`PASS ${name}`);
}

async function main() {
  const db = getServiceSupabase();
  const seed = Date.now().toString();
  const guild = `${seed}001`, user = `${seed}101`;
  const rooms: string[] = [];
  let hostUserId: string | undefined;
  process.env.MADDEN_PUBLIC_PICK_EVENTS_ENABLED = "true";
  const app = express();
  app.use(express.json());
  registerGamedayRoutes(app);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status ?? 500).json({ error: err.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.on("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const bot = { Authorization: `Bearer ${process.env.GAMEDAY_BOT_API_KEY}`, "X-Discord-Guild-ID": guild };
  async function request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
    const r = await fetch(origin + path, { method, headers: { "Content-Type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, body: await r.json() as any };
  }
  function payload(mode?: unknown, lines: unknown[] = [-6.5, 3.5, -10, 7, "PK"]) {
    return {
      room_name: `Pick type fixture ${seed}`, sport: "madden", template_type: "weekly_pick_card",
      source: "discord", discord_guild_id: guild, discord_channel_id: `${seed}900`, discord_user_id: user,
      ...(mode === undefined ? {} : { pick_type: mode }),
      pick_deadline: new Date(Date.now() + 3600_000).toISOString(),
      matchups: lines.map((line, i) => ({ team_a: `Team A${i}`, team_b: `Team B${i}`,
        ...(line === undefined ? {} : { line_text: typeof line === "number" ? (line > 0 ? `+${line}` : `${line}`) : line }) })),
      format_config: { week_label: "Pick type regression", minimum_matchups: 1, scoring_mode: "most_correct",
        bonus: { enabled: false } as any },
    };
  }
  async function create(body: any) {
    const result = await request("/api/gameday/rooms", "POST", body, bot);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    rooms.push(result.body.room_id);
    const room = await request(`/api/gameday/rooms/${result.body.room_id}`);
    return { id: result.body.room_id as string, card: room.body.cards[0] };
  }
  try {
    const hostEmail = `pick-type-${seed}@example.com`;
    process.env.GAMEDAY_HOST_EMAILS = `${process.env.GAMEDAY_HOST_EMAILS ?? ""},${hostEmail}`;
    const password = randomUUID();
    const created = await db.auth.admin.createUser({ email: hostEmail, password, email_confirm: true });
    assert.ifError(created.error);
    hostUserId = created.data.user!.id;
    const anon = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } });
    const signed = await anon.auth.signInWithPassword({ email: hostEmail, password });
    assert.ifError(signed.error);
    const hostHeaders = { Authorization: `Bearer ${signed.data.session!.access_token}` };
    check("omitted type defaults Winner", normalizePickType(undefined) === "straight_up");
    for (const invalid of [null, "", "ats", "STRAIGHT_UP", 1, {}, false]) {
      check(`invalid type ${JSON.stringify(invalid)}`, normalizePickType(invalid) === null);
    }
    check("legacy null ignores line data", getPickType(null) === "straight_up");
    for (const [line, expected] of [["-6.5", -6.5], ["+3.5", 3.5], ["-10", -10], ["+7", 7], ["PK", 0], ["pk", 0], ["+0", 0], ["-0", 0]] as const) {
      check(`parser accepts ${line}`, parseTeamBSpread(line) === expected);
      const d = buildTeamPickDisplay("spread", ["Giants", "Cowboys"], line)!;
      check(`choice values unchanged ${line}`, d.display_options[0].value === "Giants" && d.display_options[1].value === "Cowboys");
      check(`opposite display ${line}`, expected === 0
        ? d.matchup_label === "Giants PK vs Cowboys PK"
        : d.display_options[0].label.endsWith(`${-expected > 0 ? "+" : ""}${-expected}`));
      const sqlDisplay = await db.rpc("gameday_pick_display_options", {
        p_pick_type: "spread", p_options: ["Giants", "Cowboys"], p_line: line,
      });
      check(`SQL/JS display parity ${line}`, !sqlDisplay.error && isDeepStrictEqual(sqlDisplay.data, d.display_options));
    }
    for (const line of [undefined, null, "", "6.5", "Cowboys -6.5", "ATS -7", "-2.25", "--7", "+NaN", "-6.\n5", "PK +0", "+1e2", "+Infinity", "+9007199254740992"]) {
      check(`parser rejects ${JSON.stringify(line)}`, parseTeamBSpread(line) === null);
      check(`API rejects malformed ATS ${JSON.stringify(line)}`, (await request("/api/gameday/rooms", "POST", payload("spread", [line]), bot)).status === 400);
    }
    check("canonical zero is PK", normalizeAtsLine("-0.0") === "PK");
    check("Winner contextual line never enters options", buildTeamPickDisplay("straight_up", ["Giants", "Cowboys"], "Cowboys -6.5")?.matchup_label === "Giants vs Cowboys");
    for (const mode of [null, "", "ats", 12]) {
      check(`API rejects invalid mode ${mode}`, (await request("/api/gameday/rooms", "POST", payload(mode), bot)).status === 400);
    }
    const badBonus = payload("spread", [-6.5]);
    badBonus.format_config.bonus = { enabled: true, game: { team_a: "Patriots", team_b: "Commanders" } };
    check("ATS bonus missing line rejected", (await request("/api/gameday/rooms", "POST", badBonus, bot)).status === 400);
    badBonus.format_config.bonus = { enabled: true, label: "Legacy", answer_options: ["One", "Two"] };
    check("ATS arbitrary bonus rejected", (await request("/api/gameday/rooms", "POST", badBonus, bot)).status === 400);

    for (const mode of [undefined, "straight_up", "spread"] as const) {
      const body = payload(mode, mode === "spread" ? [-6.5, 3.5, -10, 7, "PK"] : [undefined, "context only"]);
      body.format_config.bonus = {
        enabled: true, game: { team_a: "Patriots", team_b: "Commanders", line_text: mode === "spread" ? "-10" : "context" },
        total_prediction: { enabled: true, rule: "exact" },
      };
      const room = await create(body);
      const kind = mode ?? "straight_up";
      check(`${kind} persisted explicit mode`, (await db.from("gameday_pick_cards").select("pick_type").eq("id", room.card.id).single()).data?.pick_type === kind);
      if (mode === undefined) {
        // Simulate a historical row from an older writer; API must not infer ATS.
        await db.from("gameday_pick_cards").update({ pick_type: null }).eq("id", room.card.id);
        check("legacy null GET defaults Winner", (await request(`/api/gameday/rooms/${room.id}`)).body.cards[0].pick_type === "straight_up");
      }
      const invalidMode = await db.from("gameday_pick_cards").update({ pick_type: "ats" }).eq("id", room.card.id);
      check(`${kind} database rejects invalid mode`, !!invalidMode.error);
      const original = (await db.from("gameday_props").select("id,line_text").eq("card_id", room.card.id)).data;
      check(`${kind} legacy contextual text retained`, kind === "spread" || original?.some(p => p.line_text === "context only"));
      // Exercise the unchanged verified-link identity journey on both modes.
      const issued = await request(`/api/gameday/rooms/${room.id}/discord-participant-link`, "POST",
        { discord_user_id: user, discord_display_name: "Fixture Raiders" }, bot);
      check(`${kind} identity issuance`, issued.status === 201);
      const token = new URL(issued.body.participant_url).searchParams.get("discord_token");
      const redeemed = await request("/api/gameday/discord-participant-link/redeem", "POST", { token, room_id: room.id });
      check(`${kind} identity redemption`, redeemed.status === 200);
      const session = { "X-Gameday-Participant-Session": redeemed.body.participant_session };
      const participant = redeemed.body.participant.id;
      for (const prop of room.card.gameday_props) {
        const submission = prop.answer_type === "integer" ? { numeric_answer: 41 } : { selected_answer: prop.answer_options[0] };
        check(`${kind} save ${prop.prop_role} ${prop.display_order}`, (await request(`/api/gameday/props/${prop.id}/pick`, "POST", submission, session)).status === 200);
      }
      const reload = await request(`/api/gameday/rooms/${room.id}`, "GET", undefined, session);
      check(`${kind} reload identity unchanged`, reload.body.participant.id === participant);
      check(`${kind} reload values are bare team`, room.card.gameday_props.filter((p: any) => p.answer_type === "choice").every((p: any) => reload.body.my_picks[p.id] === p.answer_options[0]));
      const saved = (await db.from("gameday_picks").select("selected_answer").eq("participant_id", participant)).data ?? [];
      check(`${kind} no spread appended to stored picks`, saved.every(p => !/[+-]\d| PK$/.test(p.selected_answer)));
      const events = (await request("/api/gameday/bot/madden-participation-events", "GET", undefined, bot)).body.events.filter((e: any) => e.room_id === room.id);
      check(`${kind} versioned event emitted`, events.length === 1 && events[0].submission_version === 1);
      const event = events[0];
      check(`${kind} event mode`, event.pick_type === kind);
      const expected = buildTeamPickDisplay(kind, ["Team A0", "Team B0"], body.matchups[0].line_text)!;
      check(`${kind} event labels match frontend`, isDeepStrictEqual(event.picks[0].display_options, expected.display_options));
      check(`${kind} event team stored unchanged`, event.picks[0].selected_option === "Team A0");
      check(`${kind} total not a spread market`, event.picks.find((p: any) => p.answer_type === "integer").display_options === undefined);
      check(`${kind} no session in event`, !JSON.stringify(event).includes(redeemed.body.participant_session));
      const prop = room.card.gameday_props[0];
      const snap = JSON.stringify(event.picks);
      if (kind === "spread") {
        await db.from("gameday_props").update({ line_text: "+9.5" }).eq("id", prop.id);
        await db.from("gameday_pick_cards").update({ pick_type: "straight_up" }).eq("id", room.card.id);
      }
      check(`${kind} identical retry saves without new event`, (await request(`/api/gameday/props/${prop.id}/pick`, "POST", { selected_answer: prop.answer_options[0] }, session)).status === 200);
      const again = (await request("/api/gameday/bot/madden-participation-events", "GET", undefined, bot)).body.events.filter((e: any) => e.room_id === room.id);
      check(`${kind} immutable retry snapshot`, again.length === 1 && JSON.stringify(again[0].picks) === snap && again[0].pick_type === kind);
      if (kind === "spread") {
        await db.from("gameday_props").update({ line_text: "-6.5" }).eq("id", prop.id);
        await db.from("gameday_pick_cards").update({ pick_type: "spread" }).eq("id", room.card.id);
        await db.from("gameday_props").update({ line_text: "invalid fixture line" }).eq("id", prop.id);
        check("invalid ATS event aborts material pick write", (await request(`/api/gameday/props/${prop.id}/pick`, "POST", { selected_answer: prop.answer_options[1] }, session)).status === 500);
        const rolledBack = (await db.from("gameday_picks").select("selected_answer").eq("prop_id", prop.id).eq("participant_id", participant).single()).data;
        check("snapshot failure rolls back pick atomically", rolledBack?.selected_answer === prop.answer_options[0]);
        await db.from("gameday_props").update({ line_text: "-6.5" }).eq("id", prop.id);
        check("material edit supported", (await request(`/api/gameday/props/${prop.id}/pick`, "POST", { selected_answer: prop.answer_options[1] }, session)).status === 200);
        const versions = (await request("/api/gameday/bot/madden-participation-events", "GET", undefined, bot)).body.events.filter((e: any) => e.room_id === room.id);
        check("material edit creates immutable version two", versions.length === 2 && versions[1].submission_version === 2 && versions[1].event_type === "pick_card_picks_updated"
          && versions[1].picks[0].selected_option === prop.answer_options[1] && JSON.stringify(versions[0].picks) === snap);
        check("restore first team supported", (await request(`/api/gameday/props/${prop.id}/pick`, "POST", { selected_answer: prop.answer_options[0] }, session)).status === 200);
      }
      check(`${kind} lock`, (await request(`/api/gameday/cards/${room.card.id}/lock`, "PATCH", {}, bot)).status === 200);
      const settlement = await request(`/api/gameday/bot/rooms/${room.id}/settlement`, "GET", undefined, bot);
      check(`${kind} commissioner receives mode`, settlement.body.pick_type === kind);
      for (const p of room.card.gameday_props) {
        check(`${kind} manual resolve ${p.prop_role} ${p.display_order}`, (await request(`/api/gameday/props/${p.id}/settle`, "PATCH",
          p.answer_type === "integer" ? { actual_total: 41 } : { correct_answer: p.answer_options[0] }, bot)).status === 200);
      }
      const lb = await request(`/api/gameday/rooms/${room.id}/leaderboard`);
      const mainCount = body.matchups.length;
      check(`${kind} main-only score unaffected`, lb.body.leaderboard[0].correct_picks === mainCount && lb.body.leaderboard[0].game_day_sp === mainCount * 10);
      check(`${kind} winner unchanged`, lb.body.leaderboard[0].is_winner === true);
      check(`${kind} finalize`, (await request(`/api/gameday/rooms/${room.id}/finalize`, "PATCH", {}, bot)).status === 200);
      const final = await request(`/api/gameday/rooms/${room.id}/final-standings`);
      check(`${kind} final winner`, final.body.finalized && final.body.winner.participant_id === participant && final.body.all_props_settled);
      // The browser host receipt uses host-data, not the public leaderboard.
      // App-owned weekly cards must use the same main-only scoring projection.
      await db.from("gameday_rooms").update({ host_user_id: hostUserId, source: "app" }).eq("id", room.id);
      const hostData = await request(`/api/gameday/rooms/${room.id}/host-data`, "GET", undefined, hostHeaders);
      check(`${kind} host projection loads`, hostData.status === 200);
      check(`${kind} host bonus excluded from score`, hostData.body.leaderboard[0].correct_picks === mainCount && hostData.body.leaderboard[0].game_day_sp === mainCount * 10);
      check(`${kind} host winner matches public result`, hostData.body.leaderboard[0].is_winner === true && hostData.body.leaderboard[0].total_picks === mainCount);
    }
    // The existing table also stores unrelated Game Day cards. NULL remains valid.
    const unrelated = await db.from("gameday_pick_cards").insert({ room_id: rooms[0], title: "Unrelated fixture", phase: "halftime", status: "closed", display_order: 99 }).select("id,pick_type").single();
    check("unrelated card keeps NULL default", !unrelated.error && unrelated.data?.pick_type === null);
    console.log(`Pick type: ${passed} passed, 0 failed`);
  } finally {
    for (const id of rooms) {
      const result = await db.from("gameday_rooms").delete().eq("id", id);
      assert.ifError(result.error);
    }
    await db.from("gameday_discord_identities").delete().eq("discord_guild_id", guild);
    if (hostUserId) await db.auth.admin.deleteUser(hostUserId);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
