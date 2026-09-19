/**
 * Database-backed Pick Card Creator V2 bonus contract validation.
 *
 * Run with: npm run test:gameday:madden-bonus-v2
 */

import express from "express";
import { createClient } from "@supabase/supabase-js";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

let passed = 0;
let failed = 0;

function expect(label: string, value: unknown, detail = "") {
  if (value) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const unique = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function main() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Required Supabase configuration is unavailable");
  }

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = unique("madden-bonus-v2");
  const botApiKey = unique("bonus-v2-key");
  const guildId = `BONUS_V2_GUILD_${runId}`;
  process.env.GAMEDAY_BOT_API_KEY = botApiKey;
  process.env.MADDEN_PUBLIC_PICK_EVENTS_ENABLED = "true";

  const { registerGamedayRoutes } = await import(
    `${process.cwd()}/server/routes-gameday.ts`
  );
  const app = express();
  app.use(express.json());
  registerGamedayRoutes(app);

  let server: Server | null = null;
  let roomId: string | null = null;
  try {
    server = await new Promise<Server>((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const request = async (
      path: string,
      opts: {
        method?: string;
        apiKey?: string;
        guild?: string;
        guest?: string;
        body?: unknown;
      } = {},
    ) => {
      const headers: Record<string, string> = {};
      if (opts.apiKey) headers["x-api-key"] = opts.apiKey;
      if (opts.guild) headers["x-discord-guild-id"] = opts.guild;
      if (opts.guest) headers["x-guest-session"] = opts.guest;
      if (opts.body !== undefined) headers["content-type"] = "application/json";
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
    const operator = {
      apiKey: botApiKey,
      guild: guildId,
    };

    const created = await request("/api/gameday/rooms", {
      method: "POST",
      ...operator,
      body: {
        room_name: `Packers Franchise Pick Card ${runId}`,
        sport: "madden",
        template_type: "weekly_pick_card",
        discord_guild_id: guildId,
        discord_channel_id: `BONUS_V2_CHANNEL_${runId}`,
        discord_user_id: `BONUS_V2_USER_${runId}`,
        format_config: {
          week_label: "Week 7",
          reward_text: "+2 attribute points",
          deadline_display_text: "Before kickoff",
          minimum_matchups: 2,
          scoring_mode: "all_correct",
          bonus: {
            enabled: true,
            game: {
              team_a: "Packers",
              team_b: "Lions",
              line_text: "Packers -1.5",
            },
            total_prediction: {
              enabled: true,
              prompt: "Total points in the Bonus Game?",
              rule: "exact",
            },
          },
        },
        matchups: [
          { team_a: "Chiefs", team_b: "Raiders", line_text: "Chiefs -3.5" },
          { team_a: "Bills", team_b: "Jets", line_text: null },
        ],
      },
    });
    roomId = created.body.room_id ?? null;
    expect(
      "structured Pick Card V2 creation succeeds",
      created.status === 200 && created.body.ok === true && !!roomId,
      JSON.stringify(created.body),
    );
    if (!roomId) throw new Error("V2 room creation did not return a room ID");

    const roomRead = await request(`/api/gameday/rooms/${roomId}`);
    const card = roomRead.body.cards?.[0];
    const props = card?.gameday_props ?? [];
    const mainProps = props.filter((prop: any) => prop.prop_role === "main_matchup");
    const bonusGame = props.find((prop: any) => prop.prop_role === "bonus_game");
    const bonusTotal = props.find((prop: any) => prop.prop_role === "bonus_total");
    expect(
      "creation emits two main props, one bonus game, and one typed total",
      roomRead.status === 200 &&
        mainProps.length === 2 &&
        bonusGame?.answer_type === "choice" &&
        bonusGame?.answer_options?.[0] === "Packers" &&
        bonusGame?.answer_options?.[1] === "Lions" &&
        bonusTotal?.answer_type === "integer" &&
        bonusTotal?.numeric_min === 0 &&
        bonusTotal?.numeric_max === 200 &&
        Array.isArray(bonusTotal?.answer_options) &&
        bonusTotal.answer_options.length === 0,
      JSON.stringify(props),
    );
    expect(
      "normalized room config preserves structured bonus metadata",
      created.body.room?.format_config?.bonus?.game?.team_a === "Packers" &&
        created.body.room?.format_config?.bonus?.total_prediction?.rule === "exact",
      JSON.stringify(created.body.room?.format_config),
    );

    const participants: Array<{
      id: string;
      name: string;
      guest: string;
      main: string[];
      bonus: string;
      total: number;
    }> = [];
    for (const entry of [
      {
        name: "Main Perfect Bonus Split A",
        main: [mainProps[0].answer_options[0], mainProps[1].answer_options[0]],
        bonus: bonusGame.answer_options[1],
        total: 51,
      },
      {
        name: "Main Perfect Bonus Split B",
        main: [mainProps[0].answer_options[0], mainProps[1].answer_options[0]],
        bonus: bonusGame.answer_options[0],
        total: 50,
      },
      {
        name: "Main Miss Bonus Perfect",
        main: [mainProps[0].answer_options[1], mainProps[1].answer_options[0]],
        bonus: bonusGame.answer_options[0],
        total: 51,
      },
    ]) {
      const joined = await request(`/api/gameday/rooms/${roomId}/join`, {
        method: "POST",
        body: { display_name: `${entry.name} ${runId}` },
      });
      expect(
        `guest join succeeds for ${entry.name}`,
        joined.status === 200 &&
          !!joined.body.participant?.id &&
          !!joined.body.guest_session_id,
        JSON.stringify(joined.body),
      );
      participants.push({
        id: joined.body.participant.id,
        name: entry.name,
        guest: joined.body.guest_session_id,
        main: entry.main,
        bonus: entry.bonus,
        total: entry.total,
      });
    }

    for (const [label, body] of [
      ["numeric string", { numeric_answer: "51" }],
      ["decimal", { numeric_answer: 51.5 }],
      ["below range", { numeric_answer: -1 }],
      ["above range", { numeric_answer: 201 }],
      ["categorical answer", { selected_answer: "51" }],
    ] as const) {
      const invalid = await request(`/api/gameday/props/${bonusTotal.id}/pick`, {
        method: "POST",
        guest: participants[0].guest,
        body,
      });
      expect(
        `${label} is rejected for exact-total picks`,
        invalid.status === 400,
        JSON.stringify(invalid.body),
      );
    }

    for (const participant of participants) {
      const pickBodies = [
        { prop: mainProps[0], body: { selected_answer: participant.main[0] } },
        { prop: mainProps[1], body: { selected_answer: participant.main[1] } },
        { prop: bonusGame, body: { selected_answer: participant.bonus } },
        { prop: bonusTotal, body: { numeric_answer: participant.total } },
      ];
      for (const item of pickBodies) {
        const saved = await request(`/api/gameday/props/${item.prop.id}/pick`, {
          method: "POST",
          guest: participant.guest,
          body: item.body,
        });
        expect(
          `${participant.name} can save ${item.prop.prop_role}`,
          saved.status === 200 && saved.body.ok === true,
          JSON.stringify(saved.body),
        );
      }
    }

    const participantRead = await request(`/api/gameday/rooms/${roomId}`, {
      guest: participants[0].guest,
    });
    expect(
      "participant read exposes the typed prediction separately",
      participantRead.status === 200 &&
        participantRead.body.my_pick_details?.[bonusTotal.id]?.numeric_answer === 51 &&
        participantRead.body.my_pick_details?.[bonusTotal.id]?.selected_answer === "51",
      JSON.stringify(participantRead.body.my_pick_details),
    );
    const invalidRawChoiceShape = await service
      .from("gameday_picks")
      .update({ numeric_answer: 7 })
      .eq("participant_id", participants[0].id)
      .eq("prop_id", mainProps[0].id);
    expect(
      "database rejects a numeric value on a choice prop",
      !!invalidRawChoiceShape.error,
      JSON.stringify(invalidRawChoiceShape.error),
    );
    const invalidRawTotalRange = await service
      .from("gameday_picks")
      .update({ selected_answer: "201", numeric_answer: 201 })
      .eq("participant_id", participants[0].id)
      .eq("prop_id", bonusTotal.id);
    expect(
      "database rejects an out-of-range typed total",
      !!invalidRawTotalRange.error,
      JSON.stringify(invalidRawTotalRange.error),
    );

    const { data: publicEvents } = await service
      .from("gameday_madden_participation_events")
      .select("participant_id, event_type, submission_version, picks")
      .eq("room_id", roomId)
      .in("event_type", ["pick_card_picks_submitted", "pick_card_picks_updated"]);
    const firstEvent = (publicEvents ?? []).find(
      (event: any) => event.participant_id === participants[0].id,
    ) as any;
    const eventTotal = firstEvent?.picks?.find(
      (pick: any) => pick.prop_role === "bonus_total",
    );
    expect(
      "public-pick snapshot carries typed bonus metadata and numeric prediction",
      firstEvent?.event_type === "pick_card_picks_submitted" &&
        firstEvent?.submission_version === 1 &&
        eventTotal?.answer_type === "integer" &&
        eventTotal?.selected_option === null &&
        eventTotal?.numeric_prediction === 51,
      JSON.stringify(firstEvent),
    );

    const locked = await request(`/api/gameday/cards/${card.id}/lock`, {
      method: "PATCH",
      ...operator,
    });
    expect("operator can lock the V2 card", locked.status === 200, JSON.stringify(locked.body));

    for (const body of [
      { actual_total: "51" },
      { actual_total: 51.5 },
      { actual_total: -1 },
      { actual_total: 201 },
    ]) {
      const invalid = await request(`/api/gameday/props/${bonusTotal.id}/settle`, {
        method: "PATCH",
        ...operator,
        body,
      });
      expect(
        `invalid actual total ${JSON.stringify(body.actual_total)} is rejected`,
        invalid.status === 400,
        JSON.stringify(invalid.body),
      );
    }

    for (const settlement of [
      { prop: mainProps[0], body: { correct_answer: mainProps[0].answer_options[0] } },
      { prop: mainProps[1], body: { correct_answer: mainProps[1].answer_options[0] } },
      { prop: bonusGame, body: { correct_answer: bonusGame.answer_options[0] } },
    ]) {
      const settled = await request(`/api/gameday/props/${settlement.prop.id}/settle`, {
        method: "PATCH",
        ...operator,
        body: settlement.body,
      });
      expect(
        `${settlement.prop.prop_role} settles through the shared endpoint`,
        settled.status === 200 && settled.body.ok === true,
        JSON.stringify(settled.body),
      );
    }
    await service
      .from("gameday_picks")
      .update({ is_correct: null })
      .eq("participant_id", participants[0].id)
      .eq("prop_id", mainProps[0].id);
    const repeatedMain = await request(
      `/api/gameday/props/${mainProps[0].id}/settle`,
      {
        method: "PATCH",
        ...operator,
        body: { correct_answer: mainProps[0].answer_options[0] },
      },
    );
    const repairedMainPick = await service
      .from("gameday_picks")
      .select("is_correct")
      .eq("participant_id", participants[0].id)
      .eq("prop_id", mainProps[0].id)
      .single();
    expect(
      "same-answer choice retry repairs stale score state without a correction event",
      repeatedMain.status === 200 &&
        repeatedMain.body.corrected === false &&
        repeatedMain.body.participants_updated === 0 &&
        repairedMainPick.data?.is_correct === true,
      JSON.stringify({ repeatedMain: repeatedMain.body, repairedMainPick }),
    );

    const initialTotal = await request(`/api/gameday/props/${bonusTotal.id}/settle`, {
      method: "PATCH",
      ...operator,
      body: { actual_total: 52 },
    });
    await service
      .from("gameday_picks")
      .update({ is_correct: null })
      .eq("participant_id", participants[0].id)
      .eq("prop_id", bonusTotal.id);
    const repeatedTotal = await request(`/api/gameday/props/${bonusTotal.id}/settle`, {
      method: "PATCH",
      ...operator,
      body: { actual_total: 52 },
    });
    const repairedTotalPick = await service
      .from("gameday_picks")
      .select("is_correct")
      .eq("participant_id", participants[0].id)
      .eq("prop_id", bonusTotal.id)
      .single();
    const correctedTotal = await request(`/api/gameday/props/${bonusTotal.id}/settle`, {
      method: "PATCH",
      ...operator,
      body: { actual_total: 51 },
    });
    expect(
      "exact-total settlement is idempotent for the same result",
      initialTotal.status === 200 &&
        initialTotal.body.corrected === false &&
        repeatedTotal.status === 200 &&
        repeatedTotal.body.corrected === false &&
        repeatedTotal.body.participants_updated === 0 &&
        repairedTotalPick.data?.is_correct === false,
      JSON.stringify({
        initialTotal: initialTotal.body,
        repeatedTotal: repeatedTotal.body,
        repairedTotalPick,
      }),
    );
    expect(
      "exact-total correction re-scores submitted numeric predictions",
      correctedTotal.status === 200 &&
        correctedTotal.body.corrected === true &&
        correctedTotal.body.actual_total === 51 &&
        correctedTotal.body.participants_updated === 3 &&
        correctedTotal.body.all_settled === true,
      JSON.stringify(correctedTotal.body),
    );

    const finalized = await request(`/api/gameday/rooms/${roomId}/finalize`, {
      method: "PATCH",
      ...operator,
    });
    expect(
      "V2 room finalizes after main and bonus outcomes settle",
      finalized.status === 200 && finalized.body.ok === true,
      JSON.stringify(finalized.body),
    );

    const finalStandings = await request(
      `/api/gameday/rooms/${roomId}/final-standings`,
    );
    const standings = finalStandings.body.leaderboard ?? [];
    const first = standings.find(
      (row: any) => row.participant_id === participants[0].id,
    );
    const second = standings.find(
      (row: any) => row.participant_id === participants[1].id,
    );
    const third = standings.find(
      (row: any) => row.participant_id === participants[2].id,
    );
    expect(
      "main-only winner semantics produce the expected tie",
      finalStandings.status === 200 &&
        finalStandings.body.finalized === true &&
        first?.correct_picks === 2 &&
        first?.total_picks === 2 &&
        first?.is_winner === true &&
        second?.correct_picks === 2 &&
        second?.is_winner === true &&
        third?.correct_picks === 1 &&
        third?.is_winner === false &&
        finalStandings.body.tie === true &&
        finalStandings.body.winner_participant_ids?.length === 2,
      JSON.stringify(finalStandings.body),
    );
    expect(
      "bonus outcomes are returned separately without changing main scores",
      first?.bonus_game_correct === false &&
        first?.exact_total_hit === true &&
        second?.bonus_game_correct === true &&
        second?.exact_total_hit === false &&
        third?.bonus_game_correct === true &&
        third?.exact_total_hit === true &&
        finalStandings.body.bonus?.game?.correct_answer === "Packers" &&
        finalStandings.body.bonus?.total?.actual_total === 51 &&
        finalStandings.body.total_main_props === 2 &&
        finalStandings.body.total_props === 4,
      JSON.stringify(finalStandings.body),
    );
  } finally {
    if (roomId) {
      await service.from("gameday_rooms").delete().eq("id", roomId);
    }
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  }

  console.log(`\nMADDEN BONUS V2 E2E: ${passed}/${passed + failed} assertions passed`);
  if (failed) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });