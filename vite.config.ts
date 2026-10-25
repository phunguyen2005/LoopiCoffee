import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";
import { resolve } from "node:path";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
};

export default defineConfig(async ({ mode }) => {
  const localOnly = process.env.LOOPI_RUNTIME_PROFILE === "local" || process.env.LOOPI_LOCAL_ONLY === "true";
  const productionOnly = process.env.LOOPI_RUNTIME_PROFILE === "production";
  const envDir = localOnly ? resolve("tooling/local-runtime") : productionOnly ? resolve("tooling/production-runtime") : process.cwd();
  const appEnv = loadEnv(mode, envDir, "");
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? appEnv.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? appEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? appEnv.NEXT_PUBLIC_APP_URL ?? "";
  if (productionOnly) {
    for (const value of [supabaseUrl, appUrl]) {
      const url = new URL(value);
      if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
        throw new Error("Production requires HTTPS Supabase and application URLs.");
      }
    }
    if (!supabaseAnonKey) throw new Error("Production requires the public Supabase anon key at build time.");
  }

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    envDir,
    optimizeDeps: {
      exclude: ["framer-motion"],
    },
    ssr: {
      noExternal: ["framer-motion"],
    },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    define: {
      "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(supabaseAnonKey),
      "process.env.NEXT_PUBLIC_LOCAL_ONLY": JSON.stringify(localOnly ? "true" : "false"),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        ...(localOnly ? {
          configPath: resolve("tooling/local-runtime/wrangler.jsonc"),
          persistState: { path: resolve(".wrangler/local-readiness") },
          inspectorPort: false as const,
        } : process.env.LOOPI_WORKER_CONFIG ? {
          configPath: resolve(process.env.LOOPI_WORKER_CONFIG),
          ...(productionOnly ? {
            config: (config) => ({ vars: {
              ...config.vars,
              NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
              NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
              NEXT_PUBLIC_APP_URL: appUrl,
              APP_URL: appUrl,
              LOOPI_RUNTIME_PROFILE: "production",
              LOOPI_LOCAL_ONLY: "false",
              ALLOW_DEMO_AUTH: "false",
              ENABLE_DEMO_SEED: "false",
            } }),
          } : {}),
        } : { config: localBindingConfig }),
      }),
    ],
  };
});
