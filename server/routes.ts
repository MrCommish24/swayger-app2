import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/config", (_req: Request, res: Response) => {
    const domains = (process.env.REPLIT_DOMAINS || "")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    const primaryDomain = domains[0] || process.env.REPLIT_DEV_DOMAIN || "";
    res.json({ appUrl: primaryDomain ? `https://${primaryDomain}` : "" });
  });

  const httpServer = createServer(app);

  return httpServer;
}
