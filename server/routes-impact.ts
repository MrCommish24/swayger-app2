import type { Express, Request, Response } from "express";
import {
  ImpactAuthenticationError,
  ImpactAdType,
  ImpactConfigurationError,
  ImpactProviderError,
  getImpactReview,
  getImpactInventory,
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

const IMPACT_AD_TYPES = new Set<ImpactAdType>(["TEXT_LINK", "BANNER", "COUPON"]);
const IMPACT_REVIEW_DEFAULT_UPDATED_WITHIN_DAYS = 30;
const IMPACT_REVIEW_KEYWORD_MAX_LENGTH = 100;

function queryString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function parseReviewOptions(req: Request): {
  adType: ImpactAdType | null;
  keyword: string | null;
  updatedWithinDays: number;
} | { error: string; code: "IMPACT_REVIEW_QUERY_INVALID" } {
  const rawAdType = queryString(req.query.ad_type);
  if (rawAdType && !IMPACT_AD_TYPES.has(rawAdType as ImpactAdType)) {
    return {
      error: "ad_type must be TEXT_LINK, BANNER, or COUPON.",
      code: "IMPACT_REVIEW_QUERY_INVALID",
    };
  }

  const rawDays = queryString(req.query.updated_within_days);
  const updatedWithinDays = rawDays ? Number(rawDays) : IMPACT_REVIEW_DEFAULT_UPDATED_WITHIN_DAYS;
  if (!Number.isInteger(updatedWithinDays) || updatedWithinDays < 1 || updatedWithinDays > 90) {
    return {
      error: "updated_within_days must be an integer from 1 to 90.",
      code: "IMPACT_REVIEW_QUERY_INVALID",
    };
  }

  const keyword = queryString(req.query.keyword);
  if (keyword && keyword.length > IMPACT_REVIEW_KEYWORD_MAX_LENGTH) {
    return {
      error: `keyword must be ${IMPACT_REVIEW_KEYWORD_MAX_LENGTH} characters or fewer.`,
      code: "IMPACT_REVIEW_QUERY_INVALID",
    };
  }

  return {
    adType: rawAdType as ImpactAdType | null,
    keyword,
    updatedWithinDays,
  };
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

  app.get("/api/admin/impact/inventory", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;

    try {
      const inventory = await getImpactInventory();
      res.json({ ok: true, ...inventory });
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

      console.error("[impact] inventory request failed");
      res.status(502).json({
        ok: false,
        error: "Impact inventory request failed.",
        code: "IMPACT_INVENTORY_REQUEST_FAILED",
      });
    }
  });

  app.get("/api/admin/impact/review", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;

    const options = parseReviewOptions(req);
    if ("error" in options) {
      res.status(400).json({ ok: false, error: options.error, code: options.code });
      return;
    }

    try {
      const review = await getImpactReview(options);
      res.json({ ok: true, ...review });
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

      console.error("[impact] review request failed");
      res.status(502).json({
        ok: false,
        error: "Impact review request failed.",
        code: "IMPACT_REVIEW_REQUEST_FAILED",
      });
    }
  });
}