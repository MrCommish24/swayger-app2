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
      pick_deadline: undefined,
      room_name: `Discord Madden Weekly ${runId}`,
      is_private: false,
      format_config: {
        ...formatConfig,
        deadline_display_text: "Sunday 1 PM CST",
        bonus: {
          enabled: false,
          label: null,
          answer_options: [],
        },
      },
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
    for (const malformedDeadline of [null, "", "Sunday at 1", 123]) {
      const malformedBotDeadline = await request("/api/gameday/rooms", {
        method: "POST",
        apiKey: botApiKey,
        discordGuildHeader: botGuildId,
        body: { ...botPayload, pick_deadline: malformedDeadline },
      });
      expect(
        `supplied malformed Madden deadline ${JSON.stringify(malformedDeadline)} is rejected`,
        malformedBotDeadline.status === 400,
        JSON.stringify(malformedBotDeadline.body),
      );
    }

    const missingBotDisplayDeadline = await request("/api/gameday/rooms", {
      method: "POST",
      apiKey: botApiKey,
      discordGuildHeader: botGuildId,
      body: {
        ...botPayload,
        format_config: {
          ...botPayload.format_config,
          deadline_display_text: undefined,
        },
      },
    });
    expect(
      "Discord Madden without a timestamp requires free-form deadline display text",
      missingBotDisplayDeadline.status === 400,
      JSON.stringify(missingBotDisplayDeadline.body),
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
      .select("id, status, scheduled_lock_at")
      .eq("room_id", botRoomId)
      .eq("phase", "pregame")
      .single();
    const botProps = botCard.data?.id
      ? await service
          .from("gameday_props")
          .select("id, answer_options, line_text")
          .eq("card_id", botCard.data.id)
          .order("display_order", { ascending: true })
      : { data: null, error: new Error("Bot Madden card was not created") };
    expect(
      "bot Madden room opens one playable card with matchup choices",
      !botCard.error &&
        botCard.data?.status === "open" &&
        !botProps.error &&
        (botProps.data ?? []).length === matchupSet.length &&
        (botProps.data ?? []).slice(0, matchupSet.length).every(
          (prop: any, index: number) =>
            Array.isArray(prop.answer_options) &&
            prop.answer_options.length === 2 &&
            prop.answer_options[0] === matchupSet[index].team_a &&
            prop.answer_options[1] === matchupSet[index].team_b,
        ),
      JSON.stringify({ card: botCard.data, props: botProps.data }),
    );
    expect(
      "Discord Madden preserves display-only deadline text without a scheduled cutoff or bonus prop",
      botCreated.body.room?.format_config?.deadline_display_text === "Sunday 1 PM CST" &&
        botCreated.body.room?.format_config?.bonus?.enabled === false &&
        botCard.data?.scheduled_lock_at == null &&
        (botProps.data ?? []).length === matchupSet.length,
      JSON.stringify({ room: botCreated.body.room, card: botCard.data, props: botProps.data }),
    );

    const alternateDeadlineCreated = await request("/api/gameday/rooms", {
      method: "POST",
      apiKey: botApiKey,
      discordGuildHeader: botGuildId,
      body: {
        ...botPayload,
        room_name: `Discord Madden Before Kickoff ${runId}`,
        format_config: {
          ...botPayload.format_config,
          deadline_display_text: "Before kickoff",
        },
      },
    });
    if (alternateDeadlineCreated.body.room_id) {
      roomIds.push(alternateDeadlineCreated.body.room_id);
    }
    expect(
      "Discord Madden preserves alternate free-form deadline wording verbatim",
      alternateDeadlineCreated.status === 200 &&
        alternateDeadlineCreated.body.room?.format_config?.deadline_display_text === "Before kickoff",
      JSON.stringify(alternateDeadlineCreated.body),
    );

    const botProp = botProps.data?.[0];
    const joinedBotGuest = await request(`/api/gameday/rooms/${botRoomId}/join`, {
      method: "POST",
      body: { display_name: `Manual Lock Guest ${runId}` },
    });
    const botGuestSession = joinedBotGuest.body.guest_session_id as string | undefined;
    const botInitialPick = await request(`/api/gameday/props/${botProp?.id}/pick`, {
      method: "POST",
      guest: botGuestSession,
      body: { selected_answer: botProp?.answer_options?.[0] },
    });
    const botEditedPick = await request(`/api/gameday/props/${botProp?.id}/pick`, {
      method: "POST",
      guest: botGuestSession,
      body: { selected_answer: botProp?.answer_options?.[1] },
    });
    const openBotRoom = await request(`/api/gameday/rooms/${botRoomId}`, {
      guest: botGuestSession,
    });
    expect(
      "Discord Madden picks remain editable while the manually locked card is open",
      !!botGuestSession && botInitialPick.status === 200 && botEditedPick.status === 200,
      JSON.stringify({ joinedBotGuest, botInitialPick, botEditedPick }),
    );
    expect(
      "no-timestamp room reports an open editable card with no passed deadline",
      openBotRoom.status === 200 &&
        openBotRoom.body.cards?.[0]?.scheduled_lock_at == null &&
        openBotRoom.body.cards?.[0]?.deadline_passed === false &&
        openBotRoom.body.cards?.[0]?.can_edit_picks === true,
      JSON.stringify(openBotRoom.body.cards?.[0]),
    );

    const manuallyLockedBeforeDeadline = await request(
      `/api/gameday/cards/${botCard.data?.id}/lock`,
      {
        method: "PATCH",
        apiKey: botApiKey,
        discordGuildHeader: botGuildId,
      },
    );
    expect(
      "manual Madden lock remains authoritative without a scheduled deadline",
      manuallyLockedBeforeDeadline.status === 200 &&
        manuallyLockedBeforeDeadline.body.ok === true,
      JSON.stringify(manuallyLockedBeforeDeadline.body),
    );
    const pickAfterEarlyManualLock = await request(
      `/api/gameday/props/${botProp?.id}/pick`,
      {
        method: "POST",
        guest: botGuestSession,
        body: { selected_answer: botProp?.answer_options?.[0] },
      },
    );
    expect(
      "manual Madden lock rejects later pick writes",
      pickAfterEarlyManualLock.status === 400,
      JSON.stringify(pickAfterEarlyManualLock.body),
    );
    const lockedBotRoom = await request(`/api/gameday/rooms/${botRoomId}`, {
      guest: botGuestSession,
    });
    expect(
      "existing Discord Madden picks remain readable after manual lock",
      lockedBotRoom.status === 200 &&
        lockedBotRoom.body.my_picks?.[botProp?.id] === botProp?.answer_options?.[1],
      JSON.stringify(lockedBotRoom.body.my_picks),
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

    const webCreateWithoutDeadline = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.token,
      body: { ...basePayload, pick_deadline: undefined },
    });
    expect(
      "web-created Madden still requires a real pick deadline",
      webCreateWithoutDeadline.status === 400,
      JSON.stringify(webCreateWithoutDeadline.body),
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

    const zeroMatchups = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.token,
      body: {
        ...basePayload,
        room_name: `Zero Matchups ${runId}`,
        matchups: [],
        format_config: { ...formatConfig, minimum_matchups: 1 },
      },
    });
    expect(
      "zero matchups are rejected by the room route",
      zeroMatchups.status === 400,
      JSON.stringify(zeroMatchups.body),
    );

    const sameTeamMatchup = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.token,
      body: {
        ...basePayload,
        room_name: `Same Team ${runId}`,
        matchups: [{ team_a: "Bears", team_b: "bears", line_text: null }],
        format_config: { ...formatConfig, minimum_matchups: 1 },
      },
    });
    expect(
      "same-team matchups are rejected by the room route",
      sameTeamMatchup.status === 400,
      JSON.stringify(sameTeamMatchup.body),
    );

    const oneMatchup = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.token,
      body: {
        ...basePayload,
        room_name: `One Matchup ${runId}`,
        matchups: matchupSet.slice(0, 1),
        format_config: { ...formatConfig, minimum_matchups: 1 },
      },
    });
    if (oneMatchup.body.room_id) roomIds.push(oneMatchup.body.room_id);
    expect(
      "one matchup is accepted by the room route",
      oneMatchup.status === 200,
      JSON.stringify(oneMatchup.body),
    );

    const twoMatchups = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.token,
      body: {
        ...basePayload,
        room_name: `Two Matchups ${runId}`,
        matchups: matchupSet.slice(0, 2),
        format_config: { ...formatConfig, minimum_matchups: 1 },
      },
    });
    if (twoMatchups.body.room_id) roomIds.push(twoMatchups.body.room_id);
    expect(
      "two matchups are accepted by the room route",
      twoMatchups.status === 200,
      JSON.stringify(twoMatchups.body),
    );

    const sevenMatchups = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.token,
      body: {
        ...basePayload,
        room_name: `Seven Matchups ${runId}`,
        matchups: Array.from({ length: 7 }, (_, index) => ({
          team_a: `Home ${index + 1}`,
          team_b: `Away ${index + 1}`,
          line_text: null,
        })),
        format_config: { ...formatConfig, minimum_matchups: 1 },
      },
    });
    if (sevenMatchups.body.room_id) roomIds.push(sevenMatchups.body.room_id);
    expect(
      "seven matchups are accepted by the room route",
      sevenMatchups.status === 200,
      JSON.stringify(sevenMatchups.body),
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

    const botOperator = {
      apiKey: botApiKey,
      discordGuildHeader: botGuildId,
    };
    const created = await request("/api/gameday/rooms", {
      method: "POST",
      ...botOperator,
      body: {
        ...basePayload,
        discord_guild_id: botGuildId,
        discord_channel_id: `MADDEN_SETTLEMENT_CHANNEL_${runId}`,
        discord_user_id: `MADDEN_SETTLEMENT_USER_${runId}`,
      },
    });
    const roomId = created.body.room_id as string | undefined;
    if (roomId) roomIds.push(roomId);
    expect(
      "authorized Discord bot creates the Madden Weekly Pick Card settlement fixture",
      created.status === 200 &&
        created.body.ok === true &&
        created.body.room?.source === "discord" &&
        created.body.room?.sport === "madden" &&
        created.body.room?.template_type === "weekly_pick_card",
      JSON.stringify(created.body),
    );
    if (!roomId) throw new Error("Madden room creation did not return a room ID");
    const roomCode = created.body.room?.room_code as string | undefined;
    const settlementChannelId = `MADDEN_SETTLEMENT_CHANNEL_${runId}`;
    if (!roomCode) throw new Error("Madden room creation did not return a room code");

    const detailByRoomCode = await request(`/api/gameday/rooms/${roomCode.toLowerCase()}`);
    expect(
      "room detail resolves a case-insensitive room code to the canonical UUID",
      detailByRoomCode.status === 200 &&
        detailByRoomCode.body.room?.id === roomId &&
        detailByRoomCode.body.room?.room_code === roomCode,
      JSON.stringify(detailByRoomCode.body.room),
    );
    const unknownCodeDetail = await request("/api/gameday/rooms/GDS-00000");
    expect(
      "room detail returns 404 for an unknown room code",
      unknownCodeDetail.status === 404,
      JSON.stringify(unknownCodeDetail.body),
    );

    const hostData = await request(`/api/gameday/rooms/${roomId}`);
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
      "three supplied matchups create three matchup props plus one bonus prop",
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
      ...botOperator,
    });
    expect(
      "Madden card can be opened by the authorized host",
      opened.status === 200 && opened.body.ok === true,
      JSON.stringify(opened.body),
    );
    const currentLockRoom = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(settlementChannelId)}&action=lock`,
      { ...botOperator },
    );
    expect(
      "current-room discovery returns the sole open room for lock",
      currentLockRoom.status === 200 &&
        currentLockRoom.body.ok === true &&
        currentLockRoom.body.room?.id === roomId &&
        currentLockRoom.body.room?.room_code === roomCode &&
        currentLockRoom.body.room?.discord_guild_id === botGuildId &&
        currentLockRoom.body.room?.discord_channel_id === settlementChannelId,
      JSON.stringify(currentLockRoom.body),
    );
    const currentResolveBeforeLock = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(settlementChannelId)}&action=resolve`,
      { ...botOperator },
    );
    expect(
      "current-room discovery excludes an open card from resolve",
      currentResolveBeforeLock.status === 404 &&
        currentResolveBeforeLock.body.error === "no_current_room",
      JSON.stringify(currentResolveBeforeLock.body),
    );
    const wrongGuildCurrentRoom = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(settlementChannelId)}&action=lock`,
      { apiKey: botApiKey, discordGuildHeader: `${botGuildId}_OTHER` },
    );
    expect(
      "current-room discovery never returns a room from another guild",
      wrongGuildCurrentRoom.status === 404 &&
        wrongGuildCurrentRoom.body.error === "no_current_room",
      JSON.stringify(wrongGuildCurrentRoom.body),
    );
    const wrongChannelCurrentRoom = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(`${settlementChannelId}_OTHER`)}&action=lock`,
      { ...botOperator },
    );
    expect(
      "current-room discovery never returns a room from another channel",
      wrongChannelCurrentRoom.status === 404 &&
        wrongChannelCurrentRoom.body.error === "no_current_room",
      JSON.stringify(wrongChannelCurrentRoom.body),
    );
    const unauthenticatedCurrentRoom = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(settlementChannelId)}&action=lock`,
    );
    expect(
      "current-room discovery requires bot credentials",
      unauthenticatedCurrentRoom.status === 401,
      JSON.stringify(unauthenticatedCurrentRoom.body),
    );
    const missingGuildCurrentRoom = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(settlementChannelId)}&action=lock`,
      { apiKey: botApiKey },
    );
    expect(
      "current-room discovery requires the Discord guild header",
      missingGuildCurrentRoom.status === 400,
      JSON.stringify(missingGuildCurrentRoom.body),
    );
    const invalidActionCurrentRoom = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(settlementChannelId)}&action=archive`,
      { ...botOperator },
    );
    expect(
      "current-room discovery rejects unsupported actions",
      invalidActionCurrentRoom.status === 400,
      JSON.stringify(invalidActionCurrentRoom.body),
    );
    const settlementByRoomCode = await request(
      `/api/gameday/bot/rooms/${roomCode}/settlement`,
      { ...botOperator },
    );
    expect(
      "bot settlement queue accepts a room code",
      settlementByRoomCode.status === 200 &&
        settlementByRoomCode.body.room_id === roomId &&
        settlementByRoomCode.body.room_code === roomCode,
      JSON.stringify(settlementByRoomCode.body),
    );
    const wrongGuildSettlementByRoomCode = await request(
      `/api/gameday/bot/rooms/${roomCode}/settlement`,
      { apiKey: botApiKey, discordGuildHeader: `${botGuildId}_OTHER` },
    );
    expect(
      "bot settlement rejects a room code from another guild",
      wrongGuildSettlementByRoomCode.status === 403,
      JSON.stringify(wrongGuildSettlementByRoomCode.body),
    );
    const unknownCodeSettlement = await request(
      "/api/gameday/bot/rooms/GDS-00000/settlement",
      { ...botOperator },
    );
    expect(
      "bot settlement returns 404 for an unknown room code",
      unknownCodeSettlement.status === 404,
      JSON.stringify(unknownCodeSettlement.body),
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

    const settlementQueue = await request(`/api/gameday/bot/rooms/${roomId}/settlement`, {
      ...botOperator,
    });
    expect(
      "authorized host receives ordered unresolved Madden settlement queue",
      settlementQueue.status === 200 &&
        settlementQueue.body.room_code &&
        settlementQueue.body.room_name &&
        settlementQueue.body.total_matchups === props.length &&
        settlementQueue.body.settled_matchups === 0 &&
        settlementQueue.body.remaining_matchups === props.length &&
        settlementQueue.body.matchups?.every((matchup: any, index: number) =>
          matchup.status === "open" &&
          matchup.display_order === props[index].display_order &&
          matchup.matchup_label === props[index].question),
      JSON.stringify(settlementQueue.body),
    );
    const unauthenticatedQueue = await request(
      `/api/gameday/bot/rooms/${roomId}/settlement`,
    );
    expect(
      "settlement queue rejects an unauthenticated caller",
      unauthenticatedQueue.status === 401,
      JSON.stringify(unauthenticatedQueue.body),
    );
    const crossGuildQueue = await request(
      `/api/gameday/bot/rooms/${roomId}/settlement`,
      {
        apiKey: botApiKey,
        discordGuildHeader: `${botGuildId}_OTHER`,
      },
    );
    expect(
      "settlement queue preserves Discord guild isolation",
      crossGuildQueue.status === 403,
      JSON.stringify(crossGuildQueue.body),
    );
    const earlyFinalize = await request(`/api/gameday/rooms/${roomId}/finalize`, {
      method: "PATCH",
      ...botOperator,
    });
    expect(
      "Madden finalization rejects unsettled matchups",
      earlyFinalize.status === 409 &&
        earlyFinalize.body.error === "Cannot finalize while matchups remain unsettled" &&
        earlyFinalize.body.remaining_matchups === props.length,
      JSON.stringify(earlyFinalize.body),
    );
    const earlyFinalizeByRoomCode = await request(
      `/api/gameday/rooms/${roomCode}/finalize`,
      { method: "PATCH", ...botOperator },
    );
    expect(
      "finalization by room code preserves the unresolved-props 409",
      earlyFinalizeByRoomCode.status === 409 &&
        earlyFinalizeByRoomCode.body.error === "Cannot finalize while matchups remain unsettled",
      JSON.stringify(earlyFinalizeByRoomCode.body),
    );
    const wrongGuildFinalizeByRoomCode = await request(
      `/api/gameday/rooms/${roomCode}/finalize`,
      {
        method: "PATCH",
        apiKey: botApiKey,
        discordGuildHeader: `${botGuildId}_OTHER`,
      },
    );
    expect(
      "finalization rejects a room code from another guild",
      wrongGuildFinalizeByRoomCode.status === 403,
      JSON.stringify(wrongGuildFinalizeByRoomCode.body),
    );
    const earlySettlement = await request(`/api/gameday/props/${props[0].id}/settle`, {
      method: "PATCH",
      ...botOperator,
      body: { correct_answer: props[0].answer_options[0] },
    });
    expect(
      "Madden settlement rejects an unlocked card",
      earlySettlement.status === 409,
      JSON.stringify(earlySettlement.body),
    );
    const unknownSettlement = await request(
      "/api/gameday/props/00000000-0000-0000-0000-000000000000/settle",
      {
        method: "PATCH",
        ...botOperator,
        body: { correct_answer: props[0].answer_options[0] },
      },
    );
    expect(
      "Madden settlement rejects an unknown prop",
      unknownSettlement.status === 404,
      JSON.stringify(unknownSettlement.body),
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

    const expiredAt = new Date(Date.now() - 1000).toISOString();
    const { error: deadlineUpdateError } = await service
      .from("gameday_pick_cards")
      .update({ scheduled_lock_at: expiredAt })
      .eq("id", card.id);
    if (deadlineUpdateError) {
      throw new Error(`Could not expire Madden deadline: ${deadlineUpdateError.message}`);
    }

    const joinedLateGuest = await request(`/api/gameday/rooms/${roomId}/join`, {
      method: "POST",
      body: { display_name: `Late Guest ${runId}` },
    });
    const lateGuestSession = joinedLateGuest.body.guest_session_id as string | undefined;
    if (!lateGuestSession) throw new Error("Late guest join did not return a guest session");

    const newPickAfterDeadline = await request(`/api/gameday/props/${props[0].id}/pick`, {
      method: "POST",
      guest: lateGuestSession,
      body: { selected_answer: props[0].answer_options[0] },
    });
    expect(
      "new picks are rejected at or after the Madden deadline",
      newPickAfterDeadline.status === 409 &&
        newPickAfterDeadline.body.error === "Picks are closed for this card.",
      JSON.stringify(newPickAfterDeadline.body),
    );

    const editAfterDeadline = await request(`/api/gameday/props/${props[0].id}/pick`, {
      method: "POST",
      token: player.token,
      body: { selected_answer: props[0].answer_options[0] },
    });
    expect(
      "existing picks cannot be edited after the Madden deadline",
      editAfterDeadline.status === 409 &&
        editAfterDeadline.body.error === "Picks are closed for this card.",
      JSON.stringify(editAfterDeadline.body),
    );

    const afterDeadline = await request(`/api/gameday/rooms/${roomId}`, {
      token: player.token,
    });
    const afterDeadlineCard = (afterDeadline.body.cards ?? []).find(
      (value: any) => value.id === card.id,
    );
    expect(
      "deadline closes editing without automatically locking the Madden card",
      afterDeadline.status === 200 &&
        afterDeadlineCard?.status === "open" &&
        afterDeadlineCard?.deadline_passed === true &&
        afterDeadlineCard?.can_edit_picks === false,
      JSON.stringify(afterDeadlineCard),
    );
    expect(
      "existing picks remain readable after the Madden deadline",
      afterDeadline.body.my_picks?.[props[0].id] === props[0].answer_options[1],
      JSON.stringify(afterDeadline.body.my_picks),
    );

    const recoveredRoom = await request(`/api/gameday/rooms/${roomCode}`);
    const recoveredCard = (recoveredRoom.body.cards ?? []).find(
      (value: any) => value.phase === "pregame",
    );
    expect(
      "room-code detail restores the room UUID and open card needed after bot restart",
      recoveredRoom.status === 200 &&
        recoveredRoom.body.room?.id === roomId &&
        recoveredCard?.id === card.id &&
        recoveredCard?.status === "open",
      JSON.stringify({ room: recoveredRoom.body.room, card: recoveredCard }),
    );

    const locked = await request(`/api/gameday/cards/${recoveredCard?.id}/lock`, {
      method: "PATCH",
      ...botOperator,
    });
    expect(
      "commissioner can manually lock the Madden card after the deadline",
      locked.status === 200 && locked.body.ok === true,
      JSON.stringify(locked.body),
    );
    const currentResolveRoom = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(settlementChannelId)}&action=resolve`,
      { ...botOperator },
    );
    expect(
      "current-room discovery returns the locked room for resolve",
      currentResolveRoom.status === 200 &&
        currentResolveRoom.body.room?.id === roomId &&
        currentResolveRoom.body.room?.room_code === roomCode,
      JSON.stringify(currentResolveRoom.body),
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
    const invalidSettlement = await request(`/api/gameday/props/${props[0].id}/settle`, {
      method: "PATCH",
      ...botOperator,
      body: { correct_answer: "Not a valid matchup option" },
    });
    expect(
      "Madden settlement rejects an invalid answer",
      invalidSettlement.status === 400,
      JSON.stringify(invalidSettlement.body),
    );

    const firstSettlement = await request(`/api/gameday/props/${props[0].id}/settle`, {
      method: "PATCH",
      ...botOperator,
      body: { correct_answer: props[0].answer_options[0] },
    });
    expect(
      "commissioner settles one matchup and receives partial progress",
      firstSettlement.status === 200 &&
        firstSettlement.body.ok === true &&
        firstSettlement.body.corrected === false &&
        firstSettlement.body.settled_matchups === 1 &&
        firstSettlement.body.remaining_matchups === props.length - 1 &&
        firstSettlement.body.all_settled === false &&
        firstSettlement.body.participants_updated === 2,
      JSON.stringify(firstSettlement.body),
    );
    const currentResolveAfterPartialSettlement = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(settlementChannelId)}&action=resolve`,
      { ...botOperator },
    );
    expect(
      "current-room discovery keeps a partially settled card available for resolve",
      currentResolveAfterPartialSettlement.status === 200 &&
        currentResolveAfterPartialSettlement.body.room?.id === roomId,
      JSON.stringify(currentResolveAfterPartialSettlement.body),
    );
    const afterFirstSettlement = await service
      .from("gameday_picks")
      .select("participant_id, prop_id, is_correct")
      .in("participant_id", [
        joinedGuest.body.participant.id,
        joinedAuth.body.participant.id,
      ])
      .in("prop_id", props.map((prop: any) => prop.id));
    const guestFirst = afterFirstSettlement.data?.find(
      (pick: any) =>
        pick.participant_id === joinedGuest.body.participant.id &&
        pick.prop_id === props[0].id,
    );
    const authFirst = afterFirstSettlement.data?.find(
      (pick: any) =>
        pick.participant_id === joinedAuth.body.participant.id &&
        pick.prop_id === props[0].id,
    );
    expect(
      "only the settled matchup receives correctness while all others remain pending",
      !afterFirstSettlement.error &&
        guestFirst?.is_correct === true &&
        authFirst?.is_correct === false &&
        afterFirstSettlement.data?.every(
          (pick: any) => pick.prop_id === props[0].id || pick.is_correct === null,
        ),
      JSON.stringify(afterFirstSettlement.data),
    );
    const queueAfterFirst = await request(
      `/api/gameday/bot/rooms/${roomId}/settlement`,
      { ...botOperator },
    );
    expect(
      "settlement queue exposes one settled matchup and leaves the rest open",
      queueAfterFirst.status === 200 &&
        queueAfterFirst.body.settled_matchups === 1 &&
        queueAfterFirst.body.remaining_matchups === props.length - 1 &&
        queueAfterFirst.body.matchups?.[0]?.status === "settled" &&
        queueAfterFirst.body.matchups?.slice(1).every((matchup: any) => matchup.status === "open"),
      JSON.stringify(queueAfterFirst.body),
    );
    const correction = await request(`/api/gameday/props/${props[0].id}/settle`, {
      method: "PATCH",
      ...botOperator,
      body: { correct_answer: props[0].answer_options[1] },
    });
    const afterCorrection = await service
      .from("gameday_picks")
      .select("participant_id, is_correct")
      .eq("prop_id", props[0].id);
    const correctionEvents = await service
      .from("gameday_events")
      .select("event_type, metadata")
      .eq("room_id", roomId)
      .in("event_type", ["prop_settled", "prop_settlement_corrected"])
      .order("created_at", { ascending: true });
    expect(
      "authorized correction recalculates participant correctness and is audited",
      correction.status === 200 &&
        correction.body.corrected === true &&
        correction.body.participants_updated === 2 &&
        afterCorrection.data?.find(
          (pick: any) => pick.participant_id === joinedGuest.body.participant.id,
        )?.is_correct === false &&
        afterCorrection.data?.find(
          (pick: any) => pick.participant_id === joinedAuth.body.participant.id,
        )?.is_correct === true &&
        correctionEvents.data?.map((event: any) => event.event_type).join(",") ===
          "prop_settled,prop_settlement_corrected",
      JSON.stringify({
        correction: correction.body,
        picks: afterCorrection.data,
        events: correctionEvents.data,
      }),
    );

    for (const prop of props.slice(1)) {
      const correctAnswer =
        prop.answer_options[0];
      const settled = await request(`/api/gameday/props/${prop.id}/settle`, {
        method: "PATCH",
        ...botOperator,
        body: { correct_answer: correctAnswer },
      });
      expect(
        `manual settlement works for ${prop.question}`,
        settled.status === 200 &&
          settled.body.ok === true &&
          settled.body.prop_id === prop.id &&
          settled.body.corrected === false &&
          settled.body.settled_matchups === props.indexOf(prop) + 1 &&
          settled.body.remaining_matchups === props.length - props.indexOf(prop) - 1,
        JSON.stringify(settled.body),
      );
    }

    const retry = await request(`/api/gameday/props/${props[0].id}/settle`, {
      method: "PATCH",
      ...botOperator,
      body: { correct_answer: props[0].answer_options[1] },
    });
    expect(
      "same-answer settlement retry is idempotent",
      retry.status === 200 &&
        retry.body.corrected === false &&
        retry.body.participants_updated === 0 &&
        retry.body.all_settled === true,
      JSON.stringify(retry.body),
    );
    const currentResolveAfterAllSettled = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(settlementChannelId)}&action=resolve`,
      { ...botOperator },
    );
    const currentFinalRoom = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(settlementChannelId)}&action=final`,
      { ...botOperator },
    );
    expect(
      "current-room discovery moves a fully settled room from resolve to final",
      currentResolveAfterAllSettled.status === 404 &&
        currentFinalRoom.status === 200 &&
        currentFinalRoom.body.room?.id === roomId,
      JSON.stringify({
        resolve: currentResolveAfterAllSettled.body,
        final: currentFinalRoom.body,
      }),
    );

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
      "leaderboard scores only corrected main picks for the guest",
      leaderboard.status === 200 &&
        guestStanding?.correct_picks === 2 &&
        guestStanding?.total_picks === 3 &&
        guestStanding?.bonus_game_correct === true &&
        guestStanding?.game_day_sp === 20,
      JSON.stringify(leaderboard.body),
    );
    expect(
      "leaderboard keeps authenticated bonus correctness separate from main score",
      authStanding?.correct_picks === 3 &&
        authStanding?.total_picks === 3 &&
        authStanding?.bonus_game_correct === true &&
        authStanding?.game_day_sp === 30,
      JSON.stringify(leaderboard.body),
    );
    const leaderboardByRoomCode = await request(
      `/api/gameday/rooms/${roomCode}/leaderboard`,
    );
    expect(
      "existing public leaderboard room-code support remains available",
      leaderboardByRoomCode.status === 200 &&
        (leaderboardByRoomCode.body.leaderboard ?? []).length === leaderboardRows.length,
      JSON.stringify(leaderboardByRoomCode.body),
    );

    const finalized = await request(`/api/gameday/rooms/${roomCode}/finalize`, {
      method: "PATCH",
      ...botOperator,
    });
    expect(
      "Madden room finalization works by room code",
      finalized.status === 200 && finalized.body.ok === true,
      JSON.stringify(finalized.body),
    );
    const repeatedFinalize = await request(`/api/gameday/rooms/${roomId}/finalize`, {
      method: "PATCH",
      ...botOperator,
    });
    expect(
      "repeated UUID finalization remains idempotent after code-based finalize",
      repeatedFinalize.status === 200 && repeatedFinalize.body.ok === true &&
        repeatedFinalize.body.already === true,
      JSON.stringify(repeatedFinalize.body),
    );
    const currentFinalizedRoom = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(settlementChannelId)}&action=final`,
      { ...botOperator },
    );
    const currentFinalizedLockRoom = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(settlementChannelId)}&action=lock`,
      { ...botOperator },
    );
    const currentFinalizedResolveRoom = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(settlementChannelId)}&action=resolve`,
      { ...botOperator },
    );
    expect(
      "current-room discovery excludes a finalized room from every action",
      currentFinalizedRoom.status === 404 &&
        currentFinalizedLockRoom.status === 404 &&
        currentFinalizedResolveRoom.status === 404 &&
        [currentFinalizedRoom, currentFinalizedLockRoom, currentFinalizedResolveRoom]
          .every((response) => response.body.error === "no_current_room"),
      JSON.stringify({
        final: currentFinalizedRoom.body,
        lock: currentFinalizedLockRoom.body,
        resolve: currentFinalizedResolveRoom.body,
      }),
    );
    const finalStandings = await request(
      `/api/gameday/rooms/${roomCode}/final-standings`,
    );
    expect(
      "existing final-standings room-code support remains available after Madden finalization",
      finalStandings.status === 200 &&
        finalStandings.body.finalized === true &&
        finalStandings.body.room_id === roomId &&
        finalStandings.body.room_code === roomCode,
      JSON.stringify(finalStandings.body),
    );
    const postFinalizeSettlement = await request(
      `/api/gameday/props/${props[0].id}/settle`,
      {
        method: "PATCH",
        ...botOperator,
        body: { correct_answer: props[0].answer_options[1] },
      },
    );
    expect(
      "finalized Madden room rejects further settlement",
      postFinalizeSettlement.status === 400,
      JSON.stringify(postFinalizeSettlement.body),
    );

    const ambiguousRooms: string[] = [];
    for (const suffix of ["A", "B"]) {
      const ambiguous = await request("/api/gameday/rooms", {
        method: "POST",
        ...botOperator,
        body: {
          ...basePayload,
          room_name: `Ambiguous recovery room ${suffix} ${runId}`,
          discord_guild_id: botGuildId,
          discord_channel_id: settlementChannelId,
          discord_user_id: `MADDEN_AMBIGUOUS_${suffix}_${runId}`,
        },
      });
      const ambiguousRoomId = ambiguous.body.room_id as string | undefined;
      if (ambiguousRoomId) {
        roomIds.push(ambiguousRoomId);
        ambiguousRooms.push(ambiguousRoomId);
      }
      expect(
        `same-channel ambiguity fixture ${suffix} is created`,
        ambiguous.status === 200 && !!ambiguousRoomId,
        JSON.stringify(ambiguous.body),
      );
    }
    const ambiguousCurrentLock = await request(
      `/api/gameday/bot/rooms/current?discord_channel_id=${encodeURIComponent(settlementChannelId)}&action=lock`,
      { ...botOperator },
    );
    const ambiguousIds = (ambiguousCurrentLock.body.rooms ?? []).map(
      (room: any) => room.room_id,
    );
    expect(
      "current-room discovery returns 409 rather than choosing between active rooms",
      ambiguousCurrentLock.status === 409 &&
        ambiguousCurrentLock.body.error === "multiple_active_rooms" &&
        ambiguousIds.length === 2 &&
        ambiguousRooms.every((id) => ambiguousIds.includes(id)),
      JSON.stringify(ambiguousCurrentLock.body),
    );
    const explicitCodeDuringAmbiguity = await request(
      `/api/gameday/rooms/${ambiguousCurrentLock.body.rooms?.[0]?.room_code}`,
    );
    expect(
      "explicit room-code detail remains available when current-room discovery is ambiguous",
      explicitCodeDuringAmbiguity.status === 200 &&
        ambiguousIds.includes(explicitCodeDuringAmbiguity.body.room?.id),
      JSON.stringify(explicitCodeDuringAmbiguity.body.room),
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