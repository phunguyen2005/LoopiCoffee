import { env } from "cloudflare:workers";

type LoopiEnv = {
  DB?: D1Database;
  EVIDENCE?: R2Bucket;
};

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL,
    timezone TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
    role TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL, employee_email TEXT NOT NULL,
    starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, role_label TEXT NOT NULL,
    status TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_capture_sessions (
    id TEXT PRIMARY KEY, employee_email TEXT NOT NULL, store_id TEXT NOT NULL,
    action TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_sessions (
    id TEXT PRIMARY KEY, employee_email TEXT NOT NULL, store_id TEXT NOT NULL,
    shift_id TEXT, status TEXT NOT NULL, opened_at TEXT, closed_at TEXT, worked_minutes INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_events (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, employee_email TEXT NOT NULL,
    action TEXT NOT NULL, recorded_at TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
    verification_results TEXT NOT NULL, review_required INTEGER NOT NULL,
    exception_reason TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_locations (
    event_id TEXT PRIMARY KEY, latitude REAL NOT NULL, longitude REAL NOT NULL,
    accuracy_meters REAL NOT NULL, browser_position_at TEXT,
    server_received_at TEXT NOT NULL, distance_from_store_meters REAL NOT NULL,
    expires_at TEXT NOT NULL, deleted_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_photos (
    event_id TEXT PRIMARY KEY, object_key TEXT NOT NULL, mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL, overlay_version TEXT NOT NULL,
    expires_at TEXT NOT NULL, deleted_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL, action TEXT NOT NULL, metadata TEXT, created_at TEXT NOT NULL
  )`,
];

export function getBindings() {
  const bindings = env as unknown as LoopiEnv;
  if (!bindings.DB) throw new Error("D1 binding DB is unavailable.");
  return { db: bindings.DB, evidence: bindings.EVIDENCE };
}

export async function ensureDatabase() {
  const { db } = getBindings();
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  await db.prepare(
    `INSERT OR IGNORE INTO stores
      (id, name, address, timezone, latitude, longitude, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    "store-loopi-nguyen-trai",
    "LoopiCafe Nguyễn Trãi",
    "Nguyễn Trãi, Quận 5, TP. Hồ Chí Minh",
    "Asia/Ho_Chi_Minh",
    10.754128,
    106.66754,
    new Date().toISOString(),
  ).run();
  return db;
}
