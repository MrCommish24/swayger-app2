import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { verifyUnsubscribeToken } from "./email";

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key);
}

const CONFIRMED_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Unsubscribed — Swayger</title>
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
    <div class="icon">✅</div>
    <h1>You're unsubscribed</h1>
    <p>You won't receive any more bulk emails from Swayger.</p>
    <p class="note">Wager notifications (someone challenging you, accepting your Swayger, etc.) are still active — those are tied to your account activity.</p>
    <p class="note" style="margin-top:8px;">If this was a mistake, reply to any Swayger email or reach out through the app.</p>
    <div class="brand">SWAYGER</div>
  </div>
</body>
</html>`;

const ERROR_HTML = (msg: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Error — Swayger</title>
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

export function registerUnsubscribeRoutes(app: Express): void {
  app.get("/unsubscribe", async (req: Request, res: Response) => {
    const uid = (req.query.uid as string | undefined)?.trim();
    const sig = (req.query.sig as string | undefined)?.trim();

    if (!uid || !sig) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(400).send(ERROR_HTML("Invalid unsubscribe link — missing parameters."));
      return;
    }

    if (!verifyUnsubscribeToken(uid, sig)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(403).send(ERROR_HTML("Invalid or expired unsubscribe link."));
      return;
    }

    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("profiles")
        .update({ email_unsubscribed: true })
        .eq("id", uid);

      if (error) {
        console.error("[unsubscribe] Supabase error:", error.message);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(500).send(ERROR_HTML("Could not process your request. Please try again."));
        return;
      }

      console.log(`[unsubscribe] User ${uid} unsubscribed from blast emails`);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(CONFIRMED_HTML);
    } catch (err) {
      console.error("[unsubscribe] Error:", err);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(500).send(ERROR_HTML("Server error. Please try again later."));
    }
  });
}
