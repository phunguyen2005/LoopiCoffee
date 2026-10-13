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

const mockAdminDefault = {
  auth: {
    admin: {
      listUsers: async () => ({ data: { users: [] }, error: null }),
      createUser: async () => ({ data: { user: { id: "mock-user-id" } }, error: null }),
      updateUserById: async () => ({ data: {}, error: null }),
    },
  },
};

const mockDbDefault = {
  prepare: () => ({
    bind: () => ({
      run: async () => ({ success: true }),
      first: async () => null,
    }),
  }),
};

async function getSeedUsersRoute(overrides = {}) {
  return await loadModule("../../app/api/seed-users/route.ts", {
    "@/lib/supabase/server": { createAdmin: () => overrides.admin || mockAdminDefault },
    "@/db/runtime": { STORE_ID: "store-test" },
    "@/db/seed": { seedDemoDatabase: async () => overrides.db || mockDbDefault },
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
}

test("SEC-002 ADVERSARIAL: Production Mode Lockout Matrix", async (t) => {
  const savedEnv = { ...process.env };
  const loaded = await getSeedUsersRoute();
  t.after(loaded.dispose);
  t.after(() => {
    process.env = savedEnv;
  });

  const { POST } = loaded.module;

  // Under NODE_ENV=production, NO combination of flags or headers may permit access
  process.env.NODE_ENV = "production";

  const permutationConfigs = [
    { ENABLE_DEMO_SEED: "true", LOOPI_RUNTIME_PROFILE: "local", LOOPI_LOCAL_ONLY: "true" },
    { ENABLE_DEMO_SEED: "true", LOOPI_RUNTIME_PROFILE: "development", LOOPI_LOCAL_ONLY: "true" },
    { ENABLE_DEMO_SEED: "1", LOOPI_RUNTIME_PROFILE: "local", LOOPI_LOCAL_ONLY: "true" },
    { ENABLE_DEMO_SEED: "true", LOOPI_RUNTIME_PROFILE: undefined, LOOPI_LOCAL_ONLY: undefined },
    { ENABLE_DEMO_SEED: undefined, LOOPI_RUNTIME_PROFILE: "local", LOOPI_LOCAL_ONLY: "true" },
  ];

  for (const [idx, cfg] of permutationConfigs.entries()) {
    delete process.env.ENABLE_DEMO_SEED;
    delete process.env.LOOPI_RUNTIME_PROFILE;
    delete process.env.LOOPI_LOCAL_ONLY;
    if (cfg.ENABLE_DEMO_SEED) process.env.ENABLE_DEMO_SEED = cfg.ENABLE_DEMO_SEED;
    if (cfg.LOOPI_RUNTIME_PROFILE) process.env.LOOPI_RUNTIME_PROFILE = cfg.LOOPI_RUNTIME_PROFILE;
    if (cfg.LOOPI_LOCAL_ONLY) process.env.LOOPI_LOCAL_ONLY = cfg.LOOPI_LOCAL_ONLY;

    process.env.SEED_SECRET = "supersecret";
    process.env.TEST_ACCOUNT_PASSWORD = "Password123!";

    const req = makeRequest("http://127.0.0.1:3000/api/seed-users", {
      headers: { authorization: "Bearer supersecret" },
    });
    const res = await POST(req);
    assert.equal(res.status, 404, `Config ${idx} in production must yield 404`);
    const json = await res.json();
    assert.equal(json.code, "not_found");
  }
});

test("SEC-002 ADVERSARIAL: Malicious Origins & CSRF Vectors", () => {
  const originalEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";

    // 1. Cross-origin POST with Bearer token in production
    const maliciousOrigins = [
      "https://attacker.evil",
      "http://attacker.com:3000",
      "https://loopicafe.com.evil.co",
      "null",
      "http://localhost.evil.com",
    ];

    for (const evilOrigin of maliciousOrigins) {
      const req = makeRequest("http://127.0.0.1:3000/api/seed-users", {
        headers: {
          authorization: "Bearer supersecret",
          origin: evilOrigin,
        },
      });
      const reject = rejectCrossOriginMutation(req);
      assert.ok(reject, `Malicious origin ${evilOrigin} must be rejected`);
      assert.equal(reject.status, 403);
    }

    // 2. Cross-site fetch header
    const crossSiteReq = makeRequest("http://127.0.0.1:3000/api/seed-users", {
      headers: {
        authorization: "Bearer supersecret",
        origin: "http://127.0.0.1:3000",
        "sec-fetch-site": "cross-site",
      },
    });
    assert.equal(rejectCrossOriginMutation(crossSiteReq)?.status, 403);

    // 3. In development mode: cross-origin WITHOUT bearer token must be rejected
    process.env.NODE_ENV = "development";
    const devWithoutAuth = makeRequest("http://127.0.0.1:3000/api/seed-users", {
      headers: { origin: "https://attacker.evil" },
    });
    assert.equal(rejectCrossOriginMutation(devWithoutAuth)?.status, 403);

    // 4. In development mode: cross-origin with valid bearer token is exempted from origin check
    const devWithAuth = makeRequest("http://127.0.0.1:3000/api/seed-users", {
      headers: {
        origin: "https://attacker.evil",
        authorization: "Bearer supersecret",
      },
    });
    assert.equal(rejectCrossOriginMutation(devWithAuth), null);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("SEC-002 ADVERSARIAL: Loopback & Network Boundary Bypass Attempts", async (t) => {
  const savedEnv = { ...process.env };
  const loaded = await getSeedUsersRoute();
  t.after(loaded.dispose);
  t.after(() => {
    process.env = savedEnv;
  });

  const { POST } = loaded.module;

  process.env.NODE_ENV = "development";
  process.env.ENABLE_DEMO_SEED = "true";
  process.env.LOOPI_RUNTIME_PROFILE = "local";
  process.env.SEED_SECRET = "supersecret";
  process.env.TEST_ACCOUNT_PASSWORD = "Password123!";

  const hostileHostnames = [
    "0.0.0.0",
    "127.0.0.2",
    "192.168.1.50",
    "10.0.0.5",
    "172.16.0.1",
    "169.254.169.254", // AWS/GCP metadata service
    "localhost.evil.com",
    "127.0.0.1.nip.io",
    "evil-localhost",
    "subdomain.localhost",
    "attacker.local",
  ];

  for (const host of hostileHostnames) {
    const req = makeRequest(`http://${host}:3000/api/seed-users`, {
      headers: { authorization: "Bearer supersecret" },
    });
    const res = await POST(req);
    assert.equal(res.status, 403, `Host ${host} must be rejected with 403`);
    const json = await res.json();
    assert.equal(json.code, "forbidden");
  }

  // Malformed URL check
  const badUrlReq = {
    url: ":::invalid-url:::",
    headers: new Headers({ authorization: "Bearer supersecret" }),
  };
  const badRes = await POST(badUrlReq);
  assert.equal(badRes.status, 400);
});

test("SEC-002 ADVERSARIAL: Proxy Header Poisoning & Spoofing", async (t) => {
  const savedEnv = { ...process.env };
  const loaded = await getSeedUsersRoute();
  t.after(loaded.dispose);
  t.after(() => {
    process.env = savedEnv;
  });

  const { POST } = loaded.module;

  process.env.NODE_ENV = "development";
  process.env.ENABLE_DEMO_SEED = "true";
  process.env.LOOPI_RUNTIME_PROFILE = "local";
  process.env.SEED_SECRET = "supersecret";
  process.env.TEST_ACCOUNT_PASSWORD = "Password123!";

  // 1. Hostile X-Forwarded-Host variants
  const hostileForwardedHosts = [
    "evil.com",
    "evil.com:3000",
    "EVIL.COM",
    "attacker.internal:80",
    "localhost.evil.com",
    "localhost, evil.com",
    "evil.com, localhost",
    "127.0.0.2",
    "0.0.0.0",
  ];

  for (const fHost of hostileForwardedHosts) {
    const req = makeRequest("http://127.0.0.1:3000/api/seed-users", {
      headers: {
        authorization: "Bearer supersecret",
        "x-forwarded-host": fHost,
      },
    });
    const res = await POST(req);
    assert.equal(res.status, 403, `Forwarded host ${fHost} must be rejected with 403`);
    const json = await res.json();
    assert.equal(json.code, "forbidden");
  }

  // 2. Hostile X-Forwarded-For variants
  const hostileForwardedFor = [
    "203.0.113.1",
    "203.0.113.1, 127.0.0.1",
    "192.168.1.1",
    "10.0.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "127.0.0.2",
    "2001:db8::1",
    "evil-ip",
  ];

  for (const fFor of hostileForwardedFor) {
    const req = makeRequest("http://127.0.0.1:3000/api/seed-users", {
      headers: {
        authorization: "Bearer supersecret",
        "x-forwarded-for": fFor,
      },
    });
    const res = await POST(req);
    assert.equal(res.status, 403, `Forwarded for ${fFor} must be rejected with 403`);
    const json = await res.json();
    assert.equal(json.code, "forbidden");
  }
});

test("SEC-002 ADVERSARIAL: Authentication & Secret Extraction Resistance", async (t) => {
  const savedEnv = { ...process.env };
  const loaded = await getSeedUsersRoute();
  t.after(loaded.dispose);
  t.after(() => {
    process.env = savedEnv;
  });

  const { POST } = loaded.module;

  process.env.NODE_ENV = "development";
  process.env.ENABLE_DEMO_SEED = "true";
  process.env.LOOPI_RUNTIME_PROFILE = "local";
  process.env.SEED_SECRET = "supersecret";
  process.env.TEST_ACCOUNT_PASSWORD = "Password123!";

  const invalidAuthHeaders = [
    "",
    "Bearer",
    "Bearer ",
    "Bearer wrong",
    "Bearer supersecret1",
    "Bearer 1supersecret",
    "Bearer null",
    "Bearer undefined",
    "Basic supersecret",
    "Token supersecret",
    "bearer supersecret", // case-sensitive check
  ];

  for (const auth of invalidAuthHeaders) {
    const req = makeRequest("http://127.0.0.1:3000/api/seed-users", {
      headers: { authorization: auth },
    });
    const res = await POST(req);
    assert.equal(res.status, 401, `Auth header '${auth}' must yield 401`);
  }

  // When SEED_SECRET is completely unset in environment
  delete process.env.SEED_SECRET;
  const noSecretReq = makeRequest("http://127.0.0.1:3000/api/seed-users", {
    headers: { authorization: "Bearer undefined" },
  });
  const noSecretRes = await POST(noSecretReq);
  assert.equal(noSecretRes.status, 401, "Must return 401 when SEED_SECRET is unset");

  // When TEST_ACCOUNT_PASSWORD is unset in environment
  process.env.SEED_SECRET = "supersecret";
  delete process.env.TEST_ACCOUNT_PASSWORD;
  const noPassReq = makeRequest("http://127.0.0.1:3000/api/seed-users", {
    headers: { authorization: "Bearer supersecret" },
  });
  const noPassRes = await POST(noPassReq);
  assert.equal(noPassRes.status, 503, "Must return 503 when TEST_ACCOUNT_PASSWORD is unset");
});

test("SEC-002 ADVERSARIAL: Information Leakage & Exception Fault Injection", async (t) => {
  const savedEnv = { ...process.env };
  t.after(() => {
    process.env = savedEnv;
  });

  process.env.NODE_ENV = "development";
  process.env.ENABLE_DEMO_SEED = "true";
  process.env.LOOPI_RUNTIME_PROFILE = "local";
  process.env.SEED_SECRET = "supersecret";
  process.env.TEST_ACCOUNT_PASSWORD = "Password123!";

  // Injected Supabase admin failure with sensitive password/connection leak
  const leakedPassword = "ConfidentialSupabaseSecretPassword999!";
  const connectionString = `postgres://postgres:${leakedPassword}@supabase-db.internal:5432/db`;

  const failingAdmin = {
    auth: {
      admin: {
        listUsers: async () => ({
          data: null,
          error: { message: `Fatal DB connection crash: ${connectionString}` },
        }),
      },
    },
  };

  const loaded = await getSeedUsersRoute({ admin: failingAdmin });
  t.after(loaded.dispose);

  const req = makeRequest("http://127.0.0.1:3000/api/seed-users", {
    headers: { authorization: "Bearer supersecret" },
  });
  const res = await loaded.module.POST(req);
  assert.equal(res.status, 502);
  const text = await res.text();

  assert.ok(!text.includes(leakedPassword), "Must NOT leak confidential database password");
  assert.ok(!text.includes("supabase-db.internal"), "Must NOT leak internal hostname");
  assert.ok(!text.includes("postgres://"), "Must NOT leak connection URI");

  const json = JSON.parse(text);
  assert.equal(json.code, "auth_service_error");
});
