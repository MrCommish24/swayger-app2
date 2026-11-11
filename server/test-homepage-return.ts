import assert from "node:assert/strict";
import {
  HOMEPAGE_RETURN_KEY, EXISTING_AUTH_RETURN_KEY, HOMEPAGE_RETURN_MAX_AGE,
  HOMEPAGE_RETURN_ROUTES, isHomepageReturnRoute, canResumeHomepageReturn,
  saveHomepageReturn, takeHomepageReturn, clearHomepageOrganizerReturn, type ReturnStorage,
} from "../lib/homepage-return-state";

let checks = 0;
function check(value: unknown, name: string) { assert.ok(value, name); checks++; }
const now = 1_800_000_000_000;
function fixture() {
  const data = new Map<string, string>();
  const storage: ReturnStorage = {
    getItem: async key => data.get(key) ?? null,
    setItem: async (key, value) => { data.set(key, value); },
    removeItem: async key => { data.delete(key); },
  };
  return { data, storage };
}
async function run() {
  {
    const { data, storage } = fixture();
    for (const key of [HOMEPAGE_RETURN_KEY, EXISTING_AUTH_RETURN_KEY, "swayger_pending_referral", "swayger_pending_invite"]) {
      data.set(key, `keep:${key}`);
    }
    await clearHomepageOrganizerReturn(storage);
    check(!data.has(HOMEPAGE_RETURN_KEY), "Play clears stale organizer choice");
    for (const key of [EXISTING_AUTH_RETURN_KEY, "swayger_pending_referral", "swayger_pending_invite"]) {
      check(data.get(key) === `keep:${key}`, "Play preserves existing invite, referral and interrupted return");
    }
    check(await takeHomepageReturn(storage, async () => false, now) === null, "Play cannot resume stale organizer choice");
  }
  for (const destination of HOMEPAGE_RETURN_ROUTES) {
    const { storage, data } = fixture();
    await saveHomepageReturn(storage, destination, async () => false, now);
    check(data.has(HOMEPAGE_RETURN_KEY), `${destination} saves separately from auth`);
    check(!data.has(EXISTING_AUTH_RETURN_KEY), "existing auth storage untouched");
    check(await takeHomepageReturn(storage, async () => false, now + 100) === destination, "exact destination restored");
    check(await takeHomepageReturn(storage, async () => false, now + 100) === null, "single use");
  }
  for (const key of [EXISTING_AUTH_RETURN_KEY, "swayger_pending_referral", "invite"]) {
    const { data, storage } = fixture();
    data.set(key, "/invite/KEEP");
    data.set(HOMEPAGE_RETURN_KEY, JSON.stringify({ destination: "/fantasy/setup", createdAt: now }));
    await saveHomepageReturn(storage, "/(tabs)/create", async () => key === "invite", now);
    check(!data.has(HOMEPAGE_RETURN_KEY), `${key} blocks new marketing intent`);
    check(data.get(key) === "/invite/KEEP", `${key} untouched while saving`);
    data.set(HOMEPAGE_RETURN_KEY, JSON.stringify({ destination: "/fantasy/setup", createdAt: now }));
    check(await takeHomepageReturn(storage, async () => key === "invite", now) === null, `${key} wins at consumption too`);
    check(data.get(key) === "/invite/KEEP", `${key} untouched while consuming`);
  }
  for (const destination of ["https://evil.invalid", "//evil.invalid", "/auth-callback", "/invite/NEW", "/admin", "/fantasy/setup?override=1", "/gameday/room", "javascript:alert(1)"]) {
    const { storage } = fixture();
    check(!isHomepageReturnRoute(destination), "arbitrary destination rejected");
    await assert.rejects(saveHomepageReturn(storage, destination, async () => false, now));
    checks++;
  }
  for (const raw of ["broken", "null", "{}", JSON.stringify({ destination: "/admin", createdAt: now }),
    JSON.stringify({ destination: "/fantasy/setup", createdAt: now - HOMEPAGE_RETURN_MAX_AGE }),
    JSON.stringify({ destination: "/fantasy/setup", createdAt: now + 1 })]) {
    const { storage, data } = fixture();
    data.set(HOMEPAGE_RETURN_KEY, raw);
    check(await takeHomepageReturn(storage, async () => false, now) === null, "invalid or expired intent ignored");
    check(!data.has(HOMEPAGE_RETURN_KEY), "invalid intent cleared");
  }
  const ready = { web: true, authenticated: true, needsUsername: false, profileError: false, pathname: "/" };
  for (const pathname of ["/", "/auth", "/username-setup"]) {
    check(canResumeHomepageReturn({ ...ready, pathname }), "ready profile can resume at ordinary post-auth landing");
  }
  for (const pathname of ["/auth-callback", "/invite/CODE", "/gameday/room", "/fantasy/join/L/S", "/admin", "/fantasy/setup"]) {
    check(!canResumeHomepageReturn({ ...ready, pathname }), "never redirect deep links, callback, or gameplay");
  }
  check(!canResumeHomepageReturn({ ...ready, web: false }), "native unchanged");
  check(!canResumeHomepageReturn({ ...ready, authenticated: false }), "anonymous unchanged");
  check(!canResumeHomepageReturn({ ...ready, needsUsername: true }), "username setup must finish first");
  check(!canResumeHomepageReturn({ ...ready, profileError: true }), "profile error does not resume");
  const unavailable: ReturnStorage = {
    getItem: async () => { throw new Error("storage blocked"); },
    setItem: async () => {}, removeItem: async () => {},
  };
  await assert.rejects(saveHomepageReturn(unavailable, "/fantasy/setup", async () => false, now));
  checks++;
  await assert.rejects(clearHomepageOrganizerReturn({
    ...unavailable, removeItem: async () => { throw new Error("storage blocked"); },
  }));
  checks++;
  console.log(`${checks} homepage auth-return checks passed.`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
