import { env } from "cloudflare:workers";

export const STORE_ID = "store-loopi-nguyen-trai";
export const CONSENT_VERSION = "camera-location-v1";

type LoopiEnv = { DB?: D1Database; EVIDENCE?: R2Bucket };

export function getBindings() {
  const bindings = env as unknown as LoopiEnv;
  if (!bindings.DB) throw new Error("D1 binding DB is unavailable.");
  return { db: bindings.DB, evidence: bindings.EVIDENCE };
}

export function getDatabaseBinding() {
  return getBindings().db;
}

// Compatibility accessor for existing routes. Schema changes belong to migrations.
export async function ensureDatabase() {
  return getDatabaseBinding();
}
