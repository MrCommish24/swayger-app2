/**
 * Disposable integration coverage for Game Day host-token verification and
 * Discord guild isolation. It starts the route module on an ephemeral local
 * port, uses Supabase Auth to issue real user tokens, and removes its users
 * and rooms when finished.
 *
 * Run: npx tsx server/test-gameday-discord-isolation.ts
 */

import * as dotenv from "dotenv";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config();

let passed = 0;
let failed = 0;

function expect(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type ApiResponse = { status: number; body: any };

async function main() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const botKey = process.env.GAMEDAY_BOT_API_KEY;
  if (!supabaseUrl || !serviceKey || !botKey) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GAMEDAY_BOT_API_KEY are required",
    );
  }

  const runId = unique("gameday-security");
  const hostEmail = `${runId}-host@example.test`;
  const nonHostEmail = `${runId}-nonhost@example.test`;
  const password = `Test-${runId}-A1!`;
  const supabase = createClient(supabaseUrl, serviceKey);

  // The route reads the allowlist at request time, letting this suite prove
  // acceptance of a genuine Supabase session without touching production config.
  process.env.GAMEDAY_HOST_EMAILS = hostEmail;
  process.env.GAMEDAY_ADMIN_EMAILS = hostEmail;

  const { registerGamedayRoutes } = await import("./routes-gameday");
  const app = express();
  app.use(express.json());
  registerGamedayRoutes(app);

  let server: Server | null = null;
  let hostUserId: string | null = null;
  let nonHostUserId: string | null = null;
  const roomIds: string[] = [];

  try {
    server = await new Promise<Server>((resolve) => {
      const created = app.listen(0, "127.0.0.1", () => resolve(created));
    });
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    async function request(
      path: string,
      options: {
        method?: string;
        token?: string;
        bot?: boolean;
        guildId?: string;
        body?: Record<string, unknown>;
      } = {},
    ): Promise<ApiResponse> {
      const headers: Record<string, string> = {};
      if (options.token) headers.Authorization = `Bearer ${options.token}`;
      if (options.bot) headers["x-api-key"] = botKey!;
      if (options.guildId) headers["X-Discord-Guild-ID"] = options.guildId;
      if (options.body) headers["Content-Type"] = "application/json";
      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      return {
        status: response.status,
        body: await response.json().catch(() => ({})),
      };
    }

    async function createAuthenticatedUser(email: string) {
      const created = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        throw new Error(`Could not create test user: ${created.error?.message ?? "unknown error"}`);
      }
      const signedIn = await supabase.auth.signInWithPassword({ email, password });
      if (signedIn.error || !signedIn.data.session) {
        throw new Error(`Could not sign in test user: ${signedIn.error?.message ?? "unknown error"}`);
      }
      return {
        id: created.data.user.id,
        accessToken: signedIn.data.session.access_token,
      };
    }

    const host = await createAuthenticatedUser(hostEmail);
    const nonHost = await createAuthenticatedUser(nonHostEmail);
    hostUserId = host.id;
    nonHostUserId = nonHost.id;

    const fabricatedJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdHRhY2tlciIsImVtYWlsIjoiaG9zdEBleGFtcGxlLnRlc3QifQ.bad-signature";
    const fabricatedHost = await request("/api/gameday/is-host", { token: fabricatedJwt });
    expect("fabricated JWT is not accepted as a host", fabricatedHost.status === 200 && fabricatedHost.body.isHost === false);

    const malformedRooms = await request("/api/gameday/rooms", { token: "not-a-jwt" });
    expect("malformed token cannot list host rooms", malformedRooms.status === 401, String(malformedRooms.status));

    const nonHostCheck = await request("/api/gameday/is-host", { token: nonHost.accessToken });
    expect("verified non-host token is denied host status", nonHostCheck.body.isHost === false);

    const roomPayload = {
      room_name: `Security test ${runId}`,
      team_a_name: "Alpha",
      team_b_name: "Beta",
      team_a_star: "A Star",
      team_b_star: "B Star",
      game_date: "2026-08-25",
    };
    const nonHostCreate = await request("/api/gameday/rooms", {
      method: "POST",
      token: nonHost.accessToken,
      body: roomPayload,
    });
    expect("verified non-host cannot create a room", nonHostCreate.status === 403, String(nonHostCreate.status));

    const hostCheck = await request("/api/gameday/is-host", { token: host.accessToken });
    expect("verified allowlisted host is accepted", hostCheck.body.isHost === true);

    const appRoom = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.accessToken,
      body: { ...roomPayload, room_name: `Web room ${runId}` },
    });
    expect("verified host can create a web room", appRoom.status === 200 && !!appRoom.body.room_id, String(appRoom.status));
    if (appRoom.body.room_id) roomIds.push(appRoom.body.room_id);

    const noGuildBotCreate = await request("/api/gameday/rooms", {
      method: "POST",
      bot: true,
      body: { ...roomPayload, source: "discord" },
    });
    expect("bot cannot create a room without discord_guild_id", noGuildBotCreate.status === 400, String(noGuildBotCreate.status));

    const discordRoom = await request("/api/gameday/rooms", {
      method: "POST",
      bot: true,
      body: {
        ...roomPayload,
        room_name: `Discord room ${runId}`,
        source: "discord",
        discord_guild_id: "GUILD_A",
        discord_channel_id: "CHANNEL_A",
        discord_user_id: "USER_A",
      },
    });
    expect("bot can create a guild-bound Discord room", discordRoom.status === 200 && !!discordRoom.body.room_id, String(discordRoom.status));
    const discordRoomId = discordRoom.body.room_id as string | undefined;
    if (!discordRoomId) throw new Error("Could not continue without the Discord fixture room");
    roomIds.push(discordRoomId);

    const publicRoom = await request(`/api/gameday/rooms/${discordRoomId}`);
    expect(
      "public room payload omits host and Discord ownership metadata",
      publicRoom.status === 200 &&
        !("host_user_id" in publicRoom.body.room) &&
        !("discord_guild_id" in publicRoom.body.room) &&
        !("discord_channel_id" in publicRoom.body.room) &&
        !("discord_user_id" in publicRoom.body.room),
    );

    const { data: appCard } = await supabase
      .from("gameday_pick_cards")
      .select("id")
      .eq("room_id", appRoom.body.room_id)
      .eq("phase", "halftime")
      .single();
    if (!appCard?.id) throw new Error("Web fixture did not create a halftime card");
    const botOnWebRoom = await request(`/api/gameday/cards/${appCard.id}/open`, {
      method: "PATCH",
      bot: true,
      guildId: "GUILD_A",
    });
    expect("bot cannot operate an ordinary web-hosted room", botOnWebRoom.status === 403, String(botOnWebRoom.status));

    const { data: cards } = await supabase
      .from("gameday_pick_cards")
      .select("id, phase")
      .eq("room_id", discordRoomId)
      .eq("phase", "halftime")
      .single();
    if (!cards?.id) throw new Error("Discord fixture did not create a halftime card");
    const halftimeCardId = cards.id;
    const { data: props } = await supabase
      .from("gameday_props")
      .select("id, answer_options")
      .eq("card_id", halftimeCardId)
      .order("display_order")
      .limit(1)
      .single();
    if (!props?.id || !Array.isArray(props.answer_options) || !props.answer_options[0]) {
      throw new Error("Discord fixture did not create a settleable prop");
    }

    const missingGuild = await request(`/api/gameday/cards/${halftimeCardId}/open`, {
      method: "PATCH",
      bot: true,
    });
    expect("bot lifecycle request requires a guild header", missingGuild.status === 400, String(missingGuild.status));

    const crossGuildOpen = await request(`/api/gameday/cards/${halftimeCardId}/open`, {
      method: "PATCH",
      bot: true,
      guildId: "GUILD_B",
    });
    expect("GUILD_B cannot open GUILD_A's card", crossGuildOpen.status === 403, String(crossGuildOpen.status));

    const webHostOpenDiscord = await request(`/api/gameday/cards/${halftimeCardId}/open`, {
      method: "PATCH",
      token: host.accessToken,
    });
    expect("web host cannot operate a Discord-owned card", webHostOpenDiscord.status === 403, String(webHostOpenDiscord.status));

    const sameGuildOpen = await request(`/api/gameday/cards/${halftimeCardId}/open`, {
      method: "PATCH",
      bot: true,
      guildId: "GUILD_A",
    });
    expect("GUILD_A can open its own card", sameGuildOpen.status === 200, String(sameGuildOpen.status));

    const crossGuildSettle = await request(`/api/gameday/props/${props.id}/settle`, {
      method: "PATCH",
      bot: true,
      guildId: "GUILD_B",
      body: { correct_answer: props.answer_options[0] as string },
    });
    expect("GUILD_B cannot settle GUILD_A's prop", crossGuildSettle.status === 403, String(crossGuildSettle.status));

    const sameGuildLock = await request(`/api/gameday/cards/${halftimeCardId}/lock`, {
      method: "PATCH",
      bot: true,
      guildId: "GUILD_A",
    });
    expect("GUILD_A can lock its own card", sameGuildLock.status === 200, String(sameGuildLock.status));

    const sameGuildSettle = await request(`/api/gameday/props/${props.id}/settle`, {
      method: "PATCH",
      bot: true,
      guildId: "GUILD_A",
      body: { correct_answer: props.answer_options[0] as string },
    });
    expect("GUILD_A can settle its own prop", sameGuildSettle.status === 200, String(sameGuildSettle.status));

    const crossGuildLeaderboard = await request(`/api/gameday/rooms/${discordRoomId}/leaderboard`, {
      bot: true,
      guildId: "GUILD_B",
    });
    expect("GUILD_B cannot read GUILD_A leaderboard as a bot", crossGuildLeaderboard.status === 403, String(crossGuildLeaderboard.status));

    const publicLeaderboard = await request(`/api/gameday/rooms/${discordRoomId}/leaderboard`);
    expect("public participant leaderboard remains available", publicLeaderboard.status === 200);

    const crossGuildFinalize = await request(`/api/gameday/rooms/${discordRoomId}/finalize`, {
      method: "PATCH",
      bot: true,
      guildId: "GUILD_B",
    });
    expect("GUILD_B cannot finalize GUILD_A's room", crossGuildFinalize.status === 403, String(crossGuildFinalize.status));

    const sameGuildFinalize = await request(`/api/gameday/rooms/${discordRoomId}/finalize`, {
      method: "PATCH",
      bot: true,
      guildId: "GUILD_A",
    });
    expect("GUILD_A can finalize its own room", sameGuildFinalize.status === 200, String(sameGuildFinalize.status));

    const crossGuildStandings = await request(`/api/gameday/rooms/${discordRoomId}/final-standings`, {
      bot: true,
      guildId: "GUILD_B",
    });
    expect("GUILD_B cannot read GUILD_A final standings as a bot", crossGuildStandings.status === 403, String(crossGuildStandings.status));

    const sameGuildStandings = await request(`/api/gameday/rooms/${discordRoomId}/final-standings`, {
      bot: true,
      guildId: "GUILD_A",
    });
    expect("GUILD_A can read its own final standings", sameGuildStandings.status === 200);
  } finally {
    if (roomIds.length > 0) {
      await supabase.from("gameday_rooms").delete().in("id", roomIds);
    }
    if (hostUserId) await supabase.auth.admin.deleteUser(hostUserId);
    if (nonHostUserId) await supabase.auth.admin.deleteUser(nonHostUserId);
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  }

  console.log(`\n${passed}/${passed + failed} assertions passed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error("\nSecurity suite failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });