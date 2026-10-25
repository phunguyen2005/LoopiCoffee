import { ensureDatabase } from "@/db/runtime";
import { apiHandler } from "@/platform/http/errors";
import { requireApiUser } from "@/server/auth";

export const GET = apiHandler(async () => {
  const auth = await requireApiUser(["system_admin"]);
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const [accounts, failedOperations, recent] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status = 'invited' THEN 1 ELSE 0 END) AS invited,
      SUM(CASE WHEN status IN ('suspended','offboarded','inactive') THEN 1 ELSE 0 END) AS blocked
      FROM employees WHERE store_id = ? AND role <> 'system_admin'`).bind(auth.actor.storeId).first(),
    db.prepare("SELECT COUNT(*) AS count FROM admin_account_operations WHERE store_id = ? AND status = 'failed'").bind(auth.actor.storeId).first(),
    db.prepare(`SELECT actor_email, action, created_at FROM audit_events
      WHERE store_id = ? AND (action LIKE 'account.%' OR action LIKE 'employee.access_%' OR action LIKE 'rbac.%')
      ORDER BY created_at DESC LIMIT 6`).bind(auth.actor.storeId).all(),
  ]);
  return Response.json({ accounts, failedOperations, recent: recent.results }, { headers: { "Cache-Control": "private, no-store" } });
});

