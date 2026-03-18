import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM =
  process.env.RESEND_FROM_EMAIL || "Swayger <onboarding@resend.dev>";
const APP_URL =
  process.env.EXPO_PUBLIC_APP_URL || "https://swayger-app.replit.app";

export type EmailEvent =
  | "invite_created"
  | "swayger_accepted"
  | "settlement_proposed"
  | "swayger_settled"
  | "swayger_expired";

export interface NotifyPayload {
  event: EmailEvent;
  swayger: {
    id: string;
    title: string;
    category: string;
    stakeUnits: number;
  };
  sender: { name: string };
  recipients: { email: string; name: string }[];
  outcome?: string;
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
  const stake = `${p.swayger.stakeUnits} Swayger Points`;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#13131D;border-radius:10px;padding:4px 16px;margin-bottom:8px;">
    ${detailRow("Wager", p.swayger.title)}
    ${detailRow("Category", p.swayger.category)}
    ${detailRow("Stake", stake)}
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
      const proposed = payload.outcome ? outcomeLabel(payload.outcome) : "—";
      body =
        details +
        `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">Proposed outcome: <strong style="color:#FFFFFF;">${proposed}</strong></p>`;
      ctaLabel = "Review & Confirm";
      break;
    }

    case "swayger_settled": {
      subject = `🏆 "${title}" has been settled`;
      headline = `The results are in.`;
      const final = payload.outcome ? outcomeLabel(payload.outcome) : "—";
      body =
        details +
        `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">Final outcome: <strong style="color:#FFFFFF;">${final}</strong></p>`;
      ctaLabel = "See Results";
      break;
    }

    case "swayger_expired": {
      subject = `⏱️ "${title}" expired — stakes returned`;
      headline = `"${title}" expired without a verdict.`;
      body =
        details +
        `<p style="margin:16px 0 0;font-size:14px;color:#8B95A5;">Neither party reached agreement within 7 days. Your staked Swayger Points have been returned.</p>`;
      ctaLabel = "View Swayger";
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
}: {
  to: string;
  displayName: string;
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
      Picks lock at noon ET on March 19. Once it's locked, it's locked.
    </p>
  `;
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: buildEmailHtml(subject, headline, body, "Lock My Picks", `${APP_URL}/march-madness/picks`),
  });
}
