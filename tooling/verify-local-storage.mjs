import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { localEnvironment, assertLoopbackUrl } from "./local-environment.mjs";
import { createEvidenceStorage } from "../platform/storage/evidence.ts";

const settings = localEnvironment({ requireCredentials: true });
assertLoopbackUrl(settings.NEXT_PUBLIC_SUPABASE_URL, "Storage verification target");
const options = {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: async (input, init) => {
    assertLoopbackUrl(input instanceof Request ? input.url : String(input), "Storage verification request");
    const response = await fetch(input, { ...init, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) throw new Error("Local storage redirect refused.");
    return response;
  } },
};
const admin = createClient(settings.NEXT_PUBLIC_SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, options);
const bucket = `evidence-verify-${crypto.randomUUID().slice(0, 8)}`;
const key = "verify-store/attendance/verify-person/2026/10/fixture.svg";
const content = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><text>LOCAL TEST FIXTURE</text></svg>');
let createdBucket = false;
let userId;
try {
  const created = await admin.storage.createBucket(bucket, { public: false, fileSizeLimit: 3145728, allowedMimeTypes: ["image/svg+xml"] });
  if (created.error) throw new Error("Local private bucket creation failed; ensure local Storage is running.");
  createdBucket = true;
  const storage = createEvidenceStorage({ url: settings.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey: settings.SUPABASE_SERVICE_ROLE_KEY, bucket, localOnly: true });
  await storage.put(key, content, { httpMetadata: { contentType: "image/svg+xml; charset=utf-8" } });
  const downloaded = await storage.get(key);
  assert.deepEqual(new Uint8Array(await downloaded.body.arrayBuffer()), content);
  await assert.rejects(storage.put(key, content), /Evidence upload failed/);

  const anon = createClient(settings.NEXT_PUBLIC_SUPABASE_URL, settings.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
  assert.ok((await anon.storage.from(bucket).download(key)).error, "anonymous direct read must be denied");
  assert.ok((await anon.storage.from(bucket).upload(key, content)).error, "anonymous direct upload must be denied");

  const email = `storage-${crypto.randomUUID()}@example.test`;
  const password = `${crypto.randomUUID()}!Aa9`;
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (user.error || !user.data.user) throw new Error("Local storage test user creation failed.");
  userId = user.data.user.id;
  const signedIn = await anon.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error("Local storage test login failed.");
  assert.ok((await anon.storage.from(bucket).download(key)).error, "authenticated direct read must be denied");
  assert.ok((await anon.storage.from(bucket).upload(key.replace("fixture.svg", "client.svg"), content)).error, "authenticated direct upload must be denied");
  const directDelete = await anon.storage.from(bucket).remove([key]);
  assert.ok(directDelete.error || directDelete.data?.length === 0, "authenticated direct delete must not affect objects");
  // Denied client mutations must leave the server-owned original intact.
  assert.deepEqual(new Uint8Array(await (await storage.get(key)).body.arrayBuffer()), content);
  await storage.delete(key);
  await storage.delete(key);
  assert.equal(await storage.get(key), null);
  console.log("Local Supabase Storage PASS: private roundtrip, immutable upload, anon/authenticated denial, idempotent deletion. Local test fixture only; no cloud calls.");
} finally {
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) throw new Error("Local verification user cleanup failed.");
  }
  if (createdBucket) {
    const filesRemoved = await admin.storage.from(bucket).remove([key]);
    if (filesRemoved.error) throw new Error("Local verification object cleanup failed.");
    const bucketRemoved = await admin.storage.deleteBucket(bucket);
    if (bucketRemoved.error) throw new Error("Local verification bucket cleanup failed.");
  }
}
