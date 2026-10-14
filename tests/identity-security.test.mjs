import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";
import { loadModule } from "./helpers/load-module.mjs";
import { auditStatement } from "../server/audit.ts";
import { changePassword } from "../modules/people/application/change-password.ts";
import { resetPassword } from "../modules/people/application/reset-password.ts";
import { completeSignIn } from "../modules/people/application/complete-sign-in.ts";
import { defaultAppPath } from "../modules/people/domain/access.ts";
import { apiHandler, ApplicationError } from "../platform/http/errors.ts";
import { readObject } from "../platform/http/input.ts";

function fixture(t) {
  const db = createDatabase(); t.after(() => db.close()); seedStore(db);
  const actor = seedEmployee(db);
  db.sqlite.prepare("UPDATE employees SET auth_user_id = 'auth-owner', must_change_password = 1 WHERE id = ?").run(actor.id);
  return { db, actor, identity: { email: actor.email, authUserId: "auth-owner" } };
}
async function actual(t, path, dependencies) {
  const loaded = await loadModule(path, dependencies); t.after(loaded.dispose); return loaded.module;
}

test("post-login destinations match each role's primary workspace", () => {
  assert.equal(defaultAppPath("owner"), "/app");
  assert.equal(defaultAppPath("manager"), "/app");
  assert.equal(defaultAppPath("system_admin"), "/app");
  assert.equal(defaultAppPath("team_lead"), "/app/today");
  assert.equal(defaultAppPath("employee"), "/app/today");
});

test("auth rejects a raw identity header without a provider session", async (t) => {
  const { db } = fixture(t);
  const auth = await actual(t, "../../server/auth.ts", {
    "@/db/runtime": { ensureDatabase: async () => db, CONSENT_VERSION: "test" },
    "next/headers": { cookies: async () => ({ getAll: () => [] }), headers: async () => new Headers({ "oai-authenticated-user-email": "owner-a@example.test" }) },
    "@/lib/supabase/server": { createClient: () => { throw new Error("Provider should not be called"); } },
  });
  const original = process.env.ALLOW_DEMO_AUTH; process.env.ALLOW_DEMO_AUTH = "false";
  try { assert.equal((await auth.requireApiUser(["owner"])).response.status, 401); }
  finally { if (original === undefined) delete process.env.ALLOW_DEMO_AUTH; else process.env.ALLOW_DEMO_AUTH = original; }
});

test("provider metadata cannot clear a database password-change requirement", async (t) => {
  const { db, actor } = fixture(t);
  const auth = await actual(t, "../../server/auth.ts", {
    "@/db/runtime": { ensureDatabase: async () => db, CONSENT_VERSION: "test" },
    "next/headers": { cookies: async () => ({ getAll: () => [{ name: "sb-local-auth-token", value: "test" }] }) },
    "@/lib/supabase/server": { createClient: async () => ({ auth: {
      getSession: async () => ({ data: { session: { access_token: "fixture-token" } } }),
      getUser: async () => ({ data: { user: { id: "auth-owner", email: actor.email, user_metadata: { must_change_password: false } } } }),
    } }) },
  });
  assert.equal((await auth.getApiUser()).mustChangePassword, true);
  assert.equal((await auth.requireApiUser()).response.status, 403);
  db.sqlite.prepare("UPDATE employees SET status = 'suspended' WHERE id = ?").run(actor.id);
  assert.equal((await auth.requireApiUser()).response.status, 401);
});

test("password completion verifies membership and provider result before clearing the flag", async (t) => {
  const { db, actor, identity } = fixture(t);
  await assert.rejects(changePassword(db, { ...identity, authUserId: "other" }, "a-long-password", async () => ({ error: null })), { status: 403 });
  await assert.rejects(changePassword(db, identity, "short", async () => ({ error: null })), { status: 400 });
  await assert.rejects(changePassword(db, identity, "a-long-password", async () => ({ error: "provider rejected" })), { code: "password_update_failed" });
  assert.equal(db.sqlite.prepare("SELECT must_change_password FROM employees WHERE id = ?").get(actor.id).must_change_password, 1);
  await changePassword(db, identity, "a-long-password", async () => ({ error: null }));
  assert.equal(db.sqlite.prepare("SELECT must_change_password FROM employees WHERE id = ?").get(actor.id).must_change_password, 0);
  assert.equal(db.sqlite.prepare("SELECT action, store_id FROM audit_events").get().action, "account.password_changed");
});

test("a reset in flight blocks changes and an intervening reset cannot be cleared", async (t) => {
  const { db, actor, identity } = fixture(t);
  await resetPassword(db, actor.email, actor.id, async () => {
    await assert.rejects(changePassword(db, identity, "a-long-password", async () => ({ error: null })), { code: "password_reset_pending" });
    await assert.rejects(resetPassword(db, actor.email, actor.id, async () => ({ error: null })), { status: 409 });
    return { error: null };
  });
  await assert.rejects(changePassword(db, identity, "a-long-password", async () => {
    await resetPassword(db, actor.email, actor.id, async () => ({ error: null }));
    return { error: null };
  }), { code: "password_change_conflict" });
  assert.equal(db.sqlite.prepare("SELECT must_change_password FROM employees WHERE id = ?").get(actor.id).must_change_password, 1);
});

test("audit route returns only its store and hides unknown legacy provenance", async (t) => {
  const { db, actor } = fixture(t); seedStore(db, "store-b");
  const other = seedEmployee(db, { id: "owner-b", storeId: "store-b" });
  for (const email of [actor.email, other.email, "unknown@example.test"]) await auditStatement(db, email, "store", "test", "store.updated", {}).run();
  const route = await actual(t, "../../app/api/audit/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor }) },
  });
  const payload = await (await route.GET()).json();
  assert.equal(payload.events.length, 1); assert.equal(payload.events[0].actor_email, actor.email);
});

test("password route rejects foreign origin, unauthenticated and malformed requests", async (t) => {
  const { db } = fixture(t); let providerCalls = 0;
  const route = await actual(t, "../../app/api/auth/change-password/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => { providerCalls++; return { data: { user: null }, error: "none" }; } } }) },
    "@/modules/people/application/change-password": { changePassword },
    "@/platform/http/errors": { apiHandler, ApplicationError }, "@/platform/http/input": { readObject },
  });
  const request = (origin, body) => new Request("https://local.test/api/auth/change-password", { method: "POST", headers: { origin }, body });
  assert.equal((await route.POST(request("https://evil.test", '{"password":"a-long-password"}'))).status, 403);
  assert.equal((await route.POST(request("https://local.test", '{"password":42}'))).status, 400);
  assert.equal(providerCalls, 0);
  assert.equal((await route.POST(request("https://local.test", '{"password":"a-long-password"}'))).status, 401);
});

test("callback verifies invite token hashes, sends required changes to password setup and rejects external redirects", async (t) => {
  const { db, actor } = fixture(t); const calls = [];
  const route = await actual(t, "../../app/auth/callback/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/modules/people/application/complete-sign-in": { completeSignIn },
    "@/modules/people/domain/access": { defaultAppPath },
    "@/server/auth": { getApiUser: async () => ({ ...actor, mustChangePassword: false }) },
    "@/lib/supabase/server": { createClient: async () => ({ auth: {
      verifyOtp: async (options) => { calls.push(options.type); return { data: { user: { id: "auth-owner", email: actor.email } } }; },
      exchangeCodeForSession: async () => ({ data: { user: { id: "auth-owner", email: actor.email } } }),
    } }) },
    "next/server": { NextResponse: { redirect: (url) => Response.redirect(url, 307) } },
  });
  const invite = await route.GET(new Request("https://local.test/auth/callback?token_hash=fixture&type=invite&next=https://evil.test"));
  assert.deepEqual(calls, ["invite"]); assert.equal(invite.headers.get("location"), "https://local.test/app");
  const recovery = await route.GET(new Request("https://local.test/auth/callback?code=fixture&recovery=1"));
  assert.equal(recovery.headers.get("location"), "https://local.test/auth/change-password");
  const implicit = await route.GET(new Request("https://local.test/auth/callback"));
  assert.equal(implicit.headers.get("location"), "https://local.test/auth/confirm");
});

test("logout is POST-only and refuses a cross-origin request without contacting the provider", async (t) => {
  let calls = 0;
  const route = await actual(t, "../../app/auth/signout/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ auth: { signOut: async () => { calls++; return {}; } } }) },
    "@/server/auth": { invalidateIdentityCache: () => {} },
    "next/server": { NextResponse: { redirect: (url, options) => Response.redirect(url, options.status) } },
  });
  assert.equal(route.GET, undefined);
  const request = (origin) => new Request("https://local.test/auth/signout", { method: "POST", headers: { origin } });
  assert.equal((await route.POST(request("https://evil.test"))).status, 403); assert.equal(calls, 0);
  assert.equal((await route.POST(request("https://local.test"))).status, 303); assert.equal(calls, 1);
});

test("failed password reset leaves the requirement set and releases the reservation", async (t) => {
  const { db, actor } = fixture(t);
  await assert.rejects(resetPassword(db, actor.email, actor.id, async () => ({ error: "provider failure" })), { code: "password_reset_failed" });
  const row = db.sqlite.prepare("SELECT must_change_password, password_reset_pending FROM employees WHERE id = ?").get(actor.id);
  assert.equal(row.must_change_password, 1); assert.equal(row.password_reset_pending, 0);
});
