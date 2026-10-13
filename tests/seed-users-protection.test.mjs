import test from "node:test";
import assert from "node:assert/strict";
import { rejectCrossOriginMutation } from "../platform/http/request-origin.ts";
import { loadModule } from "./helpers/load-module.mjs";

function makeRequest(url, { method = "POST", headers = {}, body = undefined } = {}) {
  const reqHeaders = new Headers(headers);
  return new Request(url, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("SEC-002: platform origin guard does not exempt /api/seed-users in production mode", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const prodReq = makeRequest("http://127.0.0.1:4173/api/seed-users", {
      headers: { authorization: "Bearer secret-seed-token" },
    });
    // In production, bearer token must NOT bypass origin check -> returns 403
    const prodOriginResult = rejectCrossOriginMutation(prodReq);
    assert.equal(prodOriginResult?.status, 403);

    process.env.NODE_ENV = "development";
    const devReq = makeRequest("http://127.0.0.1:4173/api/seed-users", {
      headers: { authorization: "Bearer secret-seed-token" },
    });
    // In development, bearer token bypasses origin check -> returns null
    const devOriginResult = rejectCrossOriginMutation(devReq);
    assert.equal(devOriginResult, null);

    // /api/cron/retention remains exempted for bearer in both modes
    process.env.NODE_ENV = "production";
    const cronReq = makeRequest("http://127.0.0.1:4173/api/cron/retention", {
      headers: { authorization: "Bearer cron-token" },
    });
    assert.equal(rejectCrossOriginMutation(cronReq), null);
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test("SEC-002: /api/seed-users route handler production and loopback protection", async (t) => {
  const savedEnv = { ...process.env };

  const mockAdmin = {
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [] }, error: null }),
        createUser: async () => ({ data: { user: { id: "mock-user-id" } }, error: null }),
        updateUserById: async () => ({ data: {}, error: null }),
      },
    },
  };

  const mockDb = {
    prepare: () => ({
      bind: () => ({
        run: async () => ({ success: true }),
        first: async () => null,
      }),
    }),
  };

  const loaded = await loadModule("../../app/api/seed-users/route.ts", {
    "@/lib/supabase/server": { createAdmin: () => mockAdmin },
    "@/db/runtime": { STORE_ID: "store-test" },
    "@/db/seed": { seedDemoDatabase: async () => mockDb },
    "next/server": {
      NextResponse: {
        json: (body, init = {}) =>
          new Response(JSON.stringify(body), {
            ...init,
            headers: { "content-type": "application/json", ...(init.headers || {}) },
          }),
      },
    },
  });
  t.after(loaded.dispose);
  t.after(() => {
    process.env = savedEnv;
  });

  const { POST } = loaded.module;

  // 1. Strict rejection in NODE_ENV=production
  {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_DEMO_SEED = "true";
    process.env.LOOPI_LOCAL_ONLY = "true";
    process.env.SEED_SECRET = "supersecret";
    process.env.TEST_ACCOUNT_PASSWORD = "StrongPassword123!";

    const req = makeRequest("http://localhost:3000/api/seed-users", {
      headers: { authorization: "Bearer supersecret" },
    });
    const res = await POST(req);
    assert.equal(res.status, 404, "Must return 404 in production environment");
    const json = await res.json();
    assert.equal(json.code, "not_found");
  }

  // 2. Strict rejection when ENABLE_DEMO_SEED !== 'true'
  {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_DEMO_SEED = "false";
    process.env.LOOPI_LOCAL_ONLY = "true";
    process.env.SEED_SECRET = "supersecret";

    const req = makeRequest("http://localhost:3000/api/seed-users", {
      headers: { authorization: "Bearer supersecret" },
    });
    const res = await POST(req);
    assert.equal(res.status, 404, "Must return 404 when ENABLE_DEMO_SEED is false");
  }

  // 3. Strict rejection when runtime profile is not local
  {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_DEMO_SEED = "true";
    delete process.env.LOOPI_RUNTIME_PROFILE;
    delete process.env.LOOPI_LOCAL_ONLY;
    process.env.SEED_SECRET = "supersecret";

    const req = makeRequest("http://localhost:3000/api/seed-users", {
      headers: { authorization: "Bearer supersecret" },
    });
    const res = await POST(req);
    assert.equal(res.status, 404, "Must return 404 when runtime profile is not local");
  }

  // 4. Strict rejection for non-loopback host
  {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_DEMO_SEED = "true";
    process.env.LOOPI_LOCAL_ONLY = "true";
    process.env.SEED_SECRET = "supersecret";

    for (const host of ["loopicafe.com", "192.168.1.100", "attacker.internal", "10.0.0.1"]) {
      const req = makeRequest(`https://${host}/api/seed-users`, {
        headers: { authorization: "Bearer supersecret" },
      });
      const res = await POST(req);
      assert.equal(res.status, 403, `Must return 403 for remote host: ${host}`);
      const json = await res.json();
      assert.equal(json.code, "forbidden");
    }
  }

  // 5. Strict rejection for remote proxy headers (x-forwarded-host and x-forwarded-for)
  {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_DEMO_SEED = "true";
    process.env.LOOPI_LOCAL_ONLY = "true";
    process.env.SEED_SECRET = "supersecret";

    const forwardedHostReq = makeRequest("http://127.0.0.1:3000/api/seed-users", {
      headers: {
        authorization: "Bearer supersecret",
        "x-forwarded-host": "loopicafe.com",
      },
    });
    const fHostRes = await POST(forwardedHostReq);
    assert.equal(fHostRes.status, 403, "Must return 403 when x-forwarded-host is remote");

    const forwardedForReq = makeRequest("http://127.0.0.1:3000/api/seed-users", {
      headers: {
        authorization: "Bearer supersecret",
        "x-forwarded-for": "203.0.113.45, 127.0.0.1",
      },
    });
    const fForRes = await POST(forwardedForReq);
    assert.equal(fForRes.status, 403, "Must return 403 when x-forwarded-for is remote");
  }

  // 6. Loopback development with missing/invalid secret returns 401
  {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_DEMO_SEED = "true";
    process.env.LOOPI_LOCAL_ONLY = "true";
    process.env.SEED_SECRET = "supersecret";
    process.env.TEST_ACCOUNT_PASSWORD = "StrongPassword123!";

    const noAuthReq = makeRequest("http://127.0.0.1:3000/api/seed-users");
    const noAuthRes = await POST(noAuthReq);
    assert.equal(noAuthRes.status, 401);

    const badAuthReq = makeRequest("http://127.0.0.1:3000/api/seed-users", {
      headers: { authorization: "Bearer wrongsecret" },
    });
    const badAuthRes = await POST(badAuthReq);
    assert.equal(badAuthRes.status, 401);
  }

  // 7. Sanitized error response when auth service fails
  {
    process.env.NODE_ENV = "development";
    process.env.ENABLE_DEMO_SEED = "true";
    process.env.LOOPI_LOCAL_ONLY = "true";
    process.env.SEED_SECRET = "supersecret";
    process.env.TEST_ACCOUNT_PASSWORD = "StrongPassword123!";

    const failingAdminLoaded = await loadModule("../../app/api/seed-users/route.ts", {
      "@/lib/supabase/server": {
        createAdmin: () => ({
          auth: {
            admin: {
              listUsers: async () => ({
                data: null,
                error: { message: "Internal connection failed to postgres://user:secret@db.internal:5432" },
              }),
            },
          },
        }),
      },
      "@/db/runtime": { STORE_ID: "store-test" },
      "@/db/seed": { seedDemoDatabase: async () => mockDb },
      "next/server": {
        NextResponse: {
          json: (body, init = {}) =>
            new Response(JSON.stringify(body), {
              ...init,
              headers: { "content-type": "application/json", ...(init.headers || {}) },
            }),
        },
      },
    });
    t.after(failingAdminLoaded.dispose);

    const req = makeRequest("http://localhost:3000/api/seed-users", {
      headers: { authorization: "Bearer supersecret" },
    });
    const res = await failingAdminLoaded.module.POST(req);
    assert.equal(res.status, 502);
    const json = await res.json();
    assert.equal(json.code, "auth_service_error");
    assert.ok(!JSON.stringify(json).includes("postgres://"), "Must not leak raw internal connection strings");
  }
});
