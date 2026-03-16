var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/email.ts
var email_exports = {};
__export(email_exports, {
  sendMMReminderEmail: () => sendMMReminderEmail,
  sendMMScoreUpdateEmail: () => sendMMScoreUpdateEmail,
  sendNotificationEmail: () => sendNotificationEmail
});
import { Resend } from "resend";
function outcomeLabel(outcome) {
  switch (outcome) {
    case "creator":
      return "Creator Wins";
    case "opponent":
      return "Opponent Wins";
    case "draw":
      return "Draw";
    case "no_contest":
      return "No Contest";
    default:
      return outcome;
  }
}
function detailRow(label, value) {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
      <span style="font-size:13px;color:#8B95A5;">${label}</span>
      <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${value}</span>
    </td>
  </tr>`;
}
function swaygerDetailsHtml(p) {
  const stake = `${p.swayger.stakeUnits} unit${p.swayger.stakeUnits !== 1 ? "s" : ""}`;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#13131D;border-radius:10px;padding:4px 16px;margin-bottom:8px;">
    ${detailRow("Wager", p.swayger.title)}
    ${detailRow("Category", p.swayger.category)}
    ${detailRow("Stake", stake)}
  </table>`;
}
function buildEmailHtml(pageTitle, headline, bodyHtml, ctaLabel, ctaUrl) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle}</title>
</head>
<body style="margin:0;padding:0;background:#0F0F14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F0F14;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr>
          <td style="padding-bottom:28px;text-align:center;">
            <span style="font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">SWAYGER</span>
          </td>
        </tr>
        <tr>
          <td style="background:#1C1C26;border-radius:16px;padding:28px 28px 32px;">
            <p style="margin:0 0 20px;font-size:17px;font-weight:700;color:#FFFFFF;line-height:1.4;">${headline}</p>
            ${bodyHtml}
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
              <tr>
                <td align="center">
                  <a href="${ctaUrl}"
                     style="display:inline-block;background:#6C63FF;color:#FFFFFF;font-size:15px;font-weight:700;padding:13px 32px;border-radius:12px;text-decoration:none;">
                    ${ctaLabel}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding-top:20px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#4A4A5A;">Swayger &middot; Social wager contracts, for fun</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
async function sendNotificationEmail(payload) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  const swaygerUrl = `${APP_URL}/swayger/${payload.swayger.id}`;
  const sender = payload.sender.name;
  const title = payload.swayger.title;
  const details = swaygerDetailsHtml(payload);
  let subject;
  let headline;
  let body;
  let ctaLabel;
  switch (payload.event) {
    case "invite_created":
      subject = `\u{1F3AF} ${sender} challenged you to a Swayger`;
      headline = `${sender} just sent you a challenge.`;
      body = details;
      ctaLabel = "View Challenge";
      break;
    case "swayger_accepted":
      subject = `\u2705 ${sender} accepted your Swayger`;
      headline = `${sender} is in. The game is on.`;
      body = details;
      ctaLabel = "View Swayger";
      break;
    case "settlement_proposed": {
      subject = `\u2696\uFE0F ${sender} proposed a settlement`;
      headline = `${sender} wants to settle "${title}"`;
      const proposed = payload.outcome ? outcomeLabel(payload.outcome) : "\u2014";
      body = details + `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">Proposed outcome: <strong style="color:#FFFFFF;">${proposed}</strong></p>`;
      ctaLabel = "Review & Confirm";
      break;
    }
    case "swayger_settled": {
      subject = `\u{1F3C6} "${title}" has been settled`;
      headline = `The results are in.`;
      const final = payload.outcome ? outcomeLabel(payload.outcome) : "\u2014";
      body = details + `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">Final outcome: <strong style="color:#FFFFFF;">${final}</strong></p>`;
      ctaLabel = "See Results";
      break;
    }
    case "swayger_expired": {
      subject = `\u23F1\uFE0F "${title}" expired \u2014 stakes returned`;
      headline = `"${title}" expired without a verdict.`;
      body = details + `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">Neither party reached agreement within 7 days. Your staked Swayger Points have been returned.</p>`;
      ctaLabel = "View Swayger";
      break;
    }
  }
  const results = await Promise.allSettled(
    payload.recipients.map(
      (r) => resend.emails.send({
        from: FROM,
        to: r.email,
        subject,
        html: buildEmailHtml(subject, headline, body, ctaLabel, swaygerUrl)
      })
    )
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(
        `[email] Failed to send to ${payload.recipients[i]?.email}:`,
        r.reason
      );
    } else {
      console.log(
        `[email] Sent ${payload.event} to ${payload.recipients[i]?.email}`
      );
    }
  });
}
async function sendMMScoreUpdateEmail({
  to,
  displayName,
  totalPoints,
  sweetSixteenPts,
  eliteEightPts,
  finalFourPts,
  championPts,
  upsetPts,
  correctUpsets,
  blowoutPts,
  correctBlowouts,
  highScorerPts,
  correctHighScorers,
  rank,
  totalPlayers
}) {
  if (!process.env.RESEND_API_KEY) return;
  const subject = `\u{1F3C0} March Madness score update \u2014 ${totalPoints} pts`;
  const headline = `Here's where you stand`;
  const rankLabel = rank === 1 ? "\u{1F947} You're in first place!" : rank <= 3 ? `\u{1F525} You're #${rank} out of ${totalPlayers}` : `#${rank} out of ${totalPlayers} players`;
  const body = `
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      Hey ${displayName},
    </p>
    <p style="margin:0 0 4px;font-size:13px;color:#8B95A5;letter-spacing:0.5px;text-transform:uppercase;">Leaderboard</p>
    <p style="margin:0 0 20px;font-size:28px;font-weight:800;color:#F5A623;">${rankLabel}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#13131D;border-radius:10px;padding:4px 16px;margin-bottom:20px;">
      <tr><td style="padding:12px 0 4px;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:15px;color:#8B95A5;">Total Points</span>
        <span style="float:right;font-size:22px;font-weight:800;color:#F5A623;">${totalPoints}</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">Sweet 16</span>
        <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${sweetSixteenPts} pts</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">Elite 8</span>
        <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${eliteEightPts} pts</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">Final Four</span>
        <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${finalFourPts} pts</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">Champion</span>
        <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${championPts} pts</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">Upset Picks</span>
        <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${upsetPts} pts (${correctUpsets} correct)</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">Blowout Picks</span>
        <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${blowoutPts} pts (${correctBlowouts} correct)</span>
      </td></tr>
      <tr><td style="padding:10px 0;">
        <span style="font-size:13px;color:#8B95A5;">High Scorer Picks</span>
        <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${highScorerPts} pts (${correctHighScorers} correct)</span>
      </td></tr>
    </table>
  `;
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: buildEmailHtml(
      subject,
      headline,
      body,
      "View Leaderboard",
      `${APP_URL}/march-madness/picks-leaderboard`
    )
  });
}
async function sendMMReminderEmail({
  to,
  displayName
}) {
  const subject = "\u{1F3C0} Your March Madness Picks Aren't Locked Yet";
  const headline = "Lock In Your Picks Before Tip-Off";
  const body = `
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      Hey ${displayName},
    </p>
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      The tournament tips off soon and you haven't locked in your March Madness picks yet.
      Pick your <strong style="color:#FFFFFF;">Champion, Final Four, Elite Eight, and Sweet Sixteen</strong> \u2014 plus up to 3 upset picks for the Round of 64.
    </p>
    <p style="margin:0;color:#8B95A5;font-size:14px;">
      Picks lock at noon ET on March 19. Once it's locked, it's locked.
    </p>
  `;
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: buildEmailHtml(subject, headline, body, "Lock My Picks", `${APP_URL}/march-madness/picks`)
  });
}
var resend, FROM, APP_URL;
var init_email = __esm({
  "server/email.ts"() {
    "use strict";
    resend = new Resend(process.env.RESEND_API_KEY);
    FROM = process.env.RESEND_FROM_EMAIL || "Swayger <onboarding@resend.dev>";
    APP_URL = process.env.EXPO_PUBLIC_APP_URL || "https://swayger-app.replit.app";
  }
});

// server/index.ts
import express from "express";

// server/routes.ts
init_email();
import { createServer } from "node:http";

// server/routes-mm-admin.ts
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key);
}
function isAdminToken(token) {
  const adminToken = process.env.MM_ADMIN_TOKEN;
  if (!adminToken) return false;
  return token === adminToken;
}
var TAKE_POINTS = {
  sweet_sixteen: 2,
  elite_eight: 3,
  final_four: 5,
  champion: 10
};
var TAKE_ROUND_MAP = {
  sweet_sixteen: "round-64",
  // won in R64 → reached Sweet 16
  elite_eight: "round-32",
  // won in R32 → reached Elite 8
  final_four: "sweet-16",
  // won in S16 → reached Final Four
  champion: "championship"
  // won the championship
};
var UPSET_POINTS = 3;
var BLOWOUT_POINTS = 3;
var HIGH_SCORER_POINTS = 3;
async function computeAndSaveScores(supabase) {
  const { data: resultsRaw, error: resultsErr } = await supabase.from("mm_game_results").select("*");
  if (resultsErr) return { scored: 0, error: resultsErr.message };
  const results = resultsRaw ?? [];
  const winnersByRound = {};
  for (const r of results) {
    if (!winnersByRound[r.round_id]) winnersByRound[r.round_id] = /* @__PURE__ */ new Set();
    if (r.winner_name) winnersByRound[r.round_id].add(r.winner_name);
  }
  const scores = {};
  function emptyScore() {
    return {
      sweet_sixteen: 0,
      elite_eight: 0,
      final_four: 0,
      champion: 0,
      upset: 0,
      correct_upsets: 0,
      blowout: 0,
      correct_blowouts: 0,
      high_scorer: 0,
      correct_high_scorers: 0
    };
  }
  const { data: takesRaw } = await supabase.from("mm_locked_takes").select("*").eq("is_submitted", true);
  const takes = takesRaw ?? [];
  for (const take of takes) {
    if (!scores[take.user_id]) scores[take.user_id] = emptyScore();
    const roundId = TAKE_ROUND_MAP[take.take_type];
    const advancedTeams = winnersByRound[roundId];
    if (!advancedTeams || advancedTeams.size === 0) continue;
    const ptsEach = TAKE_POINTS[take.take_type] ?? 0;
    for (const team of take.teams ?? []) {
      if (advancedTeams.has(team)) {
        scores[take.user_id][take.take_type] += ptsEach;
      }
    }
  }
  const { data: specialPicksRaw } = await supabase.from("mm_special_picks").select("*");
  const specialPicks = specialPicksRaw ?? [];
  const { data: rankedMatchupsRaw } = await supabase.from("mm_round_matchups").select("*");
  const rankedMatchups = rankedMatchupsRaw ?? [];
  const candidateMap = {};
  for (const rm of rankedMatchups) {
    const key = `${rm.round_id}:${rm.pick_type}`;
    if (!candidateMap[key]) candidateMap[key] = /* @__PURE__ */ new Set();
    candidateMap[key].add(rm.matchup_id);
  }
  const roundResults = {};
  for (const r of results) {
    if (!roundResults[r.round_id]) roundResults[r.round_id] = [];
    roundResults[r.round_id].push(r);
  }
  const biggestBlowout = {};
  const highestScorer = {};
  for (const [roundId, roundRes] of Object.entries(roundResults)) {
    const blowoutCandidates = candidateMap[`${roundId}:blowout`] ?? /* @__PURE__ */ new Set();
    const hsCandidates = candidateMap[`${roundId}:high_scorer`] ?? /* @__PURE__ */ new Set();
    let maxMargin = -1;
    let maxTotal = -1;
    for (const r of roundRes) {
      const margin = r.winner_score != null && r.loser_score != null ? r.winner_score - r.loser_score : -1;
      const total = r.winner_score != null && r.loser_score != null ? r.winner_score + r.loser_score : -1;
      if (blowoutCandidates.has(r.matchup_id) && margin > maxMargin) {
        maxMargin = margin;
        biggestBlowout[roundId] = r.matchup_id;
      }
      if (hsCandidates.has(r.matchup_id) && total > maxTotal) {
        maxTotal = total;
        highestScorer[roundId] = r.matchup_id;
      }
    }
  }
  for (const pick of specialPicks) {
    if (!scores[pick.user_id]) scores[pick.user_id] = emptyScore();
    if (pick.pick_type === "upset") {
      const resultForGame = results.find(
        (r) => r.round_id === pick.round_id && r.matchup_id === pick.matchup_id
      );
      if (resultForGame && resultForGame.winner_name === pick.picked_team) {
        scores[pick.user_id].upset += UPSET_POINTS;
        scores[pick.user_id].correct_upsets += 1;
      }
    } else if (pick.pick_type === "blowout") {
      const winningMatchup = biggestBlowout[pick.round_id];
      if (winningMatchup && pick.matchup_id === winningMatchup) {
        scores[pick.user_id].blowout += BLOWOUT_POINTS;
        scores[pick.user_id].correct_blowouts += 1;
      }
    } else if (pick.pick_type === "high_scorer") {
      const winningMatchup = highestScorer[pick.round_id];
      if (winningMatchup && pick.matchup_id === winningMatchup) {
        scores[pick.user_id].high_scorer += HIGH_SCORER_POINTS;
        scores[pick.user_id].correct_high_scorers += 1;
      }
    }
  }
  const upserts = Object.entries(scores).map(([userId, p]) => ({
    user_id: userId,
    total_points: p.sweet_sixteen + p.elite_eight + p.final_four + p.champion + p.upset + p.blowout + p.high_scorer,
    sweet_sixteen_pts: p.sweet_sixteen,
    elite_eight_pts: p.elite_eight,
    final_four_pts: p.final_four,
    champion_pts: p.champion,
    upset_pts: p.upset,
    correct_upsets: p.correct_upsets,
    blowout_pts: p.blowout,
    correct_blowouts: p.correct_blowouts,
    high_scorer_pts: p.high_scorer,
    correct_high_scorers: p.correct_high_scorers,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }));
  if (upserts.length > 0) {
    const { error: upsertErr } = await supabase.from("mm_pick_scores").upsert(upserts, { onConflict: "user_id" });
    if (upsertErr) return { scored: 0, error: upsertErr.message };
  }
  return { scored: upserts.length, error: null };
}
async function sendScoreUpdateBlast(supabase) {
  const { sendMMScoreUpdateEmail: sendMMScoreUpdateEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
  const { data: allScoresRaw } = await supabase.from("mm_pick_scores").select("*").order("total_points", { ascending: false });
  const allScores = allScoresRaw ?? [];
  if (!allScores.length) return;
  const totalPlayers = allScores.length;
  const userIds = allScores.map((s) => s.user_id);
  const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, notification_email").in("id", userIds);
  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );
  let sent = 0;
  for (let i = 0; i < allScores.length; i++) {
    const s = allScores[i];
    const profile = profileMap.get(s.user_id);
    if (!profile?.notification_email) continue;
    try {
      await sendMMScoreUpdateEmail2({
        to: profile.notification_email,
        displayName: profile.display_name || `@${profile.username}`,
        totalPoints: s.total_points ?? 0,
        sweetSixteenPts: s.sweet_sixteen_pts ?? 0,
        eliteEightPts: s.elite_eight_pts ?? 0,
        finalFourPts: s.final_four_pts ?? 0,
        championPts: s.champion_pts ?? 0,
        upsetPts: s.upset_pts ?? 0,
        correctUpsets: s.correct_upsets ?? 0,
        blowoutPts: s.blowout_pts ?? 0,
        correctBlowouts: s.correct_blowouts ?? 0,
        highScorerPts: s.high_scorer_pts ?? 0,
        correctHighScorers: s.correct_high_scorers ?? 0,
        rank: i + 1,
        totalPlayers
      });
      sent++;
    } catch (e) {
      console.error("[mm-admin] score email failed for", s.user_id, e);
    }
  }
  console.log(`[mm-admin] Score update blast: sent to ${sent}/${totalPlayers}`);
}
function registerMMAdminRoutes(app2) {
  app2.get("/admin/mm", (req, res) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res.status(401).send("<h1>401 \u2014 Invalid or missing admin token</h1><p>Append ?token=YOUR_TOKEN to the URL.</p>");
      return;
    }
    const htmlPath = path.resolve(process.cwd(), "server", "templates", "mm-admin.html");
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send("Admin template not found");
    }
  });
  app2.post("/admin/mm/api/resolve", async (req, res) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    const { round_id, matchup_id, winner_name, winner_seed, loser_name, loser_seed, winner_score, loser_score, was_upset } = req.body;
    if (!round_id || !matchup_id || !winner_name) {
      res.status(400).json({ ok: false, error: "round_id, matchup_id, winner_name are required" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from("mm_game_results").upsert(
        {
          round_id,
          matchup_id,
          winner_name,
          winner_seed: winner_seed ?? null,
          loser_name: loser_name ?? null,
          loser_seed: loser_seed ?? null,
          winner_score: winner_score ?? null,
          loser_score: loser_score ?? null,
          was_upset: was_upset ?? false,
          resolved_at: (/* @__PURE__ */ new Date()).toISOString(),
          resolved_by: "admin"
        },
        { onConflict: "round_id,matchup_id" }
      );
      if (error) {
        res.status(500).json({ ok: false, error: error.message });
        return;
      }
      res.json({ ok: true, message: `Result saved: ${winner_name} wins in ${round_id}` });
    } catch (err) {
      console.error("[mm-admin] resolve error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/score", async (req, res) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { scored, error } = await computeAndSaveScores(supabase);
      if (error) {
        res.status(500).json({ ok: false, error });
        return;
      }
      res.json({ ok: true, message: `Scores recomputed for ${scored} user(s) \u2014 sending score update emails` });
      sendScoreUpdateBlast(supabase).catch(
        (e) => console.error("[mm-admin] score blast error:", e)
      );
    } catch (err) {
      console.error("[mm-admin] score error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/api/results", async (req, res) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.from("mm_game_results").select("*").order("resolved_at", { ascending: false });
      if (error) {
        res.status(500).json({ ok: false, error: error.message });
        return;
      }
      res.json({ ok: true, results: data });
    } catch (err) {
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/api/leaderboard", async (req, res) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { data: scores } = await supabase.from("mm_pick_scores").select("*").order("total_points", { ascending: false }).limit(20);
      if (!scores?.length) {
        res.json({ ok: true, entries: [] });
        return;
      }
      const userIds = scores.map((s) => s.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name").in("id", userIds);
      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.id, p])
      );
      const entries = scores.map((s) => ({
        ...s,
        username: profileMap.get(s.user_id)?.username ?? "?",
        display_name: profileMap.get(s.user_id)?.display_name ?? null
      }));
      res.json({ ok: true, entries });
    } catch (err) {
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/remind", async (req, res) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const { sendMMReminderEmail: sendMMReminderEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const supabase = getSupabase();
      const { data: allProfiles } = await supabase.from("profiles").select("id, username, display_name, notification_email");
      const { data: takes } = await supabase.from("mm_locked_takes").select("user_id").eq("is_submitted", true);
      const usersWithTakes = new Set((takes ?? []).map((t) => t.user_id));
      const eligible = (allProfiles ?? []).filter(
        (p) => !usersWithTakes.has(p.id) && p.notification_email
      );
      let sent = 0;
      for (const profile of eligible) {
        try {
          await sendMMReminderEmail2({
            to: profile.notification_email,
            displayName: profile.display_name || `@${profile.username}`
          });
          sent++;
        } catch (e) {
          console.error("[mm-admin] reminder email failed for", profile.id, e);
        }
      }
      res.json({ ok: true, message: `Reminders sent to ${sent} user(s)` });
    } catch (err) {
      console.error("[mm-admin] remind error:", err);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });
}

// server/routes-mm-special.ts
import { createClient as createClient2 } from "@supabase/supabase-js";

// lib/march-madness.ts
var FULL_BRACKET = {
  firstFour: [
    { region: "Midwest", slot: 16, teamA: "UMBC", teamB: "Howard" },
    { region: "South", slot: 16, teamA: "Lehigh", teamB: "Prairie View A&M" },
    { region: "West", slot: 11, teamA: "Texas", teamB: "NC State" },
    { region: "Midwest", slot: 11, teamA: "SMU", teamB: "Miami (OH)" }
  ],
  east: [
    { seed1: 1, team1: "Duke", seed2: 16, team2: "Siena", site: "Greenville, SC", date: "Mar 19" },
    { seed1: 8, team1: "Ohio St.", seed2: 9, team2: "TCU", site: "Greenville, SC", date: "Mar 19" },
    { seed1: 5, team1: "St. John's", seed2: 12, team2: "Northern Iowa", site: "San Diego, CA", date: "Mar 20" },
    { seed1: 4, team1: "Kansas", seed2: 13, team2: "Cal Baptist", site: "San Diego, CA", date: "Mar 20" },
    { seed1: 6, team1: "Louisville", seed2: 11, team2: "South Florida", site: "Buffalo, NY", date: "Mar 19" },
    { seed1: 3, team1: "Michigan St.", seed2: 14, team2: "North Dakota St.", site: "Buffalo, NY", date: "Mar 19" },
    { seed1: 7, team1: "UCLA", seed2: 10, team2: "UCF", site: "Philadelphia, PA", date: "Mar 20" },
    { seed1: 2, team1: "UConn", seed2: 15, team2: "Furman", site: "Philadelphia, PA", date: "Mar 20" }
  ],
  south: [
    { seed1: 1, team1: "Florida", seed2: 16, team2: "Lehigh/PVAMU", site: "Tampa, FL", date: "Mar 20" },
    { seed1: 8, team1: "Clemson", seed2: 9, team2: "Iowa", site: "Tampa, FL", date: "Mar 20" },
    { seed1: 5, team1: "Vanderbilt", seed2: 12, team2: "McNeese", site: "Oklahoma City, OK", date: "Mar 19" },
    { seed1: 4, team1: "Nebraska", seed2: 13, team2: "Troy", site: "Oklahoma City, OK", date: "Mar 19" },
    { seed1: 6, team1: "North Carolina", seed2: 11, team2: "VCU", site: "Greenville, SC", date: "Mar 19" },
    { seed1: 3, team1: "Illinois", seed2: 14, team2: "Penn", site: "Greenville, SC", date: "Mar 19" },
    { seed1: 7, team1: "Saint Mary's", seed2: 10, team2: "Texas A&M", site: "Oklahoma City, OK", date: "Mar 20" },
    { seed1: 2, team1: "Houston", seed2: 15, team2: "Idaho", site: "Oklahoma City, OK", date: "Mar 20" }
  ],
  west: [
    { seed1: 1, team1: "Arizona", seed2: 16, team2: "Long Island", site: "San Diego, CA", date: "Mar 20" },
    { seed1: 8, team1: "Villanova", seed2: 9, team2: "Utah St.", site: "San Diego, CA", date: "Mar 20" },
    { seed1: 5, team1: "Wisconsin", seed2: 12, team2: "High Point", site: "Portland, OR", date: "Mar 19" },
    { seed1: 4, team1: "Arkansas", seed2: 13, team2: "Hawaii", site: "Portland, OR", date: "Mar 19" },
    { seed1: 6, team1: "BYU", seed2: 11, team2: "Texas/NC State", site: "Portland, OR", date: "Mar 19" },
    { seed1: 3, team1: "Gonzaga", seed2: 14, team2: "Kennesaw St.", site: "Portland, OR", date: "Mar 19" },
    { seed1: 7, team1: "Miami (FL)", seed2: 10, team2: "Missouri", site: "St. Louis, MO", date: "Mar 20" },
    { seed1: 2, team1: "Purdue", seed2: 15, team2: "Queens (N.C.)", site: "St. Louis, MO", date: "Mar 20" }
  ],
  midwest: [
    { seed1: 1, team1: "Michigan", seed2: 16, team2: "UMBC/Howard", site: "Buffalo, NY", date: "Mar 19" },
    { seed1: 8, team1: "Georgia", seed2: 9, team2: "Saint Louis", site: "Buffalo, NY", date: "Mar 19" },
    { seed1: 5, team1: "Texas Tech", seed2: 12, team2: "Akron", site: "Tampa, FL", date: "Mar 20" },
    { seed1: 4, team1: "Alabama", seed2: 13, team2: "Hofstra", site: "Tampa, FL", date: "Mar 20" },
    { seed1: 6, team1: "Tennessee", seed2: 11, team2: "SMU/Miami (OH)", site: "Philadelphia, PA", date: "Mar 20" },
    { seed1: 3, team1: "Virginia", seed2: 14, team2: "Wright St.", site: "Philadelphia, PA", date: "Mar 20" },
    { seed1: 7, team1: "Kentucky", seed2: 10, team2: "Santa Clara", site: "St. Louis, MO", date: "Mar 20" },
    { seed1: 2, team1: "Iowa St.", seed2: 15, team2: "Tennessee St.", site: "St. Louis, MO", date: "Mar 20" }
  ]
};

// server/routes-mm-special.ts
var TEAM_ALIASES = {
  "liu": "long island",
  "unc": "north carolina",
  "uconn": "connecticut",
  "nc state": "nc state",
  "fau": "florida atlantic",
  "vcu": "vcu",
  "ucf": "ucf",
  "usc": "usc",
  "utsa": "utsa",
  "utep": "utep",
  "smu": "smu",
  "tcu": "tcu"
};
var BRACKET_SEED_MAP = /* @__PURE__ */ new Map();
(function buildSeedMap() {
  const regions = ["east", "west", "south", "midwest"];
  for (const region of regions) {
    const games = FULL_BRACKET[region] ?? [];
    for (const g of games) {
      if (g.team1) BRACKET_SEED_MAP.set(g.team1.toLowerCase().trim(), g.seed1);
      if (g.team2) BRACKET_SEED_MAP.set(g.team2.toLowerCase().trim(), g.seed2);
    }
  }
  for (const g of FULL_BRACKET.firstFour ?? []) {
    if (g.teamA) BRACKET_SEED_MAP.set(g.teamA.toLowerCase().trim(), g.slot);
    if (g.teamB) BRACKET_SEED_MAP.set(g.teamB.toLowerCase().trim(), g.slot);
  }
})();
function lookupSeed(apiTeamName) {
  const norm = apiTeamName.toLowerCase().trim();
  if (BRACKET_SEED_MAP.has(norm)) return BRACKET_SEED_MAP.get(norm);
  for (const [alias, bracketFrag] of Object.entries(TEAM_ALIASES)) {
    if (norm.includes(alias)) {
      for (const [bName, seed] of BRACKET_SEED_MAP) {
        if (bName.includes(bracketFrag)) return seed;
      }
    }
  }
  for (const [bName, seed] of BRACKET_SEED_MAP) {
    if (norm.includes(bName) || bName.includes(norm)) return seed;
  }
  const firstWord = norm.split(" ")[0];
  if (firstWord.length > 3) {
    for (const [bName, seed] of BRACKET_SEED_MAP) {
      if (bName.startsWith(firstWord)) return seed;
    }
  }
  return 0;
}
var ROUND_DATE_RANGES = {
  "first-four": { start: "2026-03-17", end: "2026-03-19" },
  "round-64": { start: "2026-03-19", end: "2026-03-21" },
  "round-32": { start: "2026-03-21", end: "2026-03-23" },
  "sweet-16": { start: "2026-03-26", end: "2026-03-28" },
  "elite-8": { start: "2026-03-28", end: "2026-03-30" },
  "final-four": { start: "2026-04-04", end: "2026-04-05" },
  "championship": { start: "2026-04-06", end: "2026-04-07" }
};
var CANDIDATE_COUNTS = {
  "round-64": { upset: 5, blowout: 5, high_scorer: 5 },
  "round-32": { upset: 5, blowout: 4, high_scorer: 4 },
  "sweet-16": { upset: 4, blowout: 4, high_scorer: 4 },
  "elite-8": { upset: 3, blowout: 4, high_scorer: 4 },
  "final-four": { upset: 2, blowout: 2, high_scorer: 2 },
  "championship": { upset: 0, blowout: 0, high_scorer: 0 }
};
var UPSET_PROB = {
  "9v8": 0.49,
  "8v9": 0.49,
  "10v7": 0.4,
  "7v10": 0.4,
  "11v6": 0.37,
  "6v11": 0.37,
  "12v5": 0.35,
  "5v12": 0.35,
  "13v4": 0.21,
  "4v13": 0.21,
  "14v3": 0.15,
  "3v14": 0.15,
  "15v2": 0.06,
  "2v15": 0.06,
  "16v1": 0.02,
  "1v16": 0.02
};
function getUpsetProb(seedFavorite, seedUnderdog) {
  const key = `${seedUnderdog}v${seedFavorite}`;
  return UPSET_PROB[key] ?? Math.max(0.02, 0.5 - (seedUnderdog - seedFavorite) * 0.03);
}
var matchupCache = /* @__PURE__ */ new Map();
var CACHE_TTL_MS = 30 * 60 * 1e3;
function getCached(key) {
  const entry = matchupCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    matchupCache.delete(key);
    return null;
  }
  return entry.data;
}
function setCache(key, data) {
  matchupCache.set(key, { data, fetchedAt: Date.now() });
}
var REGIONS = ["east", "south", "west", "midwest"];
function buildSeedBasedMatchups(roundId) {
  if (roundId !== "round-64") {
    return { upset: [], blowout: [], highScorer: [] };
  }
  const all = [];
  for (const region of REGIONS) {
    const games = FULL_BRACKET[region];
    for (const g of games) {
      if (g.team1.includes("/") || g.team2.includes("/")) continue;
      const matchupId = `${region}-${g.seed1}v${g.seed2}`;
      const seedDiff = g.seed2 - g.seed1;
      const upsetProb = getUpsetProb(g.seed1, g.seed2);
      all.push({
        matchupId,
        teamA: g.team1,
        teamB: g.team2,
        seedA: g.seed1,
        seedB: g.seed2,
        region,
        rank: 0,
        favoriteTeam: g.team1,
        favoriteSeed: g.seed1,
        underdogTeam: g.team2,
        underdogSeed: g.seed2,
        upsetProbability: upsetProb,
        spread: seedDiff * 1.8,
        // rough approximation: ~1.8 pts per seed
        overUnder: 140 - seedDiff,
        // lower seed diff → closer game → higher combined score
        gameDate: g.date,
        site: g.site,
        oddsSource: "seed-based"
      });
    }
  }
  const upsetSorted = [...all].sort((a, b) => (b.upsetProbability ?? 0) - (a.upsetProbability ?? 0));
  const blowoutSorted = [...all].sort((a, b) => b.seedB - b.seedA - (a.seedB - a.seedA));
  const highScorerSorted = [...all].sort((a, b) => a.seedB - a.seedA - (b.seedB - b.seedA));
  const counts = CANDIDATE_COUNTS[roundId] ?? { upset: 5, blowout: 5, high_scorer: 5 };
  return {
    upset: upsetSorted.slice(0, counts.upset).map((m, i) => ({ ...m, rank: i + 1 })),
    blowout: blowoutSorted.slice(0, counts.blowout).map((m, i) => ({ ...m, rank: i + 1 })),
    highScorer: highScorerSorted.slice(0, counts.high_scorer).map((m, i) => ({ ...m, rank: i + 1 }))
  };
}
async function buildOddsBasedMatchups(roundId) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return null;
  const dateRange = ROUND_DATE_RANGES[roundId];
  if (!dateRange) return null;
  try {
    const url = `https://api.the-odds-api.com/v4/sports/basketball_ncaab/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=${dateRange.start}T00:00:00Z&commenceTimeTo=${dateRange.end}T23:59:59Z`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[odds-api] HTTP ${res.status}:`, await res.text());
      return null;
    }
    const games = await res.json();
    if (!games.length) return null;
    const matchups = games.map((game) => {
      let spread;
      let overUnder;
      let homeMoneyline;
      let awayMoneyline;
      for (const bm of game.bookmakers ?? []) {
        for (const market of bm.markets ?? []) {
          if (market.key === "spreads" && spread === void 0) {
            const home = market.outcomes.find((o) => o.name === game.home_team);
            spread = home?.point !== void 0 ? Math.abs(home.point) : void 0;
          }
          if (market.key === "totals" && overUnder === void 0) {
            overUnder = market.outcomes[0]?.point;
          }
          if (market.key === "h2h") {
            if (homeMoneyline === void 0) {
              homeMoneyline = market.outcomes.find((o) => o.name === game.home_team)?.price;
            }
            if (awayMoneyline === void 0) {
              awayMoneyline = market.outcomes.find((o) => o.name === game.away_team)?.price;
            }
          }
        }
        if (spread !== void 0 && overUnder !== void 0 && homeMoneyline !== void 0) break;
      }
      const homeIsUnderdog = homeMoneyline !== void 0 && awayMoneyline !== void 0 ? homeMoneyline > awayMoneyline : false;
      const underdogMoneyline = homeIsUnderdog ? homeMoneyline : awayMoneyline;
      const favoriteTeam = homeIsUnderdog ? game.away_team : game.home_team;
      const underdogTeam = homeIsUnderdog ? game.home_team : game.away_team;
      const matchupId = `odds-${game.id}`;
      const commenceDate = new Date(game.commence_time);
      const gameDate = commenceDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return {
        matchupId,
        teamA: game.home_team,
        teamB: game.away_team,
        seedA: lookupSeed(game.home_team),
        seedB: lookupSeed(game.away_team),
        region: "\u2014",
        rank: 0,
        favoriteTeam,
        underdogTeam,
        underdogMoneyline,
        spread,
        overUnder,
        gameDate,
        oddsSource: "live"
      };
    });
    const counts = CANDIDATE_COUNTS[roundId] ?? { upset: 5, blowout: 5, high_scorer: 5 };
    const upsetSorted = [...matchups].filter((m) => m.underdogMoneyline !== void 0 && m.underdogMoneyline > 0).sort((a, b) => (b.underdogMoneyline ?? 0) - (a.underdogMoneyline ?? 0));
    const blowoutSorted = [...matchups].filter((m) => m.spread !== void 0).sort((a, b) => (b.spread ?? 0) - (a.spread ?? 0));
    const highScorerSorted = [...matchups].filter((m) => m.overUnder !== void 0).sort((a, b) => (b.overUnder ?? 0) - (a.overUnder ?? 0));
    return {
      upset: upsetSorted.slice(0, counts.upset).map((m, i) => ({ ...m, rank: i + 1 })),
      blowout: blowoutSorted.slice(0, counts.blowout).map((m, i) => ({ ...m, rank: i + 1 })),
      highScorer: highScorerSorted.slice(0, counts.high_scorer).map((m, i) => ({ ...m, rank: i + 1 }))
    };
  } catch (e) {
    console.error("[odds-api] Fetch failed:", e);
    return null;
  }
}
async function persistRankedMatchups(supabase, roundId, upset, blowout, highScorer) {
  const rows = [
    ...upset.map((m) => ({
      round_id: roundId,
      pick_type: "upset",
      matchup_id: m.matchupId,
      team_a: m.teamA,
      team_b: m.teamB,
      seed_a: m.seedA,
      seed_b: m.seedB,
      rank: m.rank,
      odds_data: { spread: m.spread, overUnder: m.overUnder, underdogMoneyline: m.underdogMoneyline, source: m.oddsSource },
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    })),
    ...blowout.map((m) => ({
      round_id: roundId,
      pick_type: "blowout",
      matchup_id: m.matchupId,
      team_a: m.teamA,
      team_b: m.teamB,
      seed_a: m.seedA,
      seed_b: m.seedB,
      rank: m.rank,
      odds_data: { spread: m.spread, overUnder: m.overUnder, source: m.oddsSource },
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    })),
    ...highScorer.map((m) => ({
      round_id: roundId,
      pick_type: "high_scorer",
      matchup_id: m.matchupId,
      team_a: m.teamA,
      team_b: m.teamB,
      seed_a: m.seedA,
      seed_b: m.seedB,
      rank: m.rank,
      odds_data: { overUnder: m.overUnder, source: m.oddsSource },
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }))
  ];
  if (rows.length > 0) {
    await supabase.from("mm_round_matchups").upsert(rows, { onConflict: "round_id,pick_type,matchup_id" });
  }
}
function registerMMSpecialRoutes(app2) {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  app2.get("/api/mm/round-matchups/:roundId", async (req, res) => {
    const roundId = req.params.roundId;
    const cacheKey = `round-matchups-${roundId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    let ranked = await buildOddsBasedMatchups(roundId);
    let source = "live";
    if (!ranked) {
      ranked = buildSeedBasedMatchups(roundId);
      source = "seed-based";
    }
    console.log(`[mm-special] ${roundId} matchups: ${source}, upset=${ranked.upset.length} blowout=${ranked.blowout.length} hs=${ranked.highScorer.length}`);
    const supabase = createClient2(supabaseUrl, supabaseKey);
    persistRankedMatchups(supabase, roundId, ranked.upset, ranked.blowout, ranked.highScorer).catch((e) => console.error("[mm-special] persist failed:", e));
    const lockDates = {
      "first-four": "2026-03-17T12:00:00-05:00",
      "round-64": "2026-03-19T12:00:00-05:00",
      "round-32": "2026-03-21T12:00:00-05:00",
      "sweet-16": "2026-03-27T12:00:00-05:00",
      "elite-8": "2026-03-28T12:00:00-05:00",
      "final-four": "2026-04-04T18:00:00-05:00"
    };
    const lockDate = lockDates[roundId] ?? "2026-03-19T12:00:00-05:00";
    const isLocked = /* @__PURE__ */ new Date() >= new Date(lockDate);
    const response = {
      roundId,
      upset: ranked.upset,
      blowout: ranked.blowout,
      highScorer: ranked.highScorer,
      isLocked,
      lockedAt: lockDate,
      oddsSource: source
    };
    setCache(cacheKey, response);
    return res.json(response);
  });
}

// server/routes.ts
async function registerRoutes(app2) {
  app2.get("/api/config", (_req, res) => {
    const domains = (process.env.REPLIT_DOMAINS || "").split(",").map((d) => d.trim()).filter(Boolean);
    const primaryDomain = domains[0] || process.env.REPLIT_DEV_DOMAIN || "";
    res.json({ appUrl: primaryDomain ? `https://${primaryDomain}` : "" });
  });
  app2.post("/api/notify", async (req, res) => {
    try {
      const payload = req.body;
      if (!payload.event || !payload.swayger || !payload.recipients) {
        res.status(400).json({ ok: false, error: "Invalid payload" });
        return;
      }
      await sendNotificationEmail(payload);
      res.json({ ok: true });
    } catch (err) {
      console.error("[notify] error:", err);
      res.status(500).json({ ok: false, error: "Failed to send notification" });
    }
  });
  registerMMAdminRoutes(app2);
  registerMMSpecialRoutes(app2);
  const httpServer = createServer(app2);
  return httpServer;
}

// server/mm-scheduler.ts
init_email();
import * as fs2 from "fs";
import * as path2 from "path";
import { createClient as createClient3 } from "@supabase/supabase-js";
var STATE_FILE = path2.resolve(process.cwd(), "mm-email-state.json");
function loadState() {
  try {
    if (fs2.existsSync(STATE_FILE)) {
      return JSON.parse(fs2.readFileSync(STATE_FILE, "utf-8"));
    }
  } catch {
  }
  return { pre_lock: { mar17: false, mar18: false, mar19: false } };
}
function saveState(state) {
  try {
    fs2.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("[mm-scheduler] Failed to save state:", e);
  }
}
function getSupabase2() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient3(url, key);
}
async function sendReminderBlast(label) {
  console.log(`[mm-scheduler] Firing pre-lock reminder blast: ${label}`);
  try {
    const supabase = getSupabase2();
    const { data: allProfiles } = await supabase.from("profiles").select("id, username, display_name, notification_email");
    const { data: takes } = await supabase.from("mm_locked_takes").select("user_id").eq("is_submitted", true);
    const usersWithTakes = new Set(
      (takes ?? []).map((t) => t.user_id)
    );
    const eligible = (allProfiles ?? []).filter(
      (p) => !usersWithTakes.has(p.id) && p.notification_email
    );
    let sent = 0;
    for (const profile of eligible) {
      try {
        await sendMMReminderEmail({
          to: profile.notification_email,
          displayName: profile.display_name || `@${profile.username}`
        });
        sent++;
      } catch (e) {
        console.error("[mm-scheduler] Reminder failed for", profile.id, e);
      }
    }
    console.log(`[mm-scheduler] ${label}: sent to ${sent} user(s)`);
  } catch (e) {
    console.error(`[mm-scheduler] Blast error for ${label}:`, e);
  }
}
var WINDOWS = [
  {
    key: "mar17",
    label: "Mar 17 \u2014 2 days to go",
    targetMs: (/* @__PURE__ */ new Date("2026-03-17T09:00:00-05:00")).getTime()
  },
  {
    key: "mar18",
    label: "Mar 18 \u2014 24 hours left",
    targetMs: (/* @__PURE__ */ new Date("2026-03-18T09:00:00-05:00")).getTime()
  },
  {
    key: "mar19",
    label: "Mar 19 \u2014 final warning",
    targetMs: (/* @__PURE__ */ new Date("2026-03-19T08:00:00-05:00")).getTime()
  }
];
var FIRE_WINDOW_MS = 30 * 60 * 1e3;
async function tick() {
  const state = loadState();
  const now = Date.now();
  for (const w of WINDOWS) {
    if (state.pre_lock[w.key]) continue;
    const elapsed = now - w.targetMs;
    if (elapsed >= 0 && elapsed < FIRE_WINDOW_MS) {
      await sendReminderBlast(w.label);
      state.pre_lock[w.key] = true;
      saveState(state);
    }
  }
}
function startMMScheduler() {
  console.log("[mm-scheduler] Starting pre-lock reminder scheduler");
  tick().catch((e) => console.error("[mm-scheduler] tick error:", e));
  setInterval(() => {
    tick().catch((e) => console.error("[mm-scheduler] tick error:", e));
  }, 15 * 60 * 1e3);
}

// server/index.ts
init_email();
import * as fs3 from "fs";
import * as path3 from "path";
import { createClient as createClient4 } from "@supabase/supabase-js";
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path4 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path4.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path4} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path3.resolve(process.cwd(), "app.json");
    const appJsonContent = fs3.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path3.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs3.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs3.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path3.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs3.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      const webIndexPath = path3.resolve(process.cwd(), "dist", "index.html");
      if (fs3.existsSync(webIndexPath)) {
        return res.sendFile(webIndexPath);
      }
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path3.resolve(process.cwd(), "assets")));
  app2.use(express.static(path3.resolve(process.cwd(), "dist")));
  app2.use(express.static(path3.resolve(process.cwd(), "static-build")));
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/assets")) {
      return next();
    }
    const webIndexPath = path3.resolve(process.cwd(), "dist", "index.html");
    if (fs3.existsSync(webIndexPath)) {
      return res.sendFile(webIndexPath);
    }
    next();
  });
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
async function runSettlementExpiry() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;
  try {
    const supabase = createClient4(supabaseUrl, supabaseKey);
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3).toISOString();
    const { data: expiring } = await supabase.from("swaygers").select("id, title, category, stake_units, creator_id, opponent_id").eq("status", "settlement_proposed").lt("updated_at", cutoff);
    const { data, error } = await supabase.rpc("expire_old_proposals");
    if (error) {
      console.error("[expiry] expire_old_proposals error:", error.message);
      return;
    }
    const count = data;
    if (count > 0) {
      log(`[expiry] Expired ${count} stale settlement proposal(s)`);
    }
    if (expiring && expiring.length > 0) {
      const allUserIds = [...new Set(expiring.flatMap(
        (s) => [s.creator_id, s.opponent_id].filter(Boolean)
      ))];
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, notification_email").in("id", allUserIds);
      const profileMap = new Map(
        (profiles || []).map((p) => [p.id, p])
      );
      for (const sw of expiring) {
        const creatorProfile = profileMap.get(sw.creator_id);
        const opponentProfile = sw.opponent_id ? profileMap.get(sw.opponent_id) : null;
        const recipients = [];
        if (creatorProfile?.notification_email) {
          recipients.push({ email: creatorProfile.notification_email, name: creatorProfile.display_name || creatorProfile.username });
        }
        if (opponentProfile?.notification_email) {
          recipients.push({ email: opponentProfile.notification_email, name: opponentProfile.display_name || opponentProfile.username });
        }
        if (recipients.length === 0) continue;
        await sendNotificationEmail({
          event: "swayger_expired",
          swayger: {
            id: sw.id,
            title: sw.title,
            category: sw.category || "Other",
            stakeUnits: sw.stake_units || 1
          },
          sender: { name: "Swayger" },
          recipients
        }).catch((e) => {
          console.error(`[expiry] Failed to send email for swayger ${sw.id}:`, e);
        });
      }
    }
  } catch (err) {
    console.error("[expiry] Unexpected error:", err);
  }
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
      runSettlementExpiry();
      setInterval(runSettlementExpiry, 60 * 60 * 1e3);
      startMMScheduler();
    }
  );
})();
