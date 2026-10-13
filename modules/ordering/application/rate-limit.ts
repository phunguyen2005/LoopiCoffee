import { ApplicationError } from "../../../platform/http/errors.ts";
import { hash } from "./input.ts";

type TrackingBucket = {
  count: number;
  resetAt: number;
};

// In-memory sliding window rate limiter in isolate RAM for read-only order tracking.
// Decoupled from D1 database disk writes to protect D1 primary writer from write amplification.
const trackingBuckets = new Map<string, TrackingBucket>();
const MAX_TRACKING_ENTRIES = 5000;
let lastTrackingCleanup = 0;

function cleanupTrackingBuckets(now: number) {
  if (Math.abs(now - lastTrackingCleanup) < 60_000 && trackingBuckets.size < MAX_TRACKING_ENTRIES) {
    return;
  }
  lastTrackingCleanup = now;
  for (const [key, bucket] of trackingBuckets.entries()) {
    if (now >= bucket.resetAt) {
      trackingBuckets.delete(key);
    }
  }
  if (trackingBuckets.size > MAX_TRACKING_ENTRIES) {
    trackingBuckets.clear();
  }
}

export function limitTrackingInMemory(request: Request, storeId: string, now = Date.now()): void {
  cleanupTrackingBuckets(now);
  const client = request.headers.get("cf-connecting-ip")?.slice(0, 64) || "local";
  const bucketKey = `${storeId}:${client}`;
  const windowMs = 60_000;
  const maxRequests = 120; // 120 reqs/min per IP (10x headroom for 5s polling)

  let bucket = trackingBuckets.get(bucketKey);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 1, resetAt: now + windowMs };
    trackingBuckets.set(bucketKey, bucket);
    return;
  }

  bucket.count += 1;
  if (bucket.count > maxRequests) {
    throw new ApplicationError("Bạn thao tác quá nhanh. Vui lòng thử lại sau một phút.", 429, "rate_limited");
  }
}

export function resetTrackingRateLimitsForTesting(): void {
  trackingBuckets.clear();
  lastTrackingCleanup = 0;
}

// CF-Connecting-IP is supplied by Cloudflare. Local requests share one bucket.
export async function limitOrderRequests(db: D1Database, storeId: string, request: Request, action: "create" | "track", now = Date.now()) {
  if (action === "track") {
    limitTrackingInMemory(request, storeId, now);
    return;
  }

  const bucket = Math.floor(now / 60000);
  const client = request.headers.get("cf-connecting-ip")?.slice(0, 64) || "local";
  const key = await hash(`${storeId}:${action}:${client}:${bucket}`);
  const limits = [10, 300];
  const keys = [key, `${storeId}:${action}:${bucket}:all`];
  const results = await db.batch([
    db.prepare("DELETE FROM order_rate_limits WHERE expires_at < ?").bind(now),
    ...keys.map(bucketKey => db.prepare(
      `INSERT INTO order_rate_limits (bucket_key, request_count, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET request_count = request_count + 1 RETURNING request_count`,
    ).bind(bucketKey, (bucket + 2) * 60000)),
  ]);
  for (let i = 0; i < limits.length; i++) {
    const count = results[i + 1].results[0] as { request_count: number };
    if (count.request_count > limits[i]) throw new ApplicationError("Bạn thao tác quá nhanh. Vui lòng thử lại sau một phút.", 429, "rate_limited");
  }
}
