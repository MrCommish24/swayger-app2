import type { Application, Request, Response } from "express";
import { getServiceSupabase } from "./supabase-service.js";
import {
  isReceiptPreviewCrawler,
  loadWeeklyReceiptPreview,
  renderWeeklyReceiptPreviewHtml,
  renderWeeklyReceiptPreviewSvg,
} from "./fantasy-weekly-preview.js";

const SHORT_CODE_PATTERN = /^[a-z2-7]{16}$/;

/**
 * Resolve a stable Fantasy Draft Day or Weekly receipt alias to its canonical
 * receipt route. This route intentionally performs no receipt authorization
 * itself; the canonical route remains the security boundary.
 */
export function registerFantasyReceiptShortLink(app: Application): void {
  app.get("/r/:shortCode/preview.svg", async (req: Request, res: Response) => {
    const shortCode = String(req.params.shortCode ?? "").trim().toLowerCase();
    if (!SHORT_CODE_PATTERN.test(shortCode)) {
      res.status(404).send("Receipt not found");
      return;
    }
    try {
      const supabase = getServiceSupabase();
      const { data: alias } = await supabase
        .from("fantasy_weekly_receipt_aliases")
        .select("league_season_id, week_number")
        .eq("short_code", shortCode)
        .maybeSingle();
      if (!alias) {
        res.status(404).send("Receipt not found");
        return;
      }
      const { data: season } = await supabase
        .from("fantasy_league_seasons")
        .select("id, league_id")
        .eq("id", (alias as any).league_season_id)
        .maybeSingle();
      if (!season) {
        res.status(404).send("Receipt not found");
        return;
      }
      const preview = await loadWeeklyReceiptPreview(
        supabase,
        (season as any).id,
        (season as any).league_id,
        (alias as any).week_number,
      );
      if (!preview) {
        res.status(404).send("Receipt not found");
        return;
      }
      res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.send(renderWeeklyReceiptPreviewSvg(preview));
    } catch (error) {
      console.error("[fantasy-receipt-short-link] preview image failed:", error);
      res.status(500).send("Unable to render receipt preview");
    }
  });

  app.get("/r/:shortCode", async (req: Request, res: Response) => {
    const shortCode = String(req.params.shortCode ?? "").trim().toLowerCase();
    if (!SHORT_CODE_PATTERN.test(shortCode)) {
      res.status(404).send("Receipt not found");
      return;
    }

    try {
      const supabase = getServiceSupabase();
      const { data: alias, error: aliasError } = await supabase
        .from("fantasy_draft_day_receipt_aliases")
        .select("league_season_id")
        .eq("short_code", shortCode)
        .maybeSingle();

      if (aliasError) {
        console.error("[fantasy-receipt-short-link] alias lookup failed:", aliasError.message);
        res.status(500).send("Unable to resolve receipt");
        return;
      }
      if (alias) {
        const { data: weeklyCollision, error: weeklyCollisionError } = await supabase
          .from("fantasy_weekly_receipt_aliases")
          .select("league_season_id")
          .eq("short_code", shortCode)
          .maybeSingle();
        if (weeklyCollisionError) {
          console.error("[fantasy-receipt-short-link] collision check failed:", weeklyCollisionError.message);
          res.status(500).send("Unable to resolve receipt");
          return;
        }
        if (weeklyCollision) {
          console.error("[fantasy-receipt-short-link] ambiguous alias namespace collision");
          res.status(404).send("Receipt not found");
          return;
        }

        const { data: season, error: seasonError } = await supabase
          .from("fantasy_league_seasons")
          .select("id, league_id")
          .eq("id", (alias as any).league_season_id)
          .maybeSingle();

        if (seasonError) {
          console.error("[fantasy-receipt-short-link] season lookup failed:", seasonError.message);
          res.status(500).send("Unable to resolve receipt");
          return;
        }
        if (!season) {
          res.status(404).send("Receipt not found");
          return;
        }

        res.setHeader("Cache-Control", "no-store");
        res.redirect(
          302,
          `/fantasy/draft-day/${(season as any).league_id}/${(season as any).id}/receipt`,
        );
        return;
      }

      // Weekly aliases use the same opaque namespace, but a distinct table
      // because their identity is season + week. Draft Day lookup above stays
      // first so its behavior and error handling remain unchanged.
      const { data: weeklyAlias, error: weeklyAliasError } = await supabase
        .from("fantasy_weekly_receipt_aliases")
        .select("league_season_id, week_number")
        .eq("short_code", shortCode)
        .maybeSingle();

      if (weeklyAliasError) {
        console.error("[fantasy-receipt-short-link] weekly alias lookup failed:", weeklyAliasError.message);
        res.status(500).send("Unable to resolve receipt");
        return;
      }
      if (!weeklyAlias) {
        res.status(404).send("Receipt not found");
        return;
      }

      const { data: weeklySeason, error: weeklySeasonError } = await supabase
        .from("fantasy_league_seasons")
        .select("id, league_id")
        .eq("id", (weeklyAlias as any).league_season_id)
        .maybeSingle();

      if (weeklySeasonError) {
        console.error("[fantasy-receipt-short-link] weekly season lookup failed:", weeklySeasonError.message);
        res.status(500).send("Unable to resolve receipt");
        return;
      }
      if (!weeklySeason) {
        res.status(404).send("Receipt not found");
        return;
      }

      const canonicalPath =
        `/fantasy/weeks/${(weeklySeason as any).league_id}/${(weeklySeason as any).id}/${(weeklyAlias as any).week_number}/receipt`;
      if (isReceiptPreviewCrawler(String(req.headers["user-agent"] ?? ""))) {
        const preview = await loadWeeklyReceiptPreview(
          supabase,
          (weeklySeason as any).id,
          (weeklySeason as any).league_id,
          (weeklyAlias as any).week_number,
        );
        if (!preview) {
          res.status(404).send("Receipt not found");
          return;
        }
        const protocol = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https").split(",")[0];
        const origin = `${protocol}://${req.get("host")}`;
        const shortUrl = `${origin}/r/${shortCode}`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.send(renderWeeklyReceiptPreviewHtml(
          preview,
          shortUrl,
          `${origin}${canonicalPath}`,
          `${shortUrl}/preview.svg`,
        ));
        return;
      }

      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, canonicalPath);
    } catch (error) {
      console.error("[fantasy-receipt-short-link] unexpected error:", error);
      res.status(500).send("Unable to resolve receipt");
    }
  });
}