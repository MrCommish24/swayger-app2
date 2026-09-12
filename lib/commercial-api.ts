import { fetch } from "expo/fetch";
import { getApiUrl } from "@/lib/query-client";

export type CommercialTargetType = "fantasy_weekly" | "game_day";

export interface CommercialOffer {
  id: string;
  provider: string;
  resource_type: "deal" | "ad";
  external_id: string | null;
  program_id: string | null;
  program_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  title: string;
  description: string | null;
  availability: string | null;
  tracking_url: string | null;
  landing_page_url: string | null;
  creative_url: string | null;
  creative_type: string | null;
  creative_width: number | null;
  creative_height: number | null;
  promo_code: string | null;
  discount_type: string | null;
  discount_amount: number | null;
  discount_currency: string | null;
  discount_percent: number | null;
  minimum_purchase_amount: number | null;
  maximum_savings_amount: number | null;
  start_at: string | null;
  end_at: string | null;
  source_updated_at: string | null;
  disclosure: string;
  status?: string;
  assignment_id?: string;
  target_type?: CommercialTargetType;
  target_id?: string;
}

export interface CommercialTarget {
  target_type: CommercialTargetType;
  target_id: string;
  label: string;
  room_code: string | null;
  matchup: string | null;
  game_date: string | null;
  week_number: number | null;
  status: string;
  participant_count: number;
  published_assignment: {
    id: string;
    offer_id: string;
    status: "published";
  } | null;
}

export interface CommercialAssignment {
  id: string;
  offer_id: string;
  target_type: CommercialTargetType;
  target_id: string;
  status: "draft" | "published" | "unpublished";
  published_at: string | null;
  offer: CommercialOffer | null;
  target: {
    id: string;
    room_name: string | null;
    room_code: string | null;
    game_date: string | null;
    week_number: number | null;
  } | null;
}

export async function getCommercialPlacement(
  targetType: CommercialTargetType,
  targetId: string,
): Promise<CommercialOffer | null> {
  try {
    const url = new URL(
      `/api/commercial/placements/${targetType}/${targetId}`,
      getApiUrl(),
    );
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const json = await response.json() as { ok?: boolean; offer?: CommercialOffer | null };
    return json.ok ? (json.offer ?? null) : null;
  } catch {
    return null;
  }
}

export async function listCommercialOffers(
  adminToken: string,
): Promise<CommercialOffer[]> {
  const response = await fetch(new URL("/api/admin/commercial/offers", getApiUrl()).toString(), {
    headers: { "x-admin-token": adminToken },
  });
  const json = await response.json() as { offers?: CommercialOffer[]; error?: string };
  if (!response.ok) throw new Error(json.error ?? "Could not load Swayger Offers.");
  return json.offers ?? [];
}

export async function saveCommercialOffer(
  adminToken: string,
  item: unknown,
): Promise<CommercialOffer> {
  const response = await fetch(new URL("/api/admin/commercial/offers", getApiUrl()).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify({ item }),
  });
  const json = await response.json() as { offer?: CommercialOffer; error?: string };
  if (!response.ok || !json.offer) throw new Error(json.error ?? "Could not save the Swayger Offer.");
  return json.offer;
}

export async function listCommercialTargets(
  adminToken: string,
  targetType: CommercialTargetType,
): Promise<CommercialTarget[]> {
  const url = new URL("/api/admin/commercial/targets", getApiUrl());
  url.searchParams.set("target_type", targetType);
  const response = await fetch(url.toString(), { headers: { "x-admin-token": adminToken } });
  const json = await response.json() as { targets?: CommercialTarget[]; error?: string };
  if (!response.ok) throw new Error(json.error ?? "Could not load commercial targets.");
  return json.targets ?? [];
}

export async function listCommercialAssignments(
  adminToken: string,
): Promise<CommercialAssignment[]> {
  const response = await fetch(new URL("/api/admin/commercial/assignments", getApiUrl()).toString(), {
    headers: { "x-admin-token": adminToken },
  });
  const json = await response.json() as { assignments?: CommercialAssignment[]; error?: string };
  if (!response.ok) throw new Error(json.error ?? "Could not load commercial assignments.");
  return json.assignments ?? [];
}

export async function assignCommercialOffer(
  adminToken: string,
  offerId: string,
  targetType: CommercialTargetType,
  targetId: string,
): Promise<CommercialAssignment> {
  const response = await fetch(new URL("/api/admin/commercial/assignments", getApiUrl()).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify({ offer_id: offerId, target_type: targetType, target_id: targetId }),
  });
  const json = await response.json() as { assignment?: CommercialAssignment; error?: string };
  if (!response.ok || !json.assignment) throw new Error(json.error ?? "Could not assign the Swayger Offer.");
  return json.assignment;
}

export async function publishCommercialAssignment(
  adminToken: string,
  assignmentId: string,
  publish: boolean,
): Promise<CommercialAssignment> {
  const action = publish ? "publish" : "unpublish";
  const response = await fetch(
    new URL(`/api/admin/commercial/assignments/${assignmentId}/${action}`, getApiUrl()).toString(),
    { method: "POST", headers: { "x-admin-token": adminToken } },
  );
  const json = await response.json() as { assignment?: CommercialAssignment; error?: string };
  if (!response.ok || !json.assignment) throw new Error(json.error ?? `Could not ${action} the assignment.`);
  return json.assignment;
}