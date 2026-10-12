export function auditStatement(
  db: D1Database,
  actorEmail: string,
  entityType: string,
  entityId: string,
  action: string,
  metadata: Record<string, unknown>,
  createdAt = new Date().toISOString(),
  onlyIfChanged = false,
  id = crypto.randomUUID(),
) {
  return db.prepare(
    `INSERT INTO audit_events (id, actor_email, entity_type, entity_id, action, metadata, created_at, store_id)
     SELECT ?, ?, ?, ?, ?, ?, ?, (SELECT MIN(store_id) FROM employees WHERE lower(email) = lower(?) HAVING COUNT(*) = 1)
     ${onlyIfChanged ? "WHERE changes() = 1" : ""}`,
  ).bind(id, actorEmail, entityType, entityId, action, JSON.stringify(metadata), createdAt, actorEmail);
}
