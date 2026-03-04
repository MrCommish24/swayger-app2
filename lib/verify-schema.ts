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
    msg.includes("is not unique") ||
    errCode === "PGRST202" ||
    errCode === "42883"
  );
}

function isTableMissing(errMsg: string, errCode?: string): boolean {
  const msg = (errMsg || "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("relation") ||
    errCode === "42P01" ||
    errCode === "PGRST204"
  );
}

export async function verifyGameplaySchema(): Promise<SchemaCheck[]> {
  const results: SchemaCheck[] = [];

  const { data: wsData, error: wsErr } = await supabase
    .from("workspaces")
    .select("id, status, stake_text")
    .limit(1);

  if (wsErr) {
    const msg = wsErr.message || "";
    if (msg.includes("status") || msg.includes("stake_text")) {
      results.push({
        name: "workspaces.status + stake_text columns",
        status: "missing",
        detail: `Column missing: ${msg}`,
      });
    } else {
      results.push({
        name: "workspaces table",
        status: "error",
        detail: msg,
      });
    }
  } else {
    results.push({
      name: "workspaces.status + stake_text columns",
      status: "ok",
      detail: `Query succeeded, ${wsData?.length ?? 0} row(s) returned`,
    });
  }

  const tableChecks: Array<{ tableName: string; columns: string }> = [
    { tableName: "swayger_legs", columns: "id, swayger_id, market_type, selection" },
    { tableName: "swayger_responses", columns: "id, swayger_id, user_id, response" },
  ];

  for (const tc of tableChecks) {
    const { error: tErr } = await supabase
      .from(tc.tableName)
      .select(tc.columns)
      .limit(1);

    if (tErr) {
      results.push({
        name: `${tc.tableName} table`,
        status: isTableMissing(tErr.message, tErr.code) ? "missing" : "error",
        detail: tErr.message || `code: ${tErr.code}`,
      });
    } else {
      results.push({
        name: `${tc.tableName} table`,
        status: "ok",
        detail: "Table exists and is queryable",
      });
    }
  }

  const rpcChecks: Array<{ rpcName: string; params: Record<string, unknown> }> = [
    { rpcName: "accept_swayger", params: { p_swayger_id: "00000000-0000-0000-0000-000000000000" } },
    { rpcName: "decline_swayger", params: { p_swayger_id: "00000000-0000-0000-0000-000000000000" } },
    { rpcName: "cancel_swayger", params: { p_swayger_id: "00000000-0000-0000-0000-000000000000" } },
    { rpcName: "create_workspace", params: { p_name: "__test__", p_scoring_type: "test", p_invite_code: "__ZZZTEST__" } },
    { rpcName: "join_workspace_by_code", params: { p_invite_code: "__ZZZTEST__" } },
  ];

  for (const rpc of rpcChecks) {
    const { data: rpcData, error: rpcErr } = await supabase.rpc(rpc.rpcName, rpc.params);

    if (rpcErr) {
      if (isRpcMissing(rpcErr.message, rpcErr.code)) {
        results.push({
          name: `RPC ${rpc.rpcName}`,
          status: "missing",
          detail: rpcErr.message,
        });
      } else {
        results.push({
          name: `RPC ${rpc.rpcName}`,
          status: "ok",
          detail: `Function exists (runtime error: ${(rpcErr.message || "").substring(0, 80)})`,
        });
      }
    } else {
      const resultObj = rpcData as Record<string, unknown> | null;
      results.push({
        name: `RPC ${rpc.rpcName}`,
        status: "ok",
        detail: `Function exists and returned: ${JSON.stringify(resultObj).substring(0, 80)}`,
      });
    }
  }

  const { error: memberFnErr } = await supabase.rpc("is_workspace_member" as string, {
    p_workspace_id: "00000000-0000-0000-0000-000000000000",
  });
  if (memberFnErr) {
    if (isRpcMissing(memberFnErr.message, memberFnErr.code)) {
      results.push({
        name: "Helper fn is_workspace_member",
        status: "missing",
        detail: memberFnErr.message,
      });
    } else {
      results.push({
        name: "Helper fn is_workspace_member",
        status: "ok",
        detail: `Function exists (runtime: ${(memberFnErr.message || "").substring(0, 60)})`,
      });
    }
  } else {
    results.push({
      name: "Helper fn is_workspace_member",
      status: "ok",
      detail: "Function exists and returned successfully",
    });
  }

  return results;
}

export async function runSchemaVerification(): Promise<void> {
  console.log("[schema-verify] Starting Supabase schema verification...");
  const checks = await verifyGameplaySchema();
  let allGood = true;

  for (const check of checks) {
    const icon = check.status === "ok" ? "OK" : check.status === "missing" ? "MISSING" : "ERROR";
    const logFn = check.status === "ok" ? console.log : console.error;
    logFn(`[schema-verify] [${icon}] ${check.name}: ${check.detail}`);
    if (check.status !== "ok") allGood = false;
  }

  if (allGood) {
    console.log("[schema-verify] All gameplay schema checks passed.");
  } else {
    console.error(
      "[schema-verify] Some checks failed. Run 003_verify_and_fix.sql in Supabase SQL Editor."
    );
  }
}
