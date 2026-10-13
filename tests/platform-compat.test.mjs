import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("../", import.meta.url));

function getCheckPlatform() {
  try {
    const npmDir = join(dirname(process.execPath), "node_modules", "npm");
    const req = createRequire(join(npmDir, "package.json"));
    const { checkPlatform } = req("npm-install-checks");
    if (typeof checkPlatform === "function") {
      return checkPlatform;
    }
  } catch {
    // Fall back to npm specification compliant implementation
  }

  return function checkPlatform(target, force = false, environment = {}) {
    if (force) return;
    const os = environment.os || process.platform;
    const cpu = environment.cpu || process.arch;
    const checkList = (value, list) => {
      if (typeof list === "string") list = [list];
      if (list.length === 1 && list[0] === "any") return true;
      let negated = 0;
      let match = false;
      for (const entry of list) {
        const negate = entry.charAt(0) === "!";
        const testVal = negate ? entry.slice(1) : entry;
        if (negate) {
          negated++;
          if (value === testVal) return false;
        } else {
          match = match || value === testVal;
        }
      }
      return match || negated === list.length;
    };
    const osOk = target.os ? checkList(os, target.os) : true;
    const cpuOk = target.cpu ? checkList(cpu, target.cpu) : true;
    if (!osOk || !cpuOk) {
      throw Object.assign(new Error("Unsupported platform"), {
        code: "EBADPLATFORM",
        required: { os: target.os, cpu: target.cpu },
        current: { os, cpu }
      });
    }
  };
}

test("package.json does not declare platform-pinned @supabase/cli-windows-x64 directly", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const devDeps = pkg.devDependencies || {};
  const deps = pkg.dependencies || {};

  assert.equal(
    devDeps["@supabase/cli-windows-x64"],
    undefined,
    "package.json devDependencies must not contain platform-specific @supabase/cli-windows-x64"
  );
  assert.equal(
    deps["@supabase/cli-windows-x64"],
    undefined,
    "package.json dependencies must not contain platform-specific @supabase/cli-windows-x64"
  );
  assert.ok(
    devDeps["supabase"],
    "package.json devDependencies must include generic 'supabase' multi-platform CLI runner"
  );
});

test("package-lock.json configures cross-platform optional binaries without root EBADPLATFORM blockers", () => {
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  const rootPackage = lock.packages[""];
  const rootDevDeps = rootPackage?.devDependencies || {};

  assert.equal(
    rootDevDeps["@supabase/cli-windows-x64"],
    undefined,
    "package-lock.json packages[''].devDependencies must not contain direct @supabase/cli-windows-x64"
  );

  const winPkg = lock.packages["node_modules/@supabase/cli-windows-x64"];
  assert.ok(winPkg, "package-lock.json must contain node_modules/@supabase/cli-windows-x64");
  assert.equal(winPkg.optional, true, "@supabase/cli-windows-x64 must be optional in package-lock.json");

  const linuxPkg = lock.packages["node_modules/@supabase/cli-linux-x64"];
  assert.ok(linuxPkg, "package-lock.json must contain node_modules/@supabase/cli-linux-x64");
  assert.equal(linuxPkg.optional, true, "@supabase/cli-linux-x64 must be optional in package-lock.json");

  const supabasePkg = lock.packages["node_modules/supabase"];
  assert.ok(supabasePkg, "package-lock.json must contain node_modules/supabase");
  assert.ok(
    supabasePkg.optionalDependencies && supabasePkg.optionalDependencies["@supabase/cli-linux-x64"],
    "node_modules/supabase must declare @supabase/cli-linux-x64 in optionalDependencies"
  );
  assert.ok(
    supabasePkg.optionalDependencies && supabasePkg.optionalDependencies["@supabase/cli-windows-x64"],
    "node_modules/supabase must declare @supabase/cli-windows-x64 in optionalDependencies"
  );
});

test("npm platform check on Linux x64 succeeds without EBADPLATFORM across all required packages", () => {
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  const checkPlatform = getCheckPlatform();
  const linuxEnv = { os: "linux", cpu: "x64" };

  // 1. Verify that @supabase/cli-linux-x64 passes platform check on Linux x64
  const linuxCli = lock.packages["node_modules/@supabase/cli-linux-x64"];
  assert.doesNotThrow(
    () => checkPlatform(linuxCli, false, linuxEnv),
    "Linux CLI package must pass platform check on Linux x64"
  );

  // 2. Verify that @supabase/cli-windows-x64 would throw EBADPLATFORM if it were required
  const winCli = lock.packages["node_modules/@supabase/cli-windows-x64"];
  assert.throws(
    () => checkPlatform(winCli, false, linuxEnv),
    (err) => err && err.code === "EBADPLATFORM",
    "Windows CLI binary must reject Linux platform when evaluated directly"
  );

  // 3. Verify that all non-optional packages in lockfile pass platform check on Linux x64
  const nonOptionalMismatches = [];
  for (const [pkgPath, pkgMeta] of Object.entries(lock.packages)) {
    if (pkgPath === "" || pkgMeta.optional) continue;
    try {
      checkPlatform(pkgMeta, false, linuxEnv);
    } catch (err) {
      if (err.code === "EBADPLATFORM") {
        nonOptionalMismatches.push({ pkgPath, os: pkgMeta.os, cpu: pkgMeta.cpu });
      } else {
        throw err;
      }
    }
  }

  assert.deepEqual(
    nonOptionalMismatches,
    [],
    "Zero non-optional dependencies may fail platform check on Linux x64"
  );
});

test("npm platform check on Windows x64 succeeds without EBADPLATFORM for local development", () => {
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  const checkPlatform = getCheckPlatform();
  const winEnv = { os: "win32", cpu: "x64" };

  // 1. Verify that @supabase/cli-windows-x64 passes platform check on Windows x64
  const winCli = lock.packages["node_modules/@supabase/cli-windows-x64"];
  assert.doesNotThrow(
    () => checkPlatform(winCli, false, winEnv),
    "Windows CLI package must pass platform check on Windows x64"
  );

  // 2. Verify that all non-optional packages in lockfile pass platform check on Windows x64
  const nonOptionalMismatches = [];
  for (const [pkgPath, pkgMeta] of Object.entries(lock.packages)) {
    if (pkgPath === "" || pkgMeta.optional) continue;
    try {
      checkPlatform(pkgMeta, false, winEnv);
    } catch (err) {
      if (err.code === "EBADPLATFORM") {
        nonOptionalMismatches.push({ pkgPath, os: pkgMeta.os, cpu: pkgMeta.cpu });
      } else {
        throw err;
      }
    }
  }

  assert.deepEqual(
    nonOptionalMismatches,
    [],
    "Zero non-optional dependencies may fail platform check on Windows x64"
  );
});
