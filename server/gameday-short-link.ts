import type { Express, Request, Response } from "express";
import { getServiceSupabase } from "./supabase-service.js";

/**
 * Register the short Game Day room-code redirect used by Discord invites.
 * Private rooms intentionally resolve here just like public rooms: privacy
 * controls discovery, not access for someone who has the invite.
 */
export function registerGamedayShortLink(app: Express): void {
  app.get("/g/:roomCode", async (req: Request, res: Response) => {
    const code = (req.params.roomCode ?? "").toUpperCase().trim();
    if (!code) {
      res.status(400).send("Missing room code");
      return;
    }
    const supabase = getServiceSupabase();
    const { data: room } = await supabase
      .from("gameday_rooms")
      .select("id")
      .eq("room_code", code)
      .maybeSingle();
    if (!room) {
      res.status(404).send("Room not found");
      return;
    }
    res.redirect(302, `/gameday/${(room as any).id}`);
  });
}