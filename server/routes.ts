import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import * as path from "path";
import { sendNotificationEmail, type NotifyPayload } from "./email";
import { registerMMAdminRoutes } from "./routes-mm-admin";
import { registerMMSpecialRoutes } from "./routes-mm-special";
import { registerNBARoutes } from "./routes-nba";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/promo", (_req: Request, res: Response) => {
    res.sendFile(path.resolve(process.cwd(), "server/templates/promo.html"));
  });
  app.get("/how-it-works", (_req: Request, res: Response) => {
    res.sendFile(path.resolve(process.cwd(), "server/templates/swayger-how-it-works.html"));
  });
  app.get("/api/config", (_req: Request, res: Response) => {
    const domains = (process.env.REPLIT_DOMAINS || "")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    const primaryDomain = domains[0] || process.env.REPLIT_DEV_DOMAIN || "";
    res.json({ appUrl: primaryDomain ? `https://${primaryDomain}` : "" });
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

  const httpServer = createServer(app);
  return httpServer;
}
