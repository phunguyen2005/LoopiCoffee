import { env } from "cloudflare:workers";
import { createEvidenceStorage } from "../platform/storage/evidence";

export const STORE_ID = "store-loopi-nguyen-trai";
export const CONSENT_VERSION = "camera-location-v1";

type LoopiEnv = {
  DB?: D1Database;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_EVIDENCE_BUCKET?: string;
};

export function getBindings() {
  const bindings = env as unknown as LoopiEnv;
  if (!bindings.DB) throw new Error("D1 binding DB is unavailable.");
  const evidence = createEvidenceStorage({
    url: bindings.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: bindings.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: bindings.SUPABASE_EVIDENCE_BUCKET ?? process.env.SUPABASE_EVIDENCE_BUCKET,
    localOnly: process.env.LOOPI_LOCAL_ONLY === "true" || process.env.LOOPI_RUNTIME_PROFILE === "local",
  });
  return { db: bindings.DB, evidence };
}

export function getDatabaseBinding() {
  return getBindings().db;
}

// Compatibility accessor for existing routes. Schema changes belong to migrations.
export async function ensureDatabase() {
  return getDatabaseBinding();
}
