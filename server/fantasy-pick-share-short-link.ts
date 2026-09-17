import { randomBytes } from "crypto";
import type { Application, Request, Response } from "express";
import { buildFantasyPickSentence } from "../lib/fantasy-pick-share";
import { getWeeklyMoment } from "../lib/fantasy-weekly-moments";
import { getServiceSupabase } from "./supabase-service";
import { isReceiptPreviewCrawler } from "./fantasy-weekly-preview";

const SHORT_CODE_PATTERN = /^[a-z2-7]{16}$/;
const SHORT_CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export type FantasyPickShareKind = "pick" | "my_lock";

export interface FantasyPickShareSnapshot {
  shortCode: string;
  leagueName: string;
  weekNumber: number;
  participantDisplayName: string | null;
  templatePropId: string;
  momentTitle: string;
  answerLabel: string;
  shareKind: FantasyPickShareKind;
  canonicalPath: string;
}

export function isFantasyPickSharePackagingEnabled(): boolean {
  return process.env.FANTASY_PICK_SHARE_PACKAGING_ENABLED !== "false";
}

export function generateFantasyPickShareCode(): string {
  const bytes = randomBytes(16);
  let code = "";
  for (const byte of bytes) code += SHORT_CODE_ALPHABET[byte & 31];
  return code;
}

export async function getOrCreateFantasyPickShareAlias(
  supabase: ReturnType<typeof getServiceSupabase>,
  snapshot: {
    leagueSeasonId: string;
    roomId: string;
    participantId: string;
    propId: string;
    selectedAnswer: string;
    shareKind: FantasyPickShareKind;
    weekNumber: number;
  },
): Promise<string> {
  const naturalKey = {
    room_id: snapshot.roomId,
    participant_id: snapshot.participantId,
    prop_id: snapshot.propId,
    selected_answer: snapshot.selectedAnswer,
    share_kind: snapshot.shareKind,
  };
  const { data: existing, error: existingError } = await supabase
    .from("fantasy_weekly_pick_share_aliases")
    .select("short_code")
    .match(naturalKey)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if ((existing as any)?.short_code) return (existing as any).short_code;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const shortCode = generateFantasyPickShareCode();
    const { data: inserted, error: insertError } = await supabase
      .from("fantasy_weekly_pick_share_aliases")
      .insert({
        short_code: shortCode,
        league_season_id: snapshot.leagueSeasonId,
        ...naturalKey,
        week_number: snapshot.weekNumber,
      })
      .select("short_code")
      .maybeSingle();
    if (!insertError && (inserted as any)?.short_code) return (inserted as any).short_code;
    if ((insertError as any)?.code !== "23505") {
      throw new Error(insertError?.message ?? "Failed to create pick-share alias");
    }

    // A concurrent request may have inserted this exact immutable snapshot.
    const { data: race, error: raceError } = await supabase
      .from("fantasy_weekly_pick_share_aliases")
      .select("short_code")
      .match(naturalKey)
      .maybeSingle();
    if (raceError) throw new Error(raceError.message);
    if ((race as any)?.short_code) return (race as any).short_code;
  }
  throw new Error("Failed to generate a unique pick-share alias");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compact(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export async function loadFantasyPickShareSnapshot(
  supabase: ReturnType<typeof getServiceSupabase>,
  shortCode: string,
): Promise<FantasyPickShareSnapshot | null> {
  const { data: alias, error: aliasError } = await supabase
    .from("fantasy_weekly_pick_share_aliases")
    .select("short_code, league_season_id, room_id, participant_id, prop_id, selected_answer, share_kind, week_number")
    .eq("short_code", shortCode)
    .maybeSingle();
  if (aliasError) throw new Error(aliasError.message);
  if (!alias) return null;

  const [seasonResult, roomResult, participantResult, propResult] = await Promise.all([
    supabase
      .from("fantasy_league_seasons")
      .select("id, league_id, fantasy_leagues!inner(league_name)")
      .eq("id", (alias as any).league_season_id)
      .maybeSingle(),
    supabase
      .from("gameday_rooms")
      .select("id, league_season_id, week_number, competition_type, experience_type")
      .eq("id", (alias as any).room_id)
      .maybeSingle(),
    supabase
      .from("gameday_participants")
      .select("id, room_id, display_name")
      .eq("id", (alias as any).participant_id)
      .maybeSingle(),
    supabase
      .from("gameday_props")
      .select("id, card_id, template_prop_id, answer_options")
      .eq("id", (alias as any).prop_id)
      .maybeSingle(),
  ]);
  if (seasonResult.error || roomResult.error || participantResult.error || propResult.error) {
    throw new Error(
      seasonResult.error?.message
      ?? roomResult.error?.message
      ?? participantResult.error?.message
      ?? propResult.error?.message
      ?? "Unable to resolve pick share",
    );
  }
  const season = seasonResult.data as any;
  const room = roomResult.data as any;
  const participant = participantResult.data as any;
  const prop = propResult.data as any;
  if (!season || !room || !participant || !prop) return null;
  if (
    room.league_season_id !== alias.league_season_id
    || room.week_number !== alias.week_number
    || room.competition_type !== "weekly"
    || room.experience_type !== "fantasy"
    || participant.room_id !== alias.room_id
  ) return null;

  const { data: card, error: cardError } = await supabase
    .from("gameday_pick_cards")
    .select("id, room_id")
    .eq("id", prop.card_id)
    .maybeSingle();
  if (cardError) throw new Error(cardError.message);
  if (!card || (card as any).room_id !== alias.room_id) return null;

  const moment = getWeeklyMoment(prop.template_prop_id);
  const options = Array.isArray(prop.answer_options) ? prop.answer_options : [];
  const answer = options.find((option: any) => option?.id === alias.selected_answer);
  if (!moment || !answer?.label) return null;
  const shareKind = alias.share_kind as FantasyPickShareKind;
  if (shareKind !== "pick" && shareKind !== "my_lock") return null;

  return {
    shortCode,
    leagueName: String(season.fantasy_leagues?.league_name || "Fantasy League"),
    weekNumber: alias.week_number,
    participantDisplayName: participant.display_name ? String(participant.display_name) : null,
    templatePropId: prop.template_prop_id,
    momentTitle: moment.title,
    answerLabel: String(answer.label),
    shareKind,
    canonicalPath:
      `/fantasy/weeks/${season.league_id}/${season.id}/${alias.week_number}/play?source=pick_share`,
  };
}

export function renderFantasyPickShareHtml(
  snapshot: FantasyPickShareSnapshot,
  shortUrl: string,
  canonicalUrl: string,
  imageUrl: string,
): string {
  const isMyLock = snapshot.shareKind === "my_lock";
  const title = isMyLock
    ? `🔒 MY LOCK — ${snapshot.momentTitle} — ${snapshot.leagueName}, Week ${snapshot.weekNumber}`
    : `${snapshot.momentTitle} — ${snapshot.leagueName}, Week ${snapshot.weekNumber}`;
  const description = buildFantasyPickSentence(
    snapshot.templatePropId,
    snapshot.answerLabel,
    snapshot.participantDisplayName,
  );
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Swayger Fantasy">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(shortUrl)}">
<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(imageUrl)}">
</head><body><p><a href="${escapeHtml(canonicalUrl)}">Open the protected Weekly picks</a></p></body></html>`;
}

export function renderFantasyPickShareSvg(snapshot: FantasyPickShareSnapshot): string {
  const isMyLock = snapshot.shareKind === "my_lock";
  const action = isMyLock ? "IS STANDING ON:" : "PICKED:";
  const participant = snapshot.participantDisplayName
    ? compact(snapshot.participantDisplayName, 32)
    : "A SWAYGER PLAYER";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#0C1220"/>
<rect x="32" y="32" width="1136" height="566" rx="42" fill="#111C30" stroke="#F5A623" stroke-width="4"/>
<style>
.brand{font:800 24px Arial,sans-serif;letter-spacing:5px;fill:#7A8FA8}.kind{font:800 28px Arial,sans-serif;letter-spacing:3px;fill:#F5A623}
.moment{font:800 58px Arial,sans-serif;fill:#fff}.person{font:700 30px Arial,sans-serif;fill:#A9B7C8}.answer{font:800 60px Arial,sans-serif;fill:#F5A623}
.context{font:700 25px Arial,sans-serif;fill:#7A8FA8}
</style>
<text x="82" y="105" class="brand">SWAYGER FANTASY</text>
<text x="82" y="165" class="kind">${isMyLock ? "🔒 MY LOCK" : "THE CALL"}</text>
<text x="82" y="245" class="moment">${escapeHtml(compact(snapshot.momentTitle, 31))}</text>
<text x="82" y="330" class="person">${escapeHtml(participant)} ${action}</text>
<text x="82" y="415" class="answer">${escapeHtml(compact(snapshot.answerLabel.toUpperCase(), 31))}</text>
<text x="82" y="540" class="context">${escapeHtml(compact(snapshot.leagueName, 48))} · WEEK ${snapshot.weekNumber}</text>
</svg>`;
}

function publicOrigin(req: Request): string {
  const configured = String(process.env.EXPO_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(configured)) return configured;
  if (process.env.NODE_ENV === "production") return "https://www.swayger.app";
  const protocol = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https").split(",")[0];
  return `${protocol}://${req.get("host")}`;
}

export function registerFantasyPickShareShortLink(
  app: Application,
  loadSnapshot: (
    shortCode: string,
  ) => Promise<FantasyPickShareSnapshot | null> = (shortCode) =>
    loadFantasyPickShareSnapshot(getServiceSupabase(), shortCode),
): void {
  app.get("/p/:shortCode/preview.svg", async (req: Request, res: Response) => {
    const shortCode = String(req.params.shortCode ?? "").trim().toLowerCase();
    if (!SHORT_CODE_PATTERN.test(shortCode)) {
      res.status(404).send("Pick share not found");
      return;
    }
    try {
      const snapshot = await loadSnapshot(shortCode);
      if (!snapshot) {
        res.status(404).send("Pick share not found");
        return;
      }
      res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.send(renderFantasyPickShareSvg(snapshot));
    } catch (error) {
      console.error("[fantasy-pick-share] preview image failed:", error);
      res.status(500).send("Unable to render pick preview");
    }
  });

  app.get("/p/:shortCode", async (req: Request, res: Response) => {
    const shortCode = String(req.params.shortCode ?? "").trim().toLowerCase();
    if (!SHORT_CODE_PATTERN.test(shortCode)) {
      res.status(404).send("Pick share not found");
      return;
    }
    try {
      const snapshot = await loadSnapshot(shortCode);
      if (!snapshot) {
        res.status(404).send("Pick share not found");
        return;
      }
      if (isReceiptPreviewCrawler(String(req.headers["user-agent"] ?? ""))) {
        const origin = publicOrigin(req);
        const shortUrl = `${origin}/p/${shortCode}`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.send(renderFantasyPickShareHtml(
          snapshot,
          shortUrl,
          `${origin}${snapshot.canonicalPath}`,
          `${shortUrl}/preview.svg`,
        ));
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, snapshot.canonicalPath);
    } catch (error) {
      console.error("[fantasy-pick-share] resolve failed:", error);
      res.status(500).send("Unable to resolve pick share");
    }
  });
}