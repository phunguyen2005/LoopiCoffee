import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { Miniflare } from "miniflare";
import { createClient } from "@supabase/supabase-js";
import { root, runtimeDirectory, authDirectory, stateDirectory, localDatabaseId, localEnvironment, assertLoopbackUrl } from "./local-environment.mjs";

const action = process.argv[2];
const binDir = resolve(root, "tooling/bin");
const dockerDesktopBin = "C:\\Program Files\\Docker\\Docker\\resources\\bin";
const pathSeparator = process.platform === "win32" ? ";" : ":";
const localPathEntries = [binDir, ...(process.platform === "win32" && existsSync(dockerDesktopBin) ? [dockerDesktopBin] : [])];

function getWslIp() {
  if (process.platform !== "win32") return "127.0.0.1";
  if (process.env.DOCKER_HOST) {
    try {
      const parsed = new URL(process.env.DOCKER_HOST.replace(/^tcp:/, "http:"));
      if (parsed.hostname) return parsed.hostname;
    } catch {}
  }
  try {
    const interfaces = networkInterfaces();
    const wslInterface = Object.entries(interfaces).find(([name]) => name.toLowerCase().includes("wsl"));
    const hostIp = wslInterface?.[1]?.find((addr) => addr.family === "IPv4")?.address;
    if (hostIp) {
      const arpOutput = spawnSync("arp", ["-a"], { encoding: "utf8", windowsHide: true, timeout: 3000 }).stdout || "";
      const lines = arpOutput.split(/\r?\n/);
      let inWslSection = false;
      for (const line of lines) {
        if (line.includes("Interface:") && line.includes(hostIp)) {
          inWslSection = true;
          continue;
        }
        if (inWslSection && line.includes("Interface:")) break;
        if (inWslSection) {
          const match = line.trim().match(/^(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]+)\s+dynamic/);
          if (match) return match[1];
        }
      }
    }
  } catch {}
  return "127.0.0.1";
}

const env = {
  ...process.env,
  CI: "1",
  WRANGLER_SEND_METRICS: "false",
  SUPABASE_TELEMETRY_DISABLED: "1",
  PATH: `${localPathEntries.join(pathSeparator)}${pathSeparator}${process.env.PATH || process.env.Path || ""}`,
  Path: `${localPathEntries.join(pathSeparator)}${pathSeparator}${process.env.PATH || process.env.Path || ""}`,
};
for (const key of Object.keys(env)) if (/^(CLOUDFLARE_|CF_API_|SUPABASE_ACCESS_TOKEN)/.test(key)) delete env[key];
const supabaseBin = resolve(root, "node_modules/supabase/dist/supabase.js");
const wranglerBin = resolve(root, "node_modules/wrangler/bin/wrangler.js");

function run(executable, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd: root, env, stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? accept() : reject(new Error(`Local command failed (exit ${code}).`)));
  });
}

function readAuthStatus() {
  const result = spawnSync(process.execPath, [supabaseBin, "status", "--workdir", authDirectory, "-o", "env"], { cwd: root, env, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error("Local Supabase is unavailable. Start Docker and run npm run local:auth:start.");
  const status = parseEnv(result.stdout);
  if (status.API_URL) {
    try {
      const url = new URL(status.API_URL);
      status.API_URL = `http://127.0.0.1:${url.port || "54321"}`;
    } catch {}
  }
  assertLoopbackUrl(status.API_URL, "Supabase status URL");
  if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error("Local Supabase credentials are incomplete.");
  return status;
}

function configureAuth() {
  const status = readAuthStatus();
  const path = resolve(runtimeDirectory, ".dev.vars");
  const old = existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
  const variables = {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:4173",
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    CRON_SECRET: old.CRON_SECRET || randomBytes(32).toString("hex"),
    LOOPI_LOCAL_ONLY: "true", ALLOW_DEMO_AUTH: "false", ENABLE_DEMO_SEED: "false",
  };
  mkdirSync(runtimeDirectory, { recursive: true });
  writeFileSync(path, Object.entries(variables).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
  console.log("Configured local Auth. Credentials saved only in ignored local files.");
  console.log("Rebuilding application preview with local configuration...");
  spawnSync(process.execPath, [resolve(root, "tooling/run-local.mjs"), "build"], { cwd: root, env, stdio: "inherit" });
}

async function migrate() {
  const marker = resolve(stateDirectory, "LOCAL_TEST_ENVIRONMENT");
  mkdirSync(stateDirectory, { recursive: true });
  if (!existsSync(marker)) {
    // This dedicated location never adopts the user's existing .wrangler/state DB.
    const { readdirSync } = await import("node:fs");
    if (readdirSync(stateDirectory).length) throw new Error("Unknown contents in local test directory; refusing to adopt or reset it.");
    writeFileSync(marker, "LoopyCafe disposable local verification data\n");
  }
  await run(process.execPath, [wranglerBin, "d1", "migrations", "apply", "DB", "--local", "--persist-to", stateDirectory, "--config", resolve(runtimeDirectory, "wrangler.jsonc")]);
}

async function seedMenu(db, storeId = "store-loopi-nguyen-trai") {
  const now = new Date().toISOString();
  await db.prepare("INSERT OR IGNORE INTO stores(id,name,address,timezone,latitude,longitude,attendance_enabled,created_at,updated_at) VALUES(?,?,?,'Asia/Ho_Chi_Minh',10.754128,106.66754,1,?,?)").bind(storeId, storeId.includes("quan-1") ? "LoopyCafe Quận 1 (Test Isolation)" : "LoopyCafe Local", "Dữ liệu thử trên máy", now, now).run();
  await db.prepare("INSERT OR IGNORE INTO attendance_rules(id,store_id,version,early_checkin_minutes,late_minutes,early_departure_minutes,absence_minutes,missing_checkout_minutes,evidence_retention_days,active,created_by,created_at) VALUES(?,?,1,30,10,15,60,180,90,1,'local-operator',?)").bind(`rules-${storeId}`, storeId, now).run();
  const catId = `drinks-${storeId}`;
  await db.prepare("INSERT OR IGNORE INTO menu_categories(id,store_id,name,sort_order,is_active,created_at,updated_at) VALUES(?,?,'Đồ uống thử',0,1,?,?)").bind(catId, storeId, now, now).run();
  const itemId = storeId === "store-loopi-nguyen-trai" ? "local-coffee" : `coffee-${storeId}`;
  await db.prepare("INSERT OR IGNORE INTO menu_items(id,store_id,category_id,name,base_price,image_url,is_available,created_at,updated_at) VALUES(?,?,?,'Cà phê sữa',30000,'/laboong/hero-lifestyle.jpg',1,?,?)").bind(itemId, storeId, catId, now, now).run();
  for (const option of [
    [`${storeId}-size-m`, "size", "M", 0, 1],
    [`${storeId}-size-l`, "size", "L", 6000, 0],
    [`${storeId}-sugar`, "sugar", "100% đường", 0, 1],
    [`${storeId}-ice`, "ice", "100% đá", 0, 1],
    [`${storeId}-topping`, "topping", "Trân châu", 10000, 0],
  ]) {
    await db.prepare("INSERT OR IGNORE INTO menu_options(id,store_id,group_type,name,price_modifier,is_default,is_available,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)").bind(option[0], storeId, ...option.slice(1), now, now).run();
  }
  await db.prepare("INSERT OR IGNORE INTO store_ordering_settings(id,store_id,is_ordering_open,updated_at) VALUES(?,?,1,?)").bind(`ordering-${storeId}`, storeId, now).run();
}

async function seedMenuOnly() {
  await migrate();
  const runtime = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("local"); } }', compatibilityDate: "2026-05-15", d1Databases: { DB: localDatabaseId }, d1Persist: resolve(stateDirectory, "v3/d1") });
  try {
    const db = await runtime.getD1Database("DB");
    await seedMenu(db, "store-loopi-nguyen-trai");
    await seedMenu(db, "store-loopi-quan-1");
    console.log("Local sample menu provisioned for Store 1 and Store 2. No auth or external calls.");
  } finally { await runtime.dispose(); }
}

async function provision() {
  const settings = localEnvironment({ requireCredentials: true });
  assertLoopbackUrl(settings.NEXT_PUBLIC_SUPABASE_URL, "Provision target");
  await migrate();
  const client = createClient(settings.NEXT_PUBLIC_SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => {
      assertLoopbackUrl(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "Auth request");
      return fetch(input, { ...init, redirect: "error" });
    } },
  });
  const runtime = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("local"); } }', compatibilityDate: "2026-05-15", d1Databases: { DB: localDatabaseId }, d1Persist: resolve(stateDirectory, "v3/d1") });
  try {
    const db = await runtime.getD1Database("DB");
    const credentialsFile = resolve(stateDirectory, "accounts.json");
    const existingAccounts = existsSync(credentialsFile) ? JSON.parse(readFileSync(credentialsFile, "utf8")) : [];
    const defaultAccounts = [
      { id: "local-admin", email: "admin@loopicafe.test", role: "system_admin", name: "Quản trị viên Hệ thống", storeId: "store-loopi-nguyen-trai" },
      { id: "local-owner", email: "owner@loopicafe.test", role: "owner", name: "Chủ quán thử nghiệm", storeId: "store-loopi-nguyen-trai" },
      { id: "local-manager", email: "manager@loopicafe.test", role: "manager", name: "Quản lý thử nghiệm", storeId: "store-loopi-nguyen-trai" },
      { id: "local-lead", email: "lead@loopicafe.test", role: "team_lead", name: "Trưởng ca thử nghiệm", storeId: "store-loopi-nguyen-trai" },
      { id: "local-staff-a", email: "staff.a@loopicafe.test", role: "employee", name: "Nhân viên A", storeId: "store-loopi-nguyen-trai" },
      { id: "local-staff-b", email: "staff.b@loopicafe.test", role: "employee", name: "Nhân viên B", storeId: "store-loopi-nguyen-trai" },
      { id: "local-must-change-pw", email: "mustchange@loopicafe.test", role: "employee", name: "Nhân viên Đổi mật khẩu", storeId: "store-loopi-nguyen-trai", mustChangePassword: true },
      { id: "local-suspended", email: "suspended@loopicafe.test", role: "employee", name: "Nhân viên Bị khóa", storeId: "store-loopi-nguyen-trai", status: "suspended" },
      { id: "local-reset-pending", email: "resetpending@loopicafe.test", role: "employee", name: "Nhân viên Chờ reset", storeId: "store-loopi-nguyen-trai", passwordResetPending: true },
      { id: "local-store2-owner", email: "owner.store2@loopicafe.test", role: "owner", name: "Chủ quán Store 2", storeId: "store-loopi-quan-1" },
    ];

    const merged = [...existingAccounts];
    for (const def of defaultAccounts) {
      if (!merged.some((item) => item.id === def.id || item.email === def.email)) {
        merged.push({ ...def, password: randomBytes(18).toString("base64url") + "aA1!" });
      }
    }
    // Persist before provider call so partial run can be safely retried.
    writeFileSync(credentialsFile, JSON.stringify(merged, null, 2), { mode: 0o600 });
    const { data, error } = await client.auth.admin.listUsers({ perPage: 100 });
    if (error) throw new Error("Cannot list local auth fixtures.");

    const now = new Date().toISOString();
    await seedMenu(db, "store-loopi-nguyen-trai");
    await seedMenu(db, "store-loopi-quan-1");

    for (const account of merged) {
      let user = data.users.find((entry) => entry.email === account.email);
      if (!user) {
        const created = await client.auth.admin.createUser({
          email: account.email,
          password: account.password,
          email_confirm: true,
          user_metadata: { full_name: account.name },
        });
        if (created.error || !created.data.user) throw new Error(`Could not create local fixture ${account.id}. Rerun safely after resolving local Auth.`);
        user = created.data.user;
      }
      const storeId = account.storeId || "store-loopi-nguyen-trai";
      const status = account.status || "active";
      const mustChange = account.mustChangePassword ? 1 : 0;
      const resetPending = account.passwordResetPending ? 1 : 0;

      await db.prepare(
        `INSERT OR IGNORE INTO employees(
          id, store_id, email, display_name, auth_user_id, role, status,
          must_change_password, password_reset_pending,
          participates_attendance, payroll_eligible, compensation_type, hourly_rate,
          created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'hourly', 30000, ?, ?)`
      ).bind(
        account.id, storeId, account.email, account.name, user.id, account.role, status,
        mustChange, resetPending, now, now
      ).run();
      await db.prepare(
        `UPDATE employees
         SET auth_user_id = ?, updated_at = ?
         WHERE id = ? AND store_id = ? AND lower(email) = lower(?)
           AND (auth_user_id IS NULL OR auth_user_id <> ?)`,
      ).bind(user.id, now, account.id, storeId, account.email, user.id).run();
    }
    console.log(`Provisioned ${merged.length} fixtures across 5 roles, lifecycle accounts, and Store 1/2. Existing records preserved.`);
    console.log("Local test credentials: .wrangler/local-readiness/accounts.json (ignored by Git).");
  } finally { await runtime.dispose(); }
}

async function checkDockerRunning() {
  try {
    const wslIp = getWslIp();
    const res = await fetch(`http://${wslIp}:2375/_ping`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) return true;
  } catch {}
  try {
    const result = spawnSync(resolve(binDir, "docker.exe"), ["version"], { env, encoding: "utf8", windowsHide: true, timeout: 8000 });
    return result.status === 0;
  } catch { return false; }
}

async function checkEndpoint(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok || res.status < 500;
  } catch { return false; }
}

try {
  if (action === "auth:start") {
    if (!existsSync(resolve(authDirectory,"supabase/config.toml"))) throw new Error("Missing dedicated local Auth config.");
    await run(process.execPath, [supabaseBin,"start", "--workdir", authDirectory, "--exclude", "studio,realtime,storage-api,imgproxy,postgrest,edge-runtime,logflare,vector,supavisor"]);
    configureAuth();
  } else if (action === "auth:configure") configureAuth();
  else if (action === "auth:stop") await run(process.execPath, [supabaseBin,"stop", "--workdir", authDirectory]);
  else if (action === "migrate") await migrate();
  else if (action === "provision") await provision();
  else if (action === "seed-menu") await seedMenuOnly();
  else if (action === "doctor") {
    const settings = localEnvironment();
    const dockerOk = await checkDockerRunning();
    const authOk = await checkEndpoint(`${settings.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`);
    const smtpOk = await checkEndpoint("http://127.0.0.1:54324/api/v1/messages");
    console.log(JSON.stringify({
      node: process.version,
      supabaseCliInstalled: existsSync(supabaseBin),
      dockerDaemonRunning: dockerOk,
      supabaseAuthRunning: authOk,
      localSmtpRunning: smtpOk,
      localCredentialsConfigured: Boolean(settings.SUPABASE_SERVICE_ROLE_KEY),
      supabaseUrl: settings.NEXT_PUBLIC_SUPABASE_URL,
      appUrl: settings.NEXT_PUBLIC_APP_URL,
      stateDirectory,
      legacyDatabaseUntouched: true,
    }, null, 2));
  } else throw new Error("Allowed local actions: doctor, auth:start, auth:configure, auth:stop, migrate, provision. No reset or remote operation is supported.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Local setup failed.");
  process.exitCode = 1;
}
