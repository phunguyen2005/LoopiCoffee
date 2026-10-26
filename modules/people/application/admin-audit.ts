export type AdminAuditCategory = "all" | "account" | "access" | "rbac";

export type AdminAuditEvent = {
  id: string;
  actor_email: string;
  entity_type: string;
  entity_id: string;
  action: string;
  created_at: string;
  target_label: string | null;
  details: Record<string, string | number | boolean | null>;
};

export type AdminAuditFilters = { category?: string | null; q?: string | null; limit?: number };

const categoryPatterns: Record<Exclude<AdminAuditCategory, "all">, string[]> = {
  account: ["account.%", "admin.%"],
  access: ["employee.access_%"],
  rbac: ["rbac.%"],
};
const allPatterns = [...categoryPatterns.account, ...categoryPatterns.access, ...categoryPatterns.rbac];
const sensitiveKey = /pass(word)?|token|secret|key|authorization|credential|^pin$|currentpin|newpin|pinhash|pinsalt/i;

/** Parses stored metadata into a flat, display-safe object; sensitive keys are dropped. */
export function sanitizeAuditDetails(raw: string | null): AdminAuditEvent["details"] {
  if (!raw) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return {}; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const details: AdminAuditEvent["details"] = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (sensitiveKey.test(key)) continue;
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      details[key] = typeof value === "string" ? value.slice(0, 300) : (value as number | boolean | null);
    } else if (Array.isArray(value)) {
      details[key] = value.filter((item) => typeof item === "string" || typeof item === "number").slice(0, 40).join(", ").slice(0, 300);
    }
  }
  return details;
}

export async function loadAdminAudit(db: D1Database, storeId: string, filters: AdminAuditFilters = {}): Promise<AdminAuditEvent[]> {
  const category = (filters.category ?? "all") as AdminAuditCategory;
  const patterns = category !== "all" && category in categoryPatterns ? categoryPatterns[category] : allPatterns;
  const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 100), 1), 200);
  const q = (filters.q ?? "").trim().toLowerCase().slice(0, 100);
  const clauses = [`a.store_id = ?`, `(${patterns.map(() => "a.action LIKE ?").join(" OR ")})`];
  const params: unknown[] = [storeId, ...patterns];
  if (q) {
    clauses.push("(lower(a.actor_email) LIKE ? ESCAPE '\\' OR lower(a.action) LIKE ? ESCAPE '\\' OR lower(COALESCE(t.email, json_extract(a.metadata, '$.newEmail'), json_extract(a.metadata, '$.email'), '')) LIKE ? ESCAPE '\\')");
    const like = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    params.push(like, like, like);
  }
  const result = await db.prepare(`SELECT a.id, a.actor_email, a.entity_type, a.entity_id, a.action, a.metadata, a.created_at,
      CASE WHEN a.entity_type = 'employee' THEN COALESCE(t.email, json_extract(a.metadata, '$.newEmail'), json_extract(a.metadata, '$.email'), a.entity_id) WHEN a.entity_type = 'custom_role' THEN cr.name ELSE a.entity_id END AS target_label
    FROM audit_events a
    LEFT JOIN employees t ON a.entity_type = 'employee' AND t.id = a.entity_id AND t.store_id = a.store_id
    LEFT JOIN custom_roles cr ON a.entity_type = 'custom_role' AND cr.id = a.entity_id AND cr.store_id = a.store_id
    WHERE ${clauses.join(" AND ")}
    ORDER BY a.created_at DESC LIMIT ?`).bind(...params, limit).all<{
      id: string; actor_email: string; entity_type: string; entity_id: string; action: string; metadata: string | null;
      created_at: string; target_label: string | null;
    }>();
  return result.results.map(({ metadata, ...row }) => ({ ...row, details: sanitizeAuditDetails(metadata) }));
}
