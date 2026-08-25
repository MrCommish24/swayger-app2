/**
 * Disposable integration coverage for unlisted Discord Game Day rooms.
 * It exercises the real Game Day routes and short-link redirect on an
 * ephemeral local server, then removes all created users and rooms.
 *
 * Run: npx tsx server/test-gameday-discord-visibility.ts
 */

import * as dotenv from "dotenv";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { registerGamedayRoutes } from "./routes-gameday";
import { registerGamedayShortLink } from "./gameday-short-link";

dotenv.config();

let passed = 0;
let failed = 0;
const EXPECTED_ASSERTIONS = 16;

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
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const botKey = process.env.GAMEDAY_BOT_API_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey || !botKey) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_SUPABASE_ANON_KEY, and GAMEDAY_BOT_API_KEY are required",
    );
  }

  const runId = unique("gameday-visibility");
  const hostEmail = `${runId}-host@example.test`;
  const playerEmail = `${runId}-player@example.test`;
  const password = `Test-${runId}-A1!`;
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  process.env.GAMEDAY_HOST_EMAILS = hostEmail;
  process.env.GAMEDAY_ADMIN_EMAILS = hostEmail;

  const app = express();
  app.use(express.json());
  registerGamedayShortLink(app);
  registerGamedayRoutes(app);

  let server: Server | null = null;
  const userIds: string[] = [];
  const roomIds: string[] = [];

  try {
    server = await new Promise<Server>((resolve) => {
      const created = app.listen(0, "127.0.0.1", () => resolve(created));
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    async function request(
      path: string,
      options: {
        method?: string;
        token?: string;
        bot?: boolean;
        guildId?: string;
        guest?: string;
        body?: Record<string, unknown>;
      } = {},
    ): Promise<ApiResponse> {
      const headers: Record<string, string> = {};
      if (options.token) headers.Authorization = `Bearer ${options.token}`;
      if (options.bot) headers["x-api-key"] = botKey!;
      if (options.guildId) headers["X-Discord-Guild-ID"] = options.guildId;
      if (options.guest) headers["X-Guest-Session"] = options.guest;
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
      const created = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        throw new Error(`Could not create test user: ${created.error?.message ?? "unknown error"}`);
      }
      userIds.push(created.data.user.id);
      const signedIn = await auth.auth.signInWithPassword({ email, password });
      if (signedIn.error || !signedIn.data.session) {
        throw new Error(`Could not sign in test user: ${signedIn.error?.message ?? "unknown error"}`);
      }
      return {
        id: created.data.user.id,
        accessToken: signedIn.data.session.access_token,
      };
    }

    const host = await createAuthenticatedUser(hostEmail);
    const player = await createAuthenticatedUser(playerEmail);

    const sharedPayload = {
      team_a_name: "Alpha",
      team_b_name: "Beta",
      team_a_star: "A Star",
      team_b_star: "B Star",
      game_date: "2026-08-25",
    };

    const webRoom = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.accessToken,
      body: { ...sharedPayload, room_name: `Web default ${runId}` },
    });
    expect(
      "normal app-created room keeps its existing private default",
      webRoom.status === 200 &&
        webRoom.body.room?.source === "app" &&
        webRoom.body.room?.host_user_id === host.id &&
        webRoom.body.room?.is_private === true &&
        !webRoom.body.room?.discord_guild_id,
      JSON.stringify(webRoom.body),
    );
    if (webRoom.body.room_id) roomIds.push(webRoom.body.room_id);

    const discordRoom = await request("/api/gameday/rooms", {
      method: "POST",
      bot: true,
      body: {
        ...sharedPayload,
        room_name: `Discord unlisted ${runId}`,
        source: "discord",
        discord_guild_id: "VISIBILITY_GUILD",
        discord_channel_id: "VISIBILITY_CHANNEL",
        discord_user_id: "VISIBILITY_USER",
        is_private: false,
      },
    });
    expect(
      "Discord bot creation succeeds and forces an unlisted room",
      discordRoom.status === 200 &&
        !!discordRoom.body.room_id &&
        discordRoom.body.room?.source === "discord" &&
        discordRoom.body.room?.is_private === true,
      JSON.stringify(discordRoom.body),
    );
    const discordRoomId = discordRoom.body.room_id as string | undefined;
    const roomCode = discordRoom.body.room?.room_code as string | undefined;
    if (!discordRoomId || !roomCode) {
      throw new Error("Discord visibility fixture did not return room_id and room_code");
    }
    roomIds.push(discordRoomId);

    const publicRooms = await request("/api/gameday/public-rooms");
    expect(
      "unlisted Discord room is absent from public discovery",
      publicRooms.status === 200 &&
        !(publicRooms.body.rooms ?? []).some((room: any) => room.id === discordRoomId),
      JSON.stringify(publicRooms.body),
    );

    const shortLink = await fetch(`${baseUrl}/g/${roomCode.toLowerCase()}`, {
      redirect: "manual",
    });
    expect(
      "unlisted Discord room remains accessible through /g/:roomCode",
      shortLink.status === 302 &&
        shortLink.headers.get("location") === `/gameday/${discordRoomId}`,
      `${shortLink.status} ${shortLink.headers.get("location") ?? ""}`,
    );

    const byCode = await request(`/api/gameday/rooms/by-code/${roomCode}`);
    expect(
      "room-code API lookup resolves the unlisted Discord room",
      byCode.status === 200 && byCode.body.room_id === discordRoomId,
      JSON.stringify(byCode.body),
    );

    const directRoom = await request(`/api/gameday/rooms/${discordRoomId}`);
    expect(
      "direct room access remains available for the unlisted room",
      directRoom.status === 200 &&
        directRoom.body.room?.id === discordRoomId &&
        directRoom.body.room?.is_private === true,
      JSON.stringify(directRoom.body),
    );

    const guestJoin = await request(`/api/gameday/rooms/${discordRoomId}/join`, {
      method: "POST",
      body: { display_name: `Guest ${runId}` },
    });
    expect(
      "guest can join the unlisted Discord room",
      guestJoin.status === 200 &&
        guestJoin.body.participant?.is_guest === true &&
        !!guestJoin.body.guest_session_id,
      JSON.stringify(guestJoin.body),
    );
    const guestSession = guestJoin.body.guest_session_id as string | undefined;
    if (!guestSession) throw new Error("Guest visibility fixture did not return a session");

    const authenticatedJoin = await request(`/api/gameday/rooms/${discordRoomId}/join`, {
      method: "POST",
      token: player.accessToken,
      body: {},
    });
    expect(
      "authenticated user can join the unlisted Discord room",
      authenticatedJoin.status === 200 &&
        authenticatedJoin.body.participant?.is_guest === false,
      JSON.stringify(authenticatedJoin.body),
    );

    const { data: card, error: cardError } = await service
      .from("gameday_pick_cards")
      .select("id")
      .eq("room_id", discordRoomId)
      .eq("phase", "pregame")
      .single();
    if (cardError || !card) {
      throw new Error(`Visibility fixture card lookup failed: ${cardError?.message ?? "missing card"}`);
    }
    const { data: prop, error: propError } = await service
      .from("gameday_props")
      .select("id, answer_options")
      .eq("card_id", card.id)
      .order("display_order")
      .limit(1)
      .single();
    if (propError || !prop || !Array.isArray(prop.answer_options) || !prop.answer_options[0]) {
      throw new Error(`Visibility fixture prop lookup failed: ${propError?.message ?? "missing prop"}`);
    }
    const answer = prop.answer_options[0] as string;

    const open = await request(`/api/gameday/cards/${card.id}/open`, {
      method: "PATCH",
      bot: true,
      guildId: "VISIBILITY_GUILD",
    });
    expect(
      "Discord bot can open the unlisted room card",
      open.status === 200 && open.body.ok === true,
      JSON.stringify(open.body),
    );

    const guestPick = await request(`/api/gameday/props/${prop.id}/pick`, {
      method: "POST",
      guest: guestSession,
      body: { selected_answer: answer },
    });
    const authenticatedPick = await request(`/api/gameday/props/${prop.id}/pick`, {
      method: "POST",
      token: player.accessToken,
      body: { selected_answer: answer },
    });
    expect(
      "guest and authenticated users can persist picks",
      guestPick.status === 200 &&
        guestPick.body.ok === true &&
        authenticatedPick.status === 200 &&
        authenticatedPick.body.ok === true,
      JSON.stringify({ guest: guestPick.body, authenticated: authenticatedPick.body }),
    );

    const returningGuest = await request(`/api/gameday/rooms/${discordRoomId}`, {
      guest: guestSession,
    });
    const returningPlayer = await request(`/api/gameday/rooms/${discordRoomId}`, {
      token: player.accessToken,
    });
    expect(
      "guest and authenticated users can reload their saved picks",
      returningGuest.status === 200 &&
        returningGuest.body.my_picks?.[prop.id] === answer &&
        returningPlayer.status === 200 &&
        returningPlayer.body.my_picks?.[prop.id] === answer,
      JSON.stringify({
        guest: returningGuest.body.my_picks,
        authenticated: returningPlayer.body.my_picks,
      }),
    );

    const leaderboard = await request(`/api/gameday/rooms/${discordRoomId}/leaderboard`);
    expect(
      "public leaderboard remains available for the unlisted room",
      leaderboard.status === 200 && (leaderboard.body.leaderboard ?? []).length === 2,
      JSON.stringify(leaderboard.body),
    );

    const lock = await request(`/api/gameday/cards/${card.id}/lock`, {
      method: "PATCH",
      bot: true,
      guildId: "VISIBILITY_GUILD",
    });
    const settle = await request(`/api/gameday/props/${prop.id}/settle`, {
      method: "PATCH",
      bot: true,
      guildId: "VISIBILITY_GUILD",
      body: { correct_answer: answer },
    });
    expect(
      "Discord bot can lock and settle the unlisted room",
      lock.status === 200 &&
        lock.body.ok === true &&
        settle.status === 200 &&
        settle.body.ok === true,
      JSON.stringify({ lock: lock.body, settle: settle.body }),
    );

    const finalize = await request(`/api/gameday/rooms/${discordRoomId}/finalize`, {
      method: "PATCH",
      bot: true,
      guildId: "VISIBILITY_GUILD",
    });
    expect(
      "Discord bot can finalize the unlisted room",
      finalize.status === 200 && finalize.body.ok === true,
      JSON.stringify(finalize.body),
    );

    const finalStandings = await request(
      `/api/gameday/rooms/${discordRoomId}/final-standings`,
    );
    expect(
      "final standings remain publicly accessible after finalization",
      finalStandings.status === 200 &&
        finalStandings.body.finalized === true &&
        finalStandings.body.total_participants === 2,
      JSON.stringify(finalStandings.body),
    );

    const publicRoomsAfterFinalize = await request("/api/gameday/public-rooms");
    const directAfterFinalize = await request(`/api/gameday/rooms/${discordRoomId}`);
    expect(
      "finalization does not publish the Discord room or block direct access",
      publicRoomsAfterFinalize.status === 200 &&
        !(publicRoomsAfterFinalize.body.rooms ?? []).some(
          (room: any) => room.id === discordRoomId,
        ) &&
        directAfterFinalize.status === 200 &&
        directAfterFinalize.body.room?.status === "finalized",
      JSON.stringify({
        publicRooms: publicRoomsAfterFinalize.body,
        directRoom: directAfterFinalize.body.room,
      }),
    );
  } finally {
    if (roomIds.length > 0) {
      await service.from("gameday_rooms").delete().in("id", roomIds);
    }
    for (const userId of userIds) {
      await service.auth.admin.deleteUser(userId);
    }
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  }

  if (failed === 0 && passed === EXPECTED_ASSERTIONS) {
    console.log(`\n${EXPECTED_ASSERTIONS}/${EXPECTED_ASSERTIONS} visibility assertions passed`);
  } else {
    console.error(
      `\nGame Day visibility gate failed: ${passed}/${passed + failed} assertions passed; expected ${EXPECTED_ASSERTIONS}/${EXPECTED_ASSERTIONS}`,
    );
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(
      "\nGame Day visibility suite failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });