import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import {
  NBA_PLAYOFF_TEMPLATE,
  DEFAULT_PROP_IDS,
  resolvePlaceholders,
} from "./gameday-template.js";
import {
  buildGameDayBlastHtml,
  sendGameDayBlastEmail,
} from "./email.js";

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
  app.get("/api/gameday/template", (_req: Request, res: Response) => {
    res.json({
      template: NBA_PLAYOFF_TEMPLATE,
      defaultPropIds: DEFAULT_PROP_IDS,
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
    };

    // Accept either room_name or game_label (Discord bot compat)
    const room_name = _room_name ?? game_label;

    if (!room_name || !team_a_name || !team_b_name || !team_a_star || !team_b_star) {
      res.status(400).json({ error: "Missing required fields: room_name (or game_label), team_a_name, team_b_name, team_a_star, team_b_star" });
      return;
    }

    const propIds = selected_prop_ids ?? DEFAULT_PROP_IDS;
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
    if (roomCode) insertPayload.room_code = roomCode;
    if (discord_guild_id)   insertPayload.discord_guild_id   = discord_guild_id;
    if (discord_channel_id) insertPayload.discord_channel_id = discord_channel_id;
    if (discord_user_id)    insertPayload.discord_user_id    = discord_user_id;

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
      phase: "pregame" | "halftime" | "fourth";
      display_order: number;
    }> = [
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
      const { data: card } = await supabase
        .from("gameday_pick_cards")
        .insert({ room_id: room.id, ...cardDef, status: "closed" })
        .select()
        .single();

      if (!card) continue;

      const templateProps = NBA_PLAYOFF_TEMPLATE.filter(
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

      const validPhases = ["pregame", "halftime", "fourth"];
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

      await sendGameDayBlastEmail({
        to: TEST_EMAIL,
        displayName: "Darius",
        userId: "test-preview",
        gameName: game_name,
        trackedRoomLink,
        subject,
      });
      console.log(`[gameday-blast] Test email sent to ${TEST_EMAIL}`);
      res.json({ ok: true, sent_to: TEST_EMAIL, tracked_link: trackedRoomLink, subject: resolvedSubject, cta: ctaText });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[gameday-blast] Test send failed:", msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // POST /admin/gameday/blast-send
  // Sends the blast to all eligible users (notification_email set, not unsubscribed).
  // Requires x-admin-token AND { confirmed: true } in body — prevents accidental sends.
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

    const eligible = ((profiles ?? []) as {
      id: string;
      notification_email: string;
      display_name?: string | null;
      username: string;
      email_unsubscribed?: boolean;
    }[]).filter((p) => p.notification_email && !p.email_unsubscribed);

    const trackedRoomLink = buildTrackedLink(room_link);
    let sent = 0;
    let failed = 0;

    for (const profile of eligible) {
      try {
        await sendGameDayBlastEmail({
          to: profile.notification_email,
          displayName: profile.display_name || profile.username,
          userId: profile.id,
          gameName: game_name,
          trackedRoomLink,
          subject,
        });
        sent++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[gameday-blast] Failed for ${profile.notification_email}:`, msg);
        failed++;
      }
    }

    console.log(`[gameday-blast] Full blast complete — sent=${sent} failed=${failed} game="${game_name}" link=${trackedRoomLink}`);
    res.json({
      ok: true,
      sent,
      failed,
      total_eligible: eligible.length,
      tracked_link: trackedRoomLink,
    });
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
}
