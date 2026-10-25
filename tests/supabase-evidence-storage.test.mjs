import assert from "node:assert/strict";
import test from "node:test";
import { createEvidenceStorage, MAX_EVIDENCE_BYTES } from "../platform/storage/evidence.ts";

const key = "store-a/attendance/person-a/2026/10/event-a.svg";
const bytes = new TextEncoder().encode("<svg>server-stamped-photo</svg>");
const settings = { url: "https://storage.example.test", serviceRoleKey: "server-only-test-key" };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

function fixture(perform, { publicBucket = false } = {}) {
  const requests = [];
  const storage = createEvidenceStorage(settings, async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    assert.equal(url.origin, settings.url);
    assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${settings.serviceRoleKey}`);
    assert.equal(init.redirect, "manual");
    if (url.pathname.startsWith("/storage/v1/bucket/")) return json({ id: "attendance-evidence", public: publicBucket });
    return perform(url, init);
  });
  return { storage, requests };
}

test("uploads immutable stamped bytes to the private bucket with no public URL", async () => {
  const { storage } = fixture((url, init) => {
    assert.equal(init.method, "POST");
    assert.equal(url.pathname, `/storage/v1/object/attendance-evidence/${key}`);
    assert.equal(new Headers(init.headers).get("x-upsert"), "false");
    assert.equal(new Headers(init.headers).get("content-type"), "image/svg+xml");
    assert.deepEqual(init.body, bytes);
    return json({ Key: key });
  });
  await storage.put(key, bytes, { httpMetadata: { contentType: "image/svg+xml; charset=utf-8" }, customMetadata: { sha256: "hash" } });
});

test("downloads authenticated bytes; missing objects return null and provider errors fail", async () => {
  const ok = fixture((url) => {
    assert.equal(url.pathname, `/storage/v1/object/attendance-evidence/${key}`);
    return new Response(bytes);
  }).storage;
  assert.deepEqual(new Uint8Array(await (await ok.get(key)).body.arrayBuffer()), bytes);
  const missing = fixture(() => json({ statusCode: "404", message: "Object not found" }, 404)).storage;
  assert.equal(await missing.get(key), null);
  const failed = fixture(() => json({ message: "provider failed" }, 503)).storage;
  await assert.rejects(failed.get(key), /Evidence download failed/);
});

test("delete uses the exact key and is retryable when the provider fails", async () => {
  let attempts = 0;
  const { storage } = fixture((_url, init) => {
    assert.equal(init.method, "DELETE");
    assert.deepEqual(JSON.parse(init.body), { prefixes: [key] });
    attempts++;
    return attempts === 1 ? json({ message: "offline" }, 503) : json([]);
  });
  await assert.rejects(storage.delete(key), /Evidence deletion failed/);
  await storage.delete(key);
});

test("a public bucket blocks upload, download and deletion before touching any object", async () => {
  const { storage } = fixture(() => assert.fail("object request must not run"), { publicBucket: true });
  for (const operation of [() => storage.put(key, bytes), () => storage.get(key), () => storage.delete(key)]) {
    await assert.rejects(operation(), /private evidence bucket/);
  }
});

test("upload errors cannot report success or overwrite an existing object", async () => {
  const { storage } = fixture(() => json({ message: "already exists" }, 409));
  await assert.rejects(storage.put(key, bytes), /Evidence upload failed/);
});

test("unsafe keys, oversized files, absent configuration and environment mistakes fail closed", async () => {
  assert.equal(createEvidenceStorage({}), undefined);
  assert.throws(() => createEvidenceStorage({ ...settings, url: "http://127.0.0.1:54321" }), /URL is invalid/);
  assert.throws(() => createEvidenceStorage({ ...settings, localOnly: true }), /URL is invalid/);
  const { storage, requests } = fixture(() => assert.fail("must not upload"));
  await assert.rejects(storage.get("../other-store/photo.svg"), /object key is invalid/);
  await assert.rejects(storage.put(key, new Uint8Array(MAX_EVIDENCE_BYTES + 1)), /too large/);
  assert.equal(requests.length, 0);
});

test("redirects cannot forward service-role credentials to another origin", async () => {
  let requests = 0;
  const storage = createEvidenceStorage(settings, async () => {
    requests++;
    return new Response(null, { status: 302, headers: { location: "https://another.example.test" } });
  });
  await assert.rejects(storage.get(key), /private evidence bucket/);
  assert.equal(requests, 1);
});
