import test from "node:test";
import assert from "node:assert/strict";
import { assertLoopbackUrl } from "../tooling/local-environment.mjs";
import { rejectCrossOriginMutation } from "../platform/http/request-origin.ts";
import { readObject } from "../platform/http/input.ts";
import { localSupabaseOptions } from "../lib/supabase/local-guard.ts";

test("local tooling refuses remote and deceptive URLs", () => {
  for (const url of ["https://project.supabase.co", "http://127.0.0.1.attacker.test", "http://user:password@localhost", "file:///tmp/a"]) assert.throws(() => assertLoopbackUrl(url, "test"));
  for (const url of ["http://localhost:54321", "http://127.0.0.1:54321", "http://[::1]:54321"]) assert.doesNotThrow(() => assertLoopbackUrl(url,"test"));
});
test("JSON input rejects oversized bodies even without a Content-Length header", async () => {
  const request = new Request("http://localhost/api/profile",{method:"POST",body:JSON.stringify({name:"x".repeat(70000)})});
  await assert.rejects(readObject(request),{status:413,code:"body_too_large"});
});
test("unsafe browser requests require the exact origin, operator bearer still reaches its secret guard", () => {
  const request = (path, headers = {}, method = "POST") => new Request(`http://127.0.0.1:4173${path}`, { method, headers });
  assert.equal(rejectCrossOriginMutation(request("/api/team", {origin:"http://127.0.0.1:4173"})), null);
  assert.equal(rejectCrossOriginMutation(request("/api/team"))?.status,403);
  assert.equal(rejectCrossOriginMutation(request("/api/team",{origin:"https://attacker.test"}))?.status,403);
  assert.equal(rejectCrossOriginMutation(request("/api/team",{authorization:"Bearer invalid"}))?.status,403);
  assert.equal(rejectCrossOriginMutation(request("/api/cron/retention",{authorization:"Bearer operator"})),null);
  assert.equal(rejectCrossOriginMutation(request("/api/team",{},"GET")),null);
});
test("local Supabase fetch uses edge-compatible manual redirects and rejects every 3xx", async () => {
  const originalFetch = globalThis.fetch;
  const redirectModes = [];
  globalThis.fetch = async (_input, init) => {
    redirectModes.push(init?.redirect);
    return new Response(null, { status: 302, headers: { location: "https://attacker.test" } });
  };
  try {
    const guardedFetch = localSupabaseOptions("http://127.0.0.1:54321", true).global.fetch;
    await assert.rejects(
      guardedFetch("http://127.0.0.1:54321/auth/v1/user"),
      /forbidden redirect/,
    );
    assert.deepEqual(redirectModes, ["manual"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
