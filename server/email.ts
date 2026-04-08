import { Resend } from "resend";
import { createHmac } from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM =
  process.env.RESEND_FROM_EMAIL || "Swayger <onboarding@resend.dev>";
const APP_URL =
  process.env.EXPO_PUBLIC_APP_URL || "https://swayger-app.replit.app";

// ─── Unsubscribe helpers ──────────────────────────────────────────────────────

const UNSUB_SECRET = `swayger-unsub-v1-${process.env.RESEND_API_KEY ?? "dev"}`;

export function generateUnsubscribeUrl(userId: string): string {
  const sig = createHmac("sha256", UNSUB_SECRET).update(userId).digest("hex").slice(0, 32);
  return `${APP_URL}/unsubscribe?uid=${encodeURIComponent(userId)}&sig=${sig}`;
}

export function verifyUnsubscribeToken(userId: string, sig: string): boolean {
  const expected = createHmac("sha256", UNSUB_SECRET).update(userId).digest("hex").slice(0, 32);
  return sig === expected;
}

function addUnsubFooter(html: string, unsubscribeUrl: string): string {
  const footer =
    `<div style="text-align:center;padding:10px 20px 20px;font-size:11px;color:#3A3A4A;">` +
    `You're receiving this because you have a Swayger account. &middot; ` +
    `<a href="${unsubscribeUrl}" style="color:#4A4A5A;text-decoration:underline;">Unsubscribe</a>` +
    `</div>`;
  return html.replace("</body>", `${footer}\n</body>`);
}

export type EmailEvent =
  | "invite_created"
  | "swayger_accepted"
  | "settlement_proposed"
  | "swayger_settled"
  | "swayger_expired"
  | "invite_expired"
  | "settlement_expired"
  | "settlement_deadline_reminder";

export interface NotifyPayload {
  event: EmailEvent;
  swayger: {
    id: string;
    title: string;
    category: string;
    stakeUnits: number;
    stakeNote?: string | null;
  };
  sender: { name: string };
  recipients: { email: string; name: string }[];
  outcome?: string;
  winnerName?: string;
}

function outcomeLabel(outcome: string): string {
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

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
      <span style="font-size:13px;color:#8B95A5;">${label}</span>
      <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${value}</span>
    </td>
  </tr>`;
}

function swaygerDetailsHtml(p: NotifyPayload): string {
  const stakePoints = `${p.swayger.stakeUnits} Swayger Points`;
  const stakeNote = p.swayger.stakeNote?.trim();
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#13131D;border-radius:10px;padding:4px 16px;margin-bottom:8px;">
    ${detailRow("Wager", p.swayger.title)}
    ${detailRow("Category", p.swayger.category)}
    ${detailRow("Points", stakePoints)}
    ${stakeNote ? detailRow("The Real Bet", stakeNote) : ""}
  </table>`;
}

function buildEmailHtml(
  pageTitle: string,
  headline: string,
  bodyHtml: string,
  ctaLabel: string,
  ctaUrl: string
): string {
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

export async function sendNotificationEmail(
  payload: NotifyPayload
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping");
    return;
  }

  const swaygerUrl = `${APP_URL}/swayger/${payload.swayger.id}`;
  const sender = payload.sender.name;
  const title = payload.swayger.title;
  const details = swaygerDetailsHtml(payload);

  let subject: string;
  let headline: string;
  let body: string;
  let ctaLabel: string;

  switch (payload.event) {
    case "invite_created":
      subject = `🎯 ${sender} challenged you to a Swayger`;
      headline = `${sender} just sent you a challenge.`;
      body = details;
      ctaLabel = "View Challenge";
      break;

    case "swayger_accepted":
      subject = `✅ ${sender} accepted your Swayger`;
      headline = `${sender} is in. The game is on.`;
      body = details;
      ctaLabel = "View Swayger";
      break;

    case "settlement_proposed": {
      subject = `⚖️ ${sender} proposed a settlement`;
      headline = `${sender} wants to settle "${title}"`;
      const proposedLabel = (() => {
        if (payload.outcome === "draw") return "It's a draw";
        if (payload.outcome === "no_contest") return "No contest";
        if (payload.winnerName) return `${payload.winnerName} wins`;
        return payload.outcome ? outcomeLabel(payload.outcome) : "—";
      })();
      body =
        details +
        `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">Proposed outcome: <strong style="color:#FFFFFF;">${proposedLabel}</strong></p>`;
      ctaLabel = "Review & Confirm";
      break;
    }

    case "swayger_settled": {
      const winnerLabel = (() => {
        if (payload.outcome === "draw") return "It's a draw";
        if (payload.outcome === "no_contest") return "No contest";
        if (payload.winnerName) return `🏆 ${payload.winnerName} wins`;
        return payload.outcome ? outcomeLabel(payload.outcome) : "—";
      })();
      subject = payload.winnerName
        ? `🏆 ${payload.winnerName} wins "${title}"`
        : `🏆 "${title}" has been settled`;
      headline = winnerLabel;
      body =
        details +
        `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">The Swayger is officially closed. Open the app to see the full breakdown.</p>`;
      ctaLabel = "See Results";
      break;
    }

    case "swayger_expired": {
      subject = `⏱️ "${title}" expired — stakes returned`;
      headline = `"${title}" expired without a verdict.`;
      body =
        details +
        `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">Neither party reached agreement. Your staked Swayger Points have been returned.</p>`;
      ctaLabel = "View Swayger";
      break;
    }

    case "invite_expired": {
      subject = `⏰ Your Swayger invite expired`;
      headline = `"${title}" — invite expired.`;
      body =
        details +
        `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">The invite link expired after 14 days without a response. Your staked Swayger Points have been returned.</p>`;
      ctaLabel = "Create a New Swayger";
      break;
    }

    case "settlement_expired": {
      subject = `⏱️ "${title}" settlement window closed`;
      headline = `Settlement deadline passed on "${title}".`;
      body =
        details +
        `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">The 14-day settlement window closed without mutual agreement. Staked Swayger Points have been returned to both sides.</p>`;
      ctaLabel = "View Swayger";
      break;
    }

    case "settlement_deadline_reminder": {
      subject = `⏳ 2 days left to settle "${title}"`;
      headline = `Settlement deadline is in 2 days.`;
      body =
        details +
        `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">You have 2 days left to agree on an outcome. Once the deadline passes, Swayger Points will be returned to both sides. Open the app to propose or confirm a settlement.</p>`;
      ctaLabel = "Settle Now";
      break;
    }
  }

  const results = await Promise.allSettled(
    payload.recipients.map((r) =>
      resend.emails.send({
        from: FROM,
        to: r.email,
        subject,
        html: buildEmailHtml(subject, headline, body, ctaLabel, swaygerUrl),
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


// ─── March Madness emails ─────────────────────────────────────────────────────

export async function sendMMScoreUpdateEmail({
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
  totalPlayers,
}: {
  to: string;
  displayName: string;
  totalPoints: number;
  sweetSixteenPts: number;
  eliteEightPts: number;
  finalFourPts: number;
  championPts: number;
  upsetPts: number;
  correctUpsets: number;
  blowoutPts: number;
  correctBlowouts: number;
  highScorerPts: number;
  correctHighScorers: number;
  rank: number;
  totalPlayers: number;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  const subject = `🏀 March Madness score update — ${totalPoints} pts`;
  const headline = `Here's where you stand`;
  const rankLabel =
    rank === 1
      ? "🥇 You're in first place!"
      : rank <= 3
      ? `🔥 You're #${rank} out of ${totalPlayers}`
      : `#${rank} out of ${totalPlayers} players`;
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
      `${APP_URL}/march-madness/picks-leaderboard`,
    ),
  });
}

export async function sendMMReminderEmail({
  to,
  displayName,
  userId,
}: {
  to: string;
  displayName: string;
  userId?: string;
}): Promise<void> {
  const subject = "🏀 Your March Madness Picks Aren't Locked Yet";
  const headline = "Lock In Your Picks Before Tip-Off";
  const body = `
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      Hey ${displayName},
    </p>
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      The tournament tips off soon and you haven't locked in your March Madness picks yet.
      Pick your <strong style="color:#FFFFFF;">Champion, Final Four, Elite Eight, and Sweet Sixteen</strong> — plus up to 3 upset picks for the Round of 64.
    </p>
    <p style="margin:0;color:#8B95A5;font-size:14px;">
      Picks lock at 11am CDT on March 19. Once it's locked, it's locked.
    </p>
  `;
  let html = buildEmailHtml(subject, headline, body, "Lock My Picks", `${APP_URL}/march-madness/picks`);
  if (userId) html = addUnsubFooter(html, generateUnsubscribeUrl(userId));
  await resend.emails.send({ from: FROM, to, subject, html });
}

// ─── Leaderboard Blast ────────────────────────────────────────────────────────

export function buildLeaderboardBlastHtml(): string {
  const subject = "🏀 Race Up the Leaderboard — Win a $100 Amazon Gift Card";
  const picksUrl = `${APP_URL}/march-madness/picks`;

  const body = `
    <div style="background:linear-gradient(135deg,#1a1200 0%,#2a1f00 100%);border:1px solid rgba(245,166,35,0.35);border-radius:12px;padding:18px 20px;margin-bottom:22px;text-align:center;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#F5A623;text-transform:uppercase;">🏆 March Madness Prize</p>
      <p style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.2;">$100 Amazon Gift Card</p>
      <p style="margin:6px 0 0;font-size:13px;color:#C8A84B;">#1 on the leaderboard at the end of the tournament wins.</p>
    </div>

    <p style="margin:0 0 6px;font-size:14px;color:#8B95A5;">Here's the thing most people don't know:</p>
    <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#FFFFFF;">You don't need an opponent. This is solo — you vs. every other Swayger user on one leaderboard.</p>

    <p style="margin:0 0 14px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#9CA3AF;text-transform:uppercase;">Two ways to earn points</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:16px;border-left:3px solid #6C63FF;">
          <p style="margin:0 0 5px;font-size:14px;font-weight:700;color:#FFFFFF;">⚡ Quick Picks</p>
          <p style="margin:0 0 10px;font-size:13px;color:#8B95A5;line-height:1.5;">Each round, pick which game will be the biggest <strong style="color:#FFFFFF;">upset</strong>, which will be the biggest <strong style="color:#FFFFFF;">blowout</strong>, and which will be the <strong style="color:#FFFFFF;">highest scorer</strong>. 3 points each. New picks open every round.</p>
          <p style="margin:0;font-size:12px;color:#6C63FF;font-weight:600;">→ Go to March Madness → Quick Picks</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:16px;border-left:3px solid #F5A623;">
          <p style="margin:0 0 5px;font-size:14px;font-weight:700;color:#FFFFFF;">🔒 Locked Takes</p>
          <p style="margin:0 0 10px;font-size:13px;color:#8B95A5;line-height:1.5;">Before tip-off, lock in your predictions on specific game outcomes. Hit a Sweet 16 call? 2 pts. Elite Eight? 3 pts. Final Four? 5 pts. Champion? 10 pts. Points stack all tournament.</p>
          <p style="margin:0;font-size:12px;color:#F5A623;font-weight:600;">→ Go to March Madness → Locked Takes</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 4px;font-size:13px;color:#8B95A5;text-align:center;">Round of 64 picks are open <strong style="color:#FFFFFF;">right now</strong>.</p>
    <p style="margin:0;font-size:13px;color:#8B95A5;text-align:center;">Picks lock March 19 at 11am CDT — don't wait.</p>
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
            <p style="margin:0 0 20px;font-size:17px;font-weight:700;color:#FFFFFF;line-height:1.4;">March Madness is heating up — and there's $100 on the line. 🏀</p>
            ${body}
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
              <tr>
                <td align="center">
                  <a href="${picksUrl}"
                     style="display:inline-block;background:#F5A623;color:#000000;font-size:15px;font-weight:800;padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.3px;">
                    Make My Picks →
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

export async function sendLeaderboardBlast(opts: {
  to: string;
  displayName: string;
  userId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping");
    return;
  }
  let html = buildLeaderboardBlastHtml();
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "🏀 Race Up the Leaderboard — Win a $100 Amazon Gift Card", html });
}

export async function sendLeaderboardReminderBlast(opts: {
  to: string;
  userId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping");
    return;
  }
  let html = buildLeaderboardBlastHtml();
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "The winner walks away with something good", html });
}

// ─── Last-Chance Leaderboard Blast (Mar 19 9am — 2hrs before lock) ───────────

export function buildLastChanceBlastHtml(): string {
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
          <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#FFFFFF;">⚡ Quick Picks</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.5;">Pick the biggest <strong style="color:#FFFFFF;">upset</strong>, <strong style="color:#FFFFFF;">blowout</strong>, and <strong style="color:#FFFFFF;">high-scoring</strong> game of the round. 3 points each — these reset every round, so you can climb fast.</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #F5A623;">
          <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#FFFFFF;">🔒 Locked Takes</p>
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
                    Lock My Picks →
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

export async function sendLastChanceBlast(opts: {
  to: string;
  userId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping");
    return;
  }
  let html = buildLastChanceBlastHtml();
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "First place on the leaderboard walks away with something good. Picks close at 11am.", html });
}

// ─── Second Shot Email ────────────────────────────────────────────────────────

export function buildSecondShotEmailHtml(displayName = "there"): string {
  const picksUrl = `${APP_URL}/march-madness/picks`;
  const subject = "You missed the opening round deadline — but you still have a shot";
  const headline = "Second chance to lock your picks.";
  const body = `
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      Hey ${displayName},
    </p>
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:15px;line-height:1.6">
      The Round of 64 deadline passed and you didn't get your locked picks in. We're giving you a second chance — but there's a catch.
    </p>

    <div style="background:linear-gradient(135deg,#12001a 0%,#1e0030 100%);border:1px solid rgba(108,99,255,0.4);border-radius:12px;padding:18px 20px;margin-bottom:22px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#A78BFA;text-transform:uppercase;">🔒 Second Chance Picks — Available Now</p>
      <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#FFFFFF;line-height:1.3;">You can still lock in your Sweet 16, Elite 8, Final Four, and Champion picks.</p>
      <p style="margin:0;font-size:13px;color:#C4B5FD;line-height:1.5">Late entries earn <strong style="color:#FFFFFF;">half the normal points</strong>. You're not out of the running — but you'll need to be right more often to climb the board.</p>
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
      <p style="margin:0 0 2px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#F5A623;text-transform:uppercase;">🏆 The Prize</p>
      <p style="margin:0;font-size:18px;font-weight:800;color:#FFFFFF;">#1 on the leaderboard wins a $100 Amazon Gift Card</p>
    </div>
  `;
  return buildEmailHtml(subject, headline, body, "Lock My Picks →", picksUrl);
}

export async function sendSecondShotEmail(opts: {
  to: string;
  displayName: string;
  userId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping");
    return;
  }
  let html = buildSecondShotEmailHtml(opts.displayName);
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "You missed the opening round deadline — but you still have a shot", html });
}

// ─── R32 Quick Picks Launch Blast ────────────────────────────────────────────

export function buildMMR32PicksEmailHtml(displayName = "there"): string {
  const picksUrl = `${APP_URL}/march-madness/picks`;
  const subject = "🏀 Round of 32 Quick Picks are OPEN — Games start at 11am";
  const headline = "Round of 32 is here. Make your picks before tip-off.";

  const body = `
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      Hey ${displayName},
    </p>
    <p style="margin:0 0 18px;color:#E2E8F0;font-size:15px;line-height:1.6">
      Round of 32 Quick Picks are <strong style="color:#FFFFFF;">open right now</strong>. Three picks. Three chances to earn points before the first tip at <strong style="color:#FFFFFF;">11:10am CDT</strong> — picks lock at noon.
    </p>

    <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#9CA3AF;text-transform:uppercase;">Your 3 picks this round</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #F59E0B;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">🚨 Upset Pick — 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Pick which game the underdog pulls off the shocker. High Point (12) vs Arkansas. VCU (11) vs Illinois. Nebraska vs Vanderbilt is basically a coin flip.</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #3B82F6;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">💥 Blowout Pick — 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Pick which game ends in a blowout. Duke is -11.5. Michigan is -12.5. Houston hasn't lost a game cleanly in weeks.</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #10B981;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">🔥 High Scorer Pick — 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Pick the highest-scoring game. Arkansas vs High Point has an O/U of <strong style="color:#FFFFFF;">169.5</strong> — the highest on the entire weekend slate.</p>
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

  return buildEmailHtml(subject, headline, body, "Make My Picks →", picksUrl);
}

export async function sendMMR32PicksEmail(opts: {
  to: string;
  displayName: string;
  userId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping");
    return;
  }
  let html = buildMMR32PicksEmailHtml(opts.displayName);
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "🏀 Round of 32 Quick Picks are OPEN — Games start at 11am", html });
}

// ─── R32 Wrapup Blast (Mar 23 8am CDT — after R32 Day 2, Sweet 16 push) ─────

export function buildR32WrapupEmailHtml({
  displayName = "there",
  totalPoints,
  upsetPts,
  correctUpsets,
  blowoutPts,
  correctBlowouts,
  highScorerPts,
  correctHighScorers,
  rank,
  totalPlayers,
}: {
  displayName: string;
  totalPoints: number;
  upsetPts: number;
  correctUpsets: number;
  blowoutPts: number;
  correctBlowouts: number;
  highScorerPts: number;
  correctHighScorers: number;
  rank: number;
  totalPlayers: number;
}): string {
  const subject = "🏀 R32 wrapped — Sweet 16 starts Thursday. Here's your score.";
  const headline = "Round of 32 is done. Here's where you stand.";
  const rankLabel =
    rank === 1
      ? "🥇 You're in first place!"
      : rank <= 3
      ? `🔥 You're #${rank} out of ${totalPlayers}`
      : `#${rank} out of ${totalPlayers} players`;

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
        <span style="font-size:13px;color:#8B95A5;">🚨 Upset Picks</span>
        <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${upsetPts} pts (${correctUpsets} correct)</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #2A2A3A;">
        <span style="font-size:13px;color:#8B95A5;">💥 Blowout Picks</span>
        <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${blowoutPts} pts (${correctBlowouts} correct)</span>
      </td></tr>
      <tr><td style="padding:10px 0;">
        <span style="font-size:13px;color:#8B95A5;">🔥 High Scorer Picks</span>
        <span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">${highScorerPts} pts (${correctHighScorers} correct)</span>
      </td></tr>
    </table>

    <div style="background:linear-gradient(135deg,#0d1a0f 0%,#091409 100%);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:18px 20px;margin-bottom:22px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#10B981;text-transform:uppercase;">🗓 Sweet 16 — Thursday March 26</p>
      <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#FFFFFF;line-height:1.4;">32 teams became 16. Now it gets real.</p>
      <p style="margin:0 0 12px;font-size:14px;color:#D1FAE5;line-height:1.6;">
        Before the chaos hits, lock in a swayger with someone who thinks they know who's advancing. Pick a matchup. Set stakes. Settle after the buzzer.
      </p>
      <p style="margin:0;font-size:13px;color:#6EE7B7;line-height:1.5;">
        The longer you wait, the more everyone starts second-guessing their bracket. Create now while everyone still believes in their picks.
      </p>
    </div>

    <p style="margin:0;font-size:12px;color:#6B7280;text-align:center;">Sweet 16 quick picks open soon — keep an eye out.</p>
  `;

  return buildEmailHtml(subject, headline, body, "Create a Sweet 16 Swayger →", `${APP_URL}/create`);
}

export async function sendR32WrapupEmail(opts: {
  to: string;
  displayName: string;
  totalPoints: number;
  upsetPts: number;
  correctUpsets: number;
  blowoutPts: number;
  correctBlowouts: number;
  highScorerPts: number;
  correctHighScorers: number;
  rank: number;
  totalPlayers: number;
  userId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  let html = buildR32WrapupEmailHtml(opts);
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "🏀 R32 wrapped — Sweet 16 starts Thursday. Here's your score.", html });
}

// ─── Per-Round Quick Pick Reminder ───────────────────────────────────────────

export async function sendQuickPickReminderEmail(opts: {
  to: string;
  displayName: string;
  roundLabel: string;
  lockDateLabel: string;
  isLastChance?: boolean;
  userId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping");
    return;
  }
  const picksUrl = `${APP_URL}/march-madness/picks`;
  const subject = opts.isLastChance
    ? `⏰ Last chance — ${opts.roundLabel} Quick Picks close ${opts.lockDateLabel}`
    : `🏀 ${opts.roundLabel} Quick Picks are open`;
  const headline = opts.isLastChance
    ? `${opts.roundLabel} picks close ${opts.lockDateLabel}.`
    : `New round, new picks. ${opts.roundLabel} is here.`;
  const body = `
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      Hey ${opts.displayName},
    </p>
    <p style="margin:0 0 18px;color:#E2E8F0;font-size:15px;line-height:1.6">
      ${opts.isLastChance
        ? `Quick Picks for the <strong style="color:#FFFFFF;">${opts.roundLabel}</strong> close at <strong style="color:#FFFFFF;">${opts.lockDateLabel}</strong>. If you haven't made yours yet, now's the time.`
        : `<strong style="color:#FFFFFF;">${opts.roundLabel}</strong> Quick Picks are now open. Three chances to score points before this round tips off.`
      }
    </p>

    <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#9CA3AF;text-transform:uppercase;">Make your ${opts.roundLabel} picks</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #F59E0B;margin-bottom:8px;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">🚨 Upset Pick</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Which underdog pulls off the shocker this round? Pick the game, earn 3 points if you're right.</p>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #3B82F6;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">💥 Blowout Pick</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Which game ends in a blowout? Pick the matchup with the biggest expected margin. 3 points if you nail it.</p>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #10B981;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">🔥 High Scorer Pick</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Which game goes for the most total points? Pick the highest-scoring matchup. 3 points if you're right.</p>
        </td>
      </tr>
    </table>

    ${opts.isLastChance ? `<p style="margin:0;font-size:13px;color:#6B7280;text-align:center;">Picks close at ${opts.lockDateLabel}. After that the round is locked.</p>` : `<p style="margin:0;font-size:13px;color:#6B7280;text-align:center;">Picks close at ${opts.lockDateLabel}. Scores update after games complete.</p>`}
  `;
  let html = buildEmailHtml(subject, headline, body, "Make My Picks →", picksUrl);
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject, html });
}

// ─── Sweet 16 Launch Blast (two variants) ────────────────────────────────────
//
// Variant A (hasLockedTakes=true):  Sweet 16 Picks + 2X Referral
// Variant B (hasLockedTakes=false): Sweet 16 Picks + Second Chance + 2X Referral

export function buildS16LaunchEmailHtml(
  displayName = "there",
  hasLockedTakes = true,
): string {
  const picksUrl  = `${APP_URL}/march-madness/picks`;
  const hubUrl    = `${APP_URL}/march-madness?utm_source=email&utm_campaign=s16-launch`;
  const subject   = "🏀 Sweet 16 picks are OPEN — lock yours before Thursday";
  const headline  = "The Sweet 16 is set. Make your picks.";

  // ── Shared section 1: Sweet 16 Quick Picks ─────────────────────────────────
  const quickPicksSection = `
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      Hey ${displayName},
    </p>
    <p style="margin:0 0 18px;color:#E2E8F0;font-size:15px;line-height:1.6">
      Sweet 16 Quick Picks are <strong style="color:#FFFFFF;">open right now</strong>. Three picks, three chances to earn points — picks lock <strong style="color:#FFFFFF;">Thursday March 26 at 6pm CDT</strong> when the games tip off.
    </p>

    <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.8px;color:#9CA3AF;text-transform:uppercase;">Your 3 picks this round</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #F59E0B;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">🚨 Upset Pick — 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Texas survived the First Four as an #11 seed. Can they stun #2 Purdue? Iowa (#9) beat #1 Florida — do they keep rolling against Nebraska? Pick the upset.</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #3B82F6;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">💥 Blowout Pick — 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;line-height:1.4">Michigan is -10.5 over Alabama. Duke is at home against St. John's. Arkansas vs Arizona in a rematch neither team forgot. Pick the game that ends as a rout.</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #10B981;">
          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#FFFFFF;">🔥 High Scorer Pick — 3 pts</p>
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

  // ── Variant B only: Second Chance section ─────────────────────────────────
  const secondChanceSection = !hasLockedTakes ? `
    <div style="background:linear-gradient(135deg,#12001a 0%,#1e0030 100%);border:1px solid rgba(108,99,255,0.4);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#A78BFA;text-transform:uppercase;">🔒 Second Chance Picks — Still Open</p>
      <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#FFFFFF;line-height:1.3;">You missed the bracket deadline — but you can still lock Elite 8, Final Four, and Champion picks.</p>
      <p style="margin:0 0 14px;font-size:13px;color:#C4B5FD;line-height:1.5">Late entries earn <strong style="color:#FFFFFF;">half the normal points</strong>. Sweet 16 teams are already set so that take is closed — but the rest are still up for grabs.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.25);border-radius:8px;padding:4px 14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid rgba(167,139,250,0.15);"><span style="font-size:13px;color:#C4B5FD;">Elite 8 picks</span><span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">1.5 pts each</span></td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid rgba(167,139,250,0.15);"><span style="font-size:13px;color:#C4B5FD;">Final Four picks</span><span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">2.5 pts each</span></td></tr>
        <tr><td style="padding:8px 0;"><span style="font-size:13px;color:#C4B5FD;">Champion pick</span><span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">5 pts</span></td></tr>
      </table>
      <p style="margin:12px 0 0;font-size:12px;color:#7C3AED;text-align:center;">All second-chance picks lock Thursday March 26 at 6pm CDT.</p>
    </div>
  ` : "";

  // ── Shared section: 2X Referral ───────────────────────────────────────────
  const referralSection = `
    <div style="background:linear-gradient(135deg,#1a0e00 0%,#2a1800 100%);border:1px solid rgba(255,140,0,0.35);border-radius:12px;padding:18px 20px;margin-bottom:16px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#FF8C00;text-transform:uppercase;">🔥 2X Points — Referral Bonus</p>
      <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#FFFFFF;line-height:1.3;">Share a featured matchup. If your friend joins and accepts a Swayger, your Sweet 16 picks score <strong style="color:#FF8C00;">double</strong>.</p>
      <p style="margin:0 0 16px;font-size:13px;color:#FCD34D;line-height:1.5">Open the app → tap any Sweet 16 matchup card → hit the share button. Your referral link is automatically attached.</p>
      <div style="text-align:center;">
        <a href="${hubUrl}" style="display:inline-block;background:#FF8C00;color:#000000;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;letter-spacing:0.3px;">Go Share a Matchup →</a>
      </div>
    </div>
    <p style="margin:0 0 24px;font-size:12px;color:#6B7280;text-align:center;">One referral = 2X on all your Sweet 16 special picks this round.</p>
  `;

  const body = quickPicksSection + secondChanceSection + referralSection;

  return buildEmailHtml(subject, headline, body, "Make My Picks →", picksUrl);
}

// ─── Sweet 16 Tipoff Alert (1-hour warning) ──────────────────────────────────

export function buildS16TipoffAlertEmailHtml(displayName = "there"): string {
  const picksUrl = `${APP_URL}/march-madness/picks`;
  const subject  = "⏰ Sweet 16 tips in 1 hour — picks close NOW";
  const headline = "Last call. Picks lock at 6pm CDT.";

  const body = `
    <p style="margin:0 0 16px;color:#E2E8F0;font-size:16px;line-height:1.5">
      Hey ${displayName},
    </p>
    <p style="margin:0 0 20px;color:#E2E8F0;font-size:16px;line-height:1.6">
      The Sweet 16 tips off <strong style="color:#FFFFFF;">tonight</strong>. Picks lock at <strong style="color:#FF4444;">6pm CDT — in about an hour.</strong> If you haven't made yours yet, now's the moment.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #F59E0B;">
          <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#FFFFFF;">🚨 Upset Pick — 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;">Pick a lower seed to knock out a higher seed tonight.</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #3B82F6;">
          <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#FFFFFF;">💥 Blowout Pick — 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;">Pick the game that ends as a rout — not even close.</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="background:#13131D;border-radius:10px;padding:14px 16px;border-left:3px solid #10B981;">
          <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#FFFFFF;">🔥 High Scorer Pick — 3 pts</p>
          <p style="margin:0;font-size:13px;color:#8B95A5;">Pick the game that puts up the most combined points.</p>
        </td>
      </tr>
    </table>

    <div style="background:linear-gradient(135deg,#12001a 0%,#1e0030 100%);border:1px solid rgba(108,99,255,0.4);border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#A78BFA;text-transform:uppercase;">🔒 Second Chance — Still Active</p>
      <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#FFFFFF;line-height:1.3;">Missed the bracket deadline? You can still lock Elite 8, Final Four, and Championship picks.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.25);border-radius:8px;padding:4px 14px;margin-bottom:12px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid rgba(167,139,250,0.15);"><span style="font-size:13px;color:#C4B5FD;">Elite 8 picks</span><span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">1.5 pts each</span></td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid rgba(167,139,250,0.15);"><span style="font-size:13px;color:#C4B5FD;">Final Four picks</span><span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">2.5 pts each</span></td></tr>
        <tr><td style="padding:8px 0;"><span style="font-size:13px;color:#C4B5FD;">Championship pick</span><span style="float:right;font-size:13px;font-weight:600;color:#FFFFFF;">5 pts</span></td></tr>
      </table>
      <p style="margin:0;font-size:12px;color:#A78BFA;text-align:center;">Half points on locked takes — still worth locking in before tip.</p>
    </div>

    <p style="margin:0 0 6px;font-size:13px;color:#6B7280;text-align:center;">Picks lock at 6pm CDT. After that the window is closed.</p>
  `;

  return buildEmailHtml(subject, headline, body, "Make My Picks Now →", picksUrl);
}

export async function sendS16TipoffAlertEmail(opts: {
  to: string;
  displayName: string;
  userId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping");
    return;
  }
  let html = buildS16TipoffAlertEmailHtml(opts.displayName);
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "⏰ Sweet 16 tips in 1 hour — picks close NOW", html });
}

export async function sendS16LaunchEmail(opts: {
  to: string;
  displayName: string;
  hasLockedTakes: boolean;
  userId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping");
    return;
  }
  let html = buildS16LaunchEmailHtml(opts.displayName, opts.hasLockedTakes);
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  await resend.emails.send({ from: FROM, to: opts.to, subject: "🏀 Sweet 16 picks are OPEN — lock yours before Thursday", html });
}

// ─── Tournament Wrap-Up / Thank-You Email ─────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  username: string;
  displayName?: string | null;
  totalPoints: number;
}

function buildThankyouEmailHtml(opts: {
  displayName: string;
  rank: number;
  totalPoints: number;
  totalPlayers: number;
  leaderboard: LeaderboardEntry[];
  feedbackUrl: string;
}): string {
  const { displayName, rank, totalPoints, totalPlayers, leaderboard, feedbackUrl } = opts;

  const rankEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
  const rankLabel = rank === 1 ? "You won the whole thing." : rank <= 3 ? `Top 3 out of ${totalPlayers}.` : `${rank} of ${totalPlayers} players.`;

  const leaderboardRows = leaderboard.slice(0, 5).map((e) => {
    const isUser = e.rank === rank;
    const rowStyle = isUser
      ? `background:#0D1E33;border-radius:8px;padding:10px 12px;margin-bottom:6px;border-left:3px solid #1DA1F2;`
      : `padding:10px 12px;margin-bottom:6px;border-bottom:1px solid #2A2A3A;`;
    const nameColor = isUser ? "#1DA1F2" : "#E2E8F0";
    const ptColor = isUser ? "#FFFFFF" : "#9CA3AF";
    const medal = e.rank === 1 ? "🥇 " : e.rank === 2 ? "🥈 " : e.rank === 3 ? "🥉 " : `${e.rank}. `;
    return `<div style="${rowStyle}">
      <span style="font-size:14px;color:${nameColor};font-weight:${isUser ? "700" : "500"};">${medal}${e.displayName || e.username}</span>
      <span style="float:right;font-size:14px;font-weight:700;color:${ptColor};">${e.totalPoints} pts</span>
    </div>`;
  }).join("");

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#E2E8F0;line-height:1.6">
      Hey ${displayName} —
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#8B95A5;line-height:1.6">
      Michigan beat UConn 69–63. The bracket is done. You survived the whole thing.
    </p>

    <!-- Personal score card -->
    <div style="background:linear-gradient(135deg,#0d1a2e 0%,#0a1422 100%);border:1px solid rgba(29,161,242,0.3);border-radius:12px;padding:18px 20px;margin-bottom:24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1.5px;color:#1DA1F2;text-transform:uppercase;">Your Final Score</p>
      <p style="margin:0 0 6px;font-size:34px;font-weight:800;color:#FFFFFF;line-height:1.1;">${totalPoints} pts</p>
      <p style="margin:0;font-size:14px;color:#8B95A5;">${rankEmoji} &nbsp; ${rankLabel}</p>
    </div>

    <!-- Final leaderboard -->
    <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1px;color:#6B7280;text-transform:uppercase;">Final Leaderboard</p>
    <div style="margin-bottom:24px;">${leaderboardRows}</div>

    <!-- Winner callout -->
    <div style="background:#13131D;border-radius:12px;padding:16px 18px;margin-bottom:24px;border-left:3px solid #F5A623;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:1px;color:#F5A623;text-transform:uppercase;">🏆 2026 Champion</p>
      <p style="margin:0 0 2px;font-size:16px;font-weight:800;color:#FFFFFF;">${leaderboard[0]?.displayName || leaderboard[0]?.username || "—"}</p>
      <p style="margin:0;font-size:13px;color:#8B95A5;">${leaderboard[0]?.totalPoints ?? 0} points &middot; March Madness 2026</p>
    </div>

    <p style="margin:0 0 16px;font-size:15px;color:#E2E8F0;line-height:1.6">
      We're building more of this. Before we do, we want to know what actually worked and what didn't — from people who played.
    </p>
    <p style="margin:0 0 6px;font-size:14px;color:#8B95A5;">4 quick picks. Takes under 60 seconds.</p>
  `;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>March Madness 2026 — Wrapped</title>
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
            <p style="margin:0 0 20px;font-size:19px;font-weight:800;color:#FFFFFF;line-height:1.3;">March Madness 2026 is a wrap. 🏆</p>
            ${body}
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
              <tr>
                <td align="center">
                  <a href="${feedbackUrl}"
                     style="display:inline-block;background:#1DA1F2;color:#FFFFFF;font-size:15px;font-weight:800;padding:14px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.3px;">
                    Share Your Take →
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

  return html;
}

export async function sendThankyouEmail(opts: {
  to: string;
  displayName: string;
  rank: number;
  totalPoints: number;
  totalPlayers: number;
  leaderboard: LeaderboardEntry[];
  userId?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping");
    return;
  }
  const feedbackUrl = `${APP_URL}/feedback?uid=${encodeURIComponent(opts.userId ?? "")}`;
  let html = buildThankyouEmailHtml({ ...opts, feedbackUrl });
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  const subject = `${opts.displayName}, March Madness is over — here's how you finished 🏆`;
  await resend.emails.send({ from: FROM, to: opts.to, subject, html });
}

// ─── Outreach Email: Segment A (no swayger placed) ───────────────────────────

function buildOutreachAEmailHtml(opts: { displayName: string; feedbackUrl: string }): string {
  const { displayName, feedbackUrl } = opts;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#E2E8F0;line-height:1.6">
      Hey ${displayName} —
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#8B95A5;line-height:1.6">
      You signed up for Swayger a while back. You haven't placed a swayger yet — and we genuinely want to know why.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#8B95A5;line-height:1.6">
      Was it confusing? Nothing to bet on? Nobody to play with? We're not guessing — we're asking.
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
                    Share My Take →
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

export async function sendOutreachAEmail(opts: { to: string; displayName: string; userId?: string }): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping");
    return;
  }
  const feedbackUrl = `${APP_URL}/outreach-feedback-a?uid=${encodeURIComponent(opts.userId ?? "")}`;
  let html = buildOutreachAEmailHtml({ displayName: opts.displayName, feedbackUrl });
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  const subject = `Quick question, ${opts.displayName} — what stopped you?`;
  await resend.emails.send({ from: FROM, to: opts.to, subject, html });
}

export function buildOutreachAEmailPreview(): string {
  const feedbackUrl = `${APP_URL}/outreach-feedback-a?uid=PREVIEW_USER`;
  return buildOutreachAEmailHtml({ displayName: "Alex", feedbackUrl });
}

// ─── Outreach Email: Segment B (placed swayger, skipped MM) ──────────────────

function buildOutreachBEmailHtml(opts: { displayName: string; feedbackUrl: string }): string {
  const { displayName, feedbackUrl } = opts;
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#E2E8F0;line-height:1.6">
      Hey ${displayName} —
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#8B95A5;line-height:1.6">
      You placed a swayger. You're one of the OGs. We ran a March Madness challenge this year and missed you in it — Michigan won, for the record.
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
                    Give Real Feedback →
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

export async function sendOutreachBEmail(opts: { to: string; displayName: string; userId?: string }): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping");
    return;
  }
  const feedbackUrl = `${APP_URL}/outreach-feedback-b?uid=${encodeURIComponent(opts.userId ?? "")}`;
  let html = buildOutreachBEmailHtml({ displayName: opts.displayName, feedbackUrl });
  if (opts.userId) html = addUnsubFooter(html, generateUnsubscribeUrl(opts.userId));
  const subject = `${opts.displayName}, real talk — what did you think of Swayger?`;
  await resend.emails.send({ from: FROM, to: opts.to, subject, html });
}

export function buildOutreachBEmailPreview(): string {
  const feedbackUrl = `${APP_URL}/outreach-feedback-b?uid=PREVIEW_USER`;
  return buildOutreachBEmailHtml({ displayName: "Jordan", feedbackUrl });
}

// ─────────────────────────────────────────────────────────────────────────────

export function buildThankyouEmailPreview(): string {
  const sampleLeaderboard: LeaderboardEntry[] = [
    { rank: 1, username: "dgrand2",    displayName: "Mr Roarke",  totalPoints: 83 },
    { rank: 2, username: "leon50g",    displayName: null,         totalPoints: 50 },
    { rank: 3, username: "jayask78",   displayName: null,         totalPoints: 48 },
    { rank: 4, username: "belt_2_ass", displayName: null,         totalPoints: 47 },
    { rank: 5, username: "test2",      displayName: null,         totalPoints: 47 },
  ];
  const feedbackUrl = `${APP_URL}/feedback?uid=PREVIEW_USER`;
  return buildThankyouEmailHtml({
    displayName: "Mr Roarke",
    rank: 1,
    totalPoints: 83,
    totalPlayers: 19,
    leaderboard: sampleLeaderboard,
    feedbackUrl,
  });
}
