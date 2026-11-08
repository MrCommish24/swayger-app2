import type { Express, Request, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { getServiceSupabase } from "./supabase-service.js";

export const hashParticipantSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export const createParticipantSecret = () => randomBytes(32).toString("hex");
const snowflake = (value: unknown): value is string => typeof value === "string" && /^[0-9]{1,32}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const secret = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function validDiscordDisplayName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 100 &&
    !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

function failure(res: Response, code: string, status: number, message: string) {
  return res.status(status).json({ error: message, code });
}
function rpcFailure(res: Response, message: string) {
  const errors: Record<string, [number, string]> = {
    room_not_found: [404, "Room not found."],
    guild_mismatch: [403, "Discord guild is not authorized for this room."],
    ineligible_room: [403, "This room does not support Discord Madden participant links."],
    room_closed: [409, "This Pick Card is closed or no longer active."],
    invalid_token: [400, "Invalid picks link. Return to Discord and request a fresh picks link."],
    wrong_room: [400, "This picks link belongs to a different room. Return to Discord and request a fresh picks link."],
    token_used: [409, "This picks link has already been used. Return to Discord and request a fresh picks link."],
    token_revoked: [410, "This picks link was replaced. Return to Discord and request a fresh picks link."],
    token_expired: [410, "This picks link has expired. Return to Discord and request a fresh picks link."],
  };
  for (const [code, [status, text]] of Object.entries(errors)) {
    if (message.includes(code)) return failure(res, code, status, text);
  }
  return failure(res, "identity_unavailable", 503, "Unable to prepare your picks session. Return to Discord and request a fresh picks link.");
}

export function registerDiscordIdentityRoutes(app: Express, isBotValid: (req: Request) => boolean, appUrl: string) {
  // Per-process, bounded throttling; not a replacement for gateway-wide quotas.
  const limits = new Map<string, { count: number; reset: number }>();
  app.post("/api/gameday/rooms/:roomId/discord-participant-link", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!isBotValid(req)) return failure(res, "unauthorized", 401, "Valid Game Day bot credentials are required.");
    const guild = req.header("X-Discord-Guild-ID");
    const { discord_user_id: user, discord_display_name: displayName } = req.body ?? {};
    if (!uuid(req.params.roomId) || !snowflake(guild) || !snowflake(user) || !validDiscordDisplayName(displayName)) {
      return failure(res, "invalid_request", 400, "A room UUID, digit-string guild/user IDs, and a nonblank display name of at most 100 characters without controls are required.");
    }
    const now = Date.now();
    for (const [key, limit] of limits) if (limit.reset <= now) limits.delete(key);
    const key = `${guild}:${user}`;
    const limit = limits.get(key) ?? { count: 0, reset: now + 60_000 };
    if (limit.count >= 10 || (!limits.has(key) && limits.size >= 10_000)) {
      res.set("Retry-After", "60");
      return failure(res, "rate_limited", 429, "Too many picks link requests. Try again in a minute.");
    }
    limit.count++;
    limits.set(key, limit);
    const rawToken = createParticipantSecret();
    const { data, error } = await getServiceSupabase().rpc("issue_gameday_discord_link", {
      p_room_id: req.params.roomId, p_guild_id: guild, p_user_id: user,
      p_display_name: displayName.trim(), p_token_hash: hashParticipantSecret(rawToken),
    });
    if (error) return rpcFailure(res, error.message);
    const participantUrl = new URL(`/gameday/${req.params.roomId}`, appUrl);
    participantUrl.searchParams.set("discord_token", rawToken);
    return res.status(201).json({ participant_url: participantUrl.toString(), expires_at: data.expires_at, expires_in_seconds: 600 });
  });
  app.post("/api/gameday/discord-participant-link/redeem", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const { token, room_id: expectedRoom } = req.body ?? {};
    if (!secret(token) || (expectedRoom !== undefined && !uuid(expectedRoom))) {
      return failure(res, "invalid_token", 400, "Invalid picks link. Return to Discord and request a fresh picks link.");
    }
    const participantSession = createParticipantSecret();
    const { data, error } = await getServiceSupabase().rpc("redeem_gameday_discord_link", {
      p_token_hash: hashParticipantSecret(token), p_session_hash: hashParticipantSecret(participantSession),
      p_expected_room_id: expectedRoom ?? null,
    });
    if (error) return rpcFailure(res, error.message);
    return res.json({ ...data, participant_session: participantSession });
  });
}

/** New sessions take explicit precedence; invalid credentials never fall back to another identity. */
export async function resolveDiscordParticipantSession(req: Request, roomId: string) {
  const raw = req.header("X-Gameday-Participant-Session");
  if (raw === undefined) return null;
  const invalid = () => Object.assign(new Error("Your picks session has expired or is invalid. Return to Discord and request a fresh picks link."), { status: 401 });
  if (!secret(raw)) throw invalid();
  const { data, error } = await getServiceSupabase()
    .from("gameday_discord_participant_sessions").select("participant_id")
    .eq("session_hash", hashParticipantSecret(raw)).eq("room_id", roomId)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw Object.assign(new Error("Participant sessions are temporarily unavailable."), { status: 503 });
  if (!data) throw invalid();
  return data.participant_id as string;
}
