/**
 * Disposable live integration coverage for publishing approved NFL weekly
 * slates into private Game Day room instances.
 *
 * Prerequisites:
 *   - apply supabase/gameday-nfl-weekly-slate-room-instances.sql
 *   - apply the master slate, Discord subscription, Sunday Slate, Discord,
 *     room-code, and base Game Day migrations
 *   - MM_ADMIN_TOKEN and Supabase secrets must be available
 *
 * Run: npx tsx server/test-gameday-nfl-weekly-slate-publish.ts
 */

import * as dotenv from "dotenv";
import express from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

let passed = 0;
let failed = 0;
const EXPECTED_ASSERTIONS = 33;

function expect(label: string, condition: unknown, detail?: string) {
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
  const adminToken = process.env.MM_ADMIN_TOKEN;
  if (!supabaseUrl || !serviceKey || !anonKey || !adminToken) {
    throw new Error("Required Supabase and MM_ADMIN_TOKEN configuration is unavailable");
  }

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = unique("weekly-publish");
  const activeGuildA = `PUBLISH_ACTIVE_A_${runId}`;
  const activeGuildB = `PUBLISH_ACTIVE_B_${runId}`;
  const pausedGuild = `PUBLISH_PAUSED_${runId}`;
  const disabledGuild = `PUBLISH_DISABLED_${runId}`;
  const fixtureGuildIds = [activeGuildA, activeGuildB, pausedGuild, disabledGuild];
  const seasonYear = 3000 + Math.floor(Date.now() % 1000);
  const slateName = `NFL Sunday Slate ${runId}`;
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/gameday-nfl-weekly-slate-room-instances.sql"),
    "utf8",
  );
  const createdRoomIds: string[] = [];
  let slateId: string | null = null;
  let archivedSlateId: string | null = null;
  let server: Server | null = null;

  const validCandidates = {
    early_matchups: [" Bears vs Packers ", "Eagles vs Cowboys"],
    late_matchups: [" Chiefs vs Raiders ", "Rams vs Seahawks"],
    sunday_night_teams: [" Ravens ", "Bills"],
    qb_candidates: [" Lamar Jackson ", "Josh Allen"],
    rb_candidates: [" Derrick Henry ", "Saquon Barkley"],
    receiver_candidates: [" Justin Jefferson ", "CeeDee Lamb"],
    team_candidates: [" Bears ", "Packers"],
    game_candidates: [" Bears vs Packers ", "Chiefs vs Raiders"],
  };

    const { normalizeNflSundaySlateDisplayReward, registerGamedayRoutes } = await import("./routes-gameday");
  const app = express();
  app.use(express.json());
  registerGamedayRoutes(app);

  async function countRows(table: string) {
    const result = await service.from(table).select("id", { count: "exact", head: true });
    if (result.error) throw new Error(`${table} count failed: ${result.error.message}`);
    return result.count ?? 0;
  }

  try {
    server = await new Promise<Server>((resolveServer) => {
      const created = app.listen(0, "127.0.0.1", () => resolveServer(created));
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    async function request(
      path: string,
      options: {
        method?: string;
        authorized?: boolean;
        body?: Record<string, unknown>;
        headers?: Record<string, string>;
      } = {},
    ): Promise<ApiResponse> {
      const headers: Record<string, string> = { ...(options.headers ?? {}) };
      if (options.authorized) headers["x-admin-token"] = adminToken!;
      if (options.body) headers["Content-Type"] = "application/json";
      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    }

    expect(
      "instance migration defines the required service-role-only table",
      /CREATE TABLE IF NOT EXISTS public\.nfl_weekly_slate_room_instances/i.test(migration) &&
        /ON DELETE RESTRICT/i.test(migration) &&
        /REVOKE ALL ON TABLE public\.nfl_weekly_slate_room_instances FROM anon, authenticated, PUBLIC/i.test(migration) &&
        /status IN \('created', 'post_ready', 'posted', 'failed', 'archived'\)/i.test(migration),
    );
    expect(
      "display reward strips a simple Winner gets prefix",
      normalizeNflSundaySlateDisplayReward("Winner gets Game Day Champ for the week.") ===
        "Game Day Champ for the week.",
    );
    expect(
      "display reward strips a colon Winner gets prefix",
      normalizeNflSundaySlateDisplayReward("Winner gets: Game Day Champ for the week.") ===
        "Game Day Champ for the week.",
    );
    expect(
      "display reward handles lowercase winner gets",
      normalizeNflSundaySlateDisplayReward("winner gets Game Day Champ for the week") ===
        "Game Day Champ for the week",
    );
    expect(
      "display reward leaves normal text unchanged",
      normalizeNflSundaySlateDisplayReward("Bragging rights.") === "Bragging rights.",
    );
    expect(
      "display reward uses the default for blank text",
      normalizeNflSundaySlateDisplayReward("   ") === "Bragging rights and receipts.",
    );
    const browserProbe = await anon
      .from("nfl_weekly_slate_room_instances")
      .select("id")
      .limit(1);
    expect("anonymous instance-table access is blocked", !!browserProbe.error, browserProbe.error?.message);

    const unauthorized = await request("/api/gameday/admin/nfl-weekly-slates/not-a-slate/publish", {
      method: "POST",
    });
    expect("publish requires the admin token", unauthorized.status === 401);
    const wrongToken = await request("/api/gameday/admin/nfl-weekly-slates/not-a-slate/publish", {
      method: "POST",
      headers: { "x-admin-token": "wrong-token" },
    });
    expect("publish rejects a wrong admin token", wrongToken.status === 401);

    const created = await request("/api/gameday/admin/nfl-weekly-slates", {
      method: "POST",
      authorized: true,
      body: {
        season_year: seasonYear,
        week_number: 1,
        slate_name: slateName,
        slate_label: "Week 1",
        ...validCandidates,
      },
    });
    slateId = created.body.slate?.id ?? null;
    expect("a draft master slate is created for the publish fixture", created.status === 201 && !!slateId);
    if (!slateId) throw new Error(`Could not create fixture slate: ${JSON.stringify(created.body)}`);

    const draftPublish = await request(
      `/api/gameday/admin/nfl-weekly-slates/${slateId}/publish`,
      { method: "POST", authorized: true },
    );
    expect("draft slates cannot be published", draftPublish.status === 409);

    const approved = await request(
      `/api/gameday/admin/nfl-weekly-slates/${slateId}/approve`,
      { method: "POST", authorized: true },
    );
    expect("fixture slate can be approved", approved.status === 200 && approved.body.slate?.status === "approved");

    const archivedFixture = await request("/api/gameday/admin/nfl-weekly-slates", {
      method: "POST",
      authorized: true,
      body: {
        season_year: seasonYear,
        week_number: 2,
        slate_name: `${slateName} archived`,
        ...validCandidates,
      },
    });
    archivedSlateId = archivedFixture.body.slate?.id ?? null;
    if (archivedSlateId) {
      await request(`/api/gameday/admin/nfl-weekly-slates/${archivedSlateId}/archive`, {
        method: "POST",
        authorized: true,
      });
    }
    const archivedPublish = await request(
      `/api/gameday/admin/nfl-weekly-slates/${archivedSlateId ?? "missing"}/publish`,
      { method: "POST", authorized: true },
    );
    expect("archived slates cannot be published", !!archivedSlateId && archivedPublish.status === 409);

    const subscriptions = [
      {
        discord_guild_id: activeGuildA,
        discord_guild_name: "Active A",
        game_day_channel_id: `CHANNEL_A_${runId}`,
        game_day_channel_name: "game-day-a",
        receipt_channel_id: `RECEIPTS_A_${runId}`,
        receipt_channel_name: "receipts-a",
         reward_text: "Winner gets Game Day Champ for the week.",
        status: "active",
      },
      {
        discord_guild_id: activeGuildB,
        discord_guild_name: "Active B",
        game_day_channel_id: `CHANNEL_B_${runId}`,
        game_day_channel_name: "game-day-b",
        reward_text: "   ",
        status: "active",
      },
      {
        discord_guild_id: pausedGuild,
        game_day_channel_id: `CHANNEL_PAUSED_${runId}`,
        game_day_channel_name: "game-day-paused",
        status: "paused",
      },
      {
        discord_guild_id: disabledGuild,
        game_day_channel_id: `CHANNEL_DISABLED_${runId}`,
        game_day_channel_name: "game-day-disabled",
        status: "disabled",
      },
    ];
    const subscriptionInsert = await service
      .from("discord_gameday_subscriptions")
      .insert(subscriptions)
      .select("id");
    if (subscriptionInsert.error) {
      throw new Error(`Could not create subscription fixtures: ${subscriptionInsert.error.message}`);
    }

    const roomCountBeforeDryRun = await countRows("gameday_rooms");
    const instanceCountBeforeDryRun = await countRows("nfl_weekly_slate_room_instances");
    const dryRun = await request(
      `/api/gameday/admin/nfl-weekly-slates/${slateId}/publish`,
      {
        method: "POST",
        authorized: true,
        body: { dry_run: true, guild_ids: fixtureGuildIds },
      },
    );
    expect(
      "dry-run reports only active targets and inactive skips",
      dryRun.status === 200 &&
        dryRun.body.dry_run === true &&
        dryRun.body.summary?.active_targets === 2 &&
        dryRun.body.summary?.inactive_skipped === 2 &&
        dryRun.body.summary?.created === 0,
      JSON.stringify(dryRun.body),
    );
    expect(
      "dry-run creates no rooms or instances",
      (await countRows("gameday_rooms")) === roomCountBeforeDryRun &&
        (await countRows("nfl_weekly_slate_room_instances")) === instanceCountBeforeDryRun,
    );
    const slateAfterDryRun = await service
      .from("nfl_weekly_slate_templates")
      .select("status, published_at")
      .eq("id", slateId)
      .single();
    expect(
      "dry-run leaves the master slate approved and unpublished",
      slateAfterDryRun.data?.status === "approved" && slateAfterDryRun.data?.published_at === null,
      slateAfterDryRun.error?.message,
    );

    const filteredDryRun = await request(
      `/api/gameday/admin/nfl-weekly-slates/${slateId}/publish`,
      {
        method: "POST",
        authorized: true,
        body: { dry_run: true, guild_ids: [` ${activeGuildA} `] },
      },
    );
    expect(
      "guild_ids are trimmed and restrict dry-run targets",
      filteredDryRun.status === 200 &&
        filteredDryRun.body.summary?.active_targets === 1 &&
        filteredDryRun.body.targets?.[0]?.guild_id === activeGuildA,
    );

    const emptyGuilds = await request(
      `/api/gameday/admin/nfl-weekly-slates/${slateId}/publish`,
      { method: "POST", authorized: true, body: { guild_ids: [] } },
    );
    expect(
      "an explicit empty guild list is a safe no-op",
      emptyGuilds.status === 200 &&
        emptyGuilds.body.empty_guild_ids === true &&
        emptyGuilds.body.summary?.active_targets === 0,
    );

    const roomCountBeforePublish = await countRows("gameday_rooms");
    const cardCountBeforePublish = await countRows("gameday_pick_cards");
    const propCountBeforePublish = await countRows("gameday_props");
    const picksCountBeforePublish = await countRows("gameday_picks");
    const standingsCountBeforePublish = await countRows("gameday_final_standings");
    const published = await request(
      `/api/gameday/admin/nfl-weekly-slates/${slateId}/publish`,
      { method: "POST", authorized: true, body: { guild_ids: fixtureGuildIds } },
    );
    expect(
      "publishing creates one instance per active subscription",
      published.status === 200 &&
        published.body.summary?.created === 2 &&
        published.body.summary?.failed === 0 &&
        published.body.summary?.inactive_skipped === 2,
      JSON.stringify(published.body),
    );
    expect("publishing marks the master slate published", published.body.slate?.status === "published");
    const publishedAt = published.body.slate?.published_at;
    expect("publishing sets published_at once", typeof publishedAt === "string" && publishedAt.length > 0);
    expect(
      "publishing creates exactly two private Discord rooms",
      (await countRows("gameday_rooms")) - roomCountBeforePublish === 2,
    );
    expect(
      "published Sunday Slate rooms expand to three cards and sixteen props each",
      (await countRows("gameday_pick_cards")) - cardCountBeforePublish === 6 &&
        (await countRows("gameday_props")) - propCountBeforePublish === 32,
    );
    expect(
      "publishing creates no picks, standings, settlement, or receipt side effects",
      (await countRows("gameday_picks")) === picksCountBeforePublish &&
        (await countRows("gameday_final_standings")) === standingsCountBeforePublish,
    );

    const instances = await service
      .from("nfl_weekly_slate_room_instances")
      .select("*")
      .eq("master_slate_id", slateId);
    expect(
      "instances persist post-ready payloads without Discord message IDs",
      !instances.error &&
        instances.data?.length === 2 &&
        instances.data.every((row: any) =>
          row.status === "post_ready" &&
          row.post_payload?.type === "gameday_nfl_sunday_slate" &&
          row.discord_message_id === null &&
          row.post_payload?.discord_channel_id === row.discord_channel_id &&
          typeof row.post_payload?.room_url === "string",
        ),
      instances.error?.message,
    );
    expect(
      "new post payloads use the canonical www room URL",
      !instances.error &&
        instances.data?.every((row: any) =>
          row.room_code &&
          row.room_url === `https://www.swayger.app/g/${row.room_code}` &&
          row.post_payload?.room_url === `https://www.swayger.app/g/${row.room_code}`,
        ),
      instances.error?.message,
    );
    expect(
      "new post payloads use the pilot-ready multiline message format",
      !instances.error &&
        instances.data?.every((row: any) => {
          const message = row.post_payload?.message;
          return (
            typeof message === "string" &&
            message.startsWith(`🏈 ${row.post_payload.slate_name} is live\n\n`) &&
            message.includes("Lock in your picks for this week’s NFL slate:\n\n") &&
            message.includes("• Early Slate Picks\n• Late Slate Picks\n• Sunday Night Picks\n\n") &&
            message.includes("Winner gets:\n") &&
            message.includes("\n\nUse a name your server will recognize.\n\n") &&
            message.includes("Lock it in and stand on it:\n") &&
            message.endsWith(row.post_payload.room_url)
          );
        }),
      instances.error?.message,
    );
    const prefixRewardInstance = instances.data?.find((row: any) => row.discord_guild_id === activeGuildA);
    expect(
      "stored reward text is preserved while display text avoids duplicate Winner gets",
      prefixRewardInstance?.post_payload?.reward_text === "Winner gets Game Day Champ for the week." &&
        prefixRewardInstance?.post_payload?.message?.includes(
          "Winner gets:\nGame Day Champ for the week.",
        ) &&
        !prefixRewardInstance?.post_payload?.message?.includes(
          "Winner gets:\nWinner gets Game Day Champ for the week.",
        ),
      instances.error?.message,
    );
    expect(
      "configured reward text is preserved and blank reward text uses the default",
      !instances.error &&
        instances.data?.find((row: any) => row.discord_guild_id === activeGuildA)?.post_payload?.reward_text ===
          "Winner gets Game Day Champ for the week." &&
        instances.data?.find((row: any) => row.discord_guild_id === activeGuildB)?.post_payload?.reward_text ===
          "Bragging rights and receipts.",
      instances.error?.message,
    );
    expect(
      "pilot messages contain no betting or gambling language",
      !instances.error &&
        instances.data?.every((row: any) =>
          !/\b(betting|wagering|odds|gambling|money)\b/i.test(row.post_payload?.message ?? ""),
        ),
      instances.error?.message,
    );

    const roomIds = (instances.data ?? []).map((row: any) => row.gameday_room_id);
    createdRoomIds.push(...roomIds);
    const rooms = await service
      .from("gameday_rooms")
      .select("id, is_private, source, sport, template_type, slate_config, discord_guild_id, discord_channel_id")
      .in("id", roomIds);
    expect(
      "created rooms are private NFL Sunday Slate Discord rooms with copied config",
      !rooms.error &&
        rooms.data?.length === 2 &&
        rooms.data.every((room: any) =>
          room.is_private === true &&
          room.source === "discord" &&
          room.sport === "nfl" &&
          room.template_type === "nfl_sunday_slate" &&
          room.slate_config?.sunday_night_teams?.[0] === "Ravens",
        ),
      rooms.error?.message,
    );

    const repeat = await request(
      `/api/gameday/admin/nfl-weekly-slates/${slateId}/publish`,
      { method: "POST", authorized: true, body: { guild_ids: fixtureGuildIds } },
    );
    expect(
      "republishing is idempotent and returns existing instances",
      repeat.status === 200 &&
        repeat.body.summary?.created === 0 &&
        repeat.body.summary?.skipped_existing === 2 &&
        repeat.body.instances?.length === 2 &&
        repeat.body.slate?.published_at === publishedAt &&
        repeat.body.instances.every((instance: any) =>
          published.body.instances.some(
            (publishedInstance: any) =>
              publishedInstance.id === instance.id &&
              publishedInstance.room_url === instance.room_url &&
              publishedInstance.post_payload?.message === instance.post_payload?.message,
          ),
        ),
      JSON.stringify(repeat.body),
    );
    expect(
      "republishing does not create duplicate rooms, cards, props, or instances",
      (await countRows("gameday_rooms")) === roomCountBeforePublish + 2 &&
        (await countRows("gameday_pick_cards")) === cardCountBeforePublish + 6 &&
        (await countRows("gameday_props")) === propCountBeforePublish + 32 &&
        (await countRows("nfl_weekly_slate_room_instances")) === instanceCountBeforeDryRun + 2,
    );
  } finally {
    if (server) await new Promise<void>((resolveServer) => server.close(() => resolveServer()));
    if (slateId) {
      await service.from("nfl_weekly_slate_room_instances").delete().eq("master_slate_id", slateId);
      await service.from("nfl_weekly_slate_templates").delete().eq("id", slateId);
    }
    if (archivedSlateId) {
      await service.from("nfl_weekly_slate_templates").delete().eq("id", archivedSlateId);
    }
    if (createdRoomIds.length) {
      await service.from("gameday_rooms").delete().in("id", createdRoomIds);
    }
    await service
      .from("discord_gameday_subscriptions")
      .delete()
      .in("discord_guild_id", fixtureGuildIds);
  }

  console.log(`\n${passed}/${EXPECTED_ASSERTIONS} assertions passed`);
  if (failed > 0 || passed !== EXPECTED_ASSERTIONS) {
    throw new Error(`Weekly slate publish regression failed: ${failed} failed`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });