var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res2) => function __init() {
  return fn && (res2 = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res2;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server/email.ts
var email_exports = {};
__export(email_exports, {
  buildCFBracketBlastPreview: () => buildCFBracketBlastPreview,
  buildGameDayBlastHtml: () => buildGameDayBlastHtml,
  buildGameDayBlastText: () => buildGameDayBlastText,
  buildGameSixBlastPreview: () => buildGameSixBlastPreview,
  buildLastChanceBlastHtml: () => buildLastChanceBlastHtml,
  buildLeaderboardBlastHtml: () => buildLeaderboardBlastHtml,
  buildMMFollowupEmailPreview: () => buildMMFollowupEmailPreview,
  buildMMR32PicksEmailHtml: () => buildMMR32PicksEmailHtml,
  buildNBALaunchBlastHtml: () => buildNBALaunchBlastHtml,
  buildNBAReminderBlastHtml: () => buildNBAReminderBlastHtml,
  buildNightlyPicksChallengePreview: () => buildNightlyPicksChallengePreview,
  buildOutreachAEmailPreview: () => buildOutreachAEmailPreview,
  buildOutreachAFollowupEmailPreview: () => buildOutreachAFollowupEmailPreview,
  buildOutreachBEmailPreview: () => buildOutreachBEmailPreview,
  buildOutreachBFollowupEmailPreview: () => buildOutreachBFollowupEmailPreview,
  buildR32WrapupEmailHtml: () => buildR32WrapupEmailHtml,
  buildRoundLaunchBlastHtml: () => buildRoundLaunchBlastHtml,
  buildRoundLaunchBlastPreview: () => buildRoundLaunchBlastPreview,
  buildRoundWinnerEmailHtml: () => buildRoundWinnerEmailHtml,
  buildS16LaunchEmailHtml: () => buildS16LaunchEmailHtml,
  buildS16TipoffAlertEmailHtml: () => buildS16TipoffAlertEmailHtml,
  buildSecondShotEmailHtml: () => buildSecondShotEmailHtml,
  buildThankyouEmailPreview: () => buildThankyouEmailPreview,
  buildWeekendPicksBlastPreview: () => buildWeekendPicksBlastPreview,
  generateUnsubscribeUrl: () => generateUnsubscribeUrl,
  sendCFBracketBlast: () => sendCFBracketBlast,
  sendGameDayBlastEmail: () => sendGameDayBlastEmail,
  sendGameSixBlast: () => sendGameSixBlast,
  sendLastChanceBlast: () => sendLastChanceBlast,
  sendLeaderboardBlast: () => sendLeaderboardBlast,
  sendLeaderboardReminderBlast: () => sendLeaderboardReminderBlast,
  sendMMFollowupEmail: () => sendMMFollowupEmail,
  sendMMR32PicksEmail: () => sendMMR32PicksEmail,
  sendMMReminderEmail: () => sendMMReminderEmail,
  sendMMScoreUpdateEmail: () => sendMMScoreUpdateEmail,
  sendNBALaunchBlast: () => sendNBALaunchBlast,
  sendNBAReminderBlast: () => sendNBAReminderBlast,
  sendNightlyPicksChallenge: () => sendNightlyPicksChallenge,
  sendNotificationEmail: () => sendNotificationEmail,
  sendOutreachAEmail: () => sendOutreachAEmail,
  sendOutreachAFollowupEmail: () => sendOutreachAFollowupEmail,
  sendOutreachBEmail: () => sendOutreachBEmail,
  sendOutreachBFollowupEmail: () => sendOutreachBFollowupEmail,
  sendPicksChallengeSettledEmail: () => sendPicksChallengeSettledEmail,
  sendQuickPickReminderEmail: () => sendQuickPickReminderEmail,
  sendR32WrapupEmail: () => sendR32WrapupEmail,
  sendRoundLaunchBlast: () => sendRoundLaunchBlast,
  sendRoundWinnerEmail: () => sendRoundWinnerEmail,
  sendS16LaunchEmail: () => sendS16LaunchEmail,
  sendS16TipoffAlertEmail: () => sendS16TipoffAlertEmail,
  sendSecondShotEmail: () => sendSecondShotEmail,
  sendThankyouEmail: () => sendThankyouEmail,
  sendWeekendPicksBlast: () => sendWeekendPicksBlast,
  verifyUnsubscribeToken: () => verifyUnsubscribeToken
});
import { Resend } from "resend";
import { createHmac } from "crypto";
function generateUnsubscribeUrl(userId) {
  const sig = createHmac("sha256", UNSUB_SECRET).update(userId).digest("hex").slice(0, 32);
  return `${APP_URL}/unsubscribe?uid=${encodeURIComponent(userId)}&sig=${sig}`;
}
function verifyUnsubscribeToken(userId, sig) {
  const expected = createHmac("sha256", UNSUB_SECRET).update(userId).digest("hex").slice(0, 32);
  return sig === expected;
}
function addUnsubFooter(html, unsubscribeUrl) {
  const footer = `<div style="text-align:center;padding:10px 20px 20px;font-size:11px;color:#3A3A4A;">You're receiving this because you have a Swayger account. &middot; <a href="${unsubscribeUrl}" style="color:#4A4A5A;text-decoration:underline;">Unsubscribe</a></div>`;
  return html.replace("</body>", `${footer}
</body>`);
}
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
  const stakePoints = `${p.swayger.stakeUnits} Swayger Points`;
  const stakeNote = p.swayger.stakeNote?.trim();
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#13131D;border-radius:10px;padding:4px 16px;margin-bottom:8px;">
    ${detailRow("Wager", p.swayger.title)}
    ${detailRow("Category", p.swayger.category)}
    ${detailRow("Points", stakePoints)}
    ${stakeNote ? detailRow("The Real Bet", stakeNote) : ""}
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
      const proposedLabel = (() => {
        if (payload.outcome === "draw") return "It's a draw";
        if (payload.outcome === "no_contest") return "No contest";
        if (payload.winnerName) return `${payload.winnerName} wins`;
        return payload.outcome ? outcomeLabel(payload.outcome) : "\u2014";
      })();
      body = details + `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">Proposed outcome: <strong style="color:#FFFFFF;">${proposedLabel}</strong></p>`;
      ctaLabel = "Review & Confirm";
      break;
    }
    case "swayger_settled": {
      const winnerLabel = (() => {
        if (payload.outcome === "draw") return "It's a draw";
        if (payload.outcome === "no_contest") return "No contest";
        if (payload.winnerName) return `\u{1F3C6} ${payload.winnerName} wins`;
        return payload.outcome ? outcomeLabel(payload.outcome) : "\u2014";
      })();
      subject = payload.winnerName ? `\u{1F3C6} ${payload.winnerName} wins "${title}"` : `\u{1F3C6} "${title}" has been settled`;
      headline = winnerLabel;
      body = details + `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">The Swayger is officially closed. Open the app to see the full breakdown.</p>`;
      ctaLabel = "See Results";
      break;
    }
    case "swayger_expired": {
      subject = `\u23F1\uFE0F "${title}" expired \u2014 stakes returned`;
      headline = `"${title}" expired without a verdict.`;
      body = details + `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">Neither party reached agreement. Your staked Swayger Points have been returned.</p>`;
      ctaLabel = "View Swayger";
      break;
    }
    case "invite_expired": {
      subject = `\u23F0 Your Swayger invite expired`;
      headline = `"${title}" \u2014 invite expired.`;
      body = details + `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">The invite link expired after 14 days without a response. Your staked Swayger Points have been returned.</p>`;
      ctaLabel = "Create a New Swayger";
      break;
    }
    case "settlement_expired": {
      subject = `\u23F1\uFE0F "${title}" settlement window closed`;
      headline = `Settlement deadline passed on "${title}".`;
      body = details + `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">The 14-day settlement window closed without mutual agreement. Staked Swayger Points have been returned to both sides.</p>`;
      ctaLabel = "View Swayger";
      break;
    }
    case "settlement_deadline_reminder": {
      subject = `\u23F3 2 days left to settle "${title}"`;
      headline = `Settlement deadline is in 2 days.`;
      body = details + `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">You have 2 days left to agree on an outcome. Once the deadline passes, Swayger Points will be returned to both sides. Open the app to propose or confirm a settlement.</p>`;
      ctaLabel = "Settle Now";
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
async function sendPicksChallengeSettledEmail(p) {
  if (!process.env.RESEND_API_KEY) return;
  const swaygerUrl = `${APP_URL}/swayger/${p.swayger.id}`;
  const denom = 4;
  const myStr = p.myScore !== null ? `${p.myScore}/${denom}` : "?";
  const theirStr = p.theirScore !== null ? `${p.theirScore}/${denom}` : "?";
  const isWinner = p.isCreator && p.outcome === "creator" || !p.isCreator && p.outcome === "opponent";
  const isDraw = p.outcome === "draw";
  const isNoContest = p.outcome === "no_contest";
  let subject;
  let headline;
  let resultLine;
  if (isNoContest) {
    subject = `\u2696\uFE0F Picks Challenge \u2014 No Contest`;
    headline = `No contest on "${p.swayger.title}"`;
    resultLine = `Not enough data to determine a winner. Your Swayger Points have been returned.`;
  } else if (isDraw) {
    subject = `\u{1F91D} Picks Challenge \u2014 It's a Draw`;
    headline = `You both went ${myStr}. Nobody takes the bag.`;
    resultLine = `You went <strong style="color:#FFFFFF;">${myStr}</strong>. @${p.theirName} went <strong style="color:#FFFFFF;">${theirStr}</strong>. Dead heat.`;
  } else if (isWinner) {
    subject = `\u{1F3C6} You won the Picks Challenge`;
    headline = `You went ${myStr}. @${p.theirName} went ${theirStr}. The bag is yours.`;
    resultLine = `Collect from @${p.theirName}.`;
  } else {
    subject = `\u{1F4CA} Picks Challenge settled \u2014 Settle up`;
    headline = `You went ${myStr}. @${p.theirName} went ${theirStr}.`;
    resultLine = `@${p.theirName} got the better of you tonight. Time to settle up.`;
  }
  const scoreBoard = `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#13131D;border-radius:10px;padding:4px 16px;margin-bottom:12px;">
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #2A2A3A;">
          <span style="font-size:13px;color:#8B95A5;">Your score</span>
          <span style="float:right;font-size:20px;font-weight:800;color:${isWinner || isDraw ? "#6C63FF" : "#FFFFFF"};">${myStr}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;">
          <span style="font-size:13px;color:#8B95A5;">@${p.theirName}</span>
          <span style="float:right;font-size:20px;font-weight:800;color:${!isWinner && !isDraw && !isNoContest ? "#6C63FF" : "#FFFFFF"};">${theirStr}</span>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:14px;color:#8B95A5;">${resultLine}</p>
  `;
  const html = buildEmailHtml(subject, headline, scoreBoard, isWinner ? "Claim the Receipt" : "See Results", swaygerUrl);
  try {
    await resend.emails.send({ from: FROM, to: p.recipientEmail, subject, html });
    console.log(`[email] picks-challenge-settled sent to ${p.recipientEmail}`);
  } catch (e) {
    console.error(`[email] picks-challenge-settled failed for ${p.recipientEmail}:`, e);
  }
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
  displayName,
  userId
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
      Picks lock at 11am CDT on March 19. Once it's locked, it's locked.
    </p>
  `;
  let html = buildEmailHtml(subject, headline, body, "Lock My Picks", `${APP_URL}/march-madness/picks`);
  if (userId) html = addUnsubFooter(html, generateUnsubscribeUrl(userId));
  await resend.emails.send({ from: FROM, to, subject, html });
}
function buildLeaderboardBlastHtml() {
  const subject = "\u{1F3C0} Race Up the Leaderboard \u2014 Win a $100 Amazon Gift Card";
  const picksUrl = `${APP_URL}/march-madness/picks`;
  const body = `
    <div style="background:linear-gradient(135deg,#1a1200 0%,#2a1f00 100%);border:1px solid rgba(245,166,35,0.35);border-radius:12px;padding:18px 20px;margin-bottom:22px;text-align:center;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#F5A623;text-transform:uppercase;">\u{1F3C6} March Madness Prize</p>
      <p style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.2;">$100 Amazon Gift Card</p>
      <p style="margin:6px 0 0;font-size:13px;color:#C8A84B;">#1 on the leaderboard at the end of the tournament wins.</p>
    </div>

    <p style="margin:0 0 6px;font-size:14px;color:#8B95A5;">Here's the thing most people don't know:</p>
    <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#FFFFFF;">You don't need an opponent. This is solo \u2014 you vs. every other Swayger user on one leaderboard.</p>

    <p style="margin:0 0 14px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#9CA3AF;text-transform:uppercase;">Two ways to earn points</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:16px;border-left:3px solid #6C63FF;">
          <p style="margin:0 0 5px;font-size:14px;font-weight:700;color:#FFFFFF;">\u26A1 Quick Picks</p>
          <p style="margin:0 0 10px;font-size:13px;color:#8B95A5;line-height:1.5;">Each round, pick which game will be the biggest <strong style="color:#FFFFFF;">upset</strong>, which will be the biggest <strong style="color:#FFFFFF;">blowout</strong>, and which will be the <strong style="color:#FFFFFF;">highest scorer</strong>. 3 points each. New picks open every round.</p>
          <p style="margin:0;font-size:12px;color:#6C63FF;font-weight:600;">\u2192 Go to March Madness \u2192 Quick Picks</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:16px;border-left:3px solid #F5A623;">
          <p style="margin:0 0 5px;font-size:14px;font-weight:700;color:#FFFFFF;">\u{1F512} Locked Takes</p>
          <p style="margin:0 0 10px;font-size:13px;color:#8B95A5;line-height:1.5;">Before tip-off, lock in your predictions on specific game outcomes. Hit a Sweet 16 call? 2 pts. Elite Eight? 3 pts. Final Four? 5 pts. Champion? 10 pts. Points stack all tournament.</p>
          <p style="margin:0;font-size:12px;color:#F5A623;font-weight:600;">\u2192 Go to March Madness \u2192 Locked Takes</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 4px;font-size:13px;color:#8B95A5;text-align:center;">Round of 64 picks are open <strong style="color:#FFFFFF;">right now</strong>.</p>
    <p style="margin:0;font-size:13px;color:#8B95A5;text-align:center;">Picks lock March 19 at 11am CDT \u2014 don't wait.</p>
  `;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
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
            <p style="margin:0 0 20px;font-size:17px;font-weight:700;color:#FFFFFF;line-height:1.4;">March Madness is heating up \u2014 and there's $100 on the line. \u{1F3C0}</p>
            ${body}
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
              <tr>
                <td align="center">
                  <a href="${picksUrl}"
                     style="display:inline-block;background:#F5A623;color:#000000;font-size:15px;font-weight:800;padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.3px;">
                    Make My Picks \u2192
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
async function sendLeaderboardBlast(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  let html = buildLeaderboardBlastHtml();
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "\u{1F3C0} Race Up the Leaderboard \u2014 Win a $100 Amazon Gift Card", html });
}
async function sendLeaderboardReminderBlast(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  let html = buildLeaderboardBlastHtml();
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "The winner walks away with something good", html });
}
function buildLastChanceBlastHtml() {
  const picksUrl = `${APP_URL}/march-madness/picks`;
  const body = `
    <p style="margin:0 0 18px;font-size:15px;color:#D1D5DB;line-height:1.6;">
      Picks close at <strong style="color:#FFFFFF;">11am CDT today.</strong> After that the leaderboard is locked and there's nothing left to do but watch.
    </p>

    <div style="background:linear-gradient(135deg,#1a1200 0%,#2a1f00 100%);border:1px solid rgba(245,166,35,0.35);border-radius:12px;padding:16px 20px;margin-bottom:22px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#F5A623;text-transform:uppercase;">The prize</p>
      <p style="margin:0;font-size:18px;font-weight:800;color:#FFFFFF;">Whoever leads the leaderboard when the tournament ends walks away with something good.</p>
    </div>

    <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#9CA3AF;text-transform:uppercase;">Still have time to make</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #6C63FF;">
          <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#FFFFFF;">\u26A1 Quick Picks</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.5;">Pick the biggest <strong style="color:#FFFFFF;">upset</strong>, <strong style="color:#FFFFFF;">blowout</strong>, and <strong style="color:#FFFFFF;">high-scoring</strong> game of the round. 3 points each \u2014 these reset every round, so you can climb fast.</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #F5A623;">
          <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#FFFFFF;">\u{1F512} Locked Takes</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.5;">Lock a prediction on a game result before it tips. Sweet 16 = 2pts, Elite Eight = 3pts, Final Four = 5pts, Champion = 10pts. No opponent needed.</p>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#6B7280;text-align:center;">After 11am the door closes. That's it.</p>
  `;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Picks close at 11am</title>
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
            <p style="margin:0 0 20px;font-size:17px;font-weight:700;color:#FFFFFF;line-height:1.4;">First place on the leaderboard walks away with something good. Picks close at 11am.</p>
            ${body}
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
              <tr>
                <td align="center">
                  <a href="${picksUrl}"
                     style="display:inline-block;background:#F5A623;color:#000000;font-size:15px;font-weight:800;padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.3px;">
                    Lock My Picks \u2192
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
async function sendLastChanceBlast(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  let html = buildLastChanceBlastHtml();
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "First place on the leaderboard walks away with something good. Picks close at 11am.", html });
}
function buildSecondShotEmailHtml(displayName = "there") {
  const picksUrl = `${APP_URL}/march-madness/picks`;
  const subject = "You missed the opening round deadline \u2014 but you still have a shot";
  const headline = "Second chance to lock your picks.";
  const body = `
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      Hey ${displayName},
    </p>
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:15px;line-height:1.6">
      The Round of 64 deadline passed and you didn't get your locked picks in. We're giving you a second chance \u2014 but there's a catch.
    </p>

    <div style="background:linear-gradient(135deg,#12001a 0%,#1e0030 100%);border:1px solid rgba(108,99,255,0.4);border-radius:12px;padding:18px 20px;margin-bottom:22px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#A78BFA;text-transform:uppercase;">\u{1F512} Second Chance Picks \u2014 Available Now</p>
      <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#FFFFFF;line-height:1.3;">You can still lock in your Sweet 16, Elite 8, Final Four, and Champion picks.</p>
      <p style="margin:0;font-size:13px;color:#C4B5FD;line-height:1.5">Late entries earn <strong style="color:#FFFFFF;">half the normal points</strong>. You're not out of the running \u2014 but you'll need to be right more often to climb the board.</p>
    </div>

    <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#9CA3AF;text-transform:uppercase;">What you can still earn</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#13131D;border-radius:10px;padding:4px 16px;margin-bottom:22px;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
          <span style="font-size:13px;color:#8B95A5;">Sweet 16 picks</span>
          <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">1 pt each <span style="color:#6B7280;font-weight:400;">(normally 2)</span></span>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
          <span style="font-size:13px;color:#8B95A5;">Elite 8 picks</span>
          <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">1.5 pts each <span style="color:#6B7280;font-weight:400;">(normally 3)</span></span>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
          <span style="font-size:13px;color:#8B95A5;">Final Four picks</span>
          <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">2.5 pts each <span style="color:#6B7280;font-weight:400;">(normally 5)</span></span>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;">
          <span style="font-size:13px;color:#8B95A5;">Champion pick</span>
          <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">5 pts <span style="color:#6B7280;font-weight:400;">(normally 10)</span></span>
        </td>
      </tr>
    </table>

    <div style="background:linear-gradient(135deg,#1a1200 0%,#2a1f00 100%);border:1px solid rgba(245,166,35,0.35);border-radius:12px;padding:14px 18px;margin-bottom:6px;text-align:center;">
      <p style="margin:0 0 2px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#F5A623;text-transform:uppercase;">\u{1F3C6} The Prize</p>
      <p style="margin:0;font-size:18px;font-weight:800;color:#FFFFFF;">#1 on the leaderboard wins a $100 Amazon Gift Card</p>
    </div>
  `;
  return buildEmailHtml(subject, headline, body, "Lock My Picks \u2192", picksUrl);
}
async function sendSecondShotEmail(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  let html = buildSecondShotEmailHtml(opts.displayName);
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "You missed the opening round deadline \u2014 but you still have a shot", html });
}
function buildMMR32PicksEmailHtml(displayName = "there") {
  const picksUrl = `${APP_URL}/march-madness/picks`;
  const subject = "\u{1F3C0} Round of 32 Quick Picks are OPEN \u2014 Games start at 11am";
  const headline = "Round of 32 is here. Make your picks before tip-off.";
  const body = `
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      Hey ${displayName},
    </p>
    <p style="margin:0 0 18px;color:#E2E8F0;font-size:15px;line-height:1.6">
      Round of 32 Quick Picks are <strong style="color:#FFFFFF;">open right now</strong>. Three picks. Three chances to earn points before the first tip at <strong style="color:#FFFFFF;">11:10am CDT</strong> \u2014 picks lock at noon.
    </p>

    <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#9CA3AF;text-transform:uppercase;">Your 3 picks this round</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #F59E0B;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">\u{1F6A8} Upset Pick \u2014 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Pick which game the underdog pulls off the shocker. High Point (12) vs Arkansas. VCU (11) vs Illinois. Nebraska vs Vanderbilt is basically a coin flip.</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #3B82F6;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">\u{1F4A5} Blowout Pick \u2014 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Pick which game ends in a blowout. Duke is -11.5. Michigan is -12.5. Houston hasn't lost a game cleanly in weeks.</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #10B981;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">\u{1F525} High Scorer Pick \u2014 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Pick the highest-scoring game. Arkansas vs High Point has an O/U of <strong style="color:#FFFFFF;">169.5</strong> \u2014 the highest on the entire weekend slate.</p>
        </td>
      </tr>
    </table>

    <div style="background:linear-gradient(135deg,#0d1a2a 0%,#0a1020 100%);border:1px solid rgba(108,99,255,0.35);border-radius:12px;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#A78BFA;text-transform:uppercase;">Today's marquee games</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #1e2030;">
            <span style="font-size:13px;color:#D1D5DB;">Michigan (1) vs Saint Louis (9)</span>
            <span style="float:right;font-size:12px;color:#6C63FF;font-weight:600;">11:10am CDT</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #1e2030;">
            <span style="font-size:13px;color:#D1D5DB;">Duke (1) vs TCU (9)</span>
            <span style="float:right;font-size:12px;color:#6C63FF;font-weight:600;">4:15pm CDT</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #1e2030;">
            <span style="font-size:13px;color:#D1D5DB;">Houston (2) vs Texas A&amp;M (10)</span>
            <span style="float:right;font-size:12px;color:#6C63FF;font-weight:600;">5:10pm CDT</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #1e2030;">
            <span style="font-size:13px;color:#D1D5DB;">Nebraska (4) vs Vanderbilt (5)</span>
            <span style="float:right;font-size:12px;color:#6C63FF;font-weight:600;">7:45pm CDT</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;">
            <span style="font-size:13px;color:#D1D5DB;">Arkansas (4) vs High Point (12)</span>
            <span style="float:right;font-size:12px;color:#6C63FF;font-weight:600;">8:45pm CDT</span>
          </td>
        </tr>
      </table>
    </div>

    <p style="margin:0;font-size:13px;color:#6B7280;text-align:center;">Quick picks lock at noon CDT. Scores post after each game wraps up tonight.</p>
  `;
  return buildEmailHtml(subject, headline, body, "Make My Picks \u2192", picksUrl);
}
async function sendMMR32PicksEmail(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  let html = buildMMR32PicksEmailHtml(opts.displayName);
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "\u{1F3C0} Round of 32 Quick Picks are OPEN \u2014 Games start at 11am", html });
}
function buildR32WrapupEmailHtml({
  displayName = "there",
  totalPoints,
  upsetPts,
  correctUpsets,
  blowoutPts,
  correctBlowouts,
  highScorerPts,
  correctHighScorers,
  rank,
  totalPlayers
}) {
  const subject = "\u{1F3C0} R32 wrapped \u2014 Sweet 16 starts Thursday. Here's your score.";
  const headline = "Round of 32 is done. Here's where you stand.";
  const rankLabel = rank === 1 ? "\u{1F947} You're in first place!" : rank <= 3 ? `\u{1F525} You're #${rank} out of ${totalPlayers}` : `#${rank} out of ${totalPlayers} players`;
  const body = `
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      Hey ${displayName},
    </p>
    <p style="margin:0 0 4px;font-size:13px;color:#8B95A5;letter-spacing:0.5px;text-transform:uppercase;">Leaderboard</p>
    <p style="margin:0 0 20px;font-size:28px;font-weight:800;color:#F5A623;">${rankLabel}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#13131D;border-radius:10px;padding:4px 16px;margin-bottom:24px;">
      <tr><td style="padding:12px 0 4px;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:15px;color:#8B95A5;">Total Points</span>
        <span style="float:right;font-size:22px;font-weight:800;color:#F5A623;">${totalPoints}</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">\u{1F6A8} Upset Picks</span>
        <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${upsetPts} pts (${correctUpsets} correct)</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">\u{1F4A5} Blowout Picks</span>
        <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${blowoutPts} pts (${correctBlowouts} correct)</span>
      </td></tr>
      <tr><td style="padding:10px 0;">
        <span style="font-size:13px;color:#8B95A5;">\u{1F525} High Scorer Picks</span>
        <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${highScorerPts} pts (${correctHighScorers} correct)</span>
      </td></tr>
    </table>

    <div style="background:linear-gradient(135deg,#0d1a0f 0%,#091409 100%);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:18px 20px;margin-bottom:22px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#10B981;text-transform:uppercase;">\u{1F5D3} Sweet 16 \u2014 Thursday March 26</p>
      <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#FFFFFF;line-height:1.4;">32 teams became 16. Now it gets real.</p>
      <p style="margin:0 0 12px;font-size:14px;color:#D1FAE5;line-height:1.6;">
        Before the chaos hits, lock in a swayger with someone who thinks they know who's advancing. Pick a matchup. Set stakes. Settle after the buzzer.
      </p>
      <p style="margin:0;font-size:13px;color:#6EE7B7;line-height:1.5;">
        The longer you wait, the more everyone starts second-guessing their bracket. Create now while everyone still believes in their picks.
      </p>
    </div>

    <p style="margin:0;font-size:12px;color:#6B7280;text-align:center;">Sweet 16 quick picks open soon \u2014 keep an eye out.</p>
  `;
  return buildEmailHtml(subject, headline, body, "Create a Sweet 16 Swayger \u2192", `${APP_URL}/create`);
}
async function sendR32WrapupEmail(opts) {
  if (!process.env.RESEND_API_KEY) return;
  let html = buildR32WrapupEmailHtml(opts);
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "\u{1F3C0} R32 wrapped \u2014 Sweet 16 starts Thursday. Here's your score.", html });
}
async function sendQuickPickReminderEmail(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  const picksUrl = `${APP_URL}/march-madness/picks`;
  const subject = opts.isLastChance ? `\u23F0 Last chance \u2014 ${opts.roundLabel} Quick Picks close ${opts.lockDateLabel}` : `\u{1F3C0} ${opts.roundLabel} Quick Picks are open`;
  const headline = opts.isLastChance ? `${opts.roundLabel} picks close ${opts.lockDateLabel}.` : `New round, new picks. ${opts.roundLabel} is here.`;
  const body = `
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      Hey ${opts.displayName},
    </p>
    <p style="margin:0 0 18px;color:#E2E8F0;font-size:15px;line-height:1.6">
      ${opts.isLastChance ? `Quick Picks for the <strong style="color:#FFFFFF;">${opts.roundLabel}</strong> close at <strong style="color:#FFFFFF;">${opts.lockDateLabel}</strong>. If you haven't made yours yet, now's the time.` : `<strong style="color:#FFFFFF;">${opts.roundLabel}</strong> Quick Picks are now open. Three chances to score points before this round tips off.`}
    </p>

    <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#9CA3AF;text-transform:uppercase;">Make your ${opts.roundLabel} picks</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #F59E0B;margin-bottom:8px;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">\u{1F6A8} Upset Pick</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Which underdog pulls off the shocker this round? Pick the game, earn 3 points if you're right.</p>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #3B82F6;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">\u{1F4A5} Blowout Pick</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Which game ends in a blowout? Pick the matchup with the biggest expected margin. 3 points if you nail it.</p>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #10B981;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">\u{1F525} High Scorer Pick</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Which game goes for the most total points? Pick the highest-scoring matchup. 3 points if you're right.</p>
        </td>
      </tr>
    </table>

    ${opts.isLastChance ? `<p style="margin:0;font-size:13px;color:#6B7280;text-align:center;">Picks close at ${opts.lockDateLabel}. After that the round is locked.</p>` : `<p style="margin:0;font-size:13px;color:#6B7280;text-align:center;">Picks close at ${opts.lockDateLabel}. Scores update after games complete.</p>`}
  `;
  let html = buildEmailHtml(subject, headline, body, "Make My Picks \u2192", picksUrl);
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject, html });
}
function buildS16LaunchEmailHtml(displayName = "there", hasLockedTakes = true) {
  const picksUrl = `${APP_URL}/march-madness/picks`;
  const hubUrl = `${APP_URL}/march-madness?utm_source=email&utm_campaign=s16-launch`;
  const subject = "\u{1F3C0} Sweet 16 picks are OPEN \u2014 lock yours before Thursday";
  const headline = "The Sweet 16 is set. Make your picks.";
  const quickPicksSection = `
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      Hey ${displayName},
    </p>
    <p style="margin:0 0 18px;color:#E2E8F0;font-size:15px;line-height:1.6">
      Sweet 16 Quick Picks are <strong style="color:#FFFFFF;">open right now</strong>. Three picks, three chances to earn points \u2014 picks lock <strong style="color:#FFFFFF;">Thursday March 26 at 6pm CDT</strong> when the games tip off.
    </p>

    <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#9CA3AF;text-transform:uppercase;">Your 3 picks this round</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #F59E0B;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">\u{1F6A8} Upset Pick \u2014 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Texas survived the First Four as an #11 seed. Can they stun #2 Purdue? Iowa (#9) beat #1 Florida \u2014 do they keep rolling against Nebraska? Pick the upset.</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #3B82F6;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">\u{1F4A5} Blowout Pick \u2014 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Michigan is -10.5 over Alabama. Duke is at home against St. John's. Arkansas vs Arizona in a rematch neither team forgot. Pick the game that ends as a rout.</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #10B981;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">\u{1F525} High Scorer Pick \u2014 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Houston vs Illinois was the highest-scoring R32 game on the board. Iowa vs Nebraska O/U is 148.5. UConn vs Michigan St. could go either way. Pick the game that puts up the most points combined.</p>
        </td>
      </tr>
    </table>

    <div style="background:linear-gradient(135deg,#0d1a2a 0%,#0a1020 100%);border:1px solid rgba(108,99,255,0.35);border-radius:12px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#A78BFA;text-transform:uppercase;">Sweet 16 matchups</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:6px 0;border-bottom:1px solid #1e2030;"><span style="font-size:13px;color:#D1D5DB;">Texas (11) vs Purdue (2)</span></td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px solid #1e2030;"><span style="font-size:13px;color:#D1D5DB;">Iowa (9) vs Nebraska (4)</span></td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px solid #1e2030;"><span style="font-size:13px;color:#D1D5DB;">St. John's (5) vs Duke (1)</span></td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px solid #1e2030;"><span style="font-size:13px;color:#D1D5DB;">Tennessee (6) vs Iowa St. (2)</span></td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px solid #1e2030;"><span style="font-size:13px;color:#D1D5DB;">Alabama (4) vs Michigan (1)</span></td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px solid #1e2030;"><span style="font-size:13px;color:#D1D5DB;">Arkansas (4) vs Arizona (1)</span></td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px solid #1e2030;"><span style="font-size:13px;color:#D1D5DB;">Michigan St. (3) vs UConn (2)</span></td></tr>
        <tr><td style="padding:6px 0;"><span style="font-size:13px;color:#D1D5DB;">Illinois (3) vs Houston (2)</span></td></tr>
      </table>
    </div>
  `;
  const secondChanceSection = !hasLockedTakes ? `
    <div style="background:linear-gradient(135deg,#12001a 0%,#1e0030 100%);border:1px solid rgba(108,99,255,0.4);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#A78BFA;text-transform:uppercase;">\u{1F512} Second Chance Picks \u2014 Still Open</p>
      <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#FFFFFF;line-height:1.3;">You missed the bracket deadline \u2014 but you can still lock Elite 8, Final Four, and Champion picks.</p>
      <p style="margin:0 0 14px;font-size:13px;color:#C4B5FD;line-height:1.5">Late entries earn <strong style="color:#FFFFFF;">half the normal points</strong>. Sweet 16 teams are already set so that take is closed \u2014 but the rest are still up for grabs.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.25);border-radius:8px;padding:4px 14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid rgba(167,139,250,0.15);"><span style="font-size:13px;color:#C4B5FD;">Elite 8 picks</span><span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">1.5 pts each</span></td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid rgba(167,139,250,0.15);"><span style="font-size:13px;color:#C4B5FD;">Final Four picks</span><span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">2.5 pts each</span></td></tr>
        <tr><td style="padding:8px 0;"><span style="font-size:13px;color:#C4B5FD;">Champion pick</span><span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">5 pts</span></td></tr>
      </table>
      <p style="margin:12px 0 0;font-size:12px;color:#7C3AED;text-align:center;">All second-chance picks lock Thursday March 26 at 6pm CDT.</p>
    </div>
  ` : "";
  const referralSection = `
    <div style="background:linear-gradient(135deg,#1a0e00 0%,#2a1800 100%);border:1px solid rgba(255,140,0,0.35);border-radius:12px;padding:18px 20px;margin-bottom:16px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#FF8C00;text-transform:uppercase;">\u{1F525} 2X Points \u2014 Referral Bonus</p>
      <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#FFFFFF;line-height:1.3;">Share a featured matchup. If your friend joins and accepts a Swayger, your Sweet 16 picks score <strong style="color:#FF8C00;">double</strong>.</p>
      <p style="margin:0 0 16px;font-size:13px;color:#FCD34D;line-height:1.5">Open the app \u2192 tap any Sweet 16 matchup card \u2192 hit the share button. Your referral link is automatically attached.</p>
      <div style="text-align:center;">
        <a href="${hubUrl}" style="display:inline-block;background:#FF8C00;color:#000000;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;letter-spacing:0.3px;">Go Share a Matchup \u2192</a>
      </div>
    </div>
    <p style="margin:0 0 24px;font-size:12px;color:#6B7280;text-align:center;">One referral = 2X on all your Sweet 16 special picks this round.</p>
  `;
  const body = quickPicksSection + secondChanceSection + referralSection;
  return buildEmailHtml(subject, headline, body, "Make My Picks \u2192", picksUrl);
}
function buildS16TipoffAlertEmailHtml(displayName = "there") {
  const picksUrl = `${APP_URL}/march-madness/picks`;
  const subject = "\u23F0 Sweet 16 tips in 1 hour \u2014 picks close NOW";
  const headline = "Last call. Picks lock at 6pm CDT.";
  const body = `
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      Hey ${displayName},
    </p>
    <p style="margin:0 0 20px;color:#E2E8F0;font-size:16px;line-height:1.6">
      The Sweet 16 tips off <strong style="color:#FFFFFF;">tonight</strong>. Picks lock at <strong style="color:#FF4444;">6pm CDT \u2014 in about an hour.</strong> If you haven't made yours yet, now's the moment.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #F59E0B;">
          <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#FFFFFF;">\u{1F6A8} Upset Pick \u2014 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;">Pick a lower seed to knock out a higher seed tonight.</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #3B82F6;">
          <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#FFFFFF;">\u{1F4A5} Blowout Pick \u2014 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;">Pick the game that ends as a rout \u2014 not even close.</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #10B981;">
          <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#FFFFFF;">\u{1F525} High Scorer Pick \u2014 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;">Pick the game that puts up the most combined points.</p>
        </td>
      </tr>
    </table>

    <div style="background:linear-gradient(135deg,#12001a 0%,#1e0030 100%);border:1px solid rgba(108,99,255,0.4);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#A78BFA;text-transform:uppercase;">\u{1F512} Second Chance \u2014 Still Active</p>
      <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#FFFFFF;line-height:1.3;">Missed the bracket deadline? You can still lock Elite 8, Final Four, and Championship picks.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.25);border-radius:8px;padding:4px 14px;margin-bottom:12px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid rgba(167,139,250,0.15);"><span style="font-size:13px;color:#C4B5FD;">Elite 8 picks</span><span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">1.5 pts each</span></td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid rgba(167,139,250,0.15);"><span style="font-size:13px;color:#C4B5FD;">Final Four picks</span><span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">2.5 pts each</span></td></tr>
        <tr><td style="padding:8px 0;"><span style="font-size:13px;color:#C4B5FD;">Championship pick</span><span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">5 pts</span></td></tr>
      </table>
      <p style="margin:0;font-size:12px;color:#A78BFA;text-align:center;">Half points on locked takes \u2014 still worth locking in before tip.</p>
    </div>

    <p style="margin:0 0 6px;font-size:13px;color:#6B7280;text-align:center;">Picks lock at 6pm CDT. After that the window is closed.</p>
  `;
  return buildEmailHtml(subject, headline, body, "Make My Picks Now \u2192", picksUrl);
}
async function sendS16TipoffAlertEmail(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  let html = buildS16TipoffAlertEmailHtml(opts.displayName);
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "\u23F0 Sweet 16 tips in 1 hour \u2014 picks close NOW", html });
}
async function sendS16LaunchEmail(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  let html = buildS16LaunchEmailHtml(opts.displayName, opts.hasLockedTakes);
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "\u{1F3C0} Sweet 16 picks are OPEN \u2014 lock yours before Thursday", html });
}
function buildThankyouEmailHtml(opts) {
  const { displayName, rank, totalPoints, totalPlayers, leaderboard, feedbackUrl } = opts;
  const rankLine = rank === 1 ? `You finished 1st out of ${totalPlayers} \u2014 you won it.` : rank <= 3 ? `You finished ${rank} of ${totalPlayers}.` : `You finished #${rank} out of ${totalPlayers}.`;
  const leaderboardLines = leaderboard.slice(0, 5).map((e) => {
    const num = e.rank === 1 ? "1." : e.rank === 2 ? "2." : e.rank === 3 ? "3." : `${e.rank}.`;
    const isUser = e.rank === rank;
    const name = e.displayName || e.username;
    const color = isUser ? "#1DA1F2" : "#C9D3E0";
    const weight = isUser ? "700" : "400";
    return `<tr>
      <td style="padding:7px 0;font-size:14px;color:${color};font-weight:${weight};width:24px;">${num}</td>
      <td style="padding:7px 8px;font-size:14px;color:${color};font-weight:${weight};">${name}${isUser ? " \u2190 you" : ""}</td>
      <td style="padding:7px 0;font-size:14px;color:${color};font-weight:${weight};text-align:right;">${e.totalPoints} pts</td>
    </tr>`;
  }).join("");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>How you finished in March Madness</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">

    <p style="margin:0 0 6px;font-size:13px;color:#888888;">Swayger</p>

    <p style="margin:0 0 20px;font-size:16px;color:#111111;line-height:1.6;">
      Hey ${displayName},
    </p>

    <p style="margin:0 0 16px;font-size:16px;color:#111111;line-height:1.6;">
      Michigan beat UConn 69&ndash;63. The bracket is done.
    </p>

    <p style="margin:0 0 8px;font-size:16px;color:#111111;line-height:1.6;">
      Your final score: <strong>${totalPoints} pts.</strong> ${rankLine}
    </p>

    <p style="margin:0 0 4px;font-size:13px;color:#888888;margin-top:28px;">Final standings</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #eeeeee;margin-bottom:28px;">
      ${leaderboardLines}
    </table>

    <p style="margin:0 0 16px;font-size:16px;color:#111111;line-height:1.6;">
      We're building more of this. Before we do, we want to hear from people who played \u2014 what worked, what didn't.
    </p>

    <p style="margin:0 0 28px;font-size:16px;color:#111111;line-height:1.6;">
      4 quick picks, under 60 seconds: <a href="${feedbackUrl}" style="color:#1DA1F2;text-decoration:underline;">share your take</a>
    </p>

    <p style="margin:0;font-size:16px;color:#111111;line-height:1.6;">
      \u2014 The Swayger team
    </p>

    <p style="margin:32px 0 0;font-size:11px;color:#aaaaaa;">Swayger &middot; Social wager contracts, for fun</p>
  </div>
</body>
</html>`;
}
async function sendThankyouEmail(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  const feedbackUrl = `${APP_URL}/feedback?uid=${encodeURIComponent(opts.userId ?? "")}`;
  let html = buildThankyouEmailHtml({ ...opts, feedbackUrl });
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  const subject = `${opts.displayName}, March Madness 2026 is a wrap \u2014 here's how you finished`;
  const rankLabel = opts.rank === 1 ? "You won it." : `You finished #${opts.rank} of ${opts.totalPlayers}.`;
  const text = `Hey ${opts.displayName},

Michigan beat UConn 69\u201363. The bracket is done.

Your final score: ${opts.totalPoints} pts. ${rankLabel}

We're building more of this and want to know what actually worked and what didn't \u2014 from people who played.

Share your take (4 quick picks, under 60 seconds):
${feedbackUrl}

\u2014 The Swayger team`;
  await resend.emails.send({ from: FROM, to: opts.to, subject, html, text });
}
function buildOutreachAEmailHtml(opts) {
  const { displayName, feedbackUrl } = opts;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#E2E8F0;line-height:1.6">
      Hey ${displayName} \u2014
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#8B95A5;line-height:1.6">
      You signed up for Swayger a while back. You haven't placed a swayger yet \u2014 and we genuinely want to know why.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#8B95A5;line-height:1.6">
      Was it confusing? Nothing to bet on? Nobody to play with? We're not guessing \u2014 we're asking.
    </p>
    <div style="background:#13131D;border-radius:12px;padding:16px 18px;margin-bottom:24px;border-left:3px solid #1DA1F2;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1px;color:#1DA1F2;text-transform:uppercase;">4 quick picks</p>
      <p style="margin:0;font-size:14px;color:#C9D3E0;line-height:1.5;">No signup required. Takes under 60 seconds. Your answers go directly into what we build next.</p>
    </div>
    <p style="margin:0 0 6px;font-size:13px;color:#6B7280;">What stopped you? What would bring you in? Tell us.</p>
  `;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quick question from Swayger</title>
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
            <p style="margin:0 0 20px;font-size:19px;font-weight:800;color:#FFFFFF;line-height:1.3;">We noticed you haven't placed a swayger yet.</p>
            ${body}
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
              <tr>
                <td align="center">
                  <a href="${feedbackUrl}"
                     style="display:inline-block;background:#1DA1F2;color:#FFFFFF;font-size:15px;font-weight:800;padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.3px;">
                    Share My Take \u2192
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
async function sendOutreachAEmail(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  const feedbackUrl = `${APP_URL}/outreach-feedback-a?uid=${encodeURIComponent(opts.userId ?? "")}`;
  let html = buildOutreachAEmailHtml({ displayName: opts.displayName, feedbackUrl });
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  const subject = `Quick question, ${opts.displayName} \u2014 what stopped you?`;
  const text = `Hey ${opts.displayName},

You signed up for Swayger but haven't placed a swayger yet. We genuinely want to know why.

Was it confusing? Nothing to bet on? Nobody to play with? We're not guessing \u2014 we're asking.

4 quick picks, under 60 seconds:
${feedbackUrl}

\u2014 The Swayger team`;
  await resend.emails.send({ from: FROM, to: opts.to, subject, html, text });
}
function buildOutreachAEmailPreview() {
  const feedbackUrl = `${APP_URL}/outreach-feedback-a?uid=PREVIEW_USER`;
  return buildOutreachAEmailHtml({ displayName: "Alex", feedbackUrl });
}
function buildOutreachBEmailHtml(opts) {
  const { displayName, feedbackUrl } = opts;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#E2E8F0;line-height:1.6">
      Hey ${displayName} \u2014
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#8B95A5;line-height:1.6">
      You placed a swayger. You're one of the OGs. We ran a March Madness challenge this year and missed you in it \u2014 Michigan won, for the record.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#8B95A5;line-height:1.6">
      Before we build what's next, we want to hear from people who've actually used the product. That's you.
    </p>
    <div style="background:#13131D;border-radius:12px;padding:16px 18px;margin-bottom:24px;border-left:3px solid #F5A623;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1px;color:#F5A623;text-transform:uppercase;">4 quick picks</p>
      <p style="margin:0;font-size:14px;color:#C9D3E0;line-height:1.5;">How was your experience? What would bring you back? Your answers shape the roadmap.</p>
    </div>
    <p style="margin:0 0 6px;font-size:13px;color:#6B7280;">Real talk only. Takes under 60 seconds.</p>
  `;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quick question from Swayger</title>
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
            <p style="margin:0 0 20px;font-size:19px;font-weight:800;color:#FFFFFF;line-height:1.3;">You've been with us from the start. We want to hear from you.</p>
            ${body}
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
              <tr>
                <td align="center">
                  <a href="${feedbackUrl}"
                     style="display:inline-block;background:#1DA1F2;color:#FFFFFF;font-size:15px;font-weight:800;padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.3px;">
                    Give Real Feedback \u2192
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
async function sendOutreachBEmail(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  const feedbackUrl = `${APP_URL}/outreach-feedback-b?uid=${encodeURIComponent(opts.userId ?? "")}`;
  let html = buildOutreachBEmailHtml({ displayName: opts.displayName, feedbackUrl });
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  const subject = `${opts.displayName}, real talk \u2014 what did you think of Swayger?`;
  const text = `Hey ${opts.displayName},

You placed a swayger. You're one of the OGs. We ran a March Madness challenge this year and missed you in it.

Before we build what's next, we want to hear from people who've actually used the product. That's you.

4 quick picks, under 60 seconds:
${feedbackUrl}

\u2014 The Swayger team`;
  await resend.emails.send({ from: FROM, to: opts.to, subject, html, text });
}
function buildOutreachBEmailPreview() {
  const feedbackUrl = `${APP_URL}/outreach-feedback-b?uid=PREVIEW_USER`;
  return buildOutreachBEmailHtml({ displayName: "Jordan", feedbackUrl });
}
function buildMMFollowupEmailHtml(opts) {
  const { displayName, feedbackUrl } = opts;
  const appUrl = APP_URL;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:48px 24px;">

    <p style="margin:0 0 32px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#aaa;text-transform:uppercase;">Swayger</p>

    <p style="margin:0 0 18px;font-size:16px;color:#111;line-height:1.7">Hey ${displayName} \u2014</p>

    <p style="margin:0 0 18px;font-size:16px;color:#333;line-height:1.7">
      You played March Madness with us. Before we launch the Draft challenge, we're making one final ask to the people who were actually in it.
    </p>

    <p style="margin:0 0 18px;font-size:16px;color:#333;line-height:1.7">
      What worked? What didn't? 4 questions, under 60 seconds. After this we're heads-down building \u2014 this is the last time we'll ask.
    </p>

    <p style="margin:32px 0;">
      <a href="${feedbackUrl}" style="display:inline-block;background:#111;color:#fff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Take the survey \u2192</a>
    </p>

    <p style="margin:0 0 8px;font-size:15px;color:#555;line-height:1.7">
      NFL Draft challenge dropping April 23rd. <a href="${appUrl}" style="color:#111;font-weight:600;">Jump back into Swayger</a>
    </p>

    <p style="margin:40px 0 0;font-size:15px;color:#333;line-height:1.7">\u2014 Darius<br>
    <span style="font-size:13px;color:#999;">Swayger</span></p>

  </div>
</body>
</html>`;
}
async function sendMMFollowupEmail(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  const feedbackUrl = `${APP_URL}/feedback?uid=${encodeURIComponent(opts.userId ?? "")}`;
  let html = buildMMFollowupEmailHtml({ displayName: opts.displayName, feedbackUrl });
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  const subject = `${opts.displayName}, one more ask before we launch the Draft challenge`;
  const text = `Hey ${opts.displayName},

You played March Madness with us. Before we launch the Draft challenge, we're making one final ask to the people who were actually in it.

What worked? What didn't? 4 questions, under 60 seconds. After this we're heads-down building.

Take the survey:
${feedbackUrl}

NFL Draft challenge dropping April 23rd. Jump back in: ${APP_URL}

\u2014 The Swayger team`;
  await resend.emails.send({ from: FROM, to: opts.to, subject, html, text });
}
function buildMMFollowupEmailPreview() {
  const feedbackUrl = `${APP_URL}/feedback?uid=PREVIEW_USER`;
  return buildMMFollowupEmailHtml({ displayName: "Mr Roarke", feedbackUrl });
}
function buildOutreachAFollowupEmailHtml(opts) {
  const { displayName, feedbackUrl } = opts;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:48px 24px;">

    <p style="margin:0 0 32px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#aaa;text-transform:uppercase;">Swayger</p>

    <p style="margin:0 0 18px;font-size:16px;color:#111;line-height:1.7">Hey ${displayName} \u2014</p>

    <p style="margin:0 0 18px;font-size:16px;color:#333;line-height:1.7">
      We sent you an email a while back asking what stopped you from placing a swayger. Maybe it got buried. We're following up because your answer is actually the one we need most.
    </p>

    <p style="margin:0 0 18px;font-size:16px;color:#333;line-height:1.7">
      People who signed up and didn't come back have information we can't get anywhere else. Was it confusing? Nothing to bet on? No one to play with? We're genuinely asking \u2014 not guessing.
    </p>

    <p style="margin:0 0 18px;font-size:16px;color:#333;line-height:1.7">
      4 questions, under 60 seconds. This is the last time we'll ask.
    </p>

    <p style="margin:32px 0;">
      <a href="${feedbackUrl}" style="display:inline-block;background:#111;color:#fff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Share my take \u2192</a>
    </p>

    <p style="margin:40px 0 0;font-size:15px;color:#333;line-height:1.7">\u2014 Darius<br>
    <span style="font-size:13px;color:#999;">Swayger</span></p>

  </div>
</body>
</html>`;
}
async function sendOutreachAFollowupEmail(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  const feedbackUrl = `${APP_URL}/outreach-feedback-a?uid=${encodeURIComponent(opts.userId ?? "")}`;
  let html = buildOutreachAFollowupEmailHtml({ displayName: opts.displayName, feedbackUrl });
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  const subject = `${opts.displayName}, your perspective is the one we're missing`;
  const text = `Hey ${opts.displayName},

We sent you an email a while back asking what stopped you from placing a swayger. Maybe it got buried.

People who signed up and didn't come back have information we can't get anywhere else. Was it confusing? Nothing to bet on? No one to play with? We're genuinely asking \u2014 not guessing.

4 questions, under 60 seconds. This is the last time we'll ask:
${feedbackUrl}

\u2014 The Swayger team`;
  await resend.emails.send({ from: FROM, to: opts.to, subject, html, text });
}
function buildOutreachAFollowupEmailPreview() {
  const feedbackUrl = `${APP_URL}/outreach-feedback-a?uid=PREVIEW_USER`;
  return buildOutreachAFollowupEmailHtml({ displayName: "Alex", feedbackUrl });
}
function buildOutreachBFollowupEmailHtml(opts) {
  const { displayName, feedbackUrl } = opts;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:48px 24px;">

    <p style="margin:0 0 32px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#aaa;text-transform:uppercase;">Swayger</p>

    <p style="margin:0 0 18px;font-size:16px;color:#111;line-height:1.7">Hey ${displayName} \u2014</p>

    <p style="margin:0 0 18px;font-size:16px;color:#333;line-height:1.7">
      You placed a swayger. That means you know what the product actually feels like \u2014 you went through the whole thing. We sent you an email asking for your take and didn't hear back.
    </p>

    <p style="margin:0 0 18px;font-size:16px;color:#333;line-height:1.7">
      We're still listening. What brought you in? What pulled you away? People who've actually used the product are the only ones who can answer that.
    </p>

    <p style="margin:0 0 18px;font-size:16px;color:#333;line-height:1.7">
      4 questions, under 60 seconds. Last ask \u2014 we mean it.
    </p>

    <p style="margin:32px 0;">
      <a href="${feedbackUrl}" style="display:inline-block;background:#111;color:#fff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Give real feedback \u2192</a>
    </p>

    <p style="margin:40px 0 0;font-size:15px;color:#333;line-height:1.7">\u2014 Darius<br>
    <span style="font-size:13px;color:#999;">Swayger</span></p>

  </div>
</body>
</html>`;
}
async function sendOutreachBFollowupEmail(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  const feedbackUrl = `${APP_URL}/outreach-feedback-b?uid=${encodeURIComponent(opts.userId ?? "")}`;
  let html = buildOutreachBFollowupEmailHtml({ displayName: opts.displayName, feedbackUrl });
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  const subject = `${opts.displayName}, you were here at the start. What pulled you away?`;
  const text = `Hey ${opts.displayName},

You placed a swayger. That means you know what the product actually feels like. We sent you an email asking for your take and didn't hear back.

We're still listening. What brought you in? What pulled you away? People who've actually used the product are the only ones who can answer that.

4 questions, under 60 seconds. Last ask \u2014 we mean it:
${feedbackUrl}

\u2014 The Swayger team`;
  await resend.emails.send({ from: FROM, to: opts.to, subject, html, text });
}
function buildOutreachBFollowupEmailPreview() {
  const feedbackUrl = `${APP_URL}/outreach-feedback-b?uid=PREVIEW_USER`;
  return buildOutreachBFollowupEmailHtml({ displayName: "Jordan", feedbackUrl });
}
function buildNBALaunchBlastHtml() {
  const picksUrl = `${APP_URL}/playoffs/bracket`;
  const body = `
    <div style="background:linear-gradient(135deg,#0a1628 0%,#1a2a4a 100%);border:1px solid rgba(255,199,44,0.4);border-radius:12px;padding:18px 20px;margin-bottom:22px;text-align:center;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#FFC72C;text-transform:uppercase;">\u{1F3C0} NBA Playoffs 2026</p>
      <p style="margin:0;font-size:22px;font-weight:800;color:#FFFFFF;line-height:1.2;">Pick every series. Nail the games.</p>
      <p style="margin:8px 0 0;font-size:13px;color:#93A8C8;">Picks lock tomorrow at <strong style="color:#FFFFFF;">11am CDT.</strong></p>
    </div>

    <p style="margin:0 0 20px;font-size:15px;color:#D1D5DB;line-height:1.6;">
      The NBA Playoffs tip off tomorrow. Pick who wins each series and how many games it goes \u2014 every correct call earns points. The leaderboard resets every round, so you can keep climbing all the way through the Finals.
    </p>

    <p style="margin:0 0 14px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#9CA3AF;text-transform:uppercase;">Points per round</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#13131D;border-radius:10px;padding:4px 16px;margin-bottom:22px;">
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">First Round</span>
        <span style="float:right;font-size:13px;font-weight:700;color:#FFFFFF;">100 pts <span style="color:#FFC72C;font-size:11px;">+ 50 bonus (exact games)</span></span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">Second Round</span>
        <span style="float:right;font-size:13px;font-weight:700;color:#FFFFFF;">300 pts <span style="color:#FFC72C;font-size:11px;">+ 75 bonus</span></span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">Conference Finals</span>
        <span style="float:right;font-size:13px;font-weight:700;color:#FFFFFF;">1,000 pts <span style="color:#FFC72C;font-size:11px;">+ 150 bonus</span></span>
      </td></tr>
      <tr><td style="padding:10px 0;">
        <span style="font-size:13px;color:#8B95A5;">NBA Finals</span>
        <span style="float:right;font-size:13px;font-weight:700;color:#FFFFFF;">3,000 pts <span style="color:#FFC72C;font-size:11px;">+ 250 bonus</span></span>
      </td></tr>
    </table>

    <p style="margin:0 0 14px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#9CA3AF;text-transform:uppercase;">Prizes</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#13131D;border-radius:10px;padding:4px 16px;margin-bottom:22px;">
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">Best First Round score</span>
        <span style="float:right;font-size:14px;font-weight:700;color:#FFC72C;">$15</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">Best Second Round score</span>
        <span style="float:right;font-size:14px;font-weight:700;color:#FFC72C;">$15</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">Best Conference Finals score</span>
        <span style="float:right;font-size:14px;font-weight:700;color:#FFC72C;">$20</span>
      </td></tr>
      <tr><td style="padding:10px 0;">
        <span style="font-size:13px;color:#8B95A5;">Overall Leaderboard Champion</span>
        <span style="float:right;font-size:14px;font-weight:700;color:#FFC72C;">$50</span>
      </td></tr>
    </table>

    <p style="margin:0;font-size:13px;color:#6B7280;text-align:center;">Picks lock <strong style="color:#FFFFFF;">11am CDT tomorrow.</strong> Once locked, they're locked.</p>
  `;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NBA Playoffs 2026 \u2014 Pick your bracket</title>
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
            <p style="margin:0 0 20px;font-size:17px;font-weight:700;color:#FFFFFF;line-height:1.4;">The NBA Playoffs start tomorrow. Your picks won't make themselves. \u{1F3C0}</p>
            ${body}
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
              <tr>
                <td align="center">
                  <a href="${picksUrl}"
                     style="display:inline-block;background:#FFC72C;color:#000000;font-size:15px;font-weight:800;padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.3px;">
                    Make My Picks \u2192
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
async function sendNBALaunchBlast(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  let html = buildNBALaunchBlastHtml();
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: "\u{1F3C0} NBA Playoffs 2026 \u2014 Pick your bracket before 11am",
    html
  });
}
function buildNBAReminderBlastHtml() {
  const picksUrl = `${APP_URL}/playoffs/bracket`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Picks lock in less than an hour</title>
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

            <p style="margin:0 0 20px;font-size:17px;font-weight:700;color:#FFFFFF;line-height:1.4;">\u23F0 Picks lock in less than an hour. Don't miss it.</p>

            <div style="background:linear-gradient(135deg,#0a1628 0%,#1a2a4a 100%);border:1px solid rgba(255,199,44,0.4);border-radius:12px;padding:18px 20px;margin-bottom:22px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#FFC72C;text-transform:uppercase;">\u{1F3C0} Round 1 Lock</p>
              <p style="margin:0;font-size:22px;font-weight:800;color:#FFFFFF;line-height:1.2;">11am CDT \u2014 Today</p>
              <p style="margin:8px 0 0;font-size:13px;color:#93A8C8;">Once locked, they're locked. No exceptions.</p>
            </div>

            <p style="margin:0 0 14px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#9CA3AF;text-transform:uppercase;">Final matchups just confirmed</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#13131D;border-radius:10px;padding:4px 16px;margin-bottom:22px;">
              <tr><td style="padding:12px 0;border-bottom:1px solid #2A2A3A;">
                <span style="font-size:13px;color:#8B95A5;">East \xB7 1 vs 8</span>
                <span style="float:right;font-size:14px;font-weight:700;color:#FFFFFF;">Pistons vs Magic</span>
              </td></tr>
              <tr><td style="padding:12px 0;">
                <span style="font-size:13px;color:#8B95A5;">West \xB7 1 vs 8</span>
                <span style="float:right;font-size:14px;font-weight:700;color:#FFFFFF;">Thunder vs Suns</span>
              </td></tr>
            </table>

            <p style="margin:0 0 22px;font-size:14px;color:#D1D5DB;line-height:1.6;">
              All 8 first round matchups are now live. Head to the bracket, make your picks before tip-off, and get on the board.
            </p>

            <p style="margin:0 0 22px;font-size:13px;color:#9CA3AF;line-height:1.5;background:#13131D;border-radius:10px;padding:14px 16px;">
              Not seeing the updated matchups? <strong style="color:#FFFFFF;">Refresh your browser or reopen the app</strong> to load the latest lineup.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
              <tr>
                <td align="center">
                  <a href="${picksUrl}"
                     style="display:inline-block;background:#FFC72C;color:#000000;font-size:15px;font-weight:800;padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.3px;">
                    Lock In My Picks \u2192
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
async function sendNBAReminderBlast(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  let html = buildNBAReminderBlastHtml();
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: "\u23F0 Picks lock in less than an hour \u2014 all matchups are set",
    html
  });
}
function buildNightlyPicksChallengeHtml(opts) {
  const { hqChallengeUrl, picksUrl } = opts;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WCF Game 3 is tonight \u2014 lock in your picks before 7 PM CDT</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:48px 24px;">

    <p style="margin:0 0 32px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#aaa;text-transform:uppercase;">Swayger</p>

    <p style="margin:0 0 20px;font-size:16px;color:#111;line-height:1.7;">
      Hey.
    </p>

    <p style="margin:0 0 20px;font-size:16px;color:#333;line-height:1.7;">
      OKC vs San Antonio. Western Conference Finals Game 3. Tonight.
    </p>

    <p style="margin:0 0 20px;font-size:16px;color:#333;line-height:1.7;">
      Your picks are live right now &mdash; SGA, Wemby, Vassell, Caruso. Four props. One shot to move up the leaderboard. Picks lock at <strong>7 PM CDT</strong> so don&rsquo;t sit on this.
    </p>

    <p style="margin:0 0 24px;font-size:16px;color:#333;line-height:1.7;">
      The season&rsquo;s not over. There&rsquo;s still leaderboard spots up for grabs this weekend. Every game counts.
    </p>

    <p style="margin:0 0 32px;">
      <a href="${hqChallengeUrl}"
         style="display:inline-block;background:#111111;color:#ffffff;font-size:15px;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;">
        Lock In Your Picks &rarr;
      </a>
    </p>

    <p style="margin:0 0 20px;font-size:16px;color:#333;line-height:1.7;">
      Then send a Swayger to whoever you know that has NBA takes. Your group chat, your rival, your coworker who&rsquo;s been quiet since their team got bounced. Make them prove it.
    </p>

    <p style="margin:0 0 24px;font-size:16px;color:#333;line-height:1.7;">
      Challenge a friend to beat your score tonight. Whoever gets more right wins the Swayger.
    </p>

    <p style="margin:0 0 32px;">
      <a href="${picksUrl}"
         style="display:inline-block;background:#ffffff;color:#111111;font-size:15px;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;border:2px solid #111111;">
        Challenge a Friend
      </a>
    </p>

    <p style="margin:0 0 8px;font-size:16px;color:#333;line-height:1.7;">
      Lock it in.
    </p>
    <p style="margin:0;font-size:16px;color:#111;font-weight:600;">
      -Swayger HQ
    </p>

  </div>
</body>
</html>`;
}
async function sendNightlyPicksChallenge(opts) {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set \u2014 skipping");
    return;
  }
  const html = addUnsubFooter(
    buildNightlyPicksChallengeHtml(opts),
    opts.userId ? generateUnsubscribeUrl(opts.userId) : `${APP_URL}/unsubscribe`
  );
  const subject = `WCF Game 3 is tonight \u2014 lock in your picks before 7 PM CDT`;
  const text = `Hey.

The Swayger NBA Challenge is live and we made an NBA picks Swayger just for you. It's right here waiting. The only question is whether you're going to show up or leave HQ hanging.

Accept it, make your picks, and see who gets more right tonight.

Accept the Challenge:
${opts.hqChallengeUrl}

Then \u2014 and this is important \u2014 immediately go challenge someone you know.

Your group chat is right there. Your buddy who thinks his NBA takes are heat? He needs a Swayger in his inbox. Your coworker who's been bragging about their basketball instincts? Make them prove it.

Challenge a friend to beat your score tonight. Whoever gets more correct wins the Swayger.

Challenge a Friend:
${opts.picksUrl}

When it's all said and done, screenshot your result. Post it. Let your picks speak for themselves.

Good luck (you'll probably need it),
-Swayger HQ`;
  await resend.emails.send({ from: FROM, to: opts.to, subject, html, text });
}
function buildNightlyPicksChallengePreview() {
  return buildNightlyPicksChallengeHtml({
    to: "preview@swayger.app",
    displayName: "Darius",
    lockTime: "6:30 PM CDT",
    props: [
      { player: "Jayson Tatum", line: "O/U 23.5 pts", matchup: "Celtics vs 76ers" },
      { player: "Alperen Sengun", line: "O/U 5.5 ast", matchup: "Rockets vs Lakers" },
      { player: "Jaylen Brown", line: "O/U 37.5 PRA", matchup: "Celtics vs 76ers" },
      { player: "Victor Wembanyama", line: "O/U 11.5 reb", matchup: "Spurs vs Blazers" }
    ],
    hqChallengeUrl: "https://www.swayger.app/picks?hq=1",
    picksUrl: "https://www.swayger.app/picks"
  });
}
function buildWeekendPicksBlastHtml(opts) {
  const { displayName, picksUrl } = opts;
  const unsubLine = opts.unsubscribeUrl ? `<p style="margin:32px 0 0;font-size:11px;color:#999999;">You're receiving this because you have a Swayger account. <a href="${opts.unsubscribeUrl}" style="color:#999999;">Unsubscribe</a></p>` : "";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Let's finish the week strong</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <tr>
          <td style="padding-bottom:24px;">
            <span style="font-size:13px;font-weight:700;color:#111111;letter-spacing:1.5px;text-transform:uppercase;">SWAYGER</span>
          </td>
        </tr>

        <tr>
          <td style="font-size:15px;color:#222222;line-height:1.7;">

            <p style="margin:0 0 18px;">Hey ${displayName},</p>

            <p style="margin:0 0 18px;">Thank you for being one of Swayger's early users.</p>

            <p style="margin:0 0 18px;">We know the early days have had a few rough patches \u2014 including more emails than we wanted going out \u2014 and we appreciate you sticking with us and taking a look anyway.</p>

            <p style="margin:0 0 18px;">That early participation matters. It's helping us shape the product and make Swayger better.</p>

            <p style="margin:0 0 18px;">Let's finish the week strong.</p>

            <p style="margin:0 0 18px;">This weekend, jump into the NBA Picks Challenge \u2014 lock in your picks, challenge a friend, settle it, and post the result. That's the heart of Swayger: make your call, back it up, and keep the receipt.</p>

            <p style="margin:0 0 24px;color:#555555;font-size:14px;">Tonight's picks lock at <strong style="color:#222222;">5:45 PM CT</strong> \u2014 you've still got time.</p>

            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#111111;border-radius:8px;">
                  <a href="${picksUrl}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Make your picks \u2192</a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 18px;">We'll have another HQ challenge coming next week, so keep an eye out for that too.</p>

            <p style="margin:0 0 18px;">We're also looking for 20 highly engaged users to help beta test some new features we're building. If that sounds like you, just reply to this email and let us know.</p>

            <p style="margin:0 0 6px;">Appreciate you being here early.</p>
            <p style="margin:0;color:#555555;">\u2014 Swayger HQ</p>

            ${unsubLine}

          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
async function sendWeekendPicksBlast(opts) {
  if (!process.env.RESEND_API_KEY) return;
  const subject = "Let's finish the week strong";
  const unsubscribeUrl = generateUnsubscribeUrl(opts.userId);
  const html = buildWeekendPicksBlastHtml({
    displayName: opts.displayName,
    picksUrl: opts.picksUrl,
    unsubscribeUrl
  });
  await resend.emails.send({ from: FROM, to: opts.to, subject, html });
}
function buildWeekendPicksBlastPreview() {
  return buildWeekendPicksBlastHtml({
    displayName: "Jordan",
    picksUrl: "https://www.swayger.app/picks"
  });
}
function buildThankyouEmailPreview() {
  const sampleLeaderboard = [
    { rank: 1, username: "dgrand2", displayName: "Mr Roarke", totalPoints: 83 },
    { rank: 2, username: "leon50g", displayName: null, totalPoints: 50 },
    { rank: 3, username: "jayask78", displayName: null, totalPoints: 48 },
    { rank: 4, username: "belt_2_ass", displayName: null, totalPoints: 47 },
    { rank: 5, username: "test2", displayName: null, totalPoints: 47 }
  ];
  const feedbackUrl = `${APP_URL}/feedback?uid=PREVIEW_USER`;
  return buildThankyouEmailHtml({
    displayName: "Mr Roarke",
    rank: 1,
    totalPoints: 83,
    totalPlayers: 19,
    leaderboard: sampleLeaderboard,
    feedbackUrl
  });
}
function buildRoundWinnerEmailHtml(opts) {
  const { displayName, round, totalScore, correctCount, nightsPlayed, rank, totalPlayers, leaderboardUrl } = opts;
  const unsubLine = opts.unsubscribeUrl ? `<p style="margin:24px 0 0;font-size:11px;color:#3A3A4A;text-align:center;"><a href="${opts.unsubscribeUrl}" style="color:#4A4A5A;text-decoration:underline;">Unsubscribe</a></p>` : "";
  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>You won Round ${round}</title>
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
            <div style="text-align:center;margin-bottom:24px;">
              <div style="display:inline-block;background:linear-gradient(135deg,#2a1f00 0%,#3d2e00 100%);border:1px solid rgba(245,166,35,0.5);border-radius:12px;padding:12px 24px;">
                <span style="font-size:28px;">\u{1F3C6}</span>
                <p style="margin:6px 0 0;font-size:13px;font-weight:700;color:#F5A623;letter-spacing:1.2px;text-transform:uppercase;">Round ${round} Winner</p>
              </div>
            </div>
            <p style="margin:0 0 8px;font-size:20px;font-weight:800;color:#FFFFFF;text-align:center;">${displayName}, you took Round ${round}.</p>
            <p style="margin:0 0 24px;font-size:14px;color:#8B95A5;text-align:center;line-height:1.6;">You finished #${rank} out of ${totalPlayers} players with the highest score of the round.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#13131D;border-radius:10px;padding:4px 16px;margin-bottom:20px;">
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #2A2A3A;">
                  <span style="font-size:13px;color:#8B95A5;">Round ${round} Score</span>
                  <span style="float:right;font-size:20px;font-weight:800;color:#F5A623;">${totalScore.toLocaleString()} pts</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #2A2A3A;">
                  <span style="font-size:13px;color:#8B95A5;">Props Correct</span>
                  <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${correctCount} correct</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;">
                  <span style="font-size:13px;color:#8B95A5;">Nights Played</span>
                  <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${nightsPlayed} ${nightsPlayed === 1 ? "night" : "nights"}</span>
                </td>
              </tr>
            </table>
            <div style="background:linear-gradient(135deg,#1a1200 0%,#2a1f00 100%);border:1px solid rgba(245,166,35,0.35);border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:center;">
              <p style="margin:0 0 4px;font-size:24px;font-weight:800;color:#F5A623;">$15 prize</p>
              <p style="margin:0;font-size:13px;color:#C8A84B;">We'll be in touch to send this your way.</p>
            </div>
            <p style="margin:0 0 24px;font-size:14px;color:#8B95A5;text-align:center;line-height:1.6;">Round 2 is live. Keep the momentum going \u2014 <strong style="color:#FFFFFF;">$85 is still up for grabs</strong> across the remaining rounds.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center">
                  <a href="${leaderboardUrl}" style="display:inline-block;background:#F5A623;color:#000000;font-size:15px;font-weight:800;padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.3px;">See Round 2 Leaderboard \u2192</a>
                </td>
              </tr>
            </table>
            ${unsubLine}
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
  return html;
}
async function sendRoundWinnerEmail(opts) {
  if (!process.env.RESEND_API_KEY) return;
  const leaderboardUrl = `${APP_URL}/picks`;
  const html = buildRoundWinnerEmailHtml({ ...opts, leaderboardUrl });
  const text = [
    `Hi ${opts.displayName},`,
    ``,
    `You won Round ${opts.round} of the NBA Playoffs Picks Challenge.`,
    ``,
    `Round ${opts.round} Score: ${opts.totalScore.toLocaleString()} points`,
    `Props Correct: ${opts.correctCount}`,
    `Nights Played: ${opts.nightsPlayed}`,
    `Rank: #${opts.rank} out of ${opts.totalPlayers} players`,
    ``,
    `Your $15 prize is yours \u2014 we'll be in touch to send it your way.`,
    ``,
    `Round 2 is live now. $85 is still up for grabs across the remaining rounds.`,
    ``,
    `Make your picks: ${leaderboardUrl}`,
    ``,
    `\u2014 Swayger HQ`
  ].join("\n");
  await resend.emails.send({
    from: FROM,
    to: opts.to,
    reply_to: "hq@swayger.app",
    subject: `You won the Round ${opts.round} picks challenge`,
    html,
    text
  });
  console.log(`[email] round-winner sent to ${opts.to}`);
}
function buildRoundLaunchBlastHtml(opts) {
  const { displayName, picksUrl } = opts;
  const unsubLine = opts.unsubscribeUrl ? `<p style="margin:32px 0 0;font-size:11px;color:#999999;"><a href="${opts.unsubscribeUrl}" style="color:#999999;">Unsubscribe</a></p>` : "";
  return `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Round 2 is live</title>
</head>
<body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border-radius:8px;padding:36px 40px;">

      <p style="margin:0 0 24px;font-size:13px;font-weight:600;color:#888888;letter-spacing:0.5px;text-transform:uppercase;">\u{1F3C0} Swayger \xB7 NBA Playoffs</p>

      <p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111111;line-height:1.3;">Missed Round 1? Doesn't matter.</p>

      <p style="margin:0 0 16px;font-size:16px;color:#333333;line-height:1.6;">Hey ${displayName} \u2014</p>

      <p style="margin:0 0 16px;font-size:16px;color:#333333;line-height:1.6;">Round 2 is live and the board is completely fresh. <strong>$85 is still up for grabs</strong> across the last 3 rounds. Jump in now and you're right back in it.</p>

      <p style="margin:0 0 16px;font-size:16px;color:#333333;line-height:1.6;">No download. No cost. Pick OVER or UNDER on 4 props before tipoff. Highest cumulative score at the end of Round 2 wins. Takes 30 seconds.</p>

      <p style="margin:28px 0;font-size:16px;"><a href="${picksUrl}" style="background:#111111;color:#ffffff;font-size:15px;font-weight:600;padding:13px 28px;border-radius:6px;text-decoration:none;display:inline-block;">Make tonight's picks \u2192</a></p>

      <p style="margin:0 0 6px;font-size:15px;color:#555555;line-height:1.6;">No excuses. See you on the board.</p>

      <p style="margin:0;font-size:15px;color:#555555;">\u2014 Swayger HQ</p>

      ${unsubLine}
    </div>
  </div>
</body>
</html>`;
}
async function sendRoundLaunchBlast(opts) {
  if (!process.env.RESEND_API_KEY) return;
  const unsubscribeUrl = generateUnsubscribeUrl(opts.userId);
  const html = buildRoundLaunchBlastHtml({ ...opts, unsubscribeUrl });
  const text = [
    `${opts.displayName},`,
    ``,
    `Missed Round 1? Doesn't matter.`,
    ``,
    `Round 2 is live and the board is fresh. Jump in now \u2014 you're still in the running for $85 across the last 3 rounds.`,
    ``,
    `Prize pool left: $85`,
    `Rounds remaining: 3 (including this one)`,
    `Cost to play: Free`,
    ``,
    `No download required. Pick OVER or UNDER on 4 props before tipoff each night. Highest score at the end of the round wins. Takes 30 seconds.`,
    ``,
    `Make tonight's picks: ${opts.picksUrl}`,
    ``,
    `\u2014 Swayger HQ`,
    ``,
    `Unsubscribe: ${unsubscribeUrl}`
  ].join("\n");
  await resend.emails.send({
    from: FROM,
    to: opts.to,
    reply_to: "hq@swayger.app",
    subject: "Round 2 is live \u{1F3C0}",
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    }
  });
}
function buildRoundLaunchBlastPreview() {
  return buildRoundLaunchBlastHtml({ displayName: "Jordan", picksUrl: "https://www.swayger.app/picks" });
}
function buildGameSixBlastHtml(opts) {
  const { displayName, picksUrl, swaygerUrl } = opts;
  const unsubLine = opts.unsubscribeUrl ? `<p style="margin:32px 0 0;font-size:11px;color:#999999;">You're receiving this because you have a Swayger account. <a href="${opts.unsubscribeUrl}" style="color:#999999;">Unsubscribe</a></p>` : "";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Two Game 6s tonight \u2014 your picks are live</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <tr>
          <td style="padding-bottom:24px;">
            <span style="font-size:13px;font-weight:700;color:#111111;letter-spacing:1.5px;text-transform:uppercase;">SWAYGER</span>
          </td>
        </tr>

        <tr>
          <td style="font-size:15px;color:#222222;line-height:1.7;">

            <p style="margin:0 0 18px;">Hey ${displayName},</p>

            <p style="margin:0 0 18px;">Two Game 6 series are on the line tonight:</p>

            <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;width:100%;">
              <tr>
                <td style="background:#f5f5f5;border-radius:8px;padding:14px 18px;">
                  <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#111111;">\u{1F3C0} Detroit Pistons vs Cleveland Cavaliers</p>
                  <p style="margin:0;font-size:15px;font-weight:700;color:#111111;">\u{1F43A} Minnesota Timberwolves vs San Antonio Spurs</p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 18px;">Get your picks in before they lock at <strong>5:45 PM CDT</strong>.</p>

            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#111111;border-radius:8px;">
                  <a href="${picksUrl}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Make your picks tonight \u2192</a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 18px;">Every game night, NBA picks are live. And on the nights between games \u2014 we run quick props to keep the debate going. There's always something on.</p>

            <p style="margin:0 0 18px;">Got a friend with a take on tonight? Put it in writing. A Swayger is a 1v1 challenge between two people \u2014 no house, just receipts.</p>

            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#ffffff;border:2px solid #111111;border-radius:8px;">
                  <a href="${swaygerUrl}" style="display:inline-block;padding:11px 28px;font-size:15px;font-weight:600;color:#111111;text-decoration:none;">Challenge a friend \u2192</a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 18px;">You're one of the people who gave Swayger a real shot early. That means everything \u2014 what you use, what you skip, what you wish existed \u2014 is directly shaping where this goes. Keep the feedback coming.</p>

            <p style="margin:0 0 6px;">See you in the app tonight.</p>
            <p style="margin:0;color:#555555;">\u2014 Darius from Swayger</p>

            ${unsubLine}

          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
async function sendGameSixBlast(opts) {
  if (!process.env.RESEND_API_KEY) return;
  const subject = "Two Game 6s tonight \u2014 your picks are live \u{1F3C0}";
  const darFrom = FROM.includes("<") ? FROM.replace(/^.*?</, "Darius from Swayger <") : FROM;
  const unsubscribeUrl = generateUnsubscribeUrl(opts.userId);
  const html = buildGameSixBlastHtml({
    displayName: opts.displayName,
    picksUrl: opts.picksUrl,
    swaygerUrl: opts.swaygerUrl,
    unsubscribeUrl
  });
  await resend.emails.send({ from: darFrom, to: opts.to, subject, html });
}
function buildGameSixBlastPreview() {
  return buildGameSixBlastHtml({
    displayName: "Jordan",
    picksUrl: "https://www.swayger.app/picks",
    swaygerUrl: "https://www.swayger.app"
  });
}
function buildCFBracketBlastHtml(opts) {
  const { displayName, bracketUrl, picksUrl } = opts;
  const unsubLine = opts.unsubscribeUrl ? `<p style="margin:32px 0 0;font-size:11px;color:#999999;">You're receiving this because you have a Swayger account. <a href="${opts.unsubscribeUrl}" style="color:#999999;">Unsubscribe</a></p>` : "";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lock in your Conference Finals picks</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <tr>
          <td style="padding-bottom:24px;">
            <span style="font-size:13px;font-weight:700;color:#111111;letter-spacing:1.5px;text-transform:uppercase;">SWAYGER</span>
          </td>
        </tr>

        <tr>
          <td style="font-size:15px;color:#222222;line-height:1.7;">

            <p style="margin:0 0 18px;">Hey ${displayName},</p>

            <p style="margin:0 0 18px;">The Conference Finals are here \u2014 and it's not too late to jump up the leaderboard.</p>

            <p style="margin:0 0 18px;"><strong>Round 3 bracket picks are open now</strong> and lock tomorrow, May 21 at 6 PM CDT. Pick your series winners for both matchups and call the number of games for a bonus. Each correct pick is worth <strong>1,000 points</strong>.</p>

            <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;width:100%;border:1px solid #eeeeee;border-radius:8px;">
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #eeeeee;">
                  <span style="font-size:12px;font-weight:700;color:#888888;text-transform:uppercase;letter-spacing:1px;">West</span><br>
                  <span style="font-size:15px;font-weight:600;color:#111111;">Spurs vs Thunder</span>
                  <span style="font-size:13px;color:#555555;display:block;margin-top:2px;">Game 2 is tonight \u2014 picks lock at 7:15 PM CDT</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;">
                  <span style="font-size:12px;font-weight:700;color:#888888;text-transform:uppercase;letter-spacing:1px;">East</span><br>
                  <span style="font-size:15px;font-weight:600;color:#111111;">Cavaliers vs Knicks</span>
                  <span style="font-size:13px;color:#555555;display:block;margin-top:2px;">Game 2 tips tomorrow \u2014 picks lock at 6 PM CDT May 21</span>
                </td>
              </tr>
            </table>

            <table cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
              <tr>
                <td style="background:#111111;border-radius:8px;">
                  <a href="${bracketUrl}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Lock in my picks \u2192</a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 18px;"></p>

            <p style="margin:0 0 18px;"><strong>Nightly Props are also live.</strong> Tonight's game has player props available \u2014 head to the Picks tab and lock them in before the game starts. More points on the table.</p>

            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#1a1a2e;border-radius:8px;border:1px solid #333366;">
                  <a href="${picksUrl}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#6699ff;text-decoration:none;">Tonight's Nightly Props \u2192</a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 18px;color:#555555;font-size:14px;">The leaderboard resets each round \u2014 even if you're behind, a strong Conference Finals run can put you in cash prize territory.</p>

            <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;background:#f7f7f7;border-radius:8px;border:1px solid #e8e8e8;">
              <tr>
                <td style="padding:16px 18px;">
                  <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#111111;">\u{1F514} Get instant alerts</p>
                  <p style="margin:0 0 12px;font-size:13px;color:#555555;line-height:1.5;">Enable push notifications on swayger.app and we'll ping you when picks lock, settlements land, or a Swayger needs your attention.</p>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background:#111111;border-radius:6px;">
                        <a href="https://www.swayger.app" style="display:inline-block;padding:9px 20px;font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;">Enable notifications \u2192</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 6px;">Good luck tonight.</p>
            <p style="margin:0;color:#555555;">\u2014 Swayger HQ</p>

            ${unsubLine}

          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
async function sendCFBracketBlast(opts) {
  if (!process.env.RESEND_API_KEY) return;
  const subject = "Lock in your Conference Finals picks \u2014 cash on the line \u{1F3C0}";
  const unsubscribeUrl = generateUnsubscribeUrl(opts.userId);
  const html = buildCFBracketBlastHtml({
    displayName: opts.displayName,
    bracketUrl: opts.bracketUrl,
    picksUrl: opts.picksUrl,
    unsubscribeUrl
  });
  await resend.emails.send({ from: FROM, to: opts.to, subject, html });
}
function buildCFBracketBlastPreview() {
  return buildCFBracketBlastHtml({
    displayName: "Jordan",
    bracketUrl: "https://www.swayger.app/playoffs/bracket",
    picksUrl: "https://www.swayger.app/picks"
  });
}
function buildGameDayBlastHtml(opts) {
  const { gameName, trackedRoomLink, displayName, unsubscribeUrl } = opts;
  const previewText = "Make live prop picks, climb the leaderboard, and see who finishes as Game Day Champ.";
  const unsubLine = unsubscribeUrl ? `<p style="margin:24px 0 0;font-size:12px;color:#999999;line-height:1.6;">You're receiving this because you signed up for Swayger. <a href="${unsubscribeUrl}" style="color:#999999;">Unsubscribe</a></p>` : "";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Game Day room is open \u2014 ${gameName}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,serif;">
  <span style="display:none;max-height:0;overflow:hidden;">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:40px 20px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <tr><td style="padding-bottom:24px;">
          <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:2px;color:#111111;font-family:Arial,sans-serif;text-transform:uppercase;">Swayger</p>
        </td></tr>

        <tr><td style="font-family:Arial,sans-serif;font-size:15px;color:#111111;line-height:1.7;">

          <p style="margin:0 0 16px;">Tonight's live Game Day Swayger room is open for ${gameName}.</p>

          <p style="margin:0 0 16px;">Game Day Swayger is a live room where everyone makes quick prop picks before the game, at halftime, and in the 4Q \u2014 then watches the leaderboard move as the game unfolds.</p>

          <p style="margin:0 0 20px;">Jump in before tipoff, lock in your takes, and see if you can finish as Game Day Champ.</p>

          <p style="margin:0 0 8px;">Here's how it works:</p>
          <p style="margin:0 0 4px;">1. Make your Pregame prop picks before tipoff</p>
          <p style="margin:0 0 4px;">2. Come back at halftime for second-half props</p>
          <p style="margin:0 0 4px;">3. Lock in your 4Q Clutch props</p>
          <p style="margin:0 0 4px;">4. Watch the leaderboard move</p>
          <p style="margin:0 0 20px;">5. See who finishes as Game Day Champ</p>

          <p style="margin:0 0 24px;">No money. No odds. Just live props, leaderboard, bragging rights, and receipts.</p>

          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="background:#111111;border-radius:6px;">
                <a href="${trackedRoomLink}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;">Join Tonight's Game Day Room</a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 4px;">Lock it in and stand on it.</p>
          <p style="margin:0;">\u2014 Swayger</p>

          ${unsubLine}

        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return html;
}
function buildGameDayBlastText(opts) {
  const { gameName, trackedRoomLink, unsubscribeUrl } = opts;
  return [
    `Tonight's live Game Day Swayger room is open for ${gameName}.`,
    "",
    "Game Day Swayger is a live room where everyone makes quick prop picks before the game, at halftime, and in the 4Q \u2014 then watches the leaderboard move as the game unfolds.",
    "",
    "Jump in before tipoff, lock in your takes, and see if you can finish as Game Day Champ.",
    "",
    "Here's how it works:",
    "1. Make your Pregame prop picks before tipoff",
    "2. Come back at halftime for second-half props",
    "3. Lock in your 4Q Clutch props",
    "4. Watch the leaderboard move",
    "5. See who finishes as Game Day Champ",
    "",
    "No money. No odds. Just live props, leaderboard, bragging rights, and receipts.",
    "",
    `Join Tonight's Game Day Room: ${trackedRoomLink}`,
    "",
    "Lock it in and stand on it.",
    "\u2014 Swayger",
    ...unsubscribeUrl ? ["", `Unsubscribe: ${unsubscribeUrl}`] : []
  ].join("\n");
}
async function sendGameDayBlastEmail(opts) {
  if (!process.env.RESEND_API_KEY) return null;
  const subject = opts.subject ?? `Tonight's live Game Day Swayger room is open for ${opts.gameName}`;
  const unsubscribeUrl = generateUnsubscribeUrl(opts.userId);
  const html = buildGameDayBlastHtml({
    gameName: opts.gameName,
    trackedRoomLink: opts.trackedRoomLink,
    displayName: opts.displayName,
    unsubscribeUrl
  });
  const text = buildGameDayBlastText({
    gameName: opts.gameName,
    trackedRoomLink: opts.trackedRoomLink,
    displayName: opts.displayName,
    unsubscribeUrl
  });
  const result = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    }
  });
  return result.data?.id ?? null;
}
var resend, FROM, APP_URL, UNSUB_SECRET;
var init_email = __esm({
  "server/email.ts"() {
    "use strict";
    resend = new Resend(process.env.RESEND_API_KEY);
    FROM = process.env.RESEND_FROM_EMAIL || "Swayger <onboarding@resend.dev>";
    APP_URL = process.env.EXPO_PUBLIC_APP_URL || "https://www.swayger.app";
    UNSUB_SECRET = `swayger-unsub-v1-${process.env.RESEND_API_KEY ?? "dev"}`;
  }
});

// server/stripeClient.ts
var stripeClient_exports = {};
__export(stripeClient_exports, {
  getStripePublishableKey: () => getStripePublishableKey,
  getStripeSecretKey: () => getStripeSecretKey,
  getUncachableStripeClient: () => getUncachableStripeClient
});
import Stripe from "stripe";
async function getCredentials() {
  const liveKey = process.env.STRIPE_SECRET_KEY_LIVE;
  if (liveKey) {
    return {
      publishableKey: "",
      // publishable key not needed for server-side calls
      secretKey: liveKey
    };
  }
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY ? "repl " + process.env.REPL_IDENTITY : process.env.WEB_REPL_RENEWAL ? "depl " + process.env.WEB_REPL_RENEWAL : null;
  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found for repl/depl");
  }
  const connectorName = "stripe";
  const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
  const targetEnvironment = isProduction ? "production" : "development";
  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", connectorName);
  url.searchParams.set("environment", targetEnvironment);
  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "X-Replit-Token": xReplitToken
    }
  });
  const data = await response.json();
  const connectionSettings = data.items?.[0];
  if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }
  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret
  };
}
async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, {
    apiVersion: "2025-08-27.basil"
  });
}
async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}
async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}
var init_stripeClient = __esm({
  "server/stripeClient.ts"() {
    "use strict";
  }
});

// server/index.ts
import express from "express";

// server/routes.ts
init_email();
import { createServer } from "node:http";
import * as path3 from "path";
import { createClient as createClient6 } from "@supabase/supabase-js";

// server/routes-mm-admin.ts
init_email();
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
  sweet_sixteen: "round-32",
  // won in R32 → reached Sweet 16
  elite_eight: "sweet-16",
  // won in S16 → reached Elite 8
  final_four: "elite-8",
  // won in E8  → reached Final Four
  champion: "championship"
  // won the championship
};
var UPSET_POINTS = 3;
var BLOWOUT_POINTS = 3;
var HIGH_SCORER_POINTS = 3;
var SCORE_EMAILS_PAUSED = true;
var BLAST_EMAILS_PAUSED = false;
async function computeAndSaveScores(supabase) {
  const { data: resultsRaw, error: resultsErr } = await supabase.from("mm_game_results").select("*");
  if (resultsErr) return { scored: 0, error: resultsErr.message };
  const results = resultsRaw ?? [];
  const TEAM_NAME_MAP = {
    "Duke Blue Devils": ["Duke"],
    "UConn Huskies": ["UConn"],
    "Michigan St Spartans": ["Michigan St.", "Michigan State"],
    "Michigan St. Spartans": ["Michigan St.", "Michigan State"],
    "Michigan State Spartans": ["Michigan St.", "Michigan State"],
    "St. John's Red Storm": ["St. John's"],
    "Iowa Hawkeyes": ["Iowa"],
    "Iowa State Cyclones": ["Iowa State", "Iowa St."],
    "Iowa St. Cyclones": ["Iowa State", "Iowa St."],
    "Arizona Wildcats": ["Arizona"],
    "Alabama Crimson Tide": ["Alabama"],
    "Purdue Boilermakers": ["Purdue"],
    "Arkansas Razorbacks": ["Arkansas"],
    "Nebraska Cornhuskers": ["Nebraska"],
    "Illinois Fighting Illini": ["Illinois"],
    "Texas Longhorns": ["Texas"],
    "Houston Cougars": ["Houston"],
    "Michigan Wolverines": ["Michigan"],
    "Tennessee Volunteers": ["Tennessee"],
    "Florida Gators": ["Florida"],
    "Kansas Jayhawks": ["Kansas"],
    "Virginia Cavaliers": ["Virginia"],
    "UCLA Bruins": ["UCLA"],
    "TCU Horned Frogs": ["TCU"],
    "Louisville Cardinals": ["Louisville"],
    "VCU Rams": ["VCU"],
    "Gonzaga Bulldogs": ["Gonzaga"],
    "Utah State Aggies": ["Utah State"],
    "Texas Tech Red Raiders": ["Texas Tech"],
    "Vanderbilt Commodores": ["Vanderbilt"],
    "High Point Panthers": ["High Point"],
    "Miami Hurricanes": ["Miami (FL)", "Miami FL"],
    "Miami (FL) Hurricanes": ["Miami (FL)", "Miami FL"],
    "Saint Louis Billikens": ["Saint Louis"],
    "Kentucky Wildcats": ["Kentucky"],
    "Texas A&M Aggies": ["Texas A&M"],
    "North Carolina Tar Heels": ["North Carolina", "UNC"],
    "Ohio State Buckeyes": ["Ohio St."],
    "Ohio St. Buckeyes": ["Ohio St."],
    "Oklahoma State Cowboys": ["Oklahoma St."],
    "Wisconsin Badgers": ["Wisconsin"],
    "Dayton Flyers": ["Dayton"],
    "Nevada Wolf Pack": ["Nevada"],
    "Minnesota Golden Gophers": ["Minnesota"],
    "Creighton Bluejays": ["Creighton"],
    "Baylor Bears": ["Baylor"]
  };
  const winnersByRound = {};
  for (const r of results) {
    if (!winnersByRound[r.round_id]) winnersByRound[r.round_id] = /* @__PURE__ */ new Set();
    if (!r.winner_name) continue;
    winnersByRound[r.round_id].add(r.winner_name);
    const aliases = TEAM_NAME_MAP[r.winner_name] ?? [];
    for (const alias of aliases) winnersByRound[r.round_id].add(alias);
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
      correct_high_scorers: 0,
      is_second_chance: false
    };
  }
  const { data: takesRaw } = await supabase.rpc("get_all_mm_locked_takes");
  const takes = takesRaw ?? [];
  for (const take of takes) {
    if (!scores[take.user_id]) scores[take.user_id] = emptyScore();
    const roundId = TAKE_ROUND_MAP[take.take_type];
    const advancedTeams = winnersByRound[roundId];
    if (!advancedTeams || advancedTeams.size === 0) continue;
    const mult = take.is_second_chance ? 0.5 : 1;
    if (take.is_second_chance) scores[take.user_id].is_second_chance = true;
    const ptsEach = (TAKE_POINTS[take.take_type] ?? 0) * mult;
    for (const team of take.teams ?? []) {
      if (advancedTeams.has(team)) {
        scores[take.user_id][take.take_type] += ptsEach;
      }
    }
  }
  const { data: specialPicksRaw } = await supabase.rpc("get_all_mm_special_picks");
  const specialPicks = specialPicksRaw ?? [];
  const { data: referralProfilesRaw, error: boostErr } = await supabase.rpc("get_mm_boost_users");
  if (boostErr) console.warn("[score] get_mm_boost_users error:", boostErr.message);
  const referralRewardMap = new Map(
    (referralProfilesRaw ?? []).filter((p) => p.referral_reward_round != null).map((p) => [p.id, p.referral_reward_round])
  );
  const paidBoostMap = new Map(
    (referralProfilesRaw ?? []).filter((p) => p.paid_2x_round != null).map((p) => [p.id, p.paid_2x_round])
  );
  console.log(`[score] boost users: ${referralProfilesRaw?.length ?? 0} found (referral=${referralRewardMap.size}, paid=${paidBoostMap.size})`);
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
    const baseMult = pick.points_multiplier ?? 1;
    if (baseMult < 1) scores[pick.user_id].is_second_chance = true;
    const hasBoost = referralRewardMap.get(pick.user_id) === pick.round_id || paidBoostMap.get(pick.user_id) === pick.round_id;
    const mult = hasBoost ? Math.min(baseMult * 2, 2) : baseMult;
    if (pick.pick_type === "upset") {
      const pool = candidateMap[`${pick.round_id}:upset`];
      if (pool && pool.size > 0 && !pool.has(pick.matchup_id)) continue;
      const resultForGame = results.find(
        (r) => r.round_id === pick.round_id && r.matchup_id === pick.matchup_id
      );
      if (resultForGame && resultForGame.winner_name === pick.picked_team) {
        scores[pick.user_id].upset += UPSET_POINTS * mult;
        scores[pick.user_id].correct_upsets += 1;
      }
    } else if (pick.pick_type === "blowout") {
      const winningMatchup = biggestBlowout[pick.round_id];
      if (winningMatchup && pick.matchup_id === winningMatchup) {
        scores[pick.user_id].blowout += BLOWOUT_POINTS * mult;
        scores[pick.user_id].correct_blowouts += 1;
      }
    } else if (pick.pick_type === "high_scorer") {
      const winningMatchup = highestScorer[pick.round_id];
      if (winningMatchup && pick.matchup_id === winningMatchup) {
        scores[pick.user_id].high_scorer += HIGH_SCORER_POINTS * mult;
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
    is_second_chance: p.is_second_chance,
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
  const { data: profiles } = await supabase.rpc("get_all_notification_profiles");
  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );
  let sent = 0;
  for (let i = 0; i < allScores.length; i++) {
    const s = allScores[i];
    const profile = profileMap.get(s.user_id);
    if (!profile?.notification_email || profile.email_unsubscribed) continue;
    try {
      await sendMMScoreUpdateEmail2({
        to: profile.notification_email,
        displayName: profile.display_name || profile.username,
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
async function sendR32WrapupBlast(supabase) {
  const { sendR32WrapupEmail: sendR32WrapupEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
  const { data: allScoresRaw } = await supabase.from("mm_pick_scores").select("user_id,total_points,upset_pts,correct_upsets,blowout_pts,correct_blowouts,high_scorer_pts,correct_high_scorers").order("total_points", { ascending: false });
  const allScores = allScoresRaw ?? [];
  if (!allScores.length) return;
  const totalPlayers = allScores.length;
  const { data: profiles } = await supabase.rpc("get_all_notification_profiles");
  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );
  let sent = 0;
  for (let i = 0; i < allScores.length; i++) {
    const s = allScores[i];
    const profile = profileMap.get(s.user_id);
    if (!profile?.notification_email || profile.email_unsubscribed) continue;
    try {
      await sendR32WrapupEmail2({
        to: profile.notification_email,
        displayName: profile.display_name || profile.username,
        totalPoints: s.total_points ?? 0,
        upsetPts: s.upset_pts ?? 0,
        correctUpsets: s.correct_upsets ?? 0,
        blowoutPts: s.blowout_pts ?? 0,
        correctBlowouts: s.correct_blowouts ?? 0,
        highScorerPts: s.high_scorer_pts ?? 0,
        correctHighScorers: s.correct_high_scorers ?? 0,
        rank: i + 1,
        totalPlayers,
        userId: profile.id
      });
      sent++;
    } catch (e) {
      console.error("[mm-admin] R32 wrapup email failed for", s.user_id, e);
    }
  }
  console.log(`[mm-admin] R32 wrapup blast: sent to ${sent}/${totalPlayers}`);
}
function registerMMAdminRoutes(app2) {
  app2.get("/admin/mm", (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).send("<h1>401 \u2014 Invalid or missing admin token</h1><p>Append ?token=YOUR_TOKEN to the URL.</p>");
      return;
    }
    const htmlPath = path.resolve(process.cwd(), "server", "templates", "mm-admin.html");
    if (fs.existsSync(htmlPath)) {
      res2.sendFile(htmlPath);
    } else {
      res2.status(404).send("Admin template not found");
    }
  });
  app2.post("/admin/mm/api/resolve", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    const { round_id, matchup_id, winner_name, winner_seed, loser_name, loser_seed, winner_score, loser_score, was_upset } = req.body;
    if (!round_id || !matchup_id || !winner_name) {
      res2.status(400).json({ ok: false, error: "round_id, matchup_id, winner_name are required" });
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
        res2.status(500).json({ ok: false, error: error.message });
        return;
      }
      res2.json({ ok: true, message: `Result saved: ${winner_name} wins in ${round_id}` });
    } catch (err) {
      console.error("[mm-admin] resolve error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/score", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { scored, error } = await computeAndSaveScores(supabase);
      if (error) {
        res2.status(500).json({ ok: false, error });
        return;
      }
      res2.json({ ok: true, message: `Scores recomputed for ${scored} user(s). Use /score-and-email to send the blast.` });
    } catch (err) {
      console.error("[mm-admin] score error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/score-and-email", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (SCORE_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Score emails are paused (SCORE_EMAILS_PAUSED=true). Flip the flag and restart before calling this endpoint." });
      return;
    }
    try {
      const supabase = getSupabase();
      const { scored, error } = await computeAndSaveScores(supabase);
      if (error) {
        res2.status(500).json({ ok: false, error });
        return;
      }
      res2.json({ ok: true, message: `Scores recomputed for ${scored} user(s) \u2014 sending score update emails now` });
      sendScoreUpdateBlast(supabase).catch(
        (e) => console.error("[mm-admin] score-and-email blast error:", e)
      );
    } catch (err) {
      console.error("[mm-admin] score-and-email error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/api/debug-picks", async (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const usernameFilter = req.query.username;
      const { data: allPicks } = await supabase.rpc("get_all_mm_special_picks");
      const { data: allResults } = await supabase.from("mm_game_results").select("round_id, matchup_id, winner_name, loser_name, was_upset");
      const { data: profiles } = await supabase.from("profiles").select("id, username");
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.username]));
      const resultMap = new Map((allResults ?? []).map(
        (r) => [`${r.round_id}:${r.matchup_id}`, r]
      ));
      const picks = (allPicks ?? []).filter((p) => {
        if (!usernameFilter) return true;
        const uname = profileMap.get(p.user_id);
        return uname?.toLowerCase().includes(usernameFilter.toLowerCase());
      });
      const debug = picks.map((p) => {
        const key = `${p.round_id}:${p.matchup_id}`;
        const result = resultMap.get(key);
        let scored = false;
        let reason = "";
        if (!result) {
          reason = `NO result found for matchup_id=${p.matchup_id} round=${p.round_id}`;
        } else if (p.pick_type === "upset") {
          scored = result.winner_name === p.picked_team;
          reason = scored ? "MATCH" : `winner="${result.winner_name}" != picked="${p.picked_team}"`;
        } else {
          reason = "blowout/hs: scored based on best-in-round";
          scored = false;
        }
        return {
          username: profileMap.get(p.user_id) ?? p.user_id.slice(0, 8),
          pick_type: p.pick_type,
          round_id: p.round_id,
          matchup_id: p.matchup_id,
          picked_team: p.picked_team,
          result_winner: result?.winner_name ?? null,
          result_loser: result?.loser_name ?? null,
          was_upset: result?.was_upset ?? null,
          scored,
          reason
        };
      });
      res2.json({ ok: true, total_picks: picks.length, debug });
    } catch (err) {
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/api/results", async (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.from("mm_game_results").select("*").order("resolved_at", { ascending: false });
      if (error) {
        res2.status(500).json({ ok: false, error: error.message });
        return;
      }
      res2.json({ ok: true, results: data });
    } catch (err) {
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/api/leaderboard", async (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { data: scores } = await supabase.from("mm_pick_scores").select("*").order("total_points", { ascending: false }).limit(20);
      if (!scores?.length) {
        res2.json({ ok: true, entries: [] });
        return;
      }
      const userIds = scores.map((s) => s.user_id);
      const { data: profiles } = await supabase.rpc("get_mm_profile_data", { user_ids: userIds });
      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.id, p])
      );
      const entries = scores.map((s) => ({
        ...s,
        username: profileMap.get(s.user_id)?.username ?? "?",
        display_name: profileMap.get(s.user_id)?.display_name ?? null
      }));
      res2.json({ ok: true, entries });
    } catch (err) {
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/email-preview/leaderboard-blast", (_req, res2) => {
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildLeaderboardBlastHtml());
  });
  app2.get("/admin/mm/email-preview/last-chance", (_req, res2) => {
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildLastChanceBlastHtml());
  });
  app2.get("/admin/mm/email-preview/second-shot", (_req, res2) => {
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildSecondShotEmailHtml("Swayger User"));
  });
  app2.get("/admin/mm/email-preview/r32-wrapup", (_req, res2) => {
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildR32WrapupEmailHtml({
      displayName: "Swayger User",
      totalPoints: 9,
      upsetPts: 6,
      correctUpsets: 2,
      blowoutPts: 0,
      correctBlowouts: 0,
      highScorerPts: 3,
      correctHighScorers: 1,
      rank: 1,
      totalPlayers: 17
    }));
  });
  app2.get("/admin/mm/email-preview/r32-picks", (_req, res2) => {
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildMMR32PicksEmailHtml("Swayger User"));
  });
  app2.get("/admin/mm/email-preview/s16-tipoff", (_req, res2) => {
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildS16TipoffAlertEmailHtml("Swayger User"));
  });
  app2.get("/admin/mm/email-preview/s16-launch-a", (_req, res2) => {
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildS16LaunchEmailHtml("Swayger User", true));
  });
  app2.get("/admin/mm/email-preview/s16-launch-b", (_req, res2) => {
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildS16LaunchEmailHtml("Swayger User", false));
  });
  app2.post("/admin/mm/api/blast-s16-launch", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart before calling this endpoint." });
      return;
    }
    try {
      const { sendS16LaunchEmail: sendS16LaunchEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const supabase = getSupabase();
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      const eligible2 = (allProfiles ?? []).filter(
        (p) => p.notification_email && !p.email_unsubscribed
      );
      const { data: lockedTakesRows } = await supabase.from("mm_locked_takes").select("user_id").eq("is_submitted", true).eq("is_second_chance", false);
      const usersWithLockedTakes = new Set(
        (lockedTakesRows ?? []).map((r) => r.user_id)
      );
      let sentA = 0;
      let sentB = 0;
      let failed = 0;
      for (const profile of eligible2) {
        try {
          const hasLockedTakes = usersWithLockedTakes.has(profile.id);
          await sendS16LaunchEmail2({
            to: profile.notification_email,
            displayName: profile.display_name || profile.username,
            hasLockedTakes,
            userId: profile.id
          });
          if (hasLockedTakes) sentA++;
          else sentB++;
        } catch (e) {
          console.error("[mm-admin] s16-launch blast failed for", profile.id, e);
          failed++;
        }
      }
      console.log(`[mm-admin] S16 launch blast: variantA=${sentA} variantB=${sentB} failed=${failed}`);
      res2.json({
        ok: true,
        message: `S16 launch blast sent: ${sentA} variant A (has picks), ${sentB} variant B (second chance)${failed > 0 ? `, ${failed} failed` : ""}`,
        sentA,
        sentB,
        failed
      });
    } catch (err) {
      console.error("[mm-admin] s16-launch blast error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/blast-r32-picks", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart before calling this endpoint." });
      return;
    }
    try {
      const { sendMMR32PicksEmail: sendMMR32PicksEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const supabase = getSupabase();
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      const eligible2 = (allProfiles ?? []).filter(
        (p) => p.notification_email && !p.email_unsubscribed
      );
      let sent = 0;
      let failed = 0;
      for (const profile of eligible2) {
        try {
          await sendMMR32PicksEmail2({
            to: profile.notification_email,
            displayName: profile.display_name || profile.username,
            userId: profile.id
          });
          sent++;
        } catch (e) {
          console.error("[mm-admin] r32-picks blast failed for", profile.id, e);
          failed++;
        }
      }
      console.log(`[mm-admin] R32 picks blast: sent=${sent} failed=${failed}`);
      res2.json({ ok: true, message: `R32 picks blast sent to ${sent} user(s)${failed > 0 ? `, ${failed} failed` : ""}` });
    } catch (err) {
      console.error("[mm-admin] r32-picks blast error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/blast-s16-tipoff", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused." });
      return;
    }
    const excludeUsernames = (req.body?.exclude_usernames ?? []).map((u) => u.toLowerCase());
    try {
      const { sendS16TipoffAlertEmail: sendS16TipoffAlertEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const supabase = getSupabase();
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      const eligible2 = (allProfiles ?? []).filter(
        (p) => p.notification_email && !p.email_unsubscribed && !excludeUsernames.includes((p.username ?? "").toLowerCase())
      );
      let sent = 0;
      let failed = 0;
      for (const profile of eligible2) {
        try {
          await sendS16TipoffAlertEmail2({
            to: profile.notification_email,
            displayName: profile.display_name || profile.username,
            userId: profile.id
          });
          sent++;
        } catch (e) {
          console.error("[mm-admin] s16-tipoff blast failed for", profile.id, e);
          failed++;
        }
      }
      console.log(`[mm-admin] S16 tipoff blast: sent=${sent} failed=${failed}`);
      res2.json({ ok: true, message: `S16 tipoff alert sent to ${sent} user(s)${failed > 0 ? `, ${failed} failed` : ""}`, sent, failed });
    } catch (err) {
      console.error("[mm-admin] s16-tipoff blast error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/blast-leaderboard", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart before calling this endpoint." });
      return;
    }
    try {
      const { sendLeaderboardBlast: sendLeaderboardBlast2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const supabase = getSupabase();
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      const eligible2 = (allProfiles ?? []).filter(
        (p) => p.notification_email && !p.email_unsubscribed
      );
      let sent = 0;
      let failed = 0;
      for (const profile of eligible2) {
        try {
          await sendLeaderboardBlast2({
            to: profile.notification_email,
            displayName: profile.display_name || profile.username,
            userId: profile.id
          });
          sent++;
        } catch (e) {
          console.error("[mm-admin] blast failed for", profile.id, e);
          failed++;
        }
      }
      console.log(`[mm-admin] Leaderboard blast: sent=${sent} failed=${failed}`);
      res2.json({ ok: true, message: `Blast sent to ${sent} user(s)${failed > 0 ? `, ${failed} failed` : ""}` });
    } catch (err) {
      console.error("[mm-admin] blast error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/remind", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart before calling this endpoint." });
      return;
    }
    try {
      const { sendMMReminderEmail: sendMMReminderEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const supabase = getSupabase();
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: takes } = await supabase.from("mm_locked_takes").select("user_id").eq("is_submitted", true);
      const usersWithTakes = new Set((takes ?? []).map((t) => t.user_id));
      const eligible2 = (allProfiles ?? []).filter(
        (p) => !usersWithTakes.has(p.id) && p.notification_email
      );
      let sent = 0;
      for (const profile of eligible2) {
        try {
          await sendMMReminderEmail2({
            to: profile.notification_email,
            displayName: profile.display_name || profile.username
          });
          sent++;
        } catch (e) {
          console.error("[mm-admin] reminder email failed for", profile.id, e);
        }
      }
      res2.json({ ok: true, message: `Reminders sent to ${sent} user(s)` });
    } catch (err) {
      console.error("[mm-admin] remind error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/api/debug-locked-takes", async (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    const supabase = getSupabase();
    const { data: rpcData, error: rpcErr } = await supabase.rpc("get_all_mm_locked_takes");
    const { data: directData, error: directErr } = await supabase.from("mm_locked_takes").select("user_id, take_type, teams, is_submitted").eq("is_submitted", true).limit(5);
    res2.json({ ok: true, rpcCount: (rpcData ?? []).length, rpcError: rpcErr?.message ?? null, rpcSample: (rpcData ?? []).slice(0, 3), directCount: (directData ?? []).length, directError: directErr?.message ?? null });
  });
  app2.post("/admin/mm/api/delete-result", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const { id } = req.body;
      if (!id) {
        res2.status(400).json({ ok: false, error: "Missing required field: id" });
        return;
      }
      const supabase = getSupabase();
      const { error } = await supabase.from("mm_game_results").delete().eq("id", id);
      if (error) {
        res2.status(500).json({ ok: false, error: error.message });
        return;
      }
      console.log(`[mm-admin] Result deleted: id=${id}`);
      res2.json({ ok: true, message: `Result ${id} deleted` });
    } catch (err) {
      console.error("[mm-admin] delete-result error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/insert-result", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const {
        round_id,
        matchup_id,
        winner_name,
        winner_seed,
        loser_name,
        loser_seed,
        winner_score,
        loser_score,
        was_upset
      } = req.body;
      if (!round_id || !matchup_id || !winner_name || !loser_name) {
        res2.status(400).json({ ok: false, error: "Missing required fields: round_id, matchup_id, winner_name, loser_name" });
        return;
      }
      const supabase = getSupabase();
      const { error } = await supabase.from("mm_game_results").upsert({
        round_id,
        matchup_id,
        winner_name,
        winner_seed: winner_seed ?? null,
        loser_name,
        loser_seed: loser_seed ?? null,
        winner_score: winner_score ?? null,
        loser_score: loser_score ?? null,
        was_upset: was_upset ?? false,
        resolved_at: (/* @__PURE__ */ new Date()).toISOString()
      }, { onConflict: "round_id,matchup_id" });
      if (error) {
        res2.status(500).json({ ok: false, error: error.message });
        return;
      }
      console.log(`[mm-admin] Manual result inserted: ${round_id} / ${matchup_id} \u2014 ${winner_name} def. ${loser_name}`);
      res2.json({ ok: true, message: `Result recorded: ${winner_name} def. ${loser_name}` });
    } catch (err) {
      console.error("[mm-admin] insert-result error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/email-preview/thankyou", (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).send("Unauthorized");
      return;
    }
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildThankyouEmailPreview());
  });
  app2.get("/admin/mm/api/blast-thankyou/dry-run", async (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { data: scores } = await supabase.from("mm_pick_scores").select("*").order("total_points", { ascending: false });
      if (!scores?.length) {
        res2.json({ ok: true, recipients: [], note: "No scores found" });
        return;
      }
      const userIds = scores.map((s) => s.user_id);
      const { data: profileData } = await supabase.rpc("get_mm_profile_data", { user_ids: userIds });
      const nameMap = new Map(
        (profileData ?? []).map((p) => [p.id, p])
      );
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const emailMap = new Map(
        (emailProfiles ?? []).map((p) => [p.id, p])
      );
      const recipients = scores.map((s, i) => {
        const names = nameMap.get(s.user_id);
        const emailInfo = emailMap.get(s.user_id);
        const resolvedName = names?.display_name || names?.username || "?";
        return {
          rank: i + 1,
          user_id: s.user_id,
          username: names?.username ?? "?",
          display_name: names?.display_name ?? null,
          resolved_name: resolvedName,
          total_points: s.total_points,
          email: emailInfo?.notification_email ?? null,
          email_unsubscribed: emailInfo?.email_unsubscribed ?? false,
          would_receive: !!(emailInfo?.notification_email && !emailInfo?.email_unsubscribed)
        };
      });
      const willSend = recipients.filter((r) => r.would_receive).length;
      res2.json({ ok: true, total_scored: scores.length, will_send: willSend, recipients });
    } catch (err) {
      console.error("[mm-admin] dry-run error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/blast-thankyou", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart before calling this endpoint." });
      return;
    }
    try {
      const { sendThankyouEmail: sendThankyouEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const supabase = getSupabase();
      const { data: scores } = await supabase.from("mm_pick_scores").select("*").order("total_points", { ascending: false });
      if (!scores?.length) {
        res2.status(400).json({ ok: false, error: "No scores found \u2014 run scoring first" });
        return;
      }
      const totalPlayers = scores.length;
      const userIds = scores.map((s) => s.user_id);
      const { data: profileData } = await supabase.rpc("get_mm_profile_data", { user_ids: userIds });
      const nameMap = new Map(
        (profileData ?? []).map((p) => [p.id, p])
      );
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const emailMap = new Map(
        (emailProfiles ?? []).map((p) => [p.id, p])
      );
      const profileMap = new Map(
        userIds.map((uid) => {
          const names = nameMap.get(uid) ?? { id: uid, username: "?", display_name: null };
          const emailInfo = emailMap.get(uid) ?? { notification_email: null, email_unsubscribed: true };
          return [uid, { ...names, ...emailInfo }];
        })
      );
      const leaderboard = scores.map((s, i) => {
        const p = profileMap.get(s.user_id);
        return {
          rank: i + 1,
          username: p?.username ?? "?",
          displayName: p?.display_name ?? null,
          totalPoints: s.total_points
        };
      });
      let sent = 0;
      let skipped = 0;
      let failed = 0;
      for (let i = 0; i < scores.length; i++) {
        const score = scores[i];
        const profile = profileMap.get(score.user_id);
        if (!profile?.notification_email || profile.email_unsubscribed) {
          skipped++;
          continue;
        }
        try {
          await sendThankyouEmail2({
            to: profile.notification_email,
            displayName: profile.display_name || profile.username,
            rank: i + 1,
            totalPoints: score.total_points,
            totalPlayers,
            leaderboard,
            userId: score.user_id
          });
          sent++;
        } catch (e) {
          console.error("[mm-admin] thankyou blast failed for", score.user_id, e);
          failed++;
        }
      }
      console.log(`[mm-admin] Thank-you blast: sent=${sent} skipped=${skipped} failed=${failed}`);
      res2.json({ ok: true, message: `Thank-you blast sent to ${sent} user(s)${skipped > 0 ? `, ${skipped} skipped (no email/unsubscribed)` : ""}${failed > 0 ? `, ${failed} failed` : ""}` });
    } catch (err) {
      console.error("[mm-admin] thankyou blast error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/api/blast-thankyou-catchup/dry-run", async (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { data: scores } = await supabase.from("mm_pick_scores").select("user_id, total_points").order("total_points", { ascending: false });
      if (!scores?.length) {
        res2.json({ ok: true, note: "No scores found \u2014 run scoring first", recipients: [] });
        return;
      }
      const mmUserIds = new Set((scores ?? []).map((s) => s.user_id));
      const { data: authProfiles, error: rpcErr } = await supabase.rpc("get_auth_only_profiles");
      if (rpcErr) {
        res2.status(500).json({ ok: false, error: `get_auth_only_profiles RPC failed: ${rpcErr.message}. Did you run add_auth_only_profiles_rpc.sql?` });
        return;
      }
      const missedMM = (authProfiles ?? []).filter((p) => mmUserIds.has(p.id));
      const recipients = missedMM.map((p) => ({
        user_id: p.id,
        username: p.username,
        display_name: p.display_name,
        email: p.notification_email,
        email_unsubscribed: p.email_unsubscribed,
        would_receive: !p.email_unsubscribed
      }));
      res2.json({ ok: true, total: recipients.length, will_send: recipients.filter((r) => r.would_receive).length, recipients });
    } catch (err) {
      console.error("[catchup-thankyou] dry-run error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/blast-thankyou-catchup", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused. Flip BLAST_EMAILS_PAUSED and restart." });
      return;
    }
    try {
      const { sendThankyouEmail: sendThankyouEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const supabase = getSupabase();
      const { data: scores } = await supabase.from("mm_pick_scores").select("*").order("total_points", { ascending: false });
      if (!scores?.length) {
        res2.status(400).json({ ok: false, error: "No scores found \u2014 run scoring first" });
        return;
      }
      const totalPlayers = scores.length;
      const userIds = scores.map((s) => s.user_id);
      const scoreRankMap = new Map(scores.map((s, i) => [s.user_id, { rank: i + 1, total_points: s.total_points }]));
      const { data: profileData } = await supabase.rpc("get_mm_profile_data", { user_ids: userIds });
      const nameMap = new Map((profileData ?? []).map((p) => [p.id, p]));
      const { data: authProfiles, error: rpcErr } = await supabase.rpc("get_auth_only_profiles");
      if (rpcErr) {
        res2.status(500).json({ ok: false, error: `get_auth_only_profiles RPC failed: ${rpcErr.message}. Did you run add_auth_only_profiles_rpc.sql?` });
        return;
      }
      const mmUserIdSet = new Set(userIds);
      const missedMM = (authProfiles ?? []).filter((p) => mmUserIdSet.has(p.id) && !p.email_unsubscribed);
      let sent = 0, skipped = 0, failed = 0;
      for (const profile of missedMM) {
        const rankInfo = scoreRankMap.get(profile.id);
        if (!rankInfo) {
          skipped++;
          continue;
        }
        const nameInfo = nameMap.get(profile.id);
        const displayName = nameInfo?.display_name || nameInfo?.username || profile.username || "there";
        const leaderboard = scores.map((s, i) => ({
          rank: i + 1,
          username: nameMap.get(s.user_id)?.username ?? "\u2014",
          displayName: nameMap.get(s.user_id)?.display_name ?? null,
          totalPoints: s.total_points
        }));
        try {
          await sendThankyouEmail2({
            to: profile.notification_email,
            displayName,
            rank: rankInfo.rank,
            totalPoints: rankInfo.total_points,
            totalPlayers,
            leaderboard,
            userId: profile.id
          });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error("[catchup-thankyou] send failed for", profile.id, e);
          failed++;
        }
      }
      console.log(`[catchup-thankyou] sent=${sent} skipped=${skipped} failed=${failed}`);
      res2.json({ ok: true, sent, skipped, failed, note: "Catch-up blast \u2014 only auth-email users (not already reached)" });
    } catch (err) {
      console.error("[catchup-thankyou] blast error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/api/blast-outreach-a-catchup/dry-run", async (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { data: authProfiles, error: rpcErr } = await supabase.rpc("get_auth_only_profiles");
      if (rpcErr) {
        res2.status(500).json({ ok: false, error: `get_auth_only_profiles RPC failed: ${rpcErr.message}. Did you run add_auth_only_profiles_rpc.sql?` });
        return;
      }
      const { data: scores } = await supabase.from("mm_pick_scores").select("user_id");
      const mmUserIds = new Set((scores ?? []).map((s) => s.user_id));
      const { data: swaygerCreators } = await supabase.from("swaygers").select("creator_id").not("creator_id", "is", null);
      const { data: swaygerOpponents } = await supabase.from("swaygers").select("opponent_id").not("opponent_id", "is", null);
      const swaygerIds = /* @__PURE__ */ new Set([
        ...(swaygerCreators ?? []).map((s) => s.creator_id),
        ...(swaygerOpponents ?? []).map((s) => s.opponent_id)
      ]);
      const segA = (authProfiles ?? []).filter((p) => !mmUserIds.has(p.id) && !swaygerIds.has(p.id));
      const recipients = segA.map((p) => ({
        user_id: p.id,
        resolved_name: p.display_name || p.username,
        email: p.notification_email,
        email_unsubscribed: p.email_unsubscribed,
        would_receive: !p.email_unsubscribed,
        in_mm: mmUserIds.has(p.id),
        has_swayger: swaygerIds.has(p.id)
      }));
      res2.json({ ok: true, segment: "no_swayger_catchup", total: recipients.length, will_send: recipients.filter((r) => r.would_receive).length, recipients });
    } catch (err) {
      console.error("[catchup-outreach-a] dry-run error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/blast-outreach-a-catchup", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused. Flip BLAST_EMAILS_PAUSED and restart." });
      return;
    }
    try {
      const { sendOutreachAEmail: sendOutreachAEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const supabase = getSupabase();
      const { data: authProfiles, error: rpcErr } = await supabase.rpc("get_auth_only_profiles");
      if (rpcErr) {
        res2.status(500).json({ ok: false, error: `get_auth_only_profiles RPC failed: ${rpcErr.message}. Did you run add_auth_only_profiles_rpc.sql?` });
        return;
      }
      const { data: scores } = await supabase.from("mm_pick_scores").select("user_id");
      const mmUserIds = new Set((scores ?? []).map((s) => s.user_id));
      const { data: swaygerCreators } = await supabase.from("swaygers").select("creator_id").not("creator_id", "is", null);
      const { data: swaygerOpponents } = await supabase.from("swaygers").select("opponent_id").not("opponent_id", "is", null);
      const swaygerIds = /* @__PURE__ */ new Set([
        ...(swaygerCreators ?? []).map((s) => s.creator_id),
        ...(swaygerOpponents ?? []).map((s) => s.opponent_id)
      ]);
      const eligible2 = (authProfiles ?? []).filter((p) => !mmUserIds.has(p.id) && !swaygerIds.has(p.id) && !p.email_unsubscribed);
      let sent = 0, failed = 0;
      for (const user of eligible2) {
        try {
          await sendOutreachAEmail2({ to: user.notification_email, displayName: user.display_name || user.username, userId: user.id });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[catchup-outreach-a] failed to send to ${user.notification_email}:`, e);
          failed++;
        }
      }
      console.log(`[catchup-outreach-a] sent=${sent} failed=${failed}`);
      res2.json({ ok: true, segment: "no_swayger_catchup", sent, failed, note: "Catch-up blast \u2014 only auth-email users not already reached" });
    } catch (err) {
      console.error("[catchup-outreach-a] blast error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/api/feedback", async (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      res2.json({
        ok: true,
        note: "Feedback is INSERT-only via anon key (RLS blocks SELECT). Read responses at: https://supabase.com/dashboard \u2192 Table Editor \u2192 mm_feedback"
      });
    } catch (err) {
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/outreach-feedback-a", (_req, res2) => {
    const html = fs.readFileSync(path.join(process.cwd(), "server", "templates", "outreach-feedback-a.html"), "utf-8");
    res2.setHeader("Content-Type", "text/html");
    res2.send(html);
  });
  app2.get("/outreach-feedback-b", (_req, res2) => {
    const html = fs.readFileSync(path.join(process.cwd(), "server", "templates", "outreach-feedback-b.html"), "utf-8");
    res2.setHeader("Content-Type", "text/html");
    res2.send(html);
  });
  app2.post("/api/outreach/feedback", async (req, res2) => {
    try {
      const { user_id, segment, q1, q2, q3, q4, open_text } = req.body ?? {};
      if (!segment || !["no_swayger", "swayger_no_mm"].includes(segment)) {
        res2.status(400).json({ ok: false, error: "Invalid segment" });
        return;
      }
      const supabase = getSupabase();
      const { error } = await supabase.from("outreach_feedback").insert({
        user_id: user_id ?? null,
        segment,
        q1: q1 ?? null,
        q2: q2 ?? null,
        q3: q3 ?? null,
        q4: q4 ?? null,
        open_text: open_text ?? null
      });
      if (error) {
        console.error("[outreach] feedback insert error:", error);
        res2.status(500).json({ ok: false, error: "Failed to save" });
        return;
      }
      res2.json({ ok: true });
    } catch (err) {
      console.error("[outreach] feedback error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/email-preview/outreach-a", (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).send("Unauthorized");
      return;
    }
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildOutreachAEmailPreview());
  });
  app2.get("/admin/mm/email-preview/outreach-b", (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).send("Unauthorized");
      return;
    }
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildOutreachBEmailPreview());
  });
  async function getOutreachSegments() {
    const supabase = getSupabase();
    const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
    const profiles = allProfiles ?? [];
    const { data: scores } = await supabase.from("mm_pick_scores").select("user_id");
    const mmUserIds = new Set((scores ?? []).map((s) => s.user_id));
    const { data: swaygerCreators } = await supabase.from("swaygers").select("creator_id").not("creator_id", "is", null);
    const { data: swaygerOpponents } = await supabase.from("swaygers").select("opponent_id").not("opponent_id", "is", null);
    const swaygerUserIds = /* @__PURE__ */ new Set([
      ...(swaygerCreators ?? []).map((s) => s.creator_id),
      ...(swaygerOpponents ?? []).map((s) => s.opponent_id)
    ]);
    const segmentA = profiles.filter((p) => !mmUserIds.has(p.id) && !swaygerUserIds.has(p.id)).map((p) => ({
      id: p.id,
      resolved_name: p.display_name || p.username,
      email: p.notification_email,
      email_unsubscribed: p.email_unsubscribed
    }));
    const segmentB = profiles.filter((p) => !mmUserIds.has(p.id) && swaygerUserIds.has(p.id)).map((p) => ({
      id: p.id,
      resolved_name: p.display_name || p.username,
      email: p.notification_email,
      email_unsubscribed: p.email_unsubscribed
    }));
    return { segmentA, segmentB, mmUserIds, swaygerUserIds };
  }
  app2.get("/admin/mm/api/blast-outreach-a/dry-run", async (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const { segmentA, mmUserIds, swaygerUserIds } = await getOutreachSegments();
      const recipients = segmentA.map((u) => ({
        user_id: u.id,
        resolved_name: u.resolved_name,
        email: u.email,
        email_unsubscribed: u.email_unsubscribed,
        would_receive: !u.email_unsubscribed,
        in_mm: mmUserIds.has(u.id),
        has_swayger: swaygerUserIds.has(u.id)
      }));
      res2.json({ ok: true, segment: "no_swayger", total: recipients.length, will_send: recipients.filter((r) => r.would_receive).length, recipients });
    } catch (err) {
      console.error("[outreach] dry-run A error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/api/blast-outreach-b/dry-run", async (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const { segmentB, mmUserIds, swaygerUserIds } = await getOutreachSegments();
      const recipients = segmentB.map((u) => ({
        user_id: u.id,
        resolved_name: u.resolved_name,
        email: u.email,
        email_unsubscribed: u.email_unsubscribed,
        would_receive: !u.email_unsubscribed,
        in_mm: mmUserIds.has(u.id),
        has_swayger: swaygerUserIds.has(u.id)
      }));
      res2.json({ ok: true, segment: "swayger_no_mm", total: recipients.length, will_send: recipients.filter((r) => r.would_receive).length, recipients });
    } catch (err) {
      console.error("[outreach] dry-run B error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/blast-outreach-a", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart." });
      return;
    }
    try {
      const { sendOutreachAEmail: sendOutreachAEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const { segmentA } = await getOutreachSegments();
      const eligible2 = segmentA.filter((u) => !u.email_unsubscribed);
      let sent = 0;
      let failed = 0;
      for (const user of eligible2) {
        try {
          await sendOutreachAEmail2({ to: user.email, displayName: user.resolved_name, userId: user.id });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[outreach-a] failed to send to ${user.email}:`, e);
          failed++;
        }
      }
      console.log(`[outreach-a] blast complete: ${sent} sent, ${failed} failed`);
      res2.json({ ok: true, segment: "no_swayger", sent, failed, total_eligible: eligible2.length });
    } catch (err) {
      console.error("[outreach] blast A error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/blast-outreach-b", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart." });
      return;
    }
    try {
      const { sendOutreachBEmail: sendOutreachBEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const { segmentB } = await getOutreachSegments();
      const eligible2 = segmentB.filter((u) => !u.email_unsubscribed);
      let sent = 0;
      let failed = 0;
      for (const user of eligible2) {
        try {
          await sendOutreachBEmail2({ to: user.email, displayName: user.resolved_name, userId: user.id });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[outreach-b] failed to send to ${user.email}:`, e);
          failed++;
        }
      }
      console.log(`[outreach-b] blast complete: ${sent} sent, ${failed} failed`);
      res2.json({ ok: true, segment: "swayger_no_mm", sent, failed, total_eligible: eligible2.length });
    } catch (err) {
      console.error("[outreach] blast B error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/email-preview/mm-followup", (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).send("Unauthorized");
      return;
    }
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildMMFollowupEmailPreview());
  });
  app2.get("/admin/mm/email-preview/outreach-a-followup", (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).send("Unauthorized");
      return;
    }
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildOutreachAFollowupEmailPreview());
  });
  app2.get("/admin/mm/email-preview/outreach-b-followup", (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).send("Unauthorized");
      return;
    }
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildOutreachBFollowupEmailPreview());
  });
  app2.get("/admin/mm/api/blast-mm-followup/dry-run", async (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const supabase = getSupabase();
      const { data: scores } = await supabase.from("mm_pick_scores").select("user_id");
      const mmUserIds = new Set((scores ?? []).map((s) => s.user_id));
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      const allProfiles = [
        ...emailProfiles ?? [],
        ...authProfiles ?? []
      ];
      const seen = /* @__PURE__ */ new Set();
      const deduped = allProfiles.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      const recipients = deduped.filter((p) => mmUserIds.has(p.id)).map((p) => ({
        user_id: p.id,
        resolved_name: p.display_name || p.username,
        email: p.notification_email,
        email_unsubscribed: p.email_unsubscribed,
        would_receive: !p.email_unsubscribed
      }));
      res2.json({ ok: true, segment: "mm_participants", total: recipients.length, will_send: recipients.filter((r) => r.would_receive).length, recipients });
    } catch (err) {
      console.error("[mm-followup] dry-run error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/blast-mm-followup", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart." });
      return;
    }
    try {
      const { sendMMFollowupEmail: sendMMFollowupEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const supabase = getSupabase();
      const { data: scores } = await supabase.from("mm_pick_scores").select("user_id");
      const mmUserIds = new Set((scores ?? []).map((s) => s.user_id));
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      const allProfiles = [
        ...emailProfiles ?? [],
        ...authProfiles ?? []
      ];
      const seen = /* @__PURE__ */ new Set();
      const deduped = allProfiles.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      const eligible2 = deduped.filter((p) => mmUserIds.has(p.id) && !p.email_unsubscribed);
      let sent = 0;
      let failed = 0;
      for (const user of eligible2) {
        try {
          await sendMMFollowupEmail2({ to: user.notification_email, displayName: user.display_name || user.username, userId: user.id });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[mm-followup] failed to send to ${user.notification_email}:`, e);
          failed++;
        }
      }
      console.log(`[mm-followup] blast complete: ${sent} sent, ${failed} failed`);
      res2.json({ ok: true, segment: "mm_participants", sent, failed, total_eligible: eligible2.length });
    } catch (err) {
      console.error("[mm-followup] blast error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/api/blast-outreach-a-followup/dry-run", async (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const { segmentA } = await getOutreachSegments();
      const recipients = segmentA.map((u) => ({
        user_id: u.id,
        resolved_name: u.resolved_name,
        email: u.email,
        email_unsubscribed: u.email_unsubscribed,
        would_receive: !u.email_unsubscribed
      }));
      res2.json({ ok: true, segment: "no_swayger_followup", total: recipients.length, will_send: recipients.filter((r) => r.would_receive).length, recipients });
    } catch (err) {
      console.error("[outreach-a-followup] dry-run error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/blast-outreach-a-followup", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart." });
      return;
    }
    try {
      const { sendOutreachAFollowupEmail: sendOutreachAFollowupEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const { segmentA } = await getOutreachSegments();
      const eligible2 = segmentA.filter((u) => !u.email_unsubscribed);
      let sent = 0;
      let failed = 0;
      for (const user of eligible2) {
        try {
          await sendOutreachAFollowupEmail2({ to: user.email, displayName: user.resolved_name, userId: user.id });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[outreach-a-followup] failed to send to ${user.email}:`, e);
          failed++;
        }
      }
      console.log(`[outreach-a-followup] blast complete: ${sent} sent, ${failed} failed`);
      res2.json({ ok: true, segment: "no_swayger_followup", sent, failed, total_eligible: eligible2.length });
    } catch (err) {
      console.error("[outreach-a-followup] blast error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/api/blast-outreach-b-followup/dry-run", async (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    try {
      const { segmentB } = await getOutreachSegments();
      const recipients = segmentB.map((u) => ({
        user_id: u.id,
        resolved_name: u.resolved_name,
        email: u.email,
        email_unsubscribed: u.email_unsubscribed,
        would_receive: !u.email_unsubscribed
      }));
      res2.json({ ok: true, segment: "swayger_no_mm_followup", total: recipients.length, will_send: recipients.filter((r) => r.would_receive).length, recipients });
    } catch (err) {
      console.error("[outreach-b-followup] dry-run error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/admin/mm/api/blast-outreach-b-followup", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag and restart." });
      return;
    }
    try {
      const { sendOutreachBFollowupEmail: sendOutreachBFollowupEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const { segmentB } = await getOutreachSegments();
      const eligible2 = segmentB.filter((u) => !u.email_unsubscribed);
      let sent = 0;
      let failed = 0;
      for (const user of eligible2) {
        try {
          await sendOutreachBFollowupEmail2({ to: user.email, displayName: user.resolved_name, userId: user.id });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[outreach-b-followup] failed to send to ${user.email}:`, e);
          failed++;
        }
      }
      console.log(`[outreach-b-followup] blast complete: ${sent} sent, ${failed} failed`);
      res2.json({ ok: true, segment: "swayger_no_mm_followup", sent, failed, total_eligible: eligible2.length });
    } catch (err) {
      console.error("[outreach-b-followup] blast error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/admin/mm/api/send-test-emails", async (req, res2) => {
    const token = req.query.token;
    if (!isAdminToken(token)) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    const to = req.query.to;
    if (!to) {
      res2.status(400).json({ ok: false, error: "Missing ?to= address" });
      return;
    }
    const template = req.query.template ?? "all";
    try {
      const {
        sendOutreachAEmail: sendOutreachAEmail2,
        sendOutreachBEmail: sendOutreachBEmail2,
        sendThankyouEmail: sendThankyouEmail2,
        sendMMFollowupEmail: sendMMFollowupEmail2,
        sendOutreachAFollowupEmail: sendOutreachAFollowupEmail2,
        sendOutreachBFollowupEmail: sendOutreachBFollowupEmail2
      } = await Promise.resolve().then(() => (init_email(), email_exports));
      const results = {};
      if (template === "all" || template === "outreach-a") {
        try {
          await sendOutreachAEmail2({ to, displayName: "You", userId: void 0 });
          results["outreach-a"] = "sent";
        } catch (e) {
          results["outreach-a"] = `error: ${e}`;
        }
      }
      if (template === "all" || template === "outreach-b") {
        try {
          await sendOutreachBEmail2({ to, displayName: "You", userId: void 0 });
          results["outreach-b"] = "sent";
        } catch (e) {
          results["outreach-b"] = `error: ${e}`;
        }
      }
      if (template === "all" || template === "thankyou") {
        try {
          await sendThankyouEmail2({
            to,
            displayName: "You",
            rank: 1,
            totalPoints: 83,
            totalPlayers: 19,
            leaderboard: [
              { rank: 1, username: "dgrand2", displayName: "Mr Roarke", totalPoints: 83 },
              { rank: 2, username: "leon50g", displayName: null, totalPoints: 50 },
              { rank: 3, username: "JayA78", displayName: null, totalPoints: 48 },
              { rank: 4, username: "Belt_2_Ass", displayName: null, totalPoints: 47 },
              { rank: 5, username: "Big Boss", displayName: null, totalPoints: 47 }
            ],
            userId: void 0
          });
          results["thankyou"] = "sent";
        } catch (e) {
          results["thankyou"] = `error: ${e}`;
        }
      }
      if (template === "all" || template === "mm-followup") {
        try {
          await sendMMFollowupEmail2({ to, displayName: "You", userId: void 0 });
          results["mm-followup"] = "sent";
        } catch (e) {
          results["mm-followup"] = `error: ${e}`;
        }
      }
      if (template === "all" || template === "outreach-a-followup") {
        try {
          await sendOutreachAFollowupEmail2({ to, displayName: "You", userId: void 0 });
          results["outreach-a-followup"] = "sent";
        } catch (e) {
          results["outreach-a-followup"] = `error: ${e}`;
        }
      }
      if (template === "all" || template === "outreach-b-followup") {
        try {
          await sendOutreachBFollowupEmail2({ to, displayName: "You", userId: void 0 });
          results["outreach-b-followup"] = "sent";
        } catch (e) {
          results["outreach-b-followup"] = `error: ${e}`;
        }
      }
      res2.json({ ok: true, to, results });
    } catch (err) {
      console.error("[test-emails] error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
}

// server/routes-mm-special.ts
import { createClient as createClient2 } from "@supabase/supabase-js";
import * as fs2 from "fs";
import * as path2 from "path";

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

// lib/mm-dates.ts
var ROUND_LOCK_DATES = {
  "first-four": "2026-03-17T12:00:00-05:00",
  "round-64": "2026-03-19T11:00:00-05:00",
  "round-32": "2026-03-21T12:00:00-05:00",
  "sweet-16": "2026-03-26T18:00:00-05:00",
  // 6pm CDT Mar 26, first tip 6:10pm CDT
  "elite-8": "2026-03-28T17:00:00-05:00",
  "final-four": "2026-04-04T18:00:00-05:00"
};
var ROUND_PICKS_OPEN_DATES = {
  "round-64": "2026-03-19T11:00:00-05:00",
  "round-32": "2026-03-21T00:00:00-05:00",
  "sweet-16": "2026-03-22T00:00:00-05:00",
  // open now (backdated so it's definitely past)
  "elite-8": "2026-03-28T06:00:00-05:00",
  "final-four": "2026-04-03T00:00:00-05:00",
  "championship": "2026-04-05T00:00:00-05:00"
};
function isRoundLocked(roundId) {
  const lockDate = ROUND_LOCK_DATES[roundId];
  if (!lockDate) return true;
  return /* @__PURE__ */ new Date() >= new Date(lockDate);
}
var PICKS_ROUND_ORDER = [
  "round-64",
  "round-32",
  "sweet-16",
  "elite-8",
  "final-four",
  "championship"
];
function getActivePicksRoundId(_unused) {
  const now = Date.now();
  let result = PICKS_ROUND_ORDER[0];
  for (let i = 0; i < PICKS_ROUND_ORDER.length; i++) {
    const r = PICKS_ROUND_ORDER[i];
    const openDateStr = ROUND_PICKS_OPEN_DATES[r];
    if (openDateStr && now < new Date(openDateStr).getTime()) {
      break;
    }
    result = r;
    if (!isRoundLocked(r)) break;
    const next = PICKS_ROUND_ORDER[i + 1];
    if (!next) break;
    const nextOpenStr = ROUND_PICKS_OPEN_DATES[next];
    if (!nextOpenStr || now < new Date(nextOpenStr).getTime()) {
      break;
    }
  }
  return result;
}

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
  "round-64": { upset: 15, blowout: 5, high_scorer: 5 },
  "round-32": { upset: 5, blowout: 5, high_scorer: 5 },
  "sweet-16": { upset: 5, blowout: 5, high_scorer: 5 },
  "elite-8": { upset: 4, blowout: 5, high_scorer: 5 },
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
var CURATED_R64_UPSETS = [
  {
    matchupId: "midwest-7v10-santaclara",
    teamA: "Kentucky",
    seedA: 7,
    teamB: "Santa Clara",
    seedB: 10,
    region: "Midwest",
    rank: 1,
    favoriteTeam: "Kentucky",
    favoriteSeed: 7,
    underdogTeam: "Santa Clara",
    underdogSeed: 10,
    upsetProbability: 0.4,
    spread: 5.5,
    underdogMoneyline: 150,
    overUnder: 139,
    gameDate: "Mar 20",
    site: "St. Louis, MO",
    oddsSource: "seed-based",
    keyStat: "Kentucky ranks 299th nationally in forcing turnovers"
  },
  {
    matchupId: "south-6v11-vcu",
    teamA: "North Carolina",
    seedA: 6,
    teamB: "VCU",
    seedB: 11,
    region: "South",
    rank: 2,
    favoriteTeam: "North Carolina",
    favoriteSeed: 6,
    underdogTeam: "VCU",
    underdogSeed: 11,
    upsetProbability: 0.39,
    spread: 9,
    underdogMoneyline: 170,
    overUnder: 139,
    gameDate: "Mar 19",
    site: "Greenville, SC",
    oddsSource: "seed-based",
    keyStat: "UNC missing star Caleb Wilson (broken thumb, out for season)"
  },
  {
    matchupId: "west-6v11-texas",
    teamA: "BYU",
    seedA: 6,
    teamB: "Texas",
    seedB: 11,
    region: "West",
    rank: 3,
    favoriteTeam: "BYU",
    favoriteSeed: 6,
    underdogTeam: "Texas",
    underdogSeed: 11,
    upsetProbability: 0.37,
    spread: 9,
    underdogMoneyline: 170,
    overUnder: 144,
    gameDate: "Mar 19",
    site: "Portland, OR",
    oddsSource: "seed-based",
    keyStat: "Longhorns lost 5 of their last 6 entering the tournament"
  },
  {
    matchupId: "midwest-6v11-smu",
    teamA: "Tennessee",
    seedA: 6,
    teamB: "SMU",
    seedB: 11,
    region: "Midwest",
    rank: 4,
    favoriteTeam: "Tennessee",
    favoriteSeed: 6,
    underdogTeam: "SMU",
    underdogSeed: 11,
    upsetProbability: 0.25,
    spread: 9,
    underdogMoneyline: 220,
    overUnder: 133,
    gameDate: "Mar 20",
    site: "Philadelphia, PA",
    oddsSource: "seed-based",
    keyStat: "B.J. Edwards returning from ankle injury that cost SMU 5 games"
  },
  {
    matchupId: "west-5v12-highpoint",
    teamA: "Wisconsin",
    seedA: 5,
    teamB: "High Point",
    seedB: 12,
    region: "West",
    rank: 5,
    favoriteTeam: "Wisconsin",
    favoriteSeed: 5,
    underdogTeam: "High Point",
    underdogSeed: 12,
    upsetProbability: 0.24,
    spread: 12.5,
    underdogMoneyline: 240,
    overUnder: 150,
    gameDate: "Mar 19",
    site: "Portland, OR",
    oddsSource: "seed-based",
    keyStat: "High Point top-5 nationally in turnover rate at both ends"
  },
  {
    matchupId: "east-6v11-usf",
    teamA: "Louisville",
    seedA: 6,
    teamB: "South Florida",
    seedB: 11,
    region: "East",
    rank: 6,
    favoriteTeam: "Louisville",
    favoriteSeed: 6,
    underdogTeam: "South Florida",
    underdogSeed: 11,
    upsetProbability: 0.19,
    spread: 9,
    underdogMoneyline: 190,
    overUnder: 139,
    gameDate: "Mar 19",
    site: "Buffalo, NY",
    oddsSource: "seed-based",
    keyStat: "USF is 19-3 since late December, losses by combined 5 points"
  },
  {
    matchupId: "south-5v12-mcneese",
    teamA: "Vanderbilt",
    seedA: 5,
    teamB: "McNeese",
    seedB: 12,
    region: "South",
    rank: 7,
    favoriteTeam: "Vanderbilt",
    favoriteSeed: 5,
    underdogTeam: "McNeese",
    underdogSeed: 12,
    upsetProbability: 0.19,
    spread: 12.5,
    underdogMoneyline: 185,
    overUnder: 137,
    gameDate: "Mar 19",
    site: "Oklahoma City, OK",
    oddsSource: "seed-based",
    keyStat: "McNeese #1 nationally in points off turnovers (22.3 per game)"
  },
  {
    matchupId: "midwest-5v12-akron",
    teamA: "Texas Tech",
    seedA: 5,
    teamB: "Akron",
    seedB: 12,
    region: "Midwest",
    rank: 8,
    favoriteTeam: "Texas Tech",
    favoriteSeed: 5,
    underdogTeam: "Akron",
    underdogSeed: 12,
    upsetProbability: 0.18,
    spread: 13.5,
    underdogMoneyline: 230,
    overUnder: 141,
    gameDate: "Mar 20",
    site: "Tampa, FL",
    oddsSource: "seed-based",
    keyStat: "JT Toppin out for season (ACL) \u2014 Akron on 10-game win streak"
  },
  {
    matchupId: "east-5v12-northernIowa",
    teamA: "St. John's",
    seedA: 5,
    teamB: "Northern Iowa",
    seedB: 12,
    region: "East",
    rank: 9,
    favoriteTeam: "St. John's",
    favoriteSeed: 5,
    underdogTeam: "Northern Iowa",
    underdogSeed: 12,
    upsetProbability: 0.15,
    spread: 12.5,
    underdogMoneyline: 260,
    overUnder: 137,
    gameDate: "Mar 20",
    site: "San Diego, CA",
    oddsSource: "seed-based",
    keyStat: "UNI top-5 nationally in turnover rate at both ends of the court"
  }
];
var CURATED_R32_UPSETS = [
  {
    matchupId: "r32-west-arkansas-highpoint",
    teamA: "High Point",
    seedA: 12,
    teamB: "Arkansas",
    seedB: 4,
    region: "West",
    rank: 1,
    favoriteTeam: "Arkansas",
    favoriteSeed: 4,
    underdogTeam: "High Point",
    underdogSeed: 12,
    upsetProbability: 0.35,
    spread: 11.5,
    underdogMoneyline: 525,
    overUnder: 169.5,
    gameDate: "Mar 21",
    site: "Portland, OR",
    oddsSource: "live",
    keyStat: "High Point already stunned Wisconsin 83-82 \u2014 highest O/U (169.5) on the slate"
  },
  {
    matchupId: "r32-south-illinois-vcu",
    teamA: "VCU",
    seedA: 11,
    teamB: "Illinois",
    seedB: 3,
    region: "South",
    rank: 2,
    favoriteTeam: "Illinois",
    favoriteSeed: 3,
    underdogTeam: "VCU",
    underdogSeed: 11,
    upsetProbability: 0.3,
    spread: 11.5,
    underdogMoneyline: 425,
    overUnder: 151.5,
    gameDate: "Mar 21",
    site: "Greenville, SC",
    oddsSource: "live",
    keyStat: "VCU just upset #6 North Carolina \u2014 tournament mode fully unlocked"
  },
  {
    matchupId: "r32-west-gonzaga-texas",
    teamA: "Texas",
    seedA: 11,
    teamB: "Gonzaga",
    seedB: 3,
    region: "West",
    rank: 3,
    favoriteTeam: "Gonzaga",
    favoriteSeed: 3,
    underdogTeam: "Texas",
    underdogSeed: 11,
    upsetProbability: 0.28,
    spread: 6.5,
    underdogMoneyline: 220,
    overUnder: 147.5,
    gameDate: "Mar 21",
    site: "Portland, OR",
    oddsSource: "live",
    keyStat: "Texas won First Four + upset BYU \u2014 Gonzaga still without a title in 6 Final Fours"
  },
  {
    matchupId: "r32-south-houston-texasam",
    teamA: "Texas A&M",
    seedA: 10,
    teamB: "Houston",
    seedB: 2,
    region: "South",
    rank: 4,
    favoriteTeam: "Houston",
    favoriteSeed: 2,
    underdogTeam: "Texas A&M",
    underdogSeed: 10,
    upsetProbability: 0.22,
    spread: 10.5,
    underdogMoneyline: 380,
    overUnder: 141.5,
    gameDate: "Mar 21",
    site: "Oklahoma City, OK",
    oddsSource: "live",
    keyStat: "Texas A&M upset #7 Saint Mary's \u2014 defense and ball pressure travel in March"
  },
  {
    matchupId: "r32-south-nebraska-vanderbilt",
    teamA: "Nebraska",
    seedA: 4,
    teamB: "Vanderbilt",
    seedB: 5,
    region: "South",
    rank: 5,
    favoriteTeam: "Vanderbilt",
    favoriteSeed: 5,
    underdogTeam: "Nebraska",
    underdogSeed: 4,
    upsetProbability: 0.47,
    spread: 1.5,
    underdogMoneyline: 120,
    overUnder: 146.5,
    gameDate: "Mar 21",
    site: "Oklahoma City, OK",
    oddsSource: "live",
    keyStat: "Spread: Vanderbilt -1.5 \u2014 the closest game on today's slate, effectively a pick'em"
  }
];
var CURATED_R32_BLOWOUT = [
  {
    matchupId: "r32-midwest-michigan-stlouis",
    teamA: "Michigan",
    seedA: 1,
    teamB: "Saint Louis",
    seedB: 9,
    region: "Midwest",
    rank: 1,
    favoriteTeam: "Michigan",
    favoriteSeed: 1,
    underdogTeam: "Saint Louis",
    underdogSeed: 9,
    spread: 12.5,
    overUnder: 161.5,
    gameDate: "Mar 21",
    site: "Buffalo, NY",
    oddsSource: "live",
    keyStat: "Michigan -12.5 | O/U 161.5 \u2014 Wolverines averaged +18 point margin late in season"
  },
  {
    matchupId: "r32-east-duke-tcu",
    teamA: "Duke",
    seedA: 1,
    teamB: "TCU",
    seedB: 9,
    region: "East",
    rank: 2,
    favoriteTeam: "Duke",
    favoriteSeed: 1,
    underdogTeam: "TCU",
    underdogSeed: 9,
    spread: 11.5,
    overUnder: 140.5,
    gameDate: "Mar 21",
    site: "Raleigh, NC",
    oddsSource: "live",
    keyStat: "Duke -11.5 \u2014 hasn't lost since January, allows only 61 ppg"
  },
  {
    matchupId: "r32-south-illinois-vcu",
    teamA: "Illinois",
    seedA: 3,
    teamB: "VCU",
    seedB: 11,
    region: "South",
    rank: 3,
    favoriteTeam: "Illinois",
    favoriteSeed: 3,
    underdogTeam: "VCU",
    underdogSeed: 11,
    spread: 11.5,
    overUnder: 151.5,
    gameDate: "Mar 21",
    site: "Greenville, SC",
    oddsSource: "live",
    keyStat: "Illinois -11.5 | averages 9.8 made threes per game \u2014 can light it up fast"
  },
  {
    matchupId: "r32-west-arkansas-highpoint",
    teamA: "Arkansas",
    seedA: 4,
    teamB: "High Point",
    seedB: 12,
    region: "West",
    rank: 4,
    favoriteTeam: "Arkansas",
    favoriteSeed: 4,
    underdogTeam: "High Point",
    underdogSeed: 12,
    spread: 11.5,
    overUnder: 169.5,
    gameDate: "Mar 21",
    site: "Portland, OR",
    oddsSource: "live",
    keyStat: "Arkansas -11.5 | highest O/U on the slate (169.5) \u2014 someone's getting blown out"
  },
  {
    matchupId: "r32-west-arizona-utahst",
    teamA: "Arizona",
    seedA: 1,
    teamB: "Utah State",
    seedB: 9,
    region: "West",
    rank: 5,
    favoriteTeam: "Arizona",
    favoriteSeed: 1,
    underdogTeam: "Utah State",
    underdogSeed: 9,
    spread: 11.5,
    overUnder: 155.5,
    gameDate: "Mar 22",
    site: "San Diego, CA",
    oddsSource: "live",
    keyStat: "Arizona -11.5 | averages 84.2 ppg \u2014 one of the most efficient offenses in the nation"
  }
];
var CURATED_R32_HIGH_SCORER = [
  {
    matchupId: "r32-west-arkansas-highpoint",
    teamA: "Arkansas",
    seedA: 4,
    teamB: "High Point",
    seedB: 12,
    region: "West",
    rank: 1,
    favoriteTeam: "Arkansas",
    favoriteSeed: 4,
    underdogTeam: "High Point",
    underdogSeed: 12,
    spread: 11.5,
    overUnder: 169.5,
    gameDate: "Mar 21",
    site: "Portland, OR",
    oddsSource: "live",
    keyStat: "O/U 169.5 \u2014 the highest over/under on the ENTIRE R32 weekend slate"
  },
  {
    matchupId: "r32-midwest-alabama-texastech",
    teamA: "Alabama",
    seedA: 4,
    teamB: "Texas Tech",
    seedB: 5,
    region: "Midwest",
    rank: 2,
    favoriteTeam: "Alabama",
    favoriteSeed: 4,
    underdogTeam: "Texas Tech",
    underdogSeed: 5,
    spread: 1.5,
    overUnder: 164.5,
    gameDate: "Mar 22",
    site: "Tampa, FL",
    oddsSource: "live",
    keyStat: "O/U 164.5 \u2014 Alabama's up-tempo style vs Texas Tech's pace = fireworks expected"
  },
  {
    matchupId: "r32-midwest-michigan-stlouis",
    teamA: "Michigan",
    seedA: 1,
    teamB: "Saint Louis",
    seedB: 9,
    region: "Midwest",
    rank: 3,
    favoriteTeam: "Michigan",
    favoriteSeed: 1,
    underdogTeam: "Saint Louis",
    underdogSeed: 9,
    spread: 12.5,
    overUnder: 161.5,
    gameDate: "Mar 21",
    site: "Buffalo, NY",
    oddsSource: "live",
    keyStat: "O/U 161.5 \u2014 Michigan opens the day and both teams can score in bunches"
  },
  {
    matchupId: "r32-west-arizona-utahst",
    teamA: "Arizona",
    seedA: 1,
    teamB: "Utah State",
    seedB: 9,
    region: "West",
    rank: 4,
    favoriteTeam: "Arizona",
    favoriteSeed: 1,
    underdogTeam: "Utah State",
    underdogSeed: 9,
    spread: 11.5,
    overUnder: 155.5,
    gameDate: "Mar 22",
    site: "San Diego, CA",
    oddsSource: "live",
    keyStat: "O/U 155.5 \u2014 Arizona averages 84 ppg and plays at a fast pace"
  },
  {
    matchupId: "r32-south-illinois-vcu",
    teamA: "Illinois",
    seedA: 3,
    teamB: "VCU",
    seedB: 11,
    region: "South",
    rank: 5,
    favoriteTeam: "Illinois",
    favoriteSeed: 3,
    underdogTeam: "VCU",
    underdogSeed: 11,
    spread: 11.5,
    overUnder: 151.5,
    gameDate: "Mar 21",
    site: "Greenville, SC",
    oddsSource: "live",
    keyStat: "O/U 151.5 \u2014 Illinois averages 9.8 made threes, VCU forces transition chaos"
  }
];
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
  if (roundId === "round-32") {
    const counts2 = CANDIDATE_COUNTS["round-32"];
    return {
      upset: CURATED_R32_UPSETS.slice(0, counts2.upset).map((m, i) => ({ ...m, rank: i + 1 })),
      blowout: CURATED_R32_BLOWOUT.slice(0, counts2.blowout).map((m, i) => ({ ...m, rank: i + 1 })),
      highScorer: CURATED_R32_HIGH_SCORER.slice(0, counts2.high_scorer).map((m, i) => ({ ...m, rank: i + 1 }))
    };
  }
  if (roundId === "sweet-16") {
    const counts2 = CANDIDATE_COUNTS["sweet-16"];
    const s16All = [
      // ordered by matchup intrigue / upset potential
      { matchupId: "events-s16-west-purdue-texas", teamA: "Purdue Boilermakers", seedA: 2, teamB: "Texas Longhorns", seedB: 11, region: "West", rank: 0, favoriteTeam: "Purdue Boilermakers", favoriteSeed: 2, underdogTeam: "Texas Longhorns", underdogSeed: 11, upsetProbability: 0.22, spread: 16, overUnder: 152, underdogMoneyline: 620, gameDate: "Mar 26", site: "San Jose, CA", oddsSource: "seed-based", keyStat: "Texas is 3-0 as double-digit underdog this tournament" },
      { matchupId: "events-s16-south-nebraska-iowa", teamA: "Nebraska Cornhuskers", seedA: 4, teamB: "Iowa Hawkeyes", seedB: 9, region: "South", rank: 0, favoriteTeam: "Nebraska Cornhuskers", favoriteSeed: 4, underdogTeam: "Iowa Hawkeyes", underdogSeed: 9, upsetProbability: 0.38, spread: 6, overUnder: 148, underdogMoneyline: 175, gameDate: "Mar 26", site: "Houston, TX", oddsSource: "seed-based", keyStat: "Iowa stunned #1 Florida in R32 \u2014 biggest upset of the round" },
      { matchupId: "events-s16-east-duke-stjohns", teamA: "Duke Blue Devils", seedA: 1, teamB: "St. John's Red Storm", seedB: 5, region: "East", rank: 0, favoriteTeam: "Duke Blue Devils", favoriteSeed: 1, underdogTeam: "St. John's Red Storm", underdogSeed: 5, upsetProbability: 0.3, spread: 9, overUnder: 158, underdogMoneyline: 310, gameDate: "Mar 27", site: "Washington, DC", oddsSource: "seed-based", keyStat: "St. John's first Sweet 16 since 2000" },
      { matchupId: "events-s16-midwest-iowast-tenn", teamA: "Iowa State Cyclones", seedA: 2, teamB: "Tennessee Volunteers", seedB: 6, region: "Midwest", rank: 0, favoriteTeam: "Iowa State Cyclones", favoriteSeed: 2, underdogTeam: "Tennessee Volunteers", underdogSeed: 6, upsetProbability: 0.32, spread: 7, overUnder: 145, underdogMoneyline: 245, gameDate: "Mar 27", site: "Chicago, IL", oddsSource: "seed-based", keyStat: "Tennessee holds opponents to 28% from 3 \u2014 Iowa St. shoots 39%" },
      { matchupId: "events-s16-midwest-mich-bama", teamA: "Michigan Wolverines", seedA: 1, teamB: "Alabama Crimson Tide", seedB: 4, region: "Midwest", rank: 0, favoriteTeam: "Michigan Wolverines", favoriteSeed: 1, underdogTeam: "Alabama Crimson Tide", underdogSeed: 4, upsetProbability: 0.28, spread: 7, overUnder: 162, underdogMoneyline: 245, gameDate: "Mar 27", site: "Chicago, IL", oddsSource: "seed-based", keyStat: "Alabama averages 20+ fastbreak pts; Michigan blocks 7 per game" },
      { matchupId: "events-s16-west-arizona-ark", teamA: "Arizona Wildcats", seedA: 1, teamB: "Arkansas Razorbacks", seedB: 4, region: "West", rank: 0, favoriteTeam: "Arizona Wildcats", favoriteSeed: 1, underdogTeam: "Arkansas Razorbacks", underdogSeed: 4, upsetProbability: 0.28, spread: 7, overUnder: 144, underdogMoneyline: 245, gameDate: "Mar 26", site: "San Jose, CA", oddsSource: "seed-based", keyStat: "Arkansas held last 2 opponents under 60 pts" },
      { matchupId: "events-s16-east-uconn-msu", teamA: "UConn Huskies", seedA: 2, teamB: "Michigan St Spartans", seedB: 3, region: "East", rank: 0, favoriteTeam: "UConn Huskies", favoriteSeed: 2, underdogTeam: "Michigan St Spartans", underdogSeed: 3, upsetProbability: 0.44, spread: 3, overUnder: 139, underdogMoneyline: 145, gameDate: "Mar 27", site: "Washington, DC", oddsSource: "seed-based", keyStat: "UConn 2x champ in 3 yrs | MSU: Izzo's 15th Sweet 16" },
      { matchupId: "events-s16-south-houston-ill", teamA: "Houston Cougars", seedA: 2, teamB: "Illinois Fighting Illini", seedB: 3, region: "South", rank: 0, favoriteTeam: "Houston Cougars", favoriteSeed: 2, underdogTeam: "Illinois Fighting Illini", underdogSeed: 3, upsetProbability: 0.44, spread: 3, overUnder: 140, underdogMoneyline: 145, gameDate: "Mar 26", site: "Houston, TX", oddsSource: "seed-based", keyStat: "Houston playing at home (Toyota Center) \u2014 12-1 in tournament there" }
    ];
    const upsetSorted2 = [...s16All].sort(
      (a, b) => (b.underdogSeed ?? 0) - (b.favoriteSeed ?? 0) - ((a.underdogSeed ?? 0) - (a.favoriteSeed ?? 0))
    );
    const blowoutSorted2 = [...s16All].sort((a, b) => (b.spread ?? 0) - (a.spread ?? 0));
    const highScorerSorted2 = [...s16All].sort((a, b) => (b.overUnder ?? 0) - (a.overUnder ?? 0));
    return {
      upset: upsetSorted2.slice(0, counts2.upset).map((m, i) => ({ ...m, rank: i + 1 })),
      blowout: blowoutSorted2.slice(0, counts2.blowout).map((m, i) => ({ ...m, rank: i + 1 })),
      highScorer: highScorerSorted2.slice(0, counts2.high_scorer).map((m, i) => ({ ...m, rank: i + 1 }))
    };
  }
  if (roundId === "elite-8") {
    const counts2 = CANDIDATE_COUNTS["elite-8"];
    const e8All = [
      {
        matchupId: "e8-east-duke-uconn",
        teamA: "Duke Blue Devils",
        seedA: 1,
        teamB: "UConn Huskies",
        seedB: 2,
        region: "East",
        rank: 0,
        favoriteTeam: "Duke Blue Devils",
        favoriteSeed: 1,
        underdogTeam: "UConn Huskies",
        underdogSeed: 2,
        upsetProbability: 0.36,
        spread: 5.5,
        overUnder: 134.5,
        underdogMoneyline: 205,
        gameDate: "Mar 29",
        site: "Washington, DC",
        oddsSource: "draftkings",
        keyStat: "Duke -5.5 | O/U 134.5 \u2014 UConn is the 2-time defending champion, lowest total of the E8"
      },
      {
        matchupId: "e8-midwest-michigan-tennessee",
        teamA: "Michigan Wolverines",
        seedA: 1,
        teamB: "Tennessee Volunteers",
        seedB: 6,
        region: "Midwest",
        rank: 0,
        favoriteTeam: "Michigan Wolverines",
        favoriteSeed: 1,
        underdogTeam: "Tennessee Volunteers",
        underdogSeed: 6,
        upsetProbability: 0.3,
        spread: 7.5,
        overUnder: 146.5,
        underdogMoneyline: 265,
        gameDate: "Mar 29",
        site: "Chicago, IL",
        oddsSource: "draftkings",
        keyStat: "Michigan -7.5 | O/U 146.5 \u2014 Michigan beat Alabama, Tennessee beat Iowa State to get here"
      },
      {
        matchupId: "e8-west-arizona-purdue",
        teamA: "Arizona Wildcats",
        seedA: 1,
        teamB: "Purdue Boilermakers",
        seedB: 2,
        region: "West",
        rank: 0,
        favoriteTeam: "Arizona Wildcats",
        favoriteSeed: 1,
        underdogTeam: "Purdue Boilermakers",
        underdogSeed: 2,
        upsetProbability: 0.32,
        spread: 6.5,
        overUnder: 153.5,
        underdogMoneyline: 235,
        gameDate: "Mar 28",
        site: "San Jose, CA",
        oddsSource: "draftkings",
        keyStat: "Arizona -6.5 | O/U 153.5 \u2014 Arizona dropped 109 on Arkansas, highest-scoring E8 game on the board"
      },
      {
        matchupId: "e8-south-illinois-iowa",
        teamA: "Illinois Fighting Illini",
        seedA: 3,
        teamB: "Iowa Hawkeyes",
        seedB: 9,
        region: "South",
        rank: 0,
        favoriteTeam: "Illinois Fighting Illini",
        favoriteSeed: 3,
        underdogTeam: "Iowa Hawkeyes",
        underdogSeed: 9,
        upsetProbability: 0.33,
        spread: 6.5,
        overUnder: 137.5,
        underdogMoneyline: 235,
        gameDate: "Mar 28",
        site: "Houston, TX",
        oddsSource: "draftkings",
        keyStat: "Illinois -6.5 | O/U 137.5 \u2014 Iowa's Cinderella run continues, lowest-scoring total of the Elite 8"
      }
    ];
    const upsetSorted2 = [...e8All].sort((a, b) => (b.upsetProbability ?? 0) - (a.upsetProbability ?? 0));
    const blowoutSorted2 = [...e8All].sort((a, b) => (b.spread ?? 0) - (a.spread ?? 0));
    const highScorerSorted2 = [...e8All].sort((a, b) => (b.overUnder ?? 0) - (a.overUnder ?? 0));
    return {
      upset: upsetSorted2.slice(0, counts2.upset).map((m, i) => ({ ...m, rank: i + 1 })),
      blowout: blowoutSorted2.slice(0, counts2.blowout).map((m, i) => ({ ...m, rank: i + 1 })),
      highScorer: highScorerSorted2.slice(0, counts2.high_scorer).map((m, i) => ({ ...m, rank: i + 1 }))
    };
  }
  if (roundId === "final-four") {
    const counts2 = CANDIDATE_COUNTS["final-four"];
    const ffAll = [
      {
        matchupId: "ff-sf1-illinois-uconn",
        teamA: "Illinois Fighting Illini",
        seedA: 3,
        teamB: "UConn Huskies",
        seedB: 2,
        region: "South vs East",
        rank: 0,
        favoriteTeam: "Illinois Fighting Illini",
        favoriteSeed: 3,
        underdogTeam: "UConn Huskies",
        underdogSeed: 2,
        upsetProbability: 0.42,
        spread: 2.5,
        overUnder: 139.5,
        underdogMoneyline: 108,
        gameDate: "Apr 4",
        site: "Lucas Oil Stadium, Indianapolis, IN",
        oddsSource: "draftkings",
        keyStat: "Illinois -2.5 | O/U 139.5 \u2014 UConn seeks a 3rd title in 3 years; lowest-scoring FF game"
      },
      {
        matchupId: "ff-sf2-michigan-arizona",
        teamA: "Michigan Wolverines",
        seedA: 1,
        teamB: "Arizona Wildcats",
        seedB: 1,
        region: "Midwest vs West",
        rank: 0,
        favoriteTeam: "Michigan Wolverines",
        favoriteSeed: 1,
        underdogTeam: "Arizona Wildcats",
        underdogSeed: 1,
        upsetProbability: 0.47,
        spread: 1.5,
        overUnder: 157.5,
        underdogMoneyline: 102,
        gameDate: "Apr 4",
        site: "Lucas Oil Stadium, Indianapolis, IN",
        oddsSource: "draftkings",
        keyStat: "Michigan -1.5 | O/U 157.5 \u2014 Two #1 seeds, essentially a pick 'em; highest O/U of the Final Four"
      }
    ];
    const upsetSorted2 = [...ffAll].sort((a, b) => (b.upsetProbability ?? 0) - (a.upsetProbability ?? 0));
    const blowoutSorted2 = [...ffAll].sort((a, b) => (b.spread ?? 0) - (a.spread ?? 0));
    const highScorerSorted2 = [...ffAll].sort((a, b) => (b.overUnder ?? 0) - (a.overUnder ?? 0));
    return {
      upset: upsetSorted2.slice(0, counts2.upset).map((m, i) => ({ ...m, rank: i + 1 })),
      blowout: blowoutSorted2.slice(0, counts2.blowout).map((m, i) => ({ ...m, rank: i + 1 })),
      highScorer: highScorerSorted2.slice(0, counts2.high_scorer).map((m, i) => ({ ...m, rank: i + 1 }))
    };
  }
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
        overUnder: 140 - seedDiff,
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
    const res2 = await fetch(url);
    if (!res2.ok) {
      console.error(`[odds-api] HTTP ${res2.status}:`, await res2.text());
      return null;
    }
    const games = await res2.json();
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
    const tournamentMatchups = matchups.filter((m) => m.seedA > 0 || m.seedB > 0);
    let upsetSorted = [...tournamentMatchups].filter((m) => m.underdogMoneyline !== void 0 && m.underdogMoneyline > 120 && m.underdogMoneyline <= 900).sort((a, b) => (b.underdogMoneyline ?? 0) - (a.underdogMoneyline ?? 0));
    if (upsetSorted.length === 0 && tournamentMatchups.length > 0) {
      upsetSorted = [...tournamentMatchups].sort(
        (a, b) => (b.underdogMoneyline ?? 0) - (a.underdogMoneyline ?? 0) || (b.seedB ?? 0) - (a.seedB ?? 0)
      );
    }
    const blowoutSorted = [...tournamentMatchups].filter((m) => m.spread !== void 0).sort((a, b) => (b.spread ?? 0) - (a.spread ?? 0));
    const highScorerSorted = [...tournamentMatchups].filter((m) => m.overUnder !== void 0).sort((a, b) => (b.overUnder ?? 0) - (a.overUnder ?? 0));
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
  const toRow = (m, pickType) => ({
    round_id: roundId,
    pick_type: pickType,
    matchup_id: m.matchupId,
    team_a: m.teamA,
    team_b: m.teamB,
    seed_a: m.seedA,
    seed_b: m.seedB,
    rank: m.rank,
    // Store the complete matchup so we can reconstruct it from the DB after round lock
    odds_data: {
      spread: m.spread,
      overUnder: m.overUnder,
      underdogMoneyline: m.underdogMoneyline,
      favoriteTeam: m.favoriteTeam,
      underdogTeam: m.underdogTeam,
      favoriteSeed: m.favoriteSeed,
      underdogSeed: m.underdogSeed,
      region: m.region,
      gameDate: m.gameDate,
      site: m.site,
      keyStat: m.keyStat,
      source: m.oddsSource
    },
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  const rows = [
    ...upset.map((m) => toRow(m, "upset")),
    ...blowout.map((m) => toRow(m, "blowout")),
    ...highScorer.map((m) => toRow(m, "high_scorer"))
  ];
  if (rows.length === 0) return;
  const lockDatesForPersist = {
    "first-four": "2026-03-17T12:00:00-05:00",
    "round-64": "2026-03-19T11:00:00-05:00",
    "round-32": "2026-03-21T12:00:00-05:00",
    "sweet-16": "2026-03-26T18:00:00-05:00",
    // 6pm CDT Mar 26, first tip 6:10pm CDT
    "elite-8": "2026-03-28T17:00:00-05:00",
    "final-four": "2026-04-04T18:00:00-05:00"
  };
  const lockAt = lockDatesForPersist[roundId];
  const roundIsLocked = lockAt ? /* @__PURE__ */ new Date() >= new Date(lockAt) : false;
  if (roundIsLocked) {
    const { data: existing } = await supabase.from("mm_round_matchups").select("matchup_id").eq("round_id", roundId).limit(1);
    if (existing && existing.length > 0) {
      console.log(`[mm-special] ${roundId} is locked \u2014 skipping persist to protect stored matchups`);
      return;
    }
  }
  await supabase.from("mm_round_matchups").delete().eq("round_id", roundId);
  await supabase.from("mm_round_matchups").insert(rows);
}
function registerMMSpecialRoutes(app2) {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  app2.get("/api/mm/round-matchups/:roundId", async (req, res2) => {
    const roundId = req.params.roundId;
    const lockDates = {
      "first-four": "2026-03-17T12:00:00-05:00",
      "round-64": "2026-03-19T11:00:00-05:00",
      "round-32": "2026-03-21T12:00:00-05:00",
      "sweet-16": "2026-03-26T18:00:00-05:00",
      // 6pm CDT Mar 26, first tip 6:10pm CDT
      "elite-8": "2026-03-28T17:00:00-05:00",
      "final-four": "2026-04-04T18:00:00-05:00"
    };
    const lockDate = lockDates[roundId] ?? "2026-03-19T11:00:00-05:00";
    const isLocked = /* @__PURE__ */ new Date() >= new Date(lockDate);
    const cacheKey = `round-matchups-${roundId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res2.json(cached);
    }
    const supabase = createClient2(supabaseUrl, supabaseKey);
    if (isLocked) {
      const { data: rows } = await supabase.from("mm_round_matchups").select("*").eq("round_id", roundId).order("rank", { ascending: true });
      if (rows && rows.length > 0) {
        const rowToMatchup = (r) => ({
          matchupId: r.matchup_id,
          teamA: r.team_a,
          teamB: r.team_b,
          seedA: r.seed_a ?? 0,
          seedB: r.seed_b ?? 0,
          rank: r.rank,
          favoriteTeam: r.odds_data?.favoriteTeam ?? r.team_a,
          underdogTeam: r.odds_data?.underdogTeam ?? r.team_b,
          favoriteSeed: r.odds_data?.favoriteSeed,
          underdogSeed: r.odds_data?.underdogSeed,
          spread: r.odds_data?.spread,
          overUnder: r.odds_data?.overUnder,
          underdogMoneyline: r.odds_data?.underdogMoneyline,
          region: r.odds_data?.region ?? "\u2014",
          gameDate: r.odds_data?.gameDate,
          site: r.odds_data?.site,
          keyStat: r.odds_data?.keyStat,
          oddsSource: r.odds_data?.source ?? "live"
        });
        const upset = rows.filter((r) => r.pick_type === "upset").map(rowToMatchup);
        const blowout = rows.filter((r) => r.pick_type === "blowout").map(rowToMatchup);
        const highScorer = rows.filter((r) => r.pick_type === "high_scorer").map(rowToMatchup);
        console.log(`[mm-special] ${roundId} (locked) served from DB: upset=${upset.length} blowout=${blowout.length} hs=${highScorer.length}`);
        const response2 = { roundId, upset, blowout, highScorer, isLocked: true, lockedAt: lockDate, oddsSource: "persisted" };
        setCache(cacheKey, response2);
        return res2.json(response2);
      }
    }
    let ranked = await buildOddsBasedMatchups(roundId);
    let source = "live";
    if (!ranked) {
      ranked = buildSeedBasedMatchups(roundId);
      source = "seed-based";
    }
    if (roundId === "round-64") {
      const counts = CANDIDATE_COUNTS["round-64"];
      const curatedUnderdogs = new Set(
        CURATED_R64_UPSETS.map((m) => (m.underdogTeam ?? m.teamB).toLowerCase())
      );
      const autoFill = ranked.upset.filter(
        (m) => !curatedUnderdogs.has((m.underdogTeam ?? m.teamB).toLowerCase())
      );
      const combined = [...CURATED_R64_UPSETS, ...autoFill].slice(0, counts.upset).map((m, i) => ({ ...m, rank: i + 1 }));
      ranked = { ...ranked, upset: combined };
    }
    console.log(`[mm-special] ${roundId} matchups: ${source}, upset=${ranked.upset.length} blowout=${ranked.blowout.length} hs=${ranked.highScorer.length}`);
    persistRankedMatchups(supabase, roundId, ranked.upset, ranked.blowout, ranked.highScorer).catch((e) => console.error("[mm-special] persist failed:", e));
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
    return res2.json(response);
  });
  function generateReferralCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }
  app2.get("/api/mm/my-referral-code", async (req, res2) => {
    const { userId, matchupId, roundId } = req.query;
    if (!userId || !matchupId || !roundId) return res2.status(400).json({ error: "Missing params" });
    const supabase = createClient2(
      process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    );
    const { data: profile, error } = await supabase.from("profiles").select("referral_code").eq("id", userId).single();
    if (error) return res2.status(500).json({ error: error.message });
    let code = profile?.referral_code;
    if (!code) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateReferralCode();
        const { error: updateErr } = await supabase.from("profiles").update({ referral_code: candidate }).eq("id", userId);
        if (!updateErr) {
          code = candidate;
          break;
        }
      }
      if (!code) return res2.status(500).json({ error: "Could not generate referral code" });
    }
    const rawDomain = (process.env.EXPO_PUBLIC_DOMAIN || "localhost:8081").replace(/:5000$/, "");
    const shareUrl = `https://${rawDomain}/mm-pick/${encodeURIComponent(matchupId)}?ref=${code}&round_id=${encodeURIComponent(roundId)}`;
    return res2.json({ referralCode: code, shareUrl });
  });
  app2.get("/api/mm/referral-info", async (req, res2) => {
    const { code } = req.query;
    if (!code) return res2.status(400).json({ error: "Missing code" });
    const supabase = createClient2(
      process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    );
    const { data, error } = await supabase.from("profiles").select("username, display_name").eq("referral_code", code.toUpperCase()).single();
    if (error || !data) return res2.json({ found: false });
    const name = data.display_name || `@${data.username}`;
    return res2.json({ found: true, name });
  });
  app2.post("/api/mm/unlock-referral-reward", async (req, res2) => {
    res2.json({ ok: true });
    const { userId } = req.body ?? {};
    if (!userId) return;
    const nextRound = getActivePicksRoundId();
    if (!nextRound) return;
    try {
      const supabase = createClient2(
        process.env.EXPO_PUBLIC_SUPABASE_URL,
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      );
      const { data, error } = await supabase.rpc("unlock_referral_reward", {
        referred_user_id: userId,
        reward_round: nextRound
      });
      if (error) console.warn("[mm-referral] unlock_referral_reward error:", error.message);
      else if (data?.reward_granted) console.log(`[mm-referral] Reward unlocked for referrer of ${userId.slice(0, 8)}\u2026 \u2192 round: ${nextRound}`);
    } catch (e) {
      console.warn("[mm-referral] Unexpected error:", e);
    }
  });
  const verifiedBoostSessions = /* @__PURE__ */ new Map();
  const ELITE8_BOOST_LOCK = /* @__PURE__ */ new Date("2026-03-28T17:00:00-05:00");
  const ELITE8_PRICE_ID = "price_1TENDw3fMFuGw9AQgaji65TN";
  app2.post("/api/mm/boost-checkout", async (req, res2) => {
    const { userId } = req.body ?? {};
    if (!userId) {
      res2.status(400).json({ ok: false, error: "userId required" });
      return;
    }
    try {
      const supabase = createClient2(
        process.env.EXPO_PUBLIC_SUPABASE_URL,
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      );
      if (/* @__PURE__ */ new Date() >= ELITE8_BOOST_LOCK) {
        res2.json({ ok: false, error: "Elite 8 boost is no longer available", code: "lock_passed" });
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("referral_reward_round, paid_2x_round").eq("id", userId).single();
      if (profile?.referral_reward_round === "elite-8" || profile?.paid_2x_round === "elite-8") {
        res2.json({ ok: false, error: "You already have 2X active for the Elite 8", code: "already_boosted" });
        return;
      }
      const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
      const appDomain = domains[0]?.trim() || process.env.EXPO_PUBLIC_APP_URL || "https://www.swayger.app";
      const baseUrl = appDomain.startsWith("http") ? appDomain : `https://${appDomain}`;
      const successUrl = `${baseUrl}/api/mm/boost-success?session_id={CHECKOUT_SESSION_ID}&user_id=${encodeURIComponent(userId)}`;
      const cancelUrl = `${baseUrl}/march-madness/picks`;
      const { getUncachableStripeClient: getUncachableStripeClient2 } = await Promise.resolve().then(() => (init_stripeClient(), stripeClient_exports));
      const stripe = await getUncachableStripeClient2();
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{ price: ELITE8_PRICE_ID, quantity: 1 }],
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId,
        metadata: { type: "elite8_boost", userId, round: "elite-8" }
      });
      console.log(`[mm-boost] Checkout session created for ${userId.slice(0, 8)}\u2026 \u2192 ${session.id}`);
      res2.json({ ok: true, checkoutUrl: session.url });
    } catch (err) {
      console.error("[mm-boost] checkout error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.get("/api/mm/boost-success", async (req, res2) => {
    const { session_id, user_id } = req.query;
    const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
    const appDomain = domains[0]?.trim() || "www.swayger.app";
    const baseUrl = appDomain.startsWith("http") ? appDomain : `https://${appDomain}`;
    if (!session_id || !user_id) {
      return res2.redirect(`${baseUrl}/march-madness/picks`);
    }
    try {
      const { getUncachableStripeClient: getUncachableStripeClient2 } = await Promise.resolve().then(() => (init_stripeClient(), stripeClient_exports));
      const stripe = await getUncachableStripeClient2();
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.payment_status !== "paid" || session.metadata?.type !== "elite8_boost" || session.metadata?.userId !== user_id) {
        console.warn(`[mm-boost] Session ${session_id} invalid \u2014 payment_status=${session.payment_status}`);
        return res2.redirect(`${baseUrl}/march-madness/picks`);
      }
      verifiedBoostSessions.set(session_id, {
        userId: user_id,
        expiresAt: Date.now() + 15 * 60 * 1e3
        // 15-min TTL
      });
      console.log(`[mm-boost] Payment verified for ${user_id.slice(0, 8)}\u2026 \u2014 awaiting claim`);
      const returnUrl = `${baseUrl}/march-madness/picks?boostSession=${encodeURIComponent(session_id)}`;
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Boost Activated \u2014 Swayger</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111827; color: #F9FAFB; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; text-align: center; }
    .card { background: #1F2937; border-radius: 16px; padding: 40px 32px; max-width: 400px; width: 100%; border: 1px solid #374151; }
    .icon { font-size: 64px; margin-bottom: 16px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; color: #F5A623; }
    p { color: #9CA3AF; font-size: 15px; line-height: 1.5; margin-bottom: 24px; }
    .badge { background: #F5A62322; border: 1px solid #F5A62344; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; }
    .badge-text { color: #F5A623; font-size: 15px; font-weight: 600; }
    a.btn { display: block; background: #F5A623; color: #111827; font-weight: 700; font-size: 16px; padding: 14px; border-radius: 10px; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">\u{1F525}</div>
    <h1>2X Boost Activated!</h1>
    <p>Your Elite 8 picks now score double. Head back to the app to make your special picks before games tip off.</p>
    <div class="badge">
      <div class="badge-text">Elite 8 \xB7 2X Points Active</div>
    </div>
    <a href="${returnUrl}" class="btn">Back to Picks</a>
  </div>
  <script>
    setTimeout(function() {
      window.location.href = '${returnUrl}';
    }, 4000);
  </script>
</body>
</html>`;
      res2.setHeader("Content-Type", "text/html; charset=utf-8");
      res2.status(200).send(html);
    } catch (err) {
      console.error("[mm-boost] Success handler error:", err);
      res2.redirect(`${baseUrl}/march-madness/picks`);
    }
  });
  app2.post("/api/mm/boost-claim", async (req, res2) => {
    const { session_id } = req.body ?? {};
    const authHeader = req.headers.authorization ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!session_id || !jwt) {
      res2.status(400).json({ ok: false, error: "session_id and Authorization required" });
      return;
    }
    const now = Date.now();
    verifiedBoostSessions.forEach((v, k) => {
      if (v.expiresAt < now) verifiedBoostSessions.delete(k);
    });
    const entry = verifiedBoostSessions.get(session_id);
    if (!entry || entry.expiresAt < now) {
      res2.status(400).json({ ok: false, error: "Session not found or expired. Contact support." });
      return;
    }
    try {
      const supabase = createClient2(
        process.env.EXPO_PUBLIC_SUPABASE_URL,
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${jwt}` } } }
      );
      const { error } = await supabase.from("profiles").update({ paid_2x_round: "elite-8" }).eq("id", entry.userId).is("paid_2x_round", null);
      if (error) {
        console.error("[mm-boost] boost-claim DB error:", error.message);
        res2.status(500).json({ ok: false, error: "Failed to activate boost. Please try again." });
        return;
      }
      verifiedBoostSessions.delete(session_id);
      console.log(`[mm-boost] Boost claimed and granted to ${entry.userId.slice(0, 8)}\u2026`);
      res2.json({ ok: true, message: "2X boost activated for Elite 8" });
    } catch (err) {
      console.error("[mm-boost] boost-claim error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/api/mm/boost-admin-grant", async (req, res2) => {
    const token = req.headers["x-admin-token"];
    const { userId, userJwt } = req.body ?? {};
    const adminToken = process.env.MM_ADMIN_TOKEN ?? "MySwayger24!!";
    if (!token || token !== adminToken) {
      res2.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    if (!userId || !userJwt) {
      res2.status(400).json({ ok: false, error: "userId and userJwt required" });
      return;
    }
    try {
      const supabase = createClient2(
        process.env.EXPO_PUBLIC_SUPABASE_URL,
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${userJwt}` } } }
      );
      const { error } = await supabase.from("profiles").update({ paid_2x_round: "elite-8" }).eq("id", userId);
      if (error) {
        res2.status(500).json({ ok: false, error: error.message });
        return;
      }
      console.log(`[mm-boost] Admin granted boost to ${userId.slice(0, 8)}\u2026`);
      res2.json({ ok: true });
    } catch (err) {
      console.error("[mm-boost] admin-grant error:", err);
      res2.status(500).json({ ok: false, error: "Server error" });
    }
  });
  app2.post("/api/mm/log-share", async (req, res2) => {
    res2.json({ ok: true });
    const { user_id, pick_type, round_id, matchup_id } = req.body ?? {};
    if (!user_id || !pick_type || !round_id || !matchup_id) return;
    try {
      const supabase = createClient2(
        process.env.EXPO_PUBLIC_SUPABASE_URL,
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      );
      const { error } = await supabase.from("mm_share_events").insert({
        user_id,
        pick_type,
        round_id,
        matchup_id,
        shared_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (error) {
        console.warn("[mm-share] Insert failed (run docs/migrations/mm_share_events.sql):", error.message);
      } else {
        console.log(`[mm-share] Logged: ${pick_type} / ${round_id} / ${user_id.slice(0, 8)}\u2026`);
      }
    } catch (e) {
      console.warn("[mm-share] Unexpected error:", e);
    }
  });
  app2.get("/feedback", (_req, res2) => {
    const filePath = path2.join(process.cwd(), "server", "templates", "mm-feedback.html");
    if (!fs2.existsSync(filePath)) {
      res2.status(404).send("Feedback page not found");
      return;
    }
    res2.setHeader("Content-Type", "text/html; charset=utf-8");
    res2.setHeader("Cache-Control", "no-cache");
    res2.send(fs2.readFileSync(filePath, "utf8"));
  });
  app2.post("/api/mm/feedback", async (req, res2) => {
    const { user_id, q1_ux, q2_next_use, q3_friction, q4_priority, open_text } = req.body ?? {};
    const supabase = createClient2(
      process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    );
    const { error } = await supabase.from("mm_feedback").insert({
      user_id: user_id ?? null,
      q1_ux: q1_ux ?? null,
      q2_next_use: q2_next_use ?? null,
      q3_friction: q3_friction ?? null,
      q4_priority: q4_priority ?? null,
      open_text: open_text ? String(open_text).slice(0, 280) : null
    });
    if (error) {
      console.error("[mm-feedback] insert error:", error.message);
      res2.status(500).json({ ok: false, error: "Could not save feedback" });
      return;
    }
    console.log(`[mm-feedback] Saved: uid=${user_id ?? "anon"} q1=${q1_ux} q2=${q2_next_use} q3=${q3_friction} q4=${q4_priority}`);
    res2.json({ ok: true });
  });
}

// server/routes-nba.ts
init_email();
import { createClient as createClient3 } from "@supabase/supabase-js";
function getSupabase2() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  return createClient3(url, key);
}
function requireAdmin(req, res2) {
  const token = req.headers["x-admin-token"] || req.query["token"];
  if (token !== process.env.MM_ADMIN_TOKEN) {
    res2.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}
var ROUND_POINTS = {
  round1: 100,
  round2: 300,
  conf_finals: 1e3,
  finals: 3e3
};
var GAMES_BONUS_POINTS = {
  round1: 50,
  round2: 75,
  conf_finals: 150,
  finals: 250
};
var gamesCache = null;
var CACHE_TTL_MS2 = 30 * 60 * 1e3;
async function fetchOddsGames() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return [];
  const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
  const res2 = await fetch(url);
  if (!res2.ok) {
    console.error("[nba] Odds API error:", res2.status);
    return [];
  }
  const events = await res2.json();
  return events.map((e) => {
    const fanduel = e.bookmakers.find((b) => b.key === "fanduel") ?? e.bookmakers[0];
    const h2hMkt = fanduel?.markets.find((m) => m.key === "h2h");
    const spreadMkt = fanduel?.markets.find((m) => m.key === "spreads");
    const totalsMkt = fanduel?.markets.find((m) => m.key === "totals");
    const homeH2H = h2hMkt?.outcomes.find((o) => o.name === e.home_team)?.price ?? null;
    const awayH2H = h2hMkt?.outcomes.find((o) => o.name === e.away_team)?.price ?? null;
    const homeSpread = spreadMkt?.outcomes.find((o) => o.name === e.home_team);
    const awaySpread = spreadMkt?.outcomes.find((o) => o.name === e.away_team);
    const overOutcome = totalsMkt?.outcomes.find((o) => o.name === "Over");
    let favTeam = null;
    if (homeH2H !== null && awayH2H !== null) {
      favTeam = homeH2H < awayH2H ? e.home_team : e.away_team;
    }
    return {
      id: e.id,
      home_team: e.home_team,
      away_team: e.away_team,
      commence_time: e.commence_time,
      h2h_home: homeH2H,
      h2h_away: awayH2H,
      spread_home: homeSpread?.point ?? null,
      spread_away: awaySpread?.point ?? null,
      spread_home_odds: homeSpread?.price ?? null,
      spread_away_odds: awaySpread?.price ?? null,
      total: overOutcome?.point ?? null,
      favorite_team: favTeam
    };
  });
}
async function recomputeScores(supabase) {
  const { data: series } = await supabase.from("nba_playoff_series").select("id, round, winner, games").eq("season", "2026").not("winner", "is", null);
  if (!series || series.length === 0) return;
  const { data: allPicks } = await supabase.from("nba_playoff_bracket_picks").select("user_id, series_id, picked_team, games_guess").eq("season", "2026");
  if (!allPicks || allPicks.length === 0) return;
  const seriesMap = /* @__PURE__ */ new Map();
  for (const s of series) {
    if (s.winner && s.games) {
      seriesMap.set(s.id, { round: s.round, winner: s.winner, games: s.games });
    }
  }
  const userScores = /* @__PURE__ */ new Map();
  for (const pick of allPicks) {
    const resolved = seriesMap.get(pick.series_id);
    if (!resolved) continue;
    const { round, winner, games } = resolved;
    const isCorrect = pick.picked_team === winner;
    const isGamesCorrect = pick.games_guess !== null && pick.games_guess === games;
    if (!userScores.has(pick.user_id)) {
      userScores.set(pick.user_id, {
        total_pts: 0,
        round1_pts: 0,
        round2_pts: 0,
        conf_finals_pts: 0,
        finals_pts: 0,
        correct_picks: 0,
        correct_games: 0
      });
    }
    const score = userScores.get(pick.user_id);
    const roundPts = isCorrect ? ROUND_POINTS[round] ?? 0 : 0;
    const bonusPts = isCorrect && isGamesCorrect ? GAMES_BONUS_POINTS[round] ?? 0 : 0;
    const earned = roundPts + bonusPts;
    score.total_pts += earned;
    score.correct_picks += isCorrect ? 1 : 0;
    score.correct_games += isCorrect && isGamesCorrect ? 1 : 0;
    if (round === "round1") score.round1_pts += earned;
    else if (round === "round2") score.round2_pts += earned;
    else if (round === "conf_finals") score.conf_finals_pts += earned;
    else if (round === "finals") score.finals_pts += earned;
  }
  const upsertRows = Array.from(userScores.entries()).map(([userId, s]) => ({
    user_id: userId,
    season: "2026",
    ...s,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }));
  if (upsertRows.length > 0) {
    await supabase.from("nba_playoff_scores").delete().eq("season", "2026");
    const { error: upsertErr } = await supabase.from("nba_playoff_scores").insert(upsertRows);
    if (upsertErr) {
      console.error("[nba/recompute] upsert error:", upsertErr);
    } else {
      console.log(`[nba/recompute] scored ${upsertRows.length} users`);
    }
  }
}
function registerNBARoutes(app2) {
  app2.get("/api/nba/games", async (_req, res2) => {
    try {
      const now = Date.now();
      if (gamesCache && now - gamesCache.fetchedAt < CACHE_TTL_MS2) {
        res2.json(gamesCache.data);
        return;
      }
      const games = await fetchOddsGames();
      gamesCache = { data: games, fetchedAt: now };
      res2.json(games);
    } catch (err) {
      console.error("[nba/games]", err);
      res2.status(500).json({ error: "Failed to fetch games" });
    }
  });
  app2.get("/api/nba/series", async (_req, res2) => {
    try {
      const supabase = getSupabase2();
      const { data, error } = await supabase.from("nba_playoff_series").select("*").eq("season", "2026").order("sort_order");
      if (error) throw error;
      res2.json(data ?? []);
    } catch (err) {
      console.error("[nba/series]", err);
      res2.status(500).json({ error: "Failed to fetch series" });
    }
  });
  app2.get("/api/nba/leaderboard", async (_req, res2) => {
    try {
      const supabase = getSupabase2();
      const { data: scores, error } = await supabase.from("nba_playoff_scores").select("*").eq("season", "2026").order("total_pts", { ascending: false }).order("correct_picks", { ascending: false });
      if (error) throw error;
      if (!scores || scores.length === 0) {
        res2.json([]);
        return;
      }
      const userIds = scores.map((s) => s.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name").in("id", userIds);
      const profileMap = /* @__PURE__ */ new Map();
      for (const p of profiles ?? []) {
        profileMap.set(p.id, { username: p.username, display_name: p.display_name });
      }
      const result = scores.map((s) => ({
        ...s,
        username: profileMap.get(s.user_id)?.username ?? null,
        display_name: profileMap.get(s.user_id)?.display_name ?? null
      }));
      res2.json(result);
    } catch (err) {
      console.error("[nba/leaderboard]", err);
      res2.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });
  app2.post("/api/nba/admin/series", async (req, res2) => {
    if (!requireAdmin(req, res2)) return;
    try {
      const supabase = getSupabase2();
      const body = req.body;
      if (!body.id || !body.round || !body.team1 || !body.team2) {
        res2.status(400).json({ ok: false, error: "id, round, team1, team2 required" });
        return;
      }
      const { error } = await supabase.from("nba_playoff_series").upsert({
        ...body,
        season: "2026",
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }, { onConflict: "id" });
      if (error) throw error;
      res2.json({ ok: true });
    } catch (err) {
      const msg = err && typeof err === "object" && "message" in err ? err.message : String(err);
      console.error("[nba/admin/series]", err);
      res2.status(500).json({ ok: false, error: msg });
    }
  });
  app2.patch("/api/nba/admin/series/:id/resolve", async (req, res2) => {
    if (!requireAdmin(req, res2)) return;
    try {
      const supabase = getSupabase2();
      const { id } = req.params;
      const { winner, games } = req.body;
      if (!winner || !games) {
        res2.status(400).json({ ok: false, error: "winner and games (4-7) required" });
        return;
      }
      if (games < 4 || games > 7) {
        res2.status(400).json({ ok: false, error: "games must be 4\u20137" });
        return;
      }
      const { data: updateData, error: updateError } = await supabase.from("nba_playoff_series").update({ winner, games, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("season", "2026").select();
      if (updateError) throw updateError;
      if (!updateData || updateData.length === 0) {
        res2.status(403).json({ ok: false, error: `Series '${id}' not found or write blocked by DB policy. Run the RLS fix SQL in Supabase.` });
        return;
      }
      await recomputeScores(supabase);
      res2.json({ ok: true, message: `Resolved: ${winner} in ${games} games. Scores updated.` });
    } catch (err) {
      console.error("[nba/admin/resolve]", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.get("/api/nba/admin/scores/recompute", async (req, res2) => {
    if (!requireAdmin(req, res2)) return;
    try {
      const supabase = getSupabase2();
      await recomputeScores(supabase);
      res2.json({ ok: true, message: "Scores recomputed" });
    } catch (err) {
      console.error("[nba/admin/recompute]", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/nba/admin/reset-to-tbd", async (req, res2) => {
    if (!requireAdmin(req, res2)) return;
    try {
      const supabase = getSupabase2();
      const { error, count } = await supabase.from("nba_playoff_series").update({
        team1: "TBD",
        team2: "TBD",
        winner: null,
        games: null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("season", "2026").eq("round", "round1");
      if (error) throw error;
      console.log(`[nba/reset-to-tbd] Reset ${count ?? "?"} series to TBD`);
      res2.json({ ok: true, message: `All R1 series reset to TBD` });
    } catch (err) {
      console.error("[nba/reset-to-tbd]", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/nba/admin/seed-known-r1", async (req, res2) => {
    if (!requireAdmin(req, res2)) return;
    try {
      const supabase = getSupabase2();
      const canonicalIds = [
        "r1-east-detroit-pistons-vs-orlando-magic",
        "r1-east-boston-celtics-vs-philadelphia-76ers",
        "r1-east-new-york-knicks-vs-atlanta-hawks",
        "r1-east-cleveland-cavaliers-vs-toronto-raptors",
        "r1-west-oklahoma-city-thunder-vs-phoenix-suns",
        "r1-west-san-antonio-spurs-vs-portland-trail-blazers",
        "r1-west-denver-nuggets-vs-minnesota-timberwolves",
        "r1-west-los-angeles-lakers-vs-houston-rockets"
      ];
      const { error: delErr } = await supabase.from("nba_playoff_series").delete().eq("round", "round1").not("id", "in", `(${canonicalIds.map((id) => `"${id}"`).join(",")})`);
      if (delErr) console.warn("[nba/seed-known-r1] cleanup warn:", delErr.message);
      const knownRows = [
        // ── East ──────────────────────────────────────────────────────────────
        // 1 seed: Detroit Pistons vs 8 seed: Orlando Magic
        { id: "r1-east-detroit-pistons-vs-orlando-magic", team1: "Detroit Pistons", team2: "Orlando Magic", conference: "east", seed1: 1, seed2: 8, starts_at: "2026-04-19T13:00:00-05:00", sort_order: 1 },
        // 2 seed: Boston Celtics vs 7 seed: Philadelphia 76ers
        { id: "r1-east-boston-celtics-vs-philadelphia-76ers", team1: "Boston Celtics", team2: "Philadelphia 76ers", conference: "east", seed1: 2, seed2: 7, starts_at: "2026-04-19T20:10:00-05:00", sort_order: 2 },
        // 3 seed: New York Knicks vs 6 seed: Atlanta Hawks
        { id: "r1-east-new-york-knicks-vs-atlanta-hawks", team1: "New York Knicks", team2: "Atlanta Hawks", conference: "east", seed1: 3, seed2: 6, starts_at: "2026-04-18T17:10:00-05:00", sort_order: 3 },
        // 4 seed: Cleveland Cavaliers vs 5 seed: Toronto Raptors
        { id: "r1-east-cleveland-cavaliers-vs-toronto-raptors", team1: "Cleveland Cavaliers", team2: "Toronto Raptors", conference: "east", seed1: 4, seed2: 5, starts_at: "2026-04-18T12:10:00-05:00", sort_order: 4 },
        // ── West ──────────────────────────────────────────────────────────────
        // 1 seed: OKC Thunder vs 8 seed: Phoenix Suns
        { id: "r1-west-oklahoma-city-thunder-vs-phoenix-suns", team1: "Oklahoma City Thunder", team2: "Phoenix Suns", conference: "west", seed1: 1, seed2: 8, starts_at: "2026-04-19T15:30:00-05:00", sort_order: 101 },
        // 2 seed: San Antonio Spurs vs 7 seed: Portland Trail Blazers
        { id: "r1-west-san-antonio-spurs-vs-portland-trail-blazers", team1: "San Antonio Spurs", team2: "Portland Trail Blazers", conference: "west", seed1: 2, seed2: 7, starts_at: "2026-04-19T20:10:00-05:00", sort_order: 102 },
        // 3 seed: Denver Nuggets vs 6 seed: Minnesota Timberwolves
        { id: "r1-west-denver-nuggets-vs-minnesota-timberwolves", team1: "Denver Nuggets", team2: "Minnesota Timberwolves", conference: "west", seed1: 3, seed2: 6, starts_at: "2026-04-18T14:40:00-05:00", sort_order: 103 },
        // 4 seed: Los Angeles Lakers vs 5 seed: Houston Rockets
        { id: "r1-west-los-angeles-lakers-vs-houston-rockets", team1: "Los Angeles Lakers", team2: "Houston Rockets", conference: "west", seed1: 4, seed2: 5, starts_at: "2026-04-18T19:40:00-05:00", sort_order: 104 }
      ];
      const { error } = await supabase.from("nba_playoff_series").upsert(
        knownRows.map((row) => ({
          ...row,
          season: "2026",
          round: "round1",
          winner: null,
          games: null,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        })),
        { onConflict: "id" }
      );
      if (error) throw error;
      res2.json({ ok: true, seeded: knownRows.length });
    } catch (err) {
      console.error("[nba/seed-known-r1]", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/nba/admin/seed-from-odds", async (req, res2) => {
    if (!requireAdmin(req, res2)) return;
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      res2.status(400).json({ ok: false, error: "ODDS_API_KEY not configured" });
      return;
    }
    const EAST_TEAMS = /* @__PURE__ */ new Set([
      "Boston Celtics",
      "Brooklyn Nets",
      "New York Knicks",
      "Philadelphia 76ers",
      "Toronto Raptors",
      "Chicago Bulls",
      "Cleveland Cavaliers",
      "Detroit Pistons",
      "Indiana Pacers",
      "Milwaukee Bucks",
      "Atlanta Hawks",
      "Charlotte Hornets",
      "Miami Heat",
      "Orlando Magic",
      "Washington Wizards"
    ]);
    function slugify(name) {
      return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    }
    try {
      const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american`;
      const oddsRes = await fetch(url);
      if (!oddsRes.ok) {
        const body = await oddsRes.text();
        res2.status(502).json({ ok: false, error: `Odds API error ${oddsRes.status}`, detail: body });
        return;
      }
      const events = await oddsRes.json();
      const seen = /* @__PURE__ */ new Map();
      for (const ev of events) {
        const fanduel = ev.bookmakers.find((b) => b.key === "fanduel") ?? ev.bookmakers[0];
        const h2h = fanduel?.markets.find((m) => m.key === "h2h");
        const homeOdds = h2h?.outcomes.find((o) => o.name === ev.home_team)?.price ?? null;
        const awayOdds = h2h?.outcomes.find((o) => o.name === ev.away_team)?.price ?? null;
        const teams = [ev.home_team, ev.away_team].sort();
        const key = teams.join("|");
        if (!seen.has(key)) {
          seen.set(key, {
            team1: teams[0],
            team2: teams[1],
            team1Odds: teams[0] === ev.home_team ? homeOdds : awayOdds,
            team2Odds: teams[1] === ev.home_team ? homeOdds : awayOdds,
            startsAt: ev.commence_time
          });
        } else {
          const existing = seen.get(key);
          if (ev.commence_time < existing.startsAt) {
            existing.startsAt = ev.commence_time;
          }
        }
      }
      if (seen.size === 0) {
        res2.json({ ok: true, message: "No NBA games found from Odds API", upserted: 0 });
        return;
      }
      const supabase = getSupabase2();
      const rows = [];
      let eastOrder = 0;
      let westOrder = 100;
      for (const matchup of seen.values()) {
        const { team1, team2, team1Odds, team2Odds, startsAt } = matchup;
        const isEast1 = EAST_TEAMS.has(team1);
        const isEast2 = EAST_TEAMS.has(team2);
        const conf = isEast1 || isEast2 ? "east" : "west";
        let orderedTeam1 = team1;
        let orderedTeam2 = team2;
        let seed1 = null;
        let seed2 = null;
        if (team1Odds !== null && team2Odds !== null) {
          if (team2Odds < team1Odds) {
            orderedTeam1 = team2;
            orderedTeam2 = team1;
          }
        }
        const seriesId = `r1-${conf}-${slugify(orderedTeam1)}-vs-${slugify(orderedTeam2)}`;
        const sortOrder = conf === "east" ? eastOrder++ : westOrder++;
        rows.push({
          id: seriesId,
          season: "2026",
          round: "round1",
          conference: conf,
          seed1,
          seed2,
          team1: orderedTeam1,
          team2: orderedTeam2,
          starts_at: startsAt,
          sort_order: sortOrder,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      const { error } = await supabase.from("nba_playoff_series").upsert(rows, { onConflict: "id" });
      if (error) throw error;
      console.log(`[nba/seed-from-odds] Upserted ${rows.length} series`);
      res2.json({
        ok: true,
        upserted: rows.length,
        series: rows.map((r) => ({ id: r.id, team1: r.team1, team2: r.team2, conf: r.conference, starts_at: r.starts_at }))
      });
    } catch (err) {
      console.error("[nba/seed-from-odds]", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/nba/admin/test-launch-email", async (req, res2) => {
    if (!requireAdmin(req, res2)) return;
    const { email } = req.body;
    if (!email) return res2.status(400).json({ ok: false, error: "email required" });
    try {
      await sendNBALaunchBlast({ to: email, userId: "preview" });
      res2.json({ ok: true, sent_to: email });
    } catch (err) {
      console.error("[nba/test-launch-email]", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/nba/admin/test-reminder-email", async (req, res2) => {
    if (!requireAdmin(req, res2)) return;
    const { email } = req.body;
    if (!email) return res2.status(400).json({ ok: false, error: "email required" });
    try {
      await sendNBAReminderBlast({ to: email, userId: "preview" });
      res2.json({ ok: true, sent_to: email });
    } catch (err) {
      console.error("[nba/test-reminder-email]", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/nba/admin/blast-reminder", async (req, res2) => {
    if (!requireAdmin(req, res2)) return;
    try {
      const supabase = getSupabase2();
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      const eligible2 = (allProfiles ?? []).filter(
        (p) => p.notification_email && !p.email_unsubscribed
      );
      console.log(`[nba/blast-reminder] Sending to ${eligible2.length} users`);
      let sent = 0;
      const errors = [];
      for (const profile of eligible2) {
        try {
          await sendNBAReminderBlast({ to: profile.notification_email, userId: profile.id });
          sent++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[nba/blast-reminder] Failed for ${profile.id}:`, msg);
          errors.push(`${profile.id}: ${msg}`);
        }
      }
      console.log(`[nba/blast-reminder] Done \u2014 sent: ${sent}, errors: ${errors.length}`);
      res2.json({ ok: true, sent, errors: errors.length > 0 ? errors : void 0 });
    } catch (err) {
      console.error("[nba/blast-reminder]", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/nba/admin/blast-launch", async (req, res2) => {
    if (!requireAdmin(req, res2)) return;
    try {
      const supabase = getSupabase2();
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      const eligible2 = (allProfiles ?? []).filter(
        (p) => p.notification_email && !p.email_unsubscribed
      );
      console.log(`[nba/blast-launch] Sending to ${eligible2.length} users`);
      let sent = 0;
      const errors = [];
      for (const profile of eligible2) {
        try {
          await sendNBALaunchBlast({
            to: profile.notification_email,
            userId: profile.id
          });
          sent++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[nba/blast-launch] Failed for ${profile.id}:`, msg);
          errors.push(`${profile.id}: ${msg}`);
        }
      }
      console.log(`[nba/blast-launch] Done \u2014 sent: ${sent}, errors: ${errors.length}`);
      res2.json({ ok: true, sent, errors: errors.length > 0 ? errors : void 0 });
    } catch (err) {
      console.error("[nba/blast-launch]", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
}

// server/routes-props.ts
import { createClient as createClient4 } from "@supabase/supabase-js";
function getSupabase3() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  return createClient4(url, key);
}
var PICK_ROUNDS = {
  1: { label: "Round 1 \u2014 NBA First Round", start: "2026-04-19", end: "2026-05-03" },
  2: { label: "Round 2 \u2014 Conference Semifinals", start: "2026-05-04", end: "2026-05-19" },
  3: { label: "Round 3 \u2014 Conference Finals", start: "2026-05-20", end: "2026-06-01" },
  4: { label: "Round 4 \u2014 NBA Finals", start: "2026-06-02", end: "2026-06-25" }
};
async function sendExpoPush(userId, title, body) {
  const supabase = getSupabase3();
  try {
    const { data: tokenRow } = await supabase.from("push_tokens").select("token").eq("user_id", userId).maybeSingle();
    const token = tokenRow?.token;
    if (!token) return;
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ to: token, title, body, sound: "default" })
    });
    console.log(`[push] sent to user ${userId}: "${title}"`);
  } catch (e) {
    console.warn(`[push] failed for user ${userId}:`, e);
  }
}
async function autoSettlePicksChallenges(nightId, label) {
  const supabase = getSupabase3();
  const { data: challengeSwaygers } = await supabase.from("swaygers").select("id, creator_id, opponent_id, title, stake_units, stake_note, status").eq("status", "active").ilike("description", `%[night:${nightId}]%`);
  if (!challengeSwaygers?.length) return;
  const { data: allProfiles } = await supabase.rpc("get_auth_only_profiles");
  const profileMap = /* @__PURE__ */ new Map();
  for (const p of allProfiles ?? []) {
    profileMap.set(p.id, p);
  }
  for (const sw of challengeSwaygers) {
    if (!sw.opponent_id) continue;
    const { data: creatorRow } = await supabase.from("prop_user_picks").select("correct_count").eq("night_id", nightId).eq("user_id", sw.creator_id).maybeSingle();
    const { data: oppRow } = await supabase.from("prop_user_picks").select("correct_count").eq("night_id", nightId).eq("user_id", sw.opponent_id).maybeSingle();
    const creatorScore = creatorRow?.correct_count ?? null;
    const oppScore = oppRow?.correct_count ?? null;
    let outcome;
    if (creatorScore === null || oppScore === null) outcome = "no_contest";
    else if (creatorScore > oppScore) outcome = "creator";
    else if (oppScore > creatorScore) outcome = "opponent";
    else outcome = "draw";
    const { error: settleErr } = await supabase.from("swaygers").update({ status: "settled", settled_outcome: outcome, settled_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", sw.id);
    if (settleErr) {
      console.warn(`[props] ${label}: could not settle swayger ${sw.id}:`, settleErr.message);
      continue;
    }
    console.log(`[props] ${label}: settled picks challenge ${sw.id}: ${outcome} (${creatorScore ?? "?"}\u2013${oppScore ?? "?"})`);
    const creatorProfile = profileMap.get(sw.creator_id);
    const oppProfile = profileMap.get(sw.opponent_id);
    const creatorName = creatorProfile?.username ?? "Creator";
    const oppName = oppProfile?.username ?? "Opponent";
    const denom = 4;
    const buildPushCopy = (myScore, theirScore, theirName, isWinner, isDraw2) => {
      const myStr = myScore !== null ? `${myScore}/${denom}` : "?";
      const theirStr = theirScore !== null ? `${theirScore}/${denom}` : "?";
      if (isDraw2) {
        return { title: "Picks Challenge \u2014 It's a Draw \u{1F91D}", body: `You both went ${myStr}. No one takes the bag tonight.` };
      }
      if (outcome === "no_contest") {
        return { title: "Picks Challenge \u2014 No Contest", body: "Not enough data to settle your challenge. Points returned." };
      }
      if (isWinner) {
        return { title: "Picks settled. You won. \u{1F3C6}", body: `You went ${myStr}. @${theirName} went ${theirStr}. The bag is yours.` };
      }
      return { title: "Picks settled.", body: `You went ${myStr}. @${theirName} went ${theirStr}. Settle up.` };
    };
    const isDraw = outcome === "draw";
    const creatorWins = outcome === "creator";
    const oppWins = outcome === "opponent";
    const creatorPush = buildPushCopy(creatorScore, oppScore, oppName, creatorWins, isDraw);
    const oppPush = buildPushCopy(oppScore, creatorScore, creatorName, oppWins, isDraw);
    await Promise.allSettled([
      sendExpoPush(sw.creator_id, creatorPush.title, creatorPush.body),
      sendExpoPush(sw.opponent_id, oppPush.title, oppPush.body)
    ]);
    try {
      const { sendPicksChallengeSettledEmail: sendPicksChallengeSettledEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const swaygerMeta = { id: sw.id, title: sw.title, category: "NBA Picks", stakeUnits: sw.stake_units, stakeNote: sw.stake_note };
      const notifPromises = [];
      if (creatorProfile && !creatorProfile.email_unsubscribed) {
        notifPromises.push(
          sendPicksChallengeSettledEmail2({
            swayger: swaygerMeta,
            recipientEmail: creatorProfile.notification_email,
            recipientName: creatorProfile.display_name ?? creatorProfile.username,
            myScore: creatorScore,
            theirScore: oppScore,
            theirName: oppProfile?.display_name ?? oppName,
            outcome,
            isCreator: true
          })
        );
      }
      if (oppProfile && !oppProfile.email_unsubscribed) {
        notifPromises.push(
          sendPicksChallengeSettledEmail2({
            swayger: swaygerMeta,
            recipientEmail: oppProfile.notification_email,
            recipientName: oppProfile.display_name ?? oppProfile.username,
            myScore: oppScore,
            theirScore: creatorScore,
            theirName: creatorProfile?.display_name ?? creatorName,
            outcome,
            isCreator: false
          })
        );
      }
      await Promise.allSettled(notifPromises);
    } catch (emailErr) {
      console.warn(`[props] ${label}: email error for swayger ${sw.id}:`, emailErr);
    }
  }
}
function requireAdmin2(req, res2) {
  const token = req.headers["x-admin-token"] || req.query["token"];
  if (token !== process.env.MM_ADMIN_TOKEN) {
    res2.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}
async function fetchSGOEventMap(eventIDs, nightDate) {
  const apiKey = process.env.SPORTS_GAME_ODDS_API_KEY;
  if (!apiKey || eventIDs.length === 0) return {};
  const map = {};
  const needed = new Set(eventIDs);
  let windowStart;
  if (nightDate) {
    const d = /* @__PURE__ */ new Date(nightDate + "T00:00:00Z");
    d.setDate(d.getDate() - 1);
    windowStart = d.toISOString();
  } else {
    windowStart = new Date(Date.now() - 3 * 24 * 60 * 60 * 1e3).toISOString();
  }
  let cursor = null;
  let pageCount = 0;
  const MAX_PAGES = 15;
  try {
    do {
      const url = new URL("https://api.sportsgameodds.com/v2/events/");
      url.searchParams.set("sportID", "BASKETBALL");
      url.searchParams.set("leagueID", "NBA");
      url.searchParams.set("startsAfter", windowStart);
      url.searchParams.set("includeResults", "true");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res2 = await fetch(url.toString(), { headers: { "X-Api-Key": apiKey } });
      if (!res2.ok) break;
      const data = await res2.json();
      if (!data.success) break;
      pageCount++;
      for (const event of data.data || []) {
        const id = event.eventID;
        if (needed.has(id)) {
          map[id] = event;
          needed.delete(id);
        }
      }
      cursor = needed.size > 0 && pageCount < MAX_PAGES ? data.nextCursor || null : null;
    } while (cursor);
  } catch {
  }
  console.log(`[SGO] fetchSGOEventMap: ${pageCount} page(s), found ${Object.keys(map).length}/${eventIDs.length} events`);
  return map;
}
function extractStat(playerData, statName) {
  if (playerData === void 0 || playerData === null) return null;
  if (typeof playerData === "object") {
    const obj = playerData;
    if (statName === "pra") {
      const p = obj["points"], r = obj["rebounds"], a = obj["assists"];
      if (typeof p !== "number" || typeof r !== "number" || typeof a !== "number") return null;
      return p + r + a;
    }
    if (statName === "pa" || statName === "PA") {
      const p = obj["points"], a = obj["assists"];
      if (typeof p !== "number" || typeof a !== "number") return null;
      return p + a;
    }
    if (statName === "pr" || statName === "PR") {
      const p = obj["points"], r = obj["rebounds"];
      if (typeof p !== "number" || typeof r !== "number") return null;
      return p + r;
    }
    if (statName === "prb" || statName === "PRB") {
      const p = obj["points"], r = obj["rebounds"], b = obj["blocks"];
      if (typeof p !== "number" || typeof r !== "number" || typeof b !== "number") return null;
      return p + r + b;
    }
    if (statName === "af" || statName === "AF") {
      const a = obj["assists"], f = obj["personalFouls"] ?? obj["fouls"] ?? obj["pf"] ?? 0;
      if (typeof a !== "number") return null;
      return a + (typeof f === "number" ? f : 0);
    }
    if (statName === "tma" || statName === "TMA") {
      const t = obj["threePointersMade"], a = obj["assists"];
      if (typeof t !== "number" || typeof a !== "number") return null;
      return t + a;
    }
    if (statName === "tms" || statName === "TMS") {
      const t = obj["threePointersMade"], s = obj["steals"];
      if (typeof t !== "number" || typeof s !== "number") return null;
      return t + s;
    }
    const val = obj[statName];
    return typeof val === "number" ? val : null;
  }
  const num = Number(playerData);
  return isNaN(num) ? null : num;
}
async function fetchMLBStatsMap(date) {
  const MLB_API = "https://statsapi.mlb.com/api/v1";
  const playerMap = {};
  try {
    const schedRes = await fetch(
      `${MLB_API}/schedule?sportId=1&date=${date}&hydrate=linescore`
    );
    if (!schedRes.ok) return playerMap;
    const sched = await schedRes.json();
    const games = sched.dates?.[0]?.games ?? [];
    for (const game of games) {
      if (!game.status?.detailedState?.toLowerCase().includes("final")) continue;
      const boxRes = await fetch(`${MLB_API}/game/${game.gamePk}/boxscore`);
      if (!boxRes.ok) continue;
      const box = await boxRes.json();
      const allPlayers = [
        ...Object.values(box.teams?.home?.players ?? {}),
        ...Object.values(box.teams?.away?.players ?? {})
      ];
      for (const p of allPlayers) {
        const name = p.person?.fullName;
        if (!name) continue;
        const b = p.stats?.batting ?? {};
        const pit = p.stats?.pitching ?? {};
        playerMap[name] = {
          hits: b.hits,
          atBats: b.atBats,
          totalBases: b.totalBases,
          homeRuns: b.homeRuns,
          rbi: b.rbi,
          stolenBases: b.stolenBases,
          runs: b.runs,
          strikeouts: typeof pit.strikeOuts === "number" ? pit.strikeOuts : void 0,
          walks: b.baseOnBalls,
          inningsPitched: typeof pit.outs === "number" ? +(pit.outs / 3).toFixed(1) : void 0
        };
      }
    }
  } catch (err) {
    console.error("[MLB] fetchMLBStatsMap error:", err);
  }
  console.log(`[MLB] fetchMLBStatsMap: found ${Object.keys(playerMap).length} players for ${date}`);
  return playerMap;
}
function resolveMLBProp(prop, playerMap) {
  if (prop.status === "voided") return prop;
  const playerName = prop.player_name;
  if (!playerName) {
    console.warn(`[MLB] no player_name on prop ${prop.id}, voiding`);
    return { ...prop, status: "voided" };
  }
  const stats = playerMap[playerName];
  if (!stats) {
    console.warn(`[MLB] player "${playerName}" not found in box scores, voiding`);
    return { ...prop, status: "voided" };
  }
  const statMap = {
    hits: stats.hits,
    totalBases: stats.totalBases,
    homeRuns: stats.homeRuns,
    rbi: stats.rbi,
    stolenBases: stats.stolenBases,
    runs: stats.runs,
    strikeouts: stats.strikeouts,
    walks: stats.walks,
    inningsPitched: stats.inningsPitched
  };
  const actual = statMap[prop.stat];
  if (actual === void 0 || actual === null) {
    console.warn(`[MLB] stat "${prop.stat}" not found for ${playerName}, voiding`);
    return { ...prop, status: "voided" };
  }
  const result = actual > prop.line ? "over" : "under";
  console.log(`[MLB] ${playerName} ${prop.stat}: ${actual} vs line ${prop.line} \u2192 ${result}`);
  return { ...prop, result };
}
function computeScore(correctCount, totalProps) {
  if (correctCount === 0) return 0;
  if (totalProps === 4) {
    if (correctCount === 1) return 10;
    if (correctCount === 2) return 40;
    if (correctCount === 3) return 100;
    return 250;
  }
  return correctCount * 25;
}
function registerPropsRoutes(app2) {
  app2.get("/api/props/tonight", async (_req, res2) => {
    try {
      const supabase = getSupabase3();
      const todayUTC = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const yesterdayUTC = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
      const tomorrowUTC = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
      const dayAfterTomorrowUTC = new Date(Date.now() + 2 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
      const { data: upcoming, error: upcomingErr } = await supabase.from("prop_nights").select("*").in("status", ["open", "locked"]).gte("date", yesterdayUTC).lte("date", dayAfterTomorrowUTC).order("date", { ascending: true }).limit(1).maybeSingle();
      if (upcomingErr) throw upcomingErr;
      if (upcoming) return res2.json({ ok: true, night: upcoming });
      const { data: recent, error: recentErr } = await supabase.from("prop_nights").select("*").in("date", [todayUTC, yesterdayUTC]).eq("status", "resolved").order("date", { ascending: false }).limit(1).maybeSingle();
      if (recentErr) throw recentErr;
      res2.json({ ok: true, night: recent ?? null });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.get("/api/props/last-night", async (req, res2) => {
    try {
      const { user_id } = req.query;
      const supabase = getSupabase3();
      const { data: night, error } = await supabase.from("prop_nights").select("*").eq("status", "resolved").order("date", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!night) return res2.json({ ok: true, night: null, pick: null });
      let pick = null;
      if (user_id) {
        const { data } = await supabase.from("prop_user_picks").select("*").eq("night_id", night.id).eq("user_id", user_id).maybeSingle();
        pick = data;
      }
      res2.json({ ok: true, night, pick });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.get("/api/props/history", async (_req, res2) => {
    try {
      const supabase = getSupabase3();
      const { data, error } = await supabase.from("prop_nights").select("id, date, status, props").eq("status", "resolved").order("date", { ascending: false }).limit(10);
      if (error) throw error;
      res2.json({ ok: true, nights: data ?? [] });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.get("/api/props/my-picks", async (req, res2) => {
    try {
      const { night_id, user_id } = req.query;
      if (!night_id || !user_id) {
        return res2.status(400).json({ ok: false, error: "night_id and user_id required" });
      }
      const supabase = getSupabase3();
      const { data, error } = await supabase.from("prop_user_picks").select("*").eq("night_id", night_id).eq("user_id", user_id).maybeSingle();
      if (error) throw error;
      res2.json({ ok: true, pick: data ?? null });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/props/pick", async (req, res2) => {
    try {
      const { night_id, user_id, picks } = req.body;
      if (!night_id || !user_id || !Array.isArray(picks)) {
        return res2.status(400).json({ ok: false, error: "night_id, user_id, picks required" });
      }
      const supabase = getSupabase3();
      const { data: night, error: nightErr } = await supabase.from("prop_nights").select("status, lock_time, props").eq("id", night_id).maybeSingle();
      if (nightErr) throw nightErr;
      if (!night) return res2.status(404).json({ ok: false, error: "Night not found" });
      const now = /* @__PURE__ */ new Date();
      const lockTime = new Date(night.lock_time);
      if (now >= lockTime || night.status !== "open") {
        return res2.status(403).json({ ok: false, error: "Picks are locked" });
      }
      const { error } = await supabase.from("prop_user_picks").upsert(
        {
          user_id,
          night_id,
          picks,
          score: 0,
          correct_count: 0,
          submitted_at: now.toISOString()
        },
        { onConflict: "user_id,night_id" }
      );
      if (error) throw error;
      res2.json({ ok: true });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.get("/api/props/leaderboard", async (req, res2) => {
    try {
      const supabase = getSupabase3();
      const roundParam = req.query.round ? Number(req.query.round) : null;
      let picks;
      if (roundParam && PICK_ROUNDS[roundParam]) {
        const { start, end } = PICK_ROUNDS[roundParam];
        const { data: nights } = await supabase.from("prop_nights").select("id").gte("date", start).lte("date", end);
        const nightIds = (nights ?? []).map((n) => n.id);
        if (nightIds.length === 0) return res2.json({ ok: true, leaderboard: [], round: roundParam });
        const { data: p, error } = await supabase.from("prop_user_picks").select("user_id, score, correct_count").in("night_id", nightIds);
        if (error) throw error;
        picks = p;
      } else {
        const { data: p, error } = await supabase.from("prop_user_picks").select("user_id, score, correct_count");
        if (error) throw error;
        picks = p;
      }
      const userMap = {};
      for (const p of picks ?? []) {
        if (!userMap[p.user_id]) {
          userMap[p.user_id] = { total_score: 0, total_correct: 0, nights_played: 0 };
        }
        userMap[p.user_id].total_score += p.score ?? 0;
        userMap[p.user_id].total_correct += p.correct_count ?? 0;
        userMap[p.user_id].nights_played += 1;
      }
      const userIds = Object.keys(userMap);
      if (userIds.length === 0) return res2.json({ ok: true, leaderboard: [], round: roundParam ?? null });
      const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
      const profileMap = {};
      for (const p of allProfiles ?? []) {
        if (userIds.includes(p.id)) {
          profileMap[p.id] = { username: p.username, display_name: p.display_name ?? "" };
        }
      }
      const leaderboard = Object.entries(userMap).map(([user_id, stats]) => ({
        user_id,
        username: profileMap[user_id]?.username ?? "\u2014",
        display_name: profileMap[user_id]?.display_name ?? "",
        ...stats
      })).sort((a, b) => b.total_score - a.total_score || b.total_correct - a.total_correct).slice(0, 50);
      res2.json({ ok: true, leaderboard, round: roundParam ?? null });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/night", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const { date, lock_time, props, id, sport } = req.body;
      if (!date || !lock_time || !Array.isArray(props)) {
        return res2.status(400).json({ ok: false, error: "date, lock_time, props required" });
      }
      const supabase = getSupabase3();
      if (id) {
        const updatePayload = { date, lock_time, props };
        if (sport) updatePayload.sport = sport;
        const { error: error2 } = await supabase.from("prop_nights").update(updatePayload).eq("id", id);
        if (error2) throw error2;
        return res2.json({ ok: true, updated: true });
      }
      const { data, error } = await supabase.from("prop_nights").insert({ date, lock_time, props, status: "open", sport: sport ?? "NBA" }).select("id").single();
      if (error) throw error;
      res2.json({ ok: true, id: data.id });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/manual-night", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const { date, lock_time, questions, sport } = req.body;
      if (!date || !lock_time || !Array.isArray(questions) || questions.length === 0) {
        return res2.status(400).json({ ok: false, error: "date, lock_time, questions[] required" });
      }
      const props = questions.map((q, i) => ({
        id: `prop_${i + 1}`,
        source: "manual",
        stat: "yn",
        stat_label: "Prediction",
        player_name: q.trim(),
        player_id: "manual",
        team: "",
        line: 0.5,
        game: "",
        event_id: "manual",
        odd_id: `manual_${i + 1}`,
        status: "open",
        result: null
      }));
      const supabase = getSupabase3();
      const { data, error } = await supabase.from("prop_nights").insert({ date, lock_time, props, status: "open", sport: sport ?? "Other" }).select("id").single();
      if (error) throw error;
      res2.json({ ok: true, id: data.id, props });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.get("/api/admin/props/open-nights", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const supabase = getSupabase3();
      const { data, error } = await supabase.from("prop_nights").select("id, date, lock_time, status, props, sport").in("status", ["open", "locked"]).order("date", { ascending: true });
      if (error) throw error;
      res2.json({ ok: true, nights: data ?? [] });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.get("/api/admin/props/hq-challenge-link", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const supabase = getSupabase3();
      const nightId = req.query.night_id;
      let night = null;
      if (nightId) {
        const { data } = await supabase.from("prop_nights").select("id, date").eq("id", nightId).maybeSingle();
        night = data;
      } else {
        const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        const { data } = await supabase.from("prop_nights").select("id, date").eq("date", today).eq("status", "open").maybeSingle();
        night = data;
        if (!night) {
          const { data: latest } = await supabase.from("prop_nights").select("id, date").eq("status", "open").order("date", { ascending: false }).limit(1).maybeSingle();
          night = latest;
        }
      }
      if (!night) {
        return res2.status(404).json({ ok: false, error: "No open prop night found" });
      }
      const baseUrl = "https://www.swayger.app";
      const url = `${baseUrl}/picks?hq=1`;
      res2.json({
        ok: true,
        night_id: night.id,
        night_date: night.date,
        hq_challenge_url: url,
        email_cta1: {
          text: "Accept the Challenge \u2192",
          url
        },
        email_cta2: {
          text: "Challenge a Friend \u2192",
          url: `${baseUrl}/picks`,
          note: "User creates a Picks Challenge from the challenge sheet after submitting picks"
        }
      });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/send-challenge-email", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const { to, displayName, userId, lockTime, props, hqChallengeUrl, picksUrl } = req.body;
      if (!to) return res2.status(400).json({ ok: false, error: "to is required" });
      const { sendNightlyPicksChallenge: sendNightlyPicksChallenge2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      await sendNightlyPicksChallenge2({
        to,
        displayName: displayName ?? "there",
        userId,
        lockTime: lockTime ?? "6:30 PM CDT",
        props: props ?? [
          { player: "Jayson Tatum", line: "O/U 23.5 pts", matchup: "Celtics vs 76ers" },
          { player: "Alperen Sengun", line: "O/U 5.5 ast", matchup: "Rockets vs Lakers" },
          { player: "Jaylen Brown", line: "O/U 37.5 PRA", matchup: "Celtics vs 76ers" },
          { player: "Victor Wembanyama", line: "O/U 11.5 reb", matchup: "Spurs vs Blazers" }
        ],
        hqChallengeUrl: hqChallengeUrl ?? "https://www.swayger.app/picks?hq=1",
        picksUrl: picksUrl ?? "https://www.swayger.app/picks"
      });
      res2.json({ ok: true, sent_to: to });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.get("/api/admin/props/preview-challenge-email", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    const { buildNightlyPicksChallengePreview: buildNightlyPicksChallengePreview2 } = await Promise.resolve().then(() => (init_email(), email_exports));
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildNightlyPicksChallengePreview2());
  });
  app2.get("/admin/props/email-preview/challenge", async (_req, res2) => {
    const { buildNightlyPicksChallengePreview: buildNightlyPicksChallengePreview2 } = await Promise.resolve().then(() => (init_email(), email_exports));
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildNightlyPicksChallengePreview2());
  });
  app2.get("/api/admin/props/blast-challenge-email/dry-run", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const supabase = getSupabase3();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      const allProfiles = [
        ...emailProfiles ?? [],
        ...authProfiles ?? []
      ];
      const seen = /* @__PURE__ */ new Set();
      const deduped = allProfiles.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      const eligible2 = deduped.filter((p) => !p.email_unsubscribed);
      const recipients = eligible2.map((u) => ({
        user_id: u.id,
        email: u.notification_email,
        display_name: u.display_name || u.username,
        hq_url: `https://www.swayger.app/picks?hq=1&uid=${u.id}`
      }));
      res2.json({ ok: true, total_eligible: eligible2.length, recipients });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/blast-challenge-email", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag in routes-mm-admin.ts and restart." });
      return;
    }
    try {
      const { sendNightlyPicksChallenge: sendNightlyPicksChallenge2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const supabase = getSupabase3();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      const allProfiles = [
        ...emailProfiles ?? [],
        ...authProfiles ?? []
      ];
      const seen = /* @__PURE__ */ new Set();
      const deduped = allProfiles.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      const eligible2 = deduped.filter((p) => !p.email_unsubscribed);
      let sent = 0;
      let failed = 0;
      for (const user of eligible2) {
        try {
          await sendNightlyPicksChallenge2({
            to: user.notification_email,
            displayName: user.display_name || user.username,
            userId: user.id,
            hqChallengeUrl: `https://www.swayger.app/picks?hq=1&uid=${user.id}`,
            picksUrl: "https://www.swayger.app/picks"
          });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[challenge-blast] failed for ${user.notification_email}:`, e);
          failed++;
        }
      }
      console.log(`[challenge-blast] complete: ${sent} sent, ${failed} failed`);
      res2.json({ ok: true, sent, failed, total_eligible: eligible2.length });
    } catch (err) {
      console.error("[challenge-blast] error:", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.get("/admin/props/email-preview/weekend-picks", (_req, res2) => {
    const { buildWeekendPicksBlastPreview: buildWeekendPicksBlastPreview2 } = (init_email(), __toCommonJS(email_exports));
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildWeekendPicksBlastPreview2());
  });
  app2.get("/api/admin/props/blast-weekend-picks/dry-run", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const supabase = getSupabase3();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      const allProfiles = [
        ...emailProfiles ?? [],
        ...authProfiles ?? []
      ];
      const seen = /* @__PURE__ */ new Set();
      const deduped = allProfiles.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      const eligible2 = deduped.filter((p) => p.notification_email && !p.email_unsubscribed);
      res2.json({
        ok: true,
        total_eligible: eligible2.length,
        recipients: eligible2.map((u) => ({
          user_id: u.id,
          email: u.notification_email,
          display_name: u.display_name || u.username
        }))
      });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/blast-weekend-picks/test", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    const { email, name } = req.body;
    if (!email) {
      res2.status(400).json({ ok: false, error: "email is required" });
      return;
    }
    try {
      const { sendWeekendPicksBlast: sendWeekendPicksBlast2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      await sendWeekendPicksBlast2({
        to: email,
        displayName: name || "Friend",
        userId: "test-preview",
        picksUrl: "https://www.swayger.app/picks"
      });
      res2.json({ ok: true, sent_to: email });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/blast-weekend-picks", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag in routes-mm-admin.ts and restart." });
      return;
    }
    try {
      const { sendWeekendPicksBlast: sendWeekendPicksBlast2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const supabase = getSupabase3();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      const allProfiles = [
        ...emailProfiles ?? [],
        ...authProfiles ?? []
      ];
      const seen = /* @__PURE__ */ new Set();
      const deduped = allProfiles.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      const eligible2 = deduped.filter((p) => p.notification_email && !p.email_unsubscribed);
      let sent = 0;
      let failed = 0;
      for (const user of eligible2) {
        try {
          await sendWeekendPicksBlast2({
            to: user.notification_email,
            displayName: user.display_name || user.username,
            userId: user.id,
            picksUrl: "https://www.swayger.app/picks"
          });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[weekend-blast] failed for ${user.notification_email}:`, e);
          failed++;
        }
      }
      console.log(`[weekend-blast] complete: ${sent} sent, ${failed} failed`);
      res2.json({ ok: true, sent, failed, total_eligible: eligible2.length });
    } catch (err) {
      console.error("[weekend-blast] error:", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.get("/admin/props/email-preview/cf-bracket", (_req, res2) => {
    const { buildCFBracketBlastPreview: buildCFBracketBlastPreview2 } = (init_email(), __toCommonJS(email_exports));
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildCFBracketBlastPreview2());
  });
  app2.get("/api/admin/props/blast-cf-bracket/dry-run", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const supabase = getSupabase3();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      const allProfiles = [...emailProfiles ?? [], ...authProfiles ?? []];
      const seen = /* @__PURE__ */ new Set();
      const deduped = allProfiles.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      const eligible2 = deduped.filter((p) => p.notification_email && !p.email_unsubscribed);
      res2.json({ ok: true, total_eligible: eligible2.length, recipients: eligible2.map((u) => ({ user_id: u.id, email: u.notification_email, name: u.display_name || u.username })) });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/blast-cf-bracket/test", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    const { email, name } = req.body;
    if (!email) {
      res2.status(400).json({ ok: false, error: "email is required" });
      return;
    }
    try {
      const { sendCFBracketBlast: sendCFBracketBlast2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      await sendCFBracketBlast2({
        to: email,
        displayName: name || "there",
        userId: "test-user",
        bracketUrl: "https://www.swayger.app/playoffs/bracket",
        picksUrl: "https://www.swayger.app/picks"
      });
      res2.json({ ok: true, sent_to: email });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/blast-cf-bracket", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused" });
      return;
    }
    try {
      const supabase = getSupabase3();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      const allProfiles = [...emailProfiles ?? [], ...authProfiles ?? []];
      const seen = /* @__PURE__ */ new Set();
      const deduped = allProfiles.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      const eligible2 = deduped.filter((p) => p.notification_email && !p.email_unsubscribed);
      const { sendCFBracketBlast: sendCFBracketBlast2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      let sent = 0;
      let failed = 0;
      for (const user of eligible2) {
        try {
          await sendCFBracketBlast2({
            to: user.notification_email,
            displayName: user.display_name || user.username,
            userId: user.id,
            bracketUrl: "https://www.swayger.app/playoffs/bracket",
            picksUrl: "https://www.swayger.app/picks"
          });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[cf-bracket-blast] failed for ${user.notification_email}:`, e);
          failed++;
        }
      }
      console.log(`[cf-bracket-blast] complete: ${sent} sent, ${failed} failed`);
      res2.json({ ok: true, sent, failed, total_eligible: eligible2.length });
    } catch (err) {
      console.error("[cf-bracket-blast] error:", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.get("/api/admin/props/blast-game-six/preview", (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    const { buildGameSixBlastPreview: buildGameSixBlastPreview2 } = (init_email(), __toCommonJS(email_exports));
    res2.setHeader("Content-Type", "text/html");
    res2.send(buildGameSixBlastPreview2());
  });
  app2.get("/api/admin/props/blast-game-six/dry-run", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const supabase = getSupabase3();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      const allProfiles = [...emailProfiles ?? [], ...authProfiles ?? []];
      const seen = /* @__PURE__ */ new Set();
      const deduped = allProfiles.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      const eligible2 = deduped.filter((p) => p.notification_email && !p.email_unsubscribed);
      res2.json({
        ok: true,
        total_eligible: eligible2.length,
        recipients: eligible2.map((u) => ({ user_id: u.id, email: u.notification_email, display_name: u.display_name || u.username }))
      });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/blast-game-six/test", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    const { email, name } = req.body;
    if (!email) {
      res2.status(400).json({ ok: false, error: "email is required" });
      return;
    }
    try {
      const { sendGameSixBlast: sendGameSixBlast2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      await sendGameSixBlast2({
        to: email,
        displayName: name || "there",
        userId: "test-user",
        picksUrl: "https://www.swayger.app/picks",
        swaygerUrl: "https://www.swayger.app"
      });
      res2.json({ ok: true, sent_to: email });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/blast-game-six", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const supabase = getSupabase3();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      const allProfiles = [...emailProfiles ?? [], ...authProfiles ?? []];
      const seen = /* @__PURE__ */ new Set();
      const deduped = allProfiles.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      const eligible2 = deduped.filter((p) => p.notification_email && !p.email_unsubscribed);
      const { sendGameSixBlast: sendGameSixBlast2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      let sent = 0;
      let failed = 0;
      for (const user of eligible2) {
        try {
          await sendGameSixBlast2({
            to: user.notification_email,
            displayName: user.display_name || user.username,
            userId: user.id,
            picksUrl: "https://www.swayger.app/picks",
            swaygerUrl: "https://www.swayger.app"
          });
          sent++;
        } catch (e) {
          console.error(`[game-six-blast] failed for ${user.notification_email}:`, e);
          failed++;
        }
      }
      console.log(`[game-six-blast] complete: ${sent} sent, ${failed} failed`);
      res2.json({ ok: true, sent, failed, total_eligible: eligible2.length });
    } catch (err) {
      console.error("[game-six-blast] error:", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/lock/:nightId", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const supabase = getSupabase3();
      const { error } = await supabase.from("prop_nights").update({ status: "locked" }).eq("id", req.params.nightId);
      if (error) throw error;
      res2.json({ ok: true });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.get("/api/props/night/:nightId", async (req, res2) => {
    try {
      const supabase = getSupabase3();
      const { nightId } = req.params;
      const { data: night, error } = await supabase.from("prop_nights").select("id, date, status, lock_time, props").eq("id", nightId).maybeSingle();
      if (error) throw error;
      if (!night) return res2.status(404).json({ ok: false, error: "Night not found" });
      res2.json({ ok: true, night });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/resolve/:nightId", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const supabase = getSupabase3();
      const { nightId } = req.params;
      const { data: night, error: nightErr } = await supabase.from("prop_nights").select("*").eq("id", nightId).maybeSingle();
      if (nightErr) throw nightErr;
      if (!night) return res2.status(404).json({ ok: false, error: "Night not found" });
      const props = night.props;
      const nightSport = night.sport ?? "NBA";
      let resolvedProps;
      if (nightSport === "MLB") {
        console.log(`[props/resolve] MLB night \u2014 fetching box scores from MLB Stats API`);
        const playerMap = await fetchMLBStatsMap(night.date);
        resolvedProps = props.map((prop) => resolveMLBProp(prop, playerMap));
      } else {
        const eventIds = [...new Set(props.map((p) => p.event_id))];
        const eventMap = await fetchSGOEventMap(eventIds, night.date);
        console.log(`[props/resolve] fetched ${Object.keys(eventMap).length}/${eventIds.length} events from SGO`);
        resolvedProps = props.map((prop) => {
          if (prop.status === "voided") return prop;
          const event = eventMap[prop.event_id];
          if (!event) {
            console.warn(`[props/resolve] no SGO event found for event_id=${prop.event_id}, prop=${prop.id}`);
            return prop;
          }
          const gameResults = event.results?.game;
          if (!gameResults) return prop;
          const playerData = gameResults[prop.player_id];
          if (playerData === void 0 || playerData === null) {
            console.warn(`[props/resolve] player ${prop.player_id} not in results, voiding`);
            return { ...prop, status: "voided" };
          }
          const actualScore = extractStat(playerData, prop.stat);
          if (actualScore === null) {
            console.warn(`[props/resolve] stat "${prop.stat}" not found for ${prop.player_id}, voiding`);
            return { ...prop, status: "voided" };
          }
          const result = actualScore > prop.line ? "over" : "under";
          console.log(`[props/resolve] ${prop.player_name} ${prop.stat}: ${actualScore} vs line ${prop.line} \u2192 ${result}`);
          return { ...prop, result };
        });
      }
      await supabase.from("prop_nights").update({ props: resolvedProps, status: "resolved" }).eq("id", nightId);
      const { data: userPicks } = await supabase.from("prop_user_picks").select("*").eq("night_id", nightId);
      for (const userPick of userPicks ?? []) {
        const picks = userPick.picks;
        let correctCount = 0;
        let voidedCount = 0;
        for (const pick of picks) {
          const prop = resolvedProps.find((p) => p.id === pick.prop_id);
          if (!prop) continue;
          if (prop.status === "voided") {
            voidedCount++;
            continue;
          }
          if (prop.result === pick.pick) correctCount++;
        }
        const activePropCount = resolvedProps.filter((p) => p.status !== "voided").length;
        const score = computeScore(correctCount, activePropCount) + voidedCount * 25;
        await supabase.from("prop_user_picks").update({ score, correct_count: correctCount }).eq("id", userPick.id);
      }
      try {
        await autoSettlePicksChallenges(nightId, "auto-resolve");
      } catch (autoErr) {
        console.error("[props] auto-settle picks challenge error:", autoErr);
      }
      res2.json({ ok: true, resolvedProps });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/manual-resolve/:nightId", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const supabase = getSupabase3();
      const { nightId } = req.params;
      const { results } = req.body;
      if (!results || typeof results !== "object") {
        return res2.status(400).json({ ok: false, error: "results object required: {prop_id: 'over'|'under'|'voided'}" });
      }
      const { data: night, error: nightErr } = await supabase.from("prop_nights").select("*").eq("id", nightId).maybeSingle();
      if (nightErr) throw nightErr;
      if (!night) return res2.status(404).json({ ok: false, error: "Night not found" });
      const props = night.props;
      const resolvedProps = props.map((prop) => {
        const manualResult = results[prop.id];
        if (!manualResult) return prop;
        if (manualResult === "voided") return { ...prop, status: "voided", result: null };
        return { ...prop, result: manualResult };
      });
      await supabase.from("prop_nights").update({ props: resolvedProps, status: "resolved" }).eq("id", nightId);
      const { data: userPicks } = await supabase.from("prop_user_picks").select("*").eq("night_id", nightId);
      for (const userPick of userPicks ?? []) {
        const picks = userPick.picks;
        let correctCount = 0;
        let voidedCount = 0;
        for (const pick of picks) {
          const prop = resolvedProps.find((p) => p.id === pick.prop_id);
          if (!prop) continue;
          if (prop.status === "voided") {
            voidedCount++;
            continue;
          }
          if (prop.result === pick.pick) correctCount++;
        }
        const activePropCount = resolvedProps.filter((p) => p.status !== "voided").length;
        const score = computeScore(correctCount, activePropCount) + voidedCount * 25;
        await supabase.from("prop_user_picks").update({ score, correct_count: correctCount }).eq("id", userPick.id);
      }
      try {
        await autoSettlePicksChallenges(nightId, "manual-resolve");
      } catch (autoErr) {
        console.error("[props] manual-resolve auto-settle error:", autoErr);
      }
      res2.json({ ok: true, resolvedProps, picksScored: (userPicks ?? []).length });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.get("/api/props/challenge-result", async (req, res2) => {
    try {
      const supabase = getSupabase3();
      const { swayger_id } = req.query;
      if (!swayger_id) return res2.status(400).json({ ok: false, error: "swayger_id required" });
      const { data: sw } = await supabase.from("swaygers").select("id, creator_id, opponent_id, description, settled_outcome").eq("id", swayger_id).maybeSingle();
      if (!sw) return res2.status(404).json({ ok: false, error: "Swayger not found" });
      const nightMatch = (sw.description ?? "").match(/\[night:([^\]]+)\]/);
      const nightId = nightMatch?.[1] ?? null;
      if (!nightId) return res2.json({ ok: true, nightId: null, creator_score: null, opp_score: null });
      const [{ data: creatorRow }, { data: oppRow }] = await Promise.all([
        supabase.from("prop_user_picks").select("correct_count").eq("night_id", nightId).eq("user_id", sw.creator_id).maybeSingle(),
        sw.opponent_id ? supabase.from("prop_user_picks").select("correct_count").eq("night_id", nightId).eq("user_id", sw.opponent_id).maybeSingle() : Promise.resolve({ data: null })
      ]);
      res2.json({
        ok: true,
        nightId,
        creator_score: creatorRow?.correct_count ?? null,
        opp_score: oppRow?.correct_count ?? null,
        settled_outcome: sw.settled_outcome ?? null
      });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/void/:nightId/:propId", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const supabase = getSupabase3();
      const { nightId, propId } = req.params;
      const { data: night } = await supabase.from("prop_nights").select("props").eq("id", nightId).maybeSingle();
      if (!night) return res2.status(404).json({ ok: false, error: "Night not found" });
      const props = night.props.map(
        (p) => p.id === propId ? { ...p, status: "voided" } : p
      );
      await supabase.from("prop_nights").update({ props }).eq("id", nightId);
      res2.json({ ok: true });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  async function getRoundLeaderboard(roundNum) {
    const roundConfig = PICK_ROUNDS[roundNum];
    if (!roundConfig) return { leaderboard: [], nightsInRound: 0, roundLabel: "", error: `Unknown round: ${roundNum}` };
    const supabase = getSupabase3();
    const { start, end } = roundConfig;
    const { data: nights } = await supabase.from("prop_nights").select("id").gte("date", start).lte("date", end);
    const nightIds = (nights ?? []).map((n) => n.id);
    if (nightIds.length === 0) return { leaderboard: [], nightsInRound: 0, roundLabel: roundConfig.label };
    const { data: picks, error } = await supabase.from("prop_user_picks").select("user_id, score, correct_count").in("night_id", nightIds);
    if (error) return { leaderboard: [], nightsInRound: nightIds.length, roundLabel: roundConfig.label, error: error.message };
    const userMap = {};
    for (const p of picks ?? []) {
      if (!userMap[p.user_id]) userMap[p.user_id] = { total_score: 0, total_correct: 0, nights_played: 0 };
      userMap[p.user_id].total_score += p.score ?? 0;
      userMap[p.user_id].total_correct += p.correct_count ?? 0;
      userMap[p.user_id].nights_played += 1;
    }
    const userIds = Object.keys(userMap);
    if (userIds.length === 0) return { leaderboard: [], nightsInRound: nightIds.length, roundLabel: roundConfig.label };
    const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
    const profileMap = {};
    for (const p of allProfiles ?? []) {
      if (userIds.includes(p.id)) {
        profileMap[p.id] = { username: p.username, display_name: p.display_name ?? "", email: p.notification_email ?? "" };
      }
    }
    const leaderboard = Object.entries(userMap).map(([user_id, stats]) => ({
      user_id,
      username: profileMap[user_id]?.username ?? "\u2014",
      display_name: profileMap[user_id]?.display_name ?? "",
      email: profileMap[user_id]?.email ?? "",
      ...stats
    })).sort((a, b) => b.total_score - a.total_score || b.total_correct - a.total_correct);
    return { leaderboard, nightsInRound: nightIds.length, roundLabel: roundConfig.label };
  }
  app2.get("/api/admin/props/round/:roundNum/leaderboard", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const roundNum = Number(req.params.roundNum);
      if (!PICK_ROUNDS[roundNum]) return res2.status(400).json({ ok: false, error: `Unknown round: ${roundNum}` });
      const result = await getRoundLeaderboard(roundNum);
      if (result.error) return res2.status(500).json({ ok: false, error: result.error });
      res2.json({ ok: true, round: roundNum, round_label: result.roundLabel, nights_in_round: result.nightsInRound, leaderboard: result.leaderboard });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/send-round-winner-email", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    const { round } = req.body;
    if (!round) return res2.status(400).json({ ok: false, error: "round is required in body" });
    if (!PICK_ROUNDS[round]) return res2.status(400).json({ ok: false, error: `Unknown round: ${round}` });
    try {
      const result = await getRoundLeaderboard(round);
      if (result.error) return res2.status(500).json({ ok: false, error: result.error });
      if (result.leaderboard.length === 0) return res2.json({ ok: false, error: "No participants found for this round." });
      const winner = result.leaderboard[0];
      if (!winner.email) return res2.status(404).json({ ok: false, error: `Winner (${winner.username}) has no email on file.` });
      const { sendRoundWinnerEmail: sendRoundWinnerEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      await sendRoundWinnerEmail2({
        to: winner.email,
        displayName: winner.display_name || winner.username,
        userId: winner.user_id,
        round,
        roundLabel: result.roundLabel,
        totalScore: winner.total_score,
        correctCount: winner.total_correct,
        nightsPlayed: winner.nights_played,
        rank: 1,
        totalPlayers: result.leaderboard.length
      });
      res2.json({
        ok: true,
        sent_to: winner.email,
        winner: { username: winner.username, score: winner.total_score, correct: winner.total_correct, nights: winner.nights_played },
        total_players: result.leaderboard.length
      });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.get("/admin/props/email-preview/round-launch", (_req, res2) => {
    Promise.resolve().then(() => (init_email(), email_exports)).then(({ buildRoundLaunchBlastPreview: buildRoundLaunchBlastPreview2 }) => {
      res2.setHeader("Content-Type", "text/html");
      res2.send(buildRoundLaunchBlastPreview2());
    }).catch((err) => res2.status(500).send(String(err)));
  });
  app2.get("/api/admin/props/blast-round-launch/dry-run", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    try {
      const supabase = getSupabase3();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      const allProfiles = [...emailProfiles ?? [], ...authProfiles ?? []];
      const seen = /* @__PURE__ */ new Set();
      const deduped = allProfiles.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      const eligible2 = deduped.filter((p) => p.notification_email && !p.email_unsubscribed);
      res2.json({ ok: true, total_eligible: eligible2.length, recipients: eligible2.map((u) => ({ user_id: u.id, email: u.notification_email, display_name: u.display_name || u.username })) });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/blast-round-launch/test", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    const { email, name } = req.body;
    if (!email) return res2.status(400).json({ ok: false, error: "email is required" });
    try {
      const { sendRoundLaunchBlast: sendRoundLaunchBlast2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      await sendRoundLaunchBlast2({ to: email, displayName: name || "Friend", userId: "test-preview", picksUrl: "https://www.swayger.app/picks" });
      res2.json({ ok: true, sent_to: email });
    } catch (err) {
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/props/blast-round-launch", async (req, res2) => {
    if (!requireAdmin2(req, res2)) return;
    if (BLAST_EMAILS_PAUSED) {
      res2.status(403).json({ ok: false, error: "Blast emails are paused (BLAST_EMAILS_PAUSED=true). Flip the flag in routes-mm-admin.ts and restart." });
      return;
    }
    try {
      const { sendRoundLaunchBlast: sendRoundLaunchBlast2 } = await Promise.resolve().then(() => (init_email(), email_exports));
      const supabase = getSupabase3();
      const { data: emailProfiles } = await supabase.rpc("get_all_notification_profiles");
      const { data: authProfiles } = await supabase.rpc("get_auth_only_profiles");
      const allProfiles = [...emailProfiles ?? [], ...authProfiles ?? []];
      const seen = /* @__PURE__ */ new Set();
      const deduped = allProfiles.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      const eligible2 = deduped.filter((p) => p.notification_email && !p.email_unsubscribed);
      let sent = 0;
      let failed = 0;
      for (const user of eligible2) {
        try {
          await sendRoundLaunchBlast2({
            to: user.notification_email,
            displayName: user.display_name || user.username,
            userId: user.id,
            picksUrl: "https://www.swayger.app/picks"
          });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch (e) {
          console.error(`[round-launch-blast] failed for ${user.notification_email}:`, e);
          failed++;
        }
      }
      console.log(`[round-launch-blast] complete: ${sent} sent, ${failed} failed`);
      res2.json({ ok: true, sent, failed, total_eligible: eligible2.length });
    } catch (err) {
      console.error("[round-launch-blast] error:", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
}

// server/routes-gameday.ts
import { createHash } from "crypto";

// server/gameday-template.ts
var NBA_PLAYOFF_TEMPLATE = [
  // ── Pregame ───────────────────────────────────────────────────────────────
  // ~20 objective props. Mix of early-settle (Q1), mid-settle (halftime), and
  // full-game props so the leaderboard moves throughout the night.
  {
    id: "pg_scores_first",
    phase: "pregame",
    question: "Which team scores first?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Early 1Q"
  },
  {
    id: "pg_first_three",
    phase: "pregame",
    question: "Which team makes the first 3-pointer?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No 3-pointer in Q1"],
    settlement_window: "Early 1Q"
  },
  {
    id: "pg_reach10",
    phase: "pregame",
    question: "Which team reaches 10 points first?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Early 1Q"
  },
  {
    id: "pg_q1",
    phase: "pregame",
    question: "Which team wins the 1st quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End 1Q"
  },
  {
    id: "pg_q1_pts",
    phase: "pregame",
    question: "Which team scores more points in the 1st quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End 1Q"
  },
  {
    id: "pg_star_q1",
    phase: "pregame",
    question: "Which star scores more points in the 1st quarter?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tie"],
    settlement_window: "End 1Q"
  },
  {
    id: "pg_q1_30",
    phase: "pregame",
    question: "Will either team score 30+ points in the 1st quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End 1Q"
  },
  {
    id: "pg_reach20",
    phase: "pregame",
    question: "Which team reaches 20 points first?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Neither team reaches 20 in Q1"],
    settlement_window: "Early 1Q\u20132Q"
  },
  {
    id: "pg_star_halftime",
    phase: "pregame",
    question: "Which star scores more points in the 1st half?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tie"],
    settlement_window: "Halftime"
  },
  {
    id: "pg_1h_winner",
    phase: "pregame",
    question: "Which team wins the first half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "Halftime"
  },
  {
    id: "pg_lead10_half",
    phase: "pregame",
    question: "Will either team lead by 10+ points in the 1st half?",
    answers: ["Yes", "No"],
    settlement_window: "Halftime"
  },
  {
    id: "pg_star_pts",
    phase: "pregame",
    question: "Which star finishes with more total points?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "pg_star_threes",
    phase: "pregame",
    question: "Which star makes more 3-pointers in the game?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "pg_threes",
    phase: "pregame",
    question: "Which team makes more 3-pointers in the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "pg_turnovers",
    phase: "pregame",
    question: "Which team has more turnovers in the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "pg_oreb",
    phase: "pregame",
    question: "Which team has more offensive rebounds in the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "pg_winner",
    phase: "pregame",
    question: "Which team wins the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game"
  },
  {
    id: "pg_clutch",
    phase: "pregame",
    question: "Will the game be within 7 points with 2 minutes left?",
    answers: ["Yes", "No"],
    settlement_window: "Final 2 Min"
  },
  {
    id: "pg_margin7",
    phase: "pregame",
    question: "Will the final margin be 7 points or fewer?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "pg_total220",
    phase: "pregame",
    question: "Will the game total be 220+ combined points?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  // Additional pregame options
  {
    id: "pg_margin",
    phase: "pregame",
    question: "Final margin?",
    answers: ["1\u20135", "6\u201310", "11\u201315", "16+"],
    settlement_window: "End Game"
  },
  {
    id: "pg_tech",
    phase: "pregame",
    question: "Will there be a technical foul?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  // ── Halftime ─────────────────────────────────────────────────────────────
  // ~20 objective props. Focus on 2nd half, Q3, and full-game outcome from
  // halftime. Settle progressively through Q3 and end of game.
  {
    id: "ht_first2h",
    phase: "halftime",
    question: "Which team scores first in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Early 3Q"
  },
  {
    id: "ht_first_three_2h",
    phase: "halftime",
    question: "Which team makes the first 3-pointer of the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No 3-pointer in Q3"],
    settlement_window: "Early 3Q"
  },
  {
    id: "ht_reach15",
    phase: "halftime",
    question: "Which team reaches 15 second-half points first?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Mid 3Q"
  },
  {
    id: "ht_q3",
    phase: "halftime",
    question: "Which team wins the 3rd quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End 3Q"
  },
  {
    id: "ht_q3_pts",
    phase: "halftime",
    question: "Which team scores more points in the 3rd quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End 3Q"
  },
  {
    id: "ht_q3_lead_change",
    phase: "halftime",
    question: "Will there be a lead change in the 3rd quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End 3Q"
  },
  {
    id: "ht_q3_threes_both",
    phase: "halftime",
    question: "Will both teams make at least two 3-pointers in the 3rd quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End 3Q"
  },
  {
    id: "ht_within5_4q",
    phase: "halftime",
    question: "Will the game be within 5 points entering the 4th quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End 3Q"
  },
  {
    id: "ht_star_2h",
    phase: "halftime",
    question: "Which star player scores more in the 2nd half?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "ht_star_threes_2h",
    phase: "halftime",
    question: "Which star makes more 3-pointers in the 2nd half?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "ht_star_15",
    phase: "halftime",
    question: "Will either star score 15+ points in the 2nd half?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "ht_2h_pts",
    phase: "halftime",
    question: "Which team scores more points in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "ht_lead15",
    phase: "halftime",
    question: "Will either team lead by 15+ points at any point in the 2nd half?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "ht_winner",
    phase: "halftime",
    question: "Does the halftime leader win the game?",
    answers: ["Yes", "No", "Game was tied at halftime"],
    settlement_window: "End Game"
  },
  {
    id: "ht_trailing_lead",
    phase: "halftime",
    question: "Will the team trailing at halftime come back to take the lead?",
    answers: ["Yes", "No", "Game was tied at halftime"],
    settlement_window: "End Game"
  },
  {
    id: "ht_comeback",
    phase: "halftime",
    question: "Will the losing team cut the deficit to one possession?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "ht_turnovers_2h",
    phase: "halftime",
    question: "Which team commits more turnovers in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "ht_rebounds_2h",
    phase: "halftime",
    question: "Which team gets more rebounds in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "ht_ft_2h",
    phase: "halftime",
    question: "Which team makes more free throws in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "ht_run",
    phase: "halftime",
    question: "Will either team go on a 10\u20130 run in the 2nd half?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "ht_game_winner",
    phase: "halftime",
    question: "Which team wins the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game"
  },
  // ── 4Q Clutch ────────────────────────────────────────────────────────────
  // ~20 objective props. Late-game urgency, final margin, comeback potential,
  // and final stat outcomes. All settleable from box score.
  {
    id: "q4_first",
    phase: "fourth",
    question: "Which team scores first in the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Early 4Q"
  },
  {
    id: "q4_first_three",
    phase: "fourth",
    question: "Which team makes the first 3-pointer of the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No 3-pointer in Q4"],
    settlement_window: "Early 4Q"
  },
  {
    id: "q4_winner",
    phase: "fourth",
    question: "Which team wins the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "q4_pts",
    phase: "fourth",
    question: "Which team scores more points in the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "q4_lead_change",
    phase: "fourth",
    question: "Will there be a lead change in the 4th quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "q4_clutch",
    phase: "fourth",
    question: "Will the game be within 5 points in the final 2 minutes?",
    answers: ["Yes", "No"],
    settlement_window: "Final 2 Min"
  },
  {
    id: "q4_margin5",
    phase: "fourth",
    question: "Will the final margin be 5 points or fewer?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "q4_margin10",
    phase: "fourth",
    question: "Will the final margin be 10 points or fewer?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "q4_star",
    phase: "fourth",
    question: "Which star player scores more in the 4th quarter?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "q4_star_10",
    phase: "fourth",
    question: "Will either star score 10+ points in the 4th quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "q4_threes",
    phase: "fourth",
    question: "Which team makes more 3-pointers in the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "q4_fta",
    phase: "fourth",
    question: "Which team attempts more free throws in the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "q4_ftm",
    phase: "fourth",
    question: "Which team makes more free throws in the 4th quarter?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tie"],
    settlement_window: "End Game"
  },
  {
    id: "q4_trailing_lead",
    phase: "fourth",
    question: "Will the team trailing entering the 4th quarter take the lead?",
    answers: ["Yes", "No", "Game was tied entering Q4"],
    settlement_window: "End Game"
  },
  {
    id: "q4_leader_wins",
    phase: "fourth",
    question: "Will the team leading entering the 4th quarter win the game?",
    answers: ["Yes", "No", "Game was tied entering Q4"],
    settlement_window: "End Game"
  },
  {
    id: "q4_run8",
    phase: "fourth",
    question: "Will either team go on an 8\u20130 run or better in the 4th quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "q4_ot",
    phase: "fourth",
    question: "Will the game have overtime?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "q4_game_winner",
    phase: "fourth",
    question: "Who wins the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game"
  }
];
var DEFAULT_PROP_IDS = [
  // ── Pregame — early / halftime / end-game mix ──
  "pg_scores_first",
  // Early 1Q
  "pg_q1",
  // End 1Q (Tie option included)
  "pg_first_three",
  // Early 1Q
  "pg_star_halftime",
  // Halftime (Tie option included)
  "pg_winner",
  // End Game
  "pg_clutch",
  // Final 2 Min
  // ── Halftime ──
  "ht_first2h",
  // Early 3Q
  "ht_q3",
  // End 3Q (Tie option included)
  "ht_star_2h",
  // End Game (Tie option included)
  "ht_winner",
  // End Game (3rd option: tied at halftime)
  // ── 4Q Clutch ──
  "q4_first",
  // Early 4Q
  "q4_winner",
  // End Game (Tie option included)
  "q4_lead_change",
  // End Game
  "q4_clutch"
  // Final 2 Min
];
var FIFA_TEMPLATE = [
  // ── Pregame ───────────────────────────────────────────────────────────────
  {
    id: "fifa_pg_scores_first",
    phase: "pregame",
    question: "Which team scores first?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No goals in first 20 min"],
    settlement_window: "First 20 Min"
  },
  {
    id: "fifa_pg_1h_goals",
    phase: "pregame",
    question: "How many goals in the first half?",
    answers: ["0", "1", "2+"],
    settlement_window: "Halftime"
  },
  {
    id: "fifa_pg_1h_winner",
    phase: "pregame",
    question: "Who leads at halftime?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Level / 0-0"],
    settlement_window: "Halftime"
  },
  {
    id: "fifa_pg_star_goal_1h",
    phase: "pregame",
    question: "Does either star score in the first half?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Both", "Neither"],
    settlement_window: "Halftime"
  },
  {
    id: "fifa_pg_corner_1h",
    phase: "pregame",
    question: "Which team wins more corners in the first half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Equal"],
    settlement_window: "Halftime"
  },
  {
    id: "fifa_pg_winner",
    phase: "pregame",
    question: "Who wins after 90 minutes?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Draw"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_pg_total_goals",
    phase: "pregame",
    question: "Total goals in the match (90 min)?",
    answers: ["0\u20131", "2", "3", "4+"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_pg_star_goal",
    phase: "pregame",
    question: "Which star scores in the match?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Both", "Neither"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_pg_red_card",
    phase: "pregame",
    question: "Will there be a red card?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "fifa_pg_extra_time",
    phase: "pregame",
    question: "Will the match go to extra time?",
    answers: ["Yes", "No"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_pg_penalties",
    phase: "pregame",
    question: "Will there be a penalty shootout?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "fifa_pg_clean_sheet",
    phase: "pregame",
    question: "Does either team keep a clean sheet (90 min)?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Neither"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_pg_margin",
    phase: "pregame",
    question: "Winning margin after 90 min?",
    answers: ["1 goal", "2 goals", "3+ goals", "Draw"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_pg_comeback",
    phase: "pregame",
    question: "Will the team that concedes first come back to equalize or win?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "fifa_pg_trophy",
    phase: "pregame",
    question: "Who lifts the trophy?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game"
  },
  // ── Halftime ─────────────────────────────────────────────────────────────
  {
    id: "fifa_ht_next_goal",
    phase: "halftime",
    question: "Who scores next?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No more goals"],
    settlement_window: "Early 2H"
  },
  {
    id: "fifa_ht_first_goal_2h",
    phase: "halftime",
    question: "Which team scores first in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No 2nd half goals"],
    settlement_window: "Early 2H"
  },
  {
    id: "fifa_ht_2h_goals",
    phase: "halftime",
    question: "How many goals in the 2nd half?",
    answers: ["0", "1", "2+"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_ht_2h_winner",
    phase: "halftime",
    question: "Which team wins the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Draw"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_ht_result_holds",
    phase: "halftime",
    question: "Does the halftime result hold at full time?",
    answers: ["Yes", "No"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_ht_comeback",
    phase: "halftime",
    question: "Will the team trailing at halftime equalize or win?",
    answers: ["Yes", "No", "Teams are level at halftime"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_ht_star_goal_2h",
    phase: "halftime",
    question: "Does either star score in the 2nd half?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Both", "Neither"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_ht_extra_time",
    phase: "halftime",
    question: "Will the match go to extra time?",
    answers: ["Yes", "No"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_ht_red_card_2h",
    phase: "halftime",
    question: "Will there be a red card in the 2nd half?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "fifa_ht_sub_goal",
    phase: "halftime",
    question: "Will a substitute score in the 2nd half?",
    answers: ["Yes", "No"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_ht_injury_goal",
    phase: "halftime",
    question: "Will there be a goal in injury time?",
    answers: ["Yes", "No"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_ht_winner",
    phase: "halftime",
    question: "Who wins the match (90 min)?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Draw"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_ht_corner_2h",
    phase: "halftime",
    question: "Which team wins more corners in the 2nd half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Equal"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_ht_trophy",
    phase: "halftime",
    question: "Who lifts the trophy?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game"
  },
  // ── Final Push (opens ~70th min) ──────────────────────────────────────────
  {
    id: "fifa_fp_next_goal",
    phase: "final_push",
    question: "Next goal goes to?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No more goals in 90 min"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_fp_goal_last20",
    phase: "final_push",
    question: "Will there be a goal in the final 20 minutes?",
    answers: ["Yes", "No"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_fp_injury_time",
    phase: "final_push",
    question: "How many minutes of injury time?",
    answers: ["1\u20134 min", "5\u20137 min", "8+ min"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_fp_extra_time",
    phase: "final_push",
    question: "Will the match go to extra time?",
    answers: ["Yes", "No"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_fp_penalties",
    phase: "final_push",
    question: "Will there be a penalty shootout?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "fifa_fp_star_goal",
    phase: "final_push",
    question: "Does either star score in the final 20 minutes?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Neither"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_fp_comeback",
    phase: "final_push",
    question: "Will the trailing team equalize or win from here?",
    answers: ["Yes", "No", "Teams are level"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_fp_winner_90",
    phase: "final_push",
    question: "Who wins after 90 minutes?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Draw / Extra Time"],
    settlement_window: "End 90 Min"
  },
  {
    id: "fifa_fp_trophy",
    phase: "final_push",
    question: "Who lifts the trophy?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game"
  },
  {
    id: "fifa_fp_clean_sheet",
    phase: "final_push",
    question: "Does either team keep a clean sheet (90 min)?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Neither"],
    settlement_window: "End 90 Min"
  },
  // ── Penalties (host opens ONLY if shootout happens) ───────────────────────
  {
    id: "fifa_pen_winner",
    phase: "penalties",
    question: "Who wins the penalty shootout?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Shootout"
  },
  {
    id: "fifa_pen_first_miss",
    phase: "penalties",
    question: "Which team misses first?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No misses"],
    settlement_window: "End Shootout"
  },
  {
    id: "fifa_pen_total_kicks",
    phase: "penalties",
    question: "Total penalty kicks taken?",
    answers: ["5\u20136", "7\u20138", "9\u201310", "11+"],
    settlement_window: "End Shootout"
  },
  {
    id: "fifa_pen_sudden_death",
    phase: "penalties",
    question: "Does it go beyond the first 5 kicks per side?",
    answers: ["Yes \u2014 sudden death!", "No"],
    settlement_window: "End Shootout"
  },
  {
    id: "fifa_pen_star_scores",
    phase: "penalties",
    question: "Does either star take and score a penalty?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Both", "Neither"],
    settlement_window: "End Shootout"
  },
  {
    id: "fifa_pen_clean_sweep",
    phase: "penalties",
    question: "Does any team score all their kicks perfectly?",
    answers: ["Yes", "No"],
    settlement_window: "End Shootout"
  }
];
var FIFA_DEFAULT_PROP_IDS = [
  // ── Pregame ──
  "fifa_pg_scores_first",
  // First 20 Min
  "fifa_pg_1h_winner",
  // Halftime
  "fifa_pg_star_goal_1h",
  // Halftime
  "fifa_pg_winner",
  // End 90 Min
  "fifa_pg_extra_time",
  // End 90 Min
  "fifa_pg_trophy",
  // End Game
  // ── Halftime ──
  "fifa_ht_next_goal",
  // Early 2H
  "fifa_ht_2h_winner",
  // End 90 Min
  "fifa_ht_comeback",
  // End 90 Min
  "fifa_ht_extra_time",
  // End 90 Min
  // ── Final Push ──
  "fifa_fp_goal_last20",
  // End 90 Min
  "fifa_fp_extra_time",
  // End 90 Min
  "fifa_fp_winner_90",
  // End 90 Min
  "fifa_fp_trophy",
  // End Game
  // ── Penalties (all — only matters if shootout happens) ──
  "fifa_pen_winner",
  "fifa_pen_first_miss",
  "fifa_pen_total_kicks",
  "fifa_pen_sudden_death",
  "fifa_pen_star_scores",
  "fifa_pen_clean_sweep"
];
var NFL_TEMPLATE = [
  {
    id: "nfl_pre_winner",
    phase: "pregame",
    question: "Who wins the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game"
  },
  {
    id: "nfl_pre_first_score",
    phase: "pregame",
    question: "Which team scores first?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "Opening Drive"
  },
  {
    id: "nfl_pre_halftime_leader",
    phase: "pregame",
    question: "Who leads at halftime?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tied"],
    settlement_window: "Halftime"
  },
  {
    id: "nfl_pre_qb_td_passes",
    phase: "pregame",
    question: "Which QB throws more touchdown passes?",
    answers: ["{{STAR_A}}", "{{STAR_B}}", "Tied"],
    settlement_window: "End Game"
  },
  {
    id: "nfl_pre_qb_interception",
    phase: "pregame",
    question: "Will either starting QB throw an interception?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "nfl_pre_total_touchdowns",
    phase: "pregame",
    question: "How many total touchdowns are scored?",
    answers: ["0\u20133", "4\u20135", "6+"],
    settlement_window: "End Game"
  },
  {
    id: "nfl_ht_winner",
    phase: "halftime",
    question: "Who wins the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game"
  },
  {
    id: "nfl_ht_first_second_half_score",
    phase: "halftime",
    question: "Which team scores first in the second half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No second-half score"],
    settlement_window: "Third Quarter"
  },
  {
    id: "nfl_ht_second_half_points",
    phase: "halftime",
    question: "Which team scores more points in the second half?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "Tied"],
    settlement_window: "End Game"
  },
  {
    id: "nfl_ht_fourth_lead_change",
    phase: "halftime",
    question: "Will the lead change in the fourth quarter?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  },
  {
    id: "nfl_4q_winner",
    phase: "fourth",
    question: "Who wins the game?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}"],
    settlement_window: "End Game"
  },
  {
    id: "nfl_4q_next_score",
    phase: "fourth",
    question: "Which team scores next?",
    answers: ["{{TEAM_A}}", "{{TEAM_B}}", "No more scores"],
    settlement_window: "End Game"
  },
  {
    id: "nfl_4q_another_touchdown",
    phase: "fourth",
    question: "Will there be another touchdown?",
    answers: ["Yes", "No"],
    settlement_window: "End Game"
  }
];
var NFL_DEFAULT_PROP_IDS = [
  "nfl_pre_winner",
  "nfl_pre_first_score",
  "nfl_pre_halftime_leader",
  "nfl_pre_qb_td_passes",
  "nfl_pre_qb_interception",
  "nfl_pre_total_touchdowns",
  "nfl_ht_winner",
  "nfl_ht_first_second_half_score",
  "nfl_ht_second_half_points",
  "nfl_ht_fourth_lead_change",
  "nfl_4q_winner",
  "nfl_4q_next_score",
  "nfl_4q_another_touchdown"
];
var NFL_SUNDAY_SLATE_TEMPLATE = [
  { id: "nfl_slate_early_qb_passing_yards", phase: "pregame", question: "Which Early Slate QB has the most passing yards?", answers: ["{{SLATE_QBS}}"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_early_rushing_yards", phase: "pregame", question: "Which Early Slate RB has the most rushing yards?", answers: ["{{SLATE_RBS}}"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_early_receiving_yards", phase: "pregame", question: "Which Early Slate WR/TE has the most receiving yards?", answers: ["{{SLATE_RECEIVERS}}"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_early_team_points", phase: "pregame", question: "Which Early Slate team scores the most points?", answers: ["{{SLATE_TEAMS}}"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_early_fewest_points_allowed", phase: "pregame", question: "Which Early Slate team allows the fewest points?", answers: ["{{SLATE_TEAMS}}"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_early_highest_total_game", phase: "pregame", question: "Which Early Slate game has the highest combined score?", answers: ["{{SLATE_EARLY_GAMES}}"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_early_closest_game", phase: "pregame", question: "Which Early Slate game has the closest final margin?", answers: ["{{SLATE_EARLY_GAMES}}"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_early_close_games_count", phase: "pregame", question: "How many Early Slate games finish within 7 points?", answers: ["0\u20132", "3\u20135", "6+", "Tie / Multiple tied"], settlement_window: "End Early Slate" },
  { id: "nfl_slate_late_qb_passing_yards", phase: "halftime", question: "Which Late Slate QB has the most passing yards?", answers: ["{{SLATE_QBS}}"], settlement_window: "End Late Slate" },
  { id: "nfl_slate_late_team_points", phase: "halftime", question: "Which Late Slate team scores the most points?", answers: ["{{SLATE_TEAMS}}"], settlement_window: "End Late Slate" },
  { id: "nfl_slate_late_highest_total_game", phase: "halftime", question: "Which Late Slate game has the highest combined score?", answers: ["{{SLATE_LATE_GAMES}}"], settlement_window: "End Late Slate" },
  { id: "nfl_slate_late_overtime", phase: "halftime", question: "Will any Late Slate game go to overtime?", answers: ["Yes", "No"], settlement_window: "End Late Slate" },
  { id: "nfl_slate_late_fewest_points_allowed", phase: "halftime", question: "Which Late Slate team allows the fewest points?", answers: ["{{SLATE_TEAMS}}"], settlement_window: "End Late Slate" },
  { id: "nfl_slate_snf_winner", phase: "fourth", question: "Who wins Sunday Night Football?", answers: ["{{TEAM_A}}", "{{TEAM_B}}"], settlement_window: "End Game" },
  { id: "nfl_slate_snf_first_score", phase: "fourth", question: "Which team scores first on Sunday Night?", answers: ["{{TEAM_A}}", "{{TEAM_B}}"], settlement_window: "Opening Drive" },
  { id: "nfl_slate_snf_margin", phase: "fourth", question: "What is the Sunday Night final margin?", answers: ["1\u20137", "8\u201314", "15+", "Tie / Multiple tied"], settlement_window: "End Game" }
];
var NFL_SUNDAY_SLATE_DEFAULT_PROP_IDS = NFL_SUNDAY_SLATE_TEMPLATE.map((prop) => prop.id);
function resolvePlaceholders(text, vars) {
  return text.replace(/\{\{TEAM_A\}\}/g, vars.TEAM_A).replace(/\{\{TEAM_B\}\}/g, vars.TEAM_B).replace(/\{\{STAR_A\}\}/g, vars.STAR_A).replace(/\{\{STAR_B\}\}/g, vars.STAR_B);
}

// server/routes-gameday.ts
init_email();

// server/gameday-normalize.ts
function normalizeText(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
function normalizeTeamName(name) {
  return name.toLowerCase().replace(/^(the|a|an)\s+/, "").replace(/\s+(f\.?c\.?|s\.?c\.?|c\.?f\.?|a\.?f\.?c\.?|b\.?f\.?c\.?)$/, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeTeamPair(teamA, teamB) {
  const a = normalizeTeamName(teamA);
  const b = normalizeTeamName(teamB);
  return [a, b].sort().join("|");
}
function normalizeDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  return null;
}
function normalizeQuestion(q) {
  return q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeAnswerOption(opt) {
  return opt.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeAnswerOptions(options) {
  return options.map(normalizeAnswerOption).sort().join("||");
}
function buildEventKey(sport, teamA, teamB, gameDate) {
  const normSport = sport ? normalizeText(sport) : null;
  const normDate = normalizeDate(gameDate);
  if (!normSport || !teamA || !teamB || !normDate) return null;
  const teamPair = normalizeTeamPair(teamA, teamB);
  return `${normSport}|${teamPair}|${normDate}`;
}
function buildGroupKey(eventKey, phase, question, answerOptions) {
  const normPhase = normalizeText(phase);
  const normQuestion = normalizeQuestion(question);
  const normOptions = normalizeAnswerOptions(answerOptions);
  return `${eventKey}|${normPhase}|${normQuestion}|${normOptions}`;
}
function mapNormalizedToStored(answer, storedOptions) {
  for (const opt of storedOptions) {
    if (opt === answer) return opt;
  }
  const normAnswer = normalizeAnswerOption(answer);
  for (const opt of storedOptions) {
    if (normalizeAnswerOption(opt) === normAnswer) return opt;
  }
  return null;
}
function detectAmbiguousOptions(options) {
  const seen = /* @__PURE__ */ new Map();
  const collisions = [];
  for (const opt of options) {
    const norm = normalizeAnswerOption(opt);
    if (seen.has(norm)) {
      collisions.push(
        `Options "${seen.get(norm)}" and "${opt}" both normalize to "${norm}" \u2014 ambiguous`
      );
    } else {
      seen.set(norm, opt);
    }
  }
  return collisions;
}
function gameLabel(teamA, teamB, gameDate) {
  const datePart = gameDate ? (/* @__PURE__ */ new Date(gameDate + "T12:00:00")).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  }) : "Unknown date";
  return `${teamA} vs. ${teamB} \xB7 ${datePart}`;
}
function phaseLabel(phase) {
  return phase.charAt(0).toUpperCase() + phase.slice(1).toLowerCase();
}

// server/gameday-settle-helper.ts
async function settlePropCore(supabase, { propId, cardId, correctAnswer }) {
  await supabase.from("gameday_props").update({
    correct_answer: correctAnswer,
    status: "settled",
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", propId);
  await supabase.from("gameday_picks").update({ is_correct: true }).eq("prop_id", propId).eq("selected_answer", correctAnswer);
  await supabase.from("gameday_picks").update({ is_correct: false }).eq("prop_id", propId).neq("selected_answer", correctAnswer);
  const { data: remaining } = await supabase.from("gameday_props").select("id").eq("card_id", cardId).neq("status", "settled");
  const cardAutoSettled = !remaining?.length;
  if (cardAutoSettled) {
    await supabase.from("gameday_pick_cards").update({ status: "settled", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", cardId);
  }
  return { propId, cardId, cardAutoSettled };
}

// server/supabase-service.ts
import { createClient as createClient5 } from "@supabase/supabase-js";
var SERVICE_ROLE_CONFIGURATION_ERROR = "Supabase service-role configuration is required for server database access";
var ServiceSupabaseConfigurationError = class extends Error {
  status = 503;
  constructor(message) {
    super(message);
    this.name = "ServiceSupabaseConfigurationError";
  }
};
function assertServiceSupabaseConfigured() {
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()) {
    throw new ServiceSupabaseConfigurationError(
      `${SERVICE_ROLE_CONFIGURATION_ERROR}: EXPO_PUBLIC_SUPABASE_URL is missing`
    );
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new ServiceSupabaseConfigurationError(
      `${SERVICE_ROLE_CONFIGURATION_ERROR}: SUPABASE_SERVICE_ROLE_KEY is missing`
    );
  }
}
function isServiceSupabaseConfigured() {
  return Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}
function getServiceSupabase() {
  assertServiceSupabaseConfigured();
  return createClient5(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

// server/routes-gameday.ts
var GLOBAL_SETTLEMENT_WRITE_ENABLED = process.env.GLOBAL_SETTLE_ENABLED === "true";
function _tokenFingerprint(token) {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}
function _computeRequestHash(group_key, canonical_answer_normalized, prop_ids, expected_count, operatorFingerprint) {
  const sorted = [...prop_ids].sort().join(",");
  const raw = [group_key, canonical_answer_normalized, sorted, String(expected_count), operatorFingerprint].join("|");
  return createHash("sha256").update(raw).digest("hex");
}
function _genOpId() {
  return `gso-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
async function _readSettleOp(sb, idem_key) {
  const { data } = await sb.from("gameday_settlement_operations").select("id, idempotency_key, request_hash, operation_id, status, response_status_code, result_json, partial_results_json, error_json, lease_expires_at").eq("idempotency_key", idem_key).maybeSingle();
  return data ?? null;
}
async function _isSettleOpActive(sb, idem_key, op_id) {
  const { data } = await sb.from("gameday_settlement_operations").select("status, lease_expires_at").eq("idempotency_key", idem_key).eq("operation_id", op_id).maybeSingle();
  if (!data) return false;
  const row = data;
  return row.status === "in_progress" && new Date(row.lease_expires_at).getTime() > Date.now();
}
async function _refreshSettleLease(sb, idem_key, op_id) {
  const newLease = new Date(Date.now() + 10 * 60 * 1e3).toISOString();
  const { data } = await sb.from("gameday_settlement_operations").update({ updated_at: (/* @__PURE__ */ new Date()).toISOString(), lease_expires_at: newLease }).eq("idempotency_key", idem_key).eq("operation_id", op_id).eq("status", "in_progress").select("id");
  return (data?.length ?? 0) > 0;
}
async function _finalizeSettleOp(sb, params) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const upd = {
    status: params.status,
    response_status_code: params.response_status_code,
    updated_at: now,
    completed_at: now,
    room_count: params.room_count
  };
  if (params.result_json !== void 0) upd.result_json = params.result_json;
  if (params.error_json !== void 0) upd.error_json = params.error_json;
  if (params.partial_results_json !== void 0) upd.partial_results_json = params.partial_results_json;
  const { data: updated } = await sb.from("gameday_settlement_operations").update(upd).eq("idempotency_key", params.idempotency_key).eq("operation_id", params.operation_id).eq("status", "in_progress").select("id");
  if ((updated?.length ?? 0) > 0) return { updated: true };
  const row = await _readSettleOp(sb, params.idempotency_key);
  return { updated: false, row };
}
function _buildSettleReplay(row) {
  const code = row.response_status_code ?? 200;
  if (row.status === "completed") return { statusCode: code, payload: row.result_json };
  if (row.status === "partial_success") return { statusCode: code, payload: row.partial_results_json };
  if (row.status === "failed") return { statusCode: code, payload: row.error_json };
  return {
    statusCode: 409,
    payload: {
      error: "This operation was previously abandoned. Retry with a new idempotency_key.",
      code: "OPERATION_ABANDONED",
      ...typeof row.error_json === "object" && row.error_json !== null ? row.error_json : {}
    }
  };
}
async function _recoverStaleSettleOps(sb) {
  try {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data, error } = await sb.from("gameday_settlement_operations").update({
      status: "abandoned",
      error_json: { code: "PROCESS_RESTART", message: "Server restarted before operation completed" },
      updated_at: now,
      completed_at: now
    }).eq("status", "in_progress").lt("lease_expires_at", now).select("operation_id");
    if (error) {
      if (error.code !== "42P01") {
        console.warn("[settle-group] startup recovery error:", error.message);
      }
      return;
    }
    const n = data?.length ?? 0;
    if (n > 0) console.log(`[settle-group] startup recovery: abandoned ${n} stale operation(s)`);
  } catch (e) {
    console.warn("[settle-group] startup recovery exception:", e.message);
  }
}
var _PHASE_ORDER = {
  pregame: 0,
  halftime: 1,
  fourth: 2,
  final_push: 3,
  penalties: 4
};
async function buildSettlementQueue(supabase) {
  const { data: rawProps, error } = await supabase.from("gameday_props").select(
    `id, question, answer_options, status, template_prop_id,
       gameday_pick_cards(
         id, phase, status, room_id,
         gameday_rooms(
           id, room_code, room_name, status, experience_type,
           team_a_name, team_b_name, team_a_star, team_b_star,
           game_date, sport
         )
       )`
  ).neq("status", "settled");
  if (error) return { error: error.message };
  const props = rawProps ?? [];
  const eligible2 = props.filter((p) => {
    const card = p.gameday_pick_cards;
    const room = card?.gameday_rooms;
    return card?.status === "locked" && room?.status === "active" && room?.experience_type !== "fantasy";
  });
  const eventMap = /* @__PURE__ */ new Map();
  const LEGACY_KEY = "__legacy__";
  for (const prop of eligible2) {
    const card = prop.gameday_pick_cards;
    const room = card?.gameday_rooms;
    const evKey = buildEventKey(room?.sport, room?.team_a_name, room?.team_b_name, room?.game_date);
    const mapKey = evKey ?? LEGACY_KEY + "|" + (room?.id ?? "unknown");
    if (!eventMap.has(mapKey)) {
      eventMap.set(mapKey, {
        event_key: evKey,
        is_legacy: !evKey,
        team_a: room?.team_a_name ?? "Unknown",
        team_b: room?.team_b_name ?? "Unknown",
        game_date: room?.game_date ?? null,
        sport: room?.sport ?? null,
        groups: /* @__PURE__ */ new Map()
      });
    }
    const event = eventMap.get(mapKey);
    const options = prop.answer_options ?? [];
    const normQuestion = (prop.question ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const normOptions = options.map((o) => normalizeAnswerOption(o)).sort();
    const grpKey = evKey ? buildGroupKey(evKey, card?.phase ?? "", prop.question ?? "", options) : `${mapKey}|${card?.phase ?? ""}|${normQuestion}|${normOptions.join("||")}`;
    if (!event.groups.has(grpKey)) {
      event.groups.set(grpKey, {
        group_key: grpKey,
        phase: card?.phase ?? "",
        question: prop.question ?? "",
        answer_options: options,
        normalized_options: normOptions,
        prop_ids: [],
        room_ids: /* @__PURE__ */ new Set(),
        template_prop_ids: /* @__PURE__ */ new Set(),
        unique_questions: /* @__PURE__ */ new Set()
      });
    }
    const grp = event.groups.get(grpKey);
    grp.prop_ids.push(prop.id);
    grp.room_ids.add(card.room_id);
    grp.template_prop_ids.add(prop.template_prop_id ?? null);
    grp.unique_questions.add(normQuestion);
  }
  const events = [];
  for (const [, ev] of eventMap) {
    const groupsOut = [];
    for (const [, grp] of ev.groups) {
      const templateIds = [...grp.template_prop_ids].filter(Boolean);
      const uniqueTemplates = new Set(templateIds);
      let templateConsistency;
      if (grp.template_prop_ids.has(null) && templateIds.length === 0) {
        templateConsistency = "none";
      } else if (uniqueTemplates.size <= 1) {
        templateConsistency = "consistent";
      } else {
        templateConsistency = "mixed";
      }
      const conflicts = [];
      if (grp.unique_questions.size > 1) {
        conflicts.push(
          `${grp.unique_questions.size} slightly different question texts detected \u2014 review before settling`
        );
      }
      if (templateConsistency === "mixed") {
        conflicts.push(
          `Props link to ${uniqueTemplates.size} different template IDs (${[...uniqueTemplates].join(", ")})`
        );
      }
      const answer_map = grp.answer_options.map((stored) => {
        const normalized = normalizeAnswerOption(stored);
        const roundTripResult = mapNormalizedToStored(stored, grp.answer_options);
        return { stored, normalized, round_trips: roundTripResult === stored };
      });
      const ambiguousDetails = detectAmbiguousOptions(grp.answer_options);
      const hasAmbiguous = ambiguousDetails.length > 0;
      if (hasAmbiguous) {
        conflicts.push(`Answer options are ambiguous after normalization \u2014 bulk settlement blocked`);
      }
      let settlement_status;
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
        settlement_status
      });
    }
    groupsOut.sort((a, b) => {
      const pa = _PHASE_ORDER[a.phase] ?? 9;
      const pb = _PHASE_ORDER[b.phase] ?? 9;
      if (pa !== pb) return pa - pb;
      return a.question.localeCompare(b.question);
    });
    const totalPropsEv = groupsOut.reduce((s, g) => s + g.prop_count, 0);
    const safeCount = groupsOut.filter((g) => g.settlement_status === "safe").length;
    const reviewCount = groupsOut.filter((g) => g.settlement_status === "review_required").length;
    const manualCount = groupsOut.filter((g) => g.settlement_status === "manual_only").length;
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
      groups: groupsOut
    });
  }
  events.sort((a, b) => {
    if (a.is_legacy !== b.is_legacy) return a.is_legacy ? 1 : -1;
    return (a.game_date ?? "").localeCompare(b.game_date ?? "");
  });
  const totalGroups = events.reduce((s, e) => s + e.group_count, 0);
  const totalProps = events.reduce((s, e) => s + e.prop_count, 0);
  const totalSafe = events.reduce((s, e) => s + e.safe_count, 0);
  const totalReview = events.reduce((s, e) => s + e.review_count, 0);
  const totalManual = events.reduce((s, e) => s + e.manual_count, 0);
  return {
    events,
    total_events: events.length,
    total_groups: totalGroups,
    total_props: totalProps,
    total_safe: totalSafe,
    total_review: totalReview,
    total_manual: totalManual
  };
}
var ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var PUBLIC_ROOM_FIELDS = [
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
  "countdown_started_at"
].join(", ");
var LEGACY_PUBLIC_ROOM_FIELDS = [
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
  "countdown_started_at"
].join(", ");
async function generateUniqueRoomCode(supabase) {
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = "";
    for (let i = 0; i < 5; i++) {
      suffix += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    const code = `GDS-${suffix}`;
    const { data } = await supabase.from("gameday_rooms").select("id").eq("room_code", code).maybeSingle();
    if (!data) return code;
  }
  throw new Error("Failed to generate a unique room code after 10 attempts");
}
function currentYearCDT() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric"
  }).format(/* @__PURE__ */ new Date());
}
function parseGameDate(raw) {
  if (!raw?.trim()) return null;
  const MONTHS = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12"
  };
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
  const parts = raw.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const monthKey = parts[0].slice(0, 3).toLowerCase();
  const month = MONTHS[monthKey];
  const day = parts[1].replace(/\D/g, "").padStart(2, "0");
  if (!month || !day) return null;
  const year = parts[2] ? parts[2].replace(/\D/g, "") : currentYearCDT();
  return `${year}-${month}-${day}`;
}
function getAllowedGamedayEmails() {
  return (process.env.GAMEDAY_HOST_EMAILS ?? "darius@leagueswype.com").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
function getAllowedGamedayAdminEmails() {
  return (process.env.GAMEDAY_ADMIN_EMAILS ?? process.env.GAMEDAY_HOST_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
async function getVerifiedGamedayUser(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const supabase = getServiceSupabase();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser(token);
  if (error || !user?.id || !user.email) return null;
  return { id: user.id, email: user.email };
}
async function requireGamedayHost(req, res2) {
  const user = await getVerifiedGamedayUser(req);
  if (!user) {
    res2.status(401).json({ error: "Invalid or expired Supabase token" });
    return null;
  }
  if (!getAllowedGamedayEmails().includes(user.email.toLowerCase())) {
    res2.status(403).json({ error: "Not authorized as Game Day host" });
    return null;
  }
  return user.id;
}
var APP_URL2 = process.env.EXPO_PUBLIC_APP_URL ?? "https://www.swayger.app";
function isBotApiKeyValid(req) {
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
function normalizeDiscordGuildId(value) {
  if (typeof value !== "string") return null;
  const guildId = value.trim();
  if (!guildId || guildId.length > 128 || /[\u0000-\u001f\u007f]/.test(guildId)) {
    return null;
  }
  return guildId;
}
function getRequestedDiscordGuildId(req, body) {
  return normalizeDiscordGuildId(
    req.header("x-discord-guild-id") ?? body?.discord_guild_id
  );
}
async function requireDiscordGuildRoom(req, res2, supabase, roomId) {
  if (!isBotApiKeyValid(req)) {
    res2.status(401).json({ error: "Valid Game Day bot credentials are required" });
    return null;
  }
  const guildId = getRequestedDiscordGuildId(req);
  if (!guildId) {
    res2.status(400).json({
      error: "X-Discord-Guild-ID is required for Discord operator requests"
    });
    return null;
  }
  const { data: room } = await supabase.from("gameday_rooms").select("id, source, discord_guild_id").eq("id", roomId).maybeSingle();
  if (!room) {
    res2.status(404).json({ error: "Room not found" });
    return null;
  }
  const storedGuildId = normalizeDiscordGuildId(
    room.discord_guild_id
  );
  if (room.source !== "discord" || !storedGuildId || storedGuildId !== guildId) {
    res2.status(403).json({ error: "Discord guild is not authorized for this room" });
    return null;
  }
  return { roomId, guildId };
}
function requireOwnedHumanRoom(res2, storedHostId, hostId) {
  if (!storedHostId || storedHostId !== hostId) {
    res2.status(403).json({ error: "Not your room" });
    return false;
  }
  return true;
}
async function requireGamedayRoomOperator(req, res2, supabase, roomId) {
  if (isBotApiKeyValid(req)) {
    const discordAccess = await requireDiscordGuildRoom(req, res2, supabase, roomId);
    if (!discordAccess) return null;
    return { kind: "discord", hostId: null, guildId: discordAccess.guildId };
  }
  const hostId = await requireGamedayHost(req, res2);
  if (!hostId) return null;
  const { data: room } = await supabase.from("gameday_rooms").select("host_user_id").eq("id", roomId).maybeSingle();
  if (!room) {
    res2.status(404).json({ error: "Room not found" });
    return null;
  }
  if (!requireOwnedHumanRoom(res2, room.host_user_id, hostId)) {
    return null;
  }
  return { kind: "web", hostId, guildId: null };
}
function isUuidLike(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
async function resolveRoomRef(supabase, roomRef) {
  if (isUuidLike(roomRef)) return roomRef;
  const { data } = await supabase.from("gameday_rooms").select("id").eq("room_code", roomRef.toUpperCase().trim()).maybeSingle();
  return data?.id ?? null;
}
async function getCallerIdentity(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const supabase = getServiceSupabase();
    const {
      data: { user }
    } = await supabase.auth.getUser(auth.slice(7));
    if (user) return { userId: user.id, guestSessionId: null };
  }
  const guestSession = req.headers["x-guest-session"] || null;
  return { userId: null, guestSessionId: guestSession };
}
async function logEvent(supabase, roomId, participantId, userId, eventType, metadata) {
  try {
    await supabase.from("gameday_events").insert({
      room_id: roomId,
      participant_id: participantId,
      user_id: userId,
      event_type: eventType,
      metadata: metadata ?? null
    });
  } catch {
  }
}
function normalizeSlateList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value.filter((item) => typeof item === "string").map((item) => item.replace(/[\u0000-\u001f\u007f]/g, "").trim()).filter((item) => item.length > 0 && item.length <= 100)
  )].slice(0, 32);
}
function normalizeSundaySlateConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value;
  const teams = normalizeSlateList(raw.sunday_night_teams);
  const earlyMatchups = normalizeSlateList(raw.early_matchups);
  const lateMatchups = normalizeSlateList(raw.late_matchups);
  const config = {
    early_matchups: earlyMatchups,
    late_matchups: lateMatchups,
    sunday_night_teams: [teams[0] ?? "", teams[1] ?? ""],
    qb_candidates: normalizeSlateList(raw.qb_candidates),
    rb_candidates: normalizeSlateList(raw.rb_candidates),
    receiver_candidates: normalizeSlateList(raw.receiver_candidates),
    team_candidates: normalizeSlateList(raw.team_candidates),
    game_candidates: normalizeSlateList(raw.game_candidates)
  };
  if (!config.sunday_night_teams[0] || !config.sunday_night_teams[1] || !config.early_matchups.length || !config.late_matchups.length || !config.qb_candidates.length || !config.rb_candidates.length || !config.receiver_candidates.length || !config.team_candidates.length) return null;
  if (!config.game_candidates.length) {
    config.game_candidates = [.../* @__PURE__ */ new Set([...earlyMatchups, ...lateMatchups])];
  }
  return config;
}
function withUniqueOutcomeOptions(options, includeOther = true) {
  const next = [...options];
  if (includeOther && !next.includes("Other")) next.push("Other");
  if (!next.includes("Tie / Multiple tied")) next.push("Tie / Multiple tied");
  return next;
}
function resolveSundaySlateAnswers(answers, vars, slate) {
  const tokenOptions = {
    "{{SLATE_QBS}}": withUniqueOutcomeOptions(slate.qb_candidates),
    "{{SLATE_RBS}}": withUniqueOutcomeOptions(slate.rb_candidates),
    "{{SLATE_RECEIVERS}}": withUniqueOutcomeOptions(slate.receiver_candidates),
    "{{SLATE_TEAMS}}": withUniqueOutcomeOptions(slate.team_candidates),
    "{{SLATE_EARLY_GAMES}}": withUniqueOutcomeOptions(slate.early_matchups, false),
    "{{SLATE_LATE_GAMES}}": withUniqueOutcomeOptions(slate.late_matchups, false)
  };
  return answers.flatMap((answer) => tokenOptions[answer] ?? [resolvePlaceholders(answer, vars)]);
}
function registerGamedayRoutes(app2) {
  setImmediate(() => {
    try {
      _recoverStaleSettleOps(getServiceSupabase()).catch((error) => {
        console.error("[settle-group] startup recovery error:", error instanceof Error ? error.message : error);
      });
    } catch (error) {
      console.error("[settle-group] startup recovery unavailable:", error instanceof Error ? error.message : error);
    }
  });
  app2.use("/api/gameday", (req, res2, next) => {
    res2.setHeader("Cache-Control", "no-store");
    Object.defineProperty(req, "fresh", { get: () => false, configurable: true });
    next();
  });
  app2.get("/api/gameday/is-host", async (req, res2) => {
    const user = await getVerifiedGamedayUser(req);
    const email = user?.email ?? "";
    const isHost = !!user && getAllowedGamedayEmails().includes(email.toLowerCase());
    console.log(`[gameday] is-host: verified_email="${email}" allowed=${JSON.stringify(getAllowedGamedayEmails())} \u2192 ${isHost}`);
    res2.json({ isHost });
  });
  app2.get("/api/admin/is-admin", async (req, res2) => {
    const user = await getVerifiedGamedayUser(req);
    const email = (user?.email ?? "").toLowerCase();
    res2.json({ isAdmin: !!user && getAllowedGamedayAdminEmails().includes(email) });
  });
  app2.get("/api/gameday/public-rooms", async (req, res2) => {
    const supabase = getServiceSupabase();
    const { data: rooms, error } = await supabase.from("gameday_rooms").select("id, room_name, team_a_name, team_b_name, game_date, status, room_code").eq("is_private", false).is("archived_at", null).neq("status", "finalized").order("created_at", { ascending: false });
    if (error) {
      console.error("[gameday] public-rooms error:", error.message);
      res2.status(500).json({ error: error.message });
      return;
    }
    res2.json({ rooms: rooms ?? [] });
  });
  app2.get("/api/gameday/rooms", async (req, res2) => {
    const user = await getVerifiedGamedayUser(req);
    if (!user) {
      res2.status(401).json({ error: "Invalid or expired Supabase token" });
      return;
    }
    if (!getAllowedGamedayEmails().includes(user.email.toLowerCase())) {
      res2.status(403).json({ error: "Not authorized as Game Day host" });
      return;
    }
    const supabase = getServiceSupabase();
    const isAdminUser = getAllowedGamedayAdminEmails().includes(user.email.toLowerCase());
    let baseQuery = supabase.from("gameday_rooms").select("id, room_name, team_a_name, team_b_name, game_date, status, created_at, room_code, source, archived_at").order("created_at", { ascending: false });
    if (!isAdminUser) baseQuery = baseQuery.eq("host_user_id", user.id);
    let { data: rooms, error } = await baseQuery;
    if (error) {
      console.warn("[gameday] rooms list with room_code/source failed, retrying without:", error.message);
      let retryQuery = supabase.from("gameday_rooms").select("id, room_name, team_a_name, team_b_name, game_date, status, created_at, archived_at").order("created_at", { ascending: false });
      if (!isAdminUser) retryQuery = retryQuery.eq("host_user_id", user.id);
      const retry = await retryQuery;
      if (retry.error) {
        res2.status(500).json({ error: retry.error.message });
        return;
      }
      rooms = retry.data;
    }
    const roomList = rooms ?? [];
    console.log("[gameday] rooms list:", roomList.map((r) => ({ id: r.id.slice(0, 8), room_code: r.room_code ?? "null" })));
    await Promise.all(
      roomList.map(async (r) => {
        if (!r.room_code) {
          try {
            const newCode = await generateUniqueRoomCode(supabase);
            const { error: updErr } = await supabase.from("gameday_rooms").update({ room_code: newCode }).eq("id", r.id);
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
    const roomIds = roomList.map((r) => r.id);
    let counts = {};
    if (roomIds.length > 0) {
      const { data: pRows } = await supabase.from("gameday_participants").select("room_id").in("room_id", roomIds);
      (pRows ?? []).forEach((p) => {
        counts[p.room_id] = (counts[p.room_id] ?? 0) + 1;
      });
    }
    res2.json({
      rooms: roomList.map((r) => ({
        ...r,
        participant_count: counts[r.id] ?? 0,
        host_link: `${APP_URL2}/gameday/${r.id}/host`
      }))
    });
  });
  app2.get("/api/gameday/template", async (req, res2) => {
    const sportParam = (req.query.sport ?? "nba").trim().toLowerCase();
    const templateType = (req.query.template_type ?? "").trim().toLowerCase();
    if (!["nba", "soccer", "nfl"].includes(sportParam)) {
      res2.status(400).json({ error: "sport must be nba, soccer, or nfl" });
      return;
    }
    if (templateType === "nfl_sunday_slate") {
      if (sportParam !== "nfl") {
        res2.status(400).json({ error: "nfl_sunday_slate is only available for NFL rooms" });
        return;
      }
      res2.json({ template: NFL_SUNDAY_SLATE_TEMPLATE, defaultPropIds: NFL_SUNDAY_SLATE_DEFAULT_PROP_IDS });
      return;
    }
    const supabase = getServiceSupabase();
    try {
      let libraryQuery = supabase.from("gameday_prop_library").select("id, phase, question, answer_options, settlement_window, is_default").eq("sport", sportParam).eq("is_active", true).order("display_order", { ascending: true });
      if (sportParam === "nfl" && templateType === "nfl_single_game") {
        libraryQuery = libraryQuery.eq("template_type", "nfl_single_game");
      } else if (sportParam === "nfl" && !templateType) {
        libraryQuery = libraryQuery.or("template_type.is.null,template_type.eq.nfl_single_game");
      }
      const { data: libraryProps, error } = await libraryQuery;
      if (!error && libraryProps && libraryProps.length > 0) {
        const template = libraryProps.map((p) => ({
          id: p.id,
          phase: p.phase,
          question: p.question,
          answers: p.answer_options,
          settlement_window: p.settlement_window
        }));
        const defaultPropIds = libraryProps.filter((p) => p.is_default).map((p) => p.id);
        res2.json({ template, defaultPropIds });
        return;
      }
    } catch (e) {
      console.warn("[gameday] prop library query failed, falling back to hardcoded:", e);
    }
    const fallback = sportParam === "soccer" ? { template: FIFA_TEMPLATE, defaultPropIds: FIFA_DEFAULT_PROP_IDS } : sportParam === "nfl" ? { template: NFL_TEMPLATE, defaultPropIds: NFL_DEFAULT_PROP_IDS } : { template: NBA_PLAYOFF_TEMPLATE, defaultPropIds: DEFAULT_PROP_IDS };
    res2.json(fallback);
  });
  app2.post("/api/gameday/rooms", async (req, res2) => {
    let hostId = null;
    const botAuthed = isBotApiKeyValid(req);
    if (!botAuthed) {
      hostId = await requireGamedayHost(req, res2);
      if (!hostId) return;
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
      card_schedules
    } = req.body;
    const room_name = _room_name ?? game_label;
    const requestedSource = typeof source === "string" ? source.trim().toLowerCase() : "";
    const discordGuildId = normalizeDiscordGuildId(discord_guild_id);
    if (botAuthed) {
      if (!discordGuildId) {
        res2.status(400).json({
          error: "discord_guild_id is required for Discord-created rooms"
        });
        return;
      }
      if (requestedSource && requestedSource !== "discord") {
        res2.status(400).json({
          error: "Discord bot room creation must use source=discord"
        });
        return;
      }
    } else if (requestedSource === "discord" || discordGuildId || discord_channel_id || discord_user_id) {
      res2.status(400).json({
        error: "Discord metadata can only be supplied by the Game Day bot"
      });
      return;
    }
    const normalizedSport = (sport ?? "nba").trim().toLowerCase();
    if (!["nba", "soccer", "nfl"].includes(normalizedSport)) {
      res2.status(400).json({ error: "sport must be nba, soccer, or nfl" });
      return;
    }
    const isSoccer = normalizedSport === "soccer";
    const isNfl = normalizedSport === "nfl";
    const requestedTemplateType = typeof template_type === "string" ? template_type.trim().toLowerCase() : "";
    if (requestedTemplateType && !["nfl_single_game", "nfl_sunday_slate"].includes(requestedTemplateType)) {
      res2.status(400).json({ error: "template_type must be nfl_single_game or nfl_sunday_slate" });
      return;
    }
    if (requestedTemplateType && !isNfl) {
      res2.status(400).json({ error: "template_type is only supported for NFL rooms" });
      return;
    }
    const isSundaySlate = isNfl && requestedTemplateType === "nfl_sunday_slate";
    const normalizedSlateConfig = isSundaySlate ? normalizeSundaySlateConfig(slate_config) : null;
    if (isSundaySlate && !normalizedSlateConfig) {
      res2.status(400).json({
        error: "Sunday Slate needs Early and Late matchups, Sunday Night teams, and QB, RB, WR/TE, and team candidates."
      });
      return;
    }
    const effectiveTeamA = isSundaySlate ? normalizedSlateConfig.sunday_night_teams[0] : team_a_name?.trim();
    const effectiveTeamB = isSundaySlate ? normalizedSlateConfig.sunday_night_teams[1] : team_b_name?.trim();
    const effectiveStarA = isSundaySlate ? normalizedSlateConfig.qb_candidates[0] : team_a_star?.trim();
    const effectiveStarB = isSundaySlate ? normalizedSlateConfig.qb_candidates[1] ?? normalizedSlateConfig.qb_candidates[0] : team_b_star?.trim();
    if (!room_name || !effectiveTeamA || !effectiveTeamB || !effectiveStarA || !effectiveStarB) {
      res2.status(400).json({ error: "Missing required room details." });
      return;
    }
    const activeTemplate = isSoccer ? FIFA_TEMPLATE : isSundaySlate ? NFL_SUNDAY_SLATE_TEMPLATE : isNfl ? NFL_TEMPLATE : NBA_PLAYOFF_TEMPLATE;
    const defaultPropIds = isSoccer ? FIFA_DEFAULT_PROP_IDS : isSundaySlate ? NFL_SUNDAY_SLATE_DEFAULT_PROP_IDS : isNfl ? NFL_DEFAULT_PROP_IDS : DEFAULT_PROP_IDS;
    const propIds = selected_prop_ids ?? defaultPropIds;
    const supabase = getServiceSupabase();
    let roomCode;
    try {
      roomCode = await generateUniqueRoomCode(supabase);
    } catch (e) {
      console.warn("[gameday] room_code generation skipped:", e);
    }
    const resolvedIsPrivate = botAuthed ? true : is_private ?? true;
    const insertPayload = {
      room_name: room_name.trim(),
      team_a_name: effectiveTeamA,
      team_b_name: effectiveTeamB,
      team_a_star: effectiveStarA,
      team_b_star: effectiveStarB,
      game_date: parseGameDate(game_date),
      host_user_id: botAuthed ? null : hostId,
      status: "active",
      source: botAuthed ? "discord" : "app",
      is_private: resolvedIsPrivate
    };
    if (roomCode) insertPayload.room_code = roomCode;
    if (botAuthed) {
      insertPayload.discord_guild_id = discordGuildId;
      if (discord_channel_id) insertPayload.discord_channel_id = discord_channel_id;
      if (discord_user_id) insertPayload.discord_user_id = discord_user_id;
    }
    if (sport !== void 0) insertPayload.sport = normalizedSport;
    if (isSundaySlate || requestedTemplateType) {
      insertPayload.template_type = isSundaySlate ? "nfl_sunday_slate" : "nfl_single_game";
    }
    if (normalizedSlateConfig) insertPayload.slate_config = normalizedSlateConfig;
    if (game_start_time) insertPayload.game_start_time = game_start_time;
    let { data: room, error: roomError } = await supabase.from("gameday_rooms").insert(insertPayload).select().single();
    if (roomError && roomCode && roomError.message?.includes("room_code")) {
      console.warn("[gameday] room_code column missing \u2014 retrying without it (run migration)");
      delete insertPayload.room_code;
      const retry = await supabase.from("gameday_rooms").insert(insertPayload).select().single();
      room = retry.data;
      roomError = retry.error;
    }
    if (roomError || !room) {
      console.error("[gameday] create room error:", roomError);
      res2.status(500).json({
        error: `Could not create room: ${roomError?.message ?? "unknown database error"}`
      });
      return;
    }
    const cardPhases = isSoccer ? [
      { title: "Pregame Picks", phase: "pregame", display_order: 0 },
      { title: "Halftime Picks", phase: "halftime", display_order: 1 },
      { title: "Final Push \u{1F525}", phase: "final_push", display_order: 2 },
      { title: "Penalty Shootout \u26BD", phase: "penalties", display_order: 3 }
    ] : isSundaySlate ? [
      { title: "Early Slate Picks", phase: "pregame", display_order: 0 },
      { title: "Late Slate Picks", phase: "halftime", display_order: 1 },
      { title: "Sunday Night Picks", phase: "fourth", display_order: 2 }
    ] : [
      { title: "Pregame Picks", phase: "pregame", display_order: 0 },
      { title: "Halftime Picks", phase: "halftime", display_order: 1 },
      { title: "4Q Clutch Picks", phase: "fourth", display_order: 2 }
    ];
    const vars = {
      TEAM_A: effectiveTeamA,
      TEAM_B: effectiveTeamB,
      STAR_A: effectiveStarA,
      STAR_B: effectiveStarB
    };
    for (const cardDef of cardPhases) {
      const cardSchedule = card_schedules?.[cardDef.phase] ?? {};
      const { data: card, error: cardError } = await supabase.from("gameday_pick_cards").insert({
        room_id: room.id,
        ...cardDef,
        status: "closed",
        ...cardSchedule.open_at ? { scheduled_open_at: cardSchedule.open_at } : {},
        ...cardSchedule.lock_at ? { scheduled_lock_at: cardSchedule.lock_at } : {}
      }).select().single();
      if (cardError || !card) {
        await supabase.from("gameday_rooms").delete().eq("id", room.id);
        console.error("[gameday] create card error:", cardError);
        res2.status(500).json({ error: "Could not create all pick cards" });
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
          answer_options: isSundaySlate ? resolveSundaySlateAnswers(tmpl.answers, vars, normalizedSlateConfig) : tmpl.answers.map((a) => resolvePlaceholders(a, vars)),
          display_order: i,
          status: "pending",
          template_prop_id: tmpl.id
        });
        if (propError) {
          await supabase.from("gameday_rooms").delete().eq("id", room.id);
          console.error("[gameday] create prop error:", propError);
          res2.status(500).json({ error: "Could not create all pick props" });
          return;
        }
      }
    }
    if (botAuthed || insertPayload.source === "discord") {
      const { data: pregameCard } = await supabase.from("gameday_pick_cards").select("id").eq("room_id", room.id).eq("phase", "pregame").single();
      if (pregameCard) {
        await supabase.from("gameday_pick_cards").update({ status: "open", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", pregameCard.id);
        console.log(`[gameday] pregame card auto-opened for discord room ${room.id}`);
      }
    }
    await logEvent(supabase, room.id, null, botAuthed ? null : hostId, "room_created");
    console.log(`[gameday] room created: ${room.id} "${room_name}" source=${insertPayload.source}`);
    const returnedCode = room.room_code ?? roomCode ?? null;
    const publicLink = returnedCode ? `${APP_URL2}/g/${returnedCode}` : `${APP_URL2}/gameday/${room.id}`;
    const hostLink = `${APP_URL2}/gameday/${room.id}/host`;
    res2.json({
      ok: true,
      room_id: room.id,
      room_code: returnedCode,
      public_link: publicLink,
      host_link: hostLink,
      room
    });
  });
  app2.get("/api/gameday/rooms/by-code/:roomCode", async (req, res2) => {
    const roomCode = (req.params.roomCode ?? "").toUpperCase().trim();
    if (!roomCode) {
      res2.status(400).json({ error: "Missing room code" });
      return;
    }
    const supabase = getServiceSupabase();
    const { data: room } = await supabase.from("gameday_rooms").select("id").eq("room_code", roomCode).maybeSingle();
    if (!room) {
      res2.status(404).json({ error: "Room not found" });
      return;
    }
    res2.json({ room_id: room.id });
  });
  app2.get(
    "/api/gameday/rooms/:roomId",
    async (req, res2) => {
      const { roomId } = req.params;
      const supabase = getServiceSupabase();
      let { data: room, error } = await supabase.from("gameday_rooms").select(PUBLIC_ROOM_FIELDS).eq("id", roomId).single();
      if (error?.message?.includes("template_type") || error?.message?.includes("slate_config")) {
        const legacy = await supabase.from("gameday_rooms").select(LEGACY_PUBLIC_ROOM_FIELDS).eq("id", roomId).single();
        room = legacy.data;
        error = legacy.error;
      }
      if (error || !room) {
        res2.status(404).json({ error: "Room not found" });
        return;
      }
      const { data: rawCards } = await supabase.from("gameday_pick_cards").select(
        "id, room_id, title, phase, status, lock_label, display_order, created_at, updated_at, gameday_props(id, card_id, question, answer_options, correct_answer, status, display_order)"
      ).eq("room_id", roomId).order("display_order");
      const cards = (rawCards ?? []).map((card) => ({
        ...card,
        gameday_props: [...card.gameday_props ?? []].sort(
          (a, b) => a.display_order - b.display_order
        )
      }));
      const { userId, guestSessionId } = await getCallerIdentity(req);
      console.log(
        `[gameday] room fetch ${roomId}: userId=${userId ? userId.slice(0, 8) + "\u2026" : "null"} guest=${guestSessionId ? guestSessionId.slice(0, 8) + "\u2026" : "null"}`
      );
      let participant = null;
      if (userId) {
        const { data } = await supabase.from("gameday_participants").select("id, room_id, display_name, is_guest, created_at").eq("room_id", roomId).eq("user_id", userId).maybeSingle();
        participant = data;
      } else if (guestSessionId) {
        const { data } = await supabase.from("gameday_participants").select("id, room_id, display_name, is_guest, created_at").eq("guest_session_id", guestSessionId).maybeSingle();
        participant = data;
      }
      console.log(
        `[gameday] room fetch ${roomId}: participant=${participant ? participant.id.slice(0, 8) + "\u2026" : "null"} is_guest=${participant?.is_guest ?? "n/a"}`
      );
      const allPropIds = cards.flatMap(
        (c) => (c.gameday_props ?? []).map((p) => p.id)
      );
      let myPicks = {};
      if (participant && allPropIds.length > 0) {
        const { data: picks } = await supabase.from("gameday_picks").select("prop_id, selected_answer").eq("participant_id", participant.id).in("prop_id", allPropIds);
        myPicks = Object.fromEntries(
          (picks ?? []).map((p) => [p.prop_id, p.selected_answer])
        );
      }
      const revealedPicks = {};
      for (const card of cards) {
        if (card.status === "locked" || card.status === "settled") {
          const propIds = (card.gameday_props ?? []).map(
            (p) => p.id
          );
          if (propIds.length === 0) continue;
          const { data: allPicks } = await supabase.from("gameday_picks").select("prop_id, selected_answer, gameday_participants(display_name)").in("prop_id", propIds);
          for (const pick of allPicks ?? []) {
            const pid = pick.prop_id;
            const ans = pick.selected_answer;
            const name = pick.gameday_participants?.display_name ?? "Unknown";
            if (!revealedPicks[pid]) revealedPicks[pid] = {};
            if (!revealedPicks[pid][ans]) revealedPicks[pid][ans] = [];
            revealedPicks[pid][ans].push(name);
          }
        }
      }
      const sanitizedCards = cards.map((card) => ({
        ...card,
        gameday_props: (card.gameday_props ?? []).map((prop) => ({
          ...prop,
          correct_answer: prop.status === "settled" ? prop.correct_answer : null
        }))
      }));
      const { count } = await supabase.from("gameday_participants").select("id", { count: "exact", head: true }).eq("room_id", roomId);
      res2.json({
        room,
        cards: sanitizedCards,
        participant,
        my_picks: myPicks,
        revealed_picks: revealedPicks,
        participant_count: count ?? 0
      });
    }
  );
  app2.post(
    "/api/gameday/rooms/:roomId/join",
    async (req, res2) => {
      const { roomId } = req.params;
      const supabase = getServiceSupabase();
      const { data: room } = await supabase.from("gameday_rooms").select("id, status, archived_at").eq("id", roomId).single();
      if (!room) {
        res2.status(404).json({ error: "Room not found" });
        return;
      }
      if (room.archived_at) {
        res2.status(410).json({ error: "This Game Day room is no longer active." });
        return;
      }
      const { userId, guestSessionId: existingSession } = await getCallerIdentity(req);
      if (userId) {
        const { data: existing } = await supabase.from("gameday_participants").select("*").eq("room_id", roomId).eq("user_id", userId).maybeSingle();
        if (existing) {
          res2.json({ participant: existing });
          return;
        }
        const { data: profile } = await supabase.from("profiles").select("display_name, username").eq("id", userId).maybeSingle();
        const rawName = profile?.display_name || profile?.username || "Player";
        let displayName = rawName;
        const { data: nameTaken2 } = await supabase.from("gameday_participants").select("id").eq("room_id", roomId).eq("display_name", displayName).maybeSingle();
        if (nameTaken2) {
          displayName = `${rawName} (2)`;
        }
        const { data: participant2, error: error2 } = await supabase.from("gameday_participants").insert({
          room_id: roomId,
          user_id: userId,
          display_name: displayName,
          is_guest: false
        }).select().single();
        if (error2) {
          console.error("[gameday] join error (logged-in):", error2);
          res2.status(500).json({
            error: `Could not join room: ${error2.message ?? "unknown database error"}`
          });
          return;
        }
        await logEvent(
          supabase,
          roomId,
          participant2.id,
          userId,
          "participant_joined",
          { participant_type: "logged_in" }
        );
        res2.json({ participant: participant2 });
        return;
      }
      const { display_name } = req.body;
      if (!display_name?.trim()) {
        res2.status(400).json({ error: "display_name is required" });
        return;
      }
      const trimmedName = display_name.trim();
      const { data: nameTaken } = await supabase.from("gameday_participants").select("id").eq("room_id", roomId).ilike("display_name", trimmedName).maybeSingle();
      if (nameTaken) {
        res2.status(409).json({
          error: `${trimmedName} is already taken in this room. Try ${trimmedName[0]}. or another name.`
        });
        return;
      }
      const guestSessionId = `gs_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
      const { data: participant, error } = await supabase.from("gameday_participants").insert({
        room_id: roomId,
        display_name: trimmedName,
        is_guest: true,
        guest_session_id: guestSessionId
      }).select().single();
      if (error) {
        console.error("[gameday] join error (guest):", error);
        if (error.code === "23505") {
          res2.status(409).json({ error: `${trimmedName} is already taken in this room.` });
          return;
        }
        res2.status(500).json({
          error: `Could not join room: ${error.message ?? "unknown database error"}`
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
      res2.json({ participant, guest_session_id: guestSessionId });
    }
  );
  app2.patch(
    "/api/gameday/cards/:cardId/open",
    async (req, res2) => {
      const { cardId } = req.params;
      const supabase = getServiceSupabase();
      const { data: card } = await supabase.from("gameday_pick_cards").select("id, room_id, gameday_rooms(host_user_id)").eq("id", cardId).single();
      if (!card) {
        res2.status(404).json({ error: "Card not found" });
        return;
      }
      const operator = await requireGamedayRoomOperator(req, res2, supabase, card.room_id);
      if (!operator) return;
      await supabase.from("gameday_pick_cards").update({ status: "closed", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("room_id", card.room_id).eq("status", "open");
      await supabase.from("gameday_pick_cards").update({ status: "open", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", cardId);
      await logEvent(supabase, card.room_id, null, operator.hostId, "card_opened", {
        card_id: cardId,
        operator: operator.kind
      });
      res2.json({ ok: true });
    }
  );
  app2.patch(
    "/api/gameday/cards/:cardId/lock",
    async (req, res2) => {
      const { cardId } = req.params;
      const supabase = getServiceSupabase();
      const { data: card } = await supabase.from("gameday_pick_cards").select("id, room_id, gameday_rooms(host_user_id)").eq("id", cardId).single();
      if (!card) {
        res2.status(404).json({ error: "Card not found" });
        return;
      }
      const operator = await requireGamedayRoomOperator(req, res2, supabase, card.room_id);
      if (!operator) return;
      await supabase.from("gameday_pick_cards").update({ status: "locked", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", cardId);
      await logEvent(supabase, card.room_id, null, operator.hostId, "card_locked", {
        card_id: cardId,
        operator: operator.kind
      });
      res2.json({ ok: true });
    }
  );
  app2.post(
    "/api/gameday/props/:propId/pick",
    async (req, res2) => {
      const { propId } = req.params;
      const { selected_answer } = req.body;
      if (!selected_answer) {
        res2.status(400).json({ error: "selected_answer is required" });
        return;
      }
      const supabase = getServiceSupabase();
      const { data: prop } = await supabase.from("gameday_props").select("*, gameday_pick_cards(status, room_id, gameday_rooms(archived_at))").eq("id", propId).single();
      if (!prop) {
        res2.status(404).json({ error: "Prop not found" });
        return;
      }
      const roomArchived = prop.gameday_pick_cards?.gameday_rooms?.archived_at;
      if (roomArchived) {
        res2.status(410).json({ error: "This Game Day room is no longer active." });
        return;
      }
      const cardStatus = prop.gameday_pick_cards?.status;
      if (cardStatus !== "open") {
        res2.status(400).json({ error: "This pick card is not open" });
        return;
      }
      const options = prop.answer_options;
      if (!options.includes(selected_answer)) {
        res2.status(400).json({ error: "Invalid answer option" });
        return;
      }
      const { userId, guestSessionId } = await getCallerIdentity(req);
      const roomId = prop.gameday_pick_cards?.room_id;
      let participant = null;
      if (userId) {
        const { data } = await supabase.from("gameday_participants").select("*").eq("room_id", roomId).eq("user_id", userId).maybeSingle();
        participant = data;
      } else if (guestSessionId) {
        const { data } = await supabase.from("gameday_participants").select("*").eq("guest_session_id", guestSessionId).maybeSingle();
        participant = data;
      }
      if (!participant) {
        res2.status(401).json({ error: "Join the room first before picking" });
        return;
      }
      const { data: pick, error } = await supabase.from("gameday_picks").upsert(
        {
          prop_id: propId,
          participant_id: participant.id,
          selected_answer,
          is_correct: null
        },
        { onConflict: "prop_id,participant_id" }
      ).select().single();
      if (error) {
        console.error("[gameday] pick error:", error);
        res2.status(500).json({
          error: `Could not save pick: ${error.message ?? "unknown database error"}`
        });
        return;
      }
      await logEvent(supabase, roomId, participant.id, userId, "pick_submitted", {
        prop_id: propId
      });
      res2.json({ ok: true, pick });
    }
  );
  app2.patch(
    "/api/gameday/props/:propId/settle",
    async (req, res2) => {
      const { propId } = req.params;
      const { correct_answer } = req.body;
      if (!correct_answer) {
        res2.status(400).json({ error: "correct_answer is required" });
        return;
      }
      const supabase = getServiceSupabase();
      const { data: prop } = await supabase.from("gameday_props").select(
        "id, answer_options, gameday_pick_cards(id, phase, status, room_id, gameday_rooms(host_user_id, status, room_code, source))"
      ).eq("id", propId).single();
      if (!prop) {
        res2.status(404).json({ error: "Prop not found" });
        return;
      }
      const card = prop.gameday_pick_cards;
      const gdRoom = card?.gameday_rooms;
      const operator = await requireGamedayRoomOperator(req, res2, supabase, card?.room_id);
      if (!operator) return;
      if (gdRoom?.status === "finalized") {
        res2.status(400).json({ error: "Room is finalized \u2014 results are read-only" });
        return;
      }
      const options = prop.answer_options;
      if (!options.includes(correct_answer)) {
        res2.status(400).json({ error: "Invalid correct answer" });
        return;
      }
      await settlePropCore(supabase, { propId, cardId: card.id, correctAnswer: correct_answer });
      const roomId = card?.room_id;
      await logEvent(supabase, roomId, null, operator.hostId, "prop_settled", {
        prop_id: propId,
        card_id: card?.id,
        phase: card?.phase,
        correct_answer,
        operator: operator.kind
      });
      res2.json({ ok: true });
    }
  );
  app2.patch(
    "/api/gameday/rooms/:roomId/finalize",
    async (req, res2) => {
      const { roomId } = req.params;
      const supabase = getServiceSupabase();
      const { data: room } = await supabase.from("gameday_rooms").select("host_user_id, status").eq("id", roomId).single();
      if (!room) {
        res2.status(404).json({ error: "Room not found" });
        return;
      }
      const operator = await requireGamedayRoomOperator(req, res2, supabase, roomId);
      if (!operator) return;
      if (room.status === "finalized") {
        console.log(`[gameday] finalize: room ${roomId} already finalized`);
        res2.json({ ok: true, already: true });
        return;
      }
      console.log(`[gameday] finalize: attempting to write status=finalized for room ${roomId}, operator=${operator.kind}, stored host_user_id=${room.host_user_id}`);
      const { error: updateError } = await supabase.from("gameday_rooms").update({ status: "finalized" }).eq("id", roomId);
      if (updateError) {
        console.error(`[gameday] finalize: DB update FAILED for room ${roomId}:`, updateError.message, updateError);
        res2.status(500).json({ error: `Failed to finalize room: ${updateError.message}` });
        return;
      }
      const { data: verify } = await supabase.from("gameday_rooms").select("status").eq("id", roomId).single();
      console.log(`[gameday] finalize: write confirmed, status is now: ${verify?.status}`);
      await logEvent(supabase, roomId, null, operator.hostId, "room_finalized", {
        operator: operator.kind
      });
      res2.json({ ok: true });
    }
  );
  app2.patch(
    "/api/gameday/rooms/:roomId/archive",
    async (req, res2) => {
      const hostId = await requireGamedayHost(req, res2);
      if (!hostId) return;
      const { roomId } = req.params;
      const supabase = getServiceSupabase();
      const { data: room } = await supabase.from("gameday_rooms").select("host_user_id, status, archived_at, source").eq("id", roomId).single();
      if (!room) {
        res2.status(404).json({ error: "Room not found" });
        return;
      }
      if (!requireOwnedHumanRoom(res2, room.host_user_id, hostId)) return;
      if (room.status === "finalized") {
        res2.status(400).json({
          error: "Finalized rooms cannot be archived \u2014 they are preserved as receipts."
        });
        return;
      }
      if (room.archived_at) {
        res2.json({ ok: true, already: true });
        return;
      }
      const { error: updateError } = await supabase.from("gameday_rooms").update({ archived_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", roomId);
      if (updateError) {
        console.error("[gameday] archive error:", updateError.message);
        res2.status(500).json({ error: "Failed to archive room" });
        return;
      }
      await logEvent(supabase, roomId, null, hostId, "room_archived", {
        archived_by: hostId,
        source: room.source ?? "app"
      });
      console.log(`[gameday] room archived: ${roomId} by ${hostId.slice(0, 8)}\u2026`);
      res2.json({ ok: true });
    }
  );
  app2.patch(
    "/api/gameday/rooms/:roomId/rename",
    async (req, res2) => {
      const hostId = await requireGamedayHost(req, res2);
      if (!hostId) return;
      const { roomId } = req.params;
      const { room_name } = req.body;
      const trimmed = (room_name ?? "").trim();
      if (!trimmed) {
        res2.status(400).json({ error: "room_name is required" });
        return;
      }
      if (trimmed.length > 120) {
        res2.status(400).json({ error: "room_name must be 120 characters or fewer" });
        return;
      }
      const supabase = getServiceSupabase();
      const { data: room } = await supabase.from("gameday_rooms").select("host_user_id, archived_at").eq("id", roomId).single();
      if (!room) {
        res2.status(404).json({ error: "Room not found" });
        return;
      }
      if (!requireOwnedHumanRoom(res2, room.host_user_id, hostId)) return;
      if (room.archived_at) {
        res2.status(400).json({ error: "Archived rooms cannot be renamed" });
        return;
      }
      const { error: updateError } = await supabase.from("gameday_rooms").update({ room_name: trimmed }).eq("id", roomId);
      if (updateError) {
        console.error("[gameday] rename error:", updateError.message);
        res2.status(500).json({ error: "Failed to rename room" });
        return;
      }
      await logEvent(supabase, roomId, null, hostId, "room_renamed", {
        new_name: trimmed
      });
      console.log(`[gameday] room renamed: ${roomId} \u2192 "${trimmed}"`);
      res2.json({ ok: true, room_name: trimmed });
    }
  );
  app2.patch(
    "/api/gameday/rooms/:roomId/visibility",
    async (req, res2) => {
      const hostId = await requireGamedayHost(req, res2);
      if (!hostId) return;
      const { roomId } = req.params;
      const { is_private } = req.body;
      if (typeof is_private !== "boolean") {
        res2.status(400).json({ error: "is_private must be a boolean" });
        return;
      }
      const supabase = getServiceSupabase();
      const { data: room } = await supabase.from("gameday_rooms").select("host_user_id, archived_at").eq("id", roomId).single();
      if (!room) {
        res2.status(404).json({ error: "Room not found" });
        return;
      }
      if (!requireOwnedHumanRoom(res2, room.host_user_id, hostId)) return;
      const { error: updateError } = await supabase.from("gameday_rooms").update({ is_private }).eq("id", roomId);
      if (updateError) {
        console.error("[gameday] visibility update error:", updateError.message);
        res2.status(500).json({ error: "Failed to update visibility" });
        return;
      }
      console.log(`[gameday] room ${roomId} visibility \u2192 is_private=${is_private}`);
      res2.json({ ok: true, is_private });
    }
  );
  app2.post(
    "/api/gameday/rooms/:roomId/duplicate",
    async (req, res2) => {
      const hostId = await requireGamedayHost(req, res2);
      if (!hostId) return;
      const { roomId } = req.params;
      const { room_name: customName } = req.body;
      const supabase = getServiceSupabase();
      const sourceRoomResult = await supabase.from("gameday_rooms").select("id, host_user_id, room_name, team_a_name, team_b_name, team_a_star, team_b_star, game_date, game_start_time, sport, template_type, slate_config, is_private").eq("id", roomId).single();
      let srcRoom = sourceRoomResult.data;
      let srcRoomError = sourceRoomResult.error;
      if (srcRoomError?.message?.includes("template_type") || srcRoomError?.message?.includes("slate_config")) {
        const legacy = await supabase.from("gameday_rooms").select("id, host_user_id, room_name, team_a_name, team_b_name, team_a_star, team_b_star, game_date, game_start_time, sport, is_private").eq("id", roomId).single();
        srcRoom = legacy.data;
        srcRoomError = legacy.error;
      }
      if (srcRoomError || !srcRoom) {
        res2.status(404).json({ error: "Source room not found" });
        return;
      }
      if (!requireOwnedHumanRoom(res2, srcRoom.host_user_id, hostId)) return;
      const { data: srcCards } = await supabase.from("gameday_pick_cards").select("phase, title, display_order, scheduled_open_at, scheduled_lock_at, gameday_props(question, answer_options, display_order, template_prop_id)").eq("room_id", roomId).order("display_order");
      if (!srcCards || srcCards.length === 0) {
        res2.status(400).json({ error: "Source room has no cards to duplicate" });
        return;
      }
      const newName = (customName ?? "").trim() || `Copy of ${srcRoom.room_name}`;
      if (newName.length > 120) {
        res2.status(400).json({ error: "room_name must be 120 characters or fewer" });
        return;
      }
      let roomCode;
      try {
        roomCode = await generateUniqueRoomCode(supabase);
      } catch (e) {
        console.warn("[gameday] room_code generation skipped during duplicate:", e);
      }
      const newRoomPayload = {
        room_name: newName,
        team_a_name: srcRoom.team_a_name,
        team_b_name: srcRoom.team_b_name,
        team_a_star: srcRoom.team_a_star,
        team_b_star: srcRoom.team_b_star,
        game_date: srcRoom.game_date ?? null,
        game_start_time: srcRoom.game_start_time ?? null,
        host_user_id: hostId,
        status: "active",
        source: "app",
        is_private: srcRoom.is_private ?? true
      };
      if (srcRoom.sport) newRoomPayload.sport = srcRoom.sport;
      if (srcRoom.template_type) newRoomPayload.template_type = srcRoom.template_type;
      if (srcRoom.slate_config) newRoomPayload.slate_config = srcRoom.slate_config;
      if (roomCode) newRoomPayload.room_code = roomCode;
      const { data: newRoom, error: roomErr } = await supabase.from("gameday_rooms").insert(newRoomPayload).select().single();
      if (roomErr || !newRoom) {
        console.error("[gameday] duplicate room insert error:", roomErr);
        res2.status(500).json({ error: "Failed to create duplicate room" });
        return;
      }
      for (const srcCard of srcCards) {
        const { data: newCard } = await supabase.from("gameday_pick_cards").insert({
          room_id: newRoom.id,
          phase: srcCard.phase,
          title: srcCard.title,
          display_order: srcCard.display_order,
          status: "closed",
          scheduled_open_at: srcCard.scheduled_open_at ?? null,
          scheduled_lock_at: srcCard.scheduled_lock_at ?? null
        }).select().single();
        if (!newCard) continue;
        const props = [...srcCard.gameday_props ?? []].sort(
          (a, b) => a.display_order - b.display_order
        );
        for (const srcProp of props) {
          await supabase.from("gameday_props").insert({
            card_id: newCard.id,
            question: srcProp.question,
            answer_options: srcProp.answer_options,
            display_order: srcProp.display_order,
            status: "pending",
            correct_answer: null,
            template_prop_id: srcProp.template_prop_id ?? null
          });
        }
      }
      await logEvent(supabase, newRoom.id, null, hostId, "room_created", {
        duplicated_from: roomId
      });
      console.log(`[gameday] room duplicated: ${roomId} \u2192 ${newRoom.id} "${newName}"`);
      res2.json({ ok: true, room_id: newRoom.id, room_name: newName, room_code: newRoom.room_code ?? null });
    }
  );
  app2.get(
    "/api/gameday/rooms/:roomRef/leaderboard",
    async (req, res2) => {
      const supabase = getServiceSupabase();
      const roomId = await resolveRoomRef(supabase, req.params.roomRef);
      if (!roomId) {
        res2.status(404).json({ error: "Room not found" });
        return;
      }
      if (isBotApiKeyValid(req)) {
        const discordAccess = await requireDiscordGuildRoom(req, res2, supabase, roomId);
        if (!discordAccess) return;
      }
      const { data: roomMeta } = await supabase.from("gameday_rooms").select("archived_at").eq("id", roomId).single();
      if (roomMeta?.archived_at) {
        res2.status(410).json({
          ok: false,
          archived: true,
          message: "This Game Day room has been archived and is no longer active."
        });
        return;
      }
      const { data: participants } = await supabase.from("gameday_participants").select("id, display_name, is_guest").eq("room_id", roomId);
      if (!participants?.length) {
        res2.json({ leaderboard: [] });
        return;
      }
      const participantIds = participants.map((p) => p.id);
      const { data: allPicks } = await supabase.from("gameday_picks").select("participant_id, is_correct").in("participant_id", participantIds);
      const scores = participants.map((p) => {
        const myPicks = (allPicks ?? []).filter(
          (pk) => pk.participant_id === p.id
        );
        const correct = myPicks.filter(
          (pk) => pk.is_correct === true
        ).length;
        const pending = myPicks.filter(
          (pk) => pk.is_correct === null
        ).length;
        return {
          participant_id: p.id,
          display_name: p.display_name,
          is_guest: p.is_guest,
          game_day_sp: correct * 10,
          correct_picks: correct,
          pending_picks: pending,
          total_picks: myPicks.length
        };
      }).sort(
        (a, b) => b.game_day_sp - a.game_day_sp || b.correct_picks - a.correct_picks
      );
      let rank = 1;
      const leaderboard = scores.map((s, i) => {
        if (i > 0 && s.game_day_sp < scores[i - 1].game_day_sp)
          rank = i + 1;
        return { ...s, rank };
      });
      res2.json({ leaderboard });
    }
  );
  app2.get(
    "/api/gameday/rooms/:roomRef/final-standings",
    async (req, res2) => {
      const supabase = getServiceSupabase();
      const roomId = await resolveRoomRef(supabase, req.params.roomRef);
      if (!roomId) {
        res2.status(404).json({ error: "Room not found" });
        return;
      }
      if (isBotApiKeyValid(req)) {
        const discordAccess = await requireDiscordGuildRoom(req, res2, supabase, roomId);
        if (!discordAccess) return;
      }
      const { data: room } = await supabase.from("gameday_rooms").select("id, room_name, room_code, status, archived_at, team_a_name, team_b_name, team_a_star, team_b_star, game_date").eq("id", roomId).single();
      if (!room) {
        res2.status(404).json({ error: "Room not found" });
        return;
      }
      if (room.archived_at) {
        res2.status(410).json({
          ok: false,
          archived: true,
          message: "This Game Day room has been archived and is no longer active."
        });
        return;
      }
      if (room.status !== "finalized") {
        res2.json({
          finalized: false,
          message: "This Game Day room is not finalized yet."
        });
        return;
      }
      const roomCode = room.room_code ?? null;
      const publicLink = roomCode ? `${APP_URL2}/g/${roomCode}` : `${APP_URL2}/gameday/${roomId}`;
      const { data: participants } = await supabase.from("gameday_participants").select("id, display_name, is_guest").eq("room_id", roomId);
      const participantIds = (participants ?? []).map((p) => p.id);
      let leaderboard = [];
      if (participantIds.length > 0) {
        const { data: allPicks } = await supabase.from("gameday_picks").select("participant_id, is_correct").in("participant_id", participantIds);
        const scores = (participants ?? []).map((p) => {
          const myPicks = (allPicks ?? []).filter(
            (pk) => pk.participant_id === p.id
          );
          const correct = myPicks.filter((pk) => pk.is_correct === true).length;
          const pending = myPicks.filter((pk) => pk.is_correct === null).length;
          return {
            participant_id: p.id,
            display_name: p.display_name,
            is_guest: p.is_guest,
            game_day_sp: correct * 10,
            correct_picks: correct,
            pending_picks: pending,
            total_picks: myPicks.length
          };
        }).sort(
          (a, b) => b.game_day_sp - a.game_day_sp || b.correct_picks - a.correct_picks
        );
        let rank = 1;
        leaderboard = scores.map((s, i) => {
          if (i > 0 && s.game_day_sp < scores[i - 1].game_day_sp) rank = i + 1;
          return { ...s, rank };
        });
      }
      const { count: totalProps } = await supabase.from("gameday_props").select("id", { count: "exact", head: true }).in(
        "card_id",
        (await supabase.from("gameday_pick_cards").select("id").eq("room_id", roomId)).data?.map((c) => c.id) ?? []
      );
      res2.json({
        finalized: true,
        room_id: roomId,
        room_code: roomCode,
        public_link: publicLink,
        matchup: {
          team_a: room.team_a_name,
          team_b: room.team_b_name,
          star_a: room.team_a_star,
          star_b: room.team_b_star,
          game_date: room.game_date,
          room_name: room.room_name
        },
        winner: leaderboard[0] ?? null,
        leaderboard,
        total_participants: (participants ?? []).length,
        total_props: totalProps ?? 0
      });
    }
  );
  app2.post(
    "/api/gameday/rooms/:roomId/final-standings-viewed",
    async (req, res2) => {
      const { roomId } = req.params;
      const supabase = getServiceSupabase();
      const { userId, guestSessionId } = await getCallerIdentity(req);
      let participantId = null;
      if (userId) {
        const { data: p } = await supabase.from("gameday_participants").select("id").eq("room_id", roomId).eq("user_id", userId).maybeSingle();
        participantId = p?.id ?? null;
      } else if (guestSessionId) {
        const { data: p } = await supabase.from("gameday_participants").select("id").eq("room_id", roomId).eq("guest_session_id", guestSessionId).maybeSingle();
        participantId = p?.id ?? null;
      }
      await logEvent(supabase, roomId, participantId, userId, "final_standings_viewed", {
        participant_type: userId ? "logged_in" : "guest"
      });
      res2.json({ ok: true });
    }
  );
  app2.get(
    "/api/gameday/rooms/:roomId/host-data",
    async (req, res2) => {
      const hostId = await requireGamedayHost(req, res2);
      if (!hostId) return;
      const { roomId } = req.params;
      const supabase = getServiceSupabase();
      const { data: room } = await supabase.from("gameday_rooms").select("*").eq("id", roomId).single();
      if (!room) {
        res2.status(404).json({ error: "Room not found" });
        return;
      }
      if (!requireOwnedHumanRoom(res2, room.host_user_id, hostId)) return;
      if (!room.room_code) {
        try {
          const newCode = await generateUniqueRoomCode(supabase);
          await supabase.from("gameday_rooms").update({ room_code: newCode }).eq("id", roomId);
          room.room_code = newCode;
          console.log(`[gameday] backfilled room_code ${newCode} for room ${roomId}`);
        } catch (e) {
          console.warn("[gameday] room_code backfill failed (non-fatal):", e);
        }
      }
      const { data: rawCards } = await supabase.from("gameday_pick_cards").select("*, gameday_props(*)").eq("room_id", roomId).order("display_order");
      const cards = (rawCards ?? []).map((card) => ({
        ...card,
        gameday_props: [...card.gameday_props ?? []].sort(
          (a, b) => a.display_order - b.display_order
        )
      }));
      const allPropIds = cards.flatMap(
        (c) => (c.gameday_props ?? []).map((p) => p.id)
      );
      const pickCounts = {};
      if (allPropIds.length > 0) {
        const { data: allPicks } = await supabase.from("gameday_picks").select("prop_id, selected_answer").in("prop_id", allPropIds);
        for (const pick of allPicks ?? []) {
          const pid = pick.prop_id;
          const ans = pick.selected_answer;
          if (!pickCounts[pid]) pickCounts[pid] = {};
          pickCounts[pid][ans] = (pickCounts[pid][ans] ?? 0) + 1;
        }
      }
      const { count: participantCount } = await supabase.from("gameday_participants").select("id", { count: "exact", head: true }).eq("room_id", roomId);
      const { data: participants } = await supabase.from("gameday_participants").select("id, display_name, is_guest").eq("room_id", roomId);
      const participantIds = (participants ?? []).map((p) => p.id);
      let leaderboard = [];
      if (participantIds.length > 0) {
        const { data: allPicksLb } = await supabase.from("gameday_picks").select("participant_id, is_correct").in("participant_id", participantIds);
        const scores = (participants ?? []).map((p) => {
          const myPicks = (allPicksLb ?? []).filter(
            (pk) => pk.participant_id === p.id
          );
          const correct = myPicks.filter(
            (pk) => pk.is_correct === true
          ).length;
          return {
            participant_id: p.id,
            display_name: p.display_name,
            game_day_sp: correct * 10,
            correct_picks: correct
          };
        }).sort(
          (a, b) => b.game_day_sp - a.game_day_sp || b.correct_picks - a.correct_picks
        );
        let rank = 1;
        leaderboard = scores.map((s, i) => {
          if (i > 0 && s.game_day_sp < scores[i - 1].game_day_sp)
            rank = i + 1;
          return { ...s, rank };
        });
      }
      res2.json({
        room,
        cards,
        pick_counts: pickCounts,
        participant_count: participantCount ?? 0,
        leaderboard
      });
    }
  );
  app2.patch(
    "/api/gameday/rooms/:roomId/status",
    async (req, res2) => {
      const hostId = await requireGamedayHost(req, res2);
      if (!hostId) return;
      const { roomId } = req.params;
      const { status } = req.body;
      const allowed = ["draft", "active", "finalized"];
      if (!status || !allowed.includes(status)) {
        res2.status(400).json({ error: "Invalid status" });
        return;
      }
      const supabase = getServiceSupabase();
      const { data: room } = await supabase.from("gameday_rooms").select("host_user_id").eq("id", roomId).single();
      if (!room) {
        res2.status(404).json({ error: "Room not found" });
        return;
      }
      if (!requireOwnedHumanRoom(res2, room.host_user_id, hostId)) return;
      await supabase.from("gameday_rooms").update({ status, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", roomId);
      res2.json({ ok: true });
    }
  );
  app2.post(
    "/api/gameday/rooms/:roomId/countdown",
    async (req, res2) => {
      const hostId = await requireGamedayHost(req, res2);
      if (!hostId) return;
      const { roomId } = req.params;
      const { phase, countdown_type, duration_minutes } = req.body;
      const validPhases = ["pregame", "halftime", "fourth", "final_push", "penalties"];
      const validTypes = ["opens_soon", "locks_soon"];
      const validDurations = [5, 10];
      if (!phase || !validPhases.includes(phase)) {
        res2.status(400).json({ error: "Invalid phase" });
        return;
      }
      if (!countdown_type || !validTypes.includes(countdown_type)) {
        res2.status(400).json({ error: "Invalid countdown_type" });
        return;
      }
      if (!duration_minutes || !validDurations.includes(duration_minutes)) {
        res2.status(400).json({ error: "duration_minutes must be 5 or 10" });
        return;
      }
      const supabase = getServiceSupabase();
      const { data: cdRoom } = await supabase.from("gameday_rooms").select("host_user_id, status, archived_at").eq("id", roomId).single();
      if (!cdRoom) {
        res2.status(404).json({ error: "Room not found" });
        return;
      }
      if (!requireOwnedHumanRoom(res2, cdRoom.host_user_id, hostId)) return;
      if (cdRoom.archived_at || cdRoom.status === "finalized") {
        res2.status(400).json({ error: "Cannot set countdown on archived or finalized room" });
        return;
      }
      const now = /* @__PURE__ */ new Date();
      const endsAt = new Date(now.getTime() + duration_minutes * 60 * 1e3);
      await supabase.from("gameday_rooms").update({
        countdown_phase: phase,
        countdown_type,
        countdown_ends_at: endsAt.toISOString(),
        countdown_started_at: now.toISOString()
      }).eq("id", roomId);
      console.log(`[gameday] countdown set: room=${roomId} phase=${phase} type=${countdown_type} ends=${endsAt.toISOString()}`);
      res2.json({ ok: true, countdown_ends_at: endsAt.toISOString() });
    }
  );
  app2.post(
    "/api/gameday/rooms/:roomId/next-room-interest",
    async (req, res2) => {
      const { roomId } = req.params;
      const {
        email,
        participant_id,
        participant_type,
        room_code,
        entry_source,
        final_rank,
        final_sp,
        is_winner
      } = req.body;
      const supabase = getServiceSupabase();
      const { data: rm } = await supabase.from("gameday_rooms").select("id, room_code, source").eq("id", roomId).maybeSingle();
      if (!rm) {
        res2.status(404).json({ ok: false, error: "Room not found" });
        return;
      }
      const verifiedUser = await getVerifiedGamedayUser(req);
      const userId = verifiedUser?.id ?? null;
      const { error: insertError } = await supabase.from("gameday_next_room_interest").insert({
        room_id: roomId,
        room_code: room_code ?? rm.room_code ?? null,
        participant_id: participant_id ?? null,
        user_id: userId,
        email: email ?? null,
        participant_type: participant_type ?? null,
        room_source: rm.source ?? null,
        entry_source: entry_source ?? null,
        final_rank: final_rank ?? null,
        final_sp: final_sp ?? null,
        is_winner: is_winner ?? null
      });
      if (insertError) {
        console.error("[gameday] next-room-interest insert error:", insertError.message, insertError.code);
      }
      console.log(`[gameday] next-room-interest: room=${roomId} email=${email ?? "none"} user=${userId ?? "guest"}`);
      res2.json({ ok: true });
    }
  );
  function isBlastAdmin(req) {
    const token = req.header("x-admin-token");
    const adminToken = process.env.MM_ADMIN_TOKEN;
    return !!adminToken && token === adminToken;
  }
  function buildTrackedLink(roomLink) {
    const sep = roomLink.includes("?") ? "&" : "?";
    return `${roomLink}${sep}src=email&utm_source=email&utm_campaign=gameday_tonight`;
  }
  app2.get("/admin/gameday/email-preview/blast", (req, res2) => {
    const gameName = req.query.game_name || "Thunder vs Spurs \u2014 WCF Game 6";
    const roomLink = req.query.room_link || "https://swayger.app/g/GDS-R78VR";
    const trackedRoomLink = buildTrackedLink(roomLink);
    const html = buildGameDayBlastHtml({
      gameName,
      trackedRoomLink,
      displayName: "Jordan"
    });
    res2.setHeader("Content-Type", "text/html; charset=utf-8");
    res2.send(html);
  });
  app2.post("/admin/gameday/blast-test", async (req, res2) => {
    if (!isBlastAdmin(req)) {
      res2.status(403).json({ ok: false, error: "Forbidden" });
      return;
    }
    const { game_name, room_link, subject } = req.body;
    if (!game_name || !room_link) {
      res2.status(400).json({ ok: false, error: "game_name and room_link are required" });
      return;
    }
    const trackedRoomLink = buildTrackedLink(room_link);
    const TEST_EMAIL = "darius@leagueswype.com";
    try {
      const html = buildGameDayBlastHtml({ gameName: game_name, trackedRoomLink });
      const visibleText = html.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ");
      const REQUIRED_PHRASE = "Game Day Swayger is a live room where everyone makes quick prop picks before the game, at halftime, and in the 4Q";
      const DISALLOWED = [
        { phrase: "Social Wager Contracts", pattern: /Social Wager Contracts/i },
        { phrase: "prediction game", pattern: /prediction game/i },
        { phrase: "picks game", pattern: /picks game/i },
        { phrase: "wager", pattern: /\bwager\b/i },
        { phrase: "beta", pattern: /\bbeta\b/i },
        { phrase: "test", pattern: /\btest\b/i }
      ];
      if (!html.includes(REQUIRED_PHRASE)) {
        throw new Error(`SAFETY FAIL \u2014 required phrase not found in HTML: "${REQUIRED_PHRASE}"`);
      }
      const violations = DISALLOWED.filter((d) => d.pattern.test(visibleText));
      if (violations.length > 0) {
        throw new Error(`SAFETY FAIL \u2014 disallowed phrase(s) in visible text: ${violations.map((v) => v.phrase).join(", ")}`);
      }
      const resolvedSubject = subject ?? `Tonight's live Game Day Swayger room is open for ${game_name}`;
      const ctaMatch = html.match(/>([^<]*Join Tonight[^<]*)<\/a>/i);
      const ctaText = ctaMatch ? ctaMatch[1].trim() : "NOT FOUND";
      console.log(`[gameday-blast] \u2500\u2500 PRE-SEND INSPECTION \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
      console.log(`[gameday-blast]  subject     : ${resolvedSubject}`);
      console.log(`[gameday-blast]  CTA button  : ${ctaText}`);
      console.log(`[gameday-blast]  required phrase: PRESENT \u2713`);
      console.log(`[gameday-blast]  disallowed  : NONE \u2713`);
      console.log(`[gameday-blast]  HTML snippet (first 800 chars):
${html.slice(0, 800)}`);
      console.log(`[gameday-blast] \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
      const resendId = await sendGameDayBlastEmail({
        to: TEST_EMAIL,
        displayName: "Darius",
        userId: "test-preview",
        gameName: game_name,
        trackedRoomLink,
        subject
      });
      console.log(`[gameday-blast] Test email sent to ${TEST_EMAIL} resend_id=${resendId ?? "none"}`);
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
        is_test: true
      }).then(({ error }) => {
        if (error) console.warn("[gameday-blast] Failed to log test send:", error.message);
      });
      res2.json({ ok: true, sent_to: TEST_EMAIL, tracked_link: trackedRoomLink, subject: resolvedSubject, cta: ctaText, resend_message_id: resendId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[gameday-blast] Test send failed:", msg);
      res2.status(500).json({ ok: false, error: msg });
    }
  });
  app2.post("/admin/gameday/blast-send", async (req, res2) => {
    if (!isBlastAdmin(req)) {
      res2.status(403).json({ ok: false, error: "Forbidden" });
      return;
    }
    const { game_name, room_link, confirmed, subject } = req.body;
    if (!game_name || !room_link) {
      res2.status(400).json({ ok: false, error: "game_name and room_link are required" });
      return;
    }
    if (confirmed !== true) {
      res2.status(400).json({ ok: false, error: "confirmed: true is required to send the full blast" });
      return;
    }
    const supabase = getServiceSupabase();
    const recipients = [];
    const seenIds = /* @__PURE__ */ new Set();
    const { data: profiles, error: profilesErr } = await supabase.from("profiles").select("id, notification_email, display_name, username, email_unsubscribed").not("notification_email", "is", null).neq("email_unsubscribed", true);
    if (profilesErr) {
      console.error("[gameday-blast] Failed to fetch profiles:", profilesErr.message);
      res2.status(500).json({ ok: false, error: profilesErr.message });
      return;
    }
    for (const p of profiles ?? []) {
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      recipients.push({ id: p.id, email: p.notification_email, displayName: p.display_name || p.username });
    }
    const { data: authProfiles, error: authErr } = await supabase.rpc("get_auth_only_profiles");
    if (authErr) {
      console.warn("[gameday-blast] get_auth_only_profiles RPC failed \u2014 skipping auth-only users:", authErr.message);
    } else {
      for (const p of authProfiles ?? []) {
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
    const logRows = [];
    for (const r of recipients) {
      try {
        const resendId = await sendGameDayBlastEmail({
          to: r.email,
          displayName: r.displayName,
          userId: r.id,
          gameName: game_name,
          trackedRoomLink,
          subject
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
          is_test: false
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[gameday-blast] Failed for ${r.email}:`, msg);
        failed++;
      }
    }
    if (logRows.length > 0) {
      const { error: logErr } = await supabase.from("gameday_email_sends").insert(logRows);
      if (logErr) {
        console.warn("[gameday-blast] Failed to log send records:", logErr.message);
      } else {
        stored = logRows.length;
      }
    }
    console.log(`[gameday-blast] Full blast complete \u2014 sent=${sent} failed=${failed} stored=${stored} total=${recipients.length} game="${game_name}"`);
    res2.json({ ok: true, sent, failed, stored_message_ids: stored, total_eligible: recipients.length, tracked_link: trackedRoomLink });
  });
  app2.post("/admin/gameday/blast-catchup", async (req, res2) => {
    if (!isBlastAdmin(req)) {
      res2.status(403).json({ ok: false, error: "Forbidden" });
      return;
    }
    const { game_name, room_link, confirmed, subject } = req.body;
    if (!game_name || !room_link) {
      res2.status(400).json({ ok: false, error: "game_name and room_link are required" });
      return;
    }
    if (confirmed !== true) {
      res2.status(400).json({ ok: false, error: "confirmed: true is required" });
      return;
    }
    const supabase = getServiceSupabase();
    const { data: authProfiles, error: authErr } = await supabase.rpc("get_auth_only_profiles");
    if (authErr) {
      console.error("[gameday-blast-catchup] get_auth_only_profiles RPC failed:", authErr.message);
      res2.status(500).json({ ok: false, error: authErr.message });
      return;
    }
    const eligible2 = (authProfiles ?? []).filter((p) => p.notification_email && !p.email_unsubscribed);
    const trackedRoomLink = buildTrackedLink(room_link);
    const roomCodeMatch = room_link.match(/\/g\/([A-Z0-9-]+)/i);
    const roomCode = roomCodeMatch ? roomCodeMatch[1] : null;
    let sent = 0;
    let failed = 0;
    let stored = 0;
    const logRows = [];
    for (const p of eligible2) {
      try {
        const resendId = await sendGameDayBlastEmail({
          to: p.notification_email,
          displayName: p.display_name || p.username,
          userId: p.id,
          gameName: game_name,
          trackedRoomLink,
          subject
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
          is_test: false
        });
        await new Promise((r) => setTimeout(r, 150));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[gameday-blast-catchup] Failed for ${p.notification_email}:`, msg);
        failed++;
      }
    }
    if (logRows.length > 0) {
      const { error: logErr } = await supabase.from("gameday_email_sends").insert(logRows);
      if (logErr) {
        console.warn("[gameday-blast-catchup] Failed to log send records:", logErr.message);
      } else {
        stored = logRows.length;
      }
    }
    console.log(`[gameday-blast-catchup] Catchup complete \u2014 sent=${sent} failed=${failed} stored=${stored} total=${eligible2.length}`);
    res2.json({ ok: true, sent, failed, stored_message_ids: stored, total_eligible: eligible2.length, tracked_link: trackedRoomLink });
  });
  app2.delete(
    "/api/gameday/rooms/:roomId/countdown",
    async (req, res2) => {
      const hostId = await requireGamedayHost(req, res2);
      if (!hostId) return;
      const { roomId } = req.params;
      const supabase = getServiceSupabase();
      const { data: clrRoom } = await supabase.from("gameday_rooms").select("host_user_id").eq("id", roomId).single();
      if (!clrRoom) {
        res2.status(404).json({ error: "Room not found" });
        return;
      }
      if (!requireOwnedHumanRoom(res2, clrRoom.host_user_id, hostId)) return;
      await supabase.from("gameday_rooms").update({
        countdown_phase: null,
        countdown_type: null,
        countdown_ends_at: null,
        countdown_started_at: null
      }).eq("id", roomId);
      console.log(`[gameday] countdown cleared: room=${roomId}`);
      res2.json({ ok: true });
    }
  );
  function checkPropLibraryAdmin(req, res2) {
    const token = req.header("x-admin-token");
    const adminToken = process.env.MM_ADMIN_TOKEN;
    if (!adminToken || token !== adminToken) {
      res2.status(401).json({ error: "Unauthorized" });
      return false;
    }
    return true;
  }
  app2.get("/api/admin/gameday/prop-library", async (req, res2) => {
    if (!checkPropLibraryAdmin(req, res2)) return;
    const sport = req.query.sport;
    const supabase = getServiceSupabase();
    let query = supabase.from("gameday_prop_library").select("*").order("sport").order("phase").order("display_order");
    if (sport) query = query.eq("sport", sport);
    const { data, error } = await query;
    if (error) {
      res2.status(500).json({ error: error.message });
      return;
    }
    res2.json({ ok: true, props: data ?? [] });
  });
  app2.post("/api/admin/gameday/prop-library", async (req, res2) => {
    if (!checkPropLibraryAdmin(req, res2)) return;
    const { id, sport, phase, question, answer_options, settlement_window, is_default } = req.body;
    if (!id || !sport || !phase || !question || !answer_options) {
      res2.status(400).json({ error: "Missing required fields: id, sport, phase, question, answer_options" });
      return;
    }
    const supabase = getServiceSupabase();
    const { data: existing } = await supabase.from("gameday_prop_library").select("display_order").eq("sport", sport).eq("phase", phase).order("display_order", { ascending: false }).limit(1);
    const maxOrder = existing?.[0]?.display_order ?? -1;
    const { data, error } = await supabase.from("gameday_prop_library").insert({
      id,
      sport,
      phase,
      question,
      answer_options,
      settlement_window: settlement_window ?? "",
      is_default: is_default ?? false,
      display_order: maxOrder + 1
    }).select().single();
    if (error) {
      res2.status(500).json({ error: error.message });
      return;
    }
    res2.json({ ok: true, prop: data });
  });
  app2.patch("/api/admin/gameday/prop-library/:propId", async (req, res2) => {
    if (!checkPropLibraryAdmin(req, res2)) return;
    const { propId } = req.params;
    const updates = {};
    const allowed = ["is_active", "is_default", "question", "answer_options", "settlement_window", "display_order"];
    for (const key of allowed) {
      if (req.body[key] !== void 0) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      res2.status(400).json({ error: "No valid fields to update" });
      return;
    }
    updates.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.from("gameday_prop_library").update(updates).eq("id", propId).select().single();
    if (error) {
      res2.status(500).json({ error: error.message });
      return;
    }
    res2.json({ ok: true, prop: data });
  });
  app2.get("/api/admin/gameday/global-settle/preview", async (req, res2) => {
    if (!checkPropLibraryAdmin(req, res2)) return;
    const template_prop_id = req.query.template_prop_id;
    const correct_answer = req.query.correct_answer;
    if (!template_prop_id || !correct_answer) {
      res2.status(400).json({ error: "template_prop_id and correct_answer are required" });
      return;
    }
    const supabase = getServiceSupabase();
    const { data: tpl } = await supabase.from("gameday_prop_library").select("id, question, answer_options").eq("id", template_prop_id).single();
    if (!tpl) {
      res2.status(404).json({ error: "Template prop not found" });
      return;
    }
    const options = tpl.answer_options;
    if (!options.includes(correct_answer)) {
      res2.status(400).json({ error: "correct_answer is not one of the template prop's options" });
      return;
    }
    const { data: props } = await supabase.from("gameday_props").select("id, card_id, gameday_pick_cards(room_id, gameday_rooms(status, room_code, room_name))").eq("template_prop_id", template_prop_id).neq("status", "settled");
    const activeProps = (props ?? []).filter((p) => {
      const room = p.gameday_pick_cards?.gameday_rooms;
      return room && room.status === "active";
    });
    const propIds = activeProps.map((p) => p.id);
    const roomSet = /* @__PURE__ */ new Map();
    for (const p of activeProps) {
      const r = p.gameday_pick_cards?.gameday_rooms;
      if (r) roomSet.set(p.gameday_pick_cards.room_id, { room_code: r.room_code, room_name: r.room_name });
    }
    let picks_count = 0;
    if (propIds.length > 0) {
      const { count } = await supabase.from("gameday_picks").select("id", { count: "exact", head: true }).in("prop_id", propIds);
      picks_count = count ?? 0;
    }
    res2.json({
      ok: true,
      template_prop_id,
      question: tpl.question,
      correct_answer,
      props_count: activeProps.length,
      rooms_count: roomSet.size,
      picks_count,
      rooms: Array.from(roomSet.values())
    });
  });
  app2.post("/api/admin/gameday/global-settle", async (req, res2) => {
    if (!checkPropLibraryAdmin(req, res2)) return;
    const { template_prop_id, correct_answer } = req.body;
    if (!template_prop_id || !correct_answer) {
      res2.status(400).json({ error: "template_prop_id and correct_answer are required" });
      return;
    }
    const supabase = getServiceSupabase();
    const { data: tpl } = await supabase.from("gameday_prop_library").select("id, answer_options").eq("id", template_prop_id).single();
    if (!tpl) {
      res2.status(404).json({ error: "Template prop not found" });
      return;
    }
    if (!tpl.answer_options.includes(correct_answer)) {
      res2.status(400).json({ error: "Invalid correct_answer for this template prop" });
      return;
    }
    const { data: props } = await supabase.from("gameday_props").select("id, card_id, gameday_pick_cards(room_id, gameday_rooms(status))").eq("template_prop_id", template_prop_id).neq("status", "settled");
    const activeProps = (props ?? []).filter(
      (p) => p.gameday_pick_cards?.gameday_rooms?.status === "active"
    );
    if (activeProps.length === 0) {
      res2.json({ ok: true, settled: 0, message: "No unsettled props found in active rooms." });
      return;
    }
    const propIds = activeProps.map((p) => p.id);
    const cardIds = [...new Set(activeProps.map((p) => p.card_id))];
    await supabase.from("gameday_props").update({ correct_answer, status: "settled", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).in("id", propIds);
    await supabase.from("gameday_picks").update({ is_correct: true }).in("prop_id", propIds).eq("selected_answer", correct_answer);
    await supabase.from("gameday_picks").update({ is_correct: false }).in("prop_id", propIds).neq("selected_answer", correct_answer);
    for (const cardId of cardIds) {
      const { data: remaining } = await supabase.from("gameday_props").select("id").eq("card_id", cardId).neq("status", "settled");
      if (!remaining?.length) {
        await supabase.from("gameday_pick_cards").update({ status: "settled", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", cardId);
      }
    }
    console.log(`[global-settle] settled ${propIds.length} props for template "${template_prop_id}" \u2192 "${correct_answer}"`);
    res2.json({ ok: true, settled: propIds.length, rooms_count: new Set(activeProps.map((p) => p.gameday_pick_cards?.room_id)).size });
  });
  app2.get("/api/admin/gameday/settlement-queue", async (req, res2) => {
    if (!checkPropLibraryAdmin(req, res2)) return;
    const result = await buildSettlementQueue(getServiceSupabase());
    if ("error" in result) {
      res2.status(500).json({ error: result.error });
      return;
    }
    res2.json({ ok: true, ...result });
  });
  app2.post("/api/admin/gameday/settle-group", async (req, res2) => {
    if (!GLOBAL_SETTLEMENT_WRITE_ENABLED) {
      res2.status(503).json({ error: "Global settlement is not yet enabled.", code: "FLAG_DISABLED" });
      return;
    }
    if (!checkPropLibraryAdmin(req, res2)) return;
    const adminToken = req.header("x-admin-token") ?? "";
    const operatorFingerprint = _tokenFingerprint(adminToken);
    const supabase = getServiceSupabase();
    const {
      group_key,
      prop_ids,
      expected_count,
      canonical_answer_normalized,
      idempotency_key
    } = req.body;
    if (!group_key || !prop_ids?.length || !canonical_answer_normalized || !idempotency_key) {
      res2.status(400).json({ error: "group_key, prop_ids, canonical_answer_normalized, and idempotency_key are required." });
      return;
    }
    if (typeof expected_count !== "number" || expected_count <= 0) {
      res2.status(400).json({ error: "expected_count must be a positive integer." });
      return;
    }
    if (prop_ids.length !== expected_count) {
      res2.status(400).json({ error: `prop_ids.length (${prop_ids.length}) \u2260 expected_count (${expected_count}).` });
      return;
    }
    const requestHash = _computeRequestHash(
      group_key,
      canonical_answer_normalized,
      prop_ids,
      expected_count,
      operatorFingerprint
    );
    const opId = _genOpId();
    const existingRow = await _readSettleOp(supabase, idempotency_key);
    if (existingRow) {
      if (existingRow.request_hash !== requestHash) {
        res2.status(409).json({
          error: "Idempotency key reused with a different request payload.",
          code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST"
        });
        return;
      }
      if (existingRow.status === "in_progress") {
        const leaseExpiredMs = new Date(existingRow.lease_expires_at).getTime();
        if (leaseExpiredMs < Date.now()) {
          const { data: abandonedRows } = await supabase.from("gameday_settlement_operations").update({
            status: "abandoned",
            error_json: {
              code: "LEASE_EXPIRED",
              message: "Prior operation timed out \u2014 server may have restarted or crashed"
            },
            updated_at: (/* @__PURE__ */ new Date()).toISOString(),
            completed_at: (/* @__PURE__ */ new Date()).toISOString()
          }).eq("idempotency_key", idempotency_key).eq("status", "in_progress").lt("lease_expires_at", (/* @__PURE__ */ new Date()).toISOString()).select("id");
          if ((abandonedRows?.length ?? 0) > 0) {
            res2.status(409).json({
              error: "The prior operation for this key timed out. Use a new idempotency_key to retry.",
              code: "OPERATION_ABANDONED_BY_LEASE_EXPIRY",
              operation_id: existingRow.operation_id
            });
            return;
          }
          const reread = await _readSettleOp(supabase, idempotency_key);
          if (reread && reread.status !== "in_progress") {
            const replay2 = _buildSettleReplay(reread);
            res2.status(replay2.statusCode).json(replay2.payload);
            return;
          }
        }
        res2.status(409).json({
          error: "A settlement for this idempotency_key is already in progress. Wait and retry.",
          code: "OPERATION_IN_PROGRESS",
          operation_id: existingRow.operation_id
        });
        return;
      }
      const replay = _buildSettleReplay(existingRow);
      res2.status(replay.statusCode).json(replay.payload);
      return;
    }
    const queue = await buildSettlementQueue(supabase);
    if ("error" in queue) {
      res2.status(500).json({ error: queue.error });
      return;
    }
    let liveGroup = null;
    let liveEventKey = null;
    for (const ev of queue.events) {
      for (const g of ev.groups) {
        if (g.group_key === group_key) {
          liveGroup = g;
          liveEventKey = ev.event_key ?? null;
          break;
        }
      }
      if (liveGroup) break;
    }
    if (!liveGroup) {
      res2.status(409).json({
        error: "Group not found \u2014 it may have been fully settled or room status changed. Refresh.",
        code: "GROUP_NOT_FOUND",
        refresh_required: true
      });
      return;
    }
    if (liveGroup.settlement_status !== "safe") {
      res2.status(409).json({
        error: `This group cannot be bulk-settled (status: ${liveGroup.settlement_status}).`,
        code: "NOT_SAFE"
      });
      return;
    }
    const liveSet = new Set(liveGroup.prop_ids);
    const submittedSet = new Set(prop_ids);
    const setsMatch = liveSet.size === submittedSet.size && [...liveSet].every((id) => submittedSet.has(id));
    if (!setsMatch || liveGroup.prop_ids.length !== expected_count) {
      res2.status(409).json({
        error: "The prop set for this group has changed since your last queue load. Refresh before settling.",
        code: "STALE_GROUP",
        refresh_required: true,
        live_count: liveGroup.prop_ids.length,
        submitted_count: prop_ids.length,
        expected_count
      });
      return;
    }
    const { data: propRows, error: propFetchErr } = await supabase.from("gameday_props").select("id, answer_options, gameday_pick_cards(id, room_id)").in("id", prop_ids).neq("status", "settled");
    if (propFetchErr || !propRows?.length) {
      res2.status(409).json({
        error: "Failed to fetch prop details \u2014 some may have been settled already. Refresh and retry.",
        code: "PROP_FETCH_FAILED",
        refresh_required: true
      });
      return;
    }
    if (propRows.length !== expected_count) {
      res2.status(409).json({
        error: `Expected ${expected_count} unsettled props but found ${propRows.length}. Refresh and retry.`,
        code: "STALE_GROUP",
        refresh_required: true
      });
      return;
    }
    const settleSpecs = [];
    for (const row of propRows) {
      const card = row.gameday_pick_cards;
      const opts = row.answer_options;
      const storedAnswer = mapNormalizedToStored(canonical_answer_normalized, opts);
      if (!storedAnswer) {
        res2.status(409).json({
          error: `Cannot map "${canonical_answer_normalized}" to a stored option for prop ${row.id}. Options: ${JSON.stringify(opts)}. No props settled.`,
          code: "MAPPING_FAILED",
          prop_id: row.id
        });
        return;
      }
      settleSpecs.push({ propId: row.id, cardId: card?.id, roomId: card?.room_id, correctAnswer: storedAnswer });
    }
    let dbIdemActive = true;
    const { error: insertErr } = await supabase.from("gameday_settlement_operations").insert({
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
      lease_expires_at: new Date(Date.now() + 10 * 60 * 1e3).toISOString()
    });
    if (insertErr) {
      if (insertErr.code === "23505") {
        const concurrent = await _readSettleOp(supabase, idempotency_key);
        if (concurrent?.request_hash !== requestHash) {
          res2.status(409).json({ error: "Idempotency key reused with a different request payload.", code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST" });
          return;
        }
        res2.status(409).json({
          error: "A concurrent settlement for this key is already in progress.",
          code: "OPERATION_IN_PROGRESS",
          operation_id: concurrent?.operation_id
        });
        return;
      }
      if (insertErr.code === "42P01") {
        console.warn("[settle-group] \u26A0  gameday_settlement_operations table missing. Apply migration 001 from server/migrations/. Proceeding without DB idempotency.");
        dbIdemActive = false;
      } else {
        console.error("[settle-group] DB INSERT error:", insertErr.message, insertErr.code);
        res2.status(500).json({ error: "Failed to claim settlement operation slot.", code: "DB_ERROR", detail: insertErr.message });
        return;
      }
    }
    const settleResults = [];
    const partialErrors = [];
    const affectedRoomIds = /* @__PURE__ */ new Set();
    if (dbIdemActive) await _refreshSettleLease(supabase, idempotency_key, opId);
    for (let i = 0; i < settleSpecs.length; i++) {
      const spec = settleSpecs[i];
      if (dbIdemActive && i > 0 && i % 20 === 0) {
        const active = await _isSettleOpActive(supabase, idempotency_key, opId);
        if (!active) {
          console.warn(`[settle-group] op=${opId} externally abandoned at prop index ${i}`);
          res2.status(409).json({
            error: "Settlement was abandoned externally (lease expired or concurrent request).",
            code: "OPERATION_ABANDONED_MID_FLIGHT",
            operation_id: opId,
            settled_so_far: settleResults.length
          });
          return;
        }
        await _refreshSettleLease(supabase, idempotency_key, opId);
      }
      try {
        const r = await settlePropCore(supabase, spec);
        settleResults.push(r);
        affectedRoomIds.add(spec.roomId);
      } catch (e) {
        partialErrors.push({ propId: spec.propId, roomId: spec.roomId, error: e?.message ?? String(e) });
        console.error(`[settle-group] op=${opId} prop ${spec.propId} failed:`, e?.message);
      }
    }
    for (const roomId of affectedRoomIds) {
      await logEvent(supabase, roomId, null, null, "global_prop_settled", {
        operation_id: opId,
        group_key,
        canonical_answer_normalized,
        settled_prop_ids: settleSpecs.filter((s) => s.roomId === roomId).map((s) => s.propId),
        total_prop_count: settleSpecs.length,
        total_room_count: affectedRoomIds.size,
        partial_failures: partialErrors.length
      });
    }
    const allFailed = settleResults.length === 0 && partialErrors.length > 0;
    const isPartial = partialErrors.length > 0 && settleResults.length > 0;
    const finalStatus = allFailed ? "failed" : isPartial ? "partial_success" : "completed";
    const finalCode = allFailed ? 500 : isPartial ? 207 : 200;
    const response = {
      ok: !allFailed,
      operation_id: opId,
      settled_count: settleResults.length,
      rooms_count: affectedRoomIds.size,
      cards_auto_settled: settleResults.filter((r) => r.cardAutoSettled).length,
      canonical_answer_normalized
    };
    if (partialErrors.length > 0) {
      response.partial_errors = partialErrors;
      response.failed_count = partialErrors.length;
    }
    console.log(
      `[settle-group] op=${opId} status=${finalStatus} settled=${settleResults.length} failed=${partialErrors.length} rooms=${affectedRoomIds.size} group="${group_key.slice(0, 40)}" answer="${canonical_answer_normalized}"`
    );
    if (dbIdemActive) {
      const finalized = await _finalizeSettleOp(supabase, {
        idempotency_key,
        operation_id: opId,
        status: finalStatus,
        response_status_code: finalCode,
        room_count: affectedRoomIds.size,
        ...allFailed ? { error_json: { ...response } } : {},
        ...isPartial ? { partial_results_json: { ...response } } : {},
        ...!allFailed && !isPartial ? { result_json: { ...response } } : {}
      });
      if (!finalized.updated) {
        const cur = finalized.row;
        if (cur?.status === "abandoned") {
          res2.status(409).json({
            error: "Settlement was abandoned (lease expired during processing).",
            code: "OPERATION_ABANDONED_MID_FLIGHT",
            operation_id: opId,
            partial_settle_count: settleResults.length
          });
          return;
        }
        if (cur) {
          const replay = _buildSettleReplay(cur);
          res2.status(replay.statusCode).json(replay.payload);
          return;
        }
        console.error(`[settle-group] op=${opId} terminal UPDATE found 0 rows and no current row \u2014 state may be inconsistent`);
      }
    }
    res2.status(finalCode).json(response);
  });
  if (false) {
    const eventMap = /* @__PURE__ */ new Map();
    const LEGACY_KEY = "__legacy__";
    for (const prop of eligible) {
      const card = prop.gameday_pick_cards;
      const room = card?.gameday_rooms;
      const evKey = buildEventKey(room?.sport, room?.team_a_name, room?.team_b_name, room?.game_date);
      const mapKey = evKey ?? LEGACY_KEY + "|" + (room?.id ?? "unknown");
      if (!eventMap.has(mapKey)) {
        eventMap.set(mapKey, {
          event_key: evKey,
          is_legacy: !evKey,
          team_a: room?.team_a_name ?? "Unknown",
          team_b: room?.team_b_name ?? "Unknown",
          game_date: room?.game_date ?? null,
          sport: room?.sport ?? null,
          groups: /* @__PURE__ */ new Map()
        });
      }
      const event = eventMap.get(mapKey);
      const options = prop.answer_options ?? [];
      const normQuestion = (prop.question ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      const normOptions = options.map((o) => normalizeAnswerOption(o)).sort();
      const grpKey = evKey ? buildGroupKey(evKey, card?.phase ?? "", prop.question ?? "", options) : `${mapKey}|${card?.phase ?? ""}|${normQuestion}|${normOptions.join("||")}`;
      if (!event.groups.has(grpKey)) {
        event.groups.set(grpKey, {
          group_key: grpKey,
          phase: card?.phase ?? "",
          question: prop.question ?? "",
          answer_options: options,
          normalized_options: normOptions,
          prop_ids: [],
          room_ids: /* @__PURE__ */ new Set(),
          template_prop_ids: /* @__PURE__ */ new Set(),
          unique_questions: /* @__PURE__ */ new Set()
        });
      }
      const grp = event.groups.get(grpKey);
      grp.prop_ids.push(prop.id);
      grp.room_ids.add(card.room_id);
      grp.template_prop_ids.add(prop.template_prop_id ?? null);
      grp.unique_questions.add(normQuestion);
    }
    const events = [];
    for (const [, ev] of eventMap) {
      const groupsOut = [];
      for (const [, grp] of ev.groups) {
        const templateIds = [...grp.template_prop_ids].filter(Boolean);
        const uniqueTemplates = new Set(templateIds);
        let templateConsistency;
        if (grp.template_prop_ids.has(null) && templateIds.length === 0) {
          templateConsistency = "none";
        } else if (uniqueTemplates.size <= 1) {
          templateConsistency = "consistent";
        } else {
          templateConsistency = "mixed";
        }
        const conflicts = [];
        if (grp.unique_questions.size > 1) {
          conflicts.push(
            `${grp.unique_questions.size} slightly different question texts detected \u2014 review before settling`
          );
        }
        if (templateConsistency === "mixed") {
          conflicts.push(
            `Props link to ${uniqueTemplates.size} different template IDs (${[...uniqueTemplates].join(", ")})`
          );
        }
        const answer_map = grp.answer_options.map((stored) => {
          const normalized = normalizeAnswerOption(stored);
          const roundTripResult = mapNormalizedToStored(stored, grp.answer_options);
          return {
            stored,
            normalized,
            round_trips: roundTripResult === stored
          };
        });
        const ambiguousDetails = detectAmbiguousOptions(grp.answer_options);
        const hasAmbiguous = ambiguousDetails.length > 0;
        if (hasAmbiguous) {
          conflicts.push(`Answer options are ambiguous after normalization \u2014 bulk settlement blocked`);
        }
        let settlement_status;
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
          settlement_status
        });
      }
      const PHASE_ORDER = {
        pregame: 0,
        halftime: 1,
        fourth: 2,
        final_push: 3,
        penalties: 4
      };
      groupsOut.sort((a, b) => {
        const pa = PHASE_ORDER[a.phase] ?? 9;
        const pb = PHASE_ORDER[b.phase] ?? 9;
        if (pa !== pb) return pa - pb;
        return a.question.localeCompare(b.question);
      });
      const totalProps2 = groupsOut.reduce((s, g) => s + g.prop_count, 0);
      const safeCount = groupsOut.filter((g) => g.settlement_status === "safe").length;
      const reviewCount = groupsOut.filter((g) => g.settlement_status === "review_required").length;
      const manualCount = groupsOut.filter((g) => g.settlement_status === "manual_only").length;
      events.push({
        event_key: ev.event_key,
        is_legacy: ev.is_legacy,
        game_label: gameLabel(ev.team_a, ev.team_b, ev.game_date),
        sport: ev.sport,
        game_date: ev.game_date,
        team_a: ev.team_a,
        team_b: ev.team_b,
        group_count: groupsOut.length,
        prop_count: totalProps2,
        safe_count: safeCount,
        review_count: reviewCount,
        manual_count: manualCount,
        groups: groupsOut
      });
    }
    events.sort((a, b) => {
      if (a.is_legacy !== b.is_legacy) return a.is_legacy ? 1 : -1;
      return (a.game_date ?? "").localeCompare(b.game_date ?? "");
    });
    const totalGroups = events.reduce((s, e) => s + e.group_count, 0);
    const totalProps = events.reduce((s, e) => s + e.prop_count, 0);
    const totalSafe = events.reduce((s, e) => s + e.safe_count, 0);
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
      events
    });
  }
  const _cardSchedulerInterval = setInterval(async () => {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const supabase = getServiceSupabase();
    try {
      const { data: toOpen } = await supabase.from("gameday_pick_cards").select("id, room_id").eq("status", "closed").not("scheduled_open_at", "is", null).lte("scheduled_open_at", now);
      for (const card of toOpen ?? []) {
        const { data: room } = await supabase.from("gameday_rooms").select("status").eq("id", card.room_id).maybeSingle();
        if (room?.status === "active") {
          await supabase.from("gameday_pick_cards").update({ status: "open", updated_at: now }).eq("id", card.id);
          console.log(`[scheduler] auto-opened card ${card.id}`);
        }
      }
      const { data: toLock } = await supabase.from("gameday_pick_cards").select("id, room_id").eq("status", "open").not("scheduled_lock_at", "is", null).lte("scheduled_lock_at", now);
      for (const card of toLock ?? []) {
        const { data: room } = await supabase.from("gameday_rooms").select("status").eq("id", card.room_id).maybeSingle();
        if (room?.status === "active") {
          await supabase.from("gameday_pick_cards").update({ status: "locked", updated_at: now }).eq("id", card.id);
          console.log(`[scheduler] auto-locked card ${card.id}`);
        }
      }
    } catch (e) {
      console.error("[scheduler] card schedule check error:", e);
    }
  }, 6e4);
  process.once("SIGTERM", () => clearInterval(_cardSchedulerInterval));
  process.once("SIGINT", () => clearInterval(_cardSchedulerInterval));
}

// server/routes-fantasy.ts
import { createHash as createHash2, randomBytes } from "crypto";
function _computeAddMemberHash(leagueId, seasonId, operatorUserId, displayName, teamName) {
  const raw = [
    leagueId,
    seasonId,
    operatorUserId,
    displayName.trim().toLowerCase(),
    teamName.trim().toLowerCase()
  ].join("|");
  return createHash2("sha256").update(raw).digest("hex");
}
async function _appendMemberToWeeklyCards(supabase, seasonId, seasonMemberId, teamId, displayName, teamName) {
  try {
    const { data: weeklyRooms, error: roomErr } = await supabase.from("gameday_rooms").select("id").eq("league_season_id", seasonId).eq("competition_type", "weekly").eq("experience_type", "fantasy").is("archived_at", null);
    if (roomErr || !weeklyRooms || weeklyRooms.length === 0) return;
    const roomIds = weeklyRooms.map((r) => r.id);
    const { data: openCards, error: cardErr } = await supabase.from("gameday_pick_cards").select("id, roster_revision").in("room_id", roomIds).eq("phase", "weekly").eq("status", "open");
    if (cardErr || !openCards || openCards.length === 0) return;
    for (const card of openCards) {
      const cardId = card.id;
      const rosterRevision = card.roster_revision ?? 0;
      const { data: props } = await supabase.from("gameday_props").select("id, answer_target_type, answer_options").eq("card_id", cardId).in("answer_target_type", ["season_member", "fantasy_team"]);
      if (!props || props.length === 0) continue;
      let anyAppended = false;
      for (const prop of props) {
        const opts = Array.isArray(prop.answer_options) ? prop.answer_options : [];
        const isSmProp = prop.answer_target_type === "season_member";
        const memberId = isSmProp ? seasonMemberId : teamId;
        if (opts.some((o) => o.id === memberId)) continue;
        const newOpt = isSmProp ? { id: seasonMemberId, label: displayName.trim(), type: "season_member" } : { id: teamId, label: teamName.trim(), type: "fantasy_team" };
        const { error: updateErr } = await supabase.from("gameday_props").update({ answer_options: [...opts, newOpt] }).eq("id", prop.id);
        if (!updateErr) anyAppended = true;
      }
      if (anyAppended) {
        await supabase.from("gameday_pick_cards").update({ roster_revision: rosterRevision + 1 }).eq("id", cardId);
      }
    }
  } catch (err) {
    console.error("[fantasy] _appendMemberToWeeklyCards error (non-fatal):", err?.message ?? err);
  }
}
function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "==".slice(0, (4 - b64.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}
function requireFantasyAuth(req, res2) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res2.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const payload = decodeJwtPayload(auth.slice(7));
  if (!payload?.sub) {
    res2.status(401).json({ error: "Invalid token" });
    return null;
  }
  return payload.sub;
}
function getCallerIdentity2(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const payload = decodeJwtPayload(auth.slice(7));
    if (payload?.sub) return { userId: payload.sub };
  }
  const guestToken = req.headers["x-fantasy-guest-token"];
  if (guestToken?.trim()) return { guestToken: guestToken.trim() };
  return {};
}
async function requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId) {
  const userId = requireFantasyAuth(req, res2);
  if (!userId) return null;
  const { data: claims } = await supabase.from("fantasy_member_claims").select("league_member_id").eq("user_id", userId).eq("is_active", true);
  if (!claims?.length) {
    res2.status(403).json({ error: "No active Fantasy claim found" });
    return null;
  }
  const memberIds = claims.map((c) => c.league_member_id);
  const { data: leagueMember } = await supabase.from("fantasy_league_members").select("id").eq("league_id", leagueId).eq("is_active", true).in("id", memberIds).maybeSingle();
  if (!leagueMember) {
    res2.status(403).json({ error: "Not a member of this Fantasy league" });
    return null;
  }
  const { data: seasonMember } = await supabase.from("fantasy_season_members").select("id, role").eq("league_season_id", seasonId).eq("league_member_id", leagueMember.id).eq("is_active", true).in("role", ["commissioner", "co_commissioner"]).maybeSingle();
  if (!seasonMember) {
    res2.status(403).json({ error: "Commissioner authority required for this season" });
    return null;
  }
  return {
    userId,
    leagueMemberId: leagueMember.id,
    seasonMemberId: seasonMember.id
  };
}
async function requireFantasyLeagueCommissioner(req, res2, supabase, leagueId) {
  const userId = requireFantasyAuth(req, res2);
  if (!userId) return null;
  const { data: claims } = await supabase.from("fantasy_member_claims").select("league_member_id").eq("user_id", userId).eq("is_active", true);
  if (!claims?.length) {
    res2.status(403).json({ error: "No active Fantasy claim found" });
    return null;
  }
  const memberIds = claims.map((c) => c.league_member_id);
  const { data: leagueMember } = await supabase.from("fantasy_league_members").select("id").eq("league_id", leagueId).eq("is_active", true).in("id", memberIds).maybeSingle();
  if (!leagueMember) {
    res2.status(403).json({ error: "Not a member of this Fantasy league" });
    return null;
  }
  const { data: seasonMember } = await supabase.from("fantasy_season_members").select("id").eq("league_member_id", leagueMember.id).eq("is_active", true).in("role", ["commissioner", "co_commissioner"]).maybeSingle();
  if (!seasonMember) {
    res2.status(403).json({ error: "Commissioner authority required" });
    return null;
  }
  return { userId, leagueMemberId: leagueMember.id };
}
async function requirePrimaryLeagueCommissioner(req, res2, supabase, leagueId) {
  const userId = requireFantasyAuth(req, res2);
  if (!userId) return null;
  const { data: claims } = await supabase.from("fantasy_member_claims").select("league_member_id").eq("user_id", userId).eq("is_active", true);
  if (!claims?.length) {
    res2.status(403).json({ error: "No active Fantasy claim found" });
    return null;
  }
  const memberIds = claims.map((c) => c.league_member_id);
  const { data: leagueMember } = await supabase.from("fantasy_league_members").select("id").eq("league_id", leagueId).eq("is_active", true).in("id", memberIds).maybeSingle();
  if (!leagueMember) {
    res2.status(403).json({ error: "Not a member of this Fantasy league" });
    return null;
  }
  const { data: seasonMember } = await supabase.from("fantasy_season_members").select("id").eq("league_member_id", leagueMember.id).eq("is_active", true).eq("role", "commissioner").maybeSingle();
  if (!seasonMember) {
    res2.status(403).json({ error: "Primary commissioner authority required for this operation" });
    return null;
  }
  return { userId, leagueMemberId: leagueMember.id };
}
async function requireLeagueActive(supabase, leagueId, res2) {
  const { data: league } = await supabase.from("fantasy_leagues").select("is_active").eq("id", leagueId).maybeSingle();
  if (!league) {
    res2.status(404).json({ error: "League not found" });
    return false;
  }
  if (!league.is_active) {
    res2.status(409).json({
      error: "This league is archived. Restore it before making changes.",
      code: "LEAGUE_ARCHIVED"
    });
    return false;
  }
  return true;
}
async function resolveViewer(supabase, identity, seasonId, leagueId) {
  if (!identity.userId && !identity.guestToken) return null;
  const claimQuery = supabase.from("fantasy_member_claims").select("league_member_id").eq("is_active", true);
  const { data: claim } = identity.userId ? await claimQuery.eq("user_id", identity.userId).maybeSingle() : await claimQuery.eq("guest_token", identity.guestToken).maybeSingle();
  if (!claim) return null;
  const lmId = claim.league_member_id;
  const { data: lm } = await supabase.from("fantasy_league_members").select("id, display_name").eq("id", lmId).eq("league_id", leagueId).eq("is_active", true).maybeSingle();
  if (!lm) return null;
  const { data: sm } = await supabase.from("fantasy_season_members").select("id, role, draft_day_eligible").eq("league_season_id", seasonId).eq("league_member_id", lmId).eq("is_active", true).maybeSingle();
  if (!sm) return null;
  const { data: mgr } = await supabase.from("fantasy_team_managers").select("fantasy_teams(id, team_name)").eq("season_member_id", sm.id).eq("is_active", true).maybeSingle();
  const teamName = mgr?.fantasy_teams?.team_name ?? null;
  const fantasyTeamId = mgr?.fantasy_teams?.id ?? null;
  return {
    league_member_id: lmId,
    season_member_id: sm.id,
    display_name: lm.display_name ?? null,
    team_name: teamName,
    fantasy_team_id: fantasyTeamId,
    role: sm.role,
    draft_day_eligible: sm.draft_day_eligible ?? true
  };
}
async function ensureFantasyParticipant(supabase, roomId, viewer) {
  const { data: existing } = await supabase.from("gameday_participants").select("id").eq("room_id", roomId).eq("season_member_id", viewer.season_member_id).maybeSingle();
  if (existing) return { participant_id: existing.id };
  const insertPayload = {
    room_id: roomId,
    season_member_id: viewer.season_member_id,
    // display_name is NOT NULL in gameday_participants; display_name comes from
    // fantasy_league_members.display_name (NOT NULL), so null is unexpected but
    // we provide a safe fallback to avoid a schema error.
    display_name: viewer.display_name ?? viewer.team_name ?? "Fantasy Member",
    team_name: viewer.team_name
  };
  if (viewer.fantasy_team_id) insertPayload.fantasy_team_id = viewer.fantasy_team_id;
  const { data: inserted, error: insertErr } = await supabase.from("gameday_participants").insert(insertPayload).select("id").single();
  if (insertErr) {
    if (insertErr.code === "23505") {
      const { data: race } = await supabase.from("gameday_participants").select("id").eq("room_id", roomId).eq("season_member_id", viewer.season_member_id).maybeSingle();
      if (race) return { participant_id: race.id };
    }
    throw new Error(`Failed to create participant: ${insertErr.message}`);
  }
  return { participant_id: inserted.id };
}
var VALID_SPORTS = ["football", "basketball", "baseball"];
function registerFantasyRoutes(app2) {
  app2.use("/api/fantasy", (_req, res2, next) => {
    res2.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    next();
  });
  app2.post("/api/fantasy/leagues/setup", async (req, res2) => {
    const userId = requireFantasyAuth(req, res2);
    if (!userId) return;
    const {
      league_name,
      sport,
      display_name,
      team_name,
      season_year,
      reward_description,
      reward_amount_display
    } = req.body;
    if (!league_name?.trim()) {
      res2.status(400).json({ error: "league_name is required" });
      return;
    }
    if (!sport || !VALID_SPORTS.includes(sport)) {
      res2.status(400).json({ error: `sport must be one of: ${VALID_SPORTS.join(", ")}` });
      return;
    }
    if (!display_name?.trim()) {
      res2.status(400).json({ error: "display_name is required" });
      return;
    }
    if (!team_name?.trim()) {
      res2.status(400).json({ error: "team_name is required" });
      return;
    }
    if (season_year === void 0 || !Number.isInteger(season_year) || season_year < 1900 || season_year > 2100) {
      res2.status(400).json({ error: "season_year must be an integer between 1900 and 2100" });
      return;
    }
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.rpc("setup_fantasy_league", {
      p_user_id: userId,
      p_league_name: league_name.trim(),
      p_sport: sport,
      p_display_name: display_name.trim(),
      p_team_name: team_name.trim(),
      p_season_year: season_year,
      p_reward_description: reward_description?.trim() || null,
      p_reward_amount_display: reward_amount_display?.trim() || null
    });
    if (error) {
      console.error("[fantasy] setup_fantasy_league error:", error.message);
      const isValidationError = error.message.includes("Invalid sport") || error.message.includes("cannot be empty") || error.message.includes("year must be");
      res2.status(isValidationError ? 400 : 500).json({
        error: isValidationError ? error.message : "Failed to create Fantasy league"
      });
      return;
    }
    const result = data;
    console.log(
      `[fantasy] League created: league=${result.league_id?.slice(0, 8)}\u2026 season=${result.season_id?.slice(0, 8)}\u2026 by user=${userId.slice(0, 8)}\u2026`
    );
    res2.status(201).json(result);
  });
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/participants",
    async (req, res2) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(
        req,
        res2,
        supabase,
        leagueId,
        seasonId
      );
      if (!commissioner) return;
      if (!await requireLeagueActive(supabase, leagueId, res2)) return;
      const { display_name, team_name } = req.body;
      if (!display_name?.trim()) {
        res2.status(400).json({ error: "display_name is required" });
        return;
      }
      if (!team_name?.trim()) {
        res2.status(400).json({ error: "team_name is required" });
        return;
      }
      const idempotencyKey = req.headers["idempotency-key"]?.trim();
      if (!idempotencyKey) {
        res2.status(400).json({
          error: "Idempotency-Key header is required for this operation.",
          code: "IDEMPOTENCY_KEY_REQUIRED"
        });
        return;
      }
      const requestHash = _computeAddMemberHash(
        leagueId,
        seasonId,
        commissioner.userId,
        display_name,
        team_name
      );
      const { data: seasonCheck } = await supabase.from("fantasy_league_seasons").select("league_id").eq("id", seasonId).maybeSingle();
      if (!seasonCheck || seasonCheck.league_id !== leagueId) {
        res2.status(400).json({ error: "Season does not belong to this league" });
        return;
      }
      const { data: ddRoom } = await supabase.from("gameday_rooms").select("id").eq("league_season_id", seasonId).eq("competition_type", "draft_day").eq("experience_type", "fantasy").is("archived_at", null).maybeSingle();
      let eligible2 = true;
      let roomIdForSnapshot = null;
      if (ddRoom) {
        const ddRoomId = ddRoom.id;
        const { data: ddCard } = await supabase.from("gameday_pick_cards").select("id, status").eq("room_id", ddRoomId).eq("phase", "draft_day").maybeSingle();
        if (ddCard) {
          const cardStatus = ddCard.status;
          if (cardStatus === "locked" || cardStatus === "settled") {
            eligible2 = false;
          } else if (cardStatus === "open") {
            eligible2 = true;
            roomIdForSnapshot = ddRoomId;
          }
        }
      }
      const { data, error } = await supabase.rpc("add_fantasy_season_participant_idempotent", {
        p_league_id: leagueId,
        p_league_season_id: seasonId,
        p_display_name: display_name.trim(),
        p_team_name: team_name.trim(),
        p_draft_day_eligible: eligible2,
        p_room_id: roomIdForSnapshot,
        p_idempotency_key: idempotencyKey,
        p_operator_user_id: commissioner.userId,
        p_request_hash: requestHash
      });
      if (error) {
        if (error.message.includes("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST")) {
          res2.status(409).json({
            error: "Idempotency key was used with a different request. Generate a new key for a different add-member operation.",
            code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST"
          });
          return;
        }
        console.error("[fantasy] add_fantasy_season_participant_idempotent error:", error.message);
        const isValidationError = error.message.includes("not found") || error.message.includes("does not belong") || error.message.includes("cannot be empty");
        res2.status(isValidationError ? 400 : 500).json({
          error: isValidationError ? error.message : "Failed to add participant"
        });
        return;
      }
      const result = data;
      console.log(
        `[fantasy] Participant added: season=${seasonId.slice(0, 8)}\u2026 member=${result.league_member_id?.slice(0, 8)}\u2026 team=${result.team_id?.slice(0, 8)}\u2026 eligible=${result.draft_day_eligible} already_exists=${result.already_exists}`
      );
      if (!result.already_exists) {
        await _appendMemberToWeeklyCards(
          supabase,
          seasonId,
          result.season_member_id,
          result.team_id,
          display_name.trim(),
          team_name.trim()
        );
      }
      res2.status(result.already_exists ? 200 : 201).json(result);
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/participants/batch",
    async (req, res2) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(
        req,
        res2,
        supabase,
        leagueId,
        seasonId
      );
      if (!commissioner) return;
      if (!await requireLeagueActive(supabase, leagueId, res2)) return;
      const { batch_key, members } = req.body;
      if (!batch_key?.trim()) {
        res2.status(400).json({ error: "batch_key is required" });
        return;
      }
      const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRx.test(batch_key.trim())) {
        res2.status(400).json({ error: "batch_key must be a valid UUID" });
        return;
      }
      if (!Array.isArray(members) || members.length === 0) {
        res2.status(400).json({ error: "members must be a non-empty array" });
        return;
      }
      const validationErrors = [];
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        if (!m?.display_name?.trim()) {
          validationErrors.push({ index: i, field: "display_name", error: "display_name is required" });
        }
        if (!m?.team_name?.trim()) {
          validationErrors.push({ index: i, field: "team_name", error: "team_name is required" });
        }
      }
      if (validationErrors.length > 0) {
        res2.status(400).json({
          error: "Batch validation failed \u2014 fix all rows before submitting",
          validation_errors: validationErrors
        });
        return;
      }
      const { data: seasonCheck } = await supabase.from("fantasy_league_seasons").select("league_id").eq("id", seasonId).maybeSingle();
      if (!seasonCheck || seasonCheck.league_id !== leagueId) {
        res2.status(400).json({ error: "Season does not belong to this league" });
        return;
      }
      const { data: ddRoom } = await supabase.from("gameday_rooms").select("id").eq("league_season_id", seasonId).eq("competition_type", "draft_day").eq("experience_type", "fantasy").is("archived_at", null).maybeSingle();
      let eligible2 = true;
      let roomIdForSnapshot = null;
      if (ddRoom) {
        const ddRoomId = ddRoom.id;
        const { data: ddCard } = await supabase.from("gameday_pick_cards").select("id, status").eq("room_id", ddRoomId).eq("phase", "draft_day").maybeSingle();
        if (ddCard) {
          const cs = ddCard.status;
          if (cs === "locked" || cs === "settled") {
            eligible2 = false;
          } else if (cs === "open") {
            eligible2 = true;
            roomIdForSnapshot = ddRoomId;
          }
        }
      }
      const results = [];
      let created_count = 0;
      let replayed_count = 0;
      let failed_count = 0;
      const bk = batch_key.trim();
      const allRowKeys = members.map((_, i) => `${bk}:${i}`);
      const { data: existingOps } = await supabase.from("fantasy_participant_operations").select("idempotency_key").eq("operator_user_id", commissioner.userId).in("idempotency_key", allRowKeys);
      const alreadyRecordedKeys = new Set(
        (existingOps ?? []).map((op) => op.idempotency_key)
      );
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        const displayName = m.display_name.trim();
        const teamName = m.team_name.trim();
        const idempotencyKey = `${bk}:${i}`;
        const isReplay = alreadyRecordedKeys.has(idempotencyKey);
        const requestHash = _computeAddMemberHash(
          leagueId,
          seasonId,
          commissioner.userId,
          displayName,
          teamName
        );
        const { data, error } = await supabase.rpc(
          "add_fantasy_season_participant_idempotent",
          {
            p_league_id: leagueId,
            p_league_season_id: seasonId,
            p_display_name: displayName,
            p_team_name: teamName,
            p_draft_day_eligible: eligible2,
            p_room_id: roomIdForSnapshot,
            p_idempotency_key: idempotencyKey,
            p_operator_user_id: commissioner.userId,
            p_request_hash: requestHash
          }
        );
        if (error) {
          let msg = "Failed to add member";
          if (error.message.includes("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST")) {
            msg = "Row was previously submitted with different content \u2014 generate a new import batch to change this row.";
          } else if (error.message.includes("not found") || error.message.includes("does not belong") || error.message.includes("cannot be empty")) {
            msg = error.message;
          }
          results.push({
            index: i,
            status: "failed",
            display_name: displayName,
            team_name: teamName,
            league_member_id: null,
            season_member_id: null,
            fantasy_team_id: null,
            draft_day_eligible: null,
            error: msg
          });
          failed_count++;
        } else {
          const r = data;
          const status = isReplay ? "replayed" : "created";
          if (status === "created") created_count++;
          else replayed_count++;
          results.push({
            index: i,
            status,
            display_name: displayName,
            team_name: teamName,
            league_member_id: r.league_member_id ?? null,
            season_member_id: r.season_member_id ?? null,
            fantasy_team_id: r.team_id ?? null,
            draft_day_eligible: r.draft_day_eligible ?? null,
            error: null
          });
        }
      }
      const newlyCreatedResults = results.filter((r) => r.status === "created");
      for (const r of newlyCreatedResults) {
        if (r.season_member_id && r.fantasy_team_id) {
          await _appendMemberToWeeklyCards(
            supabase,
            seasonId,
            r.season_member_id,
            r.fantasy_team_id,
            r.display_name,
            r.team_name
          );
        }
      }
      console.log(
        `[fantasy] Batch import: season=${seasonId.slice(0, 8)}\u2026 created=${created_count} replayed=${replayed_count} failed=${failed_count} weekly_updated=${newlyCreatedResults.length}`
      );
      const httpStatus = failed_count > 0 && created_count === 0 && replayed_count === 0 ? 400 : 200;
      res2.status(httpStatus).json({
        results,
        created_count,
        replayed_count,
        failed_count
      });
    }
  );
  app2.patch(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/members/:seasonMemberId",
    async (req, res2) => {
      const { leagueId, seasonId, seasonMemberId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const { display_name, team_name } = req.body;
      if (!display_name?.trim()) {
        res2.status(400).json({ error: "display_name is required" });
        return;
      }
      if (!team_name?.trim()) {
        res2.status(400).json({ error: "team_name is required" });
        return;
      }
      const { data: smCheck } = await supabase.from("fantasy_season_members").select("id").eq("id", seasonMemberId).eq("league_season_id", seasonId).maybeSingle();
      if (!smCheck) {
        res2.status(404).json({ error: "Member not found in this season" });
        return;
      }
      const { data, error } = await supabase.rpc("update_fantasy_member", {
        p_season_member_id: seasonMemberId,
        p_display_name: display_name.trim(),
        p_team_name: team_name.trim(),
        p_season_id: seasonId
      });
      if (error) {
        console.error("[fantasy] update_fantasy_member error:", error.message);
        const isValidation = error.message.includes("cannot be empty") || error.message.includes("not found");
        res2.status(isValidation ? 400 : 500).json({
          error: isValidation ? error.message : "Failed to update member"
        });
        return;
      }
      console.log(
        `[fantasy] Member renamed: season=${seasonId.slice(0, 8)}\u2026 sm=${seasonMemberId.slice(0, 8)}\u2026 props_updated=${data?.props_updated} participant_updated=${data?.participant_updated}`
      );
      res2.json(data);
    }
  );
  app2.patch(
    "/api/fantasy/leagues/:leagueId",
    async (req, res2) => {
      const { leagueId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyLeagueCommissioner(req, res2, supabase, leagueId);
      if (!commissioner) return;
      const { league_name } = req.body;
      const trimmed = league_name?.trim();
      if (!trimmed) {
        res2.status(400).json({ error: "league_name is required and cannot be blank" });
        return;
      }
      if (trimmed.length > 100) {
        res2.status(400).json({ error: "league_name too long (max 100 characters)" });
        return;
      }
      const { data, error } = await supabase.from("fantasy_leagues").update({ league_name: trimmed, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", leagueId).select("id, league_name").single();
      if (error) {
        console.error("[fantasy] PATCH /leagues/:leagueId error:", error.message);
        res2.status(500).json({ error: "Failed to update league name" });
        return;
      }
      console.log(
        `[fantasy] League renamed: id=${leagueId.slice(0, 8)}\u2026 new_name="${trimmed}"`
      );
      res2.json({ id: data.id, league_name: data.league_name });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/archive",
    async (req, res2) => {
      const { leagueId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requirePrimaryLeagueCommissioner(req, res2, supabase, leagueId);
      if (!commissioner) return;
      const { data: league } = await supabase.from("fantasy_leagues").select("id, league_name, is_active").eq("id", leagueId).maybeSingle();
      if (!league) {
        res2.status(404).json({ error: "League not found" });
        return;
      }
      if (!league.is_active) {
        res2.json({
          archived: true,
          already_archived: true,
          league_id: leagueId,
          league_name: league.league_name
        });
        return;
      }
      const { data: seasons } = await supabase.from("fantasy_league_seasons").select("id").eq("league_id", leagueId);
      const seasonIds = (seasons ?? []).map((s) => s.id);
      if (seasonIds.length > 0) {
        const { data: unresolvedRooms } = await supabase.from("gameday_rooms").select("id, status").in("league_season_id", seasonIds).eq("experience_type", "fantasy").is("archived_at", null).not("status", "eq", "finalized").limit(1);
        if ((unresolvedRooms ?? []).length > 0) {
          res2.status(409).json({
            error: "Finish or finalize the current Swayger before archiving this league.",
            code: "UNRESOLVED_COMPETITION"
          });
          return;
        }
      }
      const { error: updateError } = await supabase.from("fantasy_leagues").update({ is_active: false, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", leagueId);
      if (updateError) {
        console.error("[fantasy] archive league error:", updateError.message);
        res2.status(500).json({ error: "Failed to archive league" });
        return;
      }
      console.log(`[fantasy] League archived: id=${leagueId.slice(0, 8)}\u2026 name="${league.league_name}"`);
      res2.json({
        archived: true,
        league_id: leagueId,
        league_name: league.league_name
      });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/restore",
    async (req, res2) => {
      const { leagueId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requirePrimaryLeagueCommissioner(req, res2, supabase, leagueId);
      if (!commissioner) return;
      const { data: league } = await supabase.from("fantasy_leagues").select("id, league_name, is_active").eq("id", leagueId).maybeSingle();
      if (!league) {
        res2.status(404).json({ error: "League not found" });
        return;
      }
      if (league.is_active) {
        res2.json({
          restored: true,
          already_active: true,
          league_id: leagueId,
          league_name: league.league_name
        });
        return;
      }
      const { error: updateError } = await supabase.from("fantasy_leagues").update({ is_active: true, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", leagueId);
      if (updateError) {
        console.error("[fantasy] restore league error:", updateError.message);
        res2.status(500).json({ error: "Failed to restore league" });
        return;
      }
      console.log(`[fantasy] League restored: id=${leagueId.slice(0, 8)}\u2026 name="${league.league_name}"`);
      res2.json({
        restored: true,
        league_id: leagueId,
        league_name: league.league_name
      });
    }
  );
  app2.get("/api/fantasy/leagues", async (req, res2) => {
    const userId = requireFantasyAuth(req, res2);
    if (!userId) return;
    const supabase = getServiceSupabase();
    const statusFilter = req.query.status?.toLowerCase();
    if (statusFilter === "archived") {
      const { data: claims2 } = await supabase.from("fantasy_member_claims").select("league_member_id").eq("user_id", userId).eq("is_active", true);
      if (!claims2?.length) {
        res2.json({ leagues: [] });
        return;
      }
      const memberIds2 = claims2.map((c) => c.league_member_id);
      const { data: leagueMembers2 } = await supabase.from("fantasy_league_members").select("league_id").in("id", memberIds2).eq("is_active", true);
      if (!leagueMembers2?.length) {
        res2.json({ leagues: [] });
        return;
      }
      const leagueIds2 = [
        ...new Set(leagueMembers2.map((lm) => lm.league_id))
      ];
      const { data: leagues2, error: error2 } = await supabase.from("fantasy_leagues").select(
        "id, league_name, sport, is_active, created_at, fantasy_league_seasons(id, season_year, status)"
      ).in("id", leagueIds2).eq("is_active", false).order("created_at", { ascending: false });
      if (error2) {
        console.error("[fantasy] GET /leagues?status=archived error:", error2.message);
        res2.status(500).json({ error: "Failed to fetch archived leagues" });
        return;
      }
      res2.json({ leagues: leagues2 ?? [] });
      return;
    }
    const { data: claims } = await supabase.from("fantasy_member_claims").select("league_member_id").eq("user_id", userId).eq("is_active", true);
    if (!claims?.length) {
      res2.json({ leagues: [] });
      return;
    }
    const memberIds = claims.map((c) => c.league_member_id);
    const { data: leagueMembers } = await supabase.from("fantasy_league_members").select("league_id").in("id", memberIds).eq("is_active", true);
    if (!leagueMembers?.length) {
      res2.json({ leagues: [] });
      return;
    }
    const leagueIds = [
      ...new Set(leagueMembers.map((lm) => lm.league_id))
    ];
    const { data: leagues, error } = await supabase.from("fantasy_leagues").select(
      "id, league_name, sport, is_active, created_at, fantasy_league_seasons(id, season_year, status)"
    ).in("id", leagueIds).eq("is_active", true).order("created_at", { ascending: false });
    if (error) {
      console.error("[fantasy] GET /leagues error:", error.message);
      res2.status(500).json({ error: "Failed to fetch leagues" });
      return;
    }
    res2.json({ leagues: leagues ?? [] });
  });
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId",
    async (req, res2) => {
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const { data: league } = await supabase.from("fantasy_leagues").select("id, league_name, sport, is_active").eq("id", leagueId).maybeSingle();
      if (!league) {
        res2.status(404).json({ error: "League not found" });
        return;
      }
      const { data: season } = await supabase.from("fantasy_league_seasons").select(
        "id, season_year, status, default_reward_description, default_reward_amount_display"
      ).eq("id", seasonId).eq("league_id", leagueId).maybeSingle();
      if (!season) {
        res2.status(404).json({ error: "Season not found" });
        return;
      }
      const { data: seasonMembers } = await supabase.from("fantasy_season_members").select("id, role, is_active, fantasy_league_members(id, display_name)").eq("league_season_id", seasonId).eq("is_active", true);
      const { data: teams } = await supabase.from("fantasy_teams").select(
        "id, team_name, is_active, fantasy_team_managers(id, season_member_id, role, is_active)"
      ).eq("league_season_id", seasonId).eq("is_active", true);
      const participants = (seasonMembers ?? []).map((sm) => {
        const lm = sm.fantasy_league_members;
        const managedTeam = (teams ?? []).find(
          (t) => (t.fantasy_team_managers ?? []).some(
            (mgr) => mgr.season_member_id === sm.id && mgr.is_active
          )
        );
        const managedMgr = managedTeam ? (managedTeam.fantasy_team_managers ?? []).find(
          (mgr) => mgr.season_member_id === sm.id && mgr.is_active
        ) : null;
        return {
          season_member_id: sm.id,
          league_member_id: lm?.id ?? null,
          display_name: lm?.display_name ?? null,
          role: sm.role,
          team_id: managedTeam?.id ?? null,
          team_name: managedTeam?.team_name ?? null,
          manager_id: managedMgr?.id ?? null,
          manager_role: managedMgr?.role ?? null
        };
      });
      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId);
      const lmIds = participants.map((p) => p.league_member_id).filter(Boolean);
      const { data: activeClaims } = lmIds.length ? await supabase.from("fantasy_member_claims").select("league_member_id, user_id, guest_token").in("league_member_id", lmIds).eq("is_active", true) : { data: [] };
      const claimedMemberIds = new Set(
        (activeClaims ?? []).map((c) => c.league_member_id)
      );
      const claimTypeByMemberId = {};
      for (const c of activeClaims ?? []) {
        claimTypeByMemberId[c.league_member_id] = c.user_id ? "account" : "guest";
      }
      const isCommissioner = viewer && (viewer.role === "commissioner" || viewer.role === "co_commissioner");
      const participantsWithClaims = participants.map((p) => ({
        ...p,
        is_claimed: p.league_member_id ? claimedMemberIds.has(p.league_member_id) : false,
        // Commissioner-only: how the seat was claimed (guest token vs linked account).
        ...isCommissioner && p.league_member_id ? { claim_type: claimTypeByMemberId[p.league_member_id] ?? null } : {}
      }));
      res2.json({ league, season, participants: participantsWithClaims, viewer });
    }
  );
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/join-info",
    async (req, res2) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const identity = getCallerIdentity2(req);
      const { data: league } = await supabase.from("fantasy_leagues").select("id, league_name, sport, is_active").eq("id", leagueId).maybeSingle();
      if (!league || !league.is_active) {
        res2.status(404).json({ error: "League not found" });
        return;
      }
      const { data: season } = await supabase.from("fantasy_league_seasons").select(
        "id, season_year, status, default_reward_description, default_reward_amount_display"
      ).eq("id", seasonId).eq("league_id", leagueId).maybeSingle();
      if (!season) {
        res2.status(404).json({ error: "Season not found" });
        return;
      }
      const { data: seasonMembers } = await supabase.from("fantasy_season_members").select("id, role, fantasy_league_members(id, display_name)").eq("league_season_id", seasonId).eq("is_active", true);
      const { data: teams } = await supabase.from("fantasy_teams").select("id, team_name, fantasy_team_managers(season_member_id, is_active)").eq("league_season_id", seasonId).eq("is_active", true);
      const smIds = (seasonMembers ?? []).map((sm) => sm.id);
      const lmIds = (seasonMembers ?? []).map((sm) => sm.fantasy_league_members?.id).filter(Boolean);
      const { data: activeClaims } = lmIds.length ? await supabase.from("fantasy_member_claims").select("league_member_id").in("league_member_id", lmIds).eq("is_active", true) : { data: [] };
      const claimedMemberIds = new Set(
        (activeClaims ?? []).map((c) => c.league_member_id)
      );
      const viewer = identity.userId || identity.guestToken ? await resolveViewer(supabase, identity, seasonId, leagueId) : null;
      const seats = (seasonMembers ?? []).map((sm) => {
        const lm = sm.fantasy_league_members;
        const memberTeam = (teams ?? []).find(
          (t) => (t.fantasy_team_managers ?? []).some(
            (mgr) => mgr.season_member_id === sm.id && mgr.is_active
          )
        );
        const lmId = lm?.id ?? null;
        const isClaimed = lmId ? claimedMemberIds.has(lmId) : false;
        const isMine = viewer ? viewer.league_member_id === lmId : false;
        return {
          season_member_id: sm.id,
          league_member_id: lmId,
          display_name: lm?.display_name ?? null,
          team_name: memberTeam?.team_name ?? null,
          role: sm.role,
          is_claimed: isClaimed,
          is_mine: isMine
        };
      });
      seats.sort((a, b) => {
        if (a.role === "commissioner") return -1;
        if (b.role === "commissioner") return 1;
        return (a.display_name ?? "").localeCompare(b.display_name ?? "");
      });
      console.log(
        `[fantasy] join-info: league=${leagueId.slice(0, 8)}\u2026 season=${seasonId.slice(0, 8)}\u2026 seats=${seats.length} caller=${identity.userId?.slice(0, 8) ?? identity.guestToken?.slice(0, 8) ?? "anon"}`
      );
      res2.json({
        league,
        season,
        seats,
        my_seat: viewer ?? null
      });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/claim",
    async (req, res2) => {
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized \u2014 provide Bearer token or X-Fantasy-Guest-Token" });
        return;
      }
      const { leagueId, seasonId } = req.params;
      const { league_member_id } = req.body;
      if (!league_member_id?.trim()) {
        res2.status(400).json({ error: "league_member_id is required" });
        return;
      }
      const supabase = getServiceSupabase();
      if (!await requireLeagueActive(supabase, leagueId, res2)) {
        return;
      }
      const { data, error } = await supabase.rpc("claim_fantasy_seat", {
        p_league_id: leagueId,
        p_season_id: seasonId,
        p_member_id: league_member_id.trim(),
        p_user_id: identity.userId ?? null,
        p_guest_token: identity.guestToken ?? null
      });
      if (error) {
        console.error("[fantasy] claim_fantasy_seat error:", error.message);
        if (error.message.includes("seat_already_claimed")) {
          res2.status(409).json({ error: "This seat has already been claimed by someone else." });
          return;
        }
        if (error.message.includes("member_not_found")) {
          res2.status(403).json({ error: "Member not found in this league/season." });
          return;
        }
        if (error.message.includes("season_not_found")) {
          res2.status(403).json({ error: "Season does not belong to this league." });
          return;
        }
        res2.status(500).json({ error: "Failed to claim seat" });
        return;
      }
      const result = data;
      console.log(
        `[fantasy] Seat claimed: league=${leagueId.slice(0, 8)}\u2026 member=${result.league_member_id?.slice(0, 8)}\u2026 by=${identity.userId?.slice(0, 8) ?? "guest"}\u2026 already_existed=${result.already_existed}`
      );
      res2.status(result.already_existed ? 200 : 201).json(result);
    }
  );
  app2.post(
    "/api/fantasy/claim/upgrade",
    async (req, res2) => {
      const userId = requireFantasyAuth(req, res2);
      if (!userId) return;
      const { guest_token, league_member_id } = req.body;
      if (!guest_token?.trim()) {
        res2.status(400).json({ error: "guest_token is required" });
        return;
      }
      if (!league_member_id?.trim()) {
        res2.status(400).json({ error: "league_member_id is required" });
        return;
      }
      const gt = guest_token.trim();
      const lmId = league_member_id.trim();
      const supabase = getServiceSupabase();
      const { data: guestClaim } = await supabase.from("fantasy_member_claims").select("id, league_member_id, user_id").eq("guest_token", gt).eq("league_member_id", lmId).eq("is_active", true).maybeSingle();
      if (guestClaim) {
        const claimUserId = guestClaim.user_id;
        if (claimUserId !== null) {
          if (claimUserId === userId) {
            res2.json({ already_upgraded: true, claim_id: guestClaim.id });
            return;
          }
          res2.status(409).json({ error: "This seat is already claimed by a different user." });
          return;
        }
        const { data: updated, error } = await supabase.from("fantasy_member_claims").update({ user_id: userId, guest_token: null }).eq("id", guestClaim.id).select("id, league_member_id").maybeSingle();
        if (error) {
          console.error("[fantasy] claim upgrade error:", error.message);
          res2.status(500).json({ error: "Failed to upgrade claim" });
          return;
        }
        console.log(
          `[fantasy] Claim upgraded: member=${lmId.slice(0, 8)}\u2026 user=${userId.slice(0, 8)}\u2026`
        );
        res2.json({
          claim_id: updated.id,
          league_member_id: updated.league_member_id,
          upgraded: true
        });
        return;
      }
      const { data: existingAuth } = await supabase.from("fantasy_member_claims").select("id, user_id").eq("league_member_id", lmId).eq("user_id", userId).eq("is_active", true).maybeSingle();
      if (existingAuth) {
        res2.json({ already_upgraded: true, claim_id: existingAuth.id });
        return;
      }
      res2.status(404).json({
        error: "No active guest claim found for the provided token and seat."
      });
    }
  );
  async function generateFantasyRoomCode(supabase) {
    const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 30; i++) {
      const code = Array.from(
        { length: 6 },
        () => CHARS[Math.floor(Math.random() * CHARS.length)]
      ).join("");
      const { data } = await supabase.from("gameday_rooms").select("id").eq("room_code", code).maybeSingle();
      if (!data) return code;
    }
    throw new Error("Could not generate unique room code after 30 attempts");
  }
  function buildAnswerOptions(targetType, seasonMembers, teams, staticOptions, supportsNoOne = false) {
    const NO_ONE = { id: "no_one", label: "No one", type: "static" };
    switch (targetType) {
      case "season_member": {
        const opts = seasonMembers.map((sm) => ({
          id: sm.id,
          label: sm.display_name ?? "Unknown",
          type: "season_member"
        }));
        if (supportsNoOne) opts.push(NO_ONE);
        return opts;
      }
      case "fantasy_team": {
        const opts = teams.map((t) => ({
          id: t.id,
          label: t.team_name ?? "Unknown Team",
          type: "fantasy_team"
        }));
        if (supportsNoOne) opts.push(NO_ONE);
        return opts;
      }
      case "yes_no":
        return [
          { id: "yes", label: "Yes", type: "yes_no" },
          { id: "no", label: "No", type: "yes_no" }
        ];
      case "static":
        return (staticOptions ?? []).map((opt, i) => ({
          id: typeof opt === "string" ? opt.toLowerCase().replace(/\s+/g, "_") : `opt_${i}`,
          label: typeof opt === "string" ? opt : String(opt),
          type: "static"
        }));
      default:
        return [];
    }
  }
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/templates",
    async (req, res2) => {
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const { data: season } = await supabase.from("fantasy_league_seasons").select("fantasy_leagues(sport)").eq("id", seasonId).eq("league_id", leagueId).maybeSingle();
      if (!season) {
        res2.status(404).json({ error: "Season not found" });
        return;
      }
      const sport = season.fantasy_leagues?.sport ?? "football";
      let templates = null;
      let templateError = null;
      const tmplResult = await supabase.from("gameday_prop_library").select(
        "id, question, scoring_scope, point_value, answer_target_type, settlement_window, is_default, display_order, supports_no_one"
      ).eq("experience_type", "fantasy").eq("competition_type", "draft_day").eq("sport", sport).eq("is_active", true).order("display_order", { ascending: true });
      if (tmplResult.error?.message?.includes("supports_no_one")) {
        console.warn("[fantasy] supports_no_one column missing \u2014 fetching templates without it");
        const fallback = await supabase.from("gameday_prop_library").select(
          "id, question, scoring_scope, point_value, answer_target_type, settlement_window, is_default, display_order"
        ).eq("experience_type", "fantasy").eq("competition_type", "draft_day").eq("sport", sport).eq("is_active", true).order("display_order", { ascending: true });
        templates = (fallback.data ?? []).map((t) => ({ ...t, supports_no_one: false }));
        templateError = fallback.error;
      } else {
        templates = tmplResult.data ?? [];
        templateError = tmplResult.error;
      }
      if (templateError) {
        console.error("[fantasy] draft-day templates error:", templateError.message);
        res2.status(500).json({ error: "Failed to fetch templates" });
        return;
      }
      const rows = templates ?? [];
      res2.json({
        sport,
        competition: rows.filter((t) => t.scoring_scope === "competition"),
        season: rows.filter((t) => t.scoring_scope === "season")
      });
    }
  );
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day",
    async (req, res2) => {
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const { data: room } = await supabase.from("gameday_rooms").select("id, status, room_code, created_at").eq("league_season_id", seasonId).eq("competition_type", "draft_day").eq("experience_type", "fantasy").is("archived_at", null).order("created_at", { ascending: true }).maybeSingle();
      if (!room) {
        res2.json(null);
        return;
      }
      const { data: card } = await supabase.from("gameday_pick_cards").select("id, status").eq("room_id", room.id).order("created_at", { ascending: true }).maybeSingle();
      if (!card) {
        res2.json(null);
        return;
      }
      const { data: props } = await supabase.from("gameday_props").select("id, template_prop_id, scoring_scope, point_value, display_order, status").eq("card_id", card.id).order("display_order", { ascending: true });
      const propList = props ?? [];
      const propIds = propList.map((p) => p.id);
      const competitionCount = propList.filter((p) => p.scoring_scope === "competition").length;
      const seasonCount = propList.filter((p) => p.scoring_scope === "season").length;
      const settledCompetitionCount = propList.filter(
        (p) => p.scoring_scope === "competition" && p.status === "settled"
      ).length;
      let pickCount = 0;
      if (propIds.length > 0) {
        try {
          const { count } = await supabase.from("gameday_picks").select("id", { count: "exact", head: true }).in("prop_id", propIds);
          pickCount = count ?? 0;
        } catch {
          pickCount = 0;
        }
      }
      const templatePropIds = propList.map((p) => p.template_prop_id).filter(Boolean);
      let libraryMap = {};
      if (templatePropIds.length > 0) {
        const { data: libRows } = await supabase.from("gameday_prop_library").select("id, question, is_active, supports_no_one").in("id", templatePropIds);
        for (const row of libRows ?? []) {
          libraryMap[row.id] = {
            question: row.question ?? "",
            is_active: row.is_active ?? true,
            supports_no_one: row.supports_no_one ?? false
          };
        }
      }
      const currentProps = propList.map((p) => {
        const lib = libraryMap[p.template_prop_id] ?? { question: "", is_active: true, supports_no_one: false };
        return {
          template_prop_id: p.template_prop_id,
          question: lib.question,
          scoring_scope: p.scoring_scope,
          point_value: p.point_value,
          is_active: lib.is_active,
          supports_no_one: lib.supports_no_one
        };
      });
      let myPickCount = 0;
      try {
        const viewerIdentity = getCallerIdentity2(req);
        if ((viewerIdentity.userId || viewerIdentity.guestToken) && propIds.length > 0) {
          const viewerData = await resolveViewer(supabase, viewerIdentity, seasonId, leagueId);
          if (viewerData) {
            const { data: vParticipant } = await supabase.from("gameday_participants").select("id").eq("room_id", room.id).eq("season_member_id", viewerData.season_member_id).maybeSingle();
            if (vParticipant) {
              const { count: myCount } = await supabase.from("gameday_picks").select("id", { count: "exact", head: true }).in("prop_id", propIds).eq("participant_id", vParticipant.id);
              myPickCount = myCount ?? 0;
            }
          }
        }
      } catch {
        myPickCount = 0;
      }
      res2.json({
        room_id: room.id,
        card_id: card.id,
        room_code: room.room_code ?? null,
        room_status: room.status,
        card_status: card.status,
        prop_counts: { competition: competitionCount, season: seasonCount },
        settled_competition_count: settledCompetitionCount,
        pick_count: pickCount,
        my_pick_count: myPickCount,
        current_props: currentProps,
        created_at: room.created_at
      });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/publish",
    async (req, res2) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const userId = commissioner.userId;
      if (!await requireLeagueActive(supabase, leagueId, res2)) return;
      const { selected_prop_ids } = req.body;
      if (!Array.isArray(selected_prop_ids) || selected_prop_ids.length === 0) {
        res2.status(400).json({ error: "select at least one question" });
        return;
      }
      const MAX_DRAFT_DAY_QUESTIONS = 15;
      if (selected_prop_ids.length > MAX_DRAFT_DAY_QUESTIONS) {
        res2.status(400).json({
          error: `Too many questions selected. Maximum is ${MAX_DRAFT_DAY_QUESTIONS}.`,
          max: MAX_DRAFT_DAY_QUESTIONS,
          selected: selected_prop_ids.length
        });
        return;
      }
      const { data: season } = await supabase.from("fantasy_league_seasons").select("id, season_year, fantasy_leagues(id, league_name, sport)").eq("id", seasonId).eq("league_id", leagueId).maybeSingle();
      if (!season) {
        res2.status(404).json({ error: "Season not found" });
        return;
      }
      const league = season.fantasy_leagues;
      const sport = league.sport;
      const leagueName = league.league_name;
      const roomName = `${leagueName} \u2014 ${season.season_year} Draft Day`;
      let templates = null;
      const tmplFull = await supabase.from("gameday_prop_library").select(
        "id, question, scoring_scope, point_value, answer_target_type, answer_options, supports_no_one"
      ).in("id", selected_prop_ids).eq("experience_type", "fantasy").eq("competition_type", "draft_day").eq("sport", sport).eq("is_active", true);
      if (tmplFull.error?.message?.includes("supports_no_one")) {
        console.warn("[fantasy] publish: supports_no_one column missing \u2014 inserting without it");
        const tmplFallback = await supabase.from("gameday_prop_library").select(
          "id, question, scoring_scope, point_value, answer_target_type, answer_options"
        ).in("id", selected_prop_ids).eq("experience_type", "fantasy").eq("competition_type", "draft_day").eq("sport", sport).eq("is_active", true);
        templates = (tmplFallback.data ?? []).map((t) => ({ ...t, supports_no_one: false }));
        if (tmplFallback.error) {
          res2.status(400).json({ error: "No valid templates found for selection" });
          return;
        }
      } else {
        templates = tmplFull.data ?? [];
        if (tmplFull.error) {
          res2.status(400).json({ error: "No valid templates found for selection" });
          return;
        }
      }
      if (!templates || templates.length === 0) {
        res2.status(400).json({ error: "No valid templates found for selection" });
        return;
      }
      const { data: seasonMembers } = await supabase.from("fantasy_season_members").select("id, fantasy_league_members(display_name)").eq("league_season_id", seasonId).eq("is_active", true).order("created_at", { ascending: true });
      const { data: teams } = await supabase.from("fantasy_teams").select("id, team_name").eq("league_season_id", seasonId);
      const memberList = (seasonMembers ?? []).map((sm) => ({
        id: sm.id,
        display_name: sm.fantasy_league_members?.display_name ?? null
      }));
      const teamList = teams ?? [];
      const propsPayload = templates.map((tmpl, i) => ({
        library_id: tmpl.id,
        question: tmpl.question,
        answer_options: buildAnswerOptions(
          tmpl.answer_target_type,
          memberList,
          teamList,
          tmpl.answer_options,
          tmpl.supports_no_one ?? false
        ),
        scoring_scope: tmpl.scoring_scope,
        point_value: tmpl.point_value,
        answer_target_type: tmpl.answer_target_type ?? null,
        display_order: i
      }));
      let roomCode = null;
      try {
        roomCode = await generateFantasyRoomCode(supabase);
      } catch (e) {
        console.warn("[fantasy] room_code generation skipped:", e.message);
      }
      const { data: existingRoom } = await supabase.from("gameday_rooms").select("id").eq("league_season_id", seasonId).eq("competition_type", "draft_day").eq("experience_type", "fantasy").is("archived_at", null).maybeSingle();
      if (existingRoom) {
        const { data: existingCard } = await supabase.from("gameday_pick_cards").select("id").eq("room_id", existingRoom.id).maybeSingle();
        console.log(
          `[fantasy] Draft Day already exists: room=${String(existingRoom.id).slice(0, 8)}\u2026 (idempotent)`
        );
        res2.status(200).json({
          room_id: existingRoom.id,
          card_id: existingCard?.id ?? null,
          room_code: null,
          already_existed: true
        });
        return;
      }
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "publish_fantasy_draft_day",
        {
          p_league_season_id: seasonId,
          p_room_name: roomName,
          p_sport: sport,
          p_room_code: roomCode,
          p_host_user_id: userId,
          p_props: propsPayload
        }
      );
      if (rpcError || !rpcResult) {
        console.error("[fantasy] publish_fantasy_draft_day RPC error:", rpcError?.message);
        res2.status(500).json({ error: "Failed to publish Draft Day" });
        return;
      }
      const newRoomId = rpcResult.room_id;
      const newCardId = rpcResult.card_id;
      const alreadyExisted = rpcResult.already_existed;
      if (alreadyExisted) {
        console.log(
          `[fantasy] Draft Day already exists (RPC idempotent): room=${String(newRoomId).slice(0, 8)}\u2026`
        );
        res2.status(200).json({
          room_id: newRoomId,
          card_id: newCardId,
          room_code: null,
          already_existed: true
        });
        return;
      }
      console.log(
        `[fantasy] Draft Day published via RPC: season=${seasonId.slice(0, 8)}\u2026 room=${newRoomId.slice(0, 8)}\u2026 props=${propsPayload.length}`
      );
      res2.status(201).json({
        room_id: newRoomId,
        card_id: newCardId,
        room_code: roomCode,
        already_existed: false
      });
    }
  );
  app2.patch(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/props",
    async (req, res2) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const { selected_prop_ids } = req.body;
      if (!Array.isArray(selected_prop_ids) || selected_prop_ids.length === 0) {
        res2.status(400).json({ error: "select at least one question" });
        return;
      }
      const MAX_DRAFT_DAY_QUESTIONS = 15;
      if (selected_prop_ids.length > MAX_DRAFT_DAY_QUESTIONS) {
        res2.status(400).json({
          error: `Too many questions selected. Maximum is ${MAX_DRAFT_DAY_QUESTIONS}.`,
          max: MAX_DRAFT_DAY_QUESTIONS,
          selected: selected_prop_ids.length
        });
        return;
      }
      const { data: room } = await supabase.from("gameday_rooms").select("id, status").eq("league_season_id", seasonId).eq("competition_type", "draft_day").eq("experience_type", "fantasy").is("archived_at", null).maybeSingle();
      if (!room) {
        res2.status(404).json({ error: "No published Draft Day found for this season" });
        return;
      }
      const { data: card } = await supabase.from("gameday_pick_cards").select("id, status").eq("room_id", room.id).maybeSingle();
      if (!card) {
        res2.status(404).json({ error: "Draft Day pick card not found" });
        return;
      }
      const cardStatus = card.status;
      const cardId = card.id;
      if (cardStatus !== "open") {
        res2.status(409).json({
          error: cardStatus === "locked" ? "Draft Day picks are locked. Unlock picks before making changes." : "Draft Day has been finalized and cannot be changed.",
          card_status: cardStatus
        });
        return;
      }
      const { data: existingCardPropsForGuard } = await supabase.from("gameday_props").select("id").eq("card_id", cardId);
      const guardPropIds = (existingCardPropsForGuard ?? []).map((p) => p.id);
      let pickCount = 0;
      if (guardPropIds.length > 0) {
        try {
          const { count } = await supabase.from("gameday_picks").select("id", { count: "exact", head: true }).in("prop_id", guardPropIds);
          pickCount = count ?? 0;
        } catch {
          pickCount = 0;
        }
      }
      if (pickCount > 0) {
        res2.status(409).json({
          error: "Members have already submitted picks. Draft Day questions cannot be changed.",
          pick_count: pickCount
        });
        return;
      }
      const { data: season } = await supabase.from("fantasy_league_seasons").select("id, season_year, fantasy_leagues(id, league_name, sport)").eq("id", seasonId).eq("league_id", leagueId).maybeSingle();
      if (!season) {
        res2.status(404).json({ error: "Season not found" });
        return;
      }
      const sport = season.fantasy_leagues.sport;
      const { data: existingProps } = await supabase.from("gameday_props").select("template_prop_id").eq("card_id", cardId);
      const existingIds = new Set((existingProps ?? []).map((p) => p.template_prop_id));
      const grandfatheredIds = selected_prop_ids.filter((id) => existingIds.has(id));
      const newIds = selected_prop_ids.filter((id) => !existingIds.has(id));
      let grandfatheredTemplates = [];
      if (grandfatheredIds.length > 0) {
        const { data: gfData } = await supabase.from("gameday_prop_library").select("id, question, scoring_scope, point_value, answer_target_type, answer_options, supports_no_one").in("id", grandfatheredIds).eq("experience_type", "fantasy").eq("competition_type", "draft_day").eq("sport", sport);
        grandfatheredTemplates = gfData ?? [];
        if (grandfatheredTemplates.length !== grandfatheredIds.length) {
          const found = new Set(grandfatheredTemplates.map((t) => t.id));
          const missing = grandfatheredIds.filter((id) => !found.has(id));
          res2.status(400).json({ error: `Existing templates not found in library: ${missing.join(", ")}` });
          return;
        }
      }
      let newTemplates = [];
      if (newIds.length > 0) {
        const newFull = await supabase.from("gameday_prop_library").select("id, question, scoring_scope, point_value, answer_target_type, answer_options, supports_no_one").in("id", newIds).eq("experience_type", "fantasy").eq("competition_type", "draft_day").eq("sport", sport).eq("is_active", true);
        if (newFull.error?.message?.includes("supports_no_one")) {
          const fb = await supabase.from("gameday_prop_library").select("id, question, scoring_scope, point_value, answer_target_type, answer_options").in("id", newIds).eq("experience_type", "fantasy").eq("competition_type", "draft_day").eq("sport", sport).eq("is_active", true);
          newTemplates = (fb.data ?? []).map((t) => ({ ...t, supports_no_one: false }));
        } else {
          newTemplates = newFull.data ?? [];
        }
        if (newTemplates.length !== newIds.length) {
          const found = new Set(newTemplates.map((t) => t.id));
          const invalid = newIds.filter((id) => !found.has(id));
          res2.status(400).json({
            error: `Some templates are not available: ${invalid.join(", ")}`,
            invalid_ids: invalid
          });
          return;
        }
      }
      const templateById = {};
      for (const t of [...grandfatheredTemplates, ...newTemplates]) templateById[t.id] = t;
      const [membersResult, teamsResult] = await Promise.all([
        supabase.from("fantasy_season_members").select("id, fantasy_league_members(display_name)").eq("league_season_id", seasonId).eq("is_active", true).order("created_at", { ascending: true }),
        supabase.from("fantasy_teams").select("id, team_name").eq("league_season_id", seasonId)
      ]);
      const memberList = (membersResult.data ?? []).map((sm) => ({
        id: sm.id,
        display_name: sm.fantasy_league_members?.display_name ?? null
      }));
      const teamList = teamsResult.data ?? [];
      const propsPayload = selected_prop_ids.map((id, i) => {
        const tmpl = templateById[id];
        return {
          library_id: tmpl.id,
          question: tmpl.question,
          answer_options: buildAnswerOptions(
            tmpl.answer_target_type,
            memberList,
            teamList,
            tmpl.answer_options,
            tmpl.supports_no_one ?? false
          ),
          scoring_scope: tmpl.scoring_scope,
          point_value: tmpl.point_value,
          answer_target_type: tmpl.answer_target_type ?? null,
          display_order: i
        };
      });
      const { error: rpcError } = await supabase.rpc(
        "update_fantasy_draft_day_props",
        { p_card_id: cardId, p_props: propsPayload }
      );
      if (rpcError) {
        console.error("[fantasy] update_fantasy_draft_day_props RPC error:", rpcError.message);
        res2.status(500).json({ error: "Failed to update Draft Day questions. Is the Phase 4A.2 SQL applied?" });
        return;
      }
      const { data: updatedProps } = await supabase.from("gameday_props").select("scoring_scope").eq("card_id", cardId);
      const updatedList = updatedProps ?? [];
      const compCount = updatedList.filter((p) => p.scoring_scope === "competition").length;
      const seasCount = updatedList.filter((p) => p.scoring_scope === "season").length;
      console.log(
        `[fantasy] Draft Day props updated: card=${cardId.slice(0, 8)}\u2026 props=${propsPayload.length}`
      );
      res2.json({
        card_id: cardId,
        room_id: room.id,
        prop_counts: { competition: compCount, season: seasCount }
      });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/lock",
    async (req, res2) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const userId = commissioner.userId;
      const { data: room } = await supabase.from("gameday_rooms").select("id").eq("league_season_id", seasonId).eq("competition_type", "draft_day").eq("experience_type", "fantasy").is("archived_at", null).maybeSingle();
      if (!room) {
        res2.status(404).json({ error: "No published Draft Day found for this season" });
        return;
      }
      const { data: card } = await supabase.from("gameday_pick_cards").select("id, status").eq("room_id", room.id).maybeSingle();
      if (!card) {
        res2.status(404).json({ error: "Draft Day pick card not found" });
        return;
      }
      const currentStatus = card.status;
      if (currentStatus === "locked" || currentStatus === "settled") {
        res2.json({ card_status: currentStatus, already_locked: true });
        return;
      }
      const { error } = await supabase.from("gameday_pick_cards").update({ status: "locked", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", card.id);
      if (error) {
        console.error("[fantasy] draft-day lock error:", error.message);
        res2.status(500).json({ error: "Failed to lock Draft Day" });
        return;
      }
      console.log(
        `[fantasy] Draft Day locked: card=${String(card.id).slice(0, 8)}\u2026 by=${userId.slice(0, 8)}\u2026`
      );
      res2.json({ card_status: "locked", already_locked: false });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/unlock",
    async (req, res2) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const userId = commissioner.userId;
      const { data: room } = await supabase.from("gameday_rooms").select("id").eq("league_season_id", seasonId).eq("competition_type", "draft_day").eq("experience_type", "fantasy").is("archived_at", null).maybeSingle();
      if (!room) {
        res2.status(404).json({ error: "No published Draft Day found for this season" });
        return;
      }
      const { data: card } = await supabase.from("gameday_pick_cards").select("id, status").eq("room_id", room.id).maybeSingle();
      if (!card) {
        res2.status(404).json({ error: "Draft Day pick card not found" });
        return;
      }
      const currentStatus = card.status;
      if (currentStatus === "settled") {
        res2.status(409).json({
          error: "Cannot unlock a finalized Draft Day competition",
          card_status: currentStatus
        });
        return;
      }
      const { count: settledCount } = await supabase.from("gameday_props").select("id", { count: "exact", head: true }).eq("card_id", card.id).eq("status", "settled");
      if ((settledCount ?? 0) > 0) {
        res2.status(409).json({
          error: "Cannot unlock after settlement has started",
          settled_props: settledCount
        });
        return;
      }
      if (currentStatus === "open" || currentStatus === "closed") {
        res2.json({ card_status: currentStatus, already_unlocked: true });
        return;
      }
      const { error } = await supabase.from("gameday_pick_cards").update({ status: "open", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", card.id);
      if (error) {
        console.error("[fantasy] draft-day unlock error:", error.message);
        res2.status(500).json({ error: "Failed to unlock Draft Day" });
        return;
      }
      console.log(
        `[fantasy] Draft Day unlocked: card=${String(card.id).slice(0, 8)}\u2026 by=${userId.slice(0, 8)}\u2026`
      );
      res2.json({ card_status: "open", already_unlocked: false });
    }
  );
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/play",
    async (req, res2) => {
      const supabase = getServiceSupabase();
      const { leagueId, seasonId } = req.params;
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId);
      if (!viewer) {
        res2.status(403).json({ error: "You are not a member of this league for this season." });
        return;
      }
      const { data: room } = await supabase.from("gameday_rooms").select("id, status, room_code").eq("league_season_id", seasonId).eq("experience_type", "fantasy").eq("competition_type", "draft_day").maybeSingle();
      if (!room) {
        res2.status(404).json({ error: "No Draft Day competition found for this season." });
        return;
      }
      const roomId = room.id;
      let card = null;
      let migration002Applied = false;
      {
        const { data: d1, error: e1 } = await supabase.from("gameday_pick_cards").select("id, status, roster_revision").eq("room_id", roomId).eq("phase", "draft_day").maybeSingle();
        if (!e1) {
          card = d1;
          migration002Applied = true;
        } else {
          const { data: d2 } = await supabase.from("gameday_pick_cards").select("id, status").eq("room_id", roomId).eq("phase", "draft_day").maybeSingle();
          card = d2;
        }
      }
      if (!card) {
        res2.status(404).json({ error: "Draft Day card not found." });
        return;
      }
      const cardStatus = card.status;
      const cardRosterRevision = card.roster_revision ?? 0;
      if (!viewer.draft_day_eligible) {
        res2.status(403).json({
          error: "You are not eligible for this Draft Day competition.",
          draft_day_eligible: false
        });
        return;
      }
      const { participant_id: participantId } = await ensureFantasyParticipant(
        supabase,
        roomId,
        viewer
      );
      const { data: rawProps } = await supabase.from("gameday_props").select("id, question, scoring_scope, point_value, answer_options, answer_target_type, display_order").eq("card_id", card.id).order("display_order", { ascending: true });
      const publishedProps = (rawProps ?? []).map((p) => ({
        id: p.id,
        question: p.question,
        scoring_scope: p.scoring_scope,
        point_value: p.point_value,
        answer_target_type: p.answer_target_type,
        // answer_options is the authoritative published snapshot; correct_answer excluded
        answer_options: Array.isArray(p.answer_options) ? p.answer_options : [],
        display_order: p.display_order
      }));
      const propIds = publishedProps.map((p) => p.id);
      const totalProps = publishedProps.length;
      const rosterTargetPropIds = new Set(
        publishedProps.filter((p) => p.answer_target_type === "season_member" || p.answer_target_type === "fantasy_team").map((p) => p.id)
      );
      let rawPicks = [];
      if (propIds.length > 0) {
        const { data: rp1, error: rpErr } = await supabase.from("gameday_picks").select("prop_id, selected_answer, answer_universe_revision").in("prop_id", propIds).eq("participant_id", participantId);
        if (!rpErr) {
          rawPicks = rp1 ?? [];
        } else {
          const { data: rp2 } = await supabase.from("gameday_picks").select("prop_id, selected_answer").in("prop_id", propIds).eq("participant_id", participantId);
          rawPicks = rp2 ?? [];
        }
      }
      const myPicks = {};
      const stalePropIds = [];
      for (const pick of rawPicks ?? []) {
        const propId = pick.prop_id;
        const pickRev = pick.answer_universe_revision ?? 0;
        myPicks[propId] = pick.selected_answer;
        if (rosterTargetPropIds.has(propId) && pickRev < cardRosterRevision) {
          stalePropIds.push(propId);
        }
      }
      const myPickCount = Object.keys(myPicks).length;
      let globalPickCount = 0;
      if (propIds.length > 0) {
        try {
          const { count } = await supabase.from("gameday_picks").select("id", { count: "exact", head: true }).in("prop_id", propIds);
          globalPickCount = count ?? 0;
        } catch {
          globalPickCount = 0;
        }
      }
      const { data: seasonRow } = await supabase.from("fantasy_league_seasons").select("fantasy_leagues(league_name)").eq("id", seasonId).maybeSingle();
      const leagueName = seasonRow?.fantasy_leagues?.league_name ?? null;
      res2.json({
        room_id: roomId,
        card_id: card.id,
        room_code: room.room_code ?? null,
        card_status: cardStatus,
        roster_revision: cardRosterRevision,
        stale_pick_prop_ids: stalePropIds,
        participant_id: participantId,
        props: publishedProps,
        my_picks: myPicks,
        my_pick_count: myPickCount,
        total_props: totalProps,
        pick_count: globalPickCount,
        league_name: leagueName
      });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/picks",
    async (req, res2) => {
      const supabase = getServiceSupabase();
      const { leagueId, seasonId } = req.params;
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { prop_id, selected_answer } = req.body ?? {};
      if (!prop_id || typeof prop_id !== "string") {
        res2.status(400).json({ error: "prop_id is required" });
        return;
      }
      if (!selected_answer || typeof selected_answer !== "string") {
        res2.status(400).json({ error: "selected_answer is required" });
        return;
      }
      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId);
      if (!viewer) {
        res2.status(403).json({ error: "You are not a member of this league for this season." });
        return;
      }
      if (!viewer.draft_day_eligible) {
        res2.status(403).json({
          error: "You are not eligible for this Draft Day competition.",
          draft_day_eligible: false
        });
        return;
      }
      const { data: room } = await supabase.from("gameday_rooms").select("id, status").eq("league_season_id", seasonId).eq("experience_type", "fantasy").eq("competition_type", "draft_day").maybeSingle();
      if (!room) {
        res2.status(404).json({ error: "No Draft Day competition found." });
        return;
      }
      const roomId = room.id;
      let card = null;
      let migration002Applied = false;
      {
        const { data: d1, error: e1 } = await supabase.from("gameday_pick_cards").select("id, status, roster_revision").eq("room_id", roomId).eq("phase", "draft_day").maybeSingle();
        if (!e1) {
          card = d1;
          migration002Applied = true;
        } else {
          const { data: d2 } = await supabase.from("gameday_pick_cards").select("id, status").eq("room_id", roomId).eq("phase", "draft_day").maybeSingle();
          card = d2;
        }
      }
      if (!card) {
        res2.status(404).json({ error: "Draft Day card not found." });
        return;
      }
      const cardStatus = card.status;
      const cardRosterRevision = card.roster_revision ?? 0;
      if (cardStatus !== "open") {
        res2.status(409).json({
          error: "Picks are locked. No more changes accepted.",
          card_status: cardStatus
        });
        return;
      }
      const { data: prop } = await supabase.from("gameday_props").select("id, answer_options").eq("id", prop_id).eq("card_id", card.id).maybeSingle();
      if (!prop) {
        res2.status(400).json({ error: "Prop not found on this Draft Day card." });
        return;
      }
      const answerOptions = Array.isArray(prop.answer_options) ? prop.answer_options : [];
      const validAnswerIds = new Set(answerOptions.map((o) => o.id));
      if (!validAnswerIds.has(selected_answer)) {
        res2.status(400).json({
          error: "Invalid answer. selected_answer must match a published answer option ID.",
          valid_answer_ids: Array.from(validAnswerIds)
        });
        return;
      }
      const { participant_id: participantId } = await ensureFantasyParticipant(
        supabase,
        roomId,
        viewer
      );
      const pickPayload = {
        prop_id,
        participant_id: participantId,
        selected_answer,
        submitted_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (migration002Applied) {
        pickPayload.answer_universe_revision = cardRosterRevision;
      }
      const { data: upserted, error: upsertErr } = await supabase.from("gameday_picks").upsert(pickPayload, { onConflict: "prop_id,participant_id" }).select("id, prop_id, selected_answer").single();
      if (upsertErr) {
        console.error("[fantasy] pick upsert error:", upsertErr.message);
        res2.status(500).json({ error: "Failed to save pick. Please try again." });
        return;
      }
      res2.json({
        pick_id: upserted.id,
        prop_id: upserted.prop_id,
        selected_answer: upserted.selected_answer
      });
    }
  );
  async function _getDdRoomAndCard(supabase, seasonId) {
    const { data: room } = await supabase.from("gameday_rooms").select("id, status").eq("league_season_id", seasonId).eq("competition_type", "draft_day").eq("experience_type", "fantasy").is("archived_at", null).maybeSingle();
    if (!room) return { ok: false, status: 404, body: { error: "No published Draft Day found for this season" } };
    const { data: card } = await supabase.from("gameday_pick_cards").select("id, status").eq("room_id", room.id).order("created_at", { ascending: true }).maybeSingle();
    if (!card) return { ok: false, status: 404, body: { error: "Draft Day pick card not found" } };
    return { ok: true, room, card };
  }
  async function _buildLeaderboard(supabase, roomId, competitionProps) {
    const competitionPropIds = competitionProps.map((p) => p.id);
    const pointValueMap = {};
    for (const p of competitionProps) pointValueMap[p.id] = p.point_value ?? 0;
    const { data: participants } = await supabase.from("gameday_participants").select("id, display_name, season_member_id").eq("room_id", roomId);
    const participantList = participants ?? [];
    let allPicks = [];
    if (participantList.length > 0 && competitionPropIds.length > 0) {
      const { data: picks } = await supabase.from("gameday_picks").select("participant_id, prop_id, is_correct").in("prop_id", competitionPropIds).in("participant_id", participantList.map((p) => p.id));
      allPicks = picks ?? [];
    }
    const seasonMemberIds = participantList.map((p) => p.season_member_id).filter(Boolean);
    const teamMap = {};
    if (seasonMemberIds.length > 0) {
      const { data: managers } = await supabase.from("fantasy_team_managers").select("season_member_id, fantasy_teams(team_name)").in("season_member_id", seasonMemberIds);
      for (const m of managers ?? []) {
        if (m.fantasy_teams?.team_name) {
          teamMap[m.season_member_id] = m.fantasy_teams.team_name;
        }
      }
    }
    const scores = participantList.map((p) => {
      const correctPicks = allPicks.filter(
        (pk) => pk.participant_id === p.id && pk.is_correct === true
      );
      const points = correctPicks.reduce(
        (sum, pk) => sum + (pointValueMap[pk.prop_id] ?? 0),
        0
      );
      return {
        participant_id: p.id,
        season_member_id: p.season_member_id,
        display_name: p.display_name,
        team_name: p.season_member_id ? teamMap[p.season_member_id] ?? null : null,
        points,
        correct_count: correctPicks.length
      };
    });
    scores.sort((a, b) => b.points - a.points || b.correct_count - a.correct_count);
    return scores.map((s) => {
      const rank = scores.filter((x) => x.points > s.points).length + 1;
      const tieCount = scores.filter((x) => x.points === s.points).length;
      return { ...s, rank, rank_label: tieCount > 1 ? `T-${rank}` : String(rank) };
    });
  }
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/settlement",
    async (req, res2) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const rc = await _getDdRoomAndCard(supabase, seasonId);
      if (!rc.ok) {
        res2.status(rc.status).json(rc.body);
        return;
      }
      const { room, card } = rc;
      const { data: allProps } = await supabase.from("gameday_props").select("id, question, answer_options, scoring_scope, point_value, display_order, status, correct_answer").eq("card_id", card.id).order("display_order", { ascending: true });
      const propList = allProps ?? [];
      const competitionProps = propList.filter((p) => p.scoring_scope === "competition");
      const totalCompCount = competitionProps.length;
      const settledCount = competitionProps.filter((p) => p.status === "settled").length;
      const previewLeaderboard = settledCount > 0 ? await _buildLeaderboard(supabase, room.id, competitionProps) : [];
      res2.json({
        room_id: room.id,
        card_id: card.id,
        card_status: card.status,
        room_status: room.status,
        competition_props: competitionProps.map((p) => ({
          id: p.id,
          question: p.question,
          display_order: p.display_order,
          point_value: p.point_value,
          scoring_scope: p.scoring_scope,
          status: p.status,
          correct_answer: p.correct_answer ?? null,
          answer_options: Array.isArray(p.answer_options) ? p.answer_options : []
        })),
        settled_count: settledCount,
        total_competition_count: totalCompCount,
        all_settled: totalCompCount > 0 && settledCount === totalCompCount,
        preview_leaderboard: previewLeaderboard
      });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/settle",
    async (req, res2) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const { prop_id, correct_answer } = req.body;
      if (!prop_id) {
        res2.status(400).json({ error: "prop_id is required" });
        return;
      }
      if (!correct_answer) {
        res2.status(400).json({ error: "correct_answer is required" });
        return;
      }
      const rc = await _getDdRoomAndCard(supabase, seasonId);
      if (!rc.ok) {
        res2.status(rc.status).json(rc.body);
        return;
      }
      const { room, card } = rc;
      if (card.status !== "locked") {
        res2.status(409).json({
          error: "Draft Day picks must be locked before settling results",
          card_status: card.status
        });
        return;
      }
      const { data: prop } = await supabase.from("gameday_props").select("id, card_id, scoring_scope, status, correct_answer, answer_options, question").eq("id", prop_id).eq("card_id", card.id).maybeSingle();
      if (!prop) {
        res2.status(404).json({ error: "Prop not found on this Draft Day card" });
        return;
      }
      if (prop.scoring_scope === "competition" && room.status === "finalized") {
        res2.status(409).json({
          error: "Draft Day competition results are finalized and cannot be changed.",
          room_status: "finalized"
        });
        return;
      }
      const opts = Array.isArray(prop.answer_options) ? prop.answer_options : [];
      const validIds = new Set(opts.map((o) => o.id));
      if (!validIds.has(correct_answer)) {
        res2.status(400).json({
          error: "correct_answer must be a valid published answer option ID",
          valid_answer_ids: Array.from(validIds)
        });
        return;
      }
      const wasAlreadySettled = prop.status === "settled";
      if (wasAlreadySettled && prop.correct_answer === correct_answer) {
        res2.json({ ok: true, idempotent: true, was_correction: false, prop_id, correct_answer });
        return;
      }
      const result = await settlePropCore(supabase, {
        propId: prop_id,
        cardId: card.id,
        correctAnswer: correct_answer
      });
      if (result.cardAutoSettled && room.status === "finalized") {
        await supabase.from("gameday_pick_cards").update({ status: "locked", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", card.id);
        console.log(
          `[fantasy] settle \u2014 card auto-settle suppressed (room finalized), card_status reset to locked`
        );
      }
      console.log(
        `[fantasy] settle prop=${prop_id.slice(0, 8)}\u2026 scope=${prop.scoring_scope} answer=${correct_answer} by=${commissioner.userId.slice(0, 8)}\u2026 card_auto_settled=${result.cardAutoSettled}`
      );
      res2.json({
        ok: true,
        idempotent: false,
        was_correction: wasAlreadySettled,
        // true = changed existing result (mirrors Game Day re-settle)
        prop_id,
        correct_answer,
        scoring_scope: prop.scoring_scope,
        card_auto_settled: result.cardAutoSettled
      });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/finalize",
    async (req, res2) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const rc = await _getDdRoomAndCard(supabase, seasonId);
      if (!rc.ok) {
        res2.status(rc.status).json(rc.body);
        return;
      }
      const { room, card } = rc;
      if (room.status === "finalized") {
        res2.json({ ok: true, already_finalized: true });
        return;
      }
      if (card.status !== "locked") {
        res2.status(409).json({
          error: "Draft Day picks must be locked before finalizing",
          card_status: card.status
        });
        return;
      }
      const { data: unsettled } = await supabase.from("gameday_props").select("id").eq("card_id", card.id).eq("scoring_scope", "competition").neq("status", "settled");
      if ((unsettled?.length ?? 0) > 0) {
        res2.status(409).json({
          error: "All Draft Day competition questions must be resolved before finalizing",
          unsettled_competition_count: unsettled?.length ?? 0
        });
        return;
      }
      const { error: finalizeErr } = await supabase.from("gameday_rooms").update({ status: "finalized" }).eq("id", room.id);
      if (finalizeErr) {
        console.error("[fantasy] finalize error:", finalizeErr.message);
        res2.status(500).json({ error: "Failed to finalize Draft Day" });
        return;
      }
      console.log(
        `[fantasy] Draft Day finalized: room=${String(room.id).slice(0, 8)}\u2026 by=${commissioner.userId.slice(0, 8)}\u2026`
      );
      res2.json({ ok: true, already_finalized: false });
    }
  );
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/results",
    async (req, res2) => {
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const rc = await _getDdRoomAndCard(supabase, seasonId);
      if (!rc.ok) {
        res2.status(rc.status).json(rc.body);
        return;
      }
      const { room, card } = rc;
      if (room.status !== "finalized") {
        res2.json({ finalized: false });
        return;
      }
      const { data: season } = await supabase.from("fantasy_league_seasons").select("season_year, fantasy_leagues(league_name)").eq("id", seasonId).maybeSingle();
      const { data: allProps } = await supabase.from("gameday_props").select("id, question, scoring_scope, point_value, display_order, status, correct_answer, answer_options").eq("card_id", card.id).order("display_order", { ascending: true });
      const propList = allProps ?? [];
      const competitionProps = propList.filter((p) => p.scoring_scope === "competition");
      const seasonProps = propList.filter((p) => p.scoring_scope === "season");
      const answerLabelMap = {};
      for (const p of propList) {
        answerLabelMap[p.id] = {};
        for (const opt of Array.isArray(p.answer_options) ? p.answer_options : []) {
          if (opt?.id && opt?.label) answerLabelMap[p.id][opt.id] = opt.label;
        }
      }
      const leaderboard = await _buildLeaderboard(supabase, room.id, competitionProps);
      const topPoints = leaderboard[0]?.points ?? 0;
      const winners = leaderboard.filter((e) => e.points === topPoints);
      let myCompPicks = [];
      let myTotalPoints = 0;
      let myCorrectCount = 0;
      let mySeasonPickCount = 0;
      try {
        const viewerData = await resolveViewer(supabase, identity, seasonId, leagueId);
        if (viewerData) {
          const { data: vParticipant } = await supabase.from("gameday_participants").select("id").eq("room_id", room.id).eq("season_member_id", viewerData.season_member_id).maybeSingle();
          if (vParticipant) {
            const vId = vParticipant.id;
            const compPropIds = competitionProps.map((p) => p.id);
            const pointValueMap = {};
            for (const p of competitionProps) pointValueMap[p.id] = p.point_value ?? 0;
            if (compPropIds.length > 0) {
              const { data: picks } = await supabase.from("gameday_picks").select("prop_id, selected_answer, is_correct").eq("participant_id", vId).in("prop_id", compPropIds);
              const pickByProp = {};
              for (const pk of picks ?? []) pickByProp[pk.prop_id] = pk;
              myCompPicks = competitionProps.map((prop) => {
                const pick = pickByProp[prop.id] ?? null;
                const myAnswerId = pick?.selected_answer ?? null;
                const correctId = prop.correct_answer ?? null;
                const isCorrect = pick?.is_correct ?? null;
                const pointsEarned = isCorrect === true ? pointValueMap[prop.id] ?? 0 : 0;
                if (isCorrect === true) {
                  myTotalPoints += pointsEarned;
                  myCorrectCount++;
                }
                return {
                  prop_id: prop.id,
                  question: prop.question,
                  display_order: prop.display_order,
                  point_value: prop.point_value,
                  my_answer_id: myAnswerId,
                  my_answer_label: myAnswerId ? answerLabelMap[prop.id]?.[myAnswerId] ?? myAnswerId : null,
                  correct_answer_id: correctId,
                  correct_answer_label: correctId ? answerLabelMap[prop.id]?.[correctId] ?? correctId : null,
                  is_correct: isCorrect,
                  points_earned: pointsEarned
                };
              });
            }
            const seasonPropIds = seasonProps.map((p) => p.id);
            if (seasonPropIds.length > 0) {
              const { count } = await supabase.from("gameday_picks").select("id", { count: "exact", head: true }).eq("participant_id", vId).in("prop_id", seasonPropIds);
              mySeasonPickCount = count ?? 0;
            }
          }
        }
      } catch (e) {
        console.warn("[fantasy] results viewer lookup:", e.message);
      }
      res2.json({
        finalized: true,
        league_name: season?.fantasy_leagues?.league_name ?? null,
        season_year: season?.season_year ?? null,
        winners: winners.map((w) => ({
          display_name: w.display_name,
          team_name: w.team_name,
          points: w.points,
          rank_label: w.rank_label
        })),
        leaderboard,
        my_competition_picks: myCompPicks,
        my_total_points: myTotalPoints,
        my_correct_count: myCorrectCount,
        my_season_pick_count: mySeasonPickCount,
        season_props_pending_count: seasonProps.filter((p) => p.status === "pending").length,
        total_competition_props: competitionProps.length
      });
    }
  );
  async function _getWeeklyRoomAndCard(supabase, seasonId, weekNumber) {
    const { data: room } = await supabase.from("gameday_rooms").select("id, status, week_number, room_code, reward_description, reward_amount_display, created_at").eq("league_season_id", seasonId).eq("competition_type", "weekly").eq("week_number", weekNumber).eq("experience_type", "fantasy").is("archived_at", null).maybeSingle();
    if (!room)
      return { ok: false, status: 404, body: { error: `No published Week ${weekNumber} competition found for this season` } };
    const { data: card } = await supabase.from("gameday_pick_cards").select("id, status, roster_revision").eq("room_id", room.id).order("created_at", { ascending: true }).maybeSingle();
    if (!card)
      return { ok: false, status: 404, body: { error: `Week ${weekNumber} pick card not found` } };
    return { ok: true, room, card };
  }
  async function _buildLeaguePicks(supabase, roomId, cardId, cardStatus, viewerSeasonMemberId, scopeFilter) {
    const { data: rawParticipants } = await supabase.from("gameday_participants").select("id, display_name, team_name, season_member_id").eq("room_id", roomId);
    const participantList = rawParticipants ?? [];
    const eligibleCount = participantList.length;
    const participantMap = /* @__PURE__ */ new Map();
    let viewerParticipantId = null;
    for (const p of participantList) {
      participantMap.set(p.id, {
        display_name: p.display_name ?? "Unknown",
        team_name: p.team_name ?? null
      });
      if (viewerSeasonMemberId && p.season_member_id === viewerSeasonMemberId) {
        viewerParticipantId = p.id;
      }
    }
    let propQuery = supabase.from("gameday_props").select("id, question, answer_options, answer_target_type, correct_answer, display_order, scoring_scope, point_value").eq("card_id", cardId).order("display_order", { ascending: true });
    if (scopeFilter) propQuery = propQuery.eq("scoring_scope", scopeFilter);
    const { data: rawProps } = await propQuery;
    const propList = rawProps ?? [];
    if (propList.length === 0) {
      return { eligible_count: eligibleCount, viewer_participant_id: viewerParticipantId, props: [] };
    }
    const propIds = propList.map((p) => p.id);
    const { data: rawPicks } = await supabase.from("gameday_picks").select("prop_id, participant_id, selected_answer").in("prop_id", propIds);
    const pickList = rawPicks ?? [];
    const picksByProp = /* @__PURE__ */ new Map();
    for (const pick of pickList) {
      const propId = pick.prop_id;
      const answerId = pick.selected_answer;
      const participantId = pick.participant_id;
      if (!picksByProp.has(propId)) picksByProp.set(propId, /* @__PURE__ */ new Map());
      const byAnswer = picksByProp.get(propId);
      if (!byAnswer.has(answerId)) byAnswer.set(answerId, []);
      byAnswer.get(answerId).push(participantId);
    }
    const responseProps = propList.map((prop) => {
      const propId = prop.id;
      const correctId = prop.correct_answer ?? null;
      const isPropSettled = correctId !== null;
      const opts = Array.isArray(prop.answer_options) ? prop.answer_options : [];
      const picksByAnswer = picksByProp.get(propId) ?? /* @__PURE__ */ new Map();
      const validIds = new Set(opts.map((o) => o.id));
      let totalPicks = 0;
      for (const [aid, pickers] of picksByAnswer.entries()) {
        if (validIds.has(aid)) totalPicks += pickers.length;
      }
      const abstentions = eligibleCount - totalPicks;
      const answerRows = opts.map((opt, idx) => {
        const pickers = picksByAnswer.get(opt.id) ?? [];
        return { _idx: idx, answer_id: opt.id, label: opt.label, pickers };
      });
      answerRows.sort(
        (a, b) => b.pickers.length !== a.pickers.length ? b.pickers.length - a.pickers.length : a._idx - b._idx
      );
      const filtered = answerRows.filter((a) => {
        if (a.pickers.length > 0) return true;
        if (isPropSettled && a.answer_id === correctId) return true;
        return false;
      });
      const answers = filtered.map((a) => {
        const count = a.pickers.length;
        const percentage = totalPicks > 0 ? Math.round(count / totalPicks * 1e3) / 10 : 0;
        const isCorrect = correctId !== null ? a.answer_id === correctId : null;
        const viewerPicked = viewerParticipantId !== null && a.pickers.includes(viewerParticipantId);
        const pickerDetails = a.pickers.map((pid) => {
          const p = participantMap.get(pid);
          return {
            display_name: p?.display_name ?? "Unknown",
            team_name: p?.team_name ?? null
          };
        });
        return {
          answer_id: a.answer_id,
          label: a.label,
          count,
          percentage,
          is_correct: isCorrect,
          viewer_picked: viewerPicked,
          pickers: pickerDetails
        };
      });
      return {
        prop_id: propId,
        question: prop.question,
        answer_target_type: prop.answer_target_type,
        display_order: prop.display_order,
        scoring_scope: prop.scoring_scope,
        point_value: prop.point_value,
        total_picks: totalPicks,
        abstentions,
        correct_answer_id: correctId,
        answers
      };
    });
    return { eligible_count: eligibleCount, viewer_participant_id: viewerParticipantId, props: responseProps };
  }
  async function _buildSeasonStandings(supabase, seasonId) {
    const { data: rooms } = await supabase.from("gameday_rooms").select("id, competition_type, week_number, status").eq("league_season_id", seasonId).eq("experience_type", "fantasy").eq("status", "finalized").is("archived_at", null).order("created_at", { ascending: true });
    const roomList = rooms ?? [];
    if (!roomList.length) return { standings: [], finalized_competitions: [] };
    const roomIds = roomList.map((r) => r.id);
    const { data: cards } = await supabase.from("gameday_pick_cards").select("id, room_id").in("room_id", roomIds);
    const cardByRoom = {};
    const roomByCard = {};
    for (const c of cards ?? []) {
      cardByRoom[c.room_id] = c.id;
      roomByCard[c.id] = c.room_id;
    }
    const cardIds = Object.values(cardByRoom);
    let propList = [];
    if (cardIds.length > 0) {
      const { data: compPropsRaw } = await supabase.from("gameday_props").select("id, card_id, point_value").in("card_id", cardIds).eq("scoring_scope", "competition");
      propList = compPropsRaw ?? [];
    }
    const propMap = {};
    for (const p of propList)
      propMap[p.id] = { cardId: p.card_id, pointValue: p.point_value ?? 0 };
    const allPropIds = propList.map((p) => p.id);
    const { data: smRaw } = await supabase.from("fantasy_season_members").select("id, fantasy_league_members(display_name)").eq("league_season_id", seasonId).eq("is_active", true);
    const smList = smRaw ?? [];
    const smIds = smList.map((sm) => sm.id);
    const teamMap = {};
    if (smIds.length > 0) {
      const { data: mgrs } = await supabase.from("fantasy_team_managers").select("season_member_id, fantasy_teams(id, team_name)").in("season_member_id", smIds).eq("is_active", true);
      for (const m of mgrs ?? []) {
        const team = m.fantasy_teams;
        if (team) teamMap[m.season_member_id] = { id: team.id, name: team.team_name ?? null };
      }
    }
    const { data: partsRaw } = await supabase.from("gameday_participants").select("id, room_id, season_member_id").in("room_id", roomIds).not("season_member_id", "is", null);
    const partList = partsRaw ?? [];
    const partIds = partList.map((p) => p.id);
    const partByRoomAndSm = {};
    for (const p of partList)
      partByRoomAndSm[`${p.room_id}:${p.season_member_id}`] = p.id;
    let allPicks = [];
    if (partIds.length > 0 && allPropIds.length > 0) {
      const { data: picksRaw } = await supabase.from("gameday_picks").select("participant_id, prop_id, is_correct").in("prop_id", allPropIds).in("participant_id", partIds);
      allPicks = picksRaw ?? [];
    }
    const roomStats = {};
    for (const r of roomList) roomStats[r.id] = {};
    for (const pick of allPicks) {
      const propInfo = propMap[pick.prop_id];
      if (!propInfo) continue;
      const rId = roomByCard[propInfo.cardId];
      if (!rId || !roomStats[rId]) continue;
      const pId = pick.participant_id;
      if (!roomStats[rId][pId]) roomStats[rId][pId] = { points: 0, pickCount: 0 };
      roomStats[rId][pId].pickCount++;
      if (pick.is_correct === true) roomStats[rId][pId].points += propInfo.pointValue;
    }
    const weeklyMaxPts = {};
    for (const r of roomList) {
      if (r.competition_type !== "weekly") continue;
      let mx = 0;
      for (const ps of Object.values(roomStats[r.id])) {
        if (ps.pickCount > 0 && ps.points > mx) mx = ps.points;
      }
      weeklyMaxPts[r.id] = mx;
    }
    const smStatsMap = {};
    for (const sm of smList) {
      smStatsMap[sm.id] = {
        season_member_id: sm.id,
        display_name: sm.fantasy_league_members?.display_name ?? null,
        fantasy_team_id: teamMap[sm.id]?.id ?? null,
        team_name: teamMap[sm.id]?.name ?? null,
        total_points: 0,
        draft_day_points: 0,
        weekly_points: 0,
        competitions_played: 0,
        weekly_wins: 0
      };
    }
    for (const r of roomList) {
      const rid = r.id;
      const rStats = roomStats[rid];
      const ctype = r.competition_type;
      for (const sm of smList) {
        const smId = sm.id;
        const pId = partByRoomAndSm[`${rid}:${smId}`];
        if (!pId) continue;
        const ps = rStats[pId];
        if (!ps || ps.pickCount === 0) continue;
        const entry = smStatsMap[smId];
        if (!entry) continue;
        entry.total_points += ps.points;
        entry.competitions_played++;
        if (ctype === "draft_day") entry.draft_day_points += ps.points;
        else if (ctype === "weekly") entry.weekly_points += ps.points;
        if (ctype === "weekly") {
          const mx = weeklyMaxPts[rid] ?? 0;
          if (mx > 0 && ps.points === mx) entry.weekly_wins++;
        }
      }
    }
    const active = Object.values(smStatsMap).filter((s) => s.competitions_played > 0);
    active.sort((a, b) => b.total_points - a.total_points);
    const standings = active.map((s) => {
      const rank = active.filter((x) => x.total_points > s.total_points).length + 1;
      const tieCount = active.filter((x) => x.total_points === s.total_points).length;
      return { ...s, rank, rank_label: tieCount > 1 ? `T-${rank}` : String(rank) };
    });
    const finalized_competitions = roomList.map((r) => ({
      room_id: r.id,
      competition_type: r.competition_type,
      week_number: r.week_number ?? null,
      label: r.competition_type === "draft_day" ? "Draft Day" : r.competition_type === "weekly" ? `Week ${r.week_number}` : r.competition_type
    }));
    return { standings, finalized_competitions };
  }
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/templates",
    async (req, res2) => {
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) {
        res2.status(400).json({ error: "weekNumber must be a positive integer" });
        return;
      }
      const supabase = getServiceSupabase();
      const { data: season } = await supabase.from("fantasy_league_seasons").select("fantasy_leagues(sport), default_reward_description, default_reward_amount_display").eq("id", seasonId).eq("league_id", leagueId).maybeSingle();
      if (!season) {
        res2.status(404).json({ error: "Season not found" });
        return;
      }
      const sport = season.fantasy_leagues?.sport ?? "football";
      const { data: templates, error: tmplErr } = await supabase.from("gameday_prop_library").select("id, question, point_value, answer_target_type, settlement_window, is_default, display_order, supports_no_one").eq("experience_type", "fantasy").eq("competition_type", "weekly").eq("sport", sport).eq("is_active", true).order("display_order", { ascending: true });
      if (tmplErr) {
        console.error("[fantasy/weekly] templates error:", tmplErr.message);
        res2.status(500).json({ error: "Failed to fetch weekly templates" });
        return;
      }
      res2.json({
        sport,
        week_number: wn,
        default_reward_description: season.default_reward_description ?? null,
        default_reward_amount_display: season.default_reward_amount_display ?? null,
        // Weekly props are all competition-scope
        templates: (templates ?? []).map((t) => ({ ...t, scoring_scope: "competition" }))
      });
    }
  );
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/last-week-templates",
    async (req, res2) => {
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 2) {
        res2.json({ template_ids: [], inactive_template_ids: [] });
        return;
      }
      const supabase = getServiceSupabase();
      const { data: season } = await supabase.from("fantasy_league_seasons").select("id, fantasy_leagues(sport)").eq("id", seasonId).eq("league_id", leagueId).maybeSingle();
      if (!season) {
        res2.status(404).json({ error: "Season not found" });
        return;
      }
      const sport = season.fantasy_leagues?.sport ?? "football";
      const { data: lastRoom } = await supabase.from("gameday_rooms").select("id").eq("league_season_id", seasonId).eq("competition_type", "weekly").eq("week_number", wn - 1).maybeSingle();
      if (!lastRoom) {
        res2.json({ template_ids: [], inactive_template_ids: [] });
        return;
      }
      const { data: card } = await supabase.from("gameday_pick_cards").select("id").eq("room_id", lastRoom.id).maybeSingle();
      if (!card) {
        res2.json({ template_ids: [], inactive_template_ids: [] });
        return;
      }
      const { data: props, error: propsErr } = await supabase.from("gameday_props").select("template_prop_id, display_order").eq("card_id", card.id).not("template_prop_id", "is", null).order("display_order", { ascending: true });
      if (propsErr) {
        console.error("[fantasy/last-week-templates] props error:", propsErr.message);
        res2.status(500).json({ error: "Failed to fetch last week templates" });
        return;
      }
      if (!props || props.length === 0) {
        res2.json({ template_ids: [], inactive_template_ids: [] });
        return;
      }
      const allTemplateIds = props.map((p) => p.template_prop_id).filter(Boolean);
      const { data: activeLibrary } = await supabase.from("gameday_prop_library").select("id").in("id", allTemplateIds).eq("experience_type", "fantasy").eq("competition_type", "weekly").eq("sport", sport).eq("is_active", true);
      const activeIds = new Set((activeLibrary ?? []).map((t) => t.id));
      const inactiveTemplateIds = allTemplateIds.filter((id) => !activeIds.has(id));
      res2.json({
        template_ids: allTemplateIds,
        // all last-week template IDs, display order
        inactive_template_ids: inactiveTemplateIds
        // subset no longer active/recommended
      });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/publish",
    async (req, res2) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) {
        res2.status(400).json({ error: "weekNumber must be a positive integer" });
        return;
      }
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      if (!await requireLeagueActive(supabase, leagueId, res2)) return;
      if (wn > 1) {
        const { data: existingThisWeekRoom } = await supabase.from("gameday_rooms").select("id").eq("league_season_id", seasonId).eq("competition_type", "weekly").eq("week_number", wn).is("archived_at", null).maybeSingle();
        if (!existingThisWeekRoom) {
          const { data: latestRoom } = await supabase.from("gameday_rooms").select("week_number, status").eq("league_season_id", seasonId).eq("competition_type", "weekly").is("archived_at", null).order("week_number", { ascending: false }).limit(1).maybeSingle();
          const maxExisting = latestRoom?.week_number ?? 0;
          const latestStatus = latestRoom?.status ?? null;
          if (wn > maxExisting + 1) {
            res2.status(409).json({ error: `Week ${wn - 1} must be created first.` });
            return;
          }
          if (maxExisting < wn - 1) {
            res2.status(409).json({ error: `Week ${wn - 1} must be created first.` });
            return;
          }
          if (latestStatus !== "finalized") {
            res2.status(409).json({ error: `Finalize Week ${maxExisting} before creating Week ${wn}.` });
            return;
          }
        }
      }
      const publishBody = req.body;
      const { selected_prop_ids } = publishBody;
      const hasRewardKeys = "reward_description" in publishBody || "reward_amount_display" in publishBody;
      const effectiveRewardDesc = hasRewardKeys ? publishBody.reward_description?.trim() || null : void 0;
      const effectiveRewardAmount = hasRewardKeys ? publishBody.reward_amount_display?.trim() || null : void 0;
      if (!Array.isArray(selected_prop_ids) || selected_prop_ids.length === 0) {
        res2.status(400).json({ error: "Select at least one question" });
        return;
      }
      const MAX_WEEKLY_QUESTIONS = 8;
      if (selected_prop_ids.length > MAX_WEEKLY_QUESTIONS) {
        res2.status(400).json({
          error: `Too many questions. Maximum is ${MAX_WEEKLY_QUESTIONS}.`,
          max: MAX_WEEKLY_QUESTIONS,
          selected: selected_prop_ids.length
        });
        return;
      }
      const { data: season } = await supabase.from("fantasy_league_seasons").select("id, season_year, fantasy_leagues(id, league_name, sport)").eq("id", seasonId).eq("league_id", leagueId).maybeSingle();
      if (!season) {
        res2.status(404).json({ error: "Season not found" });
        return;
      }
      const league = season.fantasy_leagues;
      const sport = league.sport;
      const leagueName = league.league_name;
      const roomName = `${leagueName} \u2014 Week ${wn} Swayger`;
      const { data: templates, error: tmplErr } = await supabase.from("gameday_prop_library").select("id, question, point_value, answer_target_type, answer_options, supports_no_one").in("id", selected_prop_ids).eq("experience_type", "fantasy").eq("competition_type", "weekly").eq("sport", sport).eq("is_active", true);
      if (tmplErr || !templates?.length) {
        res2.status(400).json({ error: "No valid weekly templates found for selection" });
        return;
      }
      const [{ data: smRaw }, { data: teamsRaw }] = await Promise.all([
        supabase.from("fantasy_season_members").select("id, fantasy_league_members(display_name)").eq("league_season_id", seasonId).eq("is_active", true).order("created_at", { ascending: true }),
        supabase.from("fantasy_teams").select("id, team_name").eq("league_season_id", seasonId)
      ]);
      const memberList = (smRaw ?? []).map((sm) => ({
        id: sm.id,
        display_name: sm.fantasy_league_members?.display_name ?? null
      }));
      const teamList = teamsRaw ?? [];
      const propsPayload = templates.map((tmpl, i) => ({
        library_id: tmpl.id,
        question: tmpl.question,
        answer_options: buildAnswerOptions(
          tmpl.answer_target_type,
          memberList,
          teamList,
          tmpl.answer_options,
          tmpl.supports_no_one ?? false
        ),
        scoring_scope: "competition",
        // weekly always competition-scope
        point_value: tmpl.point_value,
        answer_target_type: tmpl.answer_target_type ?? null,
        display_order: i
      }));
      let roomCode = null;
      try {
        roomCode = await generateFantasyRoomCode(supabase);
      } catch {
      }
      const { data: existingRoom } = await supabase.from("gameday_rooms").select("id").eq("league_season_id", seasonId).eq("competition_type", "weekly").eq("week_number", wn).eq("experience_type", "fantasy").is("archived_at", null).maybeSingle();
      if (existingRoom) {
        const { data: existingCard } = await supabase.from("gameday_pick_cards").select("id").eq("room_id", existingRoom.id).maybeSingle();
        if (hasRewardKeys) {
          await supabase.from("gameday_rooms").update({ reward_description: effectiveRewardDesc, reward_amount_display: effectiveRewardAmount }).eq("id", existingRoom.id);
        }
        console.log(`[fantasy/weekly] Week ${wn} already exists (idempotent)`);
        res2.status(200).json({
          room_id: existingRoom.id,
          card_id: existingCard?.id ?? null,
          room_code: null,
          already_existed: true,
          week_number: wn
        });
        return;
      }
      const { data: rpcResult, error: rpcError } = await supabase.rpc("publish_fantasy_weekly", {
        p_league_season_id: seasonId,
        p_week_number: wn,
        p_room_name: roomName,
        p_sport: sport,
        p_room_code: roomCode,
        p_host_user_id: commissioner.userId,
        p_props: propsPayload
      });
      if (rpcError || !rpcResult) {
        console.error(`[fantasy/weekly] publish_fantasy_weekly RPC error:`, rpcError?.message);
        if (rpcError?.message?.includes("unique") || rpcError?.message?.includes("idx_gameday_rooms_weekly")) {
          res2.status(409).json({ error: `Week ${wn} already exists for this season`, already_existed: true });
          return;
        }
        res2.status(500).json({ error: `Failed to publish Week ${wn} competition` });
        return;
      }
      console.log(
        `[fantasy/weekly] Week ${wn} published: season=${seasonId.slice(0, 8)}\u2026 room=${String(rpcResult.room_id).slice(0, 8)}\u2026 props=${propsPayload.length}`
      );
      if (hasRewardKeys) {
        await supabase.from("gameday_rooms").update({ reward_description: effectiveRewardDesc, reward_amount_display: effectiveRewardAmount }).eq("id", rpcResult.room_id);
      }
      res2.status(201).json({
        room_id: rpcResult.room_id,
        card_id: rpcResult.card_id,
        room_code: roomCode,
        already_existed: rpcResult.already_existed ?? false,
        week_number: wn
      });
    }
  );
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weekly-summary",
    async (req, res2) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { data: rooms } = await supabase.from("gameday_rooms").select("id, status, week_number, room_code, reward_description, reward_amount_display, created_at").eq("league_season_id", seasonId).eq("competition_type", "weekly").is("archived_at", null).order("week_number", { ascending: true });
      const roomList = rooms ?? [];
      if (roomList.length === 0) {
        res2.json({
          current_week: null,
          past_weeks: [],
          next_week_number: 1,
          can_create_next: true
        });
        return;
      }
      const roomIds = roomList.map((r) => r.id);
      const { data: cards } = await supabase.from("gameday_pick_cards").select("id, status, room_id").in("room_id", roomIds);
      const cardByRoom = {};
      for (const c of cards ?? []) cardByRoom[c.room_id] = c;
      const cardIds = Object.values(cardByRoom).map((c) => c.id);
      const propCountsByCard = {};
      if (cardIds.length > 0) {
        const { data: props } = await supabase.from("gameday_props").select("id, card_id, status, scoring_scope").in("card_id", cardIds);
        for (const p of props ?? []) {
          if (!propCountsByCard[p.card_id]) propCountsByCard[p.card_id] = { total: 0, settled: 0, ids: [] };
          propCountsByCard[p.card_id].total++;
          propCountsByCard[p.card_id].ids.push(p.id);
          if (p.status === "settled") propCountsByCard[p.card_id].settled++;
        }
      }
      const allPropIds = Object.values(propCountsByCard).flatMap((c) => c.ids);
      const pickCountByProp = {};
      if (allPropIds.length > 0) {
        const { data: allPicks } = await supabase.from("gameday_picks").select("prop_id").in("prop_id", allPropIds);
        for (const pk of allPicks ?? []) {
          pickCountByProp[pk.prop_id] = (pickCountByProp[pk.prop_id] ?? 0) + 1;
        }
      }
      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId).catch(() => null);
      const isCommissioner = viewer && (viewer.role === "commissioner" || viewer.role === "co_commissioner");
      const { data: smRows } = await supabase.from("fantasy_season_members").select("id, fantasy_league_members(display_name)").eq("league_season_id", seasonId).eq("is_active", true);
      const smList = smRows ?? [];
      const eligibleCount = smList.length;
      const latestRoom = roomList[roomList.length - 1];
      const latestCard = cardByRoom[latestRoom.id];
      const latestProps = latestCard ? propCountsByCard[latestCard.id] ?? { total: 0, settled: 0, ids: [] } : { total: 0, settled: 0, ids: [] };
      const latestPropIds = latestProps.ids;
      const playedSmIds = /* @__PURE__ */ new Set();
      let myPickCount = 0;
      if (latestPropIds.length > 0) {
        const { data: latestParts } = await supabase.from("gameday_participants").select("id, season_member_id").eq("room_id", latestRoom.id);
        const latestPartList = latestParts ?? [];
        if (latestPartList.length > 0) {
          const partIds = latestPartList.map((p) => p.id);
          const { data: latestPicks } = await supabase.from("gameday_picks").select("participant_id").in("participant_id", partIds).in("prop_id", latestPropIds);
          const playedPartIds = new Set((latestPicks ?? []).map((p) => p.participant_id));
          for (const part of latestPartList) {
            if (playedPartIds.has(part.id)) playedSmIds.add(part.season_member_id);
          }
        }
        if (viewer) {
          const { data: vPart } = await supabase.from("gameday_participants").select("id").eq("room_id", latestRoom.id).eq("season_member_id", viewer.season_member_id).maybeSingle();
          if (vPart) {
            const { count } = await supabase.from("gameday_picks").select("id", { count: "exact", head: true }).in("prop_id", latestPropIds).eq("participant_id", vPart.id);
            myPickCount = count ?? 0;
          }
        }
      }
      const latestPickCount = latestPropIds.reduce((sum, id) => sum + (pickCountByProp[id] ?? 0), 0);
      const buildItem = (room, isCurrent) => {
        const card = cardByRoom[room.id];
        const cardStatus = card?.status ?? "closed";
        const pc = card ? propCountsByCard[card.id] ?? { total: 0, settled: 0, ids: [] } : { total: 0, settled: 0, ids: [] };
        const allSettled = pc.total > 0 && pc.settled === pc.total;
        const item = {
          room_id: room.id,
          card_id: card?.id ?? null,
          room_code: room.room_code ?? null,
          room_status: room.status,
          card_status: cardStatus,
          week_number: room.week_number,
          prop_count: pc.total,
          settled_count: pc.settled,
          all_settled: allSettled,
          pick_count: pc.ids.reduce((s, id) => s + (pickCountByProp[id] ?? 0), 0),
          reward_description: room.reward_description ?? null,
          reward_amount_display: room.reward_amount_display ?? null,
          created_at: room.created_at
        };
        if (isCurrent) {
          item.my_pick_count = myPickCount;
          item.eligible_count = eligibleCount;
          item.played_count = playedSmIds.size;
          item.waiting_count = eligibleCount - playedSmIds.size;
          if (isCommissioner) {
            item.participants_status = smList.map((sm) => ({
              season_member_id: sm.id,
              display_name: sm.fantasy_league_members?.display_name ?? null,
              has_played: playedSmIds.has(sm.id)
            }));
          }
        }
        return item;
      };
      const allItems = roomList.map((room, idx) => buildItem(room, idx === roomList.length - 1));
      const currentWeek = allItems[allItems.length - 1];
      const pastWeeks = allItems.slice(0, -1);
      const canCreateNext = latestRoom.status === "finalized";
      const nextWeekNumber = latestRoom.week_number + 1;
      res2.json({
        current_week: currentWeek,
        past_weeks: pastWeeks,
        next_week_number: nextWeekNumber,
        can_create_next: canCreateNext
      });
    }
  );
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber",
    async (req, res2) => {
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) {
        res2.status(400).json({ error: "weekNumber must be a positive integer" });
        return;
      }
      const supabase = getServiceSupabase();
      const { data: room } = await supabase.from("gameday_rooms").select("id, status, room_code, reward_description, reward_amount_display, created_at").eq("league_season_id", seasonId).eq("competition_type", "weekly").eq("week_number", wn).eq("experience_type", "fantasy").is("archived_at", null).maybeSingle();
      if (!room) {
        res2.json(null);
        return;
      }
      const { data: card } = await supabase.from("gameday_pick_cards").select("id, status").eq("room_id", room.id).maybeSingle();
      if (!card) {
        res2.json(null);
        return;
      }
      const { data: props } = await supabase.from("gameday_props").select("id, scoring_scope, status").eq("card_id", card.id);
      const propList = (props ?? []).filter((p) => p.scoring_scope === "competition");
      const propIds = (props ?? []).map((p) => p.id);
      const settledCount = propList.filter((p) => p.status === "settled").length;
      let pickCount = 0;
      if (propIds.length > 0) {
        try {
          const { count } = await supabase.from("gameday_picks").select("id", { count: "exact", head: true }).in("prop_id", propIds);
          pickCount = count ?? 0;
        } catch {
          pickCount = 0;
        }
      }
      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId).catch(() => null);
      const isCallerCommissioner = viewer && (viewer.role === "commissioner" || viewer.role === "co_commissioner");
      let myPickCount = 0;
      if (viewer && propIds.length > 0) {
        try {
          const { data: vPart } = await supabase.from("gameday_participants").select("id").eq("room_id", room.id).eq("season_member_id", viewer.season_member_id).maybeSingle();
          if (vPart) {
            const { count } = await supabase.from("gameday_picks").select("id", { count: "exact", head: true }).in("prop_id", propIds).eq("participant_id", vPart.id);
            myPickCount = count ?? 0;
          }
        } catch {
          myPickCount = 0;
        }
      }
      const { data: smRows } = await supabase.from("fantasy_season_members").select("id, fantasy_league_members(display_name)").eq("league_season_id", seasonId).eq("is_active", true);
      const smList = smRows ?? [];
      const eligibleCount = smList.length;
      const compPropIds = propList.map((p) => p.id);
      const playedSmIds = /* @__PURE__ */ new Set();
      if (compPropIds.length > 0 && smList.length > 0) {
        const { data: parts } = await supabase.from("gameday_participants").select("id, season_member_id").eq("room_id", room.id);
        const partList = parts ?? [];
        if (partList.length > 0) {
          const partIds = partList.map((p) => p.id);
          const { data: picksRows } = await supabase.from("gameday_picks").select("participant_id").in("participant_id", partIds).in("prop_id", compPropIds);
          const playedPartIds = new Set(
            (picksRows ?? []).map((p) => p.participant_id)
          );
          for (const part of partList) {
            if (playedPartIds.has(part.id)) playedSmIds.add(part.season_member_id);
          }
        }
      }
      const playedCount = playedSmIds.size;
      const waitingCount = eligibleCount - playedCount;
      let participantsStatus;
      if (isCallerCommissioner) {
        participantsStatus = smList.map((sm) => ({
          season_member_id: sm.id,
          display_name: sm.fantasy_league_members?.display_name ?? null,
          has_played: playedSmIds.has(sm.id)
        }));
      }
      res2.json({
        room_id: room.id,
        card_id: card.id,
        room_code: room.room_code ?? null,
        room_status: room.status,
        card_status: card.status,
        week_number: wn,
        prop_count: propList.length,
        settled_count: settledCount,
        all_settled: propList.length > 0 && settledCount === propList.length,
        pick_count: pickCount,
        my_pick_count: myPickCount,
        eligible_count: eligibleCount,
        played_count: playedCount,
        waiting_count: waitingCount,
        reward_description: room.reward_description ?? null,
        reward_amount_display: room.reward_amount_display ?? null,
        ...participantsStatus !== void 0 && { participants_status: participantsStatus },
        created_at: room.created_at
      });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/lock",
    async (req, res2) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) {
        res2.status(400).json({ error: "weekNumber must be a positive integer" });
        return;
      }
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) {
        res2.status(rc.status).json(rc.body);
        return;
      }
      const { card } = rc;
      const cs = card.status;
      if (cs === "locked" || cs === "settled") {
        res2.json({ card_status: cs, already_locked: true });
        return;
      }
      const { error } = await supabase.from("gameday_pick_cards").update({ status: "locked", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", card.id);
      if (error) {
        console.error(`[fantasy/weekly] Week ${wn} lock error:`, error.message);
        res2.status(500).json({ error: `Failed to lock Week ${wn}` });
        return;
      }
      console.log(`[fantasy/weekly] Week ${wn} locked by ${commissioner.userId.slice(0, 8)}\u2026`);
      res2.json({ card_status: "locked", already_locked: false });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/unlock",
    async (req, res2) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) {
        res2.status(400).json({ error: "weekNumber must be a positive integer" });
        return;
      }
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) {
        res2.status(rc.status).json(rc.body);
        return;
      }
      const { card } = rc;
      const cs = card.status;
      if (cs === "settled") {
        res2.status(409).json({ error: "Cannot unlock a finalized competition", card_status: cs });
        return;
      }
      const { count: settledCnt } = await supabase.from("gameday_props").select("id", { count: "exact", head: true }).eq("card_id", card.id).eq("status", "settled");
      if ((settledCnt ?? 0) > 0) {
        res2.status(409).json({ error: "Cannot unlock after settlement has started", settled_props: settledCnt });
        return;
      }
      if (cs === "open" || cs === "closed") {
        res2.json({ card_status: cs, already_unlocked: true });
        return;
      }
      const { error } = await supabase.from("gameday_pick_cards").update({ status: "open", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", card.id);
      if (error) {
        console.error(`[fantasy/weekly] Week ${wn} unlock error:`, error.message);
        res2.status(500).json({ error: `Failed to unlock Week ${wn}` });
        return;
      }
      res2.json({ card_status: "open", already_unlocked: false });
    }
  );
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/play",
    async (req, res2) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) {
        res2.status(400).json({ error: "weekNumber must be a positive integer" });
        return;
      }
      const supabase = getServiceSupabase();
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId);
      if (!viewer) {
        res2.status(403).json({ error: "You are not a member of this league for this season." });
        return;
      }
      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) {
        res2.status(rc.status).json(rc.body);
        return;
      }
      const { room, card } = rc;
      const roomId = room.id;
      const cardStatus = card.status;
      const cardRosterRevision = card.roster_revision ?? 0;
      const { participant_id: participantId } = await ensureFantasyParticipant(supabase, roomId, viewer);
      const { data: rawProps } = await supabase.from("gameday_props").select("id, question, scoring_scope, point_value, answer_options, answer_target_type, display_order").eq("card_id", card.id).order("display_order", { ascending: true });
      const publishedProps = (rawProps ?? []).map((p) => ({
        id: p.id,
        question: p.question,
        scoring_scope: p.scoring_scope,
        point_value: p.point_value,
        answer_target_type: p.answer_target_type,
        answer_options: Array.isArray(p.answer_options) ? p.answer_options : [],
        display_order: p.display_order
      }));
      const propIds = publishedProps.map((p) => p.id);
      const rosterTargetPropIds = new Set(
        publishedProps.filter((p) => p.answer_target_type === "season_member" || p.answer_target_type === "fantasy_team").map((p) => p.id)
      );
      let rawPicks = [];
      if (propIds.length > 0) {
        const { data: rp } = await supabase.from("gameday_picks").select("prop_id, selected_answer, answer_universe_revision").in("prop_id", propIds).eq("participant_id", participantId);
        rawPicks = rp ?? [];
      }
      const myPicks = {};
      const stalePropIds = [];
      for (const pick of rawPicks) {
        const propId = pick.prop_id;
        const pickRev = pick.answer_universe_revision ?? 0;
        myPicks[propId] = pick.selected_answer;
        if (rosterTargetPropIds.has(propId) && pickRev < cardRosterRevision) stalePropIds.push(propId);
      }
      const { data: seasonRow } = await supabase.from("fantasy_league_seasons").select("fantasy_leagues(league_name)").eq("id", seasonId).maybeSingle();
      const leagueName = seasonRow?.fantasy_leagues?.league_name ?? null;
      res2.json({
        room_id: roomId,
        card_id: card.id,
        room_code: room.room_code ?? null,
        room_status: room.status,
        card_status: cardStatus,
        week_number: wn,
        roster_revision: cardRosterRevision,
        stale_pick_prop_ids: stalePropIds,
        participant_id: participantId,
        props: publishedProps,
        my_picks: myPicks,
        my_pick_count: Object.keys(myPicks).length,
        total_props: publishedProps.length,
        league_name: leagueName
      });
    }
  );
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/league-picks",
    async (req, res2) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) {
        res2.status(400).json({ error: "weekNumber must be a positive integer" });
        return;
      }
      const supabase = getServiceSupabase();
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId);
      if (!viewer) {
        res2.status(403).json({ error: "You are not a member of this league for this season." });
        return;
      }
      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) {
        res2.status(rc.status).json(rc.body);
        return;
      }
      const { room, card } = rc;
      const cardStatus = card.status;
      if (cardStatus === "open") {
        res2.json({ revealed: false, card_status: cardStatus });
        return;
      }
      const distribution = await _buildLeaguePicks(
        supabase,
        room.id,
        card.id,
        cardStatus,
        viewer.season_member_id
      );
      res2.json({
        revealed: true,
        card_status: cardStatus,
        room_status: room.status,
        week_number: wn,
        ...distribution
      });
    }
  );
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/draft-day/league-picks",
    async (req, res2) => {
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId);
      if (!viewer) {
        res2.status(403).json({ error: "You are not a member of this league for this season." });
        return;
      }
      const { data: room } = await supabase.from("gameday_rooms").select("id, status, room_code").eq("league_season_id", seasonId).eq("experience_type", "fantasy").eq("competition_type", "draft_day").maybeSingle();
      if (!room) {
        res2.status(404).json({ error: "No Draft Day competition found for this season." });
        return;
      }
      const { data: card } = await supabase.from("gameday_pick_cards").select("id, status").eq("room_id", room.id).eq("phase", "draft_day").maybeSingle();
      if (!card) {
        res2.status(404).json({ error: "Draft Day card not found." });
        return;
      }
      const cardStatus = card.status;
      if (cardStatus === "open") {
        res2.json({ revealed: false, card_status: cardStatus });
        return;
      }
      const distribution = await _buildLeaguePicks(
        supabase,
        room.id,
        card.id,
        cardStatus,
        viewer.season_member_id,
        "competition"
      );
      res2.json({
        revealed: true,
        card_status: cardStatus,
        room_status: room.status,
        ...distribution
      });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/picks",
    async (req, res2) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) {
        res2.status(400).json({ error: "weekNumber must be a positive integer" });
        return;
      }
      const supabase = getServiceSupabase();
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { prop_id, selected_answer } = req.body ?? {};
      if (!prop_id || typeof prop_id !== "string") {
        res2.status(400).json({ error: "prop_id is required" });
        return;
      }
      if (!selected_answer || typeof selected_answer !== "string") {
        res2.status(400).json({ error: "selected_answer is required" });
        return;
      }
      const viewer = await resolveViewer(supabase, identity, seasonId, leagueId);
      if (!viewer) {
        res2.status(403).json({ error: "You are not a member of this league for this season." });
        return;
      }
      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) {
        res2.status(rc.status).json(rc.body);
        return;
      }
      const { room, card } = rc;
      const cardRosterRevision = card.roster_revision ?? 0;
      if (card.status !== "open") {
        res2.status(409).json({ error: "Picks are locked. No more changes accepted.", card_status: card.status });
        return;
      }
      const { data: prop } = await supabase.from("gameday_props").select("id, answer_options").eq("id", prop_id).eq("card_id", card.id).maybeSingle();
      if (!prop) {
        res2.status(400).json({ error: `Prop not found on this Week ${wn} card.` });
        return;
      }
      const validIds = new Set(
        (Array.isArray(prop.answer_options) ? prop.answer_options : []).map((o) => o.id)
      );
      if (!validIds.has(selected_answer)) {
        res2.status(400).json({
          error: "Invalid answer. selected_answer must match a published answer option ID.",
          valid_answer_ids: Array.from(validIds)
        });
        return;
      }
      const { participant_id: participantId } = await ensureFantasyParticipant(supabase, room.id, viewer);
      const { data: upserted, error: upsertErr } = await supabase.from("gameday_picks").upsert({
        prop_id,
        participant_id: participantId,
        selected_answer,
        submitted_at: (/* @__PURE__ */ new Date()).toISOString(),
        answer_universe_revision: cardRosterRevision
      }, { onConflict: "prop_id,participant_id" }).select("id, prop_id, selected_answer").single();
      if (upsertErr) {
        console.error(`[fantasy/weekly] Week ${wn} pick upsert error:`, upsertErr.message);
        res2.status(500).json({ error: "Failed to save pick. Please try again." });
        return;
      }
      res2.json({
        pick_id: upserted.id,
        prop_id: upserted.prop_id,
        selected_answer: upserted.selected_answer
      });
    }
  );
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/settlement",
    async (req, res2) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) {
        res2.status(400).json({ error: "weekNumber must be a positive integer" });
        return;
      }
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) {
        res2.status(rc.status).json(rc.body);
        return;
      }
      const { room, card } = rc;
      const { data: allProps } = await supabase.from("gameday_props").select("id, question, answer_options, scoring_scope, point_value, display_order, status, correct_answer").eq("card_id", card.id).eq("scoring_scope", "competition").order("display_order", { ascending: true });
      const propList = allProps ?? [];
      const settledCount = propList.filter((p) => p.status === "settled").length;
      const previewLeaderboard = settledCount > 0 ? await _buildLeaderboard(supabase, room.id, propList) : [];
      res2.json({
        room_id: room.id,
        card_id: card.id,
        card_status: card.status,
        room_status: room.status,
        week_number: wn,
        competition_props: propList.map((p) => ({
          id: p.id,
          question: p.question,
          display_order: p.display_order,
          point_value: p.point_value,
          scoring_scope: p.scoring_scope,
          status: p.status,
          correct_answer: p.correct_answer ?? null,
          answer_options: Array.isArray(p.answer_options) ? p.answer_options : []
        })),
        settled_count: settledCount,
        total_competition_count: propList.length,
        all_settled: propList.length > 0 && settledCount === propList.length,
        preview_leaderboard: previewLeaderboard
      });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/settle",
    async (req, res2) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) {
        res2.status(400).json({ error: "weekNumber must be a positive integer" });
        return;
      }
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const { prop_id, correct_answer } = req.body;
      if (!prop_id) {
        res2.status(400).json({ error: "prop_id is required" });
        return;
      }
      if (!correct_answer) {
        res2.status(400).json({ error: "correct_answer is required" });
        return;
      }
      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) {
        res2.status(rc.status).json(rc.body);
        return;
      }
      const { room, card } = rc;
      if (!["locked", "settled"].includes(card.status)) {
        res2.status(409).json({ error: "Week picks must be locked before settling results", card_status: card.status });
        return;
      }
      if (room.status === "finalized") {
        res2.status(409).json({ error: "Week results are finalized and cannot be changed.", room_status: "finalized" });
        return;
      }
      const { data: prop } = await supabase.from("gameday_props").select("id, card_id, scoring_scope, status, correct_answer, answer_options").eq("id", prop_id).eq("card_id", card.id).maybeSingle();
      if (!prop) {
        res2.status(404).json({ error: "Prop not found on this Week competition card" });
        return;
      }
      const opts = Array.isArray(prop.answer_options) ? prop.answer_options : [];
      const validIds = new Set(opts.map((o) => o.id));
      if (!validIds.has(correct_answer)) {
        res2.status(400).json({ error: "correct_answer must be a valid published answer option ID", valid_answer_ids: Array.from(validIds) });
        return;
      }
      const wasAlreadySettled = prop.status === "settled";
      if (wasAlreadySettled && prop.correct_answer === correct_answer) {
        res2.json({ ok: true, idempotent: true, was_correction: false, prop_id, correct_answer });
        return;
      }
      const result = await settlePropCore(supabase, {
        propId: prop_id,
        cardId: card.id,
        correctAnswer: correct_answer
      });
      console.log(
        `[fantasy/weekly] settle prop=${prop_id.slice(0, 8)}\u2026 week=${wn} answer=${correct_answer} correction=${wasAlreadySettled} by=${commissioner.userId.slice(0, 8)}\u2026`
      );
      res2.json({
        ok: true,
        idempotent: false,
        was_correction: wasAlreadySettled,
        prop_id,
        correct_answer,
        card_auto_settled: result.cardAutoSettled
      });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/finalize",
    async (req, res2) => {
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) {
        res2.status(400).json({ error: "weekNumber must be a positive integer" });
        return;
      }
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) {
        res2.status(rc.status).json(rc.body);
        return;
      }
      const { room, card } = rc;
      if (room.status === "finalized") {
        res2.json({ ok: true, already_finalized: true });
        return;
      }
      if (!["locked", "settled"].includes(card.status)) {
        res2.status(409).json({ error: `Week ${wn} picks must be locked before finalizing`, card_status: card.status });
        return;
      }
      const { data: unsettled } = await supabase.from("gameday_props").select("id").eq("card_id", card.id).eq("scoring_scope", "competition").neq("status", "settled");
      if ((unsettled?.length ?? 0) > 0) {
        res2.status(409).json({
          error: `All Week ${wn} questions must be resolved before finalizing`,
          unsettled_competition_count: unsettled?.length ?? 0
        });
        return;
      }
      const { error: finalizeErr } = await supabase.from("gameday_rooms").update({ status: "finalized" }).eq("id", room.id);
      if (finalizeErr) {
        console.error(`[fantasy/weekly] Week ${wn} finalize error:`, finalizeErr.message);
        res2.status(500).json({ error: `Failed to finalize Week ${wn}` });
        return;
      }
      console.log(`[fantasy/weekly] Week ${wn} finalized: room=${String(room.id).slice(0, 8)}\u2026 by=${commissioner.userId.slice(0, 8)}\u2026`);
      res2.json({ ok: true, already_finalized: false });
    }
  );
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/weeks/:weekNumber/results",
    async (req, res2) => {
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { leagueId, seasonId, weekNumber } = req.params;
      const wn = parseInt(weekNumber, 10);
      if (!Number.isInteger(wn) || wn < 1) {
        res2.status(400).json({ error: "weekNumber must be a positive integer" });
        return;
      }
      const supabase = getServiceSupabase();
      const rc = await _getWeeklyRoomAndCard(supabase, seasonId, wn);
      if (!rc.ok) {
        res2.status(rc.status).json(rc.body);
        return;
      }
      const { room, card } = rc;
      if (room.status !== "finalized") {
        res2.json({ finalized: false });
        return;
      }
      const { data: season } = await supabase.from("fantasy_league_seasons").select("season_year, fantasy_leagues(league_name)").eq("id", seasonId).maybeSingle();
      const { data: allProps } = await supabase.from("gameday_props").select("id, question, scoring_scope, point_value, display_order, status, correct_answer, answer_options").eq("card_id", card.id).eq("scoring_scope", "competition").order("display_order", { ascending: true });
      const competitionProps = allProps ?? [];
      const answerLabelMap = {};
      for (const p of competitionProps) {
        answerLabelMap[p.id] = {};
        for (const opt of Array.isArray(p.answer_options) ? p.answer_options : []) {
          if (opt?.id && opt?.label) answerLabelMap[p.id][opt.id] = opt.label;
        }
      }
      const leaderboard = await _buildLeaderboard(supabase, room.id, competitionProps);
      const topPoints = leaderboard[0]?.points ?? 0;
      const winners = leaderboard.filter((e) => e.points === topPoints);
      let myCompPicks = [];
      let myTotalPoints = 0;
      let myCorrectCount = 0;
      try {
        const viewerData = await resolveViewer(supabase, identity, seasonId, leagueId);
        if (viewerData) {
          const { data: vPart } = await supabase.from("gameday_participants").select("id").eq("room_id", room.id).eq("season_member_id", viewerData.season_member_id).maybeSingle();
          if (vPart) {
            const vId = vPart.id;
            const cpIds = competitionProps.map((p) => p.id);
            const pvMap = {};
            for (const p of competitionProps) pvMap[p.id] = p.point_value ?? 0;
            if (cpIds.length > 0) {
              const { data: picks } = await supabase.from("gameday_picks").select("prop_id, selected_answer, is_correct").eq("participant_id", vId).in("prop_id", cpIds);
              const pickByProp = {};
              for (const pk of picks ?? []) pickByProp[pk.prop_id] = pk;
              myCompPicks = competitionProps.map((prop) => {
                const pick = pickByProp[prop.id] ?? null;
                const myAnswerId = pick?.selected_answer ?? null;
                const correctId = prop.correct_answer ?? null;
                const isCorrect = pick?.is_correct ?? null;
                const pointsEarned = isCorrect === true ? pvMap[prop.id] ?? 0 : 0;
                if (isCorrect === true) {
                  myTotalPoints += pointsEarned;
                  myCorrectCount++;
                }
                return {
                  prop_id: prop.id,
                  question: prop.question,
                  display_order: prop.display_order,
                  point_value: prop.point_value,
                  my_answer_id: myAnswerId,
                  my_answer_label: myAnswerId ? answerLabelMap[prop.id]?.[myAnswerId] ?? myAnswerId : null,
                  correct_answer_id: correctId,
                  correct_answer_label: correctId ? answerLabelMap[prop.id]?.[correctId] ?? correctId : null,
                  is_correct: isCorrect,
                  points_earned: pointsEarned
                };
              });
            }
          }
        }
      } catch (e) {
        console.warn("[fantasy/weekly] results viewer lookup:", e.message);
      }
      res2.json({
        finalized: true,
        week_number: wn,
        league_name: season?.fantasy_leagues?.league_name ?? null,
        season_year: season?.season_year ?? null,
        reward_description: room.reward_description ?? null,
        reward_amount_display: room.reward_amount_display ?? null,
        winners: winners.map((w) => ({
          display_name: w.display_name,
          team_name: w.team_name,
          points: w.points,
          rank_label: w.rank_label
        })),
        leaderboard,
        my_competition_picks: myCompPicks,
        my_total_points: myTotalPoints,
        my_correct_count: myCorrectCount,
        total_competition_props: competitionProps.length
      });
    }
  );
  app2.get(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/standings",
    async (req, res2) => {
      const identity = getCallerIdentity2(req);
      if (!identity.userId && !identity.guestToken) {
        res2.status(401).json({ error: "Unauthorized" });
        return;
      }
      const { leagueId, seasonId } = req.params;
      const supabase = getServiceSupabase();
      const { data: season } = await supabase.from("fantasy_league_seasons").select("season_year, fantasy_leagues(league_name)").eq("id", seasonId).eq("league_id", leagueId).maybeSingle();
      if (!season) {
        res2.status(404).json({ error: "Season not found" });
        return;
      }
      const { standings, finalized_competitions } = await _buildSeasonStandings(supabase, seasonId);
      res2.json({
        league_name: season?.fantasy_leagues?.league_name ?? null,
        season_year: season?.season_year ?? null,
        finalized_competitions,
        standings
      });
    }
  );
  app2.post(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/members/:memberId/recovery-token",
    async (req, res2) => {
      const { leagueId, seasonId, memberId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      if (!await requireLeagueActive(supabase, leagueId, res2)) return;
      const { data: targetMember } = await supabase.from("fantasy_league_members").select("id, display_name").eq("id", memberId).eq("league_id", leagueId).eq("is_active", true).maybeSingle();
      if (!targetMember) {
        res2.status(404).json({ error: "Member not found in this league" });
        return;
      }
      const { data: activeClaim } = await supabase.from("fantasy_member_claims").select("user_id, guest_token").eq("league_member_id", memberId).eq("is_active", true).maybeSingle();
      if (!activeClaim) {
        res2.status(400).json({
          error: "This member has not yet claimed their seat. Use the normal invite flow instead.",
          code: "unclaimed"
        });
        return;
      }
      if (activeClaim.user_id !== null) {
        res2.status(400).json({
          error: "This member already has a Swayger account linked. They should sign in to recover access.",
          code: "already_account_claimed"
        });
        return;
      }
      let teamName = null;
      const { data: seasonMember } = await supabase.from("fantasy_season_members").select("id").eq("league_season_id", seasonId).eq("league_member_id", memberId).eq("is_active", true).maybeSingle();
      if (seasonMember) {
        const { data: teamMgr } = await supabase.from("fantasy_team_managers").select("fantasy_teams(team_name)").eq("season_member_id", seasonMember.id).eq("is_active", true).maybeSingle();
        teamName = teamMgr?.fantasy_teams?.team_name ?? null;
      }
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash2("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "create_member_recovery_token",
        {
          p_league_id: leagueId,
          p_season_id: seasonId,
          p_league_member_id: memberId,
          p_created_by_user_id: commissioner.userId,
          p_token_hash: tokenHash,
          p_expires_at: expiresAt
        }
      );
      if (rpcError) {
        const msg = rpcError.message ?? "";
        if (msg.includes("not_guest_claimed")) {
          res2.status(400).json({
            error: "This member no longer has a guest claim. Recovery is not available.",
            code: msg
          });
          return;
        }
        console.error("[fantasy/recovery] create_member_recovery_token RPC error:", msg);
        res2.status(500).json({ error: "Failed to create recovery token" });
        return;
      }
      console.log(
        `[fantasy/recovery] Token created: member=${memberId.slice(0, 8)}\u2026 commissioner=${commissioner.userId.slice(0, 8)}\u2026 expires=${expiresAt}`
        // raw_token intentionally NOT logged
      );
      res2.json({
        raw_token: rawToken,
        expires_at: expiresAt,
        display_name: targetMember.display_name,
        team_name: teamName
      });
    }
  );
  app2.get(
    "/api/fantasy/recover/:token",
    async (req, res2) => {
      const { token } = req.params;
      if (!token?.trim()) {
        res2.status(400).json({ error: "Token required" });
        return;
      }
      const tokenHash = createHash2("sha256").update(token.trim()).digest("hex");
      const supabase = getServiceSupabase();
      const { data: tokenRecord } = await supabase.from("fantasy_member_recovery_tokens").select("status, expires_at, league_id, league_season_id, league_member_id").eq("token_hash", tokenHash).maybeSingle();
      if (!tokenRecord) {
        res2.status(404).json({ error: "Recovery link not found or invalid", code: "not_found" });
        return;
      }
      const rec = tokenRecord;
      const effectiveStatus = rec.status === "pending" && /* @__PURE__ */ new Date() > new Date(rec.expires_at) ? "expired" : rec.status;
      const [memberResult, leagueResult] = await Promise.all([
        supabase.from("fantasy_league_members").select("display_name").eq("id", rec.league_member_id).maybeSingle(),
        supabase.from("fantasy_leagues").select("league_name").eq("id", rec.league_id).maybeSingle()
      ]);
      let teamName = null;
      if (rec.league_season_id) {
        const { data: sm } = await supabase.from("fantasy_season_members").select("id").eq("league_season_id", rec.league_season_id).eq("league_member_id", rec.league_member_id).eq("is_active", true).maybeSingle();
        if (sm) {
          const { data: tmgr } = await supabase.from("fantasy_team_managers").select("fantasy_teams(team_name)").eq("season_member_id", sm.id).eq("is_active", true).maybeSingle();
          teamName = tmgr?.fantasy_teams?.team_name ?? null;
        }
      }
      res2.json({
        status: effectiveStatus,
        display_name: memberResult.data?.display_name ?? null,
        team_name: teamName,
        league_name: leagueResult.data?.league_name ?? null,
        expires_at: rec.expires_at
      });
    }
  );
  app2.post(
    "/api/fantasy/recover/:token",
    async (req, res2) => {
      const { token } = req.params;
      if (!token?.trim()) {
        res2.status(400).json({ error: "Token required" });
        return;
      }
      const userId = requireFantasyAuth(req, res2);
      if (!userId) return;
      const tokenHash = createHash2("sha256").update(token.trim()).digest("hex");
      const supabase = getServiceSupabase();
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "redeem_member_recovery_token",
        {
          p_token_hash: tokenHash,
          p_redeeming_user_id: userId
          // verified from JWT — cannot be spoofed
        }
      );
      if (rpcError) {
        const msg = rpcError.message ?? "";
        if (msg.includes("token_not_found"))
          return void res2.status(404).json({ error: "Recovery link not found or invalid", code: "not_found" });
        if (msg.includes("token_not_pending:redeemed"))
          return void res2.status(410).json({ error: "This recovery link has already been used.", code: "already_redeemed" });
        if (msg.includes("token_not_pending:revoked"))
          return void res2.status(410).json({ error: "This recovery link has been revoked. Ask your commissioner to generate a new one.", code: "revoked" });
        if (msg.includes("token_expired"))
          return void res2.status(410).json({ error: "This recovery link has expired. Ask your commissioner to generate a new one.", code: "expired" });
        if (msg.includes("no_active_claim"))
          return void res2.status(409).json({ error: "This seat no longer has an active guest claim.", code: "no_active_claim" });
        if (msg.includes("already_account_claimed"))
          return void res2.status(409).json({ error: "This seat is already linked to a Swayger account.", code: "already_account_claimed" });
        if (msg.includes("wrong_account_already_member"))
          return void res2.status(409).json({
            error: "This Swayger account is already connected to another member in this league. Sign in with a different account.",
            code: "wrong_account_already_member"
          });
        console.error("[fantasy/recovery] redeem_member_recovery_token RPC error:", msg);
        return void res2.status(500).json({ error: "Failed to redeem recovery token" });
      }
      const result = rpcResult;
      console.log(
        `[fantasy/recovery] Redeemed: member=${String(result.league_member_id).slice(0, 8)}\u2026 user=${userId.slice(0, 8)}\u2026 idempotent=${result.already_redeemed_by_you ?? false}`
      );
      res2.json({
        redeemed: result.redeemed ?? false,
        already_redeemed_by_you: result.already_redeemed_by_you ?? false,
        league_member_id: result.league_member_id,
        display_name: result.display_name,
        team_name: result.team_name,
        league_name: result.league_name,
        league_id: result.league_id,
        season_id: result.season_id
      });
    }
  );
  app2.delete(
    "/api/fantasy/leagues/:leagueId/seasons/:seasonId/members/:memberId/recovery-token",
    async (req, res2) => {
      const { leagueId, seasonId, memberId } = req.params;
      const supabase = getServiceSupabase();
      const commissioner = await requireFantasyCommissioner(req, res2, supabase, leagueId, seasonId);
      if (!commissioner) return;
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "revoke_member_recovery_token",
        { p_league_member_id: memberId }
      );
      if (rpcError) {
        console.error("[fantasy/recovery] revoke_member_recovery_token RPC error:", rpcError.message);
        res2.status(500).json({ error: "Failed to revoke recovery token" });
        return;
      }
      const result = rpcResult;
      console.log(
        `[fantasy/recovery] Revoked: member=${memberId.slice(0, 8)}\u2026 count=${result?.revoked_count ?? 0} by=${commissioner.userId.slice(0, 8)}\u2026`
      );
      res2.json({ revoked: true, revoked_count: result?.revoked_count ?? 0 });
    }
  );
}

// server/routes.ts
function getSupabase4() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient6(url, key);
}
async function registerRoutes(app2) {
  app2.get("/promo", (_req, res2) => {
    res2.sendFile(path3.resolve(process.cwd(), "server/templates/promo.html"));
  });
  app2.get("/how-it-works", (_req, res2) => {
    res2.sendFile(path3.resolve(process.cwd(), "server/templates/swayger-how-it-works.html"));
  });
  app2.get("/api/config", (_req, res2) => {
    const domains = (process.env.REPLIT_DOMAINS || "").split(",").map((d) => d.trim()).filter(Boolean);
    const primaryDomain = domains[0] || process.env.REPLIT_DEV_DOMAIN || "";
    res2.json({ appUrl: primaryDomain ? `https://${primaryDomain}` : "" });
  });
  app2.get("/api/invite/:code/preview", async (req, res2) => {
    try {
      const code = String(req.params.code || "").toUpperCase().trim();
      if (!code) {
        res2.status(400).json({ error: "No code" });
        return;
      }
      const supabase = getSupabase4();
      const { data: invite, error: inviteErr } = await supabase.from("swayger_invites").select("swayger_id, invite_code, expires_at").eq("invite_code", code).maybeSingle();
      if (inviteErr || !invite) {
        res2.status(404).json({ error: "Invite not found" });
        return;
      }
      if (invite.expires_at && new Date(invite.expires_at) < /* @__PURE__ */ new Date()) {
        res2.status(410).json({ error: "expired" });
        return;
      }
      const { data: swayger, error: swaygerErr } = await supabase.from("swaygers").select("id, title, category, stake_units, creator_pick, description, status, creator_id, expires_at").eq("id", invite.swayger_id).maybeSingle();
      if (swaygerErr || !swayger) {
        res2.status(404).json({ error: "Swayger not found" });
        return;
      }
      if (swayger.status !== "pending_invite") {
        res2.status(409).json({ error: swayger.status === "active" ? "already_accepted" : "unavailable", status: swayger.status });
        return;
      }
      const { data: creator } = await supabase.from("profiles").select("username, display_name").eq("id", swayger.creator_id).maybeSingle();
      res2.json({
        code,
        swayger_id: swayger.id,
        title: swayger.title,
        category: swayger.category,
        stake_units: swayger.stake_units,
        creator_pick: swayger.creator_pick,
        description: swayger.description,
        expires_at: swayger.expires_at,
        creator_id: swayger.creator_id,
        creator_username: creator?.username ?? null,
        creator_display_name: creator?.display_name ?? null
      });
    } catch (err) {
      console.error("[invite-preview]", err);
      res2.status(500).json({ error: "Server error" });
    }
  });
  app2.post("/api/push/send", async (req, res2) => {
    try {
      const { toUserId, title, body, data } = req.body;
      if (!toUserId || !title || !body) {
        res2.status(400).json({ ok: false, error: "Missing fields" });
        return;
      }
      const appId = "6c7fe969-e694-4977-819a-f10fbc4159c6";
      const apiKey = process.env.ONESIGNAL_REST_API_KEY;
      if (!apiKey) {
        res2.status(500).json({ ok: false, error: "OneSignal REST key not configured" });
        return;
      }
      const response = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          "Authorization": `Key ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          app_id: appId,
          target_channel: "push",
          include_aliases: { external_id: [toUserId] },
          headings: { en: title },
          contents: { en: body },
          data: data || {}
        })
      });
      const json = await response.json();
      if (!response.ok) {
        console.error("[push] OneSignal error:", json);
        res2.status(500).json({ ok: false, error: "OneSignal send failed" });
        return;
      }
      res2.json({ ok: true, recipients: json.recipients ?? 0 });
    } catch (err) {
      console.error("[push] error:", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/push/tag-user", async (req, res2) => {
    try {
      const { userId, username, email } = req.body;
      if (!userId) {
        res2.status(400).json({ ok: false, error: "Missing userId" });
        return;
      }
      const appId = "6c7fe969-e694-4977-819a-f10fbc4159c6";
      const apiKey = process.env.ONESIGNAL_REST_API_KEY;
      if (!apiKey) {
        res2.status(500).json({ ok: false, error: "OneSignal REST key not configured" });
        return;
      }
      const tags = {};
      if (username) tags.username = username;
      if (email) tags.email = email;
      if (!Object.keys(tags).length) {
        res2.json({ ok: true, skipped: true });
        return;
      }
      const response = await fetch(
        `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { tags } })
        }
      );
      const json = await response.json();
      if (!response.ok) {
        console.error("[push/tag-user] OneSignal error:", json);
        res2.status(500).json({ ok: false, error: "OneSignal tag update failed" });
        return;
      }
      res2.json({ ok: true });
    } catch (err) {
      console.error("[push/tag-user] error:", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/admin/push/broadcast", async (req, res2) => {
    const adminToken = process.env.MM_ADMIN_TOKEN;
    if (!adminToken || req.headers["x-admin-token"] !== adminToken) {
      res2.status(403).json({ ok: false, error: "Forbidden" });
      return;
    }
    try {
      const { title, body, data, segment } = req.body;
      if (!title || !body) {
        res2.status(400).json({ ok: false, error: "title and body are required" });
        return;
      }
      const appId = "6c7fe969-e694-4977-819a-f10fbc4159c6";
      const apiKey = process.env.ONESIGNAL_REST_API_KEY;
      if (!apiKey) {
        res2.status(500).json({ ok: false, error: "OneSignal REST key not configured" });
        return;
      }
      const response = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          "Authorization": `Key ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          app_id: appId,
          target_channel: "push",
          included_segments: [segment ?? "All"],
          headings: { en: title },
          contents: { en: body },
          data: data || {}
        })
      });
      const json = await response.json();
      if (!response.ok) {
        console.error("[push/broadcast] OneSignal error:", json);
        res2.status(500).json({ ok: false, error: "OneSignal send failed", details: json });
        return;
      }
      console.log(`[push/broadcast] sent \u2014 id=${json.id} recipients=${json.recipients}`);
      res2.json({ ok: true, notification_id: json.id, recipients: json.recipients ?? 0 });
    } catch (err) {
      console.error("[push/broadcast] error:", err);
      res2.status(500).json({ ok: false, error: String(err) });
    }
  });
  app2.post("/api/notify", async (req, res2) => {
    try {
      const payload = req.body;
      if (!payload.event || !payload.swayger || !payload.recipients) {
        res2.status(400).json({ ok: false, error: "Invalid payload" });
        return;
      }
      await sendNotificationEmail(payload);
      res2.json({ ok: true });
    } catch (err) {
      console.error("[notify] error:", err);
      res2.status(500).json({ ok: false, error: "Failed to send notification" });
    }
  });
  registerMMAdminRoutes(app2);
  registerMMSpecialRoutes(app2);
  registerNBARoutes(app2);
  registerPropsRoutes(app2);
  registerGamedayRoutes(app2);
  registerFantasyRoutes(app2);
  const httpServer = createServer(app2);
  return httpServer;
}

// server/mm-scheduler.ts
init_email();
import * as fs3 from "fs";
import * as path4 from "path";
import { createClient as createClient8 } from "@supabase/supabase-js";

// server/mm-auto-score.ts
import { createClient as createClient7 } from "@supabase/supabase-js";
function getSupabase5() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient7(url, key);
}
var GAME_WINDOWS = [
  { roundId: "round-64", startMs: (/* @__PURE__ */ new Date("2026-03-19T17:00:00Z")).getTime(), endMs: (/* @__PURE__ */ new Date("2026-03-21T05:00:00Z")).getTime() },
  { roundId: "round-32", startMs: (/* @__PURE__ */ new Date("2026-03-21T17:00:00Z")).getTime(), endMs: (/* @__PURE__ */ new Date("2026-03-23T05:00:00Z")).getTime() },
  { roundId: "sweet-16", startMs: (/* @__PURE__ */ new Date("2026-03-27T17:00:00Z")).getTime(), endMs: (/* @__PURE__ */ new Date("2026-03-29T05:00:00Z")).getTime() },
  { roundId: "elite-8", startMs: (/* @__PURE__ */ new Date("2026-03-29T17:00:00Z")).getTime(), endMs: (/* @__PURE__ */ new Date("2026-03-31T05:00:00Z")).getTime() },
  { roundId: "final-four", startMs: (/* @__PURE__ */ new Date("2026-04-04T22:00:00Z")).getTime(), endMs: (/* @__PURE__ */ new Date("2026-04-06T05:00:00Z")).getTime() },
  { roundId: "championship", startMs: (/* @__PURE__ */ new Date("2026-04-07T22:00:00Z")).getTime(), endMs: (/* @__PURE__ */ new Date("2026-04-08T05:00:00Z")).getTime() }
];
function getActiveGameWindow() {
  const now = Date.now();
  return GAME_WINDOWS.find((w) => now >= w.startMs && now < w.endMs) ?? null;
}
function formatDateUTC(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
async function fetchESPNScoresForWindow(window) {
  const startDate = formatDateUTC(window.startMs);
  const endDate = formatDateUTC(window.endMs - 1);
  const datesToFetch = startDate === endDate ? [startDate] : [startDate, endDate];
  const allGames = [];
  for (const date of datesToFetch) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=50&dates=${date}&limit=50`;
    try {
      const res2 = await fetch(url);
      if (!res2.ok) {
        console.error(`[auto-score] ESPN API error for ${date}: HTTP ${res2.status}`);
        continue;
      }
      const data = await res2.json();
      const events = data.events ?? [];
      for (const event of events) {
        const comp = event.competitions?.[0];
        if (!comp) continue;
        if (!comp.status?.type?.completed) continue;
        const home = comp.competitors.find((c) => c.homeAway === "home");
        const away = comp.competitors.find((c) => c.homeAway === "away");
        if (!home || !away) continue;
        const commenceMs = new Date(comp.startDate).getTime();
        if (commenceMs < window.startMs || commenceMs >= window.endMs) continue;
        allGames.push({
          id: event.id,
          commence_time: comp.startDate,
          home_team: home.team.displayName,
          away_team: away.team.displayName,
          scores: [
            { name: home.team.displayName, score: home.score },
            { name: away.team.displayName, score: away.score }
          ]
        });
      }
    } catch (e) {
      console.error(`[auto-score] ESPN API fetch failed for ${date}:`, e);
    }
  }
  return allGames;
}
function normalizeTeam(name) {
  return name.toLowerCase().replace(/\b(university|college|state|st\.?|the|of|at|&)\b/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}
function teamsMatch(apiName, ourName) {
  if (!apiName || !ourName) return false;
  const a = normalizeTeam(apiName);
  const b = normalizeTeam(ourName);
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aFirst = a.split(" ").find((w) => w.length > 3) ?? "";
  const bFirst = b.split(" ").find((w) => w.length > 3) ?? "";
  return aFirst.length > 3 && aFirst === bFirst;
}
async function checkAndAutoScore() {
  const window = getActiveGameWindow();
  if (!window) {
    return { newResults: 0, scored: 0, skipped: "not in active game window" };
  }
  let completedGames;
  try {
    completedGames = await fetchESPNScoresForWindow(window);
  } catch (e) {
    console.error("[auto-score] ESPN fetch failed:", e);
    return { newResults: 0, scored: 0, skipped: "fetch error" };
  }
  if (!completedGames.length) {
    console.log(`[auto-score] No completed ${window.roundId} games found yet`);
    return { newResults: 0, scored: 0, skipped: "no completed games" };
  }
  const supabase = getSupabase5();
  const { data: existingResultsRaw } = await supabase.from("mm_game_results").select("matchup_id, round_id").eq("round_id", window.roundId);
  const existingKeys = new Set(
    (existingResultsRaw ?? []).map(
      (r) => `${r.round_id}:${r.matchup_id}`
    )
  );
  const { data: rankedRaw } = await supabase.from("mm_round_matchups").select("matchup_id, pick_type, team_a, team_b, seed_a, seed_b").eq("round_id", window.roundId);
  const allMatchupRows = rankedRaw ?? [];
  let newResults = 0;
  for (const game of completedGames) {
    const gameScores = game.scores;
    const homeScoreStr = gameScores.find((s) => s.name === game.home_team)?.score ?? "0";
    const awayScoreStr = gameScores.find((s) => s.name === game.away_team)?.score ?? "0";
    const homeScore = parseInt(homeScoreStr, 10);
    const awayScore = parseInt(awayScoreStr, 10);
    if (isNaN(homeScore) || isNaN(awayScore)) {
      console.warn(`[auto-score] Invalid scores for ${game.home_team} vs ${game.away_team}`);
      continue;
    }
    const winnerApiName = homeScore > awayScore ? game.home_team : game.away_team;
    const winnerScore = Math.max(homeScore, awayScore);
    const loserScore = Math.min(homeScore, awayScore);
    const matchingRows = allMatchupRows.filter(
      (r) => (teamsMatch(game.home_team, r.team_a) || teamsMatch(game.home_team, r.team_b)) && (teamsMatch(game.away_team, r.team_a) || teamsMatch(game.away_team, r.team_b))
    );
    const canonicalRow = matchingRows.find((r) => r.pick_type === "upset") ?? matchingRows[0] ?? null;
    let canonicalWinnerName;
    let canonicalLoserName;
    let winnerSeed = null;
    let loserSeed = null;
    let wasUpset = false;
    if (canonicalRow) {
      const homeIsTeamA = teamsMatch(game.home_team, canonicalRow.team_a);
      const winnerIsTeamA = winnerApiName === game.home_team ? homeIsTeamA : !homeIsTeamA;
      canonicalWinnerName = winnerIsTeamA ? canonicalRow.team_a : canonicalRow.team_b;
      canonicalLoserName = winnerIsTeamA ? canonicalRow.team_b : canonicalRow.team_a;
      winnerSeed = winnerIsTeamA ? canonicalRow.seed_a : canonicalRow.seed_b;
      loserSeed = winnerIsTeamA ? canonicalRow.seed_b : canonicalRow.seed_a;
      wasUpset = (winnerSeed ?? 0) > (loserSeed ?? 0);
    } else {
      canonicalWinnerName = winnerApiName;
      canonicalLoserName = homeScore > awayScore ? game.away_team : game.home_team;
    }
    const matchupIdsForGame = /* @__PURE__ */ new Set();
    for (const r of matchingRows) {
      matchupIdsForGame.add(r.matchup_id);
    }
    if (matchupIdsForGame.size === 0) {
      matchupIdsForGame.add(`auto-${game.id.slice(-8)}`);
    }
    for (const matchupId of matchupIdsForGame) {
      const resultKey = `${window.roundId}:${matchupId}`;
      if (existingKeys.has(resultKey)) continue;
      const { error } = await supabase.from("mm_game_results").upsert(
        {
          round_id: window.roundId,
          matchup_id: matchupId,
          winner_name: canonicalWinnerName,
          winner_seed: winnerSeed,
          loser_name: canonicalLoserName,
          loser_seed: loserSeed,
          winner_score: winnerScore,
          loser_score: loserScore,
          was_upset: wasUpset,
          resolved_at: (/* @__PURE__ */ new Date()).toISOString(),
          resolved_by: "auto-espn-api"
        },
        { onConflict: "round_id,matchup_id" }
      );
      if (error) {
        console.error(
          `[auto-score] Insert failed for matchup ${matchupId} (${canonicalWinnerName} vs ${canonicalLoserName}):`,
          error.message
        );
      } else {
        existingKeys.add(resultKey);
        newResults++;
      }
    }
    if (matchupIdsForGame.size > 0) {
      const upsetLabel = wasUpset ? " (UPSET)" : "";
      console.log(
        `[auto-score] \u2713 ${canonicalWinnerName} ${winnerScore}-${loserScore} over ${canonicalLoserName}${upsetLabel} [${window.roundId}] \u2014 ${matchupIdsForGame.size} row(s) inserted`
      );
    }
  }
  let scored = 0;
  if (newResults > 0) {
    console.log(`[auto-score] ${newResults} new result row(s) \u2014 recomputing scores (no emails)...`);
    const { scored: s, error } = await computeAndSaveScores(supabase);
    if (error) {
      console.error("[auto-score] Score compute error:", error);
    } else {
      scored = s;
      console.log(`[auto-score] Leaderboard updated for ${scored} user(s)`);
    }
  }
  return { newResults, scored, skipped: "" };
}

// server/mm-scheduler.ts
var STATE_FILE = path4.resolve(process.cwd(), "mm-email-state.json");
function loadState() {
  try {
    if (fs3.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs3.readFileSync(STATE_FILE, "utf-8"));
      saved.pre_lock.mar19_last_chance ??= false;
      saved.pre_lock.mar19_10am_leaderboard ??= false;
      saved.score_emails ??= {
        mar20_morning: false,
        mar21_morning: false,
        mar22_morning: false,
        mar23_morning: false,
        mar27_morning: false,
        mar28_morning: false,
        mar29_morning: false,
        mar30_morning: false,
        apr05_morning: false,
        apr07_morning: false
      };
      saved.score_emails.mar27_morning ??= false;
      saved.score_emails.apr07_morning ??= false;
      saved.second_shot ??= { mar21: false };
      saved.quick_pick_reminders ??= {
        s16_mar25: false,
        s16_mar27_last_chance: false,
        e8_mar27: false,
        e8_mar28_last_chance: false,
        ff_apr03: false,
        ff_apr04_last_chance: false,
        champ_apr05: false,
        champ_apr06_last_chance: false
      };
      saved.scores_last_checked_ms ??= 0;
      return saved;
    }
  } catch {
  }
  return {
    pre_lock: {
      mar17: false,
      mar18: false,
      mar19: false,
      mar19_last_chance: false,
      mar19_10am_leaderboard: false
    },
    score_emails: {
      mar20_morning: false,
      mar21_morning: false,
      mar22_morning: false,
      mar23_morning: false,
      mar27_morning: false,
      mar28_morning: false,
      mar29_morning: false,
      mar30_morning: false,
      apr05_morning: false,
      apr07_morning: false
    },
    second_shot: {
      mar21: false
    },
    quick_pick_reminders: {
      s16_mar25: false,
      s16_mar27_last_chance: false,
      e8_mar27: false,
      e8_mar28_last_chance: false,
      ff_apr03: false,
      ff_apr04_last_chance: false,
      champ_apr05: false,
      champ_apr06_last_chance: false
    },
    scores_last_checked_ms: 0
  };
}
function saveState(state) {
  try {
    fs3.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("[mm-scheduler] Failed to save state:", e);
  }
}
function getSupabase6() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient8(url, key);
}
async function sendReminderBlast(label) {
  console.log(`[mm-scheduler] Firing pre-lock reminder blast: ${label}`);
  try {
    const supabase = getSupabase6();
    const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
    const { data: takes } = await supabase.from("mm_locked_takes").select("user_id").eq("is_submitted", true);
    const usersWithTakes = new Set(
      (takes ?? []).map((t) => t.user_id)
    );
    const eligible2 = (allProfiles ?? []).filter(
      (p) => !usersWithTakes.has(p.id) && p.notification_email && !p.email_unsubscribed
    );
    let sent = 0;
    for (const profile of eligible2) {
      try {
        await sendMMReminderEmail({
          to: profile.notification_email,
          displayName: profile.display_name || `@${profile.username}`,
          userId: profile.id
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
async function sendLastChanceBlastAll(label) {
  console.log(`[mm-scheduler] Firing last-chance leaderboard blast: ${label}`);
  try {
    const supabase = getSupabase6();
    const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
    const eligible2 = (allProfiles ?? []).filter(
      (p) => p.notification_email && !p.email_unsubscribed
    );
    let sent = 0;
    for (const profile of eligible2) {
      try {
        await sendLastChanceBlast({ to: profile.notification_email, userId: profile.id });
        sent++;
      } catch (e) {
        console.error("[mm-scheduler] Last-chance blast failed for", profile.id, e);
      }
    }
    console.log(`[mm-scheduler] ${label}: sent to ${sent} user(s)`);
  } catch (e) {
    console.error(`[mm-scheduler] Last-chance blast error:`, e);
  }
}
async function sendLeaderboardReminderBlastAll(label) {
  console.log(`[mm-scheduler] Firing leaderboard reminder blast: ${label}`);
  try {
    const supabase = getSupabase6();
    const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
    const eligible2 = (allProfiles ?? []).filter(
      (p) => p.notification_email && !p.email_unsubscribed
    );
    let sent = 0;
    for (const profile of eligible2) {
      try {
        await sendLeaderboardReminderBlast({ to: profile.notification_email, userId: profile.id });
        sent++;
      } catch (e) {
        console.error("[mm-scheduler] Leaderboard reminder failed for", profile.id, e);
      }
    }
    console.log(`[mm-scheduler] ${label}: sent to ${sent} user(s)`);
  } catch (e) {
    console.error(`[mm-scheduler] Leaderboard reminder blast error:`, e);
  }
}
async function sendMorningScoreBlast(label) {
  console.log(`[mm-scheduler] Firing morning score update blast: ${label}`);
  try {
    const supabase = getSupabase6();
    await sendScoreUpdateBlast(supabase);
    console.log(`[mm-scheduler] ${label}: morning score blast complete`);
  } catch (e) {
    console.error(`[mm-scheduler] Morning score blast error for ${label}:`, e);
  }
}
async function sendSecondShotBlast(label) {
  console.log(`[mm-scheduler] Firing second-shot blast: ${label}`);
  try {
    const supabase = getSupabase6();
    const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
    const { data: takes } = await supabase.from("mm_locked_takes").select("user_id").eq("is_submitted", true);
    const usersWithTakes = new Set(
      (takes ?? []).map((t) => t.user_id)
    );
    const eligible2 = (allProfiles ?? []).filter(
      (p) => !usersWithTakes.has(p.id) && p.notification_email && !p.email_unsubscribed
    );
    let sent = 0;
    for (const profile of eligible2) {
      try {
        await sendSecondShotEmail({
          to: profile.notification_email,
          displayName: profile.display_name || `@${profile.username}`,
          userId: profile.id
        });
        sent++;
      } catch (e) {
        console.error("[mm-scheduler] Second-shot email failed for", profile.id, e);
      }
    }
    console.log(`[mm-scheduler] ${label}: sent to ${sent} user(s)`);
  } catch (e) {
    console.error(`[mm-scheduler] Second-shot blast error:`, e);
  }
}
async function sendQuickPickReminderBlast(label, roundLabel, lockDateLabel, isLastChance) {
  console.log(`[mm-scheduler] Firing quick pick reminder blast: ${label}`);
  try {
    const supabase = getSupabase6();
    const { data: allProfiles } = await supabase.rpc("get_all_notification_profiles");
    const eligible2 = (allProfiles ?? []).filter(
      (p) => p.notification_email && !p.email_unsubscribed
    );
    let sent = 0;
    for (const profile of eligible2) {
      try {
        await sendQuickPickReminderEmail({
          to: profile.notification_email,
          displayName: profile.display_name || `@${profile.username}`,
          roundLabel,
          lockDateLabel,
          isLastChance,
          userId: profile.id
        });
        sent++;
      } catch (e) {
        console.error("[mm-scheduler] Quick pick reminder failed for", profile.id, e);
      }
    }
    console.log(`[mm-scheduler] ${label}: sent to ${sent} user(s)`);
  } catch (e) {
    console.error(`[mm-scheduler] Quick pick reminder blast error:`, e);
  }
}
var PRE_LOCK_WINDOWS = [
  {
    key: "mar17",
    label: "Mar 17 \u2014 2 days to go",
    targetMs: (/* @__PURE__ */ new Date("2026-03-17T09:00:00-05:00")).getTime(),
    type: "reminder"
  },
  {
    key: "mar18",
    label: "Mar 18 \u2014 24 hours left",
    targetMs: (/* @__PURE__ */ new Date("2026-03-18T09:00:00-05:00")).getTime(),
    type: "reminder"
  },
  {
    key: "mar19",
    label: "Mar 19 \u2014 3 hours to lock (reminder)",
    targetMs: (/* @__PURE__ */ new Date("2026-03-19T08:00:00-05:00")).getTime(),
    type: "reminder"
  },
  {
    key: "mar19_last_chance",
    label: "Mar 19 \u2014 2 hours to lock (last-chance blast)",
    targetMs: (/* @__PURE__ */ new Date("2026-03-19T09:00:00-05:00")).getTime(),
    type: "last_chance"
  },
  {
    key: "mar19_10am_leaderboard",
    label: "Mar 19 \u2014 10am (leaderboard reminder \u2014 all users)",
    targetMs: (/* @__PURE__ */ new Date("2026-03-19T10:00:00-05:00")).getTime(),
    type: "leaderboard_reminder"
  }
];
var MORNING_EMAIL_WINDOWS = [
  { key: "mar20_morning", label: "Mar 20 \u2014 morning scores (after R64 Day 1)", targetMs: (/* @__PURE__ */ new Date("2026-03-20T13:00:00Z")).getTime() },
  { key: "mar21_morning", label: "Mar 21 \u2014 morning scores (after R64 Day 2)", targetMs: (/* @__PURE__ */ new Date("2026-03-21T13:00:00Z")).getTime() },
  { key: "mar22_morning", label: "Mar 22 \u2014 morning scores (after R32 Day 1)", targetMs: (/* @__PURE__ */ new Date("2026-03-22T13:00:00Z")).getTime() },
  { key: "mar23_morning", label: "Mar 23 \u2014 R32 wrapup + Sweet 16 push (after R32 Day 2)", targetMs: (/* @__PURE__ */ new Date("2026-03-23T13:00:00Z")).getTime(), blastType: "r32wrapup" },
  { key: "mar27_morning", label: "Mar 27 \u2014 morning scores (after S16 Day 1)", targetMs: (/* @__PURE__ */ new Date("2026-03-27T13:00:00Z")).getTime() },
  { key: "mar28_morning", label: "Mar 28 \u2014 morning scores (after S16 Day 2)", targetMs: (/* @__PURE__ */ new Date("2026-03-28T13:00:00Z")).getTime() },
  { key: "mar29_morning", label: "Mar 29 \u2014 morning scores (after E8 Day 1)", targetMs: (/* @__PURE__ */ new Date("2026-03-29T13:00:00Z")).getTime() },
  { key: "mar30_morning", label: "Mar 30 \u2014 morning scores (after E8 Day 2)", targetMs: (/* @__PURE__ */ new Date("2026-03-30T13:00:00Z")).getTime() },
  { key: "apr05_morning", label: "Apr 5  \u2014 morning scores (after Final Four)", targetMs: (/* @__PURE__ */ new Date("2026-04-05T13:00:00Z")).getTime() },
  { key: "apr07_morning", label: "Apr 7  \u2014 morning scores (after Championship)", targetMs: (/* @__PURE__ */ new Date("2026-04-07T13:00:00Z")).getTime() }
];
var SECOND_SHOT_TARGET_MS = (/* @__PURE__ */ new Date("2026-03-21T09:30:00-05:00")).getTime();
var QUICK_PICK_WINDOWS = [
  // Sweet 16 — games Mar 26-27, picks lock Mar 27 noon CDT
  {
    key: "s16_mar25",
    label: "Mar 25 \u2014 Sweet 16 picks open reminder",
    roundLabel: "Sweet 16",
    lockDateLabel: "noon CDT on Friday Mar 27",
    targetMs: (/* @__PURE__ */ new Date("2026-03-25T09:00:00-05:00")).getTime(),
    isLastChance: false
  },
  {
    key: "s16_mar27_last_chance",
    label: "Mar 27 \u2014 Sweet 16 picks last chance",
    roundLabel: "Sweet 16",
    lockDateLabel: "noon CDT today",
    targetMs: (/* @__PURE__ */ new Date("2026-03-27T08:00:00-05:00")).getTime(),
    isLastChance: true
  },
  // Elite 8 — games Mar 28-29, picks lock Mar 28 noon CDT
  {
    key: "e8_mar27",
    label: "Mar 27 \u2014 Elite 8 picks open reminder",
    roundLabel: "Elite 8",
    lockDateLabel: "noon CDT on Saturday Mar 28",
    targetMs: (/* @__PURE__ */ new Date("2026-03-27T14:00:00-05:00")).getTime(),
    isLastChance: false
  },
  {
    key: "e8_mar28_last_chance",
    label: "Mar 28 \u2014 Elite 8 picks last chance",
    roundLabel: "Elite 8",
    lockDateLabel: "noon CDT today",
    targetMs: (/* @__PURE__ */ new Date("2026-03-28T09:00:00-05:00")).getTime(),
    isLastChance: true
  },
  // Final Four — games Apr 4, picks lock Apr 4 6pm CDT
  {
    key: "ff_apr03",
    label: "Apr 3 \u2014 Final Four picks open reminder",
    roundLabel: "Final Four",
    lockDateLabel: "6pm CDT on Saturday Apr 4",
    targetMs: (/* @__PURE__ */ new Date("2026-04-03T09:00:00-05:00")).getTime(),
    isLastChance: false
  },
  {
    key: "ff_apr04_last_chance",
    label: "Apr 4 \u2014 Final Four picks last chance",
    roundLabel: "Final Four",
    lockDateLabel: "6pm CDT today",
    targetMs: (/* @__PURE__ */ new Date("2026-04-04T14:00:00-05:00")).getTime(),
    isLastChance: true
  },
  // Championship — game Apr 6, picks lock Apr 6 8pm CDT
  {
    key: "champ_apr05",
    label: "Apr 5 \u2014 Championship picks open reminder",
    roundLabel: "Championship",
    lockDateLabel: "8pm CDT on Monday Apr 6",
    targetMs: (/* @__PURE__ */ new Date("2026-04-05T09:00:00-05:00")).getTime(),
    isLastChance: false
  },
  {
    key: "champ_apr06_last_chance",
    label: "Apr 6 \u2014 Championship picks last chance",
    roundLabel: "Championship",
    lockDateLabel: "8pm CDT tonight",
    targetMs: (/* @__PURE__ */ new Date("2026-04-06T16:00:00-05:00")).getTime(),
    isLastChance: true
  }
];
var FIRE_WINDOW_MS = 30 * 60 * 1e3;
var POLL_INTERVAL_MS = 20 * 60 * 1e3;
async function tick() {
  const state = loadState();
  const now = Date.now();
  for (const w of PRE_LOCK_WINDOWS) {
    if (state.pre_lock[w.key]) continue;
    const elapsed = now - w.targetMs;
    if (elapsed >= 0 && elapsed < FIRE_WINDOW_MS) {
      if (BLAST_EMAILS_PAUSED) {
        console.log(`[mm-scheduler] Blast emails paused \u2014 skipping pre-lock blast: ${w.label}`);
      } else if (w.type === "last_chance") {
        await sendLastChanceBlastAll(w.label);
        state.pre_lock[w.key] = true;
        saveState(state);
      } else if (w.type === "leaderboard_reminder") {
        await sendLeaderboardReminderBlastAll(w.label);
        state.pre_lock[w.key] = true;
        saveState(state);
      } else {
        await sendReminderBlast(w.label);
        state.pre_lock[w.key] = true;
        saveState(state);
      }
    }
  }
  for (const w of MORNING_EMAIL_WINDOWS) {
    if (state.score_emails[w.key]) continue;
    const elapsed = now - w.targetMs;
    if (elapsed >= 0 && elapsed < FIRE_WINDOW_MS) {
      if (SCORE_EMAILS_PAUSED) {
        console.log(`[mm-scheduler] Score emails paused \u2014 skipping morning blast: ${w.label}`);
      } else if (w.blastType === "r32wrapup") {
        console.log(`[mm-scheduler] Firing R32 wrapup blast: ${w.label}`);
        const supabase = createClient8(
          process.env.EXPO_PUBLIC_SUPABASE_URL,
          process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
        );
        await sendR32WrapupBlast(supabase).catch(
          (e) => console.error("[mm-scheduler] R32 wrapup blast error:", e)
        );
        state.score_emails[w.key] = true;
        saveState(state);
      } else {
        await sendMorningScoreBlast(w.label);
        state.score_emails[w.key] = true;
        saveState(state);
      }
    }
  }
  if (!state.second_shot.mar21) {
    const elapsed = now - SECOND_SHOT_TARGET_MS;
    if (elapsed >= 0 && elapsed < FIRE_WINDOW_MS) {
      if (BLAST_EMAILS_PAUSED) {
        console.log("[mm-scheduler] Blast emails paused \u2014 skipping second-shot blast");
      } else {
        await sendSecondShotBlast("Mar 21 9am CDT \u2014 second shot email");
        state.second_shot.mar21 = true;
        saveState(state);
      }
    }
  }
  for (const w of QUICK_PICK_WINDOWS) {
    if (state.quick_pick_reminders[w.key]) continue;
    const elapsed = now - w.targetMs;
    if (elapsed >= 0 && elapsed < FIRE_WINDOW_MS) {
      if (BLAST_EMAILS_PAUSED) {
        console.log(`[mm-scheduler] Blast emails paused \u2014 skipping quick pick reminder: ${w.label}`);
      } else {
        await sendQuickPickReminderBlast(w.label, w.roundLabel, w.lockDateLabel, w.isLastChance);
        state.quick_pick_reminders[w.key] = true;
        saveState(state);
      }
    }
  }
  const activeWindow = getActiveGameWindow();
  if (activeWindow) {
    const msSinceLastCheck = now - (state.scores_last_checked_ms ?? 0);
    if (msSinceLastCheck >= POLL_INTERVAL_MS) {
      console.log(`[mm-scheduler] Polling scores for ${activeWindow.roundId}...`);
      state.scores_last_checked_ms = now;
      saveState(state);
      try {
        const result = await checkAndAutoScore();
        if (result.skipped) {
          console.log(`[mm-scheduler] Auto-score skipped: ${result.skipped}`);
        } else {
          console.log(`[mm-scheduler] Auto-score: ${result.newResults} new result(s), ${result.scored} user(s) updated`);
        }
      } catch (e) {
        console.error("[mm-scheduler] Auto-score error:", e);
      }
    }
  }
}
function startMMScheduler() {
  console.log("[mm-scheduler] Starting scheduler (pre-lock emails + auto-scoring + morning blasts)");
  tick().catch((e) => console.error("[mm-scheduler] tick error:", e));
  setInterval(() => {
    tick().catch((e) => console.error("[mm-scheduler] tick error:", e));
  }, 15 * 60 * 1e3);
}

// server/routes-unsubscribe.ts
init_email();
import { createClient as createClient9 } from "@supabase/supabase-js";
function getSupabase7() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient9(url, key);
}
var CONFIRMED_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Unsubscribed \u2014 Swayger</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0F0F14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #1C1C26; border-radius: 16px; padding: 40px 32px; max-width: 420px; width: 100%; text-align: center; }
    .icon { font-size: 40px; margin-bottom: 16px; }
    h1 { color: #FFFFFF; font-size: 22px; font-weight: 700; margin-bottom: 10px; }
    p { color: #8B95A5; font-size: 15px; line-height: 1.6; margin-bottom: 12px; }
    .note { font-size: 13px; color: #4A4A5A; }
    .brand { margin-top: 32px; font-size: 13px; font-weight: 800; color: #6C63FF; letter-spacing: 1px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">\u2705</div>
    <h1>You're unsubscribed</h1>
    <p>You won't receive any more bulk emails from Swayger.</p>
    <p class="note">Wager notifications (someone challenging you, accepting your Swayger, etc.) are still active \u2014 those are tied to your account activity.</p>
    <p class="note" style="margin-top:8px;">If this was a mistake, reply to any Swayger email or reach out through the app.</p>
    <div class="brand">SWAYGER</div>
  </div>
</body>
</html>`;
var ERROR_HTML = (msg) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Error \u2014 Swayger</title>
  <style>
    body { background:#0F0F14; font-family:sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .card { background:#1C1C26; border-radius:16px; padding:32px; max-width:380px; text-align:center; }
    h1 { color:#FFFFFF; font-size:20px; margin-bottom:10px; }
    p { color:#8B95A5; font-size:14px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Something went wrong</h1>
    <p>${msg}</p>
  </div>
</body>
</html>`;
function registerUnsubscribeRoutes(app2) {
  app2.get("/unsubscribe", async (req, res2) => {
    const uid = req.query.uid?.trim();
    const sig = req.query.sig?.trim();
    if (!uid || !sig) {
      res2.setHeader("Content-Type", "text/html; charset=utf-8");
      res2.status(400).send(ERROR_HTML("Invalid unsubscribe link \u2014 missing parameters."));
      return;
    }
    if (!verifyUnsubscribeToken(uid, sig)) {
      res2.setHeader("Content-Type", "text/html; charset=utf-8");
      res2.status(403).send(ERROR_HTML("Invalid or expired unsubscribe link."));
      return;
    }
    try {
      const supabase = getSupabase7();
      const { error } = await supabase.from("profiles").update({ email_unsubscribed: true }).eq("id", uid);
      if (error) {
        console.error("[unsubscribe] Supabase error:", error.message);
        res2.setHeader("Content-Type", "text/html; charset=utf-8");
        res2.status(500).send(ERROR_HTML("Could not process your request. Please try again."));
        return;
      }
      console.log(`[unsubscribe] User ${uid} unsubscribed from blast emails`);
      res2.setHeader("Content-Type", "text/html; charset=utf-8");
      res2.status(200).send(CONFIRMED_HTML);
    } catch (err) {
      console.error("[unsubscribe] Error:", err);
      res2.setHeader("Content-Type", "text/html; charset=utf-8");
      res2.status(500).send(ERROR_HTML("Server error. Please try again later."));
    }
  });
}

// server/index.ts
init_email();
import * as fs4 from "fs";
import * as path5 from "path";
import { createClient as createClient10 } from "@supabase/supabase-js";

// server/gameday-short-link.ts
function registerGamedayShortLink(app2) {
  app2.get("/g/:roomCode", async (req, res2) => {
    const code = (req.params.roomCode ?? "").toUpperCase().trim();
    if (!code) {
      res2.status(400).send("Missing room code");
      return;
    }
    const supabase = getServiceSupabase();
    const { data: room } = await supabase.from("gameday_rooms").select("id").eq("room_code", code).maybeSingle();
    if (!room) {
      res2.status(404).send("Room not found");
      return;
    }
    res2.redirect(302, `/gameday/${room.id}`);
  });
}

// server/index.ts
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res2, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    origins.add("https://swayger.app");
    origins.add("https://www.swayger.app");
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res2.header("Access-Control-Allow-Origin", origin);
      res2.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
      );
      res2.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Guest-Session, X-Discord-Guild-ID, x-api-key, x-admin-token, X-Fantasy-Guest-Token, Idempotency-Key"
      );
      res2.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res2.sendStatus(200);
    }
    next();
  });
}
function setupWwwRedirect(app2) {
  app2.use((req, res2, next) => {
    const host = req.headers.host || "";
    if (host === "swayger.app" || host === "swayger.app:443") {
      return res2.redirect(301, `https://www.swayger.app${req.originalUrl}`);
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
  app2.use((req, res2, next) => {
    const start = Date.now();
    const path6 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res2.json;
    res2.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res2, [bodyJson, ...args]);
    };
    res2.on("finish", () => {
      if (!path6.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path6} ${res2.statusCode} in ${duration}ms`;
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
var SEO_SNIPPET = `
  <meta name="robots" content="index, follow" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Swayger" />
  <meta property="og:title" content="Swayger \u2014 Picks, Challenges &amp; Receipts" />
  <meta property="og:description" content="Make picks, challenge friends, track the leaderboard, and keep receipts." />
  <meta property="og:image" content="https://www.swayger.app/assets/og-preview.jpg" />
  <meta property="og:image:width" content="1280" />
  <meta property="og:image:height" content="720" />
  <meta property="og:url" content="https://www.swayger.app" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Swayger \u2014 Picks, Challenges &amp; Receipts" />
  <meta name="twitter:description" content="Make picks, challenge friends, track the leaderboard, and keep receipts." />
  <meta name="twitter:image" content="https://www.swayger.app/assets/og-preview.jpg" />`;
function injectSeoTags(html) {
  if (html.includes("og:title")) return html;
  let result = html;
  result = result.replace(/<title>Swayger<\/title>/, "<title>Swayger \u2014 Picks, Challenges &amp; Receipts</title>");
  result = result.replace("</head>", `${SEO_SNIPPET}
</head>`);
  return result;
}
var ONESIGNAL_SNIPPET = `
  <script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
  <script>
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(async function(OneSignal) {
      // Unregister any stale service workers that could block OneSignal's own registration
      if (navigator.serviceWorker) {
        try {
          var regs = await navigator.serviceWorker.getRegistrations();
          for (var reg of regs) { await reg.unregister(); }
        } catch (_) {}
      }

      try {
        await OneSignal.init({
          appId: "6c7fe969-e694-4977-819a-f10fbc4159c6",
          notifyButton: { enable: false },
          allowLocalhostAsSecureOrigin: true,
        });
      } catch (_) { return; }

      var storedId       = localStorage.getItem("swayger_uid");
      var storedEmail    = localStorage.getItem("swayger_email");
      var storedUsername = localStorage.getItem("swayger_username");

      async function swaygerSubscribe(userId, username, email) {
        if (!userId) return;
        try {
          if (navigator.serviceWorker) { await navigator.serviceWorker.ready; }
          // Cycle opt-out \u2192 opt-in to clear any stale opted-out state in OneSignal
          try { await OneSignal.User.PushSubscription.optOut(); } catch (_) {}
          await new Promise(function(r) { setTimeout(r, 300); });
          await OneSignal.User.PushSubscription.optIn();
          await OneSignal.login(userId);
          // Tag user so Swayger username + email are visible in OneSignal dashboard
          var tags = {};
          if (username) tags.username = username;
          if (email)    tags.email    = email;
          if (Object.keys(tags).length) {
            try { OneSignal.User.addTags(tags); } catch (_) {}
          }
        } catch (_) {}
      }

      if (storedId && window.Notification && window.Notification.permission === "granted") {
        swaygerSubscribe(storedId, storedUsername, storedEmail);
      }

      window.addEventListener("swayger:session", function(e) {
        if (window.Notification && window.Notification.permission === "granted") {
          var d = e.detail || {};
          swaygerSubscribe(d.userId, d.username, d.email);
        }
      });

      window.addEventListener("swayger:permission", function(e) {
        var d = e.detail || {};
        swaygerSubscribe(d.userId, d.username, d.email);
      });
    });
  </script>`;
function injectOneSignal(html) {
  if (html.includes("OneSignalSDK")) return html;
  return html.replace("</head>", `${ONESIGNAL_SNIPPET}
</head>`);
}
function getAppName() {
  try {
    const appJsonPath = path5.resolve(process.cwd(), "app.json");
    const appJsonContent = fs4.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res2) {
  const manifestPath = path5.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs4.existsSync(manifestPath)) {
    return res2.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res2.setHeader("expo-protocol-version", "1");
  res2.setHeader("expo-sfv-version", "0");
  res2.setHeader("content-type", "application/json");
  const manifest = fs4.readFileSync(manifestPath, "utf-8");
  res2.send(manifest);
}
function serveLandingPage({
  req,
  res: res2,
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
  res2.setHeader("Content-Type", "text/html; charset=utf-8");
  res2.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path5.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs4.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  const privacyPolicyPath = path5.resolve(process.cwd(), "server", "templates", "privacy-policy.html");
  const privacyPolicyHtml = fs4.readFileSync(privacyPolicyPath, "utf-8");
  app2.get("/privacy", (_req, res2) => {
    res2.setHeader("Content-Type", "text/html; charset=utf-8");
    res2.status(200).send(privacyPolicyHtml);
  });
  app2.get("/robots.txt", (_req, res2) => {
    res2.setHeader("Content-Type", "text/plain");
    res2.send("User-agent: *\nAllow: /\nSitemap: https://www.swayger.app/sitemap.xml\n");
  });
  app2.get("/OneSignalSDKWorker.js", (_req, res2) => {
    res2.setHeader("Content-Type", "application/javascript");
    res2.setHeader("Service-Worker-Allowed", "/");
    res2.send(`importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");`);
  });
  registerGamedayShortLink(app2);
  registerUnsubscribeRoutes(app2);
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res2, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res2);
    }
    if (req.path === "/") {
      const webIndexPath = path5.resolve(process.cwd(), "dist", "index.html");
      if (fs4.existsSync(webIndexPath)) {
        let html = fs4.readFileSync(webIndexPath, "utf-8");
        html = injectSeoTags(html);
        html = injectOneSignal(html);
        const privacyFooter = `<footer style="position:fixed;bottom:0;width:100%;text-align:center;padding:8px;font-family:sans-serif;font-size:12px;color:#64748b;background:#0B1120;z-index:0;"><a href="/privacy" style="color:#1DA1F2;text-decoration:none;">Privacy Policy</a></footer>`;
        html = html.replace("</body>", `${privacyFooter}</body>`);
        res2.setHeader("Content-Type", "text/html");
        return res2.send(html);
      }
      return serveLandingPage({
        req,
        res: res2,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path5.resolve(process.cwd(), "assets")));
  app2.use(express.static(path5.resolve(process.cwd(), "dist")));
  app2.use(express.static(path5.resolve(process.cwd(), "static-build")));
  const SERVER_PATHS = ["/api", "/assets", "/admin", "/feedback", "/outreach-feedback", "/unsubscribe", "/promo", "/how-it-works", "/privacy"];
  app2.use((req, res2, next) => {
    if (SERVER_PATHS.some((p) => req.path.startsWith(p))) {
      return next();
    }
    const webIndexPath = path5.resolve(process.cwd(), "dist", "index.html");
    if (fs4.existsSync(webIndexPath)) {
      let html = fs4.readFileSync(webIndexPath, "utf-8");
      html = injectSeoTags(html);
      html = injectOneSignal(html);
      res2.setHeader("Content-Type", "text/html");
      return res2.send(html);
    }
    next();
  });
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res2, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res2.headersSent) {
      return next(err);
    }
    return res2.status(status).json({ message });
  });
}
async function runSettlementExpiry() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;
  try {
    let buildRecipients2 = function(sw, includeOpponent = true) {
      const recs = [];
      const cp = profileMap.get(sw.creator_id);
      if (cp?.notification_email) recs.push({ email: cp.notification_email, name: cp.display_name || cp.username });
      if (includeOpponent && sw.opponent_id) {
        const op = profileMap.get(sw.opponent_id);
        if (op?.notification_email) recs.push({ email: op.notification_email, name: op.display_name || op.username });
      }
      return recs;
    };
    var buildRecipients = buildRecipients2;
    const supabase = createClient10(supabaseUrl, supabaseKey);
    const now = /* @__PURE__ */ new Date();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1e3).toISOString();
    const { data: expiringInvites } = await supabase.from("swaygers").select("id, title, category, stake_units, creator_id, opponent_id").eq("status", "pending_invite").lt("expires_at", now.toISOString());
    const { data: expiringSettlements } = await supabase.from("swaygers").select("id, title, category, stake_units, creator_id, opponent_id").eq("status", "settlement_proposed").not("settlement_deadline", "is", null).lt("settlement_deadline", now.toISOString());
    const legacyCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1e3).toISOString();
    const { data: legacyExpiringSettlements } = await supabase.from("swaygers").select("id, title, category, stake_units, creator_id, opponent_id").eq("status", "settlement_proposed").is("settlement_deadline", null).lt("updated_at", legacyCutoff);
    const { data: inviteReminders } = await supabase.from("swaygers").select("id, title, category, stake_units, creator_id, opponent_id, expires_at").eq("status", "pending_invite").eq("invite_reminder_sent", false).gt("expires_at", now.toISOString()).lt("expires_at", twoDaysFromNow);
    const { data: settlementReminders } = await supabase.from("swaygers").select("id, title, category, stake_units, creator_id, opponent_id, settlement_deadline").eq("status", "settlement_proposed").eq("settlement_reminder_sent", false).not("settlement_deadline", "is", null).gt("settlement_deadline", now.toISOString()).lt("settlement_deadline", twoDaysFromNow);
    const { data, error } = await supabase.rpc("expire_old_proposals");
    if (error) {
      console.error("[expiry] expire_old_proposals error:", error.message);
      return;
    }
    const count = data;
    if (count > 0) {
      log(`[expiry] Expired ${count} swayger(s) (invites + settlements)`);
    }
    const allRows = [
      ...expiringInvites ?? [],
      ...expiringSettlements ?? [],
      ...legacyExpiringSettlements ?? [],
      ...inviteReminders ?? [],
      ...settlementReminders ?? []
    ];
    if (allRows.length === 0) return;
    const allUserIds = [...new Set(allRows.flatMap(
      (s) => [s.creator_id, s.opponent_id].filter(Boolean)
    ))];
    const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, notification_email").in("id", allUserIds);
    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.id, p])
    );
    for (const sw of expiringInvites ?? []) {
      const recipients = buildRecipients2(sw, false);
      if (!recipients.length) continue;
      await sendNotificationEmail({
        event: "invite_expired",
        swayger: { id: sw.id, title: sw.title, category: sw.category || "Other", stakeUnits: sw.stake_units || 1 },
        sender: { name: "Swayger" },
        recipients
      }).catch((e) => console.error(`[expiry] invite_expired email for ${sw.id}:`, e));
    }
    const settlingExpired = [
      ...expiringSettlements ?? [],
      ...legacyExpiringSettlements ?? []
    ];
    for (const sw of settlingExpired) {
      const recipients = buildRecipients2(sw, true);
      if (!recipients.length) continue;
      await sendNotificationEmail({
        event: "settlement_expired",
        swayger: { id: sw.id, title: sw.title, category: sw.category || "Other", stakeUnits: sw.stake_units || 1 },
        sender: { name: "Swayger" },
        recipients
      }).catch((e) => console.error(`[expiry] settlement_expired email for ${sw.id}:`, e));
    }
    for (const sw of inviteReminders ?? []) {
      const recipients = buildRecipients2(sw, false);
      if (recipients.length) {
        await sendNotificationEmail({
          event: "settlement_deadline_reminder",
          swayger: { id: sw.id, title: sw.title, category: sw.category || "Other", stakeUnits: sw.stake_units || 1 },
          sender: { name: "Swayger" },
          recipients
        }).catch((e) => console.error(`[expiry] invite reminder email for ${sw.id}:`, e));
      }
      await supabase.from("swaygers").update({ invite_reminder_sent: true }).eq("id", sw.id);
    }
    for (const sw of settlementReminders ?? []) {
      const recipients = buildRecipients2(sw, true);
      if (recipients.length) {
        await sendNotificationEmail({
          event: "settlement_deadline_reminder",
          swayger: { id: sw.id, title: sw.title, category: sw.category || "Other", stakeUnits: sw.stake_units || 1 },
          sender: { name: "Swayger" },
          recipients
        }).catch((e) => console.error(`[expiry] settlement reminder email for ${sw.id}:`, e));
      }
      await supabase.from("swaygers").update({ settlement_reminder_sent: true }).eq("id", sw.id);
    }
  } catch (err) {
    console.error("[expiry] Unexpected error:", err);
  }
}
(async () => {
  if (!isServiceSupabaseConfigured()) {
    console.error(
      "[startup] Supabase service-role configuration is missing; Game Day and Fantasy database routes will return 503 rather than use anon access."
    );
  }
  setupWwwRedirect(app);
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
