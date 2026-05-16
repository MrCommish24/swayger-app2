import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { sendNotificationEmail, type NotifyPayload } from "./email";
import { registerMMAdminRoutes } from "./routes-mm-admin";
import { registerMMSpecialRoutes } from "./routes-mm-special";
import { registerNBARoutes } from "./routes-nba";
import { registerPropsRoutes } from "./routes-props";

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key);
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/promo", (_req: Request, res: Response) => {
    res.sendFile(path.resolve(process.cwd(), "server/templates/promo.html"));
  });
  app.get("/how-it-works", (_req: Request, res: Response) => {
    res.sendFile(path.resolve(process.cwd(), "server/templates/swayger-how-it-works.html"));
  });
  app.post("/api/debug/onesignal", (req: Request, res: Response) => {
    const body = req.body || {};
    console.log("[onesignal-debug]", JSON.stringify(body));
    res.json({ ok: true });
  });

  app.get("/api/config", (_req: Request, res: Response) => {
    const domains = (process.env.REPLIT_DOMAINS || "")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    const primaryDomain = domains[0] || process.env.REPLIT_DEV_DOMAIN || "";
    res.json({ appUrl: primaryDomain ? `https://${primaryDomain}` : "" });
  });

  app.get("/api/invite/:code/preview", async (req: Request, res: Response) => {
    try {
      const code = (String(req.params.code || "")).toUpperCase().trim();
      if (!code) { res.status(400).json({ error: "No code" }); return; }

      const supabase = getSupabase();

      const { data: invite, error: inviteErr } = await supabase
        .from("swayger_invites")
        .select("swayger_id, invite_code, expires_at")
        .eq("invite_code", code)
        .maybeSingle();

      if (inviteErr || !invite) {
        res.status(404).json({ error: "Invite not found" });
        return;
      }

      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        res.status(410).json({ error: "expired" });
        return;
      }

      const { data: swayger, error: swaygerErr } = await supabase
        .from("swaygers")
        .select("id, title, category, stake_units, creator_pick, description, status, creator_id, expires_at")
        .eq("id", invite.swayger_id)
        .maybeSingle();

      if (swaygerErr || !swayger) {
        res.status(404).json({ error: "Swayger not found" });
        return;
      }

      if (swayger.status !== "pending_invite") {
        res.status(409).json({ error: swayger.status === "active" ? "already_accepted" : "unavailable", status: swayger.status });
        return;
      }

      const { data: creator } = await supabase
        .from("profiles")
        .select("username, display_name")
        .eq("id", swayger.creator_id)
        .maybeSingle();

      res.json({
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
        creator_display_name: creator?.display_name ?? null,
      });
    } catch (err) {
      console.error("[invite-preview]", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // POST /api/push/send — server-side OneSignal web push (keeps REST key private)
  app.post("/api/push/send", async (req: Request, res: Response) => {
    try {
      const { toUserId, title, body, data } = req.body as {
        toUserId: string;
        title: string;
        body: string;
        data?: Record<string, string>;
      };
      if (!toUserId || !title || !body) {
        res.status(400).json({ ok: false, error: "Missing fields" });
        return;
      }
      const appId = "6c7fe969-e694-4977-819a-f10fbc4159c6";
      const apiKey = process.env.ONESIGNAL_REST_API_KEY;
      if (!apiKey) {
        res.status(500).json({ ok: false, error: "OneSignal REST key not configured" });
        return;
      }
      const response = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          "Authorization": `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          app_id: appId,
          target_channel: "push",
          include_aliases: { external_id: [toUserId] },
          headings: { en: title },
          contents: { en: body },
          data: data || {},
        }),
      });
      const json = await response.json() as any;
      if (!response.ok) {
        console.error("[push] OneSignal error:", json);
        res.status(500).json({ ok: false, error: "OneSignal send failed" });
        return;
      }
      res.json({ ok: true, recipients: json.recipients ?? 0 });
    } catch (err) {
      console.error("[push] error:", err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.post("/api/notify", async (req: Request, res: Response) => {
    try {
      const payload = req.body as NotifyPayload;
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

  registerMMAdminRoutes(app);
  registerMMSpecialRoutes(app);
  registerNBARoutes(app);
  registerPropsRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
