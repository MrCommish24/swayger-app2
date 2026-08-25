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
  const runId = unique("gameday-web-regression");
  const password = `Test-${runId}-A1!`;
  const hostEmail = `${runId}-host@example.test`;
  const playerEmail = `${runId}-player@example.test`;
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
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const request = async (
      path: string,
      opts: {
        method?: string;
        token?: string;
        guest?: string;
        body?: unknown;
      } = {},
    ) => {
      const headers: Record<string, string> = {};
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      if (opts.guest) headers["X-Guest-Session"] = opts.guest;
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";
      const res = await fetch(baseUrl + path, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      return {
        status: res.status,
        body: (await res.json().catch(() => ({}))) as any,
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

    const host = await makeUser(hostEmail);
    const player = await makeUser(playerEmail);

    const isHost = await request("/api/gameday/is-host", { token: host.token });
    expect(
      "valid allowlisted host is recognized",
      isHost.status === 200 && isHost.body.isHost === true,
      JSON.stringify(isHost.body),
    );

    const created = await request("/api/gameday/rooms", {
      method: "POST",
      token: host.token,
      body: {
        room_name: `Web Regression ${runId}`,
        team_a_name: "Alpha",
        team_b_name: "Beta",
        team_a_star: "A Star",
        team_b_star: "B Star",
        game_date: "2026-08-25",
        is_private: false,
      },
    });
    expect(
      "normal web host creates an app-owned room",
      created.status === 200 &&
        created.body.room?.source === "app" &&
        created.body.room?.host_user_id === host.id &&
        !created.body.room?.discord_guild_id,
      JSON.stringify(created.body),
    );
    const roomId = created.body.room_id as string;
    if (!roomId) throw new Error("No room ID returned");
    roomIds.push(roomId);

    const rooms = await request("/api/gameday/rooms", { token: host.token });
    expect(
      "host room listing contains the new web room",
      rooms.status === 200 &&
        (rooms.body.rooms ?? []).some((r: any) => r.id === roomId),
      JSON.stringify(rooms.body),
    );

    const hostData = await request(`/api/gameday/rooms/${roomId}/host-data`, {
      token: host.token,
    });
    expect(
      "human host can load owned room host-data",
      hostData.status === 200 &&
        hostData.body.room?.host_user_id === host.id &&
        (hostData.body.cards ?? []).length > 0,
      JSON.stringify(hostData.body),
    );
    const pregame = (hostData.body.cards ?? []).find(
      (c: any) => c.phase === "pregame",
    );
    const prop = pregame?.gameday_props?.[0];
    if (!pregame?.id || !prop?.id || !prop?.answer_options?.[0]) {
      throw new Error("Created room missing pregame fixture");
    }

    const publicRoom = await request(`/api/gameday/rooms/${roomId}`);
    expect(
      "public web room loads without Discord credentials",
      publicRoom.status === 200 &&
        publicRoom.body.room?.id === roomId &&
        !("host_user_id" in publicRoom.body.room) &&
        !("discord_guild_id" in publicRoom.body.room),
      JSON.stringify(publicRoom.body),
    );

    if (created.body.room_code) {
      const byCode = await request(
        `/api/gameday/rooms/by-code/${created.body.room_code}`,
      );
      expect(
        "room-code lookup resolves normal web room",
        byCode.status === 200 && byCode.body.room_id === roomId,
        JSON.stringify(byCode.body),
      );
    } else {
      expect(
        "room-code lookup is available for normal web rooms",
        false,
        "creation did not return room_code",
      );
    }

    const joinAuthed = await request(`/api/gameday/rooms/${roomId}/join`, {
      method: "POST",
      token: player.token,
      body: {},
    });
    expect(
      "authenticated participant joins normal web room",
      joinAuthed.status === 200 &&
        joinAuthed.body.participant?.is_guest === false,
      JSON.stringify(joinAuthed.body),
    );
    const guestName = `Guest ${runId}`;
    const joinGuest = await request(`/api/gameday/rooms/${roomId}/join`, {
      method: "POST",
      body: { display_name: guestName },
    });
    expect(
      "guest participant joins normal web room",
      joinGuest.status === 200 &&
        joinGuest.body.participant?.is_guest === true &&
        !!joinGuest.body.guest_session_id,
      JSON.stringify(joinGuest.body),
    );
    const guestSession = joinGuest.body.guest_session_id as string;

    const open = await request(`/api/gameday/cards/${pregame.id}/open`, {
      method: "PATCH",
      token: host.token,
    });
    expect(
      "human host opens card without bot headers",
      open.status === 200 && open.body.ok === true,
      JSON.stringify(open.body),
    );

    const authedPick = await request(`/api/gameday/props/${prop.id}/pick`, {
      method: "POST",
      token: player.token,
      body: { selected_answer: prop.answer_options[0] },
    });
    expect(
      "authenticated participant pick persists through API",
      authedPick.status === 200 && authedPick.body.ok === true,
      JSON.stringify(authedPick.body),
    );
    const guestPick = await request(`/api/gameday/props/${prop.id}/pick`, {
      method: "POST",
      guest: guestSession,
      body: { selected_answer: prop.answer_options[0] },
    });
    expect(
      "guest participant pick persists through API",
      guestPick.status === 200 && guestPick.body.ok === true,
      JSON.stringify(guestPick.body),
    );

    const playerRoom = await request(`/api/gameday/rooms/${roomId}`, {
      token: player.token,
    });
    expect(
      "returning authenticated participant receives saved pick",
      playerRoom.status === 200 &&
        playerRoom.body.my_picks?.[prop.id] === prop.answer_options[0],
      JSON.stringify(playerRoom.body.my_picks),
    );
    const guestRoom = await request(`/api/gameday/rooms/${roomId}`, {
      guest: guestSession,
    });
    expect(
      "returning guest receives saved pick",
      guestRoom.status === 200 &&
        guestRoom.body.my_picks?.[prop.id] === prop.answer_options[0],
      JSON.stringify(guestRoom.body.my_picks),
    );

    const leaderboardBefore = await request(
      `/api/gameday/rooms/${roomId}/leaderboard`,
    );
    expect(
      "public leaderboard includes both participant paths",
      leaderboardBefore.status === 200 &&
        (leaderboardBefore.body.leaderboard ?? []).length === 2,
      JSON.stringify(leaderboardBefore.body),
    );

    const renamed = await request(`/api/gameday/rooms/${roomId}/rename`, {
      method: "PATCH",
      token: host.token,
      body: { room_name: `Renamed ${runId}` },
    });
    expect(
      "human host can rename owned web room",
      renamed.status === 200 && renamed.body.ok === true,
      JSON.stringify(renamed.body),
    );
    const visibility = await request(
      `/api/gameday/rooms/${roomId}/visibility`,
      {
        method: "PATCH",
        token: host.token,
        body: { is_private: true },
      },
    );
    expect(
      "human host can update room visibility",
      visibility.status === 200 && visibility.body.is_private === true,
      JSON.stringify(visibility.body),
    );
    const countdown = await request(
      `/api/gameday/rooms/${roomId}/countdown`,
      {
        method: "POST",
        token: host.token,
        body: {
          phase: "pregame",
          countdown_type: "locks_soon",
          duration_minutes: 5,
        },
      },
    );
    expect(
      "human host can set countdown",
      countdown.status === 200 && countdown.body.ok === true,
      JSON.stringify(countdown.body),
    );

    const duplicated = await request(`/api/gameday/rooms/${roomId}/duplicate`, {
      method: "POST",
      token: host.token,
      body: { room_name: `Archive Copy ${runId}` },
    });
    expect(
      "human host can duplicate owned web room",
      duplicated.status === 200 && !!duplicated.body.room_id,
      JSON.stringify(duplicated.body),
    );
    if (duplicated.body.room_id) roomIds.push(duplicated.body.room_id);
    const archived = await request(
      `/api/gameday/rooms/${duplicated.body.room_id}/archive`,
      { method: "PATCH", token: host.token },
    );
    expect(
      "human host can archive non-finalized duplicate",
      archived.status === 200 && archived.body.ok === true,
      JSON.stringify(archived.body),
    );

    const locked = await request(`/api/gameday/cards/${pregame.id}/lock`, {
      method: "PATCH",
      token: host.token,
    });
    expect(
      "human host locks card without bot headers",
      locked.status === 200 && locked.body.ok === true,
      JSON.stringify(locked.body),
    );
    const settled = await request(`/api/gameday/props/${prop.id}/settle`, {
      method: "PATCH",
      token: host.token,
      body: { correct_answer: prop.answer_options[0] },
    });
    expect(
      "human host settles objective prop",
      settled.status === 200 && settled.body.ok === true,
      JSON.stringify(settled.body),
    );
    const finalized = await request(`/api/gameday/rooms/${roomId}/finalize`, {
      method: "PATCH",
      token: host.token,
    });
    expect(
      "human host finalizes owned web room",
      finalized.status === 200 && finalized.body.ok === true,
      JSON.stringify(finalized.body),
    );
    const finalStandings = await request(
      `/api/gameday/rooms/${roomId}/final-standings`,
    );
    expect(
      "public final standings load after finalization",
      finalStandings.status === 200 && finalStandings.body.finalized === true,
      JSON.stringify(finalStandings.body),
    );
    const finalViewed = await request(
      `/api/gameday/rooms/${roomId}/final-standings-viewed`,
      { method: "POST" },
    );
    expect(
      "final-standings event endpoint remains available",
      finalViewed.status === 200 && finalViewed.body.ok === true,
      JSON.stringify(finalViewed.body),
    );

    const interest = await request(
      `/api/gameday/rooms/${roomId}/next-room-interest`,
      {
        method: "POST",
        guest: guestSession,
        body: {
          participant_id: joinGuest.body.participant?.id,
          participant_type: "guest",
          entry_source: "regression",
        },
      },
    );
    expect(
      "next-room-interest endpoint accepts guest participant flow",
      interest.status === 200 && interest.body.ok === true,
      JSON.stringify(interest.body),
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

  console.log(`\n${passed}/${passed + failed} assertions passed`);
  if (failed) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });