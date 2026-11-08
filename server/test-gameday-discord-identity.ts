/**
 * Disposable live-schema API/RPC regression suite. Never posts to Discord.
 * Requires supabase/gameday-discord-identity.sql to be explicitly applied.
 */
import "dotenv/config";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import type { AddressInfo } from "node:net";
import { createParticipantSecret, hashParticipantSecret } from "./gameday-discord-identity";
import { registerGamedayRoutes } from "./routes-gameday";
import { getServiceSupabase } from "./supabase-service";

let passed = 0, failed = 0;
function check(name: string, ok: unknown) {
  if (ok) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.error(`FAIL ${name}`); }
}
async function main() {
  const db = getServiceSupabase();
  const anon = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const botKey = process.env.GAMEDAY_BOT_API_KEY!;
  if (!botKey) throw new Error("Bot key configuration is required");
  const seed = Date.now().toString();
  const guild = `${seed}001`, otherGuild = `${seed}002`, user = `${seed}101`;
  const rooms: string[] = [], users: string[] = [];
  const app = express();
  app.use(express.json());
  registerGamedayRoutes(app);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.on("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(base + path, { method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() as any };
  }
  const bot = (g = guild) => ({ Authorization: `Bearer ${botKey}`, "X-Discord-Guild-ID": g });
  const session = (raw: string) => ({ "X-Gameday-Participant-Session": raw });
  async function createRoom(g = guild) {
    const result = await request("/api/gameday/rooms", {
      room_name: `Identity fixture ${seed}`, source: "discord", sport: "madden",
      template_type: "weekly_pick_card", is_private: true, discord_guild_id: g,
      discord_channel_id: `${seed}900`, discord_user_id: user,
      pick_deadline: new Date(Date.now() + 3600_000).toISOString(),
      format_config: { week_label: "Identity regression", reward_text: "Test", minimum_matchups: 3, scoring_mode: "all_correct", bonus: { enabled: false } },
      matchups: [{ team_a: "Ravens", team_b: "Bengals" }, { team_a: "Chiefs", team_b: "Raiders" }, { team_a: "Bears", team_b: "Giants" }],
    }, bot(g));
    if (!result.body.room_id) throw new Error(`Fixture room creation failed (${result.status})`);
    rooms.push(result.body.room_id);
    const { body } = await request(`/api/gameday/rooms/${result.body.room_id}`);
    return { id: result.body.room_id as string, card: body.cards[0] };
  }
  async function issue(room: string, who = user, name = "Raiders", g = guild) {
    return request(`/api/gameday/rooms/${room}/discord-participant-link`, {
      discord_user_id: who, discord_display_name: name,
    }, bot(g));
  }
  const tokenOf = (r: any) => new URL(r.body.participant_url).searchParams.get("discord_token")!;
  const redeem = (raw: string, room?: string) => request("/api/gameday/discord-participant-link/redeem", { token: raw, ...(room ? { room_id: room } : {}) });
  try {
    const room = await createRoom(), next = await createRoom(), foreign = await createRoom(otherGuild);
    const endpoint = `/api/gameday/rooms/${room.id}/discord-participant-link`;
    const body = { discord_user_id: user, discord_display_name: "Raiders" };
    check("invalid bot credential rejected", (await request(endpoint, body, { Authorization: "Bearer invalid", "X-Discord-Guild-ID": guild })).status === 401);
    check("guild header required", (await request(endpoint, body, { Authorization: `Bearer ${botKey}` })).status === 400);
    check("wrong guild rejected", (await issue(room.id, user, "Raiders", otherGuild)).status === 403);
    check("cross-guild isolation", (await issue(foreign.id)).status === 403);
    check("numeric JS ID rejected", (await request(endpoint, { ...body, discord_user_id: 123 }, bot())).status === 400);
    check("blank name rejected", (await issue(room.id, user, "   ")).status === 400);
    check("control character name rejected", (await issue(room.id, user, "Raiders\n")).status === 400);
    check("missing room rejected", (await issue("00000000-0000-0000-0000-000000000000")).status === 404);
    await db.from("gameday_rooms").update({ sport: "nba" }).eq("id", next.id);
    check("wrong room type rejected", (await issue(next.id)).status === 403);
    await db.from("gameday_rooms").update({ sport: "madden" }).eq("id", next.id);
    const issued = await issue(room.id);
    check("valid issuance returns 201", issued.status === 201);
    const raw = tokenOf(issued);
    check("token is 32-byte opaque hex", /^[0-9a-f]{64}$/.test(raw));
    check("crypto generates independent tokens", createParticipantSecret() !== createParticipantSecret());
    check("expiry contract 600 seconds", issued.body.expires_in_seconds === 600 && Math.abs(Date.parse(issued.body.expires_at) - Date.now() - 600_000) < 10_000);
    const stored = await db.from("gameday_discord_participant_links").select("*").eq("token_hash", hashParticipantSecret(raw)).single();
    check("only token hash stored", stored.data?.token_hash !== raw && !JSON.stringify(stored.data).includes(raw));
    check("token bound to expected room", (await redeem(raw, next.id)).status === 400);
    const red = await redeem(raw, room.id);
    check("redemption succeeds", red.status === 200 && !!red.body.participant_session);
    const participant = red.body.participant;
    check("trusted snapshot and linked guest returned", participant?.display_name === "Raiders" && participant?.identity_provider === "discord" && participant?.is_guest);
    const credential = red.body.participant_session;
    check("session differs from one-time token", credential !== raw && /^[0-9a-f]{64}$/.test(credential));
    const storedSession = await db.from("gameday_discord_participant_sessions").select("*").eq("session_hash", hashParticipantSecret(credential)).single();
    check("session hash-only at rest", !!storedSession.data && !JSON.stringify(storedSession.data).includes(credential));
    check("replay rejected", (await redeem(raw)).status === 409);
    check("room fetch accepts participant session", (await request(`/api/gameday/rooms/${room.id}`, undefined, session(credential))).body.participant?.id === participant.id);
    check("session cannot enter another room", (await request(`/api/gameday/rooms/${next.id}`, undefined, session(credential))).status === 401);
    check("invalid session fails closed", (await request(`/api/gameday/rooms/${room.id}`, undefined, { ...session("bad"), "X-Guest-Session": "ignored" })).status === 401);
    const prop = room.card.gameday_props[0];
    check("pick accepts new session", (await request(`/api/gameday/props/${prop.id}/pick`, { selected_answer: prop.answer_options[0] }, session(credential))).status === 200);
    check("cross-room pick rejected", (await request(`/api/gameday/props/${next.card.gameday_props[0].id}/pick`, { selected_answer: next.card.gameday_props[0].answer_options[0] }, session(credential))).status === 401);
    check("stored pick resolves participant", (await db.from("gameday_picks").select("participant_id").eq("prop_id", prop.id).eq("participant_id", participant.id)).data?.length === 1);
    check("same-room reentry preserves snapshot", (await redeem(tokenOf(await issue(room.id, user, "Raiders - John")))).body.participant?.display_name === "Raiders");
    check("same-room reentry creates no duplicate", (await db.from("gameday_participants").select("id").eq("room_id", room.id).eq("discord_identity_id", stored.data?.discord_identity_id)).data?.length === 1);
    const newWeek = await redeem(tokenOf(await issue(next.id, user, "Raiders - John")));
    check("nickname change snapshots new week", newWeek.body.participant?.display_name === "Raiders - John");
    check("new week has different room participant", newWeek.body.participant?.id !== participant.id);
    check("old history remains unchanged", (await db.from("gameday_participants").select("display_name").eq("id", participant.id).single()).data?.display_name === "Raiders");
    const latest = await db.from("gameday_discord_identities").select("*").eq("discord_guild_id", guild).eq("discord_user_id", user);
    check("one durable identity with latest observed name", latest.data?.length === 1 && latest.data[0].latest_display_name === "Raiders - John");
    const second = await redeem(tokenOf(await issue(room.id, `${seed}102`, "Raiders")));
    check("different users can share exact display name", second.status === 200 && second.body.participant.id !== participant.id && second.body.participant.display_name === "Raiders");
    const crossIdentity = await redeem(tokenOf(await issue(foreign.id, user, "Raiders", otherGuild)));
    check("same Discord user in other guild is separate identity", crossIdentity.status === 200 &&
      (await db.from("gameday_discord_identities").select("id").eq("discord_user_id", user)).data?.length === 2);
    const old = tokenOf(await issue(room.id, `${seed}103`));
    const fresh = tokenOf(await issue(room.id, `${seed}103`));
    check("new issuance revokes prior pending link", (await redeem(old)).body.code === "token_revoked");
    const parallel = await Promise.all([redeem(fresh), redeem(fresh)]);
    check("concurrent redemption single winner", parallel.filter(r => r.status === 200).length === 1 && parallel.filter(r => r.body.code === "token_used").length === 1);
    const expired = tokenOf(await issue(room.id, `${seed}104`));
    await db.from("gameday_discord_participant_links").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("token_hash", hashParticipantSecret(expired));
    check("expired token rejected", (await redeem(expired)).body.code === "token_expired");
    check("malformed token rejected", (await redeem("not-a-token")).status === 400);
    check("unknown valid-format token rejected", (await redeem(createParticipantSecret())).status === 400);
    await db.from("gameday_discord_participant_sessions").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("session_hash", hashParticipantSecret(credential));
    check("expired participant session rejected", (await request(`/api/gameday/rooms/${room.id}`, undefined, session(credential))).status === 401);
    const closedToken = tokenOf(await issue(next.id, `${seed}105`));
    await db.from("gameday_pick_cards").update({ status: "locked" }).eq("id", next.card.id);
    check("locked card blocks issuance", (await issue(next.id, `${seed}105`)).status === 409);
    check("locked card blocks redemption", (await redeem(closedToken)).body.code === "room_closed");
    await db.from("gameday_pick_cards").update({ status: "open", scheduled_lock_at: new Date(Date.now() - 1000).toISOString() }).eq("id", next.card.id);
    check("deadline blocks issuance even if card open", (await issue(next.id, `${seed}105`)).status === 409);
    await db.from("gameday_pick_cards").update({ scheduled_lock_at: new Date(Date.now() + 3600_000).toISOString() }).eq("id", next.card.id);
    await db.from("gameday_rooms").update({ archived_at: new Date().toISOString() }).eq("id", next.id);
    check("archived room blocks issuance", (await issue(next.id, `${seed}106`)).status === 409);
    check("archived room blocks redemption", (await redeem(closedToken)).body.code === "room_closed");
    const legacy = await request(`/api/gameday/rooms/${room.id}/join`, { display_name: "Legacy guest" });
    check("legacy guest join unchanged", legacy.status === 200 && !!legacy.body.guest_session_id);
    const legacyHeaders = { "X-Guest-Session": legacy.body.guest_session_id };
    check("legacy room retrieval unchanged", (await request(`/api/gameday/rooms/${room.id}`, undefined, legacyHeaders)).body.participant?.id === legacy.body.participant.id);
    check("legacy session room scoped", !(await request(`/api/gameday/rooms/${foreign.id}`, undefined, legacyHeaders)).body.participant);
    check("legacy guest pick unchanged", (await request(`/api/gameday/props/${prop.id}/pick`, { selected_answer: prop.answer_options[0] }, legacyHeaders)).status === 200);
    check("legacy duplicate guest name rejected", (await request(`/api/gameday/rooms/${room.id}/join`, { display_name: "Legacy guest" })).status === 409);
    const email = `discord-identity-${seed}@example.test`, password = `Test-${seed}-Z1!`;
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (!created.data.user) throw new Error("Account fixture creation failed");
    users.push(created.data.user.id);
    await db.from("profiles").upsert({ id: created.data.user.id, username: `identity_${seed}`, display_name: "Account player" });
    const signed = await anon.auth.signInWithPassword({ email, password });
    const authHeaders = { Authorization: `Bearer ${signed.data.session?.access_token}` };
    const joined = await request(`/api/gameday/rooms/${room.id}/join`, {}, authHeaders);
    check("authenticated account join unchanged", joined.status === 200 && joined.body.participant?.user_id === created.data.user.id);
    check("account picks unchanged", (await request(`/api/gameday/props/${prop.id}/pick`, { selected_answer: prop.answer_options[0] }, authHeaders)).status === 200);
    const linkedAgain = await redeem(tokenOf(await issue(room.id, `${seed}107`, "Linked account browser")));
    check("explicit linked session wins over signed-in account", (await request(`/api/gameday/rooms/${room.id}`, undefined, { ...authHeaders, ...session(linkedAgain.body.participant_session) })).body.participant?.id === linkedAgain.body.participant.id);
    for (const table of ["gameday_discord_identities", "gameday_discord_participant_links", "gameday_discord_participant_sessions"]) {
      check(`${table} inaccessible to browser role`, !!(await anon.from(table).select("*")).error);
    }
    check("redemption RPC inaccessible to browser role", !!(await anon.rpc("redeem_gameday_discord_link", { p_token_hash: hashParticipantSecret(raw), p_session_hash: hashParticipantSecret(createParticipantSecret()) })).error);
    const rateUser = `${seed}108`;
    for (let i = 0; i < 10; i++) await issue(room.id, rateUser);
    check("issuance rate limit enforced", (await issue(room.id, rateUser)).status === 429);
  } finally {
    for (const id of rooms) {
      const result = await db.from("gameday_rooms").delete().eq("id", id);
      if (result.error) throw new Error("Failed to clean disposable rooms");
    }
    for (const g of [guild, otherGuild]) await db.from("gameday_discord_identities").delete().eq("discord_guild_id", g);
    for (const id of users) await db.auth.admin.deleteUser(id);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
  console.log(`Discord identity: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(error => {
  console.error(error instanceof Error ? error.message : "Test failure");
  process.exit(1);
});
