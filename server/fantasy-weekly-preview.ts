const WEEKLY_FACT_TEMPLATES = [
  ["fantasy_weekly_nfl_largest_margin_winner", "Biggest blowout"],
  ["fantasy_weekly_nfl_highest_scoring_team", "Highest fantasy score"],
  ["fantasy_weekly_nfl_lowest_scoring_team", "Fewest fantasy points"],
  ["fantasy_weekly_nfl_smallest_margin_winner", "Closest win"],
] as const;

export interface WeeklyReceiptPreview {
  leagueName: string;
  weekNumber: number;
  seasonYear: number | null;
  winners: { displayName: string; points: number }[];
  topStandings: { displayName: string; points: number; rankLabel: string }[];
  fact: string | null;
}

export function isReceiptPreviewCrawler(userAgent: string): boolean {
  return /applebot|bingbot|discordbot|facebookexternalhit|facebot|googlebot|groupme|iMessageLinkPreview|linkedinbot|pinterest|skypeuripreview|slackbot|telegrambot|twitterbot|whatsapp/i.test(userAgent);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compactName(value: string, max = 34): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export async function loadWeeklyReceiptPreview(
  supabase: any,
  seasonId: string,
  leagueId: string,
  weekNumber: number,
): Promise<WeeklyReceiptPreview | null> {
  const { data: season } = await supabase
    .from("fantasy_league_seasons")
    .select("id, season_year, fantasy_leagues!inner(id, league_name)")
    .eq("id", seasonId)
    .eq("league_id", leagueId)
    .maybeSingle();
  if (!season) return null;

  const { data: room } = await supabase
    .from("gameday_rooms")
    .select("id, status")
    .eq("league_season_id", seasonId)
    .eq("competition_type", "weekly")
    .eq("experience_type", "fantasy")
    .eq("week_number", weekNumber)
    .maybeSingle();
  if (!room || room.status !== "finalized") return null;

  const { data: card } = await supabase
    .from("gameday_pick_cards")
    .select("id")
    .eq("room_id", room.id)
    .order("created_at", { ascending: true })
    .maybeSingle();
  if (!card) return null;

  const { data: props } = await supabase
    .from("gameday_props")
    .select("id, template_prop_id, point_value, status, correct_answer, correct_answer_ids, answer_options")
    .eq("card_id", card.id)
    .eq("scoring_scope", "competition");
  const settledProps = (props ?? []).filter((prop: any) => prop.status === "settled");
  if (settledProps.length === 0) return null;

  const { data: participants } = await supabase
    .from("gameday_participants")
    .select("id, display_name")
    .eq("room_id", room.id);
  const participantList = participants ?? [];
  const propIds = settledProps.map((prop: any) => prop.id);
  const participantIds = participantList.map((participant: any) => participant.id);
  let picks: any[] = [];
  if (propIds.length && participantIds.length) {
    const { data } = await supabase
      .from("gameday_picks")
      .select("participant_id, prop_id, is_correct")
      .in("prop_id", propIds)
      .in("participant_id", participantIds);
    picks = data ?? [];
  }

  const pointValues = new Map(settledProps.map((prop: any) => [prop.id, Number(prop.point_value) || 0]));
  const scores = participantList.map((participant: any, index: number) => {
    const correct = picks.filter((pick) => pick.participant_id === participant.id && pick.is_correct === true);
    return {
      displayName: String(participant.display_name || "League member"),
      points: correct.reduce((sum, pick) => sum + (pointValues.get(pick.prop_id) ?? 0), 0),
      correctCount: correct.length,
      index,
    };
  });
  scores.sort((a, b) => b.points - a.points || b.correctCount - a.correctCount || a.index - b.index);
  const ranked = scores.map((score) => {
    const rank = scores.filter((entry) => entry.points > score.points).length + 1;
    const tied = scores.filter((entry) => entry.points === score.points).length > 1;
    return { ...score, rank, rankLabel: tied ? `T-${rank}` : String(rank) };
  });
  const topPoints = ranked[0]?.points ?? 0;
  const winners = ranked.filter((entry) => entry.points === topPoints)
    .map((entry) => ({ displayName: entry.displayName, points: entry.points }));
  if (winners.length === 0) return null;

  let fact: string | null = null;
  for (const [templateId, label] of WEEKLY_FACT_TEMPLATES) {
    const prop = settledProps.find((entry: any) => entry.template_prop_id === templateId);
    if (!prop) continue;
    const options = Array.isArray(prop.answer_options) ? prop.answer_options : [];
    const labels = (Array.isArray(prop.correct_answer_ids) && prop.correct_answer_ids.length
      ? prop.correct_answer_ids
      : prop.correct_answer ? [prop.correct_answer] : [])
      .map((id: string) => options.find((option: any) => option?.id === id)?.label ?? id)
      .filter(Boolean);
    if (labels.length) {
      fact = `${label}: ${labels.join(" + ")}`;
      break;
    }
  }

  const cutoff = ranked[3]?.points;
  const topStandings = ranked
    .filter((entry, index) => index < 4 || (cutoff !== undefined && entry.points === cutoff))
    .slice(0, 5)
    .map((entry) => ({
      displayName: entry.displayName,
      points: entry.points,
      rankLabel: entry.rankLabel,
    }));

  return {
    leagueName: String(season.fantasy_leagues?.league_name || "Fantasy League"),
    weekNumber,
    seasonYear: season.season_year ?? null,
    winners,
    topStandings,
    fact,
  };
}

export function renderWeeklyReceiptPreviewHtml(
  preview: WeeklyReceiptPreview,
  shortUrl: string,
  canonicalUrl: string,
  imageUrl: string,
): string {
  const winnerNames = preview.winners.map((winner) => winner.displayName).join(" + ");
  const winningPoints = preview.winners[0]?.points ?? 0;
  const title = `${preview.leagueName} — Week ${preview.weekNumber} Receipt`;
  const result = preview.winners.length > 1
    ? `${winnerNames} tied at ${winningPoints} SP.`
    : `${winnerNames} won with ${winningPoints} SP.`;
  const description = `${result}${preview.fact ? ` ${preview.fact}.` : ""}`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Swayger">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(shortUrl)}">
<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:image:width" content="1080">
<meta property="og:image:height" content="1350">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(imageUrl)}">
<meta http-equiv="refresh" content="0;url=${escapeHtml(canonicalUrl)}">
</head><body><p><a href="${escapeHtml(canonicalUrl)}">Open the protected Weekly receipt</a></p></body></html>`;
}

export function renderWeeklyReceiptPreviewSvg(preview: WeeklyReceiptPreview): string {
  const winners = preview.winners.map((winner) => compactName(winner.displayName)).join(" + ");
  const points = preview.winners[0]?.points ?? 0;
  const rows = preview.topStandings.map((entry, index) => {
    const y = 820 + index * 82;
    return `<text x="110" y="${y}" class="rank">${escapeHtml(entry.rankLabel)}</text>
<text x="210" y="${y}" class="name">${escapeHtml(compactName(entry.displayName, 28))}</text>
<text x="930" y="${y}" text-anchor="end" class="score">${entry.points} SP</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
<rect width="1080" height="1350" fill="#0C1220"/>
<rect x="36" y="36" width="1008" height="1278" rx="54" fill="#111C30" stroke="#B45309" stroke-width="5"/>
<style>
.brand{font:800 30px Arial,sans-serif;letter-spacing:5px;fill:#7A8FA8}.eyebrow{font:800 32px Arial,sans-serif;letter-spacing:4px;fill:#F5A623}
.league{font:800 62px Arial,sans-serif;fill:#fff}.sub{font:700 34px Arial,sans-serif;fill:#A9B7C8}
.winnerLabel{font:800 28px Arial,sans-serif;letter-spacing:4px;fill:#F5A623}.winner{font:800 55px Arial,sans-serif;fill:#fff}
.winnerScore{font:800 43px Arial,sans-serif;fill:#F5A623}.section{font:800 26px Arial,sans-serif;letter-spacing:4px;fill:#7A8FA8}
.rank{font:800 30px Arial,sans-serif;fill:#F5A623}.name{font:700 34px Arial,sans-serif;fill:#fff}.score{font:800 32px Arial,sans-serif;fill:#A9B7C8}
.footer{font:700 27px Arial,sans-serif;letter-spacing:3px;fill:#61758F}
</style>
<text x="90" y="125" class="brand">SWAYGER FANTASY</text>
<text x="90" y="205" class="eyebrow">WEEKLY RECEIPT</text>
<text x="90" y="290" class="league">${escapeHtml(compactName(preview.leagueName, 29))}</text>
<text x="90" y="350" class="sub">Week ${preview.weekNumber}${preview.seasonYear ? ` · ${preview.seasonYear}` : ""}  ·  FINALIZED</text>
<rect x="76" y="410" width="928" height="280" rx="38" fill="#1A1200" stroke="#B45309" stroke-width="3"/>
<text x="540" y="490" text-anchor="middle" class="winnerLabel">${preview.winners.length > 1 ? "CO-WINNERS" : "WINNER"}</text>
<text x="540" y="585" text-anchor="middle" class="winner">${escapeHtml(compactName(winners, 34))}</text>
<text x="540" y="650" text-anchor="middle" class="winnerScore">${points} SP</text>
<text x="90" y="755" class="section">TOP STANDINGS</text>
${rows}
<text x="540" y="1260" text-anchor="middle" class="footer">SWAYGER · FINAL LEAGUE RESULT</text>
</svg>`;
}