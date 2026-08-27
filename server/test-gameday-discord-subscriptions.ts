/**
 * Disposable integration coverage for Discord NFL Sunday Slate subscriptions.
 * It exercises the real bot-authenticated routes and direct anon-table access,
 * then removes the subscription fixture when finished.
 *
 * Prerequisite: apply
 * supabase/gameday-discord-nfl-slate-subscriptions-migration.sql
 *
 * Run: npx tsx server/test-gameday-discord-subscriptions.ts
 */

import * as dotenv from "dotenv";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";

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

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = unique("gameday-subscription");
  const guildId = `SUBSCRIPTION_GUILD_${runId}`;
  const otherGuildId = `OTHER_GUILD_${runId}`;

  const { registerGamedayRoutes } = await import("./routes-gameday");
  const app = express();
  app.use(express.json());
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
        guildId?: string;
        body?: Record<string, unknown>;
      } = {},
    ): Promise<ApiResponse> {
      const headers: Record<string, string> = {};
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

    const endpoint = "/api/gameday/discord/subscriptions/nfl-slate";
    const initialConfig = {
      discord_guild_id: guildId,
      discord_guild_name: "Subscription Test Guild",
      game_day_channel_id: `GAME_DAY_CHANNEL_${runId}`,
      game_day_channel_name: "game-day",
      receipt_channel_id: `RECEIPT_CHANNEL_${runId}`,
      receipt_channel_name: "receipts",
      reward_text: "Winner gets bragging rights.",
      configured_by_discord_user_id: `DISCORD_USER_${runId}`,
      configured_by_discord_user_name: "Pilot Admin",
    };

    const unauthenticated = await request(endpoint, {
      method: "POST",
      body: initialConfig,
    });
    expect(
      "subscription write requires the Game Day bot credential",
      unauthenticated.status === 401,
      JSON.stringify(unauthenticated.body),
    );

    const wrongKey = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "x-api-key": "wrong-key", "Content-Type": "application/json" },
      body: JSON.stringify(initialConfig),
    });
    expect("an invalid bot credential is rejected", wrongKey.status === 401);

    const missingGuild = await request(endpoint, {
      method: "POST",
      bot: true,
      body: { game_day_channel_id: "CHANNEL", game_day_channel_name: "game-day" },
    });
    expect("subscription write requires a guild ID", missingGuild.status === 400);

    const missingChannel = await request(endpoint, {
      method: "POST",
      bot: true,
      body: { discord_guild_id: guildId },
    });
    expect("subscription write requires the Game Day channel", missingChannel.status === 400);

    const mismatchedGuildHeader = await request(endpoint, {
      method: "POST",
      bot: true,
      guildId: otherGuildId,
      body: initialConfig,
    });
    expect(
      "a conflicting guild header cannot override the request guild",
      mismatchedGuildHeader.status === 400,
    );

    const invalidStatus = await request(endpoint, {
      method: "POST",
      bot: true,
      body: { ...initialConfig, status: "enabled" },
    });
    expect("subscription status is limited to active, paused, or disabled", invalidStatus.status === 400);

    const receiptNameWithoutId = await request(endpoint, {
      method: "POST",
      bot: true,
      body: { ...initialConfig, receipt_channel_id: null },
    });
    expect(
      "a receipt channel name cannot be stored without its channel ID",
      receiptNameWithoutId.status === 400,
    );

    const created = await request(endpoint, {
      method: "POST",
      bot: true,
      body: initialConfig,
    });
    expect(
      "bot can create an active NFL Slate subscription",
      created.status === 200 &&
        created.body.ok === true &&
        created.body.subscription?.discord_guild_id === guildId &&
        created.body.subscription?.status === "active" &&
        created.body.subscription?.game_day_channel_id === initialConfig.game_day_channel_id &&
        created.body.subscription?.receipt_channel_id === initialConfig.receipt_channel_id &&
        created.body.subscription?.reward_text === initialConfig.reward_text,
      JSON.stringify(created.body),
    );
    const subscriptionId = created.body.subscription?.id as string | undefined;

    const serviceRow = await service
      .from("discord_gameday_subscriptions")
      .select("id, discord_guild_id, status, game_day_channel_id")
      .eq("discord_guild_id", guildId)
      .single();
    expect(
      "service-role storage contains one guild configuration",
      !serviceRow.error &&
        serviceRow.data?.id === subscriptionId &&
        serviceRow.data?.game_day_channel_id === initialConfig.game_day_channel_id,
      serviceRow.error?.message,
    );

    const missingGuildRead = await request(endpoint, { bot: true });
    expect("subscription read requires a guild boundary header", missingGuildRead.status === 400);

    const crossGuildRead = await request(endpoint, {
      bot: true,
      guildId: otherGuildId,
    });
    expect("a different guild cannot read this subscription", crossGuildRead.status === 404);

    const readBack = await request(endpoint, {
      bot: true,
      guildId,
    });
    expect(
      "bot can read the subscription for its own guild",
      readBack.status === 200 &&
        readBack.body.subscription?.id === subscriptionId &&
        readBack.body.subscription?.discord_guild_id === guildId,
      JSON.stringify(readBack.body),
    );

    const updated = await request(endpoint, {
      method: "POST",
      bot: true,
      guildId,
      body: {
        ...initialConfig,
        game_day_channel_id: `UPDATED_CHANNEL_${runId}`,
        game_day_channel_name: "updated-game-day",
        receipt_channel_id: null,
        receipt_channel_name: null,
        reward_text: null,
        status: "paused",
      },
    });
    expect(
      "repeating a guild write updates the existing row",
      updated.status === 200 &&
        updated.body.subscription?.id === subscriptionId &&
        updated.body.subscription?.status === "paused" &&
        updated.body.subscription?.game_day_channel_id === `UPDATED_CHANNEL_${runId}` &&
        updated.body.subscription?.receipt_channel_id === null &&
        updated.body.subscription?.reward_text === null,
      JSON.stringify(updated.body),
    );

    const serviceRows = await service
      .from("discord_gameday_subscriptions")
      .select("id")
      .eq("discord_guild_id", guildId);
    expect(
      "guild uniqueness prevents duplicate subscription rows",
      !serviceRows.error && serviceRows.data?.length === 1,
      serviceRows.error?.message,
    );

    const disabled = await request(endpoint, {
      method: "POST",
      bot: true,
      body: {
        ...initialConfig,
        receipt_channel_id: null,
        receipt_channel_name: null,
        reward_text: null,
        status: "disabled",
      },
    });
    expect(
      "bot can move the subscription to disabled",
      disabled.status === 200 && disabled.body.subscription?.status === "disabled",
      JSON.stringify(disabled.body),
    );

    const anonProbe = await anon
      .from("discord_gameday_subscriptions")
      .select("id")
      .eq("discord_guild_id", guildId);
    expect(
      "anon clients cannot directly read subscription configuration",
      !!anonProbe.error,
      anonProbe.error?.message,
    );
  } finally {
    await service
      .from("discord_gameday_subscriptions")
      .delete()
      .eq("discord_guild_id", guildId);
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  }

  const total = passed + failed;
  if (failed === 0 && passed === EXPECTED_ASSERTIONS) {
    console.log(`\n${EXPECTED_ASSERTIONS}/${EXPECTED_ASSERTIONS} assertions passed`);
  } else {
    console.error(
      `\nDiscord subscription gate failed: ${passed}/${total} assertions passed; expected ${EXPECTED_ASSERTIONS}/${EXPECTED_ASSERTIONS}`,
    );
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(
      "\nDiscord subscription suite failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });