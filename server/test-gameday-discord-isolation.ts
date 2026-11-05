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
const EXPECTED_ASSERTIONS = 44;

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

  const runId = unique("gameday-security");
  const hostEmail = `${runId}-host@example.test`;
  const nonHostEmail = `${runId}-nonhost@example.test`;
  const password = `Test-${runId}-A1!`;
  // Keep the service-role client isolated from user authentication. Calling
  // signInWithPassword on a service-key client installs a user session on that
  // client, so later table queries silently use the authenticated role instead
  // of service_role. That worked before the RLS lockdown and failed afterward.
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
      const created = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        throw new Error(`Could not create test user: ${created.error?.message ?? "unknown error"}`);
      }
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

    const archiveRoom = await request("/api/gameday/rooms", {
      method: "POST",
      bot: true,
      body: {
        ...roomPayload,
        room_name: `Discord archive room ${runId}`,
        source: "discord",
        discord_guild_id: "GUILD_A",
        discord_channel_id: "ARCHIVE_CHANNEL_A",
        discord_user_id: "ARCHIVE_USER_A",
      },
    });
    expect(
      "bot can create a disposable Discord archive fixture",
      archiveRoom.status === 200 && !!archiveRoom.body.room_id,
      String(archiveRoom.status),
    );
    const archiveRoomId = archiveRoom.body.room_id as string | undefined;
    if (!archiveRoomId) throw new Error("Could not continue without the Discord archive fixture room");
    roomIds.push(archiveRoomId);

    const missingArchiveBotKey = await request(`/api/gameday/rooms/${archiveRoomId}/archive`, {
      method: "PATCH",
    });
    expect(
      "missing bot credentials cannot archive a Discord room",
      missingArchiveBotKey.status === 401,
      String(missingArchiveBotKey.status),
    );

    const missingArchiveGuild = await request(`/api/gameday/rooms/${archiveRoomId}/archive`, {
      method: "PATCH",
      bot: true,
    });
    expect(
      "bot archive requires a Discord guild header",
      missingArchiveGuild.status === 400,
      String(missingArchiveGuild.status),
    );

    const wrongArchiveGuild = await request(`/api/gameday/rooms/${archiveRoomId}/archive`, {
      method: "PATCH",
      bot: true,
      guildId: "GUILD_B",
    });
    expect(
      "wrong guild cannot archive a Discord room",
      wrongArchiveGuild.status === 403,
      String(wrongArchiveGuild.status),
    );

    const botArchiveWebRoom = await request(`/api/gameday/rooms/${appRoom.body.room_id}/archive`, {
      method: "PATCH",
      bot: true,
      guildId: "GUILD_A",
    });
    expect(
      "bot cannot archive an app-owned human room",
      botArchiveWebRoom.status === 403,
      String(botArchiveWebRoom.status),
    );

    const noStoredGuild = await service
      .from("gameday_rooms")
      .insert({
        ...roomPayload,
        room_name: `Discord no-guild archive room ${runId}`,
        host_user_id: null,
        status: "active",
        source: "discord",
        is_private: true,
        discord_guild_id: null,
      })
      .select("id")
      .single();
    if (noStoredGuild.error || !noStoredGuild.data?.id) {
      throw new Error(`Could not create no-guild archive fixture: ${noStoredGuild.error?.message ?? "unknown error"}`);
    }
    roomIds.push(noStoredGuild.data.id);
    const noStoredGuildArchive = await request(`/api/gameday/rooms/${noStoredGuild.data.id}/archive`, {
      method: "PATCH",
      bot: true,
      guildId: "GUILD_A",
    });
    expect(
      "bot cannot archive a Discord room without stored guild metadata",
      noStoredGuildArchive.status === 403,
      String(noStoredGuildArchive.status),
    );
    const nonHostArchive = await request(`/api/gameday/rooms/${noStoredGuild.data.id}/archive`, {
      method: "PATCH",
      token: nonHost.accessToken,
    });
    expect(
      "ordinary users cannot archive Discord rooms",
      nonHostArchive.status === 403,
      String(nonHostArchive.status),
    );
    const adminArchive = await request(`/api/gameday/rooms/${noStoredGuild.data.id}/archive`, {
      method: "PATCH",
      token: host.accessToken,
    });
    expect(
      "Game Day admin can archive a Discord room from Host Tools",
      adminArchive.status === 200 && adminArchive.body.ok === true,
      JSON.stringify(adminArchive.body),
    );
    const adminRestore = await request(`/api/gameday/rooms/${noStoredGuild.data.id}/restore`, {
      method: "PATCH",
      token: host.accessToken,
    });
    expect(
      "Game Day admin can restore an archived room",
      adminRestore.status === 200 && adminRestore.body.ok === true,
      JSON.stringify(adminRestore.body),
    );
    const nonHostRestore = await request(`/api/gameday/rooms/${noStoredGuild.data.id}/restore`, {
      method: "PATCH",
      token: nonHost.accessToken,
    });
    expect(
      "ordinary users cannot restore an archived room",
      nonHostRestore.status === 403,
      String(nonHostRestore.status),
    );

    const batchRoom = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.accessToken,
      body: { ...roomPayload, room_name: `Batch archive room ${runId}` },
    });
    const batchRoomId = batchRoom.body.room_id as string | undefined;
    if (batchRoom.status !== 200 || !batchRoomId) {
      throw new Error(`Could not create batch archive fixture: ${JSON.stringify(batchRoom.body)}`);
    }
    roomIds.push(batchRoomId);
    const deniedBatchArchive = await request("/api/gameday/rooms/archive-batch", {
      method: "PATCH",
      token: nonHost.accessToken,
      body: { room_ids: [noStoredGuild.data.id, batchRoomId] },
    });
    expect(
      "ordinary users cannot bulk archive rooms",
      deniedBatchArchive.status === 403,
      String(deniedBatchArchive.status),
    );
    const batchArchive = await request("/api/gameday/rooms/archive-batch", {
      method: "PATCH",
      token: host.accessToken,
      body: { room_ids: [noStoredGuild.data.id, batchRoomId] },
    });
    expect(
      "Game Day admin can bulk archive selected rooms",
      batchArchive.status === 200 &&
        batchArchive.body.ok === true &&
        batchArchive.body.archived_ids?.length === 2,
      JSON.stringify(batchArchive.body),
    );

    const unauthenticatedBatch = await request("/api/gameday/rooms/archive-batch", {
      method: "POST",
      body: { room_ids: [appRoom.body.room_id, archiveRoomId] },
    });
    expect(
      "batch archive requires an authenticated host",
      unauthenticatedBatch.status === 401,
      String(unauthenticatedBatch.status),
    );
    const malformedBatch = await request("/api/gameday/rooms/archive-batch", {
      method: "POST",
      token: host.accessToken,
      body: { room_ids: ["not-a-room-id", archiveRoomId] },
    });
    expect(
      "batch archive rejects malformed room IDs",
      malformedBatch.status === 400,
      String(malformedBatch.status),
    );

    async function createWebRoom(name: string, token: string) {
      const created = await request("/api/gameday/rooms", {
        method: "POST",
        token,
        body: { ...roomPayload, room_name: name },
      });
      if (created.status !== 200 || !created.body.room_id) {
        throw new Error(`Could not create archive fixture: ${JSON.stringify(created.body)}`);
      }
      roomIds.push(created.body.room_id);
      return created.body.room_id as string;
    }
    const batchRoomA = await createWebRoom(`Batch archive A ${runId}`, host.accessToken);
    const batchRoomB = await createWebRoom(`Batch archive B ${runId}`, host.accessToken);
    const finalizedBatchRoom = await createWebRoom(`Batch finalized ${runId}`, host.accessToken);
    const markFinalized = await service
      .from("gameday_rooms")
      .update({ status: "finalized" })
      .eq("id", finalizedBatchRoom);
    if (markFinalized.error) {
      throw new Error(`Could not mark finalized archive fixture: ${markFinalized.error.message}`);
    }

    const adminBatch = await request("/api/gameday/rooms/archive-batch", {
      method: "POST",
      token: host.accessToken,
      body: { room_ids: [batchRoomA, batchRoomB, finalizedBatchRoom] },
    });
    const adminBatchResults = adminBatch.body.results ?? [];
    expect(
      "admin batch archives eligible rooms and reports finalized rooms",
      adminBatch.status === 200 &&
        adminBatchResults.find((result: any) => result.room_id === batchRoomA)?.ok === true &&
        adminBatchResults.find((result: any) => result.room_id === batchRoomB)?.ok === true &&
        adminBatchResults.find((result: any) => result.room_id === finalizedBatchRoom)?.status === 400,
      JSON.stringify(adminBatch.body),
    );
    const finalizedBatchRecord = await service
      .from("gameday_rooms")
      .select("status, archived_at")
      .eq("id", finalizedBatchRoom)
      .single();
    expect(
      "batch archive preserves finalized room receipts",
      finalizedBatchRecord.data?.status === "finalized" && !finalizedBatchRecord.data?.archived_at,
      JSON.stringify(finalizedBatchRecord.data),
    );
    const batchAuditEvents = await service
      .from("gameday_events")
      .select("room_id, event_type, user_id")
      .in("room_id", [batchRoomA, batchRoomB]);
    expect(
      "batch archive records one room_archived audit event per archived room",
      !batchAuditEvents.error &&
        [batchRoomA, batchRoomB].every((id) =>
          (batchAuditEvents.data ?? []).some(
            (event) => event.room_id === id && event.event_type === "room_archived" && event.user_id === hostUserId,
          ),
        ),
      JSON.stringify(batchAuditEvents.data),
    );

    process.env.GAMEDAY_HOST_EMAILS = `${hostEmail},${nonHostEmail}`;
    const nonAdminRoom = await createWebRoom(`Non-admin batch room ${runId}`, nonHost.accessToken);
    const nonAdminBatch = await request("/api/gameday/rooms/archive-batch", {
      method: "POST",
      token: nonHost.accessToken,
      body: { room_ids: [nonAdminRoom, appRoom.body.room_id] },
    });
    expect(
      "non-admin batch archives its own room but cannot archive another host's room",
      nonAdminBatch.status === 200 &&
        nonAdminBatch.body.results?.find((result: any) => result.room_id === nonAdminRoom)?.ok === true &&
        nonAdminBatch.body.results?.find((result: any) => result.room_id === appRoom.body.room_id)?.status === 403,
      JSON.stringify(nonAdminBatch.body),
    );

    const archived = await request(`/api/gameday/rooms/${archiveRoomId}/archive`, {
      method: "PATCH",
      bot: true,
      guildId: "GUILD_A",
    });
    expect(
      "matching guild bot can archive its Discord room",
      archived.status === 200 && archived.body.ok === true && !archived.body.already,
      JSON.stringify(archived.body),
    );

    const archivedAgain = await request(`/api/gameday/rooms/${archiveRoomId}/archive`, {
      method: "PATCH",
      bot: true,
      guildId: "GUILD_A",
    });
    expect(
      "archiving an already archived Discord room is idempotent",
      archivedAgain.status === 200 && archivedAgain.body.ok === true && archivedAgain.body.already === true,
      JSON.stringify(archivedAgain.body),
    );

    const archivedRecord = await service
      .from("gameday_rooms")
      .select("archived_at")
      .eq("id", archiveRoomId)
      .single();
    const archivedPublicRooms = await request("/api/gameday/public-rooms");
    expect(
      "archived Discord room is marked archived and excluded from public discovery",
      !!archivedRecord.data?.archived_at &&
        archivedPublicRooms.status === 200 &&
        !(archivedPublicRooms.body.rooms ?? []).some((room: any) => room.id === archiveRoomId),
      JSON.stringify({ archived: archivedRecord.data, publicStatus: archivedPublicRooms.status }),
    );

    const publicRoom = await request(`/api/gameday/rooms/${discordRoomId}`);
    expect(
      "public room payload omits host and Discord ownership metadata",
      publicRoom.status === 200 &&
        !("host_user_id" in publicRoom.body.room) &&
        !("discord_guild_id" in publicRoom.body.room) &&
        !("discord_channel_id" in publicRoom.body.room) &&
        !("discord_user_id" in publicRoom.body.room),
    );

    const { data: appCard, error: appCardError } = await service
      .from("gameday_pick_cards")
      .select("id")
      .eq("room_id", appRoom.body.room_id)
      .eq("phase", "halftime")
      .single();
    if (appCardError) {
      throw new Error(`Web fixture halftime-card lookup failed: ${appCardError.message}`);
    }
    if (!appCard?.id) throw new Error("Web fixture did not create a halftime card");
    const botOnWebRoom = await request(`/api/gameday/cards/${appCard.id}/open`, {
      method: "PATCH",
      bot: true,
      guildId: "GUILD_A",
    });
    expect("bot cannot operate an ordinary web-hosted room", botOnWebRoom.status === 403, String(botOnWebRoom.status));

    const { data: cards, error: cardsError } = await service
      .from("gameday_pick_cards")
      .select("id, phase")
      .eq("room_id", discordRoomId)
      .eq("phase", "halftime")
      .single();
    if (cardsError) {
      throw new Error(`Discord fixture halftime-card lookup failed: ${cardsError.message}`);
    }
    if (!cards?.id) throw new Error("Discord fixture did not create a halftime card");
    const halftimeCardId = cards.id;
    const { data: props, error: propsError } = await service
      .from("gameday_props")
      .select("id, answer_options")
      .eq("card_id", halftimeCardId)
      .order("display_order")
      .limit(1)
      .single();
    if (propsError) {
      throw new Error(`Discord fixture prop lookup failed: ${propsError.message}`);
    }
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
      await service.from("gameday_rooms").delete().in("id", roomIds);
    }
    if (hostUserId) await service.auth.admin.deleteUser(hostUserId);
    if (nonHostUserId) await service.auth.admin.deleteUser(nonHostUserId);
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  }

  const total = passed + failed;
  if (failed === 0 && passed === EXPECTED_ASSERTIONS) {
    console.log(`\n${EXPECTED_ASSERTIONS}/${EXPECTED_ASSERTIONS} assertions passed`);
  } else {
    console.error(
      `\nDiscord isolation gate failed: ${passed}/${total} assertions passed; expected ${EXPECTED_ASSERTIONS}/${EXPECTED_ASSERTIONS}`,
    );
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error("\nSecurity suite failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
