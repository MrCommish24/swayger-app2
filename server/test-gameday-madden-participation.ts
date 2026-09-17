/**
 * Disposable integration coverage for Madden Discord participation events.
 *
 * Prerequisite: apply supabase/gameday-madden-participation-events.sql in the
 * target Supabase project. This test never applies migrations or posts to
 * Discord. Run with: npm run test:gameday:madden-participation
 */

import * as dotenv from "dotenv";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

dotenv.config();

let passed = 0;
let failed = 0;
const expect = (label: string, condition: unknown, detail = "") => {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function main() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const botKey = process.env.GAMEDAY_BOT_API_KEY;
  if (!url || !serviceKey || !anonKey || !botKey) {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_SUPABASE_ANON_KEY, and GAMEDAY_BOT_API_KEY are required");
  }
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const runId = unique("madden-participation");
  const guild = `PARTICIPATION_GUILD_${runId}`;
  const otherGuild = `${guild}_OTHER`;
  const password = `Test-${runId}-A1!`;
  const userIds: string[] = [];
  const roomIds: string[] = [];

  const migrationCheck = await service.from("gameday_madden_participation_events").select("id").limit(1);
  const rpcCheck = await service.rpc("submit_madden_pick_with_activity", {
    p_prop_id: "00000000-0000-0000-0000-000000000000",
    p_participant_id: "00000000-0000-0000-0000-000000000000",
    p_selected_answer: "migration-check",
  });
  const migrationProblems: string[] = [];
  if (migrationCheck.error) {
    migrationProblems.push(`table unavailable: ${migrationCheck.error.message}`);
  }
  if (rpcCheck.error && /function .* does not exist|schema cache|relation .* does not exist/i.test(rpcCheck.error.message)) {
    migrationProblems.push(`RPC unavailable: ${rpcCheck.error.message}`);
  }
  if (migrationProblems.length) {
    throw new Error(
      `Madden participation migration is not fully applied. Apply supabase/gameday-madden-participation-events.sql first (${migrationProblems.join("; ")})`,
    );
  }

  const { registerGamedayRoutes } = await import("./routes-gameday");
  process.env.GAMEDAY_HOST_EMAILS = `${runId}-host@example.test`;
  process.env.GAMEDAY_ADMIN_EMAILS = process.env.GAMEDAY_HOST_EMAILS;
  const app = express();
  app.use(express.json());
  registerGamedayRoutes(app);
  let server: Server | null = null;

  const request = async (baseUrl: string, path: string, options: {
    method?: string; token?: string; guest?: string; bot?: boolean; apiKey?: string; guild?: string; body?: unknown;
  } = {}) => {
    const headers: Record<string, string> = {};
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.guest) headers["X-Guest-Session"] = options.guest;
    if (options.bot) headers["x-api-key"] = options.apiKey ?? botKey;
    if (options.guild) headers["X-Discord-Guild-ID"] = options.guild;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(baseUrl + path, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) as any };
  };

  const createUser = async (suffix: string) => {
    const email = `${runId}-${suffix}@example.test`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`User creation failed: ${created.error?.message}`);
    userIds.push(created.data.user.id);
    const signed = await auth.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session) throw new Error(`User sign-in failed: ${signed.error?.message}`);
    return { id: created.data.user.id, token: signed.data.session.access_token };
  };

  const matchups = [
    { team_a: "Ravens", team_b: "Bengals", line_text: "Ravens -3" },
    { team_a: "Chiefs", team_b: "Raiders", line_text: "" },
    { team_a: "Eagles", team_b: "Cowboys", line_text: "Eagles +2.5" },
  ];
  const formatConfig = (enabled = true) => ({
    week_label: "Participation Test", reward_text: "Test reward", minimum_matchups: 3,
    scoring_mode: "all_correct",
    bonus: enabled
      ? { enabled: true, label: "Bonus", answer_options: ["Home", "Away"] }
      : { enabled: false, label: null, answer_options: [] },
  });

  try {
    server = await new Promise<Server>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const createRoom = async (overrides: Record<string, unknown> = {}) => {
      const result = await request(baseUrl, "/api/gameday/rooms", {
        method: "POST", bot: true, guild,
        body: {
          room_name: `Participation ${runId}`, sport: "madden", template_type: "weekly_pick_card",
          source: "discord", is_private: true, discord_guild_id: guild,
          discord_channel_id: `CHANNEL_${runId}`, discord_user_id: `BOT_${runId}`,
          format_config: formatConfig(), matchups,
          pick_deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(), ...overrides,
        },
      });
      if (result.status !== 200 || !result.body.room_id) throw new Error(`Room creation failed: ${JSON.stringify(result.body)}`);
      roomIds.push(result.body.room_id);
      const room = await request(baseUrl, `/api/gameday/rooms/${result.body.room_id}`);
      const card = room.body.cards?.[0];
      if (!card?.id || !card.gameday_props?.length) throw new Error("Participation room has no playable card");
      return { roomId: result.body.room_id as string, card, props: card.gameday_props as any[] };
    };
    const pickAll = async (room: any, identity: { token?: string; guest?: string }) => {
      for (const prop of room.props) {
        const result = await request(baseUrl, `/api/gameday/props/${prop.id}/pick`, {
          method: "POST", ...identity, body: { selected_answer: prop.answer_options[0] },
        });
        if (result.status !== 200) throw new Error(`Pick failed: ${JSON.stringify(result.body)}`);
      }
    };
    const eventRows = async (roomId: string) => {
      const result = await service.from("gameday_madden_participation_events").select("*").eq("room_id", roomId).order("created_at");
      if (result.error) throw result.error;
      return result.data ?? [];
    };

    const player = await createUser("player");
    const singleMatchup = await createRoom({
      pick_deadline: undefined,
      matchups: [{ team_a: "Bears", team_b: "Jags", line_text: null }],
      format_config: {
        week_label: "One Matchup Contract",
        reward_text: "+1 Dev Upgrade",
        deadline_display_text: "Tomorrow 3pm",
        minimum_matchups: 1,
        scoring_mode: "all_correct",
        bonus: { enabled: false, label: null, answer_options: [] },
      },
    });
    expect("one-matchup room creates exactly one playable prop", singleMatchup.props.length === 1);
    expect("one-matchup Discord card has no scheduled lock", singleMatchup.card.scheduled_lock_at == null);
    const singleJoin = await request(baseUrl, `/api/gameday/rooms/${singleMatchup.roomId}/join`, {
      method: "POST",
      body: { display_name: "One Matchup Guest" },
    });
    const singleGuest = singleJoin.body.guest_session_id;
    expect("participant joins one-matchup room", singleJoin.status === 200 && !!singleGuest);
    const singlePick = await request(baseUrl, `/api/gameday/props/${singleMatchup.props[0].id}/pick`, {
      method: "POST",
      guest: singleGuest,
      body: { selected_answer: singleMatchup.props[0].answer_options[0] },
    });
    expect("one saved pick completes the one-matchup participant", singlePick.status === 200);
    expect("one completion creates exactly one event", (await eventRows(singleMatchup.roomId)).length === 1);
    await request(baseUrl, `/api/gameday/props/${singleMatchup.props[0].id}/pick`, {
      method: "POST",
      guest: singleGuest,
      body: { selected_answer: singleMatchup.props[0].answer_options[1] },
    });
    expect("editing the completed one-matchup pick creates no duplicate event", (await eventRows(singleMatchup.roomId)).length === 1);
    const singleLock = await request(baseUrl, `/api/gameday/cards/${singleMatchup.card.id}/lock`, {
      method: "PATCH",
      bot: true,
      guild,
    });
    expect("manual lock succeeds for one-matchup room", singleLock.status === 200 && singleLock.body.ok === true);
    const singlePostLockPick = await request(baseUrl, `/api/gameday/props/${singleMatchup.props[0].id}/pick`, {
      method: "POST",
      guest: singleGuest,
      body: { selected_answer: singleMatchup.props[0].answer_options[0] },
    });
    expect("post-lock one-matchup edit is rejected", singlePostLockPick.status >= 400);
    const singleArchive = await request(baseUrl, `/api/gameday/rooms/${singleMatchup.roomId}/archive`, {
      method: "PATCH",
      bot: true,
      guild,
    });
    expect("one-matchup room archives successfully", singleArchive.status === 200 && singleArchive.body.ok === true);
    const singleEvent = (await eventRows(singleMatchup.roomId))[0];
    if (singleEvent?.id) {
      await request(baseUrl, `/api/gameday/bot/madden-participation-events/${singleEvent.id}/ack`, {
        method: "POST",
        bot: true,
        guild,
      });
    }

    const room = await createRoom();
    const roomB = await createRoom();
    const joinedAuth = await request(baseUrl, `/api/gameday/rooms/${room.roomId}/join`, { method: "POST", token: player.token });
    const joinedGuest = await request(baseUrl, `/api/gameday/rooms/${room.roomId}/join`, { method: "POST", body: { display_name: "Guest One" } });
    const guest = joinedGuest.body.guest_session_id;
    const joinedGuestB = await request(baseUrl, `/api/gameday/rooms/${roomB.roomId}/join`, { method: "POST", body: { display_name: "Guest From B" } });
    const guestFromB = joinedGuestB.body.guest_session_id;
    expect("authenticated participant joins", joinedAuth.status === 200 && !!joinedAuth.body.participant?.id);
    expect("guest participant joins", joinedGuest.status === 200 && !!guest);
    const crossRoomPick = await request(baseUrl, `/api/gameday/props/${room.props[0].id}/pick`, {
      method: "POST", guest: guestFromB, body: { selected_answer: room.props[0].answer_options[0] },
    });
    const crossRoomRows = await service
      .from("gameday_picks")
      .select("id")
      .eq("prop_id", room.props[0].id)
      .eq("participant_id", joinedGuestB.body.participant?.id);
    expect("guest token from room B cannot pick in room A", crossRoomPick.status === 401 && !crossRoomRows.data?.length);

    for (const prop of room.props.slice(0, 3)) {
      await request(baseUrl, `/api/gameday/props/${prop.id}/pick`, { method: "POST", token: player.token, body: { selected_answer: prop.answer_options[0] } });
    }
    expect("partial authenticated participant creates no event", (await eventRows(room.roomId)).length === 0);
    await request(baseUrl, `/api/gameday/props/${room.props[3].id}/pick`, { method: "POST", token: player.token, body: { selected_answer: room.props[3].answer_options[0] } });
    let events = await eventRows(room.roomId);
    expect("final required authenticated pick creates one event", events.length === 1);
    expect("enabled bonus is required for completion", events[0]?.completed_participant_count === 1);
    expect("event stores participant display and delivery context", !!events[0]?.participant_display_name && events[0]?.discord_guild_id === guild && !!events[0]?.discord_channel_id);
    expect("event does not persist selections", !("selected_answer" in (events[0] ?? {})) && !("metadata" in (events[0] ?? {})));

    await pickAll(room, { token: player.token });
    events = await eventRows(room.roomId);
    const refreshed = await request(baseUrl, `/api/gameday/rooms/${room.roomId}`, { token: player.token });
    expect("refresh/readback preserves the completed picks", refreshed.status === 200 && refreshed.body.my_picks?.[room.props[0].id] === room.props[0].answer_options[0]);
    expect("refresh/readback does not duplicate", events.length === 1);
    expect("identical resubmission does not duplicate", events.length === 1);
    await request(baseUrl, `/api/gameday/props/${room.props[0].id}/pick`, { method: "POST", token: player.token, body: { selected_answer: room.props[0].answer_options[1] } });
    expect("edit after completion does not duplicate", (await eventRows(room.roomId)).length === 1);

    for (const prop of room.props.slice(0, 3)) {
      await request(baseUrl, `/api/gameday/props/${prop.id}/pick`, { method: "POST", guest, body: { selected_answer: prop.answer_options[0] } });
    }
    expect("partial guest participant creates no event", (await eventRows(room.roomId)).length === 1);
    await request(baseUrl, `/api/gameday/props/${room.props[3].id}/pick`, { method: "POST", guest, body: { selected_answer: room.props[3].answer_options[0] } });
    events = await eventRows(room.roomId);
    expect("guest completion creates one event", events.length === 2);
    expect("second participant gets one event", events.filter((e: any) => e.participant_id !== events[0].participant_id).length === 1);
    expect("completion count increments uniquely", events.map((e: any) => e.completed_participant_count).join(",") === "1,2");

    const pending = await request(baseUrl, `/api/gameday/bot/madden-participation-events?limit=100`, { bot: true, guild });
    expect("correct guild fetches pending oldest-first", pending.status === 200 && pending.body.events?.length === 2 && pending.body.events[0].created_at <= pending.body.events[1].created_at);
    const otherPending = await request(baseUrl, `/api/gameday/bot/madden-participation-events`, { bot: true, guild: otherGuild });
    expect("other guild cannot see events", otherPending.status === 200 && otherPending.body.events.length === 0);
    expect("missing bot key is rejected", (await request(baseUrl, "/api/gameday/bot/madden-participation-events", { guild })).status === 401);
    expect("wrong nonempty bot key is rejected", (await request(baseUrl, "/api/gameday/bot/madden-participation-events", { bot: true, apiKey: "wrong-participation-key", guild })).status === 401);
    expect("missing guild is rejected", (await request(baseUrl, "/api/gameday/bot/madden-participation-events", { bot: true })).status === 400);
    expect("invalid limit is rejected", (await request(baseUrl, "/api/gameday/bot/madden-participation-events?limit=101", { bot: true, guild })).status === 400);
    expect("fetch never acknowledges", (await request(baseUrl, "/api/gameday/bot/madden-participation-events", { bot: true, guild })).body.events.length === 2);
    const eventId = pending.body.events[0].id;
    expect("cross-guild acknowledgement is rejected", (await request(baseUrl, `/api/gameday/bot/madden-participation-events/${eventId}/ack`, { method: "POST", bot: true, guild: otherGuild })).status === 403);
    expect("missing guild acknowledgement is rejected", (await request(baseUrl, `/api/gameday/bot/madden-participation-events/${eventId}/ack`, { method: "POST", bot: true })).status === 400);
    expect("invalid bot acknowledgement is rejected", (await request(baseUrl, `/api/gameday/bot/madden-participation-events/${eventId}/ack`, { method: "POST", guild })).status === 401);
    const firstAck = await request(baseUrl, `/api/gameday/bot/madden-participation-events/${eventId}/ack`, { method: "POST", bot: true, guild });
    expect("matching guild acknowledges event", firstAck.status === 200 && !!firstAck.body.event?.delivered_at);
    const repeatedAck = await request(baseUrl, `/api/gameday/bot/madden-participation-events/${eventId}/ack`, { method: "POST", bot: true, guild });
    expect(
      "repeated acknowledgement returns the persisted delivery timestamp",
      repeatedAck.status === 200 &&
        repeatedAck.body.already === true &&
        repeatedAck.body.delivered_at === firstAck.body.event.delivered_at,
    );
    expect("acknowledged event disappears", (await request(baseUrl, "/api/gameday/bot/madden-participation-events", { bot: true, guild })).body.events.length === 1);
    expect("unacknowledged event remains fetchable", (await request(baseUrl, "/api/gameday/bot/madden-participation-events", { bot: true, guild })).body.events[0].delivered_at === null);

    const disabled = await createRoom({
      pick_deadline: undefined,
      format_config: {
        ...formatConfig(false),
        deadline_display_text: "Before kickoff",
      },
    });
    const disabledJoin = await request(baseUrl, `/api/gameday/rooms/${disabled.roomId}/join`, { method: "POST", body: { display_name: "Disabled Bonus" } });
    const disabledGuest = disabledJoin.body.guest_session_id;
    for (const prop of disabled.props.slice(0, -1)) {
      await request(baseUrl, `/api/gameday/props/${prop.id}/pick`, {
        method: "POST", guest: disabledGuest, body: { selected_answer: prop.answer_options[0] },
      });
    }
    expect("no-deadline disabled-bonus partial completion creates no event", (await eventRows(disabled.roomId)).length === 0);
    const disabledFinalProp = disabled.props[disabled.props.length - 1];
    await request(baseUrl, `/api/gameday/props/${disabledFinalProp.id}/pick`, {
      method: "POST", guest: disabledGuest, body: { selected_answer: disabledFinalProp.answer_options[0] },
    });
    expect("no-deadline disabled bonus completes after every matchup prop", (await eventRows(disabled.roomId)).length === 1);
    expect("disabled bonus event count starts at one", (await eventRows(disabled.roomId))[0]?.completed_participant_count === 1);
    await request(baseUrl, `/api/gameday/props/${disabled.props[0].id}/pick`, {
      method: "POST", guest: disabledGuest, body: { selected_answer: disabled.props[0].answer_options[1] },
    });
    expect("editing a completed no-deadline card creates no duplicate", (await eventRows(disabled.roomId)).length === 1);
    const disabledSecondJoin = await request(baseUrl, `/api/gameday/rooms/${disabled.roomId}/join`, { method: "POST", body: { display_name: "Disabled Bonus Two" } });
    await pickAll(disabled, { guest: disabledSecondJoin.body.guest_session_id });
    const disabledEvents = await eventRows(disabled.roomId);
    expect("second no-deadline participant creates exactly one additional event", disabledEvents.length === 2);
    expect("no-deadline completion count increments for the second participant", disabledEvents.map((event: any) => event.completed_participant_count).join(",") === "1,2");

    const web = await createRoom();
    await service.from("gameday_rooms").update({ source: "web", sport: "madden", template_type: "weekly_pick_card", host_user_id: player.id }).eq("id", web.roomId);
    const webJoin = await request(baseUrl, `/api/gameday/rooms/${web.roomId}/join`, { method: "POST", body: { display_name: "Web Participant" } });
    await pickAll(web, { guest: webJoin.body.guest_session_id });
    expect("web-created Madden room creates no event", (await eventRows(web.roomId)).length === 0);

    const noChannel = await createRoom();
    await service.from("gameday_rooms").update({ discord_channel_id: null }).eq("id", noChannel.roomId);
    const noChannelJoin = await request(baseUrl, `/api/gameday/rooms/${noChannel.roomId}/join`, { method: "POST", body: { display_name: "No Channel" } });
    await pickAll(noChannel, { guest: noChannelJoin.body.guest_session_id });
    expect("Discord room without channel metadata creates no event", (await eventRows(noChannel.roomId)).length === 0);

    const nonMadden = await createRoom();
    await service.from("gameday_rooms").update({ sport: "nfl" }).eq("id", nonMadden.roomId);
    const nonMaddenJoin = await request(baseUrl, `/api/gameday/rooms/${nonMadden.roomId}/join`, { method: "POST", body: { display_name: "NFL Participant" } });
    await pickAll(nonMadden, { guest: nonMaddenJoin.body.guest_session_id });
    expect("non-Madden room creates no event", (await eventRows(nonMadden.roomId)).length === 0);

    const archived = await createRoom();
    await service.from("gameday_rooms").update({ archived_at: new Date().toISOString() }).eq("id", archived.roomId);
    const archivedJoin = await request(baseUrl, `/api/gameday/rooms/${archived.roomId}/join`, { method: "POST", body: { display_name: "Archived Participant" } });
    const archivedPick = await request(baseUrl, `/api/gameday/props/${archived.props[0].id}/pick`, { method: "POST", guest: archivedJoin.body.guest_session_id, body: { selected_answer: archived.props[0].answer_options[0] } });
    const archivedPicks = await service.from("gameday_picks").select("id").eq("prop_id", archived.props[0].id);
    expect("archived room rejects pick and creates no event", archivedPick.status === 410 && !archivedPicks.data?.length && (await eventRows(archived.roomId)).length === 0);
    const finalized = await createRoom();
    await service.from("gameday_rooms").update({ status: "finalized" }).eq("id", finalized.roomId);
    const finalizedJoin = await request(baseUrl, `/api/gameday/rooms/${finalized.roomId}/join`, { method: "POST", body: { display_name: "Finalized Participant" } });
    const finalizedPick = await request(baseUrl, `/api/gameday/props/${finalized.props[0].id}/pick`, { method: "POST", guest: finalizedJoin.body.guest_session_id, body: { selected_answer: finalized.props[0].answer_options[0] } });
    const finalizedPicks = await service.from("gameday_picks").select("id").eq("prop_id", finalized.props[0].id);
    expect("finalized room rejects pick and creates no event", finalizedPick.status >= 400 && !finalizedPicks.data?.length && (await eventRows(finalized.roomId)).length === 0);
    const deadline = await createRoom({ pick_deadline: new Date(Date.now() - 1000).toISOString() });
    const deadlineJoin = await request(baseUrl, `/api/gameday/rooms/${deadline.roomId}/join`, { method: "POST", body: { display_name: "Deadline Participant" } });
    const deadlinePick = await request(baseUrl, `/api/gameday/props/${deadline.props[0].id}/pick`, { method: "POST", guest: deadlineJoin.body.guest_session_id, body: { selected_answer: deadline.props[0].answer_options[0] } });
    expect("deadline prevents event-generating pick", deadlinePick.status === 409 && (await eventRows(deadline.roomId)).length === 0);

    const readback = await request(baseUrl, `/api/gameday/rooms/${room.roomId}`, { token: player.token });
    expect("existing Madden pick readback remains unchanged", readback.status === 200 && readback.body.my_picks?.[room.props[0].id] === room.props[0].answer_options[1]);
    expect("multiple pending fetches do not create database duplicates", (await eventRows(room.roomId)).length === 2);
    expect("room and participant uniqueness is durable", new Set((await eventRows(room.roomId)).map((e: any) => `${e.room_id}:${e.participant_id}`)).size === 2);
    expect("event type is the documented activity type", (await eventRows(room.roomId)).every((e: any) => e.event_type === "madden_picks_completed"));
    expect("delivery starts pending and ack persists", (await eventRows(room.roomId)).some((e: any) => e.delivered_at === null) && (await eventRows(room.roomId)).some((e: any) => e.delivered_at !== null));

    const concurrent = await createRoom();
    const concurrentA = await request(baseUrl, `/api/gameday/rooms/${concurrent.roomId}/join`, { method: "POST", body: { display_name: "Concurrent A" } });
    const concurrentB = await request(baseUrl, `/api/gameday/rooms/${concurrent.roomId}/join`, { method: "POST", body: { display_name: "Concurrent B" } });
    for (const prop of concurrent.props.slice(0, 3)) {
      await request(baseUrl, `/api/gameday/props/${prop.id}/pick`, { method: "POST", guest: concurrentA.body.guest_session_id, body: { selected_answer: prop.answer_options[0] } });
      await request(baseUrl, `/api/gameday/props/${prop.id}/pick`, { method: "POST", guest: concurrentB.body.guest_session_id, body: { selected_answer: prop.answer_options[0] } });
    }
    await Promise.all([
      request(baseUrl, `/api/gameday/props/${concurrent.props[3].id}/pick`, { method: "POST", guest: concurrentA.body.guest_session_id, body: { selected_answer: concurrent.props[3].answer_options[0] } }),
      request(baseUrl, `/api/gameday/props/${concurrent.props[3].id}/pick`, { method: "POST", guest: concurrentB.body.guest_session_id, body: { selected_answer: concurrent.props[3].answer_options[0] } }),
    ]);
    const concurrentEvents = await eventRows(concurrent.roomId);
    expect("concurrent final picks create two durable events", concurrentEvents.length === 2);
    expect("concurrent completion counts remain sequential", concurrentEvents.map((e: any) => e.completed_participant_count).sort().join(",") === "1,2");

    console.log(`\nMADDEN PARTICIPATION: ${passed}/${passed + failed} assertions passed`);
    if (failed) process.exitCode = 1;
  } finally {
    if (roomIds.length) await service.from("gameday_rooms").delete().in("id", roomIds);
    for (const id of userIds) await service.auth.admin.deleteUser(id);
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error("\nMadden participation integration failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });