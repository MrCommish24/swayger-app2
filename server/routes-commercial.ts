import type { Express, Request, Response } from "express";
import { getServiceSupabase } from "./supabase-service";
import { requireAdmin } from "./routes-impact";

const OFFER_DISCLOSURE =
  "Affiliate disclosure: Swayger may earn a commission if you use this link.";
const TARGET_TYPES = new Set(["fantasy_weekly", "game_day"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CommercialTargetType = "fantasy_weekly" | "game_day";

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function boundedString(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function targetType(value: unknown): CommercialTargetType | null {
  return typeof value === "string" && TARGET_TYPES.has(value)
    ? value as CommercialTargetType
    : null;
}

function normalizeOfferInput(input: any): Record<string, unknown> | { error: string } {
  if (!input || input.provider !== "impact") {
    return { error: "Only normalized Impact offers are supported." };
  }
  const resourceType = input.resource_type === "deal" || input.resource_type === "ad"
    ? input.resource_type
    : null;
  const title = boundedString(input.title, 500);
  if (!resourceType || !title) {
    return { error: "A normalized provider, resource type, and title are required." };
  }

  return {
    provider: "impact",
    source_resource_type: resourceType,
    source_external_id: boundedString(input.external_id, 300),
    program_id: boundedString(input.program_id, 300),
    program_name: boundedString(input.program_name, 500),
    brand_id: boundedString(input.brand_id, 300),
    brand_name: boundedString(input.brand_name, 500),
    title,
    description: boundedString(input.description),
    availability: boundedString(input.availability, 100),
    tracking_url: boundedString(input.tracking_url, 4000),
    landing_page_url: boundedString(input.landing_page_url, 4000),
    creative_url: boundedString(input.creative_url, 4000),
    creative_type: boundedString(input.creative_type, 100),
    creative_width: finiteNumber(input.creative_width),
    creative_height: finiteNumber(input.creative_height),
    promo_code: boundedString(input.promo_code, 200),
    discount_type: boundedString(input.discount_type, 100),
    discount_amount: finiteNumber(input.discount_amount),
    discount_currency: boundedString(input.discount_currency, 20),
    discount_percent: finiteNumber(input.discount_percent),
    minimum_purchase_amount: finiteNumber(input.minimum_purchase_amount),
    maximum_savings_amount: finiteNumber(input.maximum_savings_amount),
    start_at: validDate(input.start_at),
    end_at: validDate(input.end_at),
    source_updated_at: validDate(input.source_updated_at),
    disclosure: OFFER_DISCLOSURE,
    status: "saved",
    updated_at: new Date().toISOString(),
  };
}

async function getEligibleRoom(
  supabase: ReturnType<typeof getServiceSupabase>,
  type: CommercialTargetType,
  id: string,
) {
  let query = supabase
    .from("gameday_rooms")
    .select("id, room_name, room_code, team_a_name, team_b_name, game_date, status, archived_at, experience_type, competition_type, week_number, league_season_id")
    .eq("id", id)
    .in("status", ["draft", "active"])
    .is("archived_at", null);

  query = type === "fantasy_weekly"
    ? query.eq("experience_type", "fantasy").eq("competition_type", "weekly")
    : query.eq("experience_type", "game_day");

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function listEligibleTargets(
  supabase: ReturnType<typeof getServiceSupabase>,
  type: CommercialTargetType,
) {
  let query = supabase
    .from("gameday_rooms")
    .select("id, room_name, room_code, team_a_name, team_b_name, game_date, status, archived_at, experience_type, competition_type, week_number, league_season_id")
    .in("status", ["draft", "active"])
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  query = type === "fantasy_weekly"
    ? query.eq("experience_type", "fantasy").eq("competition_type", "weekly")
    : query.eq("experience_type", "game_day");

  const { data: rooms, error } = await query;
  if (error) throw error;
  const roomIds = (rooms ?? []).map((room: any) => room.id);
  const { data: participants } = roomIds.length
    ? await supabase.from("gameday_participants").select("room_id").in("room_id", roomIds)
    : { data: [] };
  const counts = new Map<string, number>();
  for (const participant of participants ?? []) {
    counts.set(participant.room_id, (counts.get(participant.room_id) ?? 0) + 1);
  }

  const { data: activeAssignments } = roomIds.length
    ? await supabase
      .from("swayger_commercial_assignments")
      .select("id, target_id, offer_id, status")
      .eq("target_type", type)
      .eq("status", "published")
      .in("target_id", roomIds)
    : { data: [] };
  const assignments = new Map<string, any>();
  for (const assignment of activeAssignments ?? []) assignments.set(assignment.target_id, assignment);

  return (rooms ?? []).map((room: any) => ({
    target_type: type,
    target_id: room.id,
    label: room.room_name ?? `${type === "fantasy_weekly" ? "Fantasy Weekly" : "Game Day"} placement`,
    room_code: room.room_code ?? null,
    matchup: room.team_a_name && room.team_b_name ? `${room.team_a_name} vs ${room.team_b_name}` : null,
    game_date: room.game_date ?? null,
    week_number: room.week_number ?? null,
    status: room.status,
    participant_count: counts.get(room.id) ?? 0,
    published_assignment: assignments.get(room.id) ?? null,
  }));
}

async function getAssignment(
  supabase: ReturnType<typeof getServiceSupabase>,
  assignmentId: string,
) {
  const { data: assignment, error } = await supabase
    .from("swayger_commercial_assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (error) throw error;
  if (!assignment) return null;
  const { data: offer } = await supabase
    .from("swayger_commercial_offers")
    .select("*")
    .eq("id", assignment.offer_id)
    .maybeSingle();
  const room = validUuid(assignment.target_id)
    ? await getEligibleRoom(supabase, assignment.target_type, assignment.target_id)
    : null;
  return { ...assignment, offer: offer ?? null, target: room ?? null };
}

function safeOffer(offer: any) {
  if (!offer) return null;
  return {
    id: offer.id,
    provider: offer.provider,
    resource_type: offer.source_resource_type,
    external_id: offer.source_external_id,
    program_id: offer.program_id,
    program_name: offer.program_name,
    brand_id: offer.brand_id,
    brand_name: offer.brand_name,
    title: offer.title,
    description: offer.description,
    availability: offer.availability,
    tracking_url: offer.tracking_url,
    landing_page_url: offer.landing_page_url,
    creative_url: offer.creative_url,
    creative_type: offer.creative_type,
    creative_width: offer.creative_width,
    creative_height: offer.creative_height,
    promo_code: offer.promo_code,
    discount_type: offer.discount_type,
    discount_amount: offer.discount_amount,
    discount_currency: offer.discount_currency,
    discount_percent: offer.discount_percent,
    minimum_purchase_amount: offer.minimum_purchase_amount,
    maximum_savings_amount: offer.maximum_savings_amount,
    start_at: offer.start_at,
    end_at: offer.end_at,
    source_updated_at: offer.source_updated_at,
    disclosure: offer.disclosure || OFFER_DISCLOSURE,
    status: offer.status,
  };
}

export function registerCommercialRoutes(app: Express): void {
  app.get("/api/admin/commercial/offers", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from("swayger_commercial_offers")
        .select("*")
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      res.json({ ok: true, offers: (data ?? []).map(safeOffer) });
    } catch (error) {
      console.error("[commercial] offers list failed:", error instanceof Error ? error.message : "unknown");
      res.status(503).json({ ok: false, error: "Commercial offers are unavailable." });
    }
  });

  app.post("/api/admin/commercial/offers", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const normalized = normalizeOfferInput(req.body?.item);
    if ("error" in normalized) {
      res.status(400).json({ ok: false, error: normalized.error });
      return;
    }
    try {
      const supabase = getServiceSupabase();
      const existingQuery = supabase
        .from("swayger_commercial_offers")
        .select("*")
        .eq("provider", normalized.provider)
        .eq("source_resource_type", normalized.source_resource_type);
      const existing = normalized.source_external_id
        ? await existingQuery.eq("source_external_id", normalized.source_external_id).maybeSingle()
        : { data: null, error: null };
      if (existing.error) throw existing.error;
      if (existing.data) {
        const { data, error } = await supabase
          .from("swayger_commercial_offers")
          .update({ ...normalized, status: existing.data.status === "archived" ? "saved" : existing.data.status })
          .eq("id", existing.data.id)
          .select("*")
          .single();
        if (error) throw error;
        res.json({ ok: true, already_saved: true, offer: safeOffer(data) });
        return;
      }
      const { data, error } = await supabase
        .from("swayger_commercial_offers")
        .insert(normalized)
        .select("*")
        .single();
      if (error) throw error;
      res.status(201).json({ ok: true, already_saved: false, offer: safeOffer(data) });
    } catch (error) {
      console.error("[commercial] offer save failed:", error instanceof Error ? error.message : "unknown");
      res.status(503).json({ ok: false, error: "Could not save the Swayger Offer." });
    }
  });

  app.get("/api/admin/commercial/targets", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const type = targetType(req.query.target_type);
    if (!type) {
      res.status(400).json({ ok: false, error: "target_type must be fantasy_weekly or game_day." });
      return;
    }
    try {
      const targets = await listEligibleTargets(getServiceSupabase(), type);
      res.json({ ok: true, targets });
    } catch (error) {
      console.error("[commercial] targets list failed:", error instanceof Error ? error.message : "unknown");
      res.status(503).json({ ok: false, error: "Commercial targets are unavailable." });
    }
  });

  app.get("/api/admin/commercial/assignments", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    try {
      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from("swayger_commercial_assignments")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const assignments = [];
      for (const assignment of data ?? []) assignments.push(await getAssignment(supabase, assignment.id));
      res.json({ ok: true, assignments: assignments.filter(Boolean) });
    } catch (error) {
      console.error("[commercial] assignments list failed:", error instanceof Error ? error.message : "unknown");
      res.status(503).json({ ok: false, error: "Commercial assignments are unavailable." });
    }
  });

  app.post("/api/admin/commercial/assignments", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const type = targetType(req.body?.target_type);
    const offerId = req.body?.offer_id;
    const targetId = req.body?.target_id;
    if (!type || !validUuid(offerId) || !validUuid(targetId)) {
      res.status(400).json({ ok: false, error: "A valid offer, target type, and target are required." });
      return;
    }
    try {
      const supabase = getServiceSupabase();
      const room = await getEligibleRoom(supabase, type, targetId);
      if (!room) {
        res.status(409).json({ ok: false, error: "That target is no longer eligible for commercial placement." });
        return;
      }
      const { data: offer } = await supabase
        .from("swayger_commercial_offers")
        .select("id, status")
        .eq("id", offerId)
        .maybeSingle();
      if (!offer || offer.status === "archived") {
        res.status(404).json({ ok: false, error: "Swayger Offer not found." });
        return;
      }
      const { data: existing } = await supabase
        .from("swayger_commercial_assignments")
        .select("*")
        .eq("offer_id", offerId)
        .eq("target_type", type)
        .eq("target_id", targetId)
        .maybeSingle();
      if (existing) {
        const assignment = await getAssignment(supabase, existing.id);
        res.json({ ok: true, already_assigned: true, assignment });
        return;
      }
      const { data, error } = await supabase
        .from("swayger_commercial_assignments")
        .insert({ offer_id: offerId, target_type: type, target_id: targetId, status: "draft" })
        .select("id")
        .single();
      if (error) throw error;
      res.status(201).json({ ok: true, already_assigned: false, assignment: await getAssignment(supabase, data.id) });
    } catch (error) {
      console.error("[commercial] assignment save failed:", error instanceof Error ? error.message : "unknown");
      res.status(503).json({ ok: false, error: "Could not assign the Swayger Offer." });
    }
  });

  app.post("/api/admin/commercial/assignments/:assignmentId/publish", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const { assignmentId } = req.params;
    if (!validUuid(assignmentId)) {
      res.status(400).json({ ok: false, error: "Invalid assignment." });
      return;
    }
    try {
      const supabase = getServiceSupabase();
      const { data: current } = await supabase
        .from("swayger_commercial_assignments")
        .select("*")
        .eq("id", assignmentId)
        .maybeSingle();
      if (!current) {
        res.status(404).json({ ok: false, error: "Assignment not found." });
        return;
      }
      const room = await getEligibleRoom(supabase, current.target_type, current.target_id);
      if (!room) {
        res.status(409).json({ ok: false, error: "That target is no longer eligible for publishing." });
        return;
      }
      if (current.status === "published") {
        res.json({ ok: true, already_published: true, assignment: await getAssignment(supabase, assignmentId) });
        return;
      }
      const { data, error } = await supabase
        .from("swayger_commercial_assignments")
        .update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", assignmentId)
        .select("id")
        .single();
      if (error) {
        if ((error as any).code === "23505") {
          res.status(409).json({ ok: false, error: "This placement target already has a published offer." });
          return;
        }
        throw error;
      }
      res.json({ ok: true, already_published: false, assignment: await getAssignment(supabase, data.id) });
    } catch (error) {
      console.error("[commercial] assignment publish failed:", error instanceof Error ? error.message : "unknown");
      res.status(503).json({ ok: false, error: "Could not publish the assignment." });
    }
  });

  app.post("/api/admin/commercial/assignments/:assignmentId/unpublish", async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const { assignmentId } = req.params;
    if (!validUuid(assignmentId)) {
      res.status(400).json({ ok: false, error: "Invalid assignment." });
      return;
    }
    try {
      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from("swayger_commercial_assignments")
        .update({ status: "unpublished", published_at: null, updated_at: new Date().toISOString() })
        .eq("id", assignmentId)
        .select("id")
        .single();
      if (error || !data) {
        res.status(404).json({ ok: false, error: "Assignment not found." });
        return;
      }
      res.json({ ok: true, assignment: await getAssignment(supabase, data.id) });
    } catch (error) {
      console.error("[commercial] assignment unpublish failed:", error instanceof Error ? error.message : "unknown");
      res.status(503).json({ ok: false, error: "Could not unpublish the assignment." });
    }
  });

  // Participant-safe, provider-neutral read. It intentionally returns no
  // provider payload or admin credential and returns an empty offer on errors
  // so a commercial outage cannot block a core Swayger experience.
  app.get("/api/commercial/placements/:targetType/:targetId", async (req: Request, res: Response) => {
    const type = targetType(req.params.targetType);
    const targetId = req.params.targetId;
    if (!type || !validUuid(targetId)) {
      res.json({ ok: true, offer: null });
      return;
    }
    try {
      const supabase = getServiceSupabase();
      const room = await getEligibleRoom(supabase, type, targetId);
      if (!room) {
        res.json({ ok: true, offer: null });
        return;
      }
      const { data: assignment } = await supabase
        .from("swayger_commercial_assignments")
        .select("id, offer_id, target_type, target_id, status")
        .eq("target_type", type)
        .eq("target_id", targetId)
        .eq("status", "published")
        .maybeSingle();
      if (!assignment) {
        res.json({ ok: true, offer: null });
        return;
      }
      const now = new Date().toISOString();
      const { data: offer } = await supabase
        .from("swayger_commercial_offers")
        .select("*")
        .eq("id", assignment.offer_id)
        .eq("status", "saved")
        .or(`start_at.is.null,start_at.lte.${now}`)
        .or(`end_at.is.null,end_at.gte.${now}`)
        .maybeSingle();
      res.json({
        ok: true,
        offer: offer ? {
          ...safeOffer(offer),
          assignment_id: assignment.id,
          target_type: type,
          target_id: targetId,
        } : null,
      });
    } catch (error) {
      console.warn("[commercial] participant placement unavailable:", error instanceof Error ? error.message : "unknown");
      res.json({ ok: true, offer: null });
    }
  });
}