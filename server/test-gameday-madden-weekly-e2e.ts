/**
 * Database-backed Madden Weekly Pick Card validation.
 *
 * This suite creates one temporary room, user pair, and participant pair,
 * then removes all fixtures in finally. It never posts to Discord.
 *
 * Run with: npx tsx server/test-gameday-madden-weekly-e2e.ts
 */

import express from "express";
import { createClient } from "@supabase/supabase-js";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

let passed = 0;
let failed = 0;

const expect = (label: string, value: unknown, detail = "") => {
  if (value) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const unique = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const matchupSet = [
  { team_a: "Ravens", team_b: "Bengals", line_text: "Ravens -3" },
  { team_a: "Chiefs", team_b: "Raiders", line_text: "" },
  { team_a: "Eagles", team_b: "Cowboys", line_text: "Eagles +2.5" },
];

const formatConfig = {
  week_label: "Franchise Week 4",
  reward_text: "Superstar trait upgrade",
  minimum_matchups: 3,
  scoring_mode: "all_correct",
  bonus: {
    enabled: true,
    label: "Who wins the bonus game?",
    answer_options: ["Home", "Away"],
  },
};

async function main() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) {
    throw new Error("Required Supabase configuration is unavailable");
  }

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = unique("gameday-madden-e2e");
  const password = `Test-${runId}-A1!`;
  const hostEmail = `${runId}-host@example.test`;
  const playerEmail = `${runId}-player@example.test`;
  const unrelatedEmail = `${runId}-unrelated@example.test`;
  const botApiKey = unique("gameday-madden-bot");
  const botGuildId = `MADDEN_GUILD_${runId}`;
  process.env.GAMEDAY_BOT_API_KEY = botApiKey;
  process.env.GAMEDAY_HOST_EMAILS = hostEmail;
  process.env.GAMEDAY_ADMIN_EMAILS = hostEmail;

  const { registerGamedayRoutes } = await import(
    `${process.cwd()}/server/routes-gameday.ts`
  );
  const app = express();
  app.use(express.json());
  registerGamedayRoutes(app);

  let server: Server | null = null;
  const userIds: string[] = [];
  const roomIds: string[] = [];

  try {
    server = await new Promise<Server>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const request = async (
      path: string,
      opts: {
        method?: string;
        token?: string;
        apiKey?: string;
        discordGuildHeader?: string;
        guest?: string;
        body?: unknown;
      } = {},
    ) => {
      const headers: Record<string, string> = {};
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      if (opts.apiKey) headers["x-api-key"] = opts.apiKey;
      if (opts.discordGuildHeader) headers["x-discord-guild-id"] = opts.discordGuildHeader;
      if (opts.guest) headers["X-Guest-Session"] = opts.guest;
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(baseUrl + path, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => ({}))) as any,
      };
    };

    const makeUser = async (email: string) => {
      const created = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        throw new Error(`User create failed: ${created.error?.message}`);
      }
      userIds.push(created.data.user.id);
      const signed = await auth.auth.signInWithPassword({ email, password });
      if (signed.error || !signed.data.session) {
        throw new Error(`Sign-in failed: ${signed.error?.message}`);
      }
      return {
        id: created.data.user.id,
        token: signed.data.session.access_token,
      };
    };

    const basePayload = {
      room_name: `Madden Weekly ${runId}`,
      sport: "madden",
      template_type: "weekly_pick_card",
      is_private: true,
      format_config: formatConfig,
      matchups: matchupSet,
      pick_deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };

    const unauthenticatedCreate = await request("/api/gameday/rooms", {
      method: "POST",
      body: basePayload,
    });
    expect(
      "unauthenticated user cannot create a Madden Weekly Pick Card",
      unauthenticatedCreate.status === 401,
      JSON.stringify(unauthenticatedCreate.body),
    );

    const botPayload = {
      ...basePayload,
      room_name: `Discord Madden Weekly ${runId}`,
      is_private: false,
      discord_guild_id: botGuildId,
      discord_channel_id: `MADDEN_CHANNEL_${runId}`,
      discord_user_id: `MADDEN_USER_${runId}`,
    };
    const invalidBotKey = await request("/api/gameday/rooms", {
      method: "POST",
      apiKey: "wrong-madden-bot-key",
      discordGuildHeader: botGuildId,
      body: botPayload,
    });
    expect(
      "invalid bot key is rejected for Madden creation",
      invalidBotKey.status === 401,
      JSON.stringify(invalidBotKey.body),
    );

    const missingBotGuild = await request("/api/gameday/rooms", {
      method: "POST",
      apiKey: botApiKey,
      discordGuildHeader: botGuildId,
      body: { ...botPayload, discord_guild_id: undefined },
    });
    expect(
      "bot Madden creation requires discord_guild_id in the body",
      missingBotGuild.status === 400,
      JSON.stringify(missingBotGuild.body),
    );

    const missingBotGuildHeader = await request("/api/gameday/rooms", {
      method: "POST",
      apiKey: botApiKey,
      body: botPayload,
    });
    expect(
      "bot Madden creation requires X-Discord-Guild-ID",
      missingBotGuildHeader.status === 400,
      JSON.stringify(missingBotGuildHeader.body),
    );

    const mismatchedBotGuild = await request("/api/gameday/rooms", {
      method: "POST",
      apiKey: botApiKey,
      discordGuildHeader: `${botGuildId}_OTHER`,
      body: botPayload,
    });
    expect(
      "bot Madden creation rejects a mismatched guild header",
      mismatchedBotGuild.status === 403,
      JSON.stringify(mismatchedBotGuild.body),
    );

    const invalidBotDeadline = await request("/api/gameday/rooms", {
      method: "POST",
      apiKey: botApiKey,
      discordGuildHeader: botGuildId,
      body: { ...botPayload, pick_deadline: "not-a-date" },
    });
    expect(
      "invalid Madden deadline is rejected",
      invalidBotDeadline.status === 400,
      JSON.stringify(invalidBotDeadline.body),
    );

    const invalidBotBonus = await request("/api/gameday/rooms", {
      method: "POST",
      apiKey: botApiKey,
      discordGuildHeader: botGuildId,
      body: {
        ...botPayload,
        format_config: {
          ...formatConfig,
          bonus: {
            enabled: true,
            label: "Bonus question",
            answer_options: ["Only one option"],
          },
        },
      },
    });
    expect(
      "invalid Madden bonus metadata is rejected",
      invalidBotBonus.status === 400,
      JSON.stringify(invalidBotBonus.body),
    );

    const botCreated = await request("/api/gameday/rooms", {
      method: "POST",
      apiKey: botApiKey,
      discordGuildHeader: botGuildId,
      body: botPayload,
    });
    const botRoomId = botCreated.body.room_id as string | undefined;
    if (botRoomId) roomIds.push(botRoomId);
    expect(
      "valid bot-authenticated Madden creation succeeds",
      botCreated.status === 200 &&
        botCreated.body.ok === true &&
        botCreated.body.room?.sport === "madden" &&
        botCreated.body.room?.template_type === "weekly_pick_card",
      JSON.stringify(botCreated.body),
    );
    expect(
      "bot Madden room is private and guild-scoped",
      botCreated.body.room?.source === "discord" &&
        botCreated.body.room?.is_private === true &&
        botCreated.body.room?.discord_guild_id === botGuildId &&
        botCreated.body.room?.discord_channel_id === `MADDEN_CHANNEL_${runId}` &&
        botCreated.body.room?.discord_user_id === `MADDEN_USER_${runId}` &&
        typeof botCreated.body.public_link === "string",
      JSON.stringify(botCreated.body),
    );
    if (!botRoomId) throw new Error("Bot Madden creation did not return a room ID");

    const botCard = await service
      .from("gameday_pick_cards")
      .select("id, status")
      .eq("room_id", botRoomId)
      .eq("phase", "pregame")
      .single();
    const botProps = botCard.data?.id
      ? await service
          .from("gameday_props")
          .select("answer_options, line_text")
          .eq("card_id", botCard.data.id)
          .order("display_order", { ascending: true })
      : { data: null, error: new Error("Bot Madden card was not created") };
    expect(
      "bot Madden room opens one playable card with matchup choices",
      !botCard.error &&
        botCard.data?.status === "open" &&
        !botProps.error &&
        (botProps.data ?? []).length === matchupSet.length + 1 &&
        (botProps.data ?? []).slice(0, matchupSet.length).every(
          (prop: any, index: number) =>
            Array.isArray(prop.answer_options) &&
            prop.answer_options.length === 2 &&
            prop.answer_options[0] === matchupSet[index].team_a &&
            prop.answer_options[1] === matchupSet[index].team_b,
        ),
      JSON.stringify({ card: botCard.data, props: botProps.data }),
    );

    const host = await makeUser(hostEmail);
    const unrelated = await makeUser(unrelatedEmail);
    const player = await makeUser(playerEmail);

    const unauthorizedCreate = await request("/api/gameday/rooms", {
      method: "POST",
      token: unrelated.token,
      body: basePayload,
    });
    expect(
      "unauthorized authenticated user cannot create a Madden Weekly Pick Card",
      unauthorizedCreate.status === 403,
      JSON.stringify(unauthorizedCreate.body),
    );

    const invalidMaddenTemplate = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.token,
      body: { ...basePayload, template_type: "nfl_single_game" },
    });
    expect(
      "Madden is limited to weekly_pick_card",
      invalidMaddenTemplate.status === 400,
      JSON.stringify(invalidMaddenTemplate.body),
    );

    const invalidNbaTemplate = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.token,
      body: { ...basePayload, sport: "nba" },
    });
    expect(
      "weekly_pick_card is limited to Madden",
      invalidNbaTemplate.status === 400,
      JSON.stringify(invalidNbaTemplate.body),
    );

    const tooFew = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.token,
      body: {
        ...basePayload,
        matchups: matchupSet.slice(0, 2),
        format_config: { ...formatConfig, minimum_matchups: 2 },
      },
    });
    expect(
      "fewer than 3 matchups are rejected by the room route",
      tooFew.status === 400,
      JSON.stringify(tooFew.body),
    );

    const tooMany = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.token,
      body: {
        ...basePayload,
        matchups: Array.from({ length: 8 }, (_, index) => ({
          team_a: `Home ${index + 1}`,
          team_b: `Away ${index + 1}`,
          line_text: "",
        })),
      },
    });
    expect(
      "more than 7 matchups are rejected by the room route",
      tooMany.status === 400,
      JSON.stringify(tooMany.body),
    );

    const created = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.token,
      body: basePayload,
    });
    const roomId = created.body.room_id as string | undefined;
    if (roomId) roomIds.push(roomId);
    expect(
      "authorized Game Day host creates a Madden Weekly Pick Card",
      created.status === 200 &&
        created.body.ok === true &&
        created.body.room?.sport === "madden" &&
        created.body.room?.template_type === "weekly_pick_card",
      JSON.stringify(created.body),
    );
    if (!roomId) throw new Error("Madden room creation did not return a room ID");

    const hostData = await request(`/api/gameday/rooms/${roomId}/host-data`, {
      token: host.token,
    });
    const cards = hostData.body.cards ?? [];
    const card = cards[0];
    const props = card?.gameday_props ?? [];
    const matchupProps = props.slice(0, matchupSet.length);
    expect(
      "format_config persists week, reward, minimum, scoring, and bonus metadata",
      hostData.status === 200 &&
        hostData.body.room?.format_config?.week_label === formatConfig.week_label &&
        hostData.body.room?.format_config?.reward_text === formatConfig.reward_text &&
        hostData.body.room?.format_config?.minimum_matchups === 3 &&
        hostData.body.room?.format_config?.scoring_mode === "all_correct" &&
        hostData.body.room?.format_config?.bonus?.enabled === true,
      JSON.stringify(hostData.body.room?.format_config),
    );
    expect(
      "Madden room has one aggregate pregame card",
      cards.length === 1 && card.phase === "pregame",
      JSON.stringify(cards.map((value: any) => value.phase)),
    );
    expect(
      "required 3–7 matchup range creates three matchup props plus one bonus prop",
      props.length === 4 && matchupProps.length === 3,
      JSON.stringify(props),
    );
    expect(
      "each matchup creates exactly two answer choices",
      matchupProps.every(
        (prop: any, index: number) =>
          Array.isArray(prop.answer_options) &&
          prop.answer_options.length === 2 &&
          prop.answer_options[0] === matchupSet[index].team_a &&
          prop.answer_options[1] === matchupSet[index].team_b,
      ),
      JSON.stringify(matchupProps.map((prop: any) => prop.answer_options)),
    );
    expect(
      "optional line text is stored and returned as display text",
      matchupProps[0]?.line_text === "Ravens -3" &&
        matchupProps[1]?.line_text === null &&
        matchupProps[2]?.line_text === "Eagles +2.5",
      JSON.stringify(matchupProps.map((prop: any) => prop.line_text)),
    );
    expect(
      "pick deadline is stored on the weekly card",
      typeof card.scheduled_lock_at === "string",
      JSON.stringify(card),
    );

    const publicRooms = await request("/api/gameday/public-rooms");
    expect(
      "private Madden room stays out of public discovery",
      publicRooms.status === 200 &&
        !(publicRooms.body.rooms ?? []).some((room: any) => room.id === roomId),
      JSON.stringify(publicRooms.body),
    );

    const joinedAuth = await request(`/api/gameday/rooms/${roomId}/join`, {
      method: "POST",
      token: player.token,
    });
    const joinedGuest = await request(`/api/gameday/rooms/${roomId}/join`, {
      method: "POST",
      body: { display_name: `Guest ${runId}` },
    });
    const guestSession = joinedGuest.body.guest_session_id as string | undefined;
    expect(
      "authenticated participant can join a Madden room",
      joinedAuth.status === 200 && joinedAuth.body.participant?.is_guest === false,
      JSON.stringify(joinedAuth.body),
    );
    expect(
      "guest participant can join a Madden room",
      joinedGuest.status === 200 &&
        joinedGuest.body.participant?.is_guest === true &&
        !!guestSession,
      JSON.stringify(joinedGuest.body),
    );
    if (!guestSession) throw new Error("Guest join did not return a guest session");

    const myRooms = await request("/api/gameday/my-rooms", { token: player.token });
    expect(
      "signed-in participant can find the Madden room in Continue Playing data",
      myRooms.status === 200 &&
        (myRooms.body.rooms ?? []).some((room: any) => room.room_id === roomId),
      JSON.stringify(myRooms.body),
    );

    const opened = await request(`/api/gameday/cards/${card.id}/open`, {
      method: "PATCH",
      token: host.token,
    });
    expect(
      "Madden card can be opened by the authorized host",
      opened.status === 200 && opened.body.ok === true,
      JSON.stringify(opened.body),
    );

    for (const prop of props) {
      const guestPick = await request(`/api/gameday/props/${prop.id}/pick`, {
        method: "POST",
        guest: guestSession,
        body: { selected_answer: prop.answer_options[0] },
      });
      expect(
        `guest pick persists for ${prop.question}`,
        guestPick.status === 200 && guestPick.body.ok === true,
        JSON.stringify(guestPick.body),
      );
    }

    for (const prop of props) {
      const playerPick = await request(`/api/gameday/props/${prop.id}/pick`, {
        method: "POST",
        token: player.token,
        body: { selected_answer: prop.answer_options[0] },
      });
      expect(
        `authenticated pick persists for ${prop.question}`,
        playerPick.status === 200 && playerPick.body.ok === true,
        JSON.stringify(playerPick.body),
      );
    }

    const edited = await request(`/api/gameday/props/${props[0].id}/pick`, {
      method: "POST",
      token: player.token,
      body: { selected_answer: props[0].answer_options[1] },
    });
    expect(
      "authenticated picks can be edited before lock",
      edited.status === 200 && edited.body.ok === true,
      JSON.stringify(edited.body),
    );

    const savedAuth = await request(`/api/gameday/rooms/${roomId}`, {
      token: player.token,
    });
    const savedGuest = await request(`/api/gameday/rooms/${roomId}`, {
      guest: guestSession,
    });
    expect(
      "returning authenticated participant receives saved Madden picks",
      savedAuth.status === 200 &&
        savedAuth.body.my_picks?.[props[0].id] === props[0].answer_options[1] &&
        savedAuth.body.my_picks?.[props[1].id] === props[1].answer_options[0],
      JSON.stringify(savedAuth.body.my_picks),
    );
    expect(
      "returning guest receives saved Madden picks",
      savedGuest.status === 200 &&
        savedGuest.body.my_picks?.[props[0].id] === props[0].answer_options[0] &&
        savedGuest.body.my_picks?.[props[1].id] === props[1].answer_options[0],
      JSON.stringify(savedGuest.body.my_picks),
    );

    const locked = await request(`/api/gameday/cards/${card.id}/lock`, {
      method: "PATCH",
      token: host.token,
    });
    expect(
      "Madden picks can be locked by the authorized host",
      locked.status === 200 && locked.body.ok === true,
      JSON.stringify(locked.body),
    );

    const pickAfterLock = await request(`/api/gameday/props/${props[0].id}/pick`, {
      method: "POST",
      token: player.token,
      body: { selected_answer: props[0].answer_options[0] },
    });
    expect(
      "picks are rejected after lock",
      pickAfterLock.status === 400,
      JSON.stringify(pickAfterLock.body),
    );

    for (const prop of props) {
      const correctAnswer =
        prop.id === props[0].id
          ? props[0].answer_options[0]
          : prop.answer_options[0];
      const settled = await request(`/api/gameday/props/${prop.id}/settle`, {
        method: "PATCH",
        token: host.token,
        body: { correct_answer: correctAnswer },
      });
      expect(
        `manual settlement works for ${prop.question}`,
        settled.status === 200 && settled.body.ok === true,
        JSON.stringify(settled.body),
      );
    }

    const leaderboard = await request(`/api/gameday/rooms/${roomId}/leaderboard`);
    const leaderboardRows = leaderboard.body.leaderboard ?? [];
    const guestParticipantId = joinedGuest.body.participant?.id;
    const authParticipantId = joinedAuth.body.participant?.id;
    const guestStanding = leaderboardRows.find(
      (row: any) => row.participant_id === guestParticipantId,
    );
    const authStanding = leaderboardRows.find(
      (row: any) => row.participant_id === authParticipantId,
    );
    expect(
      "leaderboard awards four correct picks to the guest",
      leaderboard.status === 200 &&
        guestStanding?.correct_picks === 4 &&
        guestStanding?.game_day_sp === 40,
      JSON.stringify(leaderboard.body),
    );
    expect(
      "leaderboard reflects the edited authenticated pick",
      authStanding?.correct_picks === 3 && authStanding?.game_day_sp === 30,
      JSON.stringify(leaderboard.body),
    );

    const finalized = await request(`/api/gameday/rooms/${roomId}/finalize`, {
      method: "PATCH",
      token: host.token,
    });
    expect(
      "Madden room finalization works",
      finalized.status === 200 && finalized.body.ok === true,
      JSON.stringify(finalized.body),
    );
    const finalStandings = await request(
      `/api/gameday/rooms/${roomId}/final-standings`,
    );
    expect(
      "final standings are available after Madden finalization",
      finalStandings.status === 200 && finalStandings.body.finalized === true,
      JSON.stringify(finalStandings.body),
    );
  } finally {
    if (roomIds.length) {
      await service.from("gameday_rooms").delete().in("id", roomIds);
    }
    for (const id of userIds) {
      await service.auth.admin.deleteUser(id);
    }
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  }

  console.log(`\nMADDEN WEEKLY E2E: ${passed}/${passed + failed} assertions passed`);
  if (failed) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });