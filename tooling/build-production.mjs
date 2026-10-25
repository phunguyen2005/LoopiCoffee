import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const configPath = resolve(root, process.env.LOOPI_WORKER_CONFIG || "wrangler.production.jsonc");
if (!existsSync(configPath) && process.env.CLOUDFLARE_D1_DATABASE_ID && !process.env.LOOPI_WORKER_CONFIG) {
  const template = JSON.parse(readFileSync(resolve(root, "wrangler.production.example.jsonc"), "utf8"));
  template.d1_databases[0].database_id = process.env.CLOUDFLARE_D1_DATABASE_ID;
  writeFileSync(configPath, JSON.stringify(template, null, 2) + "\n");
}
if (!existsSync(configPath)) throw new Error("Copy wrangler.production.example.jsonc to wrangler.production.jsonc and configure production D1 first.");
// The provided template is JSON-compatible; keep it that way for this preflight.
const config = JSON.parse(readFileSync(configPath, "utf8"));
const database = config.d1_databases?.find((item) => item.binding === "DB");
if (!database || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(database.database_id) || /^0{8}-/.test(database.database_id)) {
  throw new Error("Configure a real production D1 database ID before building.");
}
if (config.r2_buckets?.length) throw new Error("This production profile uses Supabase Storage and must not provision R2.");
const child = spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), "build", "--mode", "production"], {
  cwd: root,
  env: { ...process.env, LOOPI_WORKER_CONFIG: configPath, LOOPI_RUNTIME_PROFILE: "production", LOOPI_LOCAL_ONLY: "false", NEXT_PUBLIC_LOCAL_ONLY: "false", ALLOW_DEMO_AUTH: "false", ENABLE_DEMO_SEED: "false" },
  stdio: "inherit",
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
child.on("error", () => { console.error("Unable to build the production Worker."); process.exitCode = 1; });
