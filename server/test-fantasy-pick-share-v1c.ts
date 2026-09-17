import assert from "node:assert/strict";
import fs from "node:fs";
import express from "express";
import {
  generateFantasyPickShareCode,
  getOrCreateFantasyPickShareAlias,
  renderFantasyPickShareHtml,
  renderFantasyPickShareSvg,
  registerFantasyPickShareShortLink,
  isFantasyPickSharePackagingEnabled,
  type FantasyPickShareSnapshot,
} from "./fantasy-pick-share-short-link";

type Row = {
  short_code: string;
  league_season_id: string;
  room_id: string;
  participant_id: string;
  prop_id: string;
  selected_answer: string;
  share_kind: "pick" | "my_lock";
  week_number: number;
};

function fakeSupabase(rows: Row[]): any {
  return {
    from(table: string) {
      assert.equal(table, "fantasy_weekly_pick_share_aliases");
      let filters: Record<string, unknown> = {};
      return {
        select() {
          return this;
        },
        match(next: Record<string, unknown>) {
          filters = { ...filters, ...next };
          return this;
        },
        async maybeSingle() {
          const row = rows.find((candidate) =>
            Object.entries(filters).every(([key, value]) => (candidate as any)[key] === value));
          return { data: row ? { short_code: row.short_code } : null, error: null };
        },
        insert(payload: Row) {
          return {
            select() {
              return {
                async maybeSingle() {
                  const naturalCollision = rows.some((candidate) =>
                    candidate.room_id === payload.room_id
                    && candidate.participant_id === payload.participant_id
                    && candidate.prop_id === payload.prop_id
                    && candidate.selected_answer === payload.selected_answer
                    && candidate.share_kind === payload.share_kind);
                  const codeCollision = rows.some((candidate) => candidate.short_code === payload.short_code);
                  if (naturalCollision || codeCollision) {
                    return { data: null, error: { code: "23505", message: "unique violation" } };
                  }
                  rows.push({ ...payload });
                  return { data: { short_code: payload.short_code }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function main() {
const generated = new Set(Array.from({ length: 256 }, () => generateFantasyPickShareCode()));
assert.equal(generated.size, 256);
for (const code of generated) assert.match(code, /^[a-z2-7]{16}$/);

const rows: Row[] = [];
const supabase = fakeSupabase(rows);
const base = {
  leagueSeasonId: "season",
  roomId: "room",
  participantId: "participant",
  propId: "prop",
  selectedAnswer: "answer-a",
  shareKind: "pick" as const,
  weekNumber: 2,
};
const first = await getOrCreateFantasyPickShareAlias(supabase, base);
const repeated = await getOrCreateFantasyPickShareAlias(supabase, base);
assert.equal(repeated, first);
assert.equal(rows.length, 1);

const changedAnswer = await getOrCreateFantasyPickShareAlias(supabase, {
  ...base,
  selectedAnswer: "answer-b",
});
assert.notEqual(changedAnswer, first);
assert.equal(rows.length, 2);
assert.equal(rows.find((row) => row.short_code === first)?.selected_answer, "answer-a");

const changedKind = await getOrCreateFantasyPickShareAlias(supabase, {
  ...base,
  shareKind: "my_lock",
});
assert.notEqual(changedKind, first);
assert.equal(rows.length, 3);
assert.equal(rows.find((row) => row.short_code === first)?.share_kind, "pick");

const snapshot: FantasyPickShareSnapshot = {
  shortCode: first,
  leagueName: "Food Pyramid XX",
  weekNumber: 2,
  participantDisplayName: "Darius",
  templatePropId: "fantasy_weekly_nfl_lowest_scoring_team",
  momentTitle: "BASEMENT WATCH",
  answerLabel: "All Eyez On Me",
  shareKind: "my_lock",
  canonicalPath: "/fantasy/weeks/league/season/2/play?source=pick_share",
};
const html = renderFantasyPickShareHtml(
  snapshot,
  `https://www.swayger.app/p/${first}`,
  `https://www.swayger.app${snapshot.canonicalPath}`,
  `https://www.swayger.app/p/${first}/preview.svg`,
);
assert.match(html, /🔒 MY LOCK — BASEMENT WATCH/);
assert.match(html, /Darius has All Eyez On Me finishing with the fewest fantasy points this week\./);
assert.match(html, /Food Pyramid XX/);
assert.match(html, /noindex, nofollow/);
assert.doesNotMatch(html, /participant_id|guest_token|access_token|League Picks|percentage/i);
const svg = renderFantasyPickShareSvg(snapshot);
assert.match(svg, /MY LOCK/);
assert.match(svg, /ALL EYEZ ON ME/);
assert.doesNotMatch(svg, /standings|other picks|participant_id/i);

const source = fs.readFileSync("server/fantasy-pick-share-short-link.ts", "utf8");
assert.match(source, /res\.redirect\(302, snapshot\.canonicalPath\)/);
assert.match(source, /isReceiptPreviewCrawler/);
assert.doesNotMatch(source, /ensureFantasyParticipant|Analytics|capture\(/);
const sheetSource = fs.readFileSync("components/fantasy/CallYourShotSheet.tsx", "utf8");
const shareHandler = sheetSource.match(/const handleShare = async \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
assert.match(sheetSource, /onPrepareShare\(selected\)[\s\S]*setPreparedPick\(prepared\)/);
assert.doesNotMatch(shareHandler, /await onPrepareShare|onPrepareShare\(/);
const playSource = fs.readFileSync(
  "app/fantasy/weeks/[leagueId]/[seasonId]/[weekNumber]/play.tsx",
  "utf8",
);
assert.match(playSource, /selectedAnswerLabel: alias\.answer_label/);
assert.match(playSource, /alias\.selected_answer !== confirmedPicksRef\.current\[pick\.propId\]/);

const previousFlag = process.env.FANTASY_PICK_SHARE_PACKAGING_ENABLED;
process.env.FANTASY_PICK_SHARE_PACKAGING_ENABLED = "false";
assert.equal(isFantasyPickSharePackagingEnabled(), false);
process.env.FANTASY_PICK_SHARE_PACKAGING_ENABLED = "true";
assert.equal(isFantasyPickSharePackagingEnabled(), true);
if (previousFlag === undefined) delete process.env.FANTASY_PICK_SHARE_PACKAGING_ENABLED;
else process.env.FANTASY_PICK_SHARE_PACKAGING_ENABLED = previousFlag;

let loaderCalls = 0;
const app = express();
registerFantasyPickShareShortLink(app, async (code) => {
  loaderCalls++;
  return code === first ? snapshot : null;
});
const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
  const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
});
try {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  const human = await fetch(`${origin}/p/${first}`, {
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  assert.equal(human.status, 302);
  assert.equal(human.headers.get("location"), snapshot.canonicalPath);
  assert.equal(human.headers.get("cache-control"), "no-store");

  const crawler = await fetch(`${origin}/p/${first}`, {
    headers: { "User-Agent": "Discordbot/2.0" },
  });
  assert.equal(crawler.status, 200);
  assert.match(crawler.headers.get("content-type") ?? "", /text\/html/);
  const crawlerBody = await crawler.text();
  assert.match(crawlerBody, /og:title/);
  assert.match(crawlerBody, /All Eyez On Me/);
  assert.doesNotMatch(crawlerBody, /participant_id|guest_token|access_token|League Picks/i);

  const image = await fetch(`${origin}/p/${first}/preview.svg`);
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type") ?? "", /image\/svg\+xml/);

  const unknown = await fetch(`${origin}/p/zzzzzzzzzzzzzzzz`, { redirect: "manual" });
  assert.equal(unknown.status, 404);
  const malformed = await fetch(`${origin}/p/not-valid`, { redirect: "manual" });
  assert.equal(malformed.status, 404);
  assert.equal(loaderCalls, 4);
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
}

console.log("SWAYGER RUN V1C alias, rollback, and route assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});