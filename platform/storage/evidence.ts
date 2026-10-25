import { createClient } from "@supabase/supabase-js";

export const DEFAULT_EVIDENCE_BUCKET = "attendance-evidence";
// SVG contains the validated JPEG as base64 plus the server stamp.
export const MAX_EVIDENCE_BYTES = 3 * 1024 * 1024;

export interface EvidenceStorage {
  put(key: string, bytes: Uint8Array, options?: {
    httpMetadata?: { contentType?: string };
    customMetadata?: Record<string, string>;
  }): Promise<void>;
  get(key: string): Promise<{ body: Blob } | null>;
  delete(key: string): Promise<void>;
}

type StorageConfig = {
  url?: string;
  serviceRoleKey?: string;
  bucket?: string;
  localOnly?: boolean;
};

export function createEvidenceStorage(config: StorageConfig, request: typeof fetch = fetch): EvidenceStorage | undefined {
  if (!config.url || !config.serviceRoleKey) return undefined;
  const origin = new URL(config.url);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" ||
    (config.localOnly ? !loopback || !["http:", "https:"].includes(origin.protocol) : origin.protocol !== "https:" || loopback)) {
    throw new Error("Evidence storage URL is invalid for this environment.");
  }
  const bucket = config.bucket || DEFAULT_EVIDENCE_BUCKET;
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(bucket)) throw new Error("Evidence bucket name is invalid.");
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const target = new URL(input instanceof Request ? input.url : String(input));
      if (target.origin !== origin.origin) throw new Error("Evidence storage request left the configured origin.");
      // Never forward service-role credentials through a redirect.
      const response = await request(input, { ...init, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) throw new Error("Evidence storage redirect is forbidden.");
      return response;
    } },
  });
  const files = client.storage.from(bucket);

  function validateKey(key: string) {
    if (!/^[\w-]+\/attendance\/[\w-]+\/\d{4}\/\d{2}\/[\w-]+\.svg$/.test(key)) {
      throw new Error("Evidence object key is invalid.");
    }
  }

  async function requirePrivateBucket() {
    const { data, error } = await client.storage.getBucket(bucket);
    if (error || !data || data.public !== false) {
      throw new Error("A private evidence bucket must be configured.");
    }
  }

  return {
    async put(key, bytes, options) {
      validateKey(key);
      if (!bytes.byteLength || bytes.byteLength > MAX_EVIDENCE_BYTES) throw new Error("Evidence file is too large or empty.");
      await requirePrivateBucket();
      const { error } = await files.upload(key, bytes, {
        upsert: false,
        contentType: options?.httpMetadata?.contentType?.split(";")[0] || "image/svg+xml",
        cacheControl: "0",
        metadata: options?.customMetadata,
      });
      if (error) throw new Error("Evidence upload failed.");
    },
    async get(key) {
      validateKey(key);
      await requirePrivateBucket();
      const { data, error } = await files.download(key);
      if (error) {
        const missing = error as { status?: number; statusCode?: string | number; message?: string };
        if (String(missing.statusCode ?? missing.status) === "404" || missing.message === "Object not found") return null;
        throw new Error("Evidence download failed.");
      }
      return data ? { body: data } : null;
    },
    async delete(key) {
      validateKey(key);
      await requirePrivateBucket();
      const { error } = await files.remove([key]);
      if (error) throw new Error("Evidence deletion failed.");
    },
  };
}
