import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

// Execute the actual route/module, replacing only framework and service imports.
// A unique registry keeps parallel test dependencies isolated; no provider calls.
export async function loadModule(path, dependencies = {}) {
  const key = `__route_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const effectiveDependencies = {
    "@/platform/http/errors": {
      apiHandler: (fn) => fn,
      ApplicationError: class ApplicationError extends Error {
        constructor(message, code = "bad_request", status = 400) {
          super(message);
          this.code = code;
          this.status = status;
        }
      },
    },
    ...dependencies,
  };
  globalThis[key] = effectiveDependencies;
  let source = stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), "utf8"));
  source = source.replace(/import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g, (statement, bindings, specifier) => {
    if (!(specifier in effectiveDependencies)) throw new Error(`Missing test dependency: ${specifier}`);
    return `const {${bindings.replace(/\s+as\s+/g, ": ")}} = globalThis[${JSON.stringify(key)}][${JSON.stringify(specifier)}];`;
  });
  source = source.replace(/import\(["']([^"']+)["']\)/g, (statement, specifier) => {
    if (!(specifier in effectiveDependencies)) throw new Error(`Missing test dependency: ${specifier}`);
    return `Promise.resolve(globalThis[${JSON.stringify(key)}][${JSON.stringify(specifier)}])`;
  });
  source = source.replace(/export\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?/g, "");
  // The registry intentionally lasts through the test: dynamic imports run on requests.
  const loadedModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  return { module: loadedModule, dispose: () => { delete globalThis[key]; } };
}
