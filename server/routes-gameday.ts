import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import {
  NBA_PLAYOFF_TEMPLATE,
  DEFAULT_PROP_IDS,
  FIFA_TEMPLATE,
  FIFA_DEFAULT_PROP_IDS,
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
  gameLabel,
  phaseLabel,
} from "./gameday-normalize.js";

function getServiceSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

/** Fast JWT decode — no signature verification. Used only for the is-host UI check. */
function decodeJwtPayload(token: string): { sub?: string; email?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // base64url → base64 → Buffer → string
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "==".slice(0, (4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

/** Characters used in short room codes — avoids visually ambiguous 0/O and 1/I. */
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Generate a unique GDS-XXXXX short code, retrying on collision. */
async function generateUniqueRoomCode(supabase: ReturnType<typeof createClient>): Promise<string> {
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

async function requireGamedayHost(
  req: Request,
  res: Response
): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const token = auth.slice(7);
  // Decode JWT locally — no Supabase network call needed for email/userId check.
  const payload = decodeJwtPayload(token);
  if (!payload?.sub) {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }
  const allowedEmails = (process.env.GAMEDAY_HOST_EMAILS ?? "darius@leagueswype.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowedEmails.includes((payload.email ?? "").toLowerCase())) {
    res.status(403).json({ error: "Not authorized as Game Day host" });
    return null;
  }
  return payload.sub;
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

/** Returns true if the string looks like a UUID. */
function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Resolves a roomRef (UUID or GDS-XXXXX room code) to a room UUID.
 * Returns null if the room does not exist.
 */
async function resolveRoomRef(
  supabase: ReturnType<typeof createClient>,
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

export function registerGamedayRoutes(app: Express) {
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
  app.get("/api/gameday/is-host", (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      res.json({ isHost: false });
      return;
    }
    const payload = decodeJwtPayload(auth.slice(7));
    const email = payload?.email ?? "";
    const allowedEmails = (process.env.GAMEDAY_HOST_EMAILS ?? "darius@leagueswype.com")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const isHost = allowedEmails.includes(email.toLowerCase());
    console.log(`[gameday] is-host: jwt_email="${email}" allowed=${JSON.stringify(allowedEmails)} → ${isHost}`);
    res.json({ isHost });
  });

  // ── GET /api/admin/is-admin ──────────────────────────────────────────────
  // Returns { isAdmin } for the requesting user based on their JWT email.
  // Uses GAMEDAY_ADMIN_EMAILS if set; falls back to GAMEDAY_HOST_EMAILS.
  // This drives the Admin Panel button visibility on the profile screen.
  app.get("/api/admin/is-admin", (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      res.json({ isAdmin: false });
      return;
    }
    const payload = decodeJwtPayload(auth.slice(7));
    const email = (payload?.email ?? "").toLowerCase();
    const adminEmails = (
      process.env.GAMEDAY_ADMIN_EMAILS ?? process.env.GAMEDAY_HOST_EMAILS ?? ""
    )
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    res.json({ isAdmin: adminEmails.includes(email) });
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
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const payload = decodeJwtPayload(auth.slice(7));
    if (!payload?.sub) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    const supabase = getServiceSupabase();

    // Admins (in GAMEDAY_HOST_EMAILS) see ALL rooms including Discord-created ones.
    // Non-admins only see rooms they personally created.
    const listAllowedEmails = (process.env.GAMEDAY_HOST_EMAILS ?? "darius@leagueswype.com")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    const isAdminUser = listAllowedEmails.includes((payload.email ?? "").toLowerCase());

    // Try fetching with room_code + source; fall back if columns don't exist yet.
    let baseQuery = supabase
      .from("gameday_rooms")
      .select("id, room_name, team_a_name, team_b_name, game_date, status, created_at, room_code, source, archived_at")
      .order("created_at", { ascending: false });
    if (!isAdminUser) baseQuery = (baseQuery as any).eq("host_user_id", payload.sub);

    let { data: rooms, error } = await baseQuery;

    if (error) {
      console.warn("[gameday] rooms list with room_code/source failed, retrying without:", error.message);
      let retryQuery = supabase
        .from("gameday_rooms")
        .select("id, room_name, team_a_name, team_b_name, game_date, status, created_at, archived_at")
        .order("created_at", { ascending: false });
      if (!isAdminUser) retryQuery = (retryQuery as any).eq("host_user_id", payload.sub);
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
    const sportParam = (req.query.sport as string) ?? "nba";
    const isSoccer = sportParam === "soccer";
    const supabase = getServiceSupabase();

    try {
      const { data: libraryProps, error } = await supabase
        .from("gameday_prop_library")
        .select("id, phase, question, answer_options, settlement_window, is_default")
        .eq("sport", isSoccer ? "soccer" : "nba")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

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
    res.json({
      template: isSoccer ? FIFA_TEMPLATE : NBA_PLAYOFF_TEMPLATE,
      defaultPropIds: isSoccer ? FIFA_DEFAULT_PROP_IDS : DEFAULT_PROP_IDS,
    });
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
      sport?: "nba" | "soccer";
      game_start_time?: string;
      card_schedules?: Record<string, { open_at?: string; lock_at?: string }>;
    };

    // Accept either room_name or game_label (Discord bot compat)
    const room_name = _room_name ?? game_label;

    if (!room_name || !team_a_name || !team_b_name || !team_a_star || !team_b_star) {
      res.status(400).json({ error: "Missing required fields: room_name (or game_label), team_a_name, team_b_name, team_a_star, team_b_star" });
      return;
    }

    const isSoccer = sport === "soccer";
    const activeTemplate = isSoccer ? FIFA_TEMPLATE : NBA_PLAYOFF_TEMPLATE;
    const defaultPropIds = isSoccer ? FIFA_DEFAULT_PROP_IDS : DEFAULT_PROP_IDS;
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

    // Discord/bot rooms default to public (is_private: false) so guests can
    // join via the public link without being redirected to the join screen.
    // The bot can override by passing is_private: true explicitly.
    const resolvedIsPrivate = is_private ?? (botAuthed ? false : true);

    const insertPayload: Record<string, unknown> = {
      room_name: room_name.trim(),
      team_a_name: team_a_name.trim(),
      team_b_name: team_b_name.trim(),
      team_a_star: team_a_star.trim(),
      team_b_star: team_b_star.trim(),
      game_date: parseGameDate(game_date),
      host_user_id: botAuthed ? null : hostId,
      status: "active",
      source: source ?? (botAuthed ? "discord" : "app"),
      is_private: resolvedIsPrivate,
    };
    if (roomCode)          insertPayload.room_code          = roomCode;
    if (discord_guild_id)  insertPayload.discord_guild_id   = discord_guild_id;
    if (discord_channel_id) insertPayload.discord_channel_id = discord_channel_id;
    if (discord_user_id)   insertPayload.discord_user_id    = discord_user_id;
    if (sport)             insertPayload.sport              = isSoccer ? "soccer" : "nba";
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
      : [
          { title: "Pregame Picks", phase: "pregame", display_order: 0 },
          { title: "Halftime Picks", phase: "halftime", display_order: 1 },
          { title: "4Q Clutch Picks", phase: "fourth", display_order: 2 },
        ];

    const vars = {
      TEAM_A: team_a_name.trim(),
      TEAM_B: team_b_name.trim(),
      STAR_A: team_a_star.trim(),
      STAR_B: team_b_star.trim(),
    };

    for (const cardDef of cardPhases) {
      const cardSchedule = card_schedules?.[cardDef.phase] ?? {};
      const { data: card } = await supabase
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

      if (!card) continue;

      const templateProps = activeTemplate.filter(
        (p) => p.phase === cardDef.phase && propIds.includes(p.id)
      );

      for (let i = 0; i < templateProps.length; i++) {
        const tmpl = templateProps[i];
        await supabase.from("gameday_props").insert({
          card_id: card.id,
          question: resolvePlaceholders(tmpl.question, vars),
          answer_options: tmpl.answers.map((a) => resolvePlaceholders(a, vars)),
          display_order: i,
          status: "pending",
          template_prop_id: tmpl.id,
        });
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

      const { data: room, error } = await supabase
        .from("gameday_rooms")
        .select("*")
        .eq("id", roomId)
        .single();

      if (error || !room) {
        res.status(404).json({ error: "Room not found" });
        return;
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

      const { userId, guestSessionId } = await getCallerIdentity(req);
      console.log(
        `[gameday] room fetch ${roomId}: userId=${userId ? userId.slice(0, 8) + "…" : "null"} guest=${guestSessionId ? guestSessionId.slice(0, 8) + "…" : "null"}`
      );

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
      const hostId = await requireGamedayHost(req, res);
      if (!hostId) return;

      const { cardId } = req.params;
      const supabase = getServiceSupabase();

      const { data: card } = await supabase
        .from("gameday_pick_cards")
        .select("*, gameday_rooms(host_user_id)")
        .eq("id", cardId)
        .single();

      if (!card) {
        res.status(404).json({ error: "Card not found" });
        return;
      }
      const openCardRoomHost = (card.gameday_rooms as any)?.host_user_id;
      if (openCardRoomHost !== null && openCardRoomHost !== hostId) {
        res.status(403).json({ error: "Not your room" });
        return;
      }

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

      await logEvent(supabase, card.room_id, null, hostId, "card_opened", {
        card_id: cardId,
      });
      res.json({ ok: true });
    }
  );

  // ── PATCH /api/gameday/cards/:cardId/lock ───────────────────────────────
  app.patch(
    "/api/gameday/cards/:cardId/lock",
    async (req: Request, res: Response) => {
      const hostId = await requireGamedayHost(req, res);
      if (!hostId) return;

      const { cardId } = req.params;
      const supabase = getServiceSupabase();

      const { data: card } = await supabase
        .from("gameday_pick_cards")
        .select("*, gameday_rooms(host_user_id)")
        .eq("id", cardId)
        .single();

      if (!card) {
        res.status(404).json({ error: "Card not found" });
        return;
      }
      const lockCardRoomHost = (card.gameday_rooms as any)?.host_user_id;
      if (lockCardRoomHost !== null && lockCardRoomHost !== hostId) {
        res.status(403).json({ error: "Not your room" });
        return;
      }

      await supabase
        .from("gameday_pick_cards")
        .update({ status: "locked", updated_at: new Date().toISOString() })
        .eq("id", cardId);

      await logEvent(supabase, card.room_id, null, hostId, "card_locked", {
        card_id: cardId,
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
      const hostId = await requireGamedayHost(req, res);
      if (!hostId) return;

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
          "*, gameday_pick_cards(id, phase, status, room_id, gameday_rooms(host_user_id, status, room_code, source))"
        )
        .eq("id", propId)
        .single();

      if (!prop) {
        res.status(404).json({ error: "Prop not found" });
        return;
      }

      const card = prop.gameday_pick_cards as any;
      const gdRoom = card?.gameday_rooms as any;
      if (gdRoom?.host_user_id !== null && gdRoom?.host_user_id !== hostId) {
        res.status(403).json({ error: "Not your room" });
        return;
      }

      if (gdRoom?.status === "finalized") {
        res.status(400).json({ error: "Room is finalized — results are read-only" });
        return;
      }

      const options = prop.answer_options as string[];
      if (!options.includes(correct_answer)) {
        res.status(400).json({ error: "Invalid correct answer" });
        return;
      }

      // Update prop
      await supabase
        .from("gameday_props")
        .update({
          correct_answer,
          status: "settled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", propId);

      // Bulk-mark picks correct/incorrect (two queries instead of N)
      await supabase
        .from("gameday_picks")
        .update({ is_correct: true })
        .eq("prop_id", propId)
        .eq("selected_answer", correct_answer);

      await supabase
        .from("gameday_picks")
        .update({ is_correct: false })
        .eq("prop_id", propId)
        .neq("selected_answer", correct_answer);

      // If all props in the card are now settled → mark card as settled
      const { data: remainingProps } = await supabase
        .from("gameday_props")
        .select("id")
        .eq("card_id", card.id)
        .neq("status", "settled");

      if (!remainingProps?.length) {
        await supabase
          .from("gameday_pick_cards")
          .update({ status: "settled", updated_at: new Date().toISOString() })
          .eq("id", card.id);
      }

      const roomId = card?.room_id;
      await logEvent(supabase, roomId, null, hostId, "prop_settled", {
        prop_id: propId,
        card_id: card?.id,
        phase: card?.phase,
        correct_answer,
      });
      res.json({ ok: true });
    }
  );

  // ── PATCH /api/gameday/rooms/:roomId/finalize ───────────────────────────
  app.patch(
    "/api/gameday/rooms/:roomId/finalize",
    async (req: Request, res: Response) => {
      const hostId = await requireGamedayHost(req, res);
      if (!hostId) return;

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
      if (room.host_user_id !== null && room.host_user_id !== hostId) {
        res.status(403).json({ error: "Not your room" });
        return;
      }
      if (room.status === "finalized") {
        console.log(`[gameday] finalize: room ${roomId} already finalized`);
        res.json({ ok: true, already: true });
        return;
      }

      console.log(`[gameday] finalize: attempting to write status=finalized for room ${roomId}, hostId=${hostId}, stored host_user_id=${room.host_user_id}`);

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

      await logEvent(supabase, roomId, null, hostId, "room_finalized", {});
      res.json({ ok: true });
    }
  );

  // ── PATCH /api/gameday/rooms/:roomId/archive ─────────────────────────────
  // Soft-deletes a room by setting archived_at = now(). Only configured admins
  // can archive. Finalized rooms cannot be archived (they are preserved receipts).
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
      // Admins can archive any room with null host_user_id (Discord/bot rooms).
      if ((room as any).host_user_id !== null && (room as any).host_user_id !== hostId) {
        res.status(403).json({ error: "Not your room" });
        return;
      }
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
      if ((room as any).host_user_id !== null && (room as any).host_user_id !== hostId) {
        res.status(403).json({ error: "Not your room" });
        return;
      }
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
      if ((room as any).host_user_id !== null && (room as any).host_user_id !== hostId) {
        res.status(403).json({ error: "Not your room" });
        return;
      }

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
      const { data: srcRoom } = await supabase
        .from("gameday_rooms")
        .select("id, room_name, team_a_name, team_b_name, team_a_star, team_b_star, game_date, is_private")
        .eq("id", roomId)
        .single();

      if (!srcRoom) {
        res.status(404).json({ error: "Source room not found" });
        return;
      }

      // ── 2. Fetch source cards + props ─────────────────────────────────────
      const { data: srcCards } = await supabase
        .from("gameday_pick_cards")
        .select("phase, title, display_order, gameday_props(question, answer_options, display_order)")
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
        host_user_id: hostId,
        status:       "active",
        source:       "app",
        is_private:   (srcRoom as any).is_private ?? true,
      };
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
  // roomRef accepts either a UUID or a GDS-XXXXX room code. No auth required.
  app.get(
    "/api/gameday/rooms/:roomRef/leaderboard",
    async (req: Request, res: Response) => {
      const supabase = getServiceSupabase();
      const roomId = await resolveRoomRef(supabase, req.params.roomRef);
      if (!roomId) {
        res.status(404).json({ error: "Room not found" });
        return;
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
  // roomRef accepts either a UUID or a GDS-XXXXX room code. No auth required.
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

      const hdRoomHost = (room as any).host_user_id;
      if (!room || (hdRoomHost !== null && hdRoomHost !== hostId)) {
        res.status(403).json({ error: "Not your room" });
        return;
      }

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

      const spRoomHost = (room as any).host_user_id;
      if (!room || (spRoomHost !== null && spRoomHost !== hostId)) {
        res.status(403).json({ error: "Not your room" });
        return;
      }

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
      const cdHost = (cdRoom as any).host_user_id;
      if (cdHost !== null && cdHost !== hostId) {
        res.status(403).json({ error: "Not your room" }); return;
      }
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

      let userId: string | null = null;
      const authHeader = req.headers.authorization ?? "";
      if (authHeader.startsWith("Bearer ")) {
        const payload = decodeJwtPayload(authHeader.slice(7));
        userId = payload?.sub ?? null;
      }

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
      const clrHost = (clrRoom as any).host_user_id;
      if (clrHost !== null && clrHost !== hostId) {
        res.status(403).json({ error: "Not your room" }); return;
      }

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
  // Includes template_prop_id consistency metadata per group.
  // Legacy rooms (null sport or null game_date) are surfaced separately.
  // Auth: x-admin-token. No writes performed.
  app.get("/api/admin/gameday/settlement-queue", async (req: Request, res: Response) => {
    if (!checkPropLibraryAdmin(req, res)) return;
    const supabase = getServiceSupabase();

    // Fetch all props that are unsettled, belonging to locked cards in active rooms.
    // We join the full chain: prop → card → room.
    const { data: rawProps, error } = await supabase
      .from("gameday_props")
      .select(
        `id, question, answer_options, status, template_prop_id,
         gameday_pick_cards(
           id, phase, status, room_id,
           gameday_rooms(
             id, room_code, room_name, status,
             team_a_name, team_b_name, team_a_star, team_b_star,
             game_date, sport
           )
         )`
      )
      .neq("status", "settled");

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const props = (rawProps ?? []) as any[];

    // Filter to locked cards in active rooms only (PostgREST nested filters
    // are not guaranteed when the FK is not a direct join, so we filter in JS).
    const eligible = props.filter((p) => {
      const card = p.gameday_pick_cards;
      const room = card?.gameday_rooms;
      return card?.status === "locked" && room?.status === "active";
    });

    // ── Group props into events and settlement groups ────────────────────────
    // event_key  → { meta, groups: Map<group_key, GroupAccumulator> }
    // Null event_key = legacy room (missing sport or game_date).

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

    type GroupOut = {
      group_key: string;
      phase: string;
      phase_label: string;
      question: string;
      answer_options: string[];
      normalized_options: string[];
      prop_count: number;
      room_count: number;
      prop_ids: string[];
      room_ids: string[];
      template_prop_ids: (string | null)[];
      template_consistency: "consistent" | "mixed" | "none";
      conflicts: string[];
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

        groupsOut.push({
          group_key: grp.group_key,
          phase: grp.phase,
          phase_label: phaseLabel(grp.phase),
          question: grp.question,
          answer_options: grp.answer_options,
          normalized_options: grp.normalized_options,
          prop_count: grp.prop_ids.length,
          room_count: grp.room_ids.size,
          prop_ids: grp.prop_ids,
          room_ids: [...grp.room_ids],
          template_prop_ids: [...grp.template_prop_ids],
          template_consistency: templateConsistency,
          conflicts,
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
        groups: groupsOut,
      });
    }

    // Sort: non-legacy first by date, then legacy
    events.sort((a, b) => {
      if (a.is_legacy !== b.is_legacy) return a.is_legacy ? 1 : -1;
      return (a.game_date ?? "").localeCompare(b.game_date ?? "");
    });

    const totalGroups = events.reduce((s, e) => s + e.group_count, 0);
    const totalProps = events.reduce((s, e) => s + e.prop_count, 0);

    res.json({
      ok: true,
      total_events: events.length,
      total_groups: totalGroups,
      total_props: totalProps,
      events,
    });
  });

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
