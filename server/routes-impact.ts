import type { Express, Request, Response } from "express";
import {
  ImpactAuthenticationError,
  ImpactConfigurationError,
  ImpactProviderError,
  listJoinedImpactPrograms,
} from "./impact-client";

function requireAdmin(req: Request, res: Response): boolean {
  const configuredToken = process.env.MM_ADMIN_TOKEN;
  const requestToken = req.headers["x-admin-token"];

  if (!configuredToken || requestToken !== configuredToken) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }

  return true;
}

export function registerImpactRoutes(app: Express): void {
  app.get("/api/admin/impact/joined-programs", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;

    try {
      const programs = await listJoinedImpactPrograms();
      res.json({
        ok: true,
        count: programs.length,
        programs,
      });
    } catch (error) {
      if (error instanceof ImpactConfigurationError) {
        res.status(503).json({
          ok: false,
          error: "Impact integration is not configured.",
          code: error.code,
        });
        return;
      }

      if (error instanceof ImpactAuthenticationError) {
        res.status(502).json({
          ok: false,
          error: "Impact authentication failed.",
          code: error.code,
        });
        return;
      }

      if (error instanceof ImpactProviderError) {
        res.status(error.status === 504 ? 504 : 502).json({
          ok: false,
          error: error.message,
          code: error.code,
        });
        return;
      }

      console.error("[impact] joined-programs request failed");
      res.status(502).json({
        ok: false,
        error: "Impact request failed.",
        code: "IMPACT_REQUEST_FAILED",
      });
    }
  });
}