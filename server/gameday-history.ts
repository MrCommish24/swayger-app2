import type { Express, Request, Response } from "express";
import type { getServiceSupabase } from "./supabase-service.js";
import { rankStandardGameDayStandings, standardGameDayScoringProps, type StandardStandingScore } from "./gameday-standard-standings.js";

type Db = ReturnType<typeof getServiceSupabase>;
type User = { id: string };
type Row = Record<string, any>;
type Dependencies = {
  getUser: (req: Request) => Promise<User | null>;
  getDb: () => Db;
  resolveRoomRef: (db: Db, roomRef: string) => Promise<string | null>;
  isRequiredProp: (prop: any) => boolean;
  buildMaddenScores: (participants: any[], picks: any[], props: any[]) => any[];
  rankMadden: (scores: any[], mode: "all_correct" | "most_correct", settled: boolean) => any[];
};

export function classifyGameDayHistory(
  roomStatus: string,
  playableProps: Array<{ status: string }>,
): "final" | "results_pending" | null {
  const allSettled = playableProps.length > 0 &&
    playableProps.every((prop) => prop.status === "settled");
  if (roomStatus === "finalized") return allSettled ? "final" : "results_pending";
  return playableProps.some((prop) => prop.status === "settled") ? "results_pending" : null;
}

const byOrder = (a: Row, b: Row) =>
  (a.display_order ?? 0) - (b.display_order ?? 0) ||
  String(a.id).localeCompare(String(b.id));

// PostgREST commonly caps a response at 1,000 rows. Do not silently omit
// older contests or picks for prolific participants.
async function readAllRows(build: () => any): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await build()
      .order("id", { ascending: true })
      .range(offset, offset + 499);
    if (error) throw error;
    const batch = (data ?? []) as Row[];
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}

async function loadOne(
  db: Db,
  participant: Row,
  room: Row,
  deps: Dependencies,
) {
  const [cards, participants] = await Promise.all([
    readAllRows(() => db.from("gameday_pick_cards")
      .select("id, title, phase, status, lock_label, display_order, gameday_props(id, question, answer_options, line_text, prop_role, answer_type, numeric_min, numeric_max, status, correct_answer, correct_answer_ids, correct_numeric_answer, display_order)")
      .eq("room_id", room.id)),
    readAllRows(() => db.from("gameday_participants")
      .select("id, display_name, is_guest")
      .eq("room_id", room.id)),
  ]);
  cards.sort(byOrder);
  const props = cards.flatMap((card: Row) => card.gameday_props ?? []);
  const playableProps = props.filter(deps.isRequiredProp);

  const participantIds = participants.map((row: Row) => row.id);
  const propIds = props.map((row: Row) => row.id);
  const allPicks = participantIds.length && propIds.length
    ? await readAllRows(() => db.from("gameday_picks")
      .select("id, participant_id, prop_id, selected_answer, numeric_answer, is_correct")
      .in("participant_id", participantIds)
      .in("prop_id", propIds))
    : [];
  const propById = new Map<string, Row>(props.map((prop: Row) => [prop.id, prop]));
  // Never trust a stored correctness flag as a reveal for an unsettled prop.
  const picks: Array<Row & { prop_id: string }> = allPicks.map((pick: Row) => ({
    participant_id: pick.participant_id,
    prop_id: pick.prop_id,
    selected_answer: pick.selected_answer,
    numeric_answer: pick.numeric_answer,
    is_correct: propById.get(pick.prop_id)?.status === "settled" ? pick.is_correct : null,
  }));
  const effectiveProps = standardGameDayScoringProps(room, cards, playableProps, picks);
  const state = classifyGameDayHistory(room.status, effectiveProps);
  if (!state) return null;
  const ownPicks = new Map<string, Row>(
    picks.filter((pick: Row) => pick.participant_id === participant.id)
      .map((pick: Row) => [pick.prop_id, pick]),
  );
  const isMadden = room.sport === "madden" && room.template_type === "weekly_pick_card";
  // A future custom format must not silently inherit the standard SP/winner
  // rule. Its picks remain readable, but its score and winner need a real rule.
  const unsupportedFormat = !isMadden &&
    (room.format_config != null || room.template_type === "weekly_pick_card");
  const scoringProps = isMadden
    ? playableProps.filter((prop: Row) => (prop.prop_role ?? "main_matchup") === "main_matchup")
    : effectiveProps;
  const scoringIds = new Set(scoringProps.map((prop: Row) => prop.id));
  const scoringSettled = scoringProps.length > 0 &&
    scoringProps.every((prop: Row) => prop.status === "settled");
  const mode = room.format_config?.scoring_mode === "most_correct" ? "most_correct" : "all_correct";
  const scores = isMadden
    ? deps.buildMaddenScores(participants, picks, playableProps)
    : participants.map((row: Row) => {
      const scoredPicks = picks.filter(
        (pick: Row) => pick.participant_id === row.id && scoringIds.has(pick.prop_id),
      );
      const correct = scoredPicks.filter((pick: Row) => pick.is_correct === true).length;
      return {
        participant_id: row.id,
        display_name: row.display_name,
        game_day_sp: correct * 10,
        correct_picks: correct,
        pending_picks: scoredPicks.filter((pick: Row) => pick.is_correct === null).length,
        total_picks: scoringProps.length,
        submitted_picks: scoredPicks.length,
      };
    });
  const winnerDetermined = state === "final" && scoringSettled && !unsupportedFormat;
  const standings = unsupportedFormat ? [] : isMadden
    ? deps.rankMadden(scores, mode, winnerDetermined)
    : rankStandardGameDayStandings(scores as StandardStandingScore[], winnerDetermined);
  const mine = (unsupportedFormat ? scores : standings).find((row: Row) => row.participant_id === participant.id);
  if (!mine) throw new Error("Game Day history participant was not found");

  return {
    room: {
      room_id: room.id,
      room_code: room.room_code ?? null,
      room_name: room.room_name,
      team_a_name: room.team_a_name ?? null,
      team_b_name: room.team_b_name ?? null,
      game_date: room.game_date ?? null,
      created_at: room.created_at,
      source: room.source ?? "app",
      community_context: room.source === "discord" ? "Discord" : null,
      sport: room.sport ?? null,
      template_type: room.template_type ?? null,
      status: room.status,
      archived: !!room.archived_at,
      is_private: !!room.is_private,
    },
    state,
    participant_count: participants.length,
    participant: {
      participant_id: participant.id,
      display_name: participant.display_name,
      game_day_sp: unsupportedFormat ? null : mine.game_day_sp,
      correct_picks: mine.correct_picks,
      pending_picks: mine.pending_picks,
      total_picks: mine.total_picks,
      submitted_picks: mine.submitted_picks,
      rank: state === "final" && !unsupportedFormat ? mine.rank : null,
      is_winner: state === "final" && !unsupportedFormat ? mine.is_winner : false,
    },
    scoring: {
      format: unsupportedFormat ? "unsupported_custom"
        : isMadden ? "madden_weekly_pick_card" : "standard_game_day",
      win_condition: unsupportedFormat ? null : isMadden ? mode : "most_correct_ties_share_first",
      unit: unsupportedFormat ? null : "SP",
      points_per_correct_main_pick: unsupportedFormat ? null : 10,
      scored_prop_count: scoringProps.length,
      all_scoring_props_settled: scoringSettled,
    },
    final_standings: state === "final" && !unsupportedFormat
      ? standings.map((row: Row) => ({
          participant_id: row.participant_id,
          display_name: row.display_name,
          game_day_sp: row.game_day_sp,
          correct_picks: row.correct_picks,
          pending_picks: row.pending_picks,
          total_picks: row.total_picks,
          submitted_picks: row.submitted_picks,
          rank: row.rank,
          is_winner: row.is_winner,
        }))
      : null,
    cards: cards.map((card: Row) => ({
      card_id: card.id,
      title: card.title,
      phase: card.phase,
      status: card.status,
      display_order: card.display_order,
      props: [...(card.gameday_props ?? [])].sort(byOrder).map((prop: Row) => {
        const pick = ownPicks.get(prop.id);
        const settled = prop.status === "settled";
        return {
          prop_id: prop.id,
          question: prop.question,
          answer_options: prop.answer_options ?? [],
          line_text: prop.line_text ?? null,
          prop_role: prop.prop_role ?? "main_matchup",
          answer_type: prop.answer_type ?? "choice",
          status: prop.status,
          correct_answers: settled ? {
            answer_ids: prop.correct_answer_ids?.length
              ? prop.correct_answer_ids
              : prop.correct_answer ? [prop.correct_answer] : [],
            numeric_answer: prop.correct_numeric_answer ?? null,
          } : null,
          own_pick: pick ? {
            selected_answer: pick.selected_answer ?? null,
            numeric_answer: pick.numeric_answer ?? null,
            outcome: !settled || pick.is_correct === null ? "pending"
              : pick.is_correct ? "correct" : "incorrect",
          } : null,
        };
      }),
    })),
  };
}

/** Read-only account history. Archived records are accessible only through the
 * caller's existing, verified account-linked participation. This never invokes
 * room resolution's join/redeem paths or the public archive-gated endpoints.
 */
export function registerGamedayHistoryRoutes(app: Express, deps: Dependencies) {
  const read = async (req: Request, res: Response, roomRef?: string) => {
    const user = await deps.getUser(req);
    if (!user) {
      res.status(401).json({ error: "Invalid or expired Supabase token" });
      return;
    }
    const db = deps.getDb();
    try {
      // Resolve a code without claiming ownership; the participant query below
      // is the only authorization gate. Unknown and unowned IDs both return 404.
      const roomId = roomRef ? await deps.resolveRoomRef(db, roomRef) : null;
      if (roomRef && !roomId) {
        res.status(404).json({ error: "History record not found" });
        return;
      }
      const owned = await readAllRows(() => {
        let query = db.from("gameday_participants")
          .select("id, room_id, display_name")
          .eq("user_id", user.id)
          .eq("is_guest", false);
        if (roomId) query = query.eq("room_id", roomId);
        return query;
      });
      if (roomRef && !owned.length) {
        res.status(404).json({ error: "History record not found" });
        return;
      }
      if (!owned.length) {
        res.json({ records: [] });
        return;
      }
      const rooms: Row[] = [];
      for (let offset = 0; offset < owned.length; offset += 100) {
        const roomIds = owned.slice(offset, offset + 100).map((row: Row) => row.room_id);
        const result = await db.from("gameday_rooms")
          .select("id, room_code, room_name, team_a_name, team_b_name, game_date, created_at, status, archived_at, is_private, source, sport, template_type, experience_type, format_config")
          .eq("experience_type", "game_day")
          .in("id", roomIds);
        if (result.error) throw result.error;
        rooms.push(...(result.data ?? []));
      }
      const roomById = new Map<string, Row>(rooms.map((room: Row) => [room.id, room]));
      const eligible = owned.filter((row: Row) => roomById.has(row.room_id));
      const loaded = [];
      for (let offset = 0; offset < eligible.length; offset += 5) {
        loaded.push(...await Promise.all(eligible.slice(offset, offset + 5)
          .map((row: Row) => loadOne(db, row, roomById.get(row.room_id)!, deps))));
      }
      const records = loaded.filter(Boolean).sort((a: any, b: any) =>
        String(b.room.created_at).localeCompare(String(a.room.created_at)) ||
        a.room.room_id.localeCompare(b.room.room_id),
      );
      if (roomRef) {
        if (!records.length) {
          res.status(404).json({ error: "History record not found" });
          return;
        }
        res.json({ record: records[0] });
      } else {
        res.json({ records });
      }
    } catch (error) {
      console.error("[gameday] history read error:", error);
      res.status(500).json({ error: "Could not load Game Day history" });
    }
  };
  app.get("/api/gameday/my-history", (req, res) => { void read(req, res); });
  app.get("/api/gameday/my-history/:roomRef", (req, res) => {
    void read(req, res, String(req.params.roomRef));
  });
}
