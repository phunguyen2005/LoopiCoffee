import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export const root = resolve(import.meta.dirname, "..");
export const runtimeDirectory = resolve(root, "tooling/local-runtime");
export const authDirectory = resolve(root, "tooling/local-auth");
export const stateDirectory = resolve(root, ".wrangler/local-readiness");
export const localDatabaseId = "00000000-0000-4000-8000-000000000000";

export function assertLoopbackUrl(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} must be a valid local URL.`); }
  const isLoopbackHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(url.hostname);
  if (!["http:", "https:"].includes(url.protocol) || !isLoopbackHost || url.username || url.password) {
    throw new Error(`${label} must use a loopback host; cloud access is disabled.`);
  }
  return url;
}

export function localEnvironment({ requireCredentials = false } = {}) {
  const filename = resolve(runtimeDirectory, ".dev.vars");
  const saved = existsSync(filename) ? parseEnv(readFileSync(filename, "utf8")) : {};
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-build-placeholder",
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:4173",
    SUPABASE_SERVICE_ROLE_KEY: "",
    CRON_SECRET: "",
    SEED_SECRET: "",
    TEST_ACCOUNT_PASSWORD: "",
    ...saved,
    ALLOW_DEMO_AUTH: "false",
    ENABLE_DEMO_SEED: "false",
    LOOPI_LOCAL_ONLY: "true",
    LOOPI_RUNTIME_PROFILE: "local",
    WRANGLER_SEND_METRICS: "false",
    SUPABASE_TELEMETRY_DISABLED: "1",
  };
  assertLoopbackUrl(env.NEXT_PUBLIC_SUPABASE_URL, "Supabase URL");
  assertLoopbackUrl(env.NEXT_PUBLIC_APP_URL, "Application URL");
  if (requireCredentials && (!env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "local-build-placeholder")) {
    throw new Error("Local Auth is not configured. Run npm run local:auth:start, then npm run local:provision.");
  }
  return env;
}
