import type { Application, Request, Response } from "express";
import { getServiceSupabase } from "./supabase-service.js";

const SHORT_CODE_PATTERN = /^[a-z2-7]{16}$/;

/**
 * Resolve a stable Fantasy Draft Day receipt alias to the canonical receipt
 * route. This route intentionally performs no receipt authorization itself;
 * the canonical route remains the security boundary.
 */
export function registerFantasyReceiptShortLink(app: Application): void {
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
      if (!alias) {
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
    } catch (error) {
      console.error("[fantasy-receipt-short-link] unexpected error:", error);
      res.status(500).send("Unable to resolve receipt");
    }
  });
}