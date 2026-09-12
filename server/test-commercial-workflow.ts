import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = process.env.TEST_API_BASE ?? "http://127.0.0.1:5000";

async function jsonRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, init);
  return { response, body: await response.json() as Record<string, unknown> };
}

async function main() {
  const migration = await readFile("supabase/gameday-commercial-offers.sql", "utf8");
  const routes = await readFile("server/routes-commercial.ts", "utf8");

  // Every admin read/write path keeps the existing admin-token boundary.
  for (const path of [
    "/api/admin/commercial/offers",
    "/api/admin/commercial/assignments",
    "/api/admin/commercial/targets?target_type=game_day",
  ]) {
    const { response, body } = await jsonRequest(path);
    assert.equal(response.status, 401, `${path} must reject unauthenticated reads`);
    assert.equal(body.ok, false);
  }

  for (const [path, body] of [
    ["/api/admin/commercial/offers", { item: { provider: "impact", resource_type: "deal", title: "test" } }],
    ["/api/admin/commercial/assignments", { offer_id: "00000000-0000-4000-8000-000000000000", target_type: "game_day", target_id: "00000000-0000-4000-8000-000000000000" }],
  ] as const) {
    const unauthenticatedWrite = await jsonRequest(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(unauthenticatedWrite.response.status, 401);
  }

  for (const path of [
    "/api/admin/commercial/assignments/00000000-0000-4000-8000-000000000000/publish",
    "/api/admin/commercial/assignments/00000000-0000-4000-8000-000000000000/unpublish",
  ]) {
    const unauthenticatedWrite = await jsonRequest(path, { method: "POST" });
    assert.equal(unauthenticatedWrite.response.status, 401);
  }

  // Participant reads fail open and never expose provider data when no placement exists.
  const emptyPlacement = await jsonRequest(
    "/api/commercial/placements/game_day/00000000-0000-4000-8000-000000000000",
  );
  assert.equal(emptyPlacement.response.status, 200);
  assert.deepEqual(emptyPlacement.body, { ok: true, offer: null });

  // Keep the database-enforced publish invariant and draft-first lifecycle intact.
  assert.match(migration, /status\s+TEXT NOT NULL DEFAULT 'draft'/);
  assert.match(migration, /WHERE status = 'published'/);
  assert.match(migration, /swayger_commercial_one_published_per_target/);
  assert.match(migration, /UNIQUE \(offer_id, target_type, target_id\)/);
  assert.match(migration, /status\s+TEXT NOT NULL DEFAULT 'saved'/);
  assert.match(routes, /safeOffer/);
  assert.match(routes, /normalizeOfferInput/);
  assert.match(routes, /source_resource_type/);
  assert.match(routes, /OFFER_DISCLOSURE/);
  assert.match(routes, /23505/);
  assert.match(routes, /requireAdmin\(req, res\)/);
  assert.match(routes, /offer: null/);

  console.log("Commercial workflow regression: PASS");
}

void main();