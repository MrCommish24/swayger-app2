/**
 * Self-contained Fantasy Weekly Global Receipt integration suite.
 *
 * The only required configuration is the same Supabase/API configuration used
 * by the Phase 5 suites. The suite creates all identities and league data,
 * exercises the public API, archives the league, then removes its fixture.
 *
 * Run:
 *   TEST_API_BASE=http://localhost:5000 npx tsx server/test-fantasy-weekly-receipt.ts
 */

import { createClient } from "@supabase/supabase-js";

const BASE = process.env.TEST_API_BASE ?? "http://localhost:5000";
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string, detail?: unknown): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed += 1;
  } else {
    console.error(`  ✗ ${message}`, detail === undefined ? "" : detail);
    failed += 1;
    failures.push(message);
  }
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

async function api(
  method: string,
  path: string,
  token: string | null,
  body?: object,
  guestToken?: string,
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  if (guestToken) headers["X-Fantasy-Guest-Token"] = guestToken;
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) headers["Idempotency-Key"] = idempotencyKey();

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: any = {};
  try { data = await response.json(); } catch { /* empty response */ }
  return { status: response.status, data };
}

async function redirect(path: string): Promise<{ status: number; location: string | null }> {
  const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
  return { status: response.status, location: response.headers.get("location") };
}

async function createUser(prefix: string): Promise<{
  id: string;
  email: string;
  password: string;
}> {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@test-weekly-receipt.com`;
  const password = "P@ssw0rd123!";
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message ?? "missing user"}`);
  return { id: data.user.id, email, password };
}

async function signIn(user: { email: string; password: string }): Promise<string> {
  const { data, error } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    .auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !data.session) throw new Error(`signIn failed: ${error?.message ?? "missing session"}`);
  return data.session.access_token;
}

interface Context {
  leagueId: string;
  seasonId: string;
  comm: { user: Awaited<ReturnType<typeof createUser>>; token: string };
  coComm: { user: Awaited<ReturnType<typeof createUser>>; token: string };
  member: { user: Awaited<ReturnType<typeof createUser>>; token: string };
  guest: { token: string; guestToken: string };
  outsider: { user: Awaited<ReturnType<typeof createUser>>; token: string };
  templateIds: string[];
}

async function addSeat(
  ctx: Pick<Context, "leagueId" | "seasonId" | "comm">,
  displayName: string,
  teamName: string,
): Promise<{ leagueMemberId: string; seasonMemberId: string }> {
  const result = await api(
    "POST",
    `/api/fantasy/leagues/${ctx.leagueId}/seasons/${ctx.seasonId}/participants`,
    ctx.comm.token,
    { display_name: displayName, team_name: teamName },
  );
  if (result.status !== 201) throw new Error(`add seat failed: ${JSON.stringify(result.data)}`);
  return {
    leagueMemberId: result.data.league_member_id,
    seasonMemberId: result.data.season_member_id,
  };
}

async function claimAccount(ctx: Context, token: string, leagueMemberId: string): Promise<void> {
  const result = await api(
    "POST",
    `/api/fantasy/leagues/${ctx.leagueId}/seasons/${ctx.seasonId}/claim`,
    token,
    { league_member_id: leagueMemberId },
  );
  if (![200, 201].includes(result.status)) throw new Error(`claim failed: ${JSON.stringify(result.data)}`);
}

async function publish(ctx: Context, week: number, templateIds: string[]): Promise<any> {
  const result = await api(
    "POST",
    `/api/fantasy/leagues/${ctx.leagueId}/seasons/${ctx.seasonId}/weeks/${week}/publish`,
    ctx.comm.token,
    { selected_prop_ids: templateIds },
  );
  if (![200, 201].includes(result.status)) throw new Error(`publish Week ${week} failed: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function pickEveryProp(
  ctx: Context,
  week: number,
  props: any[],
  identities: Array<{ token: string | null; guestToken?: string }>,
): Promise<void> {
  for (const identity of identities) {
    for (const prop of props) {
      const answer = prop.answer_options?.[0]?.id;
      if (!answer) throw new Error(`Week ${week} prop has no answer options`);
      const result = await api(
        "POST",
        `/api/fantasy/leagues/${ctx.leagueId}/seasons/${ctx.seasonId}/weeks/${week}/picks`,
        identity.token,
        { prop_id: prop.id, selected_answer: answer },
        identity.guestToken,
      );
      if (result.status !== 200) throw new Error(`pick failed: ${JSON.stringify(result.data)}`);
    }
  }
}

async function lockSettleFinalize(
  ctx: Context,
  week: number,
  settleAnswers?: (prop: any) => string[],
): Promise<void> {
  const base = `/api/fantasy/leagues/${ctx.leagueId}/seasons/${ctx.seasonId}/weeks/${week}`;
  const lock = await api("POST", `${base}/lock`, ctx.comm.token);
  if (lock.status !== 200) throw new Error(`lock Week ${week} failed: ${JSON.stringify(lock.data)}`);

  const settlement = await api("GET", `${base}/settlement`, ctx.comm.token);
  if (settlement.status !== 200) throw new Error(`settlement Week ${week} failed: ${JSON.stringify(settlement.data)}`);
  for (const prop of settlement.data.competition_props ?? []) {
    const answers = settleAnswers?.(prop) ?? [prop.answer_options?.[0]?.id];
    const result = await api("POST", `${base}/settle`, ctx.comm.token, {
      prop_id: prop.id,
      correct_answers: answers,
    });
    if (result.status !== 200) throw new Error(`settle Week ${week} failed: ${JSON.stringify(result.data)}`);
  }

  const finalize = await api("POST", `${base}/finalize`, ctx.comm.token);
  if (finalize.status !== 200) throw new Error(`finalize Week ${week} failed: ${JSON.stringify(finalize.data)}`);
}

function receiptPublicPayload(data: any): any {
  return {
    finalized: data.finalized,
    league_name: data.league_name,
    week_number: data.week_number,
    season_year: data.season_year,
    winners: data.winners,
    standings: data.standings,
    leaderboard: data.leaderboard,
    final_standings: data.final_standings,
    competition_props: data.competition_props,
    total_competition_props: data.total_competition_props,
    league_picks: data.league_picks,
    next_week: data.next_week,
    next_week_number: data.next_week_number,
    next_week_published: data.next_week_published,
  };
}

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  console.log("\n▸ Fantasy Weekly Global Receipt — self-contained integration");
  const users: Array<{ id: string }> = [];
  let leagueId: string | null = null;
  let seasonId: string | null = null;
  let ctx: Context | null = null;

  try {
    const commUser = await createUser("weekly-receipt-comm");
    const coCommUser = await createUser("weekly-receipt-cocomm");
    const memberUser = await createUser("weekly-receipt-member");
    const guestUser = await createUser("weekly-receipt-guest");
    const outsiderUser = await createUser("weekly-receipt-outsider");
    users.push(commUser, coCommUser, memberUser, guestUser, outsiderUser);

    const commToken = await signIn(commUser);
    const coCommToken = await signIn(coCommUser);
    const memberToken = await signIn(memberUser);
    const outsiderToken = await signIn(outsiderUser);
    const guestToken = `weekly-receipt-guest-${crypto.randomUUID()}`;

    const setup = await api("POST", "/api/fantasy/leagues/setup", commToken, {
      league_name: `Weekly Receipt ${Date.now()}`,
      sport: "football",
      display_name: "Receipt Commissioner",
      team_name: "Commissioner Team",
      season_year: 2026,
    });
    if (setup.status !== 201) throw new Error(`setup failed: ${JSON.stringify(setup.data)}`);
    leagueId = setup.data.league_id;
    seasonId = setup.data.season_id;

    const partial = {
      leagueId,
      seasonId,
      comm: { user: commUser, token: commToken },
    };
    const memberSeat = await addSeat(partial, "Receipt Member", "Member Team");
    const guestSeat = await addSeat(partial, "Receipt Guest", "Guest Team");
    const coCommSeat = await addSeat(partial, "Receipt Co-Commissioner", "Co-Commissioner Team");

    await claimAccount(
      { leagueId, seasonId, comm: partial.comm } as Context,
      memberToken,
      memberSeat.leagueMemberId,
    );
    const guestClaim = await api(
      "POST",
      `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/claim`,
      null,
      { league_member_id: guestSeat.leagueMemberId },
      guestToken,
    );
    if (![200, 201].includes(guestClaim.status)) throw new Error(`guest claim failed: ${JSON.stringify(guestClaim.data)}`);

    const coClaim = await service.from("fantasy_member_claims").insert({
      user_id: coCommUser.id,
      league_member_id: coCommSeat.leagueMemberId,
      is_active: true,
    });
    if (coClaim.error) throw new Error(`co-commissioner claim failed: ${coClaim.error.message}`);
    const coRole = await service
      .from("fantasy_season_members")
      .update({ role: "co_commissioner" })
      .eq("id", coCommSeat.seasonMemberId);
    if (coRole.error) throw new Error(`co-commissioner role failed: ${coRole.error.message}`);

    const templateResponse = await api(
      "GET",
      `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/1/templates`,
      commToken,
    );
    const templateIds = (templateResponse.data.templates ?? [])
      .filter((template: any) => template.is_default)
      .map((template: any) => template.id)
      .slice(0, 3);
    if (templateResponse.status !== 200 || templateIds.length < 1) {
      throw new Error(`weekly templates unavailable: ${JSON.stringify(templateResponse.data)}`);
    }

    ctx = {
      leagueId,
      seasonId,
      comm: { user: commUser, token: commToken },
      coComm: { user: coCommUser, token: coCommToken },
      member: { user: memberUser, token: memberToken },
      guest: { token: "", guestToken },
      outsider: { user: outsiderUser, token: outsiderToken },
      templateIds,
    };

    const week1 = await publish(ctx, 1, templateIds.slice(0, 1));
    const week1Base = `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/1`;
    const week1Play = await api("GET", `${week1Base}/play`, commToken);
    await pickEveryProp(ctx, 1, week1Play.data.props ?? [], [{ token: commToken }]);
    await lockSettleFinalize(ctx, 1);

    // Week 1 is a single-winner receipt. Before Week 2 exists, next-week is
    // explicitly unpublished.
    const week1ReceiptBeforeNext = await api("GET", `${week1Base}/receipt`, commToken);
    assert(week1ReceiptBeforeNext.status === 200 && week1ReceiptBeforeNext.data.finalized === true, "Finalized Week 1 receipt is available");
    assert(week1ReceiptBeforeNext.data.winners?.length === 1, "Single-winner receipt has one winner");
    assert(week1ReceiptBeforeNext.data.next_week_published === false, "Week 2 is initially unpublished");

    // Week 2 has every claimed member pick the same answer, producing a
    // deterministic co-winner fixture while still exercising guest access.
    const week2 = await publish(ctx, 2, ctx.templateIds);
    const week2Base = `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/2`;
    const week2Play = await api("GET", `${week2Base}/play`, commToken);
    assert(week2Play.status === 200, "Published Week 2 play card is readable before finalization");
    await pickEveryProp(ctx, 2, week2Play.data.props ?? [], [
      { token: commToken },
      { token: coCommToken },
      { token: memberToken },
      { token: null, guestToken },
    ]);

    const preFinal = await api("GET", `${week2Base}/receipt`, commToken);
    assert(preFinal.status === 200 && preFinal.data.finalized === false, "Pre-finalized receipt is gated");

    let multiCorrectPropId: string | null = null;
    await lockSettleFinalize(ctx, 2, (prop) => {
      const ids = (prop.answer_options ?? []).map((option: any) => option.id).filter(Boolean);
      if (!multiCorrectPropId && ids.length >= 2) multiCorrectPropId = prop.id;
      return ids.length >= 2 && prop.id === multiCorrectPropId ? ids.slice(0, 2) : ids.slice(0, 1);
    });

    // Publish Week 3 so the Week 2 receipt has an explicit re-engagement state.
    const week3 = await publish(ctx, 3, ctx.templateIds.slice(0, 1));
    const week3Base = `/api/fantasy/leagues/${leagueId}/seasons/${seasonId}/weeks/3`;
    const week3Play = await api("GET", `${week3Base}/play`, commToken);
    await pickEveryProp(ctx, 3, week3Play.data.props ?? [], [{ token: commToken }]);
    await lockSettleFinalize(ctx, 3);

    const receiptPath = `${week2Base}/receipt`;
    const aliasPath = `${receiptPath}/alias`;
    const commissionerReceipt = await api("GET", receiptPath, commToken);
    assert(commissionerReceipt.status === 200 && commissionerReceipt.data.finalized === true, "Commissioner can read finalized Week 2 receipt");
    assert(commissionerReceipt.data.week_number === 2 && commissionerReceipt.data.season_year === 2026, "Receipt contains week and season year");
    assert(commissionerReceipt.data.next_week_published === true && commissionerReceipt.data.next_week_number === 3, "Receipt reports published Week 3 metadata");
    assert(Array.isArray(commissionerReceipt.data.winners) && commissionerReceipt.data.winners.length > 1, "Co-winner receipt preserves all tied winners");
    assert(
      Array.isArray(commissionerReceipt.data.standings) &&
        JSON.stringify(commissionerReceipt.data.standings) === JSON.stringify(commissionerReceipt.data.leaderboard),
      "Final standings and leaderboard are consistent",
    );
    assert(
      (commissionerReceipt.data.competition_props ?? []).length === commissionerReceipt.data.total_competition_props &&
        (commissionerReceipt.data.competition_props ?? []).every((prop: any) =>
          typeof prop.template_prop_id === "string" &&
          Array.isArray(prop.correct_answer_ids) &&
          Array.isArray(prop.correct_answer_labels) &&
          prop.correct_answer_ids.length === prop.correct_answer_labels.length,
        ),
      "Receipt includes stable template IDs and normalized correct-answer arrays",
    );
    assert(
      Boolean(multiCorrectPropId) &&
        commissionerReceipt.data.competition_props.some((prop: any) =>
          prop.prop_id === multiCorrectPropId && prop.correct_answer_ids.length === 2,
        ),
      "Receipt preserves a multi-correct result",
    );
    assert(
      commissionerReceipt.data.league_picks?.api_path?.endsWith("/weeks/2/league-picks") &&
        commissionerReceipt.data.league_picks?.path?.endsWith("/2/league-picks"),
      "Receipt includes League Picks linkage metadata",
    );
    assert(
      !/(my[_ ]?pick|your pick|is_correct|guest_token|viewer|authorization|token)/i.test(
        JSON.stringify(commissionerReceipt.data),
      ),
      "Receipt payload has no My Picks, viewer correctness, identity, or token fields",
    );

    const memberReceipt = await api("GET", receiptPath, memberToken);
    const guestReceipt = await api("GET", receiptPath, null, undefined, guestToken);
    const coCommReceipt = await api("GET", receiptPath, coCommToken);
    assert(memberReceipt.status === 200 && guestReceipt.status === 200 && coCommReceipt.status === 200, "Member, guest, and co-commissioner can read receipt");
    assert(JSON.stringify(receiptPublicPayload(memberReceipt.data)) === JSON.stringify(receiptPublicPayload(commissionerReceipt.data)), "Regular member receives viewer-independent payload");
    assert(JSON.stringify(receiptPublicPayload(guestReceipt.data)) === JSON.stringify(receiptPublicPayload(commissionerReceipt.data)), "Guest receives viewer-independent payload");
    assert(JSON.stringify(receiptPublicPayload(coCommReceipt.data)) === JSON.stringify(receiptPublicPayload(commissionerReceipt.data)), "Co-commissioner receives viewer-independent payload");

    const outsiderReceipt = await api("GET", receiptPath, outsiderToken);
    assert(outsiderReceipt.status === 403, "Nonmember receipt access is denied");
    const forged = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") +
      "." + Buffer.from(JSON.stringify({ sub: crypto.randomUUID() })).toString("base64url") + ".forged";
    const forgedReceipt = await api("GET", receiptPath, forged);
    const forgedAlias = await api("POST", aliasPath, forged);
    assert(forgedReceipt.status === 401, "Forged bearer receipt access is rejected with 401", forgedReceipt);
    assert(forgedAlias.status === 401, "Forged bearer alias access is rejected with 401", forgedAlias);

    const alias = await api("POST", aliasPath, commToken);
    const aliasAgain = await api("POST", aliasPath, commToken);
    assert(alias.status === 200 && /^[a-z2-7]{16}$/.test(alias.data.short_code ?? ""), "Commissioner can create a weekly alias");
    assert(aliasAgain.status === 200 && aliasAgain.data.short_code === alias.data.short_code, "Repeated alias requests are stable");
    const coAlias = await api("POST", aliasPath, coCommToken);
    const memberAlias = await api("POST", aliasPath, memberToken);
    assert(coAlias.status === 200 && coAlias.data.short_code === alias.data.short_code, "Co-commissioner can retrieve the same alias");
    assert(memberAlias.status === 403, "Regular member cannot create a share alias");

    const canonical = await redirect(`/r/${alias.data.short_code}`);
    assert(canonical.status === 302 && canonical.location === `/fantasy/weeks/${leagueId}/${seasonId}/2/receipt`, "Weekly short alias redirects canonically");
    const malformed = await redirect("/r/not-a-valid-receipt-code");
    const unknown = await redirect("/r/bbbbbbbbbbbbbbbb");
    assert(malformed.status === 404, "Malformed short aliases remain 404");
    assert(unknown.status === 404, "Unknown well-formed aliases remain 404");

    const archive = await api("POST", `/api/fantasy/leagues/${leagueId}/archive`, commToken);
    assert(archive.status === 200 && archive.data.archived === true, "Commissioner can archive the finalized fixture");
    const archivedReceipt = await api("GET", receiptPath, memberToken);
    const archivedRedirect = await redirect(`/r/${alias.data.short_code}`);
    assert(archivedReceipt.status === 200 && archivedReceipt.data.finalized === true, "Finalized receipt remains readable after archive");
    assert(archivedRedirect.status === 302, "Receipt alias remains resolvable after archive");
  } finally {
    if (leagueId) {
      const deleted = await service.from("fantasy_leagues").delete().eq("id", leagueId);
      if (deleted.error) console.error("Fixture league cleanup failed:", deleted.error.message);
    }
    for (const user of users) {
      const deleted = await service.auth.admin.deleteUser(user.id);
      if (deleted.error) console.error("Fixture user cleanup failed:", deleted.error.message);
    }
  }

  console.log(`\nWeekly receipt result: ${passed} passed, ${failed} failed`);
  if (failures.length) console.error("Failures:", failures.join("; "));
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exitCode = 1;
});