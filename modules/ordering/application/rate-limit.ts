import { ApplicationError } from "../../../platform/http/errors.ts";
import { hash } from "./input.ts";

// CF-Connecting-IP is supplied by Cloudflare. Local requests share one bucket.
export async function limitOrderRequests(db: D1Database, storeId: string, request: Request, action: "create" | "track", now = Date.now()) {
  const bucket = Math.floor(now / 60000);
  const client = request.headers.get("cf-connecting-ip")?.slice(0, 64) || "local";
  const key = await hash(`${storeId}:${action}:${client}:${bucket}`);
  const limits = action === "create" ? [10, 300] : [120, 5000];
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
