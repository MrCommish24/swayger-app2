import type { Express, Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import {
  NBA_PLAYOFF_TEMPLATE,
  DEFAULT_PROP_IDS,
  FIFA_TEMPLATE,
  FIFA_DEFAULT_PROP_IDS,
  NFL_TEMPLATE,
  NFL_DEFAULT_PROP_IDS,
  NFL_SUNDAY_SLATE_TEMPLATE,
  NFL_SUNDAY_SLATE_DEFAULT_PROP_IDS,
  resolvePlaceholders,
} from "./gameday-template.js";
import {
  buildGameDayBlastHtml,
  sendGameDayBlastEmail,
} from "./email.js";
import {
  buildEventKey,
  buildGroupKey,
  normalizeAnswerOption,
  mapNormalizedToStored,
  detectAmbiguousOptions,
  gameLabel,
  phaseLabel,
} from "./gameday-normalize.js";
import { settlePropCore } from "./gameday-settle-helper.js";
import { getServiceSupabase } from "./supabase-service.js";

// ── Global Settlement write-path feature flag ─────────────────────────────────
// Set GLOBAL_SETTLE_ENABLED=true in the server environment to enable the
// POST /api/admin/gameday/settle-group endpoint.
// Keep false (or unset) in production until Milestone 2 is approved and tested.
const GLOBAL_SETTLEMENT_WRITE_ENABLED = process.env.GLOBAL_SETTLE_ENABLED === "true";

// ── DB-backed idempotency for global settlement ───────────────────────────────
// Uses the gameday_settlement_operations table (migration 001).
// Falls back with a warning if the table does not yet exist.

/** First 16 hex chars of SHA-256(token) — operator identity without storing the raw token */
function _tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

/** SHA-256 of the full request payload — detects key reuse with a different body */
function _computeRequestHash(
  group_key: string,
  canonical_answer_normalized: string,
  prop_ids: string[],
  expected_count: number,
  operatorFingerprint: string,
): string {
  const sorted = [...prop_ids].sort().join(",");
  const raw = [group_key, canonical_answer_normalized, sorted, String(expected_count), operatorFingerprint].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

/** Short, human-readable operation ID for audit correlation. */
function _genOpId(): string {
  return `gso-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Settlement operation row type ─────────────────────────────────────────────
interface _SettleOpRow {
  id: string;
  idempotency_key: string;
  request_hash: string;
  operation_id: string;
  status: "in_progress" | "completed" | "failed" | "partial_success" | "abandoned";
  response_status_code: number | null;
  result_json: unknown;
  partial_results_json: unknown;
  error_json: unknown;
  lease_expires_at: string;
}

type _SbClient = ReturnType<typeof getServiceSupabase>;

/** Read an existing settlement operation row by idempotency_key */
async function _readSettleOp(sb: _SbClient, idem_key: string): Promise<_SettleOpRow | null> {
  const { data } = await sb
    .from("gameday_settlement_operations")
    .select("id, idempotency_key, request_hash, operation_id, status, response_status_code, result_json, partial_results_json, error_json, lease_expires_at")
    .eq("idempotency_key", idem_key)
    .maybeSingle();
  return (data as _SettleOpRow) ?? null;
}

/** Verify the operation is still in_progress with a valid (non-expired) lease (safeguard #5) */
async function _isSettleOpActive(sb: _SbClient, idem_key: string, op_id: string): Promise<boolean> {
  const { data } = await sb
    .from("gameday_settlement_operations")
    .select("status, lease_expires_at")
    .eq("idempotency_key", idem_key)
    .eq("operation_id", op_id)
    .maybeSingle();
  if (!data) return false;
  const row = data as { status: string; lease_expires_at: string };
  return row.status === "in_progress" && new Date(row.lease_expires_at).getTime() > Date.now();
}

/**
 * Extend lease by 10 min while work is actively progressing (safeguard #2).
 * Guarded WHERE includes operation_id + status = 'in_progress'.
 * Returns true if the row was updated (still active), false if abandoned/terminal.
 */
async function _refreshSettleLease(sb: _SbClient, idem_key: string, op_id: string): Promise<boolean> {
  const newLease = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { data } = await sb
    .from("gameday_settlement_operations")
    .update({ updated_at: new Date().toISOString(), lease_expires_at: newLease })
    .eq("idempotency_key", idem_key)
    .eq("operation_id", op_id)
    .eq("status", "in_progress")
    .select("id");
  return ((data as unknown[])?.length ?? 0) > 0;
}

/**
 * Terminal update with guarded WHERE: idempotency_key + operation_id + status = 'in_progress' (safeguard #1).
 * Returns { updated: true } on success, or { updated: false, row } for safeguard #3 conflict resolution.
 */
async function _finalizeSettleOp(
  sb: _SbClient,
  params: {
    idempotency_key: string;
    operation_id: string;
    status: "completed" | "failed" | "partial_success";
    response_status_code: number;
    room_count: number;
    result_json?: unknown;
    error_json?: unknown;
    partial_results_json?: unknown;
  },
): Promise<{ updated: true } | { updated: false; row: _SettleOpRow | null }> {
  const now = new Date().toISOString();
  const upd: Record<string, unknown> = {
    status: params.status,
    response_status_code: params.response_status_code,
    updated_at: now,
    completed_at: now,
    room_count: params.room_count,
  };
  if (params.result_json         !== undefined) upd.result_json          = params.result_json;
  if (params.error_json          !== undefined) upd.error_json           = params.error_json;
  if (params.partial_results_json !== undefined) upd.partial_results_json = params.partial_results_json;

  // Safeguard #1: WHERE clause must include idempotency_key + operation_id + status = 'in_progress'
  const { data: updated } = await sb
    .from("gameday_settlement_operations")
    .update(upd)
    .eq("idempotency_key", params.idempotency_key)
    .eq("operation_id", params.operation_id)
    .eq("status", "in_progress")
    .select("id");

  if (((updated as unknown[])?.length ?? 0) > 0) return { updated: true };

  // Safeguard #3: 0 rows → read current state for conflict response
  const row = await _readSettleOp(sb, params.idempotency_key);
  return { updated: false, row };
}

/** Build a replay response payload from a terminal or abandoned operation row */
function _buildSettleReplay(row: _SettleOpRow): { statusCode: number; payload: unknown } {
  const code = row.response_status_code ?? 200;
  if (row.status === "completed")       return { statusCode: code, payload: row.result_json };
  if (row.status === "partial_success") return { statusCode: code, payload: row.partial_results_json };
  if (row.status === "failed")          return { statusCode: code, payload: row.error_json };
  // abandoned
  return {
    statusCode: 409,
    payload: {
      error: "This operation was previously abandoned. Retry with a new idempotency_key.",
      code: "OPERATION_ABANDONED",
      ...(typeof row.error_json === "object" && row.error_json !== null ? row.error_json : {}),
    },
  };
}

/**
 * Startup recovery: atomically mark abandoned any in_progress rows whose lease has expired.
 * Called once when routes initialize; non-blocking (fire-and-forget).
 * Guarded WHERE: status = 'in_progress' AND lease_expires_at < NOW() (safeguard #4).
 */
async function _recoverStaleSettleOps(sb: _SbClient): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("gameday_settlement_operations")
      .update({
        status: "abandoned",
        error_json: { code: "PROCESS_RESTART", message: "Server restarted before operation completed" },
        updated_at: now,
        completed_at: now,
      })
      .eq("status", "in_progress")
      .lt("lease_expires_at", now)
      .select("operation_id");
    if (error) {
      if ((error as any).code !== "42P01") {
        console.warn("[settle-group] startup recovery error:", error.message);
      }
      return;
    }
    const n = (data as unknown[])?.length ?? 0;
    if (n > 0) console.log(`[settle-group] startup recovery: abandoned ${n} stale operation(s)`);
  } catch (e) {
    console.warn("[settle-group] startup recovery exception:", (e as Error).message);
  }
}

// ── Settlement queue shared types (GET queue + POST settle-group) ──────────────
// Defined at module scope so both routes can reference them without duplication.

interface GSDGroupOut {
  group_key: string;
  phase: string;
  phase_label: string;
  question: string;
  answer_options: string[];
  normalized_options: string[];
  answer_map: Array<{ stored: string; normalized: string; round_trips: boolean }>;
  has_ambiguous_options: boolean;
  ambiguous_option_details: string[];
  prop_count: number;
  room_count: number;
  prop_ids: string[];
  room_ids: string[];
  template_prop_ids: (string | null)[];
  template_consistency: "consistent" | "mixed" | "none";
  conflicts: string[];
  settlement_status: "safe" | "review_required" | "manual_only";
}

interface GSDEventOut {
  event_key: string | null;
  is_legacy: boolean;
  game_label: string;
  sport: string | null;
  game_date: string | null;
  team_a: string;
  team_b: string;
  group_count: number;
  prop_count: number;
  safe_count: number;
  review_count: number;
  manual_count: number;
  groups: GSDGroupOut[];
}

interface GSDQueueResult {
  events: GSDEventOut[];
  total_events: number;
  total_groups: number;
  total_props: number;
  total_safe: number;
  total_review: number;
  total_manual: number;
}

const _PHASE_ORDER: Record<string, number> = {
  pregame: 0, halftime: 1, fourth: 2, final_push: 3, penalties: 4,
};

/**
 * Fetches all unsettled props from locked cards in active rooms and groups them
 * by real-world game (event_key) and question (group_key).
 *
 * Shared by GET /api/admin/gameday/settlement-queue (read-only display)
 *        and POST /api/admin/gameday/settle-group  (stale-detection + validation).
 */
async function buildSettlementQueue(
  supabase: ReturnType<typeof getServiceSupabase>,
): Promise<GSDQueueResult | { error: string }> {
  const { data: rawProps, error } = await supabase
    .from("gameday_props")
    .select(
      `id, question, answer_options, status, template_prop_id,
       gameday_pick_cards(
         id, phase, status, room_id,
         gameday_rooms(
           id, room_code, room_name, status, experience_type,
           team_a_name, team_b_name, team_a_star, team_b_star,
           game_date, sport
         )
       )`
    )
    .neq("status", "settled");

  if (error) return { error: error.message };

  const props = (rawProps ?? []) as any[];

  // Filter to locked cards in active rooms only.
  // Exclude Fantasy Draft Day rooms — they use JSONB answer_options (objects, not strings)
  // and have their own commissioner-driven settlement flow. Including them here would cause
  // normalization failures and incorrect manual_only classifications.
  const eligible = props.filter((p) => {
    const card = p.gameday_pick_cards;
    const room = card?.gameday_rooms;
    return card?.status === "locked" && room?.status === "active"
      && room?.experience_type !== "fantasy";
  });

  // Internal accumulator types — not part of the public interface.
  type GroupAcc = {
    group_key: string;
    phase: string;
    question: string;
    answer_options: string[];
    normalized_options: string[];
    prop_ids: string[];
    room_ids: Set<string>;
    template_prop_ids: Set<string | null>;
    unique_questions: Set<string>;
  };
  type EventAcc = {
    event_key: string | null;
    is_legacy: boolean;
    team_a: string;
    team_b: string;
    game_date: string | null;
    sport: string | null;
    groups: Map<string, GroupAcc>;
  };

  const eventMap = new Map<string, EventAcc>();
  const LEGACY_KEY = "__legacy__";

  for (const prop of eligible) {
    const card = prop.gameday_pick_cards as any;
    const room = card?.gameday_rooms as any;

    const evKey = buildEventKey(room?.sport, room?.team_a_name, room?.team_b_name, room?.game_date);
    const mapKey = evKey ?? (LEGACY_KEY + "|" + (room?.id ?? "unknown"));

    if (!eventMap.has(mapKey)) {
      eventMap.set(mapKey, {
        event_key: evKey,
        is_legacy: !evKey,
        team_a: room?.team_a_name ?? "Unknown",
        team_b: room?.team_b_name ?? "Unknown",
        game_date: room?.game_date ?? null,
        sport: room?.sport ?? null,
        groups: new Map(),
      });
    }
    const event = eventMap.get(mapKey)!;

    const options = (prop.answer_options ?? []) as string[];
    const normQuestion = (prop.question ?? "")
      .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const normOptions = options.map((o: string) => normalizeAnswerOption(o)).sort();

    const grpKey = evKey
      ? buildGroupKey(evKey, card?.phase ?? "", prop.question ?? "", options)
      : `${mapKey}|${card?.phase ?? ""}|${normQuestion}|${normOptions.join("||")}`;

    if (!event.groups.has(grpKey)) {
      event.groups.set(grpKey, {
        group_key: grpKey,
        phase: card?.phase ?? "",
        question: prop.question ?? "",
        answer_options: options,
        normalized_options: normOptions,
        prop_ids: [],
        room_ids: new Set(),
        template_prop_ids: new Set(),
        unique_questions: new Set(),
      });
    }
    const grp = event.groups.get(grpKey)!;
    grp.prop_ids.push(prop.id);
    grp.room_ids.add(card.room_id);
    grp.template_prop_ids.add(prop.template_prop_id ?? null);
    grp.unique_questions.add(normQuestion);
  }

  // Build output arrays.
  const events: GSDEventOut[] = [];

  for (const [, ev] of eventMap) {
    const groupsOut: GSDGroupOut[] = [];

    for (const [, grp] of ev.groups) {
      const templateIds = [...grp.template_prop_ids].filter(Boolean) as string[];
      const uniqueTemplates = new Set(templateIds);

      let templateConsistency: "consistent" | "mixed" | "none";
      if (grp.template_prop_ids.has(null) && templateIds.length === 0) {
        templateConsistency = "none";
      } else if (uniqueTemplates.size <= 1) {
        templateConsistency = "consistent";
      } else {
        templateConsistency = "mixed";
      }

      const conflicts: string[] = [];
      if (grp.unique_questions.size > 1) {
        conflicts.push(
          `${grp.unique_questions.size} slightly different question texts detected — review before settling`
        );
      }
      if (templateConsistency === "mixed") {
        conflicts.push(
          `Props link to ${uniqueTemplates.size} different template IDs (${[...uniqueTemplates].join(", ")})`
        );
      }

      const answer_map = grp.answer_options.map((stored: string) => {
        const normalized = normalizeAnswerOption(stored);
        const roundTripResult = mapNormalizedToStored(stored, grp.answer_options);
        return { stored, normalized, round_trips: roundTripResult === stored };
      });

      const ambiguousDetails = detectAmbiguousOptions(grp.answer_options);
      const hasAmbiguous = ambiguousDetails.length > 0;
      if (hasAmbiguous) {
        conflicts.push(`Answer options are ambiguous after normalization — bulk settlement blocked`);
      }

      let settlement_status: "safe" | "review_required" | "manual_only";
      if (ev.is_legacy || hasAmbiguous) {
        settlement_status = "manual_only";
      } else if (conflicts.length > 0) {
        settlement_status = "review_required";
      } else {
        settlement_status = "safe";
      }

      groupsOut.push({
        group_key: grp.group_key,
        phase: grp.phase,
        phase_label: phaseLabel(grp.phase),
        question: grp.question,
        answer_options: grp.answer_options,
        normalized_options: grp.normalized_options,
        answer_map,
        has_ambiguous_options: hasAmbiguous,
        ambiguous_option_details: ambiguousDetails,
        prop_count: grp.prop_ids.length,
        room_count: grp.room_ids.size,
        prop_ids: grp.prop_ids,
        room_ids: [...grp.room_ids],
        template_prop_ids: [...grp.template_prop_ids],
        template_consistency: templateConsistency,
        conflicts,
        settlement_status,
      });
    }

    groupsOut.sort((a, b) => {
      const pa = _PHASE_ORDER[a.phase] ?? 9;
      const pb = _PHASE_ORDER[b.phase] ?? 9;
      if (pa !== pb) return pa - pb;
      return a.question.localeCompare(b.question);
    });

    const totalPropsEv = groupsOut.reduce((s, g) => s + g.prop_count, 0);
    const safeCount    = groupsOut.filter((g) => g.settlement_status === "safe").length;
    const reviewCount  = groupsOut.filter((g) => g.settlement_status === "review_required").length;
    const manualCount  = groupsOut.filter((g) => g.settlement_status === "manual_only").length;

    events.push({
      event_key: ev.event_key,
      is_legacy: ev.is_legacy,
      game_label: gameLabel(ev.team_a, ev.team_b, ev.game_date),
      sport: ev.sport,
      game_date: ev.game_date,
      team_a: ev.team_a,
      team_b: ev.team_b,
      group_count: groupsOut.length,
      prop_count: totalPropsEv,
      safe_count: safeCount,
      review_count: reviewCount,
      manual_count: manualCount,
      groups: groupsOut,
    });
  }

  events.sort((a, b) => {
    if (a.is_legacy !== b.is_legacy) return a.is_legacy ? 1 : -1;
    return (a.game_date ?? "").localeCompare(b.game_date ?? "");
  });

  const totalGroups = events.reduce((s, e) => s + e.group_count, 0);
  const totalProps  = events.reduce((s, e) => s + e.prop_count, 0);
  const totalSafe   = events.reduce((s, e) => s + e.safe_count, 0);
  const totalReview = events.reduce((s, e) => s + e.review_count, 0);
  const totalManual = events.reduce((s, e) => s + e.manual_count, 0);

  return {
    events,
    total_events: events.length,
    total_groups: totalGroups,
    total_props: totalProps,
    total_safe: totalSafe,
    total_review: totalReview,
    total_manual: totalManual,
  };
}

/** Characters used in short room codes — avoids visually ambiguous 0/O and 1/I. */
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const PUBLIC_ROOM_FIELDS = [
  "id",
  "room_name",
  "team_a_name",
  "team_b_name",
  "team_a_star",
  "team_b_star",
  "game_date",
  "status",
  "room_code",
  "is_private",
  "archived_at",
  "source",
  "sport",
  "template_type",
  "slate_config",
  "countdown_phase",
  "countdown_type",
  "countdown_ends_at",
  "countdown_started_at",
].join(", ");

const LEGACY_PUBLIC_ROOM_FIELDS = [
  "id",
  "room_name",
  "team_a_name",
  "team_b_name",
  "team_a_star",
  "team_b_star",
  "game_date",
  "status",
  "room_code",
  "is_private",
  "archived_at",
  "source",
  "sport",
  "countdown_phase",
  "countdown_type",
  "countdown_ends_at",
  "countdown_started_at",
].join(", ");

/** Generate a unique GDS-XXXXX short code, retrying on collision. */
async function generateUniqueRoomCode(supabase: any): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = "";
    for (let i = 0; i < 5; i++) {
      suffix += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    const code = `GDS-${suffix}`;
    const { data } = await supabase
      .from("gameday_rooms")
      .select("id")
      .eq("room_code", code)
      .maybeSingle();
    if (!data) return code; // code is unique
  }
  throw new Error("Failed to generate a unique room code after 10 attempts");
}

/** Current year in CDT (America/Chicago). Avoids UTC year mismatch near midnight. */
function currentYearCDT(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
  }).format(new Date());
}

/** Parse a human-readable date like "May 21" or "May 21, 2026" into ISO "YYYY-MM-DD".
 *  Defaults to the current CDT year when no year is supplied. Returns null on failure. */
function parseGameDate(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  const MONTHS: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  // Already ISO — pass through
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
  // Split on whitespace; strip commas so "May 20, 2026" → ["May","20","2026"]
  const parts = raw.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const monthKey = parts[0].slice(0, 3).toLowerCase();
  const month = MONTHS[monthKey];
  const day = parts[1].replace(/\D/g, "").padStart(2, "0");
  if (!month || !day) return null;
  // Use explicit year if provided, otherwise default to current CDT year
  const year = parts[2] ? parts[2].replace(/\D/g, "") : currentYearCDT();
  return `${year}-${month}-${day}`;
}

type VerifiedGamedayUser = {
  id: string;
  email: string;
};

function getAllowedGamedayEmails(): string[] {
  return (process.env.GAMEDAY_HOST_EMAILS ?? "darius@leagueswype.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function getAllowedGamedayAdminEmails(): string[] {
  return (
    process.env.GAMEDAY_ADMIN_EMAILS ??
    process.env.GAMEDAY_HOST_EMAILS ??
    ""
  )
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function getVerifiedGamedayUser(
  req: Request,
): Promise<VerifiedGamedayUser | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;

  const token = auth.slice(7).trim();
  if (!token) return null;

  const supabase = getServiceSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user?.id || !user.email) return null;
  return { id: user.id, email: user.email };
}

async function requireGamedayHost(
  req: Request,
  res: Response
): Promise<string | null> {
  const user = await getVerifiedGamedayUser(req);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired Supabase token" });
    return null;
  }
  if (!getAllowedGamedayEmails().includes(user.email.toLowerCase())) {
    res.status(403).json({ error: "Not authorized as Game Day host" });
    return null;
  }
  return user.id;
}

// ── Bot API key helpers ───────────────────────────────────────────────────────

const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? "https://www.swayger.app";

/**
 * Returns true if the request carries a valid GAMEDAY_BOT_API_KEY.
 * Accepts either:
 *   Authorization: Bearer <key>
 *   x-api-key: <key>
 */
function isBotApiKeyValid(req: Request): boolean {
  const botKey = process.env.GAMEDAY_BOT_API_KEY?.trim();
  if (!botKey) return false;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim() === botKey;
  }
  const xApiKey = req.headers["x-api-key"];
  if (typeof xApiKey === "string") return xApiKey.trim() === botKey;
  return false;
}

function normalizeDiscordGuildId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const guildId = value.trim();
  if (!guildId || guildId.length > 128 || /[\u0000-\u001f\u007f]/.test(guildId)) {
    return null;
  }
  return guildId;
}

/**
 * Discord operators send the guild boundary in this header on every
 * room-scoped request. The create route accepts discord_guild_id in its JSON
 * body because that is part of the creation payload.
 */
function getRequestedDiscordGuildId(
  req: Request,
  body?: Record<string, unknown>,
): string | null {
  return normalizeDiscordGuildId(
    req.header("x-discord-guild-id") ?? body?.discord_guild_id,
  );
}

/**
 * Validate that a bot request is scoped to the Discord guild that owns a
 * Discord-created room. Public participant reads intentionally do not call
 * this helper unless the bot API credential is present.
 */
async function requireDiscordGuildRoom(
  req: Request,
  res: Response,
  supabase: any,
  roomId: string,
): Promise<{ roomId: string; guildId: string } | null> {
  if (!isBotApiKeyValid(req)) {
    res.status(401).json({ error: "Valid Game Day bot credentials are required" });
    return null;
  }

  const guildId = getRequestedDiscordGuildId(req);
  if (!guildId) {
    res.status(400).json({
      error: "X-Discord-Guild-ID is required for Discord operator requests",
    });
    return null;
  }

  const { data: room } = await supabase
    .from("gameday_rooms")
    .select("id, source, discord_guild_id")
    .eq("id", roomId)
    .maybeSingle();

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return null;
  }

  const storedGuildId = normalizeDiscordGuildId(
    (room as { discord_guild_id?: unknown }).discord_guild_id,
  );
  if (room.source !== "discord" || !storedGuildId || storedGuildId !== guildId) {
    res.status(403).json({ error: "Discord guild is not authorized for this room" });
    return null;
  }

  return { roomId, guildId };
}

function requireOwnedHumanRoom(
  res: Response,
  storedHostId: string | null | undefined,
  hostId: string,
): boolean {
  if (!storedHostId || storedHostId !== hostId) {
    res.status(403).json({ error: "Not your room" });
    return false;
  }
  return true;
}

type GamedayOperator = {
  kind: "discord" | "web";
  hostId: string | null;
  guildId: string | null;
};

/**
 * Authorize a room-scoped operator request. Public participant requests never
 * call this helper. A bot must own a Discord room by guild; a web operator
 * must be the room's recorded Supabase host.
 */
async function requireGamedayRoomOperator(
  req: Request,
  res: Response,
  supabase: any,
  roomId: string,
): Promise<GamedayOperator | null> {
  if (isBotApiKeyValid(req)) {
    const discordAccess = await requireDiscordGuildRoom(req, res, supabase, roomId);
    if (!discordAccess) return null;
    return { kind: "discord", hostId: null, guildId: discordAccess.guildId };
  }

  const hostId = await requireGamedayHost(req, res);
  if (!hostId) return null;

  const { data: room } = await supabase
    .from("gameday_rooms")
    .select("host_user_id")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return null;
  }
  if (!requireOwnedHumanRoom(res, (room as any).host_user_id, hostId)) {
    return null;
  }
  return { kind: "web", hostId, guildId: null };
}

/** Returns true if the string looks like a UUID. */
function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Resolves a roomRef (UUID or GDS-XXXXX room code) to a room UUID.
 * Returns null if the room does not exist.
 */
async function resolveRoomRef(
  supabase: any,
  roomRef: string
): Promise<string | null> {
  if (isUuidLike(roomRef)) return roomRef;
  const { data } = await supabase
    .from("gameday_rooms")
    .select("id")
    .eq("room_code", roomRef.toUpperCase().trim())
    .maybeSingle();
  return (data as any)?.id ?? null;
}

async function getCallerIdentity(req: Request) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const supabase = getServiceSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser(auth.slice(7));
    if (user) return { userId: user.id, guestSessionId: null as string | null };
  }
  const guestSession =
    (req.headers["x-guest-session"] as string | undefined) || null;
  return { userId: null as string | null, guestSessionId: guestSession };
}

async function logEvent(
  supabase: ReturnType<typeof getServiceSupabase>,
  roomId: string,
  participantId: string | null,
  userId: string | null,
  eventType: string,
  metadata?: Record<string, unknown>
) {
  try {
    await supabase.from("gameday_events").insert({
      room_id: roomId,
      participant_id: participantId,
      user_id: userId,
      event_type: eventType,
      metadata: metadata ?? null,
    });
  } catch {
    /* fire and forget */
  }
}

type SundaySlateConfig = {
  early_matchups: string[];
  late_matchups: string[];
  sunday_night_teams: [string, string];
  qb_candidates: string[];
  rb_candidates: string[];
  receiver_candidates: string[];
  team_candidates: string[];
  game_candidates: string[];
};

function normalizeSlateList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.replace(/[\u0000-\u001f\u007f]/g, "").trim())
      .filter((item) => item.length > 0 && item.length <= 100)
  )].slice(0, 32);
}

function normalizeSundaySlateConfig(value: unknown): SundaySlateConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const teams = normalizeSlateList(raw.sunday_night_teams);
  const earlyMatchups = normalizeSlateList(raw.early_matchups);
  const lateMatchups = normalizeSlateList(raw.late_matchups);
  const config: SundaySlateConfig = {
    early_matchups: earlyMatchups,
    late_matchups: lateMatchups,
    sunday_night_teams: [teams[0] ?? "", teams[1] ?? ""],
    qb_candidates: normalizeSlateList(raw.qb_candidates),
    rb_candidates: normalizeSlateList(raw.rb_candidates),
    receiver_candidates: normalizeSlateList(raw.receiver_candidates),
    team_candidates: normalizeSlateList(raw.team_candidates),
    game_candidates: normalizeSlateList(raw.game_candidates),
  };
  if (
    !config.sunday_night_teams[0] || !config.sunday_night_teams[1] ||
    !config.early_matchups.length || !config.late_matchups.length ||
    !config.qb_candidates.length || !config.rb_candidates.length ||
    !config.receiver_candidates.length || !config.team_candidates.length
  ) return null;
  if (!config.game_candidates.length) {
    config.game_candidates = [...new Set([...earlyMatchups, ...lateMatchups])];
  }
  return config;
}

function withUniqueOutcomeOptions(options: string[], includeOther = true): string[] {
  const next = [...options];
  if (includeOther && !next.includes("Other")) next.push("Other");
  if (!next.includes("Tie / Multiple tied")) next.push("Tie / Multiple tied");
  return next;
}

function resolveSundaySlateAnswers(
  answers: string[],
  vars: { TEAM_A: string; TEAM_B: string; STAR_A: string; STAR_B: string },
  slate: SundaySlateConfig,
): string[] {
  const tokenOptions: Record<string, string[]> = {
    "{{SLATE_QBS}}": withUniqueOutcomeOptions(slate.qb_candidates),
    "{{SLATE_RBS}}": withUniqueOutcomeOptions(slate.rb_candidates),
    "{{SLATE_RECEIVERS}}": withUniqueOutcomeOptions(slate.receiver_candidates),
    "{{SLATE_TEAMS}}": withUniqueOutcomeOptions(slate.team_candidates),
    "{{SLATE_EARLY_GAMES}}": withUniqueOutcomeOptions(slate.early_matchups, false),
    "{{SLATE_LATE_GAMES}}": withUniqueOutcomeOptions(slate.late_matchups, false),
  };
  return answers.flatMap((answer) => tokenOptions[answer] ?? [resolvePlaceholders(answer, vars)]);
}

export function registerGamedayRoutes(app: Express) {
  // Startup recovery: non-blocking — abandon any in_progress settlement ops whose
  // lease has expired (i.e. server restarted before they could write a terminal status).
  setImmediate(() => {
    try {
      _recoverStaleSettleOps(getServiceSupabase()).catch((error) => {
        console.error("[settle-group] startup recovery error:", error instanceof Error ? error.message : error);
      });
    } catch (error) {
      console.error("[settle-group] startup recovery unavailable:", error instanceof Error ? error.message : error);
    }
  });

  // Prevent browser/proxy caching for all gameday API responses.
  // Without this, Express's ETag freshness check returns 304 for unchanged
  // responses even after server-side state changes (e.g. room finalized),
  // so the browser keeps serving the old cached data.
  // Overriding req.fresh to always be false forces a full 200 on every request.
  app.use("/api/gameday", (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    Object.defineProperty(req, "fresh", { get: () => false, configurable: true });
    next();
  });

  // ── GET /api/gameday/is-host ────────────────────────────────────────────
  app.get("/api/gameday/is-host", async (req: Request, res: Response) => {
    const user = await getVerifiedGamedayUser(req);
    const email = user?.email ?? "";
    const isHost = !!user && getAllowedGamedayEmails().includes(email.toLowerCase());
    console.log(`[gameday] is-host: verified_email="${email}" allowed=${JSON.stringify(getAllowedGamedayEmails())} → ${isHost}`);
    res.json({ isHost });
  });

  // ── GET /api/admin/is-admin ──────────────────────────────────────────────
  // Returns { isAdmin } for the requesting user based on their JWT email.
  // Uses GAMEDAY_ADMIN_EMAILS if set; falls back to GAMEDAY_HOST_EMAILS.
  // This drives the Admin Panel button visibility on the profile screen.
  app.get("/api/admin/is-admin", async (req: Request, res: Response) => {
    const user = await getVerifiedGamedayUser(req);
    const email = (user?.email ?? "").toLowerCase();
    res.json({ isAdmin: !!user && getAllowedGamedayAdminEmails().includes(email) });
  });

  // ── GET /api/gameday/public-rooms ─────────────────────────────────────────
  // Returns active, non-archived, public (is_private=false) rooms. No auth required.
  app.get("/api/gameday/public-rooms", async (req: Request, res: Response) => {
    const supabase = getServiceSupabase();
    const { data: rooms, error } = await supabase
      .from("gameday_rooms")
      .select("id, room_name, team_a_name, team_b_name, game_date, status, room_code")
      .eq("is_private", false)
      .is("archived_at", null)
      .neq("status", "finalized")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[gameday] public-rooms error:", error.message);
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ rooms: rooms ?? [] });
  });

  // ── GET /api/gameday/rooms ──────────────────────────────────────────────
  // Returns all rooms created by the authenticated host, newest first.
  app.get("/api/gameday/rooms", async (req: Request, res: Response) => {
    const user = await getVerifiedGamedayUser(req);
    if (!user) {
      res.status(401).json({ error: "Invalid or expired Supabase token" });
      return;
    }
    if (!getAllowedGamedayEmails().includes(user.email.toLowerCase())) {
      res.status(403).json({ error: "Not authorized as Game Day host" });
      return;
    }
    const supabase = getServiceSupabase();

    // Configured admins see ALL rooms including Discord-created ones.
    // Other configured hosts only see rooms they personally created.
    const isAdminUser = getAllowedGamedayAdminEmails().includes(user.email.toLowerCase());

    // Try fetching with room_code + source; fall back if columns don't exist yet.
    let baseQuery = supabase
      .from("gameday_rooms")
      .select("id, room_name, team_a_name, team_b_name, game_date, status, created_at, room_code, source, archived_at")
      .order("created_at", { ascending: false });
    if (!isAdminUser) baseQuery = (baseQuery as any).eq("host_user_id", user.id);

    let { data: rooms, error } = await baseQuery;

    if (error) {
      console.warn("[gameday] rooms list with room_code/source failed, retrying without:", error.message);
      let retryQuery = supabase
        .from("gameday_rooms")
        .select("id, room_name, team_a_name, team_b_name, game_date, status, created_at, archived_at")
        .order("created_at", { ascending: false });
      if (!isAdminUser) retryQuery = (retryQuery as any).eq("host_user_id", user.id);
      const retry = await retryQuery;
      if (retry.error) {
        res.status(500).json({ error: retry.error.message });
        return;
      }
      rooms = retry.data;
    }

    const roomList = rooms ?? [];
    console.log("[gameday] rooms list:", roomList.map((r: any) => ({ id: r.id.slice(0,8), room_code: r.room_code ?? "null" })));

    // Backfill any rooms that are missing a room_code (non-blocking, best-effort).
    await Promise.all(
      roomList.map(async (r: any) => {
        if (!r.room_code) {
          try {
            const newCode = await generateUniqueRoomCode(supabase);
            const { error: updErr } = await supabase
              .from("gameday_rooms")
              .update({ room_code: newCode })
              .eq("id", r.id);
            if (!updErr) {
              r.room_code = newCode;
              console.log(`[gameday] rooms-list backfilled room_code ${newCode} for ${r.id}`);
            } else {
              console.warn("[gameday] rooms-list backfill update failed:", updErr.message);
            }
          } catch (e) {
            console.warn("[gameday] rooms-list backfill skipped (column may not exist yet):", e);
          }
        }
      })
    );

    // Attach participant counts in one query
    const roomIds = roomList.map((r: any) => r.id);
    let counts: Record<string, number> = {};
    if (roomIds.length > 0) {
      const { data: pRows } = await supabase
        .from("gameday_participants")
        .select("room_id")
        .in("room_id", roomIds);
      (pRows ?? []).forEach((p) => {
        counts[p.room_id] = (counts[p.room_id] ?? 0) + 1;
      });
    }
    res.json({
      rooms: roomList.map((r: any) => ({
        ...r,
        participant_count: counts[r.id] ?? 0,
        host_link: `${APP_URL}/gameday/${r.id}/host`,
      })),
    });
  });

  // ── GET /api/gameday/template ───────────────────────────────────────────
  // Reads from gameday_prop_library table. Falls back to hardcoded templates
  // if the table is empty or unavailable (safe during migration).
  app.get("/api/gameday/template", async (req: Request, res: Response) => {
    const sportParam = ((req.query.sport as string) ?? "nba").trim().toLowerCase();
    const templateType = ((req.query.template_type as string) ?? "").trim().toLowerCase();
    if (!["nba", "soccer", "nfl"].includes(sportParam)) {
      res.status(400).json({ error: "sport must be nba, soccer, or nfl" });
      return;
    }
    if (templateType === "nfl_sunday_slate") {
      if (sportParam !== "nfl") {
        res.status(400).json({ error: "nfl_sunday_slate is only available for NFL rooms" });
        return;
      }
      res.json({ template: NFL_SUNDAY_SLATE_TEMPLATE, defaultPropIds: NFL_SUNDAY_SLATE_DEFAULT_PROP_IDS });
      return;
    }
    const supabase = getServiceSupabase();

    try {
      let libraryQuery = supabase
        .from("gameday_prop_library")
        .select("id, phase, question, answer_options, settlement_window, is_default")
        .eq("sport", sportParam)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (sportParam === "nfl" && templateType === "nfl_single_game") {
        libraryQuery = libraryQuery.eq("template_type", "nfl_single_game");
      } else if (sportParam === "nfl" && !templateType) {
        libraryQuery = libraryQuery.or("template_type.is.null,template_type.eq.nfl_single_game");
      }
      const { data: libraryProps, error } = await libraryQuery;

      if (!error && libraryProps && libraryProps.length > 0) {
        const template = libraryProps.map((p: any) => ({
          id: p.id,
          phase: p.phase,
          question: p.question,
          answers: p.answer_options,
          settlement_window: p.settlement_window,
        }));
        const defaultPropIds = libraryProps
          .filter((p: any) => p.is_default)
          .map((p: any) => p.id);
        res.json({ template, defaultPropIds });
        return;
      }
    } catch (e) {
      console.warn("[gameday] prop library query failed, falling back to hardcoded:", e);
    }

    // Fallback to hardcoded templates
    const fallback =
      sportParam === "soccer"
        ? { template: FIFA_TEMPLATE, defaultPropIds: FIFA_DEFAULT_PROP_IDS }
        : sportParam === "nfl"
        ? { template: NFL_TEMPLATE, defaultPropIds: NFL_DEFAULT_PROP_IDS }
        : { template: NBA_PLAYOFF_TEMPLATE, defaultPropIds: DEFAULT_PROP_IDS };
    res.json(fallback);
  });

  // ── POST /api/gameday/rooms ─────────────────────────────────────────────
  app.post("/api/gameday/rooms", async (req: Request, res: Response) => {
    // Accept either a valid bot API key OR the existing Supabase host JWT.
    let hostId: string | null = null;
    const botAuthed = isBotApiKeyValid(req);
    if (!botAuthed) {
      hostId = await requireGamedayHost(req, res);
      if (!hostId) return; // requireGamedayHost already sent 401/403
    }

    const {
      room_name: _room_name,
      game_label,
      team_a_name,
      team_b_name,
      team_a_star,
      team_b_star,
      game_date,
      selected_prop_ids,
      source,
      discord_guild_id,
      discord_channel_id,
      discord_user_id,
      is_private,
      sport,
      template_type,
      slate_config,
      game_start_time,
      card_schedules,
    } = req.body as {
      room_name?: string;
      game_label?: string;
      team_a_name?: string;
      team_b_name?: string;
      team_a_star?: string;
      team_b_star?: string;
      game_date?: string;
      selected_prop_ids?: string[];
      source?: string;
      discord_guild_id?: string;
      discord_channel_id?: string;
      discord_user_id?: string;
      is_private?: boolean;
      sport?: "nba" | "soccer" | "nfl";
      template_type?: "nfl_single_game" | "nfl_sunday_slate";
      slate_config?: unknown;
      game_start_time?: string;
      card_schedules?: Record<string, { open_at?: string; lock_at?: string }>;
    };

    // Accept either room_name or game_label (Discord bot compat)
    const room_name = _room_name ?? game_label;
    const requestedSource = typeof source === "string" ? source.trim().toLowerCase() : "";
    const discordGuildId = normalizeDiscordGuildId(discord_guild_id);

    if (botAuthed) {
      if (!discordGuildId) {
        res.status(400).json({
          error: "discord_guild_id is required for Discord-created rooms",
        });
        return;
      }
      if (requestedSource && requestedSource !== "discord") {
        res.status(400).json({
          error: "Discord bot room creation must use source=discord",
        });
        return;
      }
    } else if (requestedSource === "discord" || discordGuildId || discord_channel_id || discord_user_id) {
      res.status(400).json({
        error: "Discord metadata can only be supplied by the Game Day bot",
      });
      return;
    }

    const normalizedSport = (sport ?? "nba").trim().toLowerCase();
    if (!["nba", "soccer", "nfl"].includes(normalizedSport)) {
      res.status(400).json({ error: "sport must be nba, soccer, or nfl" });
      return;
    }
    const isSoccer = normalizedSport === "soccer";
    const isNfl = normalizedSport === "nfl";
    const requestedTemplateType = typeof template_type === "string" ? template_type.trim().toLowerCase() : "";
    if (requestedTemplateType && !["nfl_single_game", "nfl_sunday_slate"].includes(requestedTemplateType)) {
      res.status(400).json({ error: "template_type must be nfl_single_game or nfl_sunday_slate" });
      return;
    }
    if (requestedTemplateType && !isNfl) {
      res.status(400).json({ error: "template_type is only supported for NFL rooms" });
      return;
    }
    const isSundaySlate = isNfl && requestedTemplateType === "nfl_sunday_slate";
    const normalizedSlateConfig = isSundaySlate ? normalizeSundaySlateConfig(slate_config) : null;
    if (isSundaySlate && !normalizedSlateConfig) {
      res.status(400).json({
        error: "Sunday Slate needs Early and Late matchups, Sunday Night teams, and QB, RB, WR/TE, and team candidates.",
      });
      return;
    }
    const effectiveTeamA = isSundaySlate ? normalizedSlateConfig!.sunday_night_teams[0] : team_a_name?.trim();
    const effectiveTeamB = isSundaySlate ? normalizedSlateConfig!.sunday_night_teams[1] : team_b_name?.trim();
    const effectiveStarA = isSundaySlate ? normalizedSlateConfig!.qb_candidates[0] : team_a_star?.trim();
    const effectiveStarB = isSundaySlate ? (normalizedSlateConfig!.qb_candidates[1] ?? normalizedSlateConfig!.qb_candidates[0]) : team_b_star?.trim();
    if (!room_name || !effectiveTeamA || !effectiveTeamB || !effectiveStarA || !effectiveStarB) {
      res.status(400).json({ error: "Missing required room details." });
      return;
    }
    const activeTemplate = isSoccer
      ? FIFA_TEMPLATE
      : isSundaySlate
      ? NFL_SUNDAY_SLATE_TEMPLATE
      : isNfl
      ? NFL_TEMPLATE
      : NBA_PLAYOFF_TEMPLATE;
    const defaultPropIds = isSoccer
      ? FIFA_DEFAULT_PROP_IDS
      : isSundaySlate
      ? NFL_SUNDAY_SLATE_DEFAULT_PROP_IDS
      : isNfl
      ? NFL_DEFAULT_PROP_IDS
      : DEFAULT_PROP_IDS;
    const propIds = selected_prop_ids ?? defaultPropIds;
    const supabase = getServiceSupabase();

    // Generate a short room code; gracefully skip if DB column doesn't exist yet
    // (run supabase/gameday-room-code-migration.sql to enable short links).
    let roomCode: string | undefined;
    try {
      roomCode = await generateUniqueRoomCode(supabase);
    } catch (e) {
      console.warn("[gameday] room_code generation skipped:", e);
    }

    // Discord rooms are always unlisted. The bot caller cannot make a room
    // discoverable by passing is_private=false; direct invite access remains
    // available through the returned public_link and room code.
    // Normal app-created rooms preserve their existing default.
    const resolvedIsPrivate = botAuthed ? true : (is_private ?? true);

    const insertPayload: Record<string, unknown> = {
      room_name: room_name.trim(),
      team_a_name: effectiveTeamA,
      team_b_name: effectiveTeamB,
      team_a_star: effectiveStarA,
      team_b_star: effectiveStarB,
      game_date: parseGameDate(game_date),
      host_user_id: botAuthed ? null : hostId,
      status: "active",
      source: botAuthed ? "discord" : "app",
      is_private: resolvedIsPrivate,
    };
    if (roomCode)          insertPayload.room_code          = roomCode;
    if (botAuthed) {
      insertPayload.discord_guild_id = discordGuildId;
      if (discord_channel_id) insertPayload.discord_channel_id = discord_channel_id;
      if (discord_user_id)    insertPayload.discord_user_id    = discord_user_id;
    }
    // Preserve historical omitted-sport rooms while storing every explicit choice.
    if (sport !== undefined) insertPayload.sport = normalizedSport;
    // Legacy callers that send only sport="nfl" remain compatible with the
    // pre-Sunday-Slate schema. Explicit formats (and all Sunday Slate rooms)
    // require the additive migration and are persisted for future reads.
    if (isSundaySlate || requestedTemplateType) {
      insertPayload.template_type = isSundaySlate ? "nfl_sunday_slate" : "nfl_single_game";
    }
    if (normalizedSlateConfig) insertPayload.slate_config = normalizedSlateConfig;
    if (game_start_time)   insertPayload.game_start_time    = game_start_time;

    let { data: room, error: roomError } = await supabase
      .from("gameday_rooms")
      .insert(insertPayload)
      .select()
      .single();

    // If insert failed because room_code column doesn't exist, retry without it.
    if (roomError && roomCode && roomError.message?.includes("room_code")) {
      console.warn("[gameday] room_code column missing — retrying without it (run migration)");
      delete insertPayload.room_code;
      const retry = await supabase
        .from("gameday_rooms")
        .insert(insertPayload)
        .select()
        .single();
      room = retry.data;
      roomError = retry.error;
    }

    if (roomError || !room) {
      console.error("[gameday] create room error:", roomError);
      res.status(500).json({
        error: `Could not create room: ${roomError?.message ?? "unknown database error"}`,
      });
      return;
    }

    const cardPhases: Array<{
      title: string;
      phase: string;
      display_order: number;
    }> = isSoccer
      ? [
          { title: "Pregame Picks", phase: "pregame", display_order: 0 },
          { title: "Halftime Picks", phase: "halftime", display_order: 1 },
          { title: "Final Push 🔥", phase: "final_push", display_order: 2 },
          { title: "Penalty Shootout ⚽", phase: "penalties", display_order: 3 },
        ]
      : isSundaySlate
      ? [
          { title: "Early Slate Picks", phase: "pregame", display_order: 0 },
          { title: "Late Slate Picks", phase: "halftime", display_order: 1 },
          { title: "Sunday Night Picks", phase: "fourth", display_order: 2 },
        ]
      : [
          { title: "Pregame Picks", phase: "pregame", display_order: 0 },
          { title: "Halftime Picks", phase: "halftime", display_order: 1 },
          { title: "4Q Clutch Picks", phase: "fourth", display_order: 2 },
        ];

    const vars = {
      TEAM_A: effectiveTeamA,
      TEAM_B: effectiveTeamB,
      STAR_A: effectiveStarA,
      STAR_B: effectiveStarB,
    };

    for (const cardDef of cardPhases) {
      const cardSchedule = card_schedules?.[cardDef.phase] ?? {};
      const { data: card, error: cardError } = await supabase
        .from("gameday_pick_cards")
        .insert({
          room_id: room.id,
          ...cardDef,
          status: "closed",
          ...(cardSchedule.open_at ? { scheduled_open_at: cardSchedule.open_at } : {}),
          ...(cardSchedule.lock_at ? { scheduled_lock_at: cardSchedule.lock_at } : {}),
        })
        .select()
        .single();

      if (cardError || !card) {
        await supabase.from("gameday_rooms").delete().eq("id", room.id);
        console.error("[gameday] create card error:", cardError);
        res.status(500).json({ error: "Could not create all pick cards" });
        return;
      }

      const templateProps = activeTemplate.filter(
        (p) => p.phase === cardDef.phase && propIds.includes(p.id)
      );

      for (let i = 0; i < templateProps.length; i++) {
        const tmpl = templateProps[i];
        const { error: propError } = await supabase.from("gameday_props").insert({
          card_id: card.id,
          question: resolvePlaceholders(tmpl.question, vars),
          answer_options: isSundaySlate
            ? resolveSundaySlateAnswers(tmpl.answers, vars, normalizedSlateConfig!)
            : tmpl.answers.map((a) => resolvePlaceholders(a, vars)),
          display_order: i,
          status: "pending",
          template_prop_id: tmpl.id,
        });
        if (propError) {
          await supabase.from("gameday_rooms").delete().eq("id", room.id);
          console.error("[gameday] create prop error:", propError);
          res.status(500).json({ error: "Could not create all pick props" });
          return;
        }
      }
    }

    // For Discord-created rooms, automatically open the Pregame card so
    // participants can make picks immediately after the bot posts the link.
    if (botAuthed || insertPayload.source === "discord") {
      const { data: pregameCard } = await supabase
        .from("gameday_pick_cards")
        .select("id")
        .eq("room_id", room.id)
        .eq("phase", "pregame")
        .single();
      if (pregameCard) {
        await supabase
          .from("gameday_pick_cards")
          .update({ status: "open", updated_at: new Date().toISOString() })
          .eq("id", (pregameCard as any).id);
        console.log(`[gameday] pregame card auto-opened for discord room ${room.id}`);
      }
    }

    await logEvent(supabase, room.id, null, botAuthed ? null : hostId, "room_created");
    console.log(`[gameday] room created: ${room.id} "${room_name}" source=${insertPayload.source}`);

    const returnedCode = (room as any).room_code ?? roomCode ?? null;
    const publicLink = returnedCode
      ? `${APP_URL}/g/${returnedCode}`
      : `${APP_URL}/gameday/${room.id}`;
    const hostLink = `${APP_URL}/gameday/${room.id}/host`;

    res.json({
      ok: true,
      room_id: room.id,
      room_code: returnedCode,
      public_link: publicLink,
      host_link: hostLink,
      room,
    });
  });

  // ── GET /api/gameday/rooms/by-code/:roomCode ────────────────────────────
  // Resolves a short GDS-XXXXX code to the internal room UUID.
  // Must be registered BEFORE /rooms/:roomId so "by-code" isn't captured as a roomId.
  app.get("/api/gameday/rooms/by-code/:roomCode", async (req: Request, res: Response) => {
    const roomCode = (req.params.roomCode ?? "").toUpperCase().trim();
    if (!roomCode) {
      res.status(400).json({ error: "Missing room code" });
      return;
    }
    const supabase = getServiceSupabase();
    const { data: room } = await supabase
      .from("gameday_rooms")
      .select("id")
      .eq("room_code", roomCode)
      .maybeSingle();
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    res.json({ room_id: room.id });
  });

  // ── GET /api/gameday/rooms/:roomId ──────────────────────────────────────
  app.get(
    "/api/gameday/rooms/:roomId",
    async (req: Request, res: Response) => {
      const { roomId } = req.params;
      const supabase = getServiceSupabase();

        let { data: room, error } = await supabase
        .from("gameday_rooms")
        .select(PUBLIC_ROOM_FIELDS)
        .eq("id", roomId)
        .single();
        // Existing direct links stay readable until the additive Slate migration
        // is installed. Slate rooms cannot exist on that older schema.
        if (error?.message?.includes("template_type") || error?.message?.includes("slate_config")) {
          const legacy = await supabase
            .from("gameday_rooms")
            .select(LEGACY_PUBLIC_ROOM_FIELDS)
            .eq("id", roomId)
            .single();
          room = legacy.data;
          error = legacy.error;
        }

      if (error || !room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }

      const { data: rawCards } = await supabase
        .from("gameday_pick_cards")
        .select(
          "id, room_id, title, phase, status, lock_label, display_order, created_at, updated_at, gameday_props(id, card_id, question, answer_options, correct_answer, status, display_order)"
        )
        .eq("room_id", roomId)
        .order("display_order");

      const cards = (rawCards ?? []).map((card) => ({
        ...card,
        gameday_props: [...((card.gameday_props as unknown[]) ?? [])].sort(
          (a: any, b: any) => a.display_order - b.display_order
        ),
      }));

      const { userId, guestSessionId } = await getCallerIdentity(req);
      console.log(
        `[gameday] room fetch ${roomId}: userId=${userId ? userId.slice(0, 8) + "…" : "null"} guest=${guestSessionId ? guestSessionId.slice(0, 8) + "…" : "null"}`
      );

      let participant = null;
      if (userId) {
        const { data } = await supabase
          .from("gameday_participants")
          .select("id, room_id, display_name, is_guest, created_at")
          .eq("room_id", roomId)
          .eq("user_id", userId)
          .maybeSingle();
        participant = data;
      } else if (guestSessionId) {
        const { data } = await supabase
          .from("gameday_participants")
          .select("id, room_id, display_name, is_guest, created_at")
          .eq("guest_session_id", guestSessionId)
          .maybeSingle();
        participant = data;
      }
      console.log(
        `[gameday] room fetch ${roomId}: participant=${participant ? participant.id.slice(0, 8) + "…" : "null"} is_guest=${participant?.is_guest ?? "n/a"}`
      );

      const allPropIds = cards.flatMap((c) =>
        ((c.gameday_props as any[]) ?? []).map((p: any) => p.id)
      );

      let myPicks: Record<string, string> = {};
      if (participant && allPropIds.length > 0) {
        const { data: picks } = await supabase
          .from("gameday_picks")
          .select("prop_id, selected_answer")
          .eq("participant_id", participant.id)
          .in("prop_id", allPropIds);
        myPicks = Object.fromEntries(
          (picks ?? []).map((p: any) => [p.prop_id, p.selected_answer])
        );
      }

      // Revealed picks for locked/settled cards only
      const revealedPicks: Record<string, Record<string, string[]>> = {};
      for (const card of cards) {
        if (card.status === "locked" || card.status === "settled") {
          const propIds = ((card.gameday_props as any[]) ?? []).map(
            (p: any) => p.id
          );
          if (propIds.length === 0) continue;
          const { data: allPicks } = await supabase
            .from("gameday_picks")
            .select("prop_id, selected_answer, gameday_participants(display_name)")
            .in("prop_id", propIds);
          for (const pick of allPicks ?? []) {
            const pid = (pick as any).prop_id;
            const ans = (pick as any).selected_answer;
            const name =
              ((pick as any).gameday_participants as any)?.display_name ??
              "Unknown";
            if (!revealedPicks[pid]) revealedPicks[pid] = {};
            if (!revealedPicks[pid][ans]) revealedPicks[pid][ans] = [];
            revealedPicks[pid][ans].push(name);
          }
        }
      }

      // Strip correct_answer from unsettled props (security)
      const sanitizedCards = cards.map((card) => ({
        ...card,
        gameday_props: ((card.gameday_props as any[]) ?? []).map((prop: any) => ({
          ...prop,
          correct_answer:
            prop.status === "settled" ? prop.correct_answer : null,
        })),
      }));

      const { count } = await supabase
        .from("gameday_participants")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId);

      res.json({
        room,
        cards: sanitizedCards,
        participant,
        my_picks: myPicks,
        revealed_picks: revealedPicks,
        participant_count: count ?? 0,
      });
    }
  );

  // ── POST /api/gameday/rooms/:roomId/join ────────────────────────────────
  app.post(
    "/api/gameday/rooms/:roomId/join",
    async (req: Request, res: Response) => {
      const { roomId } = req.params;
      const supabase = getServiceSupabase();

      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("id, status, archived_at")
        .eq("id", roomId)
        .single();
      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      if ((room as any).archived_at) {
        res.status(410).json({ error: "This Game Day room is no longer active." });
        return;
      }

      const { userId, guestSessionId: existingSession } =
        await getCallerIdentity(req);

      // ── Logged-in user ──
      if (userId) {
        const { data: existing } = await supabase
          .from("gameday_participants")
          .select("*")
          .eq("room_id", roomId)
          .eq("user_id", userId)
          .maybeSingle();
        if (existing) {
          res.json({ participant: existing });
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, username")
          .eq("id", userId)
          .maybeSingle();
        const rawName =
          (profile as any)?.display_name || (profile as any)?.username || "Player";

        // Ensure uniqueness — append number if needed
        let displayName = rawName;
        const { data: nameTaken } = await supabase
          .from("gameday_participants")
          .select("id")
          .eq("room_id", roomId)
          .eq("display_name", displayName)
          .maybeSingle();
        if (nameTaken) {
          displayName = `${rawName} (2)`;
        }

        const { data: participant, error } = await supabase
          .from("gameday_participants")
          .insert({
            room_id: roomId,
            user_id: userId,
            display_name: displayName,
            is_guest: false,
          })
          .select()
          .single();

        if (error) {
          console.error("[gameday] join error (logged-in):", error);
          res.status(500).json({
            error: `Could not join room: ${error.message ?? "unknown database error"}`,
          });
          return;
        }

        await logEvent(
          supabase,
          roomId,
          participant.id,
          userId,
          "participant_joined",
          { participant_type: "logged_in" }
        );
        res.json({ participant });
        return;
      }

      // ── Guest ──
      const { display_name } = req.body as { display_name?: string };
      if (!display_name?.trim()) {
        res.status(400).json({ error: "display_name is required" });
        return;
      }
      const trimmedName = display_name.trim();

      const { data: nameTaken } = await supabase
        .from("gameday_participants")
        .select("id")
        .eq("room_id", roomId)
        .ilike("display_name", trimmedName)
        .maybeSingle();
      if (nameTaken) {
        res.status(409).json({
          error: `${trimmedName} is already taken in this room. Try ${trimmedName[0]}. or another name.`,
        });
        return;
      }

      const guestSessionId = `gs_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 12)}`;

      const { data: participant, error } = await supabase
        .from("gameday_participants")
        .insert({
          room_id: roomId,
          display_name: trimmedName,
          is_guest: true,
          guest_session_id: guestSessionId,
        })
        .select()
        .single();

      if (error) {
        console.error("[gameday] join error (guest):", error);
        if ((error as any).code === "23505") {
          res
            .status(409)
            .json({ error: `${trimmedName} is already taken in this room.` });
          return;
        }
        res.status(500).json({
          error: `Could not join room: ${(error as any).message ?? "unknown database error"}`,
        });
        return;
      }

      await logEvent(
        supabase,
        roomId,
        participant.id,
        null,
        "participant_joined",
        { participant_type: "guest" }
      );
      res.json({ participant, guest_session_id: guestSessionId });
    }
  );

  // ── PATCH /api/gameday/cards/:cardId/open ───────────────────────────────
  app.patch(
    "/api/gameday/cards/:cardId/open",
    async (req: Request, res: Response) => {
      const { cardId } = req.params;
      const supabase = getServiceSupabase();

      const { data: card } = await supabase
        .from("gameday_pick_cards")
        .select("id, room_id, gameday_rooms(host_user_id)")
        .eq("id", cardId)
        .single();

      if (!card) {
        res.status(404).json({ error: "Card not found" });
        return;
      }
      const operator = await requireGamedayRoomOperator(req, res, supabase, card.room_id);
      if (!operator) return;

      // Close any other open card in this room
      await supabase
        .from("gameday_pick_cards")
        .update({ status: "closed", updated_at: new Date().toISOString() })
        .eq("room_id", card.room_id)
        .eq("status", "open");

      await supabase
        .from("gameday_pick_cards")
        .update({ status: "open", updated_at: new Date().toISOString() })
        .eq("id", cardId);

      await logEvent(supabase, card.room_id, null, operator.hostId, "card_opened", {
        card_id: cardId,
        operator: operator.kind,
      });
      res.json({ ok: true });
    }
  );

  // ── PATCH /api/gameday/cards/:cardId/lock ───────────────────────────────
  app.patch(
    "/api/gameday/cards/:cardId/lock",
    async (req: Request, res: Response) => {
      const { cardId } = req.params;
      const supabase = getServiceSupabase();

      const { data: card } = await supabase
        .from("gameday_pick_cards")
        .select("id, room_id, gameday_rooms(host_user_id)")
        .eq("id", cardId)
        .single();

      if (!card) {
        res.status(404).json({ error: "Card not found" });
        return;
      }
      const operator = await requireGamedayRoomOperator(req, res, supabase, card.room_id);
      if (!operator) return;

      await supabase
        .from("gameday_pick_cards")
        .update({ status: "locked", updated_at: new Date().toISOString() })
        .eq("id", cardId);

      await logEvent(supabase, card.room_id, null, operator.hostId, "card_locked", {
        card_id: cardId,
        operator: operator.kind,
      });
      res.json({ ok: true });
    }
  );

  // ── POST /api/gameday/props/:propId/pick ────────────────────────────────
  app.post(
    "/api/gameday/props/:propId/pick",
    async (req: Request, res: Response) => {
      const { propId } = req.params;
      const { selected_answer } = req.body as { selected_answer?: string };

      if (!selected_answer) {
        res.status(400).json({ error: "selected_answer is required" });
        return;
      }

      const supabase = getServiceSupabase();

      const { data: prop } = await supabase
        .from("gameday_props")
        .select("*, gameday_pick_cards(status, room_id, gameday_rooms(archived_at))")
        .eq("id", propId)
        .single();

      if (!prop) {
        res.status(404).json({ error: "Prop not found" });
        return;
      }

      const roomArchived = (prop.gameday_pick_cards as any)?.gameday_rooms?.archived_at;
      if (roomArchived) {
        res.status(410).json({ error: "This Game Day room is no longer active." });
        return;
      }
      const cardStatus = (prop.gameday_pick_cards as any)?.status;
      if (cardStatus !== "open") {
        res.status(400).json({ error: "This pick card is not open" });
        return;
      }

      const options = prop.answer_options as string[];
      if (!options.includes(selected_answer)) {
        res.status(400).json({ error: "Invalid answer option" });
        return;
      }

      const { userId, guestSessionId } = await getCallerIdentity(req);
      const roomId = (prop.gameday_pick_cards as any)?.room_id;

      let participant = null;
      if (userId) {
        const { data } = await supabase
          .from("gameday_participants")
          .select("*")
          .eq("room_id", roomId)
          .eq("user_id", userId)
          .maybeSingle();
        participant = data;
      } else if (guestSessionId) {
        const { data } = await supabase
          .from("gameday_participants")
          .select("*")
          .eq("guest_session_id", guestSessionId)
          .maybeSingle();
        participant = data;
      }

      if (!participant) {
        res.status(401).json({ error: "Join the room first before picking" });
        return;
      }

      const { data: pick, error } = await supabase
        .from("gameday_picks")
        .upsert(
          {
            prop_id: propId,
            participant_id: participant.id,
            selected_answer,
            is_correct: null,
          },
          { onConflict: "prop_id,participant_id" }
        )
        .select()
        .single();

      if (error) {
        console.error("[gameday] pick error:", error);
        res.status(500).json({
          error: `Could not save pick: ${error.message ?? "unknown database error"}`,
        });
        return;
      }

      await logEvent(supabase, roomId, participant.id, userId, "pick_submitted", {
        prop_id: propId,
      });
      res.json({ ok: true, pick });
    }
  );

  // ── PATCH /api/gameday/props/:propId/settle ─────────────────────────────
  app.patch(
    "/api/gameday/props/:propId/settle",
    async (req: Request, res: Response) => {
      const { propId } = req.params;
      const { correct_answer } = req.body as { correct_answer?: string };

      if (!correct_answer) {
        res.status(400).json({ error: "correct_answer is required" });
        return;
      }

      const supabase = getServiceSupabase();

      const { data: prop } = await supabase
        .from("gameday_props")
        .select(
          "id, answer_options, gameday_pick_cards(id, phase, status, room_id, gameday_rooms(host_user_id, status, room_code, source))"
        )
        .eq("id", propId)
        .single();

      if (!prop) {
        res.status(404).json({ error: "Prop not found" });
        return;
      }

      const card = prop.gameday_pick_cards as any;
      const gdRoom = card?.gameday_rooms as any;
      const operator = await requireGamedayRoomOperator(req, res, supabase, card?.room_id);
      if (!operator) return;

      if (gdRoom?.status === "finalized") {
        res.status(400).json({ error: "Room is finalized — results are read-only" });
        return;
      }

      const options = prop.answer_options as string[];
      if (!options.includes(correct_answer)) {
        res.status(400).json({ error: "Invalid correct answer" });
        return;
      }

      // Shared helper: update prop, score picks, cascade card status if complete.
      await settlePropCore(supabase, { propId, cardId: card.id, correctAnswer: correct_answer });

      const roomId = card?.room_id;
      await logEvent(supabase, roomId, null, operator.hostId, "prop_settled", {
        prop_id: propId,
        card_id: card?.id,
        phase: card?.phase,
        correct_answer,
        operator: operator.kind,
      });
      res.json({ ok: true });
    }
  );

  // ── PATCH /api/gameday/rooms/:roomId/finalize ───────────────────────────
  app.patch(
    "/api/gameday/rooms/:roomId/finalize",
    async (req: Request, res: Response) => {
      const { roomId } = req.params;
      const supabase = getServiceSupabase();

      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("host_user_id, status")
        .eq("id", roomId)
        .single();

      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      const operator = await requireGamedayRoomOperator(req, res, supabase, roomId);
      if (!operator) return;
      if (room.status === "finalized") {
        console.log(`[gameday] finalize: room ${roomId} already finalized`);
        res.json({ ok: true, already: true });
        return;
      }

      console.log(`[gameday] finalize: attempting to write status=finalized for room ${roomId}, operator=${operator.kind}, stored host_user_id=${room.host_user_id}`);

      const { error: updateError } = await supabase
        .from("gameday_rooms")
        .update({ status: "finalized" })
        .eq("id", roomId);

      if (updateError) {
        console.error(`[gameday] finalize: DB update FAILED for room ${roomId}:`, updateError.message, updateError);
        res.status(500).json({ error: `Failed to finalize room: ${updateError.message}` });
        return;
      }

      // Verify the write landed
      const { data: verify } = await supabase
        .from("gameday_rooms")
        .select("status")
        .eq("id", roomId)
        .single();
      console.log(`[gameday] finalize: write confirmed, status is now: ${verify?.status}`);

      await logEvent(supabase, roomId, null, operator.hostId, "room_finalized", {
        operator: operator.kind,
      });
      res.json({ ok: true });
    }
  );

  // ── PATCH /api/gameday/rooms/:roomId/archive ─────────────────────────────
  // Soft-deletes an owned web-hosted room by setting archived_at = now().
  // Discord rooms are operated only through the guild-scoped bot lifecycle.
  app.patch(
    "/api/gameday/rooms/:roomId/archive",
    async (req: Request, res: Response) => {
      const hostId = await requireGamedayHost(req, res);
      if (!hostId) return;

      const { roomId } = req.params;
      const supabase = getServiceSupabase();

      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("host_user_id, status, archived_at, source")
        .eq("id", roomId)
        .single();

      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      if (!requireOwnedHumanRoom(res, (room as any).host_user_id, hostId)) return;
      if ((room as any).status === "finalized") {
        res.status(400).json({
          error: "Finalized rooms cannot be archived — they are preserved as receipts.",
        });
        return;
      }
      if ((room as any).archived_at) {
        // Already archived — idempotent success.
        res.json({ ok: true, already: true });
        return;
      }

      const { error: updateError } = await supabase
        .from("gameday_rooms")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", roomId);

      if (updateError) {
        console.error("[gameday] archive error:", updateError.message);
        res.status(500).json({ error: "Failed to archive room" });
        return;
      }

      await logEvent(supabase, roomId, null, hostId, "room_archived", {
        archived_by: hostId,
        source: (room as any).source ?? "app",
      });

      console.log(`[gameday] room archived: ${roomId} by ${hostId.slice(0, 8)}…`);
      res.json({ ok: true });
    }
  );

  // ── PATCH /api/gameday/rooms/:roomId/rename ──────────────────────────────
  // Updates the display name of a room. Host-only. Works on any non-archived room.
  app.patch(
    "/api/gameday/rooms/:roomId/rename",
    async (req: Request, res: Response) => {
      const hostId = await requireGamedayHost(req, res);
      if (!hostId) return;

      const { roomId } = req.params;
      const { room_name } = req.body as { room_name?: string };

      const trimmed = (room_name ?? "").trim();
      if (!trimmed) {
        res.status(400).json({ error: "room_name is required" });
        return;
      }
      if (trimmed.length > 120) {
        res.status(400).json({ error: "room_name must be 120 characters or fewer" });
        return;
      }

      const supabase = getServiceSupabase();

      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("host_user_id, archived_at")
        .eq("id", roomId)
        .single();

      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      if (!requireOwnedHumanRoom(res, (room as any).host_user_id, hostId)) return;
      if ((room as any).archived_at) {
        res.status(400).json({ error: "Archived rooms cannot be renamed" });
        return;
      }

      const { error: updateError } = await supabase
        .from("gameday_rooms")
        .update({ room_name: trimmed })
        .eq("id", roomId);

      if (updateError) {
        console.error("[gameday] rename error:", updateError.message);
        res.status(500).json({ error: "Failed to rename room" });
        return;
      }

      await logEvent(supabase, roomId, null, hostId, "room_renamed", {
        new_name: trimmed,
      });

      console.log(`[gameday] room renamed: ${roomId} → "${trimmed}"`);
      res.json({ ok: true, room_name: trimmed });
    }
  );

  // ── PATCH /api/gameday/rooms/:roomId/visibility ──────────────────────────
  // Toggles is_private on a room. Host-only.
  app.patch(
    "/api/gameday/rooms/:roomId/visibility",
    async (req: Request, res: Response) => {
      const hostId = await requireGamedayHost(req, res);
      if (!hostId) return;

      const { roomId } = req.params;
      const { is_private } = req.body as { is_private?: boolean };

      if (typeof is_private !== "boolean") {
        res.status(400).json({ error: "is_private must be a boolean" });
        return;
      }

      const supabase = getServiceSupabase();
      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("host_user_id, archived_at")
        .eq("id", roomId)
        .single();

      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      if (!requireOwnedHumanRoom(res, (room as any).host_user_id, hostId)) return;

      const { error: updateError } = await supabase
        .from("gameday_rooms")
        .update({ is_private })
        .eq("id", roomId);

      if (updateError) {
        console.error("[gameday] visibility update error:", updateError.message);
        res.status(500).json({ error: "Failed to update visibility" });
        return;
      }

      console.log(`[gameday] room ${roomId} visibility → is_private=${is_private}`);
      res.json({ ok: true, is_private });
    }
  );

  // ── POST /api/gameday/rooms/:roomId/duplicate ────────────────────────────
  // Clones a room's structure (teams, stars, props) into a brand-new room.
  // All cards reset to "closed", all props reset to "pending" (no picks/participants
  // are copied). Works on any room status including archived.
  app.post(
    "/api/gameday/rooms/:roomId/duplicate",
    async (req: Request, res: Response) => {
      const hostId = await requireGamedayHost(req, res);
      if (!hostId) return;

      const { roomId } = req.params;
      const { room_name: customName } = req.body as { room_name?: string };
      const supabase = getServiceSupabase();

      // ── 1. Fetch source room ──────────────────────────────────────────────
      const sourceRoomResult = await supabase
        .from("gameday_rooms")
        .select("id, host_user_id, room_name, team_a_name, team_b_name, team_a_star, team_b_star, game_date, game_start_time, sport, template_type, slate_config, is_private")
        .eq("id", roomId)
        .single();
      let srcRoom: any = sourceRoomResult.data;
      let srcRoomError: any = sourceRoomResult.error;
      if (srcRoomError?.message?.includes("template_type") || srcRoomError?.message?.includes("slate_config")) {
        const legacy = await supabase
          .from("gameday_rooms")
          .select("id, host_user_id, room_name, team_a_name, team_b_name, team_a_star, team_b_star, game_date, game_start_time, sport, is_private")
          .eq("id", roomId)
          .single();
        srcRoom = legacy.data;
        srcRoomError = legacy.error;
      }

      if (srcRoomError || !srcRoom) {
        res.status(404).json({ error: "Source room not found" });
        return;
      }
      if (!requireOwnedHumanRoom(res, (srcRoom as any).host_user_id, hostId)) return;

      // ── 2. Fetch source cards + props ─────────────────────────────────────
      const { data: srcCards } = await supabase
        .from("gameday_pick_cards")
        .select("phase, title, display_order, scheduled_open_at, scheduled_lock_at, gameday_props(question, answer_options, display_order, template_prop_id)")
        .eq("room_id", roomId)
        .order("display_order");

      if (!srcCards || srcCards.length === 0) {
        res.status(400).json({ error: "Source room has no cards to duplicate" });
        return;
      }

      // ── 3. Determine name for the new room ────────────────────────────────
      const newName = (customName ?? "").trim() || `Copy of ${(srcRoom as any).room_name}`;
      if (newName.length > 120) {
        res.status(400).json({ error: "room_name must be 120 characters or fewer" });
        return;
      }

      // ── 4. Generate a unique room code ────────────────────────────────────
      let roomCode: string | undefined;
      try {
        roomCode = await generateUniqueRoomCode(supabase);
      } catch (e) {
        console.warn("[gameday] room_code generation skipped during duplicate:", e);
      }

      // ── 5. Create the new room ────────────────────────────────────────────
      const newRoomPayload: Record<string, unknown> = {
        room_name:    newName,
        team_a_name:  (srcRoom as any).team_a_name,
        team_b_name:  (srcRoom as any).team_b_name,
        team_a_star:  (srcRoom as any).team_a_star,
        team_b_star:  (srcRoom as any).team_b_star,
        game_date:    (srcRoom as any).game_date ?? null,
        game_start_time: (srcRoom as any).game_start_time ?? null,
        host_user_id: hostId,
        status:       "active",
        source:       "app",
        is_private:   (srcRoom as any).is_private ?? true,
      };
      if ((srcRoom as any).sport) newRoomPayload.sport = (srcRoom as any).sport;
      if ((srcRoom as any).template_type) newRoomPayload.template_type = (srcRoom as any).template_type;
      if ((srcRoom as any).slate_config) newRoomPayload.slate_config = (srcRoom as any).slate_config;
      if (roomCode) newRoomPayload.room_code = roomCode;

      const { data: newRoom, error: roomErr } = await supabase
        .from("gameday_rooms")
        .insert(newRoomPayload)
        .select()
        .single();

      if (roomErr || !newRoom) {
        console.error("[gameday] duplicate room insert error:", roomErr);
        res.status(500).json({ error: "Failed to create duplicate room" });
        return;
      }

      // ── 6. Clone cards + props ────────────────────────────────────────────
      for (const srcCard of srcCards as any[]) {
        const { data: newCard } = await supabase
          .from("gameday_pick_cards")
          .insert({
            room_id:       newRoom.id,
            phase:         srcCard.phase,
            title:         srcCard.title,
            display_order: srcCard.display_order,
            status:        "closed",
            scheduled_open_at: srcCard.scheduled_open_at ?? null,
            scheduled_lock_at: srcCard.scheduled_lock_at ?? null,
          })
          .select()
          .single();

        if (!newCard) continue;

        const props = [...(srcCard.gameday_props ?? [])].sort(
          (a: any, b: any) => a.display_order - b.display_order
        );

        for (const srcProp of props) {
          await supabase.from("gameday_props").insert({
            card_id:       (newCard as any).id,
            question:      srcProp.question,
            answer_options: srcProp.answer_options,
            display_order: srcProp.display_order,
            status:        "pending",
            correct_answer: null,
            template_prop_id: srcProp.template_prop_id ?? null,
          });
        }
      }

      await logEvent(supabase, newRoom.id, null, hostId, "room_created", {
        duplicated_from: roomId,
      });

      console.log(`[gameday] room duplicated: ${roomId} → ${newRoom.id} "${newName}"`);
      res.json({ ok: true, room_id: newRoom.id, room_name: newName, room_code: (newRoom as any).room_code ?? null });
    }
  );

  // ── GET /api/gameday/rooms/:roomRef/leaderboard ─────────────────────────
  // roomRef accepts either a UUID or a GDS-XXXXX room code. Public participant
  // access remains unauthenticated; bot reads are additionally guild-scoped.
  app.get(
    "/api/gameday/rooms/:roomRef/leaderboard",
    async (req: Request, res: Response) => {
      const supabase = getServiceSupabase();
      const roomId = await resolveRoomRef(supabase, req.params.roomRef);
      if (!roomId) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      if (isBotApiKeyValid(req)) {
        const discordAccess = await requireDiscordGuildRoom(req, res, supabase, roomId);
        if (!discordAccess) return;
      }

      // Check archived status before doing any further work.
      const { data: roomMeta } = await supabase
        .from("gameday_rooms")
        .select("archived_at")
        .eq("id", roomId)
        .single();
      if ((roomMeta as any)?.archived_at) {
        res.status(410).json({
          ok: false,
          archived: true,
          message: "This Game Day room has been archived and is no longer active.",
        });
        return;
      }

      const { data: participants } = await supabase
        .from("gameday_participants")
        .select("id, display_name, is_guest")
        .eq("room_id", roomId);

      if (!participants?.length) {
        res.json({ leaderboard: [] });
        return;
      }

      const participantIds = participants.map((p: any) => p.id);

      const { data: allPicks } = await supabase
        .from("gameday_picks")
        .select("participant_id, is_correct")
        .in("participant_id", participantIds);

      const scores = participants
        .map((p: any) => {
          const myPicks = (allPicks ?? []).filter(
            (pk: any) => pk.participant_id === p.id
          );
          const correct = myPicks.filter(
            (pk: any) => pk.is_correct === true
          ).length;
          const pending = myPicks.filter(
            (pk: any) => pk.is_correct === null
          ).length;
          return {
            participant_id: p.id,
            display_name: p.display_name,
            is_guest: p.is_guest,
            game_day_sp: correct * 10,
            correct_picks: correct,
            pending_picks: pending,
            total_picks: myPicks.length,
          };
        })
        .sort(
          (a: any, b: any) =>
            b.game_day_sp - a.game_day_sp ||
            b.correct_picks - a.correct_picks
        );

      let rank = 1;
      const leaderboard = scores.map((s: any, i: number) => {
        if (i > 0 && s.game_day_sp < (scores[i - 1] as any).game_day_sp)
          rank = i + 1;
        return { ...s, rank };
      });

      res.json({ leaderboard });
    }
  );

  // ── GET /api/gameday/rooms/:roomRef/final-standings ─────────────────────
  // Returns final standings for a finalized room.
  // roomRef accepts either a UUID or a GDS-XXXXX room code. Public participant
  // access remains unauthenticated; bot reads are additionally guild-scoped.
  // Returns { finalized: false } if the room is not yet finalized.
  app.get(
    "/api/gameday/rooms/:roomRef/final-standings",
    async (req: Request, res: Response) => {
      const supabase = getServiceSupabase();
      const roomId = await resolveRoomRef(supabase, req.params.roomRef);
      if (!roomId) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      if (isBotApiKeyValid(req)) {
        const discordAccess = await requireDiscordGuildRoom(req, res, supabase, roomId);
        if (!discordAccess) return;
      }

      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("id, room_name, room_code, status, archived_at, team_a_name, team_b_name, team_a_star, team_b_star, game_date")
        .eq("id", roomId)
        .single();

      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }

      // Archived rooms are no longer active — return 410 before any standings logic.
      if ((room as any).archived_at) {
        res.status(410).json({
          ok: false,
          archived: true,
          message: "This Game Day room has been archived and is no longer active.",
        });
        return;
      }

      if ((room as any).status !== "finalized") {
        res.json({
          finalized: false,
          message: "This Game Day room is not finalized yet.",
        });
        return;
      }

      const roomCode = (room as any).room_code ?? null;
      const publicLink = roomCode
        ? `${APP_URL}/g/${roomCode}`
        : `${APP_URL}/gameday/${roomId}`;

      // Participants
      const { data: participants } = await supabase
        .from("gameday_participants")
        .select("id, display_name, is_guest")
        .eq("room_id", roomId);

      // Picks for scoring
      const participantIds = (participants ?? []).map((p: any) => p.id);
      let leaderboard: any[] = [];
      if (participantIds.length > 0) {
        const { data: allPicks } = await supabase
          .from("gameday_picks")
          .select("participant_id, is_correct")
          .in("participant_id", participantIds);

        const scores = (participants ?? [])
          .map((p: any) => {
            const myPicks = (allPicks ?? []).filter(
              (pk: any) => pk.participant_id === p.id
            );
            const correct = myPicks.filter((pk: any) => pk.is_correct === true).length;
            const pending = myPicks.filter((pk: any) => pk.is_correct === null).length;
            return {
              participant_id: p.id,
              display_name: p.display_name,
              is_guest: p.is_guest,
              game_day_sp: correct * 10,
              correct_picks: correct,
              pending_picks: pending,
              total_picks: myPicks.length,
            };
          })
          .sort(
            (a: any, b: any) =>
              b.game_day_sp - a.game_day_sp || b.correct_picks - a.correct_picks
          );

        let rank = 1;
        leaderboard = scores.map((s: any, i: number) => {
          if (i > 0 && s.game_day_sp < (scores[i - 1] as any).game_day_sp) rank = i + 1;
          return { ...s, rank };
        });
      }

      // Total props
      const { count: totalProps } = await supabase
        .from("gameday_props")
        .select("id", { count: "exact", head: true })
        .in(
          "card_id",
          (
            await supabase
              .from("gameday_pick_cards")
              .select("id")
              .eq("room_id", roomId)
          ).data?.map((c: any) => c.id) ?? []
        );

      res.json({
        finalized: true,
        room_id: roomId,
        room_code: roomCode,
        public_link: publicLink,
        matchup: {
          team_a: (room as any).team_a_name,
          team_b: (room as any).team_b_name,
          star_a: (room as any).team_a_star,
          star_b: (room as any).team_b_star,
          game_date: (room as any).game_date,
          room_name: (room as any).room_name,
        },
        winner: leaderboard[0] ?? null,
        leaderboard,
        total_participants: (participants ?? []).length,
        total_props: totalProps ?? 0,
      });
    }
  );

  // ── POST /api/gameday/rooms/:roomId/final-standings-viewed ─────────────
  // Logs a single final_standings_viewed event per participant per session.
  // Called client-side once, guarded by a ref so polling never re-triggers it.
  app.post(
    "/api/gameday/rooms/:roomId/final-standings-viewed",
    async (req: Request, res: Response) => {
      const { roomId } = req.params;
      const supabase = getServiceSupabase();

      // Resolve caller — works for both logged-in users and guests
      const { userId, guestSessionId } = await getCallerIdentity(req);

      // Look up participant so we can attach participant_id to the event
      let participantId: string | null = null;
      if (userId) {
        const { data: p } = await supabase
          .from("gameday_participants")
          .select("id")
          .eq("room_id", roomId)
          .eq("user_id", userId)
          .maybeSingle();
        participantId = p?.id ?? null;
      } else if (guestSessionId) {
        const { data: p } = await supabase
          .from("gameday_participants")
          .select("id")
          .eq("room_id", roomId)
          .eq("guest_session_id", guestSessionId)
          .maybeSingle();
        participantId = p?.id ?? null;
      }

      await logEvent(supabase, roomId, participantId, userId, "final_standings_viewed", {
        participant_type: userId ? "logged_in" : "guest",
      });

      res.json({ ok: true });
    }
  );

  // ── GET /api/gameday/rooms/:roomId/host-data ────────────────────────────
  // Extended host view: includes pick counts per prop for settlement UI
  app.get(
    "/api/gameday/rooms/:roomId/host-data",
    async (req: Request, res: Response) => {
      const hostId = await requireGamedayHost(req, res);
      if (!hostId) return;

      const { roomId } = req.params;
      const supabase = getServiceSupabase();

      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("*")
        .eq("id", roomId)
        .single();

      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      if (!requireOwnedHumanRoom(res, (room as any).host_user_id, hostId)) return;

      // Backfill room_code for rooms created before the short-code feature launched.
      if (!(room as any).room_code) {
        try {
          const newCode = await generateUniqueRoomCode(supabase);
          await supabase.from("gameday_rooms").update({ room_code: newCode }).eq("id", roomId);
          (room as any).room_code = newCode;
          console.log(`[gameday] backfilled room_code ${newCode} for room ${roomId}`);
        } catch (e) {
          console.warn("[gameday] room_code backfill failed (non-fatal):", e);
        }
      }

      const { data: rawCards } = await supabase
        .from("gameday_pick_cards")
        .select("*, gameday_props(*)")
        .eq("room_id", roomId)
        .order("display_order");

      const cards = (rawCards ?? []).map((card) => ({
        ...card,
        gameday_props: [...((card.gameday_props as unknown[]) ?? [])].sort(
          (a: any, b: any) => a.display_order - b.display_order
        ),
      }));

      // Pick counts per prop (for settlement UI)
      const allPropIds = cards.flatMap((c) =>
        ((c.gameday_props as any[]) ?? []).map((p: any) => p.id)
      );

      const pickCounts: Record<string, Record<string, number>> = {};
      if (allPropIds.length > 0) {
        const { data: allPicks } = await supabase
          .from("gameday_picks")
          .select("prop_id, selected_answer")
          .in("prop_id", allPropIds);
        for (const pick of allPicks ?? []) {
          const pid = (pick as any).prop_id;
          const ans = (pick as any).selected_answer;
          if (!pickCounts[pid]) pickCounts[pid] = {};
          pickCounts[pid][ans] = (pickCounts[pid][ans] ?? 0) + 1;
        }
      }

      const { count: participantCount } = await supabase
        .from("gameday_participants")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId);

      // Leaderboard
      const { data: participants } = await supabase
        .from("gameday_participants")
        .select("id, display_name, is_guest")
        .eq("room_id", roomId);

      const participantIds = (participants ?? []).map((p: any) => p.id);
      let leaderboard: any[] = [];
      if (participantIds.length > 0) {
        const { data: allPicksLb } = await supabase
          .from("gameday_picks")
          .select("participant_id, is_correct")
          .in("participant_id", participantIds);

        const scores = (participants ?? [])
          .map((p: any) => {
            const myPicks = (allPicksLb ?? []).filter(
              (pk: any) => pk.participant_id === p.id
            );
            const correct = myPicks.filter(
              (pk: any) => pk.is_correct === true
            ).length;
            return {
              participant_id: p.id,
              display_name: p.display_name,
              game_day_sp: correct * 10,
              correct_picks: correct,
            };
          })
          .sort(
            (a: any, b: any) =>
              b.game_day_sp - a.game_day_sp || b.correct_picks - a.correct_picks
          );

        let rank = 1;
        leaderboard = scores.map((s: any, i: number) => {
          if (i > 0 && s.game_day_sp < (scores[i - 1] as any).game_day_sp)
            rank = i + 1;
          return { ...s, rank };
        });
      }

      res.json({
        room,
        cards,
        pick_counts: pickCounts,
        participant_count: participantCount ?? 0,
        leaderboard,
      });
    }
  );

  // ── PATCH /api/gameday/rooms/:roomId/status ─────────────────────────────
  app.patch(
    "/api/gameday/rooms/:roomId/status",
    async (req: Request, res: Response) => {
      const hostId = await requireGamedayHost(req, res);
      if (!hostId) return;

      const { roomId } = req.params;
      const { status } = req.body as { status?: string };
      const allowed = ["draft", "active", "finalized"];
      if (!status || !allowed.includes(status)) {
        res.status(400).json({ error: "Invalid status" });
        return;
      }

      const supabase = getServiceSupabase();
      const { data: room } = await supabase
        .from("gameday_rooms")
        .select("host_user_id")
        .eq("id", roomId)
        .single();

      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }
      if (!requireOwnedHumanRoom(res, (room as any).host_user_id, hostId)) return;

      await supabase
        .from("gameday_rooms")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", roomId);

      res.json({ ok: true });
    }
  );

  // ── POST /api/gameday/rooms/:roomId/countdown ─────────────────────────────
  // Host-only: set a manual countdown notice in the participant room.
  // This is a communication aid only — it does NOT open or lock cards.
  app.post(
    "/api/gameday/rooms/:roomId/countdown",
    async (req: Request, res: Response) => {
      const hostId = await requireGamedayHost(req, res);
      if (!hostId) return;

      const { roomId } = req.params;
      const { phase, countdown_type, duration_minutes } = req.body as {
        phase?: string;
        countdown_type?: string;
        duration_minutes?: number;
      };

      const validPhases = ["pregame", "halftime", "fourth", "final_push", "penalties"];
      const validTypes = ["opens_soon", "locks_soon"];
      const validDurations = [5, 10];

      if (!phase || !validPhases.includes(phase)) {
        res.status(400).json({ error: "Invalid phase" });
        return;
      }
      if (!countdown_type || !validTypes.includes(countdown_type)) {
        res.status(400).json({ error: "Invalid countdown_type" });
        return;
      }
      if (!duration_minutes || !validDurations.includes(duration_minutes)) {
        res.status(400).json({ error: "duration_minutes must be 5 or 10" });
        return;
      }

      const supabase = getServiceSupabase();
      const { data: cdRoom } = await supabase
        .from("gameday_rooms")
        .select("host_user_id, status, archived_at")
        .eq("id", roomId)
        .single();

      if (!cdRoom) { res.status(404).json({ error: "Room not found" }); return; }
      if (!requireOwnedHumanRoom(res, (cdRoom as any).host_user_id, hostId)) return;
      if ((cdRoom as any).archived_at || (cdRoom as any).status === "finalized") {
        res.status(400).json({ error: "Cannot set countdown on archived or finalized room" }); return;
      }

      const now = new Date();
      const endsAt = new Date(now.getTime() + (duration_minutes as number) * 60 * 1000);

      await supabase
        .from("gameday_rooms")
        .update({
          countdown_phase: phase,
          countdown_type,
          countdown_ends_at: endsAt.toISOString(),
          countdown_started_at: now.toISOString(),
        })
        .eq("id", roomId);

      console.log(`[gameday] countdown set: room=${roomId} phase=${phase} type=${countdown_type} ends=${endsAt.toISOString()}`);
      res.json({ ok: true, countdown_ends_at: endsAt.toISOString() });
    }
  );

  // ── POST /api/gameday/rooms/:roomId/next-room-interest ───────────────────
  // Public: capture intent from a participant who wants to be notified about
  // the next Game Day room. No auth required — guests can submit via email.
  // Stored in local postgres (gameday_next_room_interest table).
  app.post(
    "/api/gameday/rooms/:roomId/next-room-interest",
    async (req: Request, res: Response) => {
      const { roomId } = req.params;
      const {
        email,
        participant_id,
        participant_type,
        room_code,
        entry_source,
        final_rank,
        final_sp,
        is_winner,
      } = req.body as {
        email?: string;
        participant_id?: string;
        participant_type?: string;
        room_code?: string;
        entry_source?: string;
        final_rank?: number;
        final_sp?: number;
        is_winner?: boolean;
      };

      const supabase = getServiceSupabase();

      // Verify the room exists in Supabase
      const { data: rm } = await supabase
        .from("gameday_rooms")
        .select("id, room_code, source")
        .eq("id", roomId)
        .maybeSingle();

      if (!rm) {
        res.status(404).json({ ok: false, error: "Room not found" });
        return;
      }

      const verifiedUser = await getVerifiedGamedayUser(req);
      const userId = verifiedUser?.id ?? null;

      // Insert into Supabase (same DB as all other game day data)
      const { error: insertError } = await supabase
        .from("gameday_next_room_interest")
        .insert({
          room_id: roomId,
          room_code: room_code ?? (rm as any).room_code ?? null,
          participant_id: participant_id ?? null,
          user_id: userId,
          email: email ?? null,
          participant_type: participant_type ?? null,
          room_source: (rm as any).source ?? null,
          entry_source: entry_source ?? null,
          final_rank: final_rank ?? null,
          final_sp: final_sp ?? null,
          is_winner: is_winner ?? null,
        });

      if (insertError) {
        // Log for server-side debugging — still return ok so the UI shows success
        console.error("[gameday] next-room-interest insert error:", insertError.message, insertError.code);
      }

      console.log(`[gameday] next-room-interest: room=${roomId} email=${email ?? "none"} user=${userId ?? "guest"}`);
      res.json({ ok: true });
    }
  );

  // ── Game Day Email Blast ──────────────────────────────────────────────────
  // All blast routes use x-admin-token: MM_ADMIN_TOKEN for auth.
  // Body params (POST): { game_name, room_link }
  // The tracked link (?src=email&utm_source=email&utm_campaign=gameday_tonight)
  // is appended server-side so callers never need to construct it manually.

  function isBlastAdmin(req: Request): boolean {
    const token = req.header("x-admin-token");
    const adminToken = process.env.MM_ADMIN_TOKEN;
    return !!adminToken && token === adminToken;
  }

  function buildTrackedLink(roomLink: string): string {
    const sep = roomLink.includes("?") ? "&" : "?";
    return `${roomLink}${sep}src=email&utm_source=email&utm_campaign=gameday_tonight`;
  }

  // GET /admin/gameday/email-preview/blast?game_name=...&room_link=...
  // Renders the blast email HTML for visual inspection before sending.
  app.get("/admin/gameday/email-preview/blast", (req: Request, res: Response) => {
    const gameName = (req.query.game_name as string | undefined) || "Thunder vs Spurs — WCF Game 6";
    const roomLink = (req.query.room_link as string | undefined) || "https://swayger.app/g/GDS-R78VR";
    const trackedRoomLink = buildTrackedLink(roomLink);
    const html = buildGameDayBlastHtml({
      gameName,
      trackedRoomLink,
      displayName: "Jordan",
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  // POST /admin/gameday/blast-test
  // Sends the blast email to darius@leagueswap.com only.
  // Requires x-admin-token. Full blast is NOT triggered.
  app.post("/admin/gameday/blast-test", async (req: Request, res: Response) => {
    if (!isBlastAdmin(req)) {
      res.status(403).json({ ok: false, error: "Forbidden" });
      return;
    }

    const { game_name, room_link, subject } = req.body as { game_name?: string; room_link?: string; subject?: string };
    if (!game_name || !room_link) {
      res.status(400).json({ ok: false, error: "game_name and room_link are required" });
      return;
    }

    const trackedRoomLink = buildTrackedLink(room_link);
    const TEST_EMAIL = "darius@leagueswype.com";

    try {
      // ── Generate HTML first, inspect before sending ──────────────────────
      const html = buildGameDayBlastHtml({ gameName: game_name, trackedRoomLink });

      // Strip tags to get visible text only (excludes href values, attrs, etc.)
      const visibleText = html.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ");

      const REQUIRED_PHRASE =
        "Game Day Swayger is a live room where everyone makes quick prop picks before the game, at halftime, and in the 4Q";
      const DISALLOWED: { phrase: string; pattern: RegExp }[] = [
        { phrase: "Social Wager Contracts", pattern: /Social Wager Contracts/i },
        { phrase: "prediction game",        pattern: /prediction game/i },
        { phrase: "picks game",             pattern: /picks game/i },
        { phrase: "wager",                  pattern: /\bwager\b/i },
        { phrase: "beta",                   pattern: /\bbeta\b/i },
        { phrase: "test",                   pattern: /\btest\b/i },
      ];

      if (!html.includes(REQUIRED_PHRASE)) {
        throw new Error(`SAFETY FAIL — required phrase not found in HTML: "${REQUIRED_PHRASE}"`);
      }

      const violations = DISALLOWED.filter((d) => d.pattern.test(visibleText));
      if (violations.length > 0) {
        throw new Error(`SAFETY FAIL — disallowed phrase(s) in visible text: ${violations.map((v) => v.phrase).join(", ")}`);
      }

      const resolvedSubject = subject ?? `Tonight's live Game Day Swayger room is open for ${game_name}`;
      const ctaMatch = html.match(/>([^<]*Join Tonight[^<]*)<\/a>/i);
      const ctaText = ctaMatch ? ctaMatch[1].trim() : "NOT FOUND";

      console.log(`[gameday-blast] ── PRE-SEND INSPECTION ──────────────────────────`);
      console.log(`[gameday-blast]  subject     : ${resolvedSubject}`);
      console.log(`[gameday-blast]  CTA button  : ${ctaText}`);
      console.log(`[gameday-blast]  required phrase: PRESENT ✓`);
      console.log(`[gameday-blast]  disallowed  : NONE ✓`);
      console.log(`[gameday-blast]  HTML snippet (first 800 chars):\n${html.slice(0, 800)}`);
      console.log(`[gameday-blast] ────────────────────────────────────────────────`);

      const resendId = await sendGameDayBlastEmail({
        to: TEST_EMAIL,
        displayName: "Darius",
        userId: "test-preview",
        gameName: game_name,
        trackedRoomLink,
        subject,
      });
      console.log(`[gameday-blast] Test email sent to ${TEST_EMAIL} resend_id=${resendId ?? "none"}`);

      // Log the test send (non-fatal — never block the response)
      const supabase = getServiceSupabase();
      const roomCodeMatch = room_link.match(/\/g\/([A-Z0-9-]+)/i);
      const roomCode = roomCodeMatch ? roomCodeMatch[1] : null;
      supabase.from("gameday_email_sends").insert({
        campaign_name: game_name,
        recipient_email: TEST_EMAIL,
        user_id: null,
        resend_message_id: resendId,
        room_id: null,
        room_code: roomCode,
        room_link: trackedRoomLink,
        is_test: true,
      }).then(({ error }) => {
        if (error) console.warn("[gameday-blast] Failed to log test send:", error.message);
      });

      res.json({ ok: true, sent_to: TEST_EMAIL, tracked_link: trackedRoomLink, subject: resolvedSubject, cta: ctaText, resend_message_id: resendId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[gameday-blast] Test send failed:", msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // POST /admin/gameday/blast-send
  // Sends the blast to ALL eligible users — combines:
  //   1. profiles with notification_email set (not unsubscribed)
  //   2. auth-only users (email from auth.users, no notification_email on profile)
  // Requires x-admin-token AND { confirmed: true }.
  app.post("/admin/gameday/blast-send", async (req: Request, res: Response) => {
    if (!isBlastAdmin(req)) {
      res.status(403).json({ ok: false, error: "Forbidden" });
      return;
    }

    const { game_name, room_link, confirmed, subject } = req.body as {
      game_name?: string;
      room_link?: string;
      confirmed?: boolean;
      subject?: string;
    };

    if (!game_name || !room_link) {
      res.status(400).json({ ok: false, error: "game_name and room_link are required" });
      return;
    }
    if (confirmed !== true) {
      res.status(400).json({ ok: false, error: "confirmed: true is required to send the full blast" });
      return;
    }

    const supabase = getServiceSupabase();
    type Recipient = { id: string; email: string; displayName: string };
    const recipients: Recipient[] = [];
    const seenIds = new Set<string>();

    // Source 1: profiles with explicit notification_email
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, notification_email, display_name, username, email_unsubscribed")
      .not("notification_email", "is", null)
      .neq("email_unsubscribed", true);

    if (profilesErr) {
      console.error("[gameday-blast] Failed to fetch profiles:", profilesErr.message);
      res.status(500).json({ ok: false, error: profilesErr.message });
      return;
    }
    for (const p of (profiles ?? []) as { id: string; notification_email: string; display_name?: string | null; username: string }[]) {
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      recipients.push({ id: p.id, email: p.notification_email, displayName: p.display_name || p.username });
    }

    // Source 2: auth-only users (have auth email but no notification_email on profile)
    const { data: authProfiles, error: authErr } = await supabase.rpc("get_auth_only_profiles");
    if (authErr) {
      console.warn("[gameday-blast] get_auth_only_profiles RPC failed — skipping auth-only users:", authErr.message);
    } else {
      for (const p of (authProfiles ?? []) as { id: string; notification_email: string; display_name: string | null; username: string; email_unsubscribed: boolean }[]) {
        if (seenIds.has(p.id) || p.email_unsubscribed || !p.notification_email) continue;
        seenIds.add(p.id);
        recipients.push({ id: p.id, email: p.notification_email, displayName: p.display_name || p.username });
      }
    }

    const trackedRoomLink = buildTrackedLink(room_link);
    const roomCodeMatch = room_link.match(/\/g\/([A-Z0-9-]+)/i);
    const roomCode = roomCodeMatch ? roomCodeMatch[1] : null;
    let sent = 0;
    let failed = 0;
    let stored = 0;
    const logRows: object[] = [];

    for (const r of recipients) {
      try {
        const resendId = await sendGameDayBlastEmail({
          to: r.email,
          displayName: r.displayName,
          userId: r.id,
          gameName: game_name,
          trackedRoomLink,
          subject,
        });
        sent++;
        logRows.push({
          campaign_name: game_name,
          recipient_email: r.email,
          user_id: r.id,
          resend_message_id: resendId,
          room_id: null,
          room_code: roomCode,
          room_link: trackedRoomLink,
          is_test: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[gameday-blast] Failed for ${r.email}:`, msg);
        failed++;
      }
    }

    // Bulk-insert all send records (non-fatal)
    if (logRows.length > 0) {
      const { error: logErr } = await supabase.from("gameday_email_sends").insert(logRows);
      if (logErr) {
        console.warn("[gameday-blast] Failed to log send records:", logErr.message);
      } else {
        stored = logRows.length;
      }
    }

    console.log(`[gameday-blast] Full blast complete — sent=${sent} failed=${failed} stored=${stored} total=${recipients.length} game="${game_name}"`);
    res.json({ ok: true, sent, failed, stored_message_ids: stored, total_eligible: recipients.length, tracked_link: trackedRoomLink });
  });

  // POST /admin/gameday/blast-catchup
  // Sends only to auth-only users (those missed by the original blast-send).
  // Use after a blast-send that went to notification_email users only.
  app.post("/admin/gameday/blast-catchup", async (req: Request, res: Response) => {
    if (!isBlastAdmin(req)) {
      res.status(403).json({ ok: false, error: "Forbidden" });
      return;
    }

    const { game_name, room_link, confirmed, subject } = req.body as {
      game_name?: string;
      room_link?: string;
      confirmed?: boolean;
      subject?: string;
    };

    if (!game_name || !room_link) {
      res.status(400).json({ ok: false, error: "game_name and room_link are required" });
      return;
    }
    if (confirmed !== true) {
      res.status(400).json({ ok: false, error: "confirmed: true is required" });
      return;
    }

    const supabase = getServiceSupabase();
    const { data: authProfiles, error: authErr } = await supabase.rpc("get_auth_only_profiles");
    if (authErr) {
      console.error("[gameday-blast-catchup] get_auth_only_profiles RPC failed:", authErr.message);
      res.status(500).json({ ok: false, error: authErr.message });
      return;
    }

    const eligible = ((authProfiles ?? []) as { id: string; notification_email: string; display_name: string | null; username: string; email_unsubscribed: boolean }[])
      .filter((p) => p.notification_email && !p.email_unsubscribed);

    const trackedRoomLink = buildTrackedLink(room_link);
    const roomCodeMatch = room_link.match(/\/g\/([A-Z0-9-]+)/i);
    const roomCode = roomCodeMatch ? roomCodeMatch[1] : null;
    let sent = 0;
    let failed = 0;
    let stored = 0;
    const logRows: object[] = [];

    for (const p of eligible) {
      try {
        const resendId = await sendGameDayBlastEmail({
          to: p.notification_email,
          displayName: p.display_name || p.username,
          userId: p.id,
          gameName: game_name,
          trackedRoomLink,
          subject,
        });
        sent++;
        logRows.push({
          campaign_name: game_name,
          recipient_email: p.notification_email,
          user_id: p.id,
          resend_message_id: resendId,
          room_id: null,
          room_code: roomCode,
          room_link: trackedRoomLink,
          is_test: false,
        });
        await new Promise((r) => setTimeout(r, 150)); // gentle rate limiting
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[gameday-blast-catchup] Failed for ${p.notification_email}:`, msg);
        failed++;
      }
    }

    // Bulk-insert all send records (non-fatal)
    if (logRows.length > 0) {
      const { error: logErr } = await supabase.from("gameday_email_sends").insert(logRows);
      if (logErr) {
        console.warn("[gameday-blast-catchup] Failed to log send records:", logErr.message);
      } else {
        stored = logRows.length;
      }
    }

    console.log(`[gameday-blast-catchup] Catchup complete — sent=${sent} failed=${failed} stored=${stored} total=${eligible.length}`);
    res.json({ ok: true, sent, failed, stored_message_ids: stored, total_eligible: eligible.length, tracked_link: trackedRoomLink });
  });

  // ── DELETE /api/gameday/rooms/:roomId/countdown ──────────────────────────
  // Host-only: clear the active countdown notice.
  app.delete(
    "/api/gameday/rooms/:roomId/countdown",
    async (req: Request, res: Response) => {
      const hostId = await requireGamedayHost(req, res);
      if (!hostId) return;

      const { roomId } = req.params;
      const supabase = getServiceSupabase();

      const { data: clrRoom } = await supabase
        .from("gameday_rooms")
        .select("host_user_id")
        .eq("id", roomId)
        .single();

      if (!clrRoom) { res.status(404).json({ error: "Room not found" }); return; }
      if (!requireOwnedHumanRoom(res, (clrRoom as any).host_user_id, hostId)) return;

      await supabase
        .from("gameday_rooms")
        .update({
          countdown_phase: null,
          countdown_type: null,
          countdown_ends_at: null,
          countdown_started_at: null,
        })
        .eq("id", roomId);

      console.log(`[gameday] countdown cleared: room=${roomId}`);
      res.json({ ok: true });
    }
  );

  // ── Admin: Prop Library ────────────────────────────────────────────────────
  // CRUD endpoints for the gameday_prop_library table.
  // Auth: x-admin-token header checked against MM_ADMIN_TOKEN env var.

  function checkPropLibraryAdmin(req: Request, res: Response): boolean {
    const token = req.header("x-admin-token");
    const adminToken = process.env.MM_ADMIN_TOKEN;
    if (!adminToken || token !== adminToken) {
      res.status(401).json({ error: "Unauthorized" });
      return false;
    }
    return true;
  }

  app.get("/api/admin/gameday/prop-library", async (req: Request, res: Response) => {
    if (!checkPropLibraryAdmin(req, res)) return;
    const sport = req.query.sport as string | undefined;
    const supabase = getServiceSupabase();
    let query = supabase
      .from("gameday_prop_library")
      .select("*")
      .order("sport")
      .order("phase")
      .order("display_order");
    if (sport) (query as any) = (query as any).eq("sport", sport);
    const { data, error } = await (query as any);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ ok: true, props: data ?? [] });
  });

  app.post("/api/admin/gameday/prop-library", async (req: Request, res: Response) => {
    if (!checkPropLibraryAdmin(req, res)) return;
    const { id, sport, phase, question, answer_options, settlement_window, is_default } = req.body;
    if (!id || !sport || !phase || !question || !answer_options) {
      res.status(400).json({ error: "Missing required fields: id, sport, phase, question, answer_options" });
      return;
    }
    const supabase = getServiceSupabase();
    const { data: existing } = await supabase
      .from("gameday_prop_library")
      .select("display_order")
      .eq("sport", sport)
      .eq("phase", phase)
      .order("display_order", { ascending: false })
      .limit(1);
    const maxOrder = (existing as any)?.[0]?.display_order ?? -1;
    const { data, error } = await supabase
      .from("gameday_prop_library")
      .insert({
        id, sport, phase, question,
        answer_options,
        settlement_window: settlement_window ?? "",
        is_default: is_default ?? false,
        display_order: maxOrder + 1,
      })
      .select()
      .single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ ok: true, prop: data });
  });

  app.patch("/api/admin/gameday/prop-library/:propId", async (req: Request, res: Response) => {
    if (!checkPropLibraryAdmin(req, res)) return;
    const { propId } = req.params;
    const updates: Record<string, unknown> = {};
    const allowed = ["is_active", "is_default", "question", "answer_options", "settlement_window", "display_order"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }
    updates.updated_at = new Date().toISOString();
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("gameday_prop_library")
      .update(updates)
      .eq("id", propId)
      .select()
      .single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ ok: true, prop: data });
  });

  // ── GET /api/admin/gameday/global-settle/preview ─────────────────────────
  // Returns counts of props/rooms/picks that would be settled.
  app.get("/api/admin/gameday/global-settle/preview", async (req: Request, res: Response) => {
    if (!checkPropLibraryAdmin(req, res)) return;
    const template_prop_id = req.query.template_prop_id as string | undefined;
    const correct_answer   = req.query.correct_answer   as string | undefined;
    if (!template_prop_id || !correct_answer) {
      res.status(400).json({ error: "template_prop_id and correct_answer are required" });
      return;
    }
    const supabase = getServiceSupabase();

    // Validate the template prop exists and the answer is valid
    const { data: tpl } = await supabase
      .from("gameday_prop_library")
      .select("id, question, answer_options")
      .eq("id", template_prop_id)
      .single();
    if (!tpl) { res.status(404).json({ error: "Template prop not found" }); return; }
    const options = tpl.answer_options as string[];
    if (!options.includes(correct_answer)) {
      res.status(400).json({ error: "correct_answer is not one of the template prop's options" });
      return;
    }

    // Find all unsettled props linked to this template, in active rooms
    const { data: props } = await supabase
      .from("gameday_props")
      .select("id, card_id, gameday_pick_cards(room_id, gameday_rooms(status, room_code, room_name))")
      .eq("template_prop_id", template_prop_id)
      .neq("status", "settled");

    const activeProps = ((props ?? []) as any[]).filter((p) => {
      const room = p.gameday_pick_cards?.gameday_rooms;
      return room && room.status === "active";
    });

    const propIds = activeProps.map((p: any) => p.id);
    const roomSet = new Map<string, { room_code: string; room_name: string }>();
    for (const p of activeProps) {
      const r = p.gameday_pick_cards?.gameday_rooms;
      if (r) roomSet.set(p.gameday_pick_cards.room_id, { room_code: r.room_code, room_name: r.room_name });
    }

    let picks_count = 0;
    if (propIds.length > 0) {
      const { count } = await supabase
        .from("gameday_picks")
        .select("id", { count: "exact", head: true })
        .in("prop_id", propIds);
      picks_count = count ?? 0;
    }

    res.json({
      ok: true,
      template_prop_id,
      question: tpl.question,
      correct_answer,
      props_count: activeProps.length,
      rooms_count: roomSet.size,
      picks_count,
      rooms: Array.from(roomSet.values()),
    });
  });

  // ── POST /api/admin/gameday/global-settle ─────────────────────────────────
  // Settles all active-room props linked to a template prop in one operation.
  app.post("/api/admin/gameday/global-settle", async (req: Request, res: Response) => {
    if (!checkPropLibraryAdmin(req, res)) return;
    const { template_prop_id, correct_answer } = req.body as {
      template_prop_id?: string;
      correct_answer?: string;
    };
    if (!template_prop_id || !correct_answer) {
      res.status(400).json({ error: "template_prop_id and correct_answer are required" });
      return;
    }
    const supabase = getServiceSupabase();

    // Validate template prop
    const { data: tpl } = await supabase
      .from("gameday_prop_library")
      .select("id, answer_options")
      .eq("id", template_prop_id)
      .single();
    if (!tpl) { res.status(404).json({ error: "Template prop not found" }); return; }
    if (!(tpl.answer_options as string[]).includes(correct_answer)) {
      res.status(400).json({ error: "Invalid correct_answer for this template prop" });
      return;
    }

    // Find all unsettled props for this template in active rooms
    const { data: props } = await supabase
      .from("gameday_props")
      .select("id, card_id, gameday_pick_cards(room_id, gameday_rooms(status))")
      .eq("template_prop_id", template_prop_id)
      .neq("status", "settled");

    const activeProps = ((props ?? []) as any[]).filter(
      (p) => p.gameday_pick_cards?.gameday_rooms?.status === "active"
    );

    if (activeProps.length === 0) {
      res.json({ ok: true, settled: 0, message: "No unsettled props found in active rooms." });
      return;
    }

    const propIds = activeProps.map((p: any) => p.id as string);
    const cardIds = [...new Set(activeProps.map((p: any) => p.card_id as string))];

    // 1. Mark all matching props as settled
    await supabase
      .from("gameday_props")
      .update({ correct_answer, status: "settled", updated_at: new Date().toISOString() })
      .in("id", propIds);

    // 2. Mark picks correct / incorrect (two bulk updates)
    await supabase
      .from("gameday_picks")
      .update({ is_correct: true })
      .in("prop_id", propIds)
      .eq("selected_answer", correct_answer);

    await supabase
      .from("gameday_picks")
      .update({ is_correct: false })
      .in("prop_id", propIds)
      .neq("selected_answer", correct_answer);

    // 3. For each affected card, check if all props are now settled → mark card settled
    for (const cardId of cardIds) {
      const { data: remaining } = await supabase
        .from("gameday_props")
        .select("id")
        .eq("card_id", cardId)
        .neq("status", "settled");
      if (!remaining?.length) {
        await supabase
          .from("gameday_pick_cards")
          .update({ status: "settled", updated_at: new Date().toISOString() })
          .eq("id", cardId);
      }
    }

    console.log(`[global-settle] settled ${propIds.length} props for template "${template_prop_id}" → "${correct_answer}"`);
    res.json({ ok: true, settled: propIds.length, rooms_count: new Set(activeProps.map((p: any) => p.gameday_pick_cards?.room_id)).size });
  });

  // ── GET /api/admin/gameday/settlement-queue ──────────────────────────────
  // Read-only. Returns all unsettled props from locked cards in active rooms,
  // grouped by real-world game (event_key) and question (group_key).
  // Uses buildSettlementQueue() shared with the write path for consistency.
  // Auth: x-admin-token. No writes performed.
  app.get("/api/admin/gameday/settlement-queue", async (req: Request, res: Response) => {
    if (!checkPropLibraryAdmin(req, res)) return;
    const result = await buildSettlementQueue(getServiceSupabase());
    if ("error" in result) { res.status(500).json({ error: result.error }); return; }
    res.json({ ok: true, ...result });
  });

  // ── POST /api/admin/gameday/settle-group ──────────────────────────────────
  // Bulk-settles all props in a safe group in one operation.
  // Gate: GLOBAL_SETTLEMENT_WRITE_ENABLED (env GLOBAL_SETTLE_ENABLED=true).
  // Auth: x-admin-token.
  //
  // Body fields:
  //   group_key                   — from the queue response
  //   prop_ids                    — exact prop_id list from the last queue load
  //   expected_count              — must equal prop_ids.length and live group size
  //   canonical_answer_normalized — normalized form of the correct answer
  //   idempotency_key             — client UUID; prevents double-settlement on retry
  //
  // Stale detection re-runs the full queue grouping and compares live prop_id
  // set against the submitted set — any difference → 409 STALE_GROUP.
  // Answer mapping calls mapNormalizedToStored() per-prop against that prop's
  // own stored options — missing mapping → 409 MAPPING_FAILED.
  app.post("/api/admin/gameday/settle-group", async (req: Request, res: Response) => {
    // ── 1. Feature flag gate ──────────────────────────────────────────────────
    if (!GLOBAL_SETTLEMENT_WRITE_ENABLED) {
      res.status(503).json({ error: "Global settlement is not yet enabled.", code: "FLAG_DISABLED" });
      return;
    }

    // ── 2. Admin auth — extract token for operator fingerprint ────────────────
    if (!checkPropLibraryAdmin(req, res)) return;
    const adminToken = req.header("x-admin-token") ?? "";
    const operatorFingerprint = _tokenFingerprint(adminToken);

    const supabase = getServiceSupabase();

    // ── 3. Parse and validate body ────────────────────────────────────────────
    const {
      group_key,
      prop_ids,
      expected_count,
      canonical_answer_normalized,
      idempotency_key,
    } = req.body as {
      group_key?: string;
      prop_ids?: string[];
      expected_count?: number;
      canonical_answer_normalized?: string;
      idempotency_key?: string;
    };

    if (!group_key || !prop_ids?.length || !canonical_answer_normalized || !idempotency_key) {
      res.status(400).json({ error: "group_key, prop_ids, canonical_answer_normalized, and idempotency_key are required." });
      return;
    }
    if (typeof expected_count !== "number" || expected_count <= 0) {
      res.status(400).json({ error: "expected_count must be a positive integer." });
      return;
    }
    if (prop_ids.length !== expected_count) {
      res.status(400).json({ error: `prop_ids.length (${prop_ids.length}) ≠ expected_count (${expected_count}).` });
      return;
    }

    // ── 4. Compute request hash + generate operation ID ───────────────────────
    const requestHash = _computeRequestHash(
      group_key, canonical_answer_normalized, prop_ids, expected_count, operatorFingerprint,
    );
    const opId = _genOpId();

    // ── 5. Check for existing idempotency row (Phase 1 of 2-phase claim) ─────
    //    Done before expensive queue rebuild so replays are fast.
    const existingRow = await _readSettleOp(supabase, idempotency_key);
    if (existingRow) {
      // Key reuse with different payload
      if (existingRow.request_hash !== requestHash) {
        res.status(409).json({
          error: "Idempotency key reused with a different request payload.",
          code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST",
        });
        return;
      }

      if (existingRow.status === "in_progress") {
        const leaseExpiredMs = new Date(existingRow.lease_expires_at).getTime();

        if (leaseExpiredMs < Date.now()) {
          // Safeguard #4: atomically abandon expired lease — inspect whether row was updated
          const { data: abandonedRows } = await supabase
            .from("gameday_settlement_operations")
            .update({
              status: "abandoned",
              error_json: {
                code: "LEASE_EXPIRED",
                message: "Prior operation timed out — server may have restarted or crashed",
              },
              updated_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
            })
            .eq("idempotency_key", idempotency_key)
            .eq("status", "in_progress")
            .lt("lease_expires_at", new Date().toISOString())
            .select("id");

          if (((abandonedRows as unknown[])?.length ?? 0) > 0) {
            res.status(409).json({
              error: "The prior operation for this key timed out. Use a new idempotency_key to retry.",
              code: "OPERATION_ABANDONED_BY_LEASE_EXPIRY",
              operation_id: existingRow.operation_id,
            });
            return;
          }
          // Race: concurrent request already handled abandonment — re-read
          const reread = await _readSettleOp(supabase, idempotency_key);
          if (reread && reread.status !== "in_progress") {
            const replay = _buildSettleReplay(reread);
            res.status(replay.statusCode).json(replay.payload);
            return;
          }
        }

        // Still in_progress with valid lease
        res.status(409).json({
          error: "A settlement for this idempotency_key is already in progress. Wait and retry.",
          code: "OPERATION_IN_PROGRESS",
          operation_id: existingRow.operation_id,
        });
        return;
      }

      // Terminal state — replay stored response
      const replay = _buildSettleReplay(existingRow);
      res.status(replay.statusCode).json(replay.payload);
      return;
    }

    // ── 6. Re-run full queue grouping for server-side stale detection ─────────
    //    Client cannot influence which props are in scope — only DB state does.
    const queue = await buildSettlementQueue(supabase);
    if ("error" in queue) { res.status(500).json({ error: queue.error }); return; }

    // ── 7. Find live group matching submitted group_key ───────────────────────
    let liveGroup: GSDGroupOut | null = null;
    let liveEventKey: string | null = null;
    for (const ev of queue.events) {
      for (const g of ev.groups) {
        if (g.group_key === group_key) { liveGroup = g; liveEventKey = ev.event_key ?? null; break; }
      }
      if (liveGroup) break;
    }
    if (!liveGroup) {
      res.status(409).json({
        error: "Group not found — it may have been fully settled or room status changed. Refresh.",
        code: "GROUP_NOT_FOUND", refresh_required: true,
      });
      return;
    }

    // ── 8. Only safe groups may be globally settled ───────────────────────────
    if (liveGroup.settlement_status !== "safe") {
      res.status(409).json({
        error: `This group cannot be bulk-settled (status: ${liveGroup.settlement_status}).`,
        code: "NOT_SAFE",
      });
      return;
    }

    // ── 9. Stale detection — live prop_id set must exactly match submitted set ─
    const liveSet      = new Set(liveGroup.prop_ids);
    const submittedSet = new Set(prop_ids);
    const setsMatch    = liveSet.size === submittedSet.size && [...liveSet].every((id) => submittedSet.has(id));
    if (!setsMatch || liveGroup.prop_ids.length !== expected_count) {
      res.status(409).json({
        error: "The prop set for this group has changed since your last queue load. Refresh before settling.",
        code: "STALE_GROUP", refresh_required: true,
        live_count: liveGroup.prop_ids.length,
        submitted_count: prop_ids.length,
        expected_count,
      });
      return;
    }

    // ── 10. Fetch full prop data — needed for per-prop answer mapping ──────────
    const { data: propRows, error: propFetchErr } = await supabase
      .from("gameday_props")
      .select("id, answer_options, gameday_pick_cards(id, room_id)")
      .in("id", prop_ids)
      .neq("status", "settled");

    if (propFetchErr || !propRows?.length) {
      res.status(409).json({
        error: "Failed to fetch prop details — some may have been settled already. Refresh and retry.",
        code: "PROP_FETCH_FAILED", refresh_required: true,
      });
      return;
    }
    if (propRows.length !== expected_count) {
      res.status(409).json({
        error: `Expected ${expected_count} unsettled props but found ${propRows.length}. Refresh and retry.`,
        code: "STALE_GROUP", refresh_required: true,
      });
      return;
    }

    // ── 11. Map canonical answer → stored option per prop ─────────────────────
    //    A missing mapping blocks the entire operation — no props settled.
    type SettleSpec = { propId: string; cardId: string; roomId: string; correctAnswer: string };
    const settleSpecs: SettleSpec[] = [];

    for (const row of propRows as any[]) {
      const card = row.gameday_pick_cards as any;
      const opts = row.answer_options as string[];
      const storedAnswer = mapNormalizedToStored(canonical_answer_normalized, opts);
      if (!storedAnswer) {
        res.status(409).json({
          error: `Cannot map "${canonical_answer_normalized}" to a stored option for prop ${row.id}. Options: ${JSON.stringify(opts)}. No props settled.`,
          code: "MAPPING_FAILED", prop_id: row.id,
        });
        return;
      }
      settleSpecs.push({ propId: row.id, cardId: card?.id, roomId: card?.room_id, correctAnswer: storedAnswer });
    }

    // ── 12. Claim idempotency slot (Phase 2 of 2-phase claim) ─────────────────
    //    Now we have full context (event_key, phase, room_count) for the DB row.
    let dbIdemActive = true;
    const { error: insertErr } = await supabase
      .from("gameday_settlement_operations")
      .insert({
        idempotency_key,
        request_hash: requestHash,
        operation_id: opId,
        operator_token_fingerprint: operatorFingerprint,
        group_key,
        event_key: liveEventKey,
        phase: liveGroup.phase,
        canonical_answer_normalized,
        prop_count: expected_count,
        room_count: liveGroup.room_count,
        status: "in_progress",
        lease_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

    if (insertErr) {
      if (insertErr.code === "23505") {
        // Concurrent request with same key claimed the slot
        const concurrent = await _readSettleOp(supabase, idempotency_key);
        if (concurrent?.request_hash !== requestHash) {
          res.status(409).json({ error: "Idempotency key reused with a different request payload.", code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST" });
          return;
        }
        res.status(409).json({
          error: "A concurrent settlement for this key is already in progress.",
          code: "OPERATION_IN_PROGRESS",
          operation_id: concurrent?.operation_id,
        });
        return;
      }
      if (insertErr.code === "42P01") {
        // Migration not yet applied — proceed without DB idempotency but warn clearly
        console.warn("[settle-group] ⚠  gameday_settlement_operations table missing. Apply migration 001 from server/migrations/. Proceeding without DB idempotency.");
        dbIdemActive = false;
      } else {
        console.error("[settle-group] DB INSERT error:", insertErr.message, insertErr.code);
        res.status(500).json({ error: "Failed to claim settlement operation slot.", code: "DB_ERROR", detail: insertErr.message });
        return;
      }
    }

    // ── 13. Settlement loop with lease safeguards ─────────────────────────────
    type SettleResult = { propId: string; cardId: string; cardAutoSettled: boolean };
    const settleResults: SettleResult[] = [];
    const partialErrors: { propId: string; roomId: string; error: string }[] = [];
    const affectedRoomIds = new Set<string>();

    // Safeguard #2: extend lease before starting work
    if (dbIdemActive) await _refreshSettleLease(supabase, idempotency_key, opId);

    for (let i = 0; i < settleSpecs.length; i++) {
      const spec = settleSpecs[i];

      // Safeguard #5 + #2: every 20 props, verify we're still active + extend lease
      if (dbIdemActive && i > 0 && i % 20 === 0) {
        const active = await _isSettleOpActive(supabase, idempotency_key, opId);
        if (!active) {
          // Safeguard #5: stop further settlement work if operation was abandoned
          console.warn(`[settle-group] op=${opId} externally abandoned at prop index ${i}`);
          res.status(409).json({
            error: "Settlement was abandoned externally (lease expired or concurrent request).",
            code: "OPERATION_ABANDONED_MID_FLIGHT",
            operation_id: opId,
            settled_so_far: settleResults.length,
          });
          return;
        }
        await _refreshSettleLease(supabase, idempotency_key, opId);
      }

      // Partial-failure: catch per-prop errors, continue with remaining props
      try {
        const r = await settlePropCore(supabase, spec);
        settleResults.push(r as SettleResult);
        affectedRoomIds.add(spec.roomId);
      } catch (e: any) {
        partialErrors.push({ propId: spec.propId, roomId: spec.roomId, error: e?.message ?? String(e) });
        console.error(`[settle-group] op=${opId} prop ${spec.propId} failed:`, e?.message);
      }
    }

    // ── 14. Audit events — one per affected room ──────────────────────────────
    for (const roomId of affectedRoomIds) {
      await logEvent(supabase, roomId, null, null, "global_prop_settled", {
        operation_id: opId,
        group_key,
        canonical_answer_normalized,
        settled_prop_ids: settleSpecs.filter((s) => s.roomId === roomId).map((s) => s.propId),
        total_prop_count: settleSpecs.length,
        total_room_count: affectedRoomIds.size,
        partial_failures: partialErrors.length,
      });
    }

    // ── 15. Determine final status ────────────────────────────────────────────
    const allFailed   = settleResults.length === 0 && partialErrors.length > 0;
    const isPartial   = partialErrors.length > 0 && settleResults.length > 0;
    const finalStatus = allFailed ? "failed" : isPartial ? "partial_success" : "completed";
    const finalCode   = allFailed ? 500 : isPartial ? 207 : 200;

    const response: Record<string, unknown> = {
      ok: !allFailed,
      operation_id: opId,
      settled_count: settleResults.length,
      rooms_count: affectedRoomIds.size,
      cards_auto_settled: settleResults.filter((r) => r.cardAutoSettled).length,
      canonical_answer_normalized,
    };
    if (partialErrors.length > 0) {
      response.partial_errors = partialErrors;
      response.failed_count   = partialErrors.length;
    }

    console.log(
      `[settle-group] op=${opId} status=${finalStatus} settled=${settleResults.length}` +
      ` failed=${partialErrors.length} rooms=${affectedRoomIds.size}` +
      ` group="${group_key.slice(0, 40)}" answer="${canonical_answer_normalized}"`,
    );

    // ── 16. Finalize DB row — guarded WHERE (safeguards #1 + #3) ─────────────
    if (dbIdemActive) {
      const finalized = await _finalizeSettleOp(supabase, {
        idempotency_key,
        operation_id: opId,
        status: finalStatus,
        response_status_code: finalCode,
        room_count: affectedRoomIds.size,
        ...(allFailed  ? { error_json:           { ...response } } : {}),
        ...(isPartial  ? { partial_results_json:  { ...response } } : {}),
        ...(!allFailed && !isPartial ? { result_json: { ...response } } : {}),
      });

      if (!finalized.updated) {
        // Safeguard #3: 0 rows affected — read current state for conflict response
        const cur = finalized.row;
        if (cur?.status === "abandoned") {
          res.status(409).json({
            error: "Settlement was abandoned (lease expired during processing).",
            code: "OPERATION_ABANDONED_MID_FLIGHT",
            operation_id: opId,
            partial_settle_count: settleResults.length,
          });
          return;
        }
        if (cur) {
          const replay = _buildSettleReplay(cur);
          res.status(replay.statusCode).json(replay.payload);
          return;
        }
        console.error(`[settle-group] op=${opId} terminal UPDATE found 0 rows and no current row — state may be inconsistent`);
      }
    }

    res.status(finalCode).json(response);
  });

  // ── (old inline grouping extracted — logic lives in buildSettlementQueue) ───
  /* eslint-disable-next-line no-constant-condition */
  if (false as boolean) {
    type GroupAcc = {
      group_key: string;
      phase: string;
      // Representative question + options (first prop's values)
      question: string;
      answer_options: string[];
      normalized_options: string[];
      prop_ids: string[];
      room_ids: Set<string>;
      template_prop_ids: Set<string | null>;
      // For conflict detection: every unique normalized question seen in this group
      unique_questions: Set<string>;
    };

    type EventAcc = {
      event_key: string | null;
      is_legacy: boolean;
      team_a: string;
      team_b: string;
      game_date: string | null;
      sport: string | null;
      groups: Map<string, GroupAcc>;
    };

    const eventMap = new Map<string, EventAcc>();
    const LEGACY_KEY = "__legacy__";

    for (const prop of eligible) {
      const card = prop.gameday_pick_cards as any;
      const room = card?.gameday_rooms as any;

      const evKey = buildEventKey(room?.sport, room?.team_a_name, room?.team_b_name, room?.game_date);
      const mapKey = evKey ?? (LEGACY_KEY + "|" + (room?.id ?? "unknown"));

      // Ensure event accumulator
      if (!eventMap.has(mapKey)) {
        eventMap.set(mapKey, {
          event_key: evKey,
          is_legacy: !evKey,
          team_a: room?.team_a_name ?? "Unknown",
          team_b: room?.team_b_name ?? "Unknown",
          game_date: room?.game_date ?? null,
          sport: room?.sport ?? null,
          groups: new Map(),
        });
      }
      const event = eventMap.get(mapKey)!;

      const options = (prop.answer_options ?? []) as string[];
      const normQuestion = (prop.question ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      const normOptions = options.map((o: string) => normalizeAnswerOption(o)).sort();

      const grpKey = evKey
        ? buildGroupKey(evKey, card?.phase ?? "", prop.question ?? "", options)
        : `${mapKey}|${card?.phase ?? ""}|${normQuestion}|${normOptions.join("||")}`;

      if (!event.groups.has(grpKey)) {
        event.groups.set(grpKey, {
          group_key: grpKey,
          phase: card?.phase ?? "",
          question: prop.question ?? "",
          answer_options: options,
          normalized_options: normOptions,
          prop_ids: [],
          room_ids: new Set(),
          template_prop_ids: new Set(),
          unique_questions: new Set(),
        });
      }
      const grp = event.groups.get(grpKey)!;
      grp.prop_ids.push(prop.id);
      grp.room_ids.add(card.room_id);
      grp.template_prop_ids.add(prop.template_prop_id ?? null);
      grp.unique_questions.add(normQuestion);
    }

    // ── Build response ───────────────────────────────────────────────────────

    type AnswerMapEntry = {
      stored: string;         // exact string stored in gameday_props.answer_options
      normalized: string;     // what normalizeAnswerOption() produces
      round_trips: boolean;   // mapNormalizedToStored(normalized, [stored]) === stored
    };

    type GroupOut = {
      group_key: string;
      phase: string;
      phase_label: string;
      question: string;
      answer_options: string[];
      normalized_options: string[];
      answer_map: AnswerMapEntry[];        // normalized ↔ stored mapping for each option
      has_ambiguous_options: boolean;      // true if any two options normalize to the same string
      ambiguous_option_details: string[];  // human-readable collision descriptions
      prop_count: number;
      room_count: number;
      prop_ids: string[];
      room_ids: string[];
      template_prop_ids: (string | null)[];
      template_consistency: "consistent" | "mixed" | "none";
      conflicts: string[];
      // Explicit settlement readiness status:
      //   safe           — no conflicts, no ambiguity, not legacy
      //   review_required — has conflicts (question drift, mixed templates) but no blocking issues
      //   manual_only    — ambiguous options OR legacy room; bulk settlement is blocked
      settlement_status: "safe" | "review_required" | "manual_only";
    };

    type EventOut = {
      event_key: string | null;
      is_legacy: boolean;
      game_label: string;
      sport: string | null;
      game_date: string | null;
      team_a: string;
      team_b: string;
      group_count: number;
      prop_count: number;
      safe_count: number;
      review_count: number;
      manual_count: number;
      groups: GroupOut[];
    };

    const events: EventOut[] = [];

    for (const [, ev] of eventMap) {
      const groupsOut: GroupOut[] = [];

      for (const [, grp] of ev.groups) {
        const templateIds = [...grp.template_prop_ids].filter(Boolean) as string[];
        const uniqueTemplates = new Set(templateIds);

        let templateConsistency: "consistent" | "mixed" | "none";
        if (grp.template_prop_ids.has(null) && templateIds.length === 0) {
          templateConsistency = "none";
        } else if (uniqueTemplates.size <= 1) {
          templateConsistency = "consistent";
        } else {
          templateConsistency = "mixed";
        }

        const conflicts: string[] = [];
        if (grp.unique_questions.size > 1) {
          conflicts.push(
            `${grp.unique_questions.size} slightly different question texts detected — review before settling`
          );
        }
        if (templateConsistency === "mixed") {
          conflicts.push(
            `Props link to ${uniqueTemplates.size} different template IDs (${[...uniqueTemplates].join(", ")})`
          );
        }

        // Build the answer map: for each representative stored option, show
        // the normalized form and whether it round-trips correctly.
        const answer_map: AnswerMapEntry[] = grp.answer_options.map((stored: string) => {
          const normalized = normalizeAnswerOption(stored);
          const roundTripResult = mapNormalizedToStored(stored, grp.answer_options);
          return {
            stored,
            normalized,
            round_trips: roundTripResult === stored,
          };
        });

        // Check for ambiguous options: two stored options that normalize to the same string.
        const ambiguousDetails = detectAmbiguousOptions(grp.answer_options);
        const hasAmbiguous = ambiguousDetails.length > 0;
        if (hasAmbiguous) {
          conflicts.push(`Answer options are ambiguous after normalization — bulk settlement blocked`);
        }

        // Compute settlement_status (priority: manual_only > review_required > safe)
        let settlement_status: "safe" | "review_required" | "manual_only";
        if (ev.is_legacy || hasAmbiguous) {
          settlement_status = "manual_only";
        } else if (conflicts.length > 0) {
          settlement_status = "review_required";
        } else {
          settlement_status = "safe";
        }

        groupsOut.push({
          group_key: grp.group_key,
          phase: grp.phase,
          phase_label: phaseLabel(grp.phase),
          question: grp.question,
          answer_options: grp.answer_options,
          normalized_options: grp.normalized_options,
          answer_map,
          has_ambiguous_options: hasAmbiguous,
          ambiguous_option_details: ambiguousDetails,
          prop_count: grp.prop_ids.length,
          room_count: grp.room_ids.size,
          prop_ids: grp.prop_ids,
          room_ids: [...grp.room_ids],
          template_prop_ids: [...grp.template_prop_ids],
          template_consistency: templateConsistency,
          conflicts,
          settlement_status,
        });
      }

      // Sort groups by phase then question
      const PHASE_ORDER: Record<string, number> = {
        pregame: 0, halftime: 1, fourth: 2, final_push: 3, penalties: 4,
      };
      groupsOut.sort((a, b) => {
        const pa = PHASE_ORDER[a.phase] ?? 9;
        const pb = PHASE_ORDER[b.phase] ?? 9;
        if (pa !== pb) return pa - pb;
        return a.question.localeCompare(b.question);
      });

      const totalProps = groupsOut.reduce((s, g) => s + g.prop_count, 0);
      const safeCount    = groupsOut.filter((g) => g.settlement_status === "safe").length;
      const reviewCount  = groupsOut.filter((g) => g.settlement_status === "review_required").length;
      const manualCount  = groupsOut.filter((g) => g.settlement_status === "manual_only").length;

      events.push({
        event_key: ev.event_key,
        is_legacy: ev.is_legacy,
        game_label: gameLabel(ev.team_a, ev.team_b, ev.game_date),
        sport: ev.sport,
        game_date: ev.game_date,
        team_a: ev.team_a,
        team_b: ev.team_b,
        group_count: groupsOut.length,
        prop_count: totalProps,
        safe_count: safeCount,
        review_count: reviewCount,
        manual_count: manualCount,
        groups: groupsOut,
      });
    }

    // Sort: non-legacy first by date, then legacy
    events.sort((a, b) => {
      if (a.is_legacy !== b.is_legacy) return a.is_legacy ? 1 : -1;
      return (a.game_date ?? "").localeCompare(b.game_date ?? "");
    });

    const totalGroups = events.reduce((s, e) => s + e.group_count, 0);
    const totalProps  = events.reduce((s, e) => s + e.prop_count, 0);
    const totalSafe   = events.reduce((s, e) => s + e.safe_count, 0);
    const totalReview = events.reduce((s, e) => s + e.review_count, 0);
    const totalManual = events.reduce((s, e) => s + e.manual_count, 0);

    res.json({
      ok: true,
      total_events: events.length,
      total_groups: totalGroups,
      total_props: totalProps,
      total_safe: totalSafe,
      total_review: totalReview,
      total_manual: totalManual,
      events,
    });
  } // end dead-code block

  // ── Card Auto-Open / Auto-Lock Scheduler ──────────────────────────────────
  // Runs every 60 seconds. Opens cards at scheduled_open_at and locks them at
  // scheduled_lock_at — only for rooms that are still active.
  // Hosts set these schedules at room creation time. When a sports data
  // integration is added later, these same DB columns can be driven by live
  // game-clock events instead of preset times — no schema change needed.

  const _cardSchedulerInterval = setInterval(async () => {
    const now = new Date().toISOString();
    const supabase = getServiceSupabase();
    try {
      // Auto-open
      const { data: toOpen } = await supabase
        .from("gameday_pick_cards")
        .select("id, room_id")
        .eq("status", "closed")
        .not("scheduled_open_at", "is", null)
        .lte("scheduled_open_at", now);

      for (const card of (toOpen ?? []) as any[]) {
        const { data: room } = await supabase
          .from("gameday_rooms")
          .select("status")
          .eq("id", card.room_id)
          .maybeSingle();
        if ((room as any)?.status === "active") {
          await supabase
            .from("gameday_pick_cards")
            .update({ status: "open", updated_at: now })
            .eq("id", card.id);
          console.log(`[scheduler] auto-opened card ${card.id}`);
        }
      }

      // Auto-lock
      const { data: toLock } = await supabase
        .from("gameday_pick_cards")
        .select("id, room_id")
        .eq("status", "open")
        .not("scheduled_lock_at", "is", null)
        .lte("scheduled_lock_at", now);

      for (const card of (toLock ?? []) as any[]) {
        const { data: room } = await supabase
          .from("gameday_rooms")
          .select("status")
          .eq("id", card.room_id)
          .maybeSingle();
        if ((room as any)?.status === "active") {
          await supabase
            .from("gameday_pick_cards")
            .update({ status: "locked", updated_at: now })
            .eq("id", card.id);
          console.log(`[scheduler] auto-locked card ${card.id}`);
        }
      }
    } catch (e) {
      console.error("[scheduler] card schedule check error:", e);
    }
  }, 60_000);

  process.once("SIGTERM", () => clearInterval(_cardSchedulerInterval));
  process.once("SIGINT",  () => clearInterval(_cardSchedulerInterval));
}
