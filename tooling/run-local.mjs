import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { localEnvironment, root } from "./local-environment.mjs";

const action = process.argv[2];
const commands = {
  dev: ["--host", "127.0.0.1", "--port", "4173", "--strictPort"],
  build: ["build"],
  preview: ["preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
};
if (!(action in commands)) throw new Error("Expected dev, build or preview. This tool cannot deploy.");
const env = { ...process.env, CI: "1", ...localEnvironment() };
for (const key of Object.keys(env)) if (/^(CLOUDFLARE_|CF_API_|SUPABASE_ACCESS_TOKEN)/.test(key)) delete env[key];
const child = spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), ...commands[action]], { cwd: root, env, stdio: ["ignore", "inherit", "inherit"] });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => { process.exitCode = code ?? 1; });
child.on("error", () => { console.error("Unable to start local runtime."); process.exitCode = 1; });
