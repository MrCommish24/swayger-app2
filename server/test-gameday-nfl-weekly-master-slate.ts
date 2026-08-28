/**
 * Disposable integration coverage for the NFL weekly master slate admin model.
 *
 * Prerequisite: apply supabase/gameday-nfl-weekly-master-slate.sql.
 * Run: npx tsx server/test-gameday-nfl-weekly-master-slate.ts
 */

import * as dotenv from "dotenv";
import express from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

let passed = 0;
let failed = 0;

function expect(label: string, condition: unknown, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type ApiResponse = { status: number; body: any };

async function main() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const adminToken = process.env.MM_ADMIN_TOKEN;
  if (!url || !serviceKey || !anonKey || !adminToken) {
    throw new Error("Required Supabase and MM_ADMIN_TOKEN configuration is unavailable");
  }

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = unique("weekly-master-slate");
  const seasonYear = 2100;
  const weekNumber = Number(runId.replace(/\D/g, "").slice(-3)) || 1;
  const slateName = `NFL Sunday Slate ${runId}`;
  const table = "nfl_weekly_slate_templates";
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/gameday-nfl-weekly-master-slate.sql"),
    "utf8",
  );

  const validCandidates = {
    early_matchups: [" Bears vs Packers ", "", "Eagles vs Cowboys", "Bears vs Packers"],
    late_matchups: [" Chiefs vs Raiders ", "Rams vs Seahawks"],
    sunday_night_teams: [" Ravens ", "Bills"],
    qb_candidates: [" Lamar Jackson ", "Josh Allen", "Lamar Jackson"],
    rb_candidates: [" Derrick Henry ", "Saquon Barkley"],
    receiver_candidates: [" Justin Jefferson ", "CeeDee Lamb"],
    team_candidates: [" Bears ", "Packers", "Bears"],
    game_candidates: [" Bears vs Packers ", "Chiefs vs Raiders"],
  };

  const { registerGamedayRoutes } = await import("./routes-gameday");
  const app = express();
  app.use(express.json());
  registerGamedayRoutes(app);
  let server: Server | null = null;

  try {
    server = await new Promise<Server>((resolveServer) => {
      const created = app.listen(0, "127.0.0.1", () => resolveServer(created));
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    async function request(
      path: string,
      options: {
        method?: string;
        authorized?: boolean;
        body?: Record<string, unknown>;
        headers?: Record<string, string>;
      } = {},
    ): Promise<ApiResponse> {
      const headers: Record<string, string> = { ...(options.headers ?? {}) };
      if (options.authorized) headers["x-admin-token"] = adminToken!;
      if (options.body) headers["Content-Type"] = "application/json";
      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      return {
        status: response.status,
        body: await response.json().catch(() => ({})),
      };
    }

    const endpoint = "/api/gameday/admin/nfl-weekly-slates";

    expect("migration defines the master slate table", new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`, "i").test(migration));
    expect("migration enables row-level security", /ENABLE ROW LEVEL SECURITY/i.test(migration));
    expect("migration allows archived replacement", /WHERE status <> 'archived'/i.test(migration));

    const unauthorized = await request(endpoint);
    expect("admin routes reject missing credentials", unauthorized.status === 401, JSON.stringify(unauthorized.body));

    const browserProbe = await anon.from(table).select("id").limit(1);
    expect("anonymous table access is blocked", !!browserProbe.error, browserProbe.error?.message);

    const missingFields = await request(endpoint, {
      method: "POST",
      authorized: true,
      body: { season_year: seasonYear },
    });
    expect("draft creation requires week and slate name", missingFields.status === 400);

    const invalidCandidates = await request(endpoint, {
      method: "POST",
      authorized: true,
      body: {
        season_year: seasonYear,
        week_number: weekNumber,
        slate_name: slateName,
        early_matchups: "not-an-array",
      },
    });
    expect("candidate fields must be arrays", invalidCandidates.status === 400);

    const created = await request(endpoint, {
      method: "POST",
      authorized: true,
      headers: { "x-admin-email": "admin@example.test" },
      body: {
        season_year: seasonYear,
        week_number: weekNumber,
        slate_name: `  ${slateName}  `,
        slate_label: " Week 1 Sunday ",
        ...validCandidates,
      },
    });
    const slateId = created.body.slate?.id as string | undefined;
    expect(
      "admin can create a draft master slate",
      created.status === 201 &&
        created.body.ok === true &&
        !!slateId &&
        created.body.slate?.status === "draft" &&
        created.body.slate?.slate_name === slateName &&
        created.body.slate?.created_by_email === "admin@example.test",
      JSON.stringify(created.body),
    );
    expect(
      "candidate arrays trim, remove empties, and dedupe in order",
      JSON.stringify(created.body.slate?.early_matchups) === JSON.stringify(["Bears vs Packers", "Eagles vs Cowboys"]) &&
        JSON.stringify(created.body.slate?.qb_candidates) === JSON.stringify(["Lamar Jackson", "Josh Allen"]),
      JSON.stringify(created.body.slate),
    );
    if (!slateId) throw new Error("Create did not return a slate ID");

    const duplicate = await request(endpoint, {
      method: "POST",
      authorized: true,
      body: {
        season_year: seasonYear,
        week_number: weekNumber,
        slate_name: `${slateName} duplicate`,
      },
    });
    expect("only one non-archived slate is allowed per season and week", duplicate.status === 409);

    const list = await request(`${endpoint}?season_year=${seasonYear}&week_number=${weekNumber}&status=draft`, {
      authorized: true,
    });
    expect(
      "list endpoint filters and returns the created draft",
      list.status === 200 &&
        list.body.ok === true &&
        list.body.slates?.length === 1 &&
        list.body.slates[0]?.id === slateId,
      JSON.stringify(list.body),
    );

    const detail = await request(`${endpoint}/${slateId}`, { authorized: true });
    expect("detail endpoint returns the stored slate", detail.status === 200 && detail.body.slate?.id === slateId);

    const updated = await request(`${endpoint}/${slateId}`, {
      method: "PATCH",
      authorized: true,
      body: {
        slate_label: " Updated Sunday ",
        late_matchups: [" Chiefs vs Raiders ", "", "Chiefs vs Raiders", "Rams vs Seahawks"],
      },
    });
    expect(
      "draft slate can be updated with normalized content",
      updated.status === 200 &&
        updated.body.slate?.slate_label === "Updated Sunday" &&
        JSON.stringify(updated.body.slate?.late_matchups) === JSON.stringify(["Chiefs vs Raiders", "Rams vs Seahawks"]),
      JSON.stringify(updated.body),
    );

    const incompleteApproval = await request(`${endpoint}/${slateId}/approve`, {
      method: "POST",
      authorized: true,
    });
    expect(
      "approval rejects incomplete candidate groups",
      incompleteApproval.status === 400 &&
        incompleteApproval.body.code === "WEEKLY_SLATE_APPROVAL_INVALID" &&
        incompleteApproval.body.missing?.includes("sunday_night_teams (exactly two teams required)"),
      JSON.stringify(incompleteApproval.body),
    );

    const completed = await request(`${endpoint}/${slateId}`, {
      method: "PATCH",
      authorized: true,
      body: {
        ...validCandidates,
        sunday_night_teams: [" Ravens ", "Bills"],
      },
    });
    expect("draft can be completed before approval", completed.status === 200);

    const approved = await request(`${endpoint}/${slateId}/approve`, {
      method: "POST",
      authorized: true,
      headers: { "x-admin-email": "approver@example.test" },
    });
    expect(
      "approval succeeds and stores approved metadata",
      approved.status === 200 &&
        approved.body.slate?.status === "approved" &&
        approved.body.slate?.approved_by_email === "approver@example.test" &&
        typeof approved.body.slate?.approved_at === "string",
      JSON.stringify(approved.body),
    );

    const casualApprovedEdit = await request(`${endpoint}/${slateId}`, {
      method: "PATCH",
      authorized: true,
      body: { slate_name: "Casual edit" },
    });
    expect("approved slate edits require an explicit draft reset", casualApprovedEdit.status === 409);

    const resetToDraft = await request(`${endpoint}/${slateId}`, {
      method: "PATCH",
      authorized: true,
      body: { status: "draft", slate_name: "Edited and reset" },
    });
    expect(
      "approved slate can be explicitly reset to draft",
      resetToDraft.status === 200 &&
        resetToDraft.body.slate?.status === "draft" &&
        resetToDraft.body.slate?.approved_at === null,
      JSON.stringify(resetToDraft.body),
    );

    const approvedAgain = await request(`${endpoint}/${slateId}/approve`, {
      method: "POST",
      authorized: true,
    });
    expect("a reset draft can be approved again", approvedAgain.status === 200 && approvedAgain.body.slate?.status === "approved");

    const archived = await request(`${endpoint}/${slateId}/archive`, {
      method: "POST",
      authorized: true,
    });
    expect(
      "archive marks the row archived without deleting it",
      archived.status === 200 && archived.body.slate?.status === "archived",
      JSON.stringify(archived.body),
    );

    const archivedDetail = await request(`${endpoint}/${slateId}`, { authorized: true });
    expect("archived slate remains retrievable", archivedDetail.status === 200 && archivedDetail.body.slate?.status === "archived");

    const replacement = await request(endpoint, {
      method: "POST",
      authorized: true,
      body: {
        season_year: seasonYear,
        week_number: weekNumber,
        slate_name: `${slateName} replacement`,
      },
    });
    const replacementId = replacement.body.slate?.id as string | undefined;
    expect(
      "archived rows do not block a replacement slate",
      replacement.status === 201 &&
        !!replacementId &&
        replacement.body.slate?.status === "draft",
      JSON.stringify(replacement.body),
    );

    const roomCount = await service.from("gameday_rooms").select("id", { count: "exact", head: true });
    expect("master slate creation does not write Game Day rooms", !roomCount.error, roomCount.error?.message);

    if (replacementId) {
      await service.from(table).delete().in("id", [slateId, replacementId]);
    } else {
      await service.from(table).delete().eq("id", slateId);
    }
  } finally {
    await service.from(table).delete().eq("slate_name", slateName);
    if (server) await new Promise<void>((resolveClose) => server!.close(() => resolveClose()));
  }

  console.log(`\nNFL WEEKLY MASTER SLATE ADMIN: ${passed}/${passed + failed} assertions passed`);
  if (failed) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error("\nNFL weekly master slate suite failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });