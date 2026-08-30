/**
 * Disposable live integration coverage for the bot-authenticated NFL weekly
 * slate delivery API.
 *
 * Prerequisites:
 *   - apply supabase/gameday-nfl-weekly-slate-room-instances.sql
 *   - configure the Task #56 weekly slate publishing schema
 *
 * Run: npx tsx server/test-gameday-nfl-weekly-slate-bot-delivery.ts
 */

import * as dotenv from "dotenv";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

let passed = 0;
let failed = 0;
const EXPECTED_ASSERTIONS = 34;

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
  const adminToken = process.env.MM_ADMIN_TOKEN;
  if (!supabaseUrl || !serviceKey || !anonKey || !botKey || !adminToken) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_SUPABASE_ANON_KEY, GAMEDAY_BOT_API_KEY, and MM_ADMIN_TOKEN are required",
    );
  }

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = unique("weekly-delivery");
  const guildA = `DELIVERY_GUILD_A_${runId}`;
  const guildB = `DELIVERY_GUILD_B_${runId}`;
  const seasonYear = 5000 + Math.floor(Math.random() * 1000);
  const roomIds: string[] = [];
  let slateId: string | null = null;
  let instanceAId: string | null = null;
  let instanceBId: string | null = null;

  const { registerGamedayRoutes } = await import("./routes-gameday");
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  registerGamedayRoutes(app);
  let server: Server | null = null;

  try {
    server = await new Promise<Server>((resolve) => {
      const created = app.listen(0, "127.0.0.1", () => resolve(created));
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    async function request(
      path: string,
      options: {
        method?: string;
        bot?: boolean;
        admin?: boolean;
        apiKey?: string;
        body?: Record<string, unknown>;
      } = {},
    ): Promise<ApiResponse> {
      const headers: Record<string, string> = {};
      if (options.bot) headers["x-api-key"] = botKey!;
      if (options.apiKey) headers["x-api-key"] = options.apiKey;
      if (options.admin) headers["x-admin-token"] = adminToken!;
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

    const subscriptions = [
      {
        discord_guild_id: guildA,
        discord_guild_name: "Delivery Guild A",
        game_day_channel_id: `CHANNEL_A_${runId}`,
        game_day_channel_name: "game-day-a",
        receipt_channel_id: `RECEIPTS_A_${runId}`,
        receipt_channel_name: "receipts-a",
        reward_text: "Guild A bragging rights.",
        status: "active",
      },
      {
        discord_guild_id: guildB,
        discord_guild_name: "Delivery Guild B",
        game_day_channel_id: `CHANNEL_B_${runId}`,
        game_day_channel_name: "game-day-b",
        receipt_channel_id: null,
        receipt_channel_name: null,
        reward_text: "Guild B bragging rights.",
        status: "active",
      },
    ];
    const { error: subscriptionError } = await service
      .from("discord_gameday_subscriptions")
      .insert(subscriptions);
    if (subscriptionError) throw subscriptionError;

    const candidates = {
      early_matchups: ["Bears vs Packers"],
      late_matchups: ["Chiefs vs Raiders"],
      sunday_night_teams: ["Ravens", "Bills"],
      qb_candidates: ["Lamar Jackson", "Josh Allen"],
      rb_candidates: ["Derrick Henry", "Saquon Barkley"],
      receiver_candidates: ["Justin Jefferson", "CeeDee Lamb"],
      team_candidates: ["Bears", "Packers"],
      game_candidates: ["Bears vs Packers", "Chiefs vs Raiders"],
    };
    const created = await request("/api/gameday/admin/nfl-weekly-slates", {
      method: "POST",
      admin: true,
      body: {
        season_year: seasonYear,
        week_number: 1,
        slate_name: `Delivery API ${runId}`,
        ...candidates,
      },
    });
    slateId = created.body.slate?.id ?? null;
    expect("delivery fixture master slate is created", created.status === 201 && !!slateId);

    const approved = await request(
      `/api/gameday/admin/nfl-weekly-slates/${slateId}/approve`,
      { method: "POST", admin: true },
    );
    expect("delivery fixture master slate is approved", approved.status === 200);

    const published = await request(
      `/api/gameday/admin/nfl-weekly-slates/${slateId}/publish`,
      {
        method: "POST",
        admin: true,
        body: { guild_ids: [guildA, guildB] },
      },
    );
    const publishedInstances = published.body.instances ?? [];
    for (const instance of publishedInstances) {
      roomIds.push(instance.gameday_room_id);
      if (instance.discord_guild_id === guildA) instanceAId = instance.id;
      if (instance.discord_guild_id === guildB) instanceBId = instance.id;
    }
    expect(
      "publish fixture creates two post-ready instances",
      published.status === 200 &&
        publishedInstances.length === 2 &&
        publishedInstances.every((instance: any) => instance.status === "post_ready") &&
        !!instanceAId &&
        !!instanceBId,
      JSON.stringify(published.body),
    );

    const { error: anonError } = await anon
      .from("nfl_weekly_slate_room_instances")
      .select("id")
      .limit(1);
    expect("anonymous browser access to delivery instances remains blocked", !!anonError);

    const fetchPath = "/api/gameday/bot/nfl-weekly-slate-room-instances/post-ready";
    const missingFetchAuth = await request(fetchPath);
    expect("fetch rejects a missing bot key", missingFetchAuth.status === 401);
    const wrongFetchAuth = await request(fetchPath, { apiKey: "wrong-key" });
    expect("fetch rejects a wrong bot key", wrongFetchAuth.status === 401);

    const fetched = await request(`${fetchPath}?master_slate_id=${slateId}`, { bot: true });
    expect(
      "fetch returns only the two post-ready fixture instances",
      fetched.status === 200 &&
        fetched.body.count === 2 &&
        fetched.body.instances.every((instance: any) => instance.status === "post_ready"),
      JSON.stringify(fetched.body),
    );
    expect(
      "fetch includes the documented payload and guild fields",
      fetched.body.instances.every(
        (instance: any) =>
          instance.id &&
          instance.master_slate_id === slateId &&
          instance.gameday_room_id &&
          instance.room_code &&
          instance.room_url &&
          instance.discord_guild_id &&
          instance.discord_guild_name &&
          instance.discord_channel_id &&
          instance.post_payload?.message &&
          instance.created_at &&
          instance.updated_at,
      ),
    );
    expect(
      "the bot key alone authorizes fetch without the admin token",
      fetched.status === 200 && fetched.body.ok === true,
    );

    const masterFiltered = await request(
      `${fetchPath}?master_slate_id=${slateId}`,
      { bot: true },
    );
    expect(
      "fetch filters by master_slate_id",
      masterFiltered.status === 200 &&
        masterFiltered.body.instances.every((instance: any) => instance.master_slate_id === slateId),
    );
    const guildFiltered = await request(
      `${fetchPath}?discord_guild_id=${encodeURIComponent(guildA)}`,
      { bot: true },
    );
    expect(
      "fetch filters by discord_guild_id",
      guildFiltered.status === 200 &&
        guildFiltered.body.count === 1 &&
        guildFiltered.body.instances[0]?.discord_guild_id === guildA,
    );
    const limited = await request(
      `${fetchPath}?master_slate_id=${slateId}&limit=1`,
      { bot: true },
    );
    expect("fetch respects limit", limited.status === 200 && limited.body.count === 1);
    const invalidLimit = await request(`${fetchPath}?limit=101`, { bot: true });
    expect("fetch rejects limits above 100", invalidLimit.status === 400);

    const postedPath = `/api/gameday/bot/nfl-weekly-slate-room-instances/${instanceAId}/posted`;
    const failedAPath = `/api/gameday/bot/nfl-weekly-slate-room-instances/${instanceAId}/failed`;
    const failedBPath = `/api/gameday/bot/nfl-weekly-slate-room-instances/${instanceBId}/failed`;
    const postedBPath = `/api/gameday/bot/nfl-weekly-slate-room-instances/${instanceBId}/posted`;
    const missingPostedAuth = await request(postedPath, {
      method: "POST",
      body: { discord_message_id: `MESSAGE_A_${runId}` },
    });
    expect("mark posted rejects a missing bot key", missingPostedAuth.status === 401);
    const wrongPostedAuth = await request(postedPath, {
      method: "POST",
      apiKey: "wrong-key",
      body: { discord_message_id: `MESSAGE_A_${runId}` },
    });
    expect("mark posted rejects a wrong bot key", wrongPostedAuth.status === 401);
    const missingMessageId = await request(postedPath, {
      method: "POST",
      bot: true,
      body: {},
    });
    expect("mark posted requires discord_message_id", missingMessageId.status === 400);

    const discordMessageId = `MESSAGE_A_${runId}`;
    const posted = await request(postedPath, {
      method: "POST",
      bot: true,
      body: { discord_message_id: discordMessageId },
    });
    expect("mark posted succeeds for a post-ready instance", posted.status === 200);
    expect(
      "mark posted stores the Discord message ID",
      posted.body.instance?.discord_message_id === discordMessageId,
    );
    expect("mark posted sets posted_at", typeof posted.body.instance?.posted_at === "string");
    expect("mark posted changes status to posted", posted.body.instance?.status === "posted");

    const postedTwice = await request(postedPath, {
      method: "POST",
      bot: true,
      body: { discord_message_id: `REPLACEMENT_${runId}` },
    });
    expect(
      "mark posted cannot be applied twice or overwrite the message ID",
      postedTwice.status === 409 && postedTwice.body.status === "posted",
    );
    const failedAfterPosted = await request(failedAPath, {
      method: "POST",
      bot: true,
      body: { post_error: "Should not overwrite posted state" },
    });
    expect(
      "mark failed cannot be applied after posted",
      failedAfterPosted.status === 409 && failedAfterPosted.body.status === "posted",
    );
    const afterPostedFetch = await request(
      `${fetchPath}?discord_guild_id=${encodeURIComponent(guildA)}`,
      { bot: true },
    );
    expect("fetch does not return posted instances", afterPostedFetch.body.count === 0);

    const missingFailedAuth = await request(failedBPath, {
      method: "POST",
      body: { post_error: "Missing auth" },
    });
    expect("mark failed rejects a missing bot key", missingFailedAuth.status === 401);
    const wrongFailedAuth = await request(failedBPath, {
      method: "POST",
      apiKey: "wrong-key",
      body: { post_error: "Wrong auth" },
    });
    expect("mark failed rejects a wrong bot key", wrongFailedAuth.status === 401);
    const tooLongError = await request(failedBPath, {
      method: "POST",
      bot: true,
      body: { post_error: "x".repeat(2001) },
    });
    expect("mark failed bounds post_error to 2000 characters", tooLongError.status === 400);

    const postError = "Missing Discord channel permission";
    const markedFailed = await request(failedBPath, {
      method: "POST",
      bot: true,
      body: { post_error: postError },
    });
    expect("mark failed succeeds for a post-ready instance", markedFailed.status === 200);
    expect("mark failed stores post_error", markedFailed.body.instance?.post_error === postError);
    expect("mark failed changes status to failed", markedFailed.body.instance?.status === "failed");

    const postedAfterFailed = await request(postedBPath, {
      method: "POST",
      bot: true,
      body: { discord_message_id: `MESSAGE_B_${runId}` },
    });
    expect(
      "mark posted cannot be applied after failed",
      postedAfterFailed.status === 409 && postedAfterFailed.body.status === "failed",
    );
    const failedTwice = await request(failedBPath, {
      method: "POST",
      bot: true,
      body: { post_error: "Replacement error" },
    });
    expect(
      "mark failed cannot be applied twice",
      failedTwice.status === 409 && failedTwice.body.status === "failed",
    );
    const finalFetch = await request(
      `${fetchPath}?master_slate_id=${slateId}`,
      { bot: true },
    );
    expect(
      "fetch does not return failed instances",
      finalFetch.status === 200 && finalFetch.body.count === 0,
    );

    const { count: roomCountAfter } = await service
      .from("gameday_rooms")
      .select("id", { count: "exact", head: true })
      .in("id", roomIds);
    expect(
      "delivery API creates no additional rooms",
      roomIds.length === 2 && roomCountAfter === 2,
    );

    const { data: storedRows } = await service
      .from("nfl_weekly_slate_room_instances")
      .select("id, status, discord_message_id, posted_at, error")
      .in("id", [instanceAId!, instanceBId!]);
    const storedA = storedRows?.find((row) => row.id === instanceAId);
    const storedB = storedRows?.find((row) => row.id === instanceBId);
    expect(
      "compare-and-set transitions persist the final delivery states",
      storedA?.status === "posted" &&
        storedA.discord_message_id === discordMessageId &&
        !!storedA.posted_at &&
        storedB?.status === "failed" &&
        storedB.error === postError,
    );
  } finally {
    if (roomIds.length > 0) {
      await service.from("gameday_rooms").delete().in("id", roomIds);
    }
    if (slateId) {
      await service.from("nfl_weekly_slate_room_instances").delete().eq("master_slate_id", slateId);
      await service.from("nfl_weekly_slate_templates").delete().eq("id", slateId);
    }
    await service
      .from("discord_gameday_subscriptions")
      .delete()
      .in("discord_guild_id", [guildA, guildB]);
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  console.log(`\n${passed}/${EXPECTED_ASSERTIONS} assertions passed`);
  if (passed + failed !== EXPECTED_ASSERTIONS) {
    throw new Error(
      `Expected ${EXPECTED_ASSERTIONS} assertions, but recorded ${passed + failed}`,
    );
  }
  if (failed > 0) {
    throw new Error(`NFL weekly slate bot delivery regression failed: ${failed} failed`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });