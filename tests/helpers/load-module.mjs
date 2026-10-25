import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

import * as manageHandovers from "../../modules/operations/application/manage-handovers.ts";
import * as checkHandoverGate from "../../modules/attendance/application/check-handover-gate.ts";
import * as changeStatus from "../../modules/ordering/application/change-status.ts";
import * as rbac from "../../modules/people/application/rbac.ts";
import * as resetPasswordModule from "../../modules/people/application/reset-password.ts";
import * as access from "../../modules/people/domain/access.ts";
import * as permissions from "../../modules/people/domain/permissions.ts";
import { hasGrantedPermission } from "../../modules/people/domain/permissions.ts";
import { auditStatement } from "../../server/audit.ts";
import * as exportSafety from "../../modules/payroll/domain/export-safety.ts";

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
    "@/modules/operations/application/manage-handovers": manageHandovers,
    "@/modules/attendance/application/check-handover-gate": checkHandoverGate,
    "@/modules/ordering/application/change-status": changeStatus,
    "@/modules/people/application/rbac": rbac,
    "@/modules/people/application/reset-password": resetPasswordModule,
    "@/modules/people/domain/access": access,
    "@/modules/people/domain/permissions": permissions,
    "@/server/audit": { auditStatement },
    "@/modules/payroll/domain/export-safety": exportSafety,
    "@/modules/people/application/update-access": {
      updateEmployeeAccess: async () => ({ updated: true }),
    },
    "@/lib/supabase/server": {
      createAdmin: () => ({
        auth: {
          admin: {
            createUser: async () => ({ data: { user: { id: "test-auth-user-id" } }, error: null }),
            inviteUserByEmail: async () => ({ data: { user: { id: "test-auth-user-id" } }, error: null }),
            listUsers: async () => ({ data: { users: [] }, error: null }),
            updateUserById: async () => ({ error: null }),
            deleteUser: async () => ({ error: null }),
          },
        },
      }),
    },
    ...dependencies,
  };
  const authDependency = effectiveDependencies["@/server/auth"];
  if (authDependency?.requireApiUser && !authDependency.requireApiPermission) {
    effectiveDependencies["@/server/auth"] = {
      ...authDependency,
      auditStatement: authDependency.auditStatement ?? auditStatement,
      requireApiPermission: async (permission) => {
        const auth = await authDependency.requireApiUser();
        if (!auth?.actor || auth.response) return auth;
        if (!hasGrantedPermission(auth.actor, permission)) {
          return { response: Response.json({ error: "Bạn không có quyền thực hiện thao tác này.", code: "permission_denied" }, { status: 403 }) };
        }
        return auth;
      },
    };
  }
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
