import { supabase } from "@/lib/supabase";

interface SchemaCheck {
  name: string;
  status: "ok" | "missing" | "error";
  detail: string;
}

function isRpcMissing(errMsg: string, errCode?: string): boolean {
  const msg = (errMsg || "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("could not find the function") ||
    msg.includes("schema cache") ||
    errCode === "PGRST202" ||
    errCode === "42883"
  );
}

export async function verifyGameplaySchema(): Promise<SchemaCheck[]> {
  const results: SchemaCheck[] = [];

  const requiredCols = [
    "creator_id", "opponent_id", "title", "description", "category",
    "stake_units", "creator_pick", "opponent_pick", "status",
    "expires_at", "settled_outcome", "updated_at",
  ];

  const { data: swData, error: swErr } = await supabase
    .from("swaygers")
    .select(requiredCols.join(", ") + ", id")
    .limit(1);

  if (swErr) {
    results.push({
      name: "swaygers table + v1 columns",
      status: "missing",
      detail: swErr.message,
    });
  } else {
    results.push({
      name: "swaygers table + v1 columns",
      status: "ok",
      detail: `All required columns present (${swData?.length ?? 0} row(s))`,
    });
  }

  const { error: siErr } = await supabase
    .from("swayger_invites")
    .select("id, swayger_id, invite_code")
    .limit(1);

  if (siErr) {
    results.push({
      name: "swayger_invites table",
      status: "missing",
      detail: siErr.message,
    });
  } else {
    results.push({
      name: "swayger_invites table",
      status: "ok",
      detail: "Table exists and is queryable",
    });
  }

  const { error: spErr } = await supabase
    .from("settlement_proposals")
    .select("id, swayger_id, outcome, creator_confirmed, opponent_confirmed")
    .limit(1);

  if (spErr) {
    results.push({
      name: "settlement_proposals table",
      status: "missing",
      detail: spErr.message,
    });
  } else {
    results.push({
      name: "settlement_proposals table",
      status: "ok",
      detail: "Table exists and is queryable",
    });
  }

  const rpcs = [
    { name: "create_swayger", params: { p_title: "test", p_description: null, p_category: "Other", p_stake_units: 1, p_creator_pick: "test", p_invite_code: "ZZZZZZ" } },
    { name: "join_swayger_by_code", params: { p_invite_code: "ZZZZZZ" } },
    { name: "accept_swayger", params: { p_swayger_id: "00000000-0000-0000-0000-000000000000", p_opponent_pick: "test" } },
    { name: "decline_swayger", params: { p_swayger_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "cancel_swayger", params: { p_swayger_id: "00000000-0000-0000-0000-000000000000" } },
    { name: "propose_settlement", params: { p_swayger_id: "00000000-0000-0000-0000-000000000000", p_outcome: "draw" } },
    { name: "confirm_settlement", params: { p_swayger_id: "00000000-0000-0000-0000-000000000000", p_proposal_id: "00000000-0000-0000-0000-000000000000" } },
  ];

  for (const rpc of rpcs) {
    const { error: rpcErr } = await supabase.rpc(rpc.name, rpc.params);
    if (rpcErr) {
      if (isRpcMissing(rpcErr.message, rpcErr.code)) {
        results.push({ name: `RPC ${rpc.name}`, status: "missing", detail: rpcErr.message });
      } else {
        results.push({ name: `RPC ${rpc.name}`, status: "ok", detail: `Exists (runtime: ${rpcErr.message.substring(0, 60)})` });
      }
    } else {
      results.push({ name: `RPC ${rpc.name}`, status: "ok", detail: "Exists and returned" });
    }
  }

  return results;
}

export async function runSchemaVerification(): Promise<void> {
  console.log("[schema-verify] Starting v1.1 schema verification...");
  const checks = await verifyGameplaySchema();
  let allGood = true;

  for (const check of checks) {
    const icon = check.status === "ok" ? "OK" : check.status === "missing" ? "MISSING" : "ERROR";
    const logFn = check.status === "ok" ? console.log : console.error;
    logFn(`[schema-verify] [${icon}] ${check.name}: ${check.detail}`);
    if (check.status !== "ok") allGood = false;
  }

  if (allGood) {
    console.log("[schema-verify] All v1.1 schema checks passed.");
  } else {
    console.error("[schema-verify] Some checks failed. Run 005_fix_schema_to_swaygers.sql in Supabase SQL Editor.");
  }
}
