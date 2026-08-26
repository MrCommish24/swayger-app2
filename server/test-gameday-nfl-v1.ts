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
  const botKey = process.env.GAMEDAY_BOT_API_KEY;
  if (!url || !serviceKey || !anonKey || !botKey) {
    throw new Error("Required Supabase and Game Day bot configuration is unavailable");
  }

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = unique("gameday-nfl-v1");
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
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const request = async (
      path: string,
      opts: { method?: string; token?: string; guest?: string; bot?: boolean; body?: unknown } = {},
    ) => {
      const headers: Record<string, string> = {};
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      if (opts.guest) headers["X-Guest-Session"] = opts.guest;
      if (opts.bot) headers["x-api-key"] = botKey;
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(baseUrl + path, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      return { status: response.status, body: await response.json().catch(() => ({})) as any };
    };
    const makeUser = async (email: string) => {
      const created = await service.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (created.error || !created.data.user) throw new Error(`User creation failed: ${created.error?.message}`);
      userIds.push(created.data.user.id);
      const signed = await auth.auth.signInWithPassword({ email, password });
      if (signed.error || !signed.data.session) throw new Error(`Sign-in failed: ${signed.error?.message}`);
      return { id: created.data.user.id, token: signed.data.session.access_token };
    };

    const host = await makeUser(hostEmail);
    const player = await makeUser(playerEmail);
    const template = await request("/api/gameday/template?sport=nfl");
    expect(
      "NFL template has the required 13 default props",
      template.status === 200 && template.body.defaultPropIds?.length === 13 && template.body.template?.length >= 13,
      JSON.stringify(template.body),
    );
    expect(
      "NFL template uses stable pregame, halftime, and 4Q IDs",
      template.body.defaultPropIds?.filter((id: string) => id.startsWith("nfl_pre_")).length === 6 &&
        template.body.defaultPropIds?.filter((id: string) => id.startsWith("nfl_ht_")).length === 4 &&
        template.body.defaultPropIds?.filter((id: string) => id.startsWith("nfl_4q_")).length === 3,
      JSON.stringify(template.body.defaultPropIds),
    );

    const roomPayload = {
      room_name: `NFL V1 ${runId}`,
      team_a_name: "Chicago Bears",
      team_b_name: "Green Bay Packers",
      team_a_star: "Caleb Williams",
      team_b_star: "Jordan Love",
      game_date: "2026-09-13",
      sport: "nfl",
    };
    const created = await request("/api/gameday/rooms", {
      method: "POST", token: host.token, body: roomPayload,
    });
    expect(
      "host creates an NFL room with the normalized sport",
      created.status === 200 && created.body.room?.sport === "nfl",
      JSON.stringify(created.body),
    );
    const roomId = created.body.room_id as string;
    if (!roomId) throw new Error("NFL room creation did not return a room ID. Apply supabase/gameday-nfl-v1-migration.sql before running this suite.");
    roomIds.push(roomId);

    const hostData = await request(`/api/gameday/rooms/${roomId}/host-data`, { token: host.token });
    const cards = hostData.body.cards ?? [];
    const pregame = cards.find((card: any) => card.phase === "pregame");
    const halftime = cards.find((card: any) => card.phase === "halftime");
    const fourth = cards.find((card: any) => card.phase === "fourth");
    expect(
      "NFL room creates exactly Pregame, Halftime, and 4Q / Clutch cards",
      hostData.status === 200 && cards.length === 3 &&
        pregame?.title === "Pregame Picks" && halftime?.title === "Halftime Picks" && fourth?.title === "4Q Clutch Picks",
      JSON.stringify(cards),
    );
    expect(
      "NFL default cards contain 6 pregame, 4 halftime, and 3 4Q props",
      pregame?.gameday_props?.length === 6 && halftime?.gameday_props?.length === 4 && fourth?.gameday_props?.length === 3,
      JSON.stringify(cards.map((card: any) => ({ phase: card.phase, count: card.gameday_props?.length }))),
    );
    expect(
      "NFL placeholders render real teams and starting QBs",
      pregame?.gameday_props?.some((prop: any) => prop.answer_options?.includes("Chicago Bears")) &&
        pregame?.gameday_props?.some((prop: any) => prop.answer_options?.includes("Caleb Williams")) &&
        !JSON.stringify(cards).includes("{{TEAM_A}}") &&
        !JSON.stringify(cards).includes("{{STAR_A}}"),
      JSON.stringify(cards),
    );
    const publicRoom = await request(`/api/gameday/rooms/${roomId}`);
    expect(
      "public NFL room exposes its sport for correct guest copy",
      publicRoom.status === 200 && publicRoom.body.room?.sport === "nfl",
      JSON.stringify(publicRoom.body),
    );

    const sundayTemplate = await request("/api/gameday/template?sport=nfl&template_type=nfl_sunday_slate");
    expect(
      "Sunday Slate template returns all 16 format-specific defaults",
      sundayTemplate.status === 200 && sundayTemplate.body.template?.length === 16 &&
        sundayTemplate.body.defaultPropIds?.length === 16,
      JSON.stringify(sundayTemplate.body),
    );
    expect(
      "Sunday Slate template uses the required stable prop IDs",
      ["nfl_slate_early_qb_passing_yards", "nfl_slate_late_overtime", "nfl_slate_snf_margin"]
        .every((id) => sundayTemplate.body.defaultPropIds?.includes(id)),
      JSON.stringify(sundayTemplate.body.defaultPropIds),
    );

    const sundaySlatePayload = {
      room_name: `Sunday Slate ${runId}`,
      game_date: "2026-09-13",
      sport: "nfl",
      template_type: "nfl_sunday_slate",
      slate_config: {
        early_matchups: ["Bears vs Packers", "Eagles vs Cowboys"],
        late_matchups: ["Chiefs vs Raiders", "Rams vs Seahawks"],
        sunday_night_teams: ["Baltimore Ravens", "Buffalo Bills"],
        qb_candidates: ["Lamar Jackson", "Josh Allen", "Patrick Mahomes"],
        rb_candidates: ["Derrick Henry", "Saquon Barkley"],
        receiver_candidates: ["Justin Jefferson", "CeeDee Lamb"],
        team_candidates: ["Bears", "Packers", "Eagles", "Cowboys", "Chiefs", "Raiders", "Rams", "Seahawks"],
        game_candidates: ["Bears vs Packers", "Eagles vs Cowboys", "Chiefs vs Raiders", "Rams vs Seahawks"],
      },
    };
    const sundayCreated = await request("/api/gameday/rooms", {
      method: "POST", token: host.token, body: sundaySlatePayload,
    });
    const sundayRoomId = sundayCreated.body.room_id as string;
    if (sundayRoomId) roomIds.push(sundayRoomId);
    expect(
      "host creates a Sunday Slate room with its persisted format",
      sundayCreated.status === 200 && sundayCreated.body.room?.template_type === "nfl_sunday_slate",
      JSON.stringify(sundayCreated.body),
    );
    const sundayData = sundayRoomId
      ? await request(`/api/gameday/rooms/${sundayRoomId}/host-data`, { token: host.token })
      : { status: 0, body: {} };
    const sundayCards = sundayData.body.cards ?? [];
    const earlySlate = sundayCards.find((card: any) => card.phase === "pregame");
    const lateSlate = sundayCards.find((card: any) => card.phase === "halftime");
    const sundayNight = sundayCards.find((card: any) => card.phase === "fourth");
    expect(
      "Sunday Slate creates Early, Late, and Sunday Night cards with 8/5/3 props",
      sundayData.status === 200 && sundayCards.length === 3 &&
        earlySlate?.title === "Early Slate Picks" && earlySlate?.gameday_props?.length === 8 &&
        lateSlate?.title === "Late Slate Picks" && lateSlate?.gameday_props?.length === 5 &&
        sundayNight?.title === "Sunday Night Picks" && sundayNight?.gameday_props?.length === 3,
      JSON.stringify(sundayCards.map((card: any) => ({ title: card.title, count: card.gameday_props?.length }))),
    );
    expect(
      "Sunday Slate resolves candidate options and includes Other plus tie settlement paths",
      earlySlate?.gameday_props?.some((prop: any) => prop.answer_options?.includes("Lamar Jackson") &&
        prop.answer_options?.includes("Other") && prop.answer_options?.includes("Tie / Multiple tied")) &&
        earlySlate?.gameday_props?.some((prop: any) => prop.answer_options?.includes("Bears vs Packers")) &&
        sundayNight?.gameday_props?.some((prop: any) => prop.answer_options?.includes("Baltimore Ravens")) &&
        !JSON.stringify(sundayCards).includes("{{SLATE_"),
      JSON.stringify(sundayCards),
    );
    const sundayPublic = sundayRoomId ? await request(`/api/gameday/rooms/${sundayRoomId}`) : { status: 0, body: {} };
    expect(
      "public Sunday Slate room exposes safe format context",
      sundayPublic.status === 200 && sundayPublic.body.room?.template_type === "nfl_sunday_slate" &&
        Array.isArray(sundayPublic.body.room?.slate_config?.qb_candidates),
      JSON.stringify(sundayPublic.body),
    );

    const joinedAuthed = await request(`/api/gameday/rooms/${roomId}/join`, {
      method: "POST", token: player.token, body: {},
    });
    const joinedGuest = await request(`/api/gameday/rooms/${roomId}/join`, {
      method: "POST", body: { display_name: `NFL Guest ${runId}` },
    });
    expect("authenticated participant joins NFL room", joinedAuthed.status === 200 && !joinedAuthed.body.participant?.is_guest, JSON.stringify(joinedAuthed.body));
    expect("guest participant joins NFL room", joinedGuest.status === 200 && joinedGuest.body.participant?.is_guest && !!joinedGuest.body.guest_session_id, JSON.stringify(joinedGuest.body));
    const guestSession = joinedGuest.body.guest_session_id as string;

    for (const card of [pregame, halftime, fourth]) {
      if (!card?.id || !card.gameday_props?.length) throw new Error(`NFL ${card?.phase ?? "unknown"} card is incomplete`);
      const open = await request(`/api/gameday/cards/${card.id}/open`, { method: "PATCH", token: host.token, body: {} });
      expect(`${card.phase} card opens`, open.status === 200 && open.body.ok === true, JSON.stringify(open.body));
      const firstProp = card.gameday_props[0];
      const answer = firstProp.answer_options[0];
      const authedPick = await request(`/api/gameday/props/${firstProp.id}/pick`, {
        method: "POST", token: player.token, body: { selected_answer: answer },
      });
      const guestPick = await request(`/api/gameday/props/${firstProp.id}/pick`, {
        method: "POST", guest: guestSession, body: { selected_answer: answer },
      });
      expect(`authenticated player picks ${card.phase}`, authedPick.status === 200 && authedPick.body.ok, JSON.stringify(authedPick.body));
      expect(`guest picks ${card.phase}`, guestPick.status === 200 && guestPick.body.ok, JSON.stringify(guestPick.body));
      const locked = await request(`/api/gameday/cards/${card.id}/lock`, { method: "PATCH", token: host.token, body: {} });
      expect(`${card.phase} card locks`, locked.status === 200 && locked.body.ok, JSON.stringify(locked.body));
      for (const prop of card.gameday_props) {
        const settled = await request(`/api/gameday/props/${prop.id}/settle`, {
          method: "PATCH", token: host.token, body: { correct_answer: prop.answer_options[0] },
        });
        expect(`${card.phase} prop settles`, settled.status === 200 && settled.body.ok, JSON.stringify(settled.body));
      }
    }

    const leaderboard = await request(`/api/gameday/rooms/${roomId}/leaderboard`);
    expect(
      "NFL leaderboard awards the existing 10 SP per correct pick",
      leaderboard.status === 200 &&
        (leaderboard.body.leaderboard ?? []).length === 2 &&
        (leaderboard.body.leaderboard ?? []).every((entry: any) => entry.game_day_sp === 30 && entry.correct_picks === 3),
      JSON.stringify(leaderboard.body),
    );
    const finalized = await request(`/api/gameday/rooms/${roomId}/finalize`, { method: "PATCH", token: host.token, body: {} });
    expect("NFL room finalizes after all selected props settle", finalized.status === 200 && finalized.body.ok, JSON.stringify(finalized.body));
    const standings = await request(`/api/gameday/rooms/${roomId}/final-standings`);
    expect("NFL final standings remain public after finalization", standings.status === 200 && standings.body.finalized && standings.body.leaderboard?.length === 2, JSON.stringify(standings.body));

    const duplicate = await request(`/api/gameday/rooms/${roomId}/duplicate`, {
      method: "POST", token: host.token, body: { room_name: `NFL Copy ${runId}` },
    });
    if (duplicate.body.room_id) roomIds.push(duplicate.body.room_id);
    const duplicateData = duplicate.body.room_id
      ? await request(`/api/gameday/rooms/${duplicate.body.room_id}/host-data`, { token: host.token })
      : { status: 0, body: {} };
    expect(
      "duplicated NFL room preserves sport and all three cards",
      duplicate.status === 200 && duplicateData.status === 200 && duplicateData.body.room?.sport === "nfl" && duplicateData.body.cards?.length === 3,
      JSON.stringify(duplicateData.body),
    );

    const discordCreated = await request("/api/gameday/rooms", {
      method: "POST",
      bot: true,
      body: {
        ...roomPayload,
        room_name: `Discord NFL ${runId}`,
        source: "discord",
        discord_guild_id: `NFL_GUILD_${runId}`,
        discord_channel_id: "NFL_CHANNEL",
        discord_user_id: "NFL_USER",
      },
    });
    const discordRoomId = discordCreated.body.room_id as string;
    if (discordRoomId) roomIds.push(discordRoomId);
    expect(
      "Discord-created NFL room is private and unlisted",
      discordCreated.status === 200 && discordCreated.body.room?.sport === "nfl" &&
        discordCreated.body.room?.source === "discord" && discordCreated.body.room?.is_private === true,
      JSON.stringify(discordCreated.body),
    );
    const directDiscordRoom = discordRoomId ? await request(`/api/gameday/rooms/${discordRoomId}`) : { status: 0, body: {} };
    const byCode = discordCreated.body.room_code
      ? await request(`/api/gameday/rooms/by-code/${discordCreated.body.room_code}`)
      : { status: 0, body: {} };
    const publicRooms = await request("/api/gameday/public-rooms");
    expect(
      "private Discord NFL room remains available through its direct link and room code",
      directDiscordRoom.status === 200 && directDiscordRoom.body.room?.sport === "nfl" &&
        byCode.status === 200 && byCode.body.room_id === discordRoomId,
      JSON.stringify({ direct: directDiscordRoom.body, byCode: byCode.body }),
    );
    expect(
      "private Discord NFL room remains excluded from public discovery",
      publicRooms.status === 200 && !(publicRooms.body.rooms ?? []).some((room: any) => room.id === discordRoomId),
      JSON.stringify(publicRooms.body),
    );
  } finally {
    if (roomIds.length) await service.from("gameday_rooms").delete().in("id", roomIds);
    for (const id of userIds) await service.auth.admin.deleteUser(id);
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  }

  console.log(`\nNFL GAME DAY V1: ${passed}/${passed + failed} assertions passed`);
  if (failed) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });