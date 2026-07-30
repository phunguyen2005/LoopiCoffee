import { env } from "cloudflare:workers";

export const STORE_ID = "store-loopi-nguyen-trai";
export const CONSENT_VERSION = "camera-location-v1";

type LoopiEnv = {
  DB?: D1Database;
  EVIDENCE?: R2Bucket;
};

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL,
    timezone TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
    attendance_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL,
    invited_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS employee_consents (
    id TEXT PRIMARY KEY, employee_email TEXT NOT NULL,
    notice_version TEXT NOT NULL, consented_at TEXT NOT NULL,
    UNIQUE(employee_email, notice_version)
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_rules (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL, version INTEGER NOT NULL,
    early_checkin_minutes INTEGER NOT NULL, late_minutes INTEGER NOT NULL,
    early_departure_minutes INTEGER NOT NULL, absence_minutes INTEGER NOT NULL,
    missing_checkout_minutes INTEGER NOT NULL, evidence_retention_days INTEGER NOT NULL,
    active INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(store_id, version)
  )`,
  `CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL, employee_email TEXT NOT NULL,
    starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, timezone_snapshot TEXT NOT NULL,
    role_label TEXT NOT NULL, is_shift_lead INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_capture_sessions (
    id TEXT PRIMARY KEY, employee_email TEXT NOT NULL, store_id TEXT NOT NULL,
    action TEXT NOT NULL, nonce_hash TEXT NOT NULL,
    issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_sessions (
    id TEXT PRIMARY KEY, employee_email TEXT NOT NULL, store_id TEXT NOT NULL,
    shift_id TEXT, rule_version_id TEXT, status TEXT NOT NULL,
    opened_at TEXT, closed_at TEXT, worked_minutes INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_events (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, employee_email TEXT NOT NULL,
    action TEXT NOT NULL, recorded_at TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
    verification_results TEXT NOT NULL, review_required INTEGER NOT NULL,
    photo_status TEXT NOT NULL, exception_reason TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_locations (
    event_id TEXT PRIMARY KEY, latitude REAL NOT NULL, longitude REAL NOT NULL,
    accuracy_meters REAL NOT NULL, browser_position_at TEXT,
    server_received_at TEXT NOT NULL, distance_from_store_meters REAL NOT NULL,
    expires_at TEXT NOT NULL, deleted_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_photos (
    event_id TEXT PRIMARY KEY, object_key TEXT NOT NULL, mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, overlay_version TEXT NOT NULL,
    expires_at TEXT NOT NULL, deleted_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_exceptions (
    id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, employee_reason TEXT NOT NULL,
    status TEXT NOT NULL, reviewer_email TEXT, reviewer_note TEXT,
    reviewed_at TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_action_limits (
    id TEXT PRIMARY KEY, employee_email TEXT NOT NULL,
    action TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS checklist_items (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL, label TEXT NOT NULL,
    assignee TEXT NOT NULL, required INTEGER NOT NULL, completed INTEGER NOT NULL,
    completed_at TEXT, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL, reporter_email TEXT NOT NULL,
    title TEXT NOT NULL, category TEXT NOT NULL, severity TEXT NOT NULL,
    status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS handovers (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL, author_email TEXT NOT NULL,
    summary TEXT NOT NULL, manager_attention INTEGER NOT NULL,
    acknowledged_at TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL, employee_email TEXT NOT NULL,
    type TEXT NOT NULL, title TEXT NOT NULL, reason TEXT NOT NULL,
    status TEXT NOT NULL, reviewer_email TEXT, reviewed_at TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, recipient_email TEXT NOT NULL, type TEXT NOT NULL,
    title TEXT NOT NULL, entity_href TEXT, read_at TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL, action TEXT NOT NULL, metadata TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS attendance_action_limits_email_time_idx
    ON attendance_action_limits(employee_email, created_at)`,
  `CREATE INDEX IF NOT EXISTS shifts_employee_start_idx
    ON shifts(employee_email, starts_at)`,
  `CREATE INDEX IF NOT EXISTS shifts_store_status_ends_idx
    ON shifts(store_id, status, ends_at)`,
  `CREATE INDEX IF NOT EXISTS attendance_sessions_store_closed_idx
    ON attendance_sessions(store_id, closed_at)`,
  `CREATE INDEX IF NOT EXISTS attendance_sessions_employee_activity_idx
    ON attendance_sessions(store_id, employee_email, opened_at, closed_at)`,
  `CREATE INDEX IF NOT EXISTS attendance_exceptions_status_event_idx
    ON attendance_exceptions(status, event_id)`,
  `CREATE INDEX IF NOT EXISTS checklist_items_store_idx
    ON checklist_items(store_id)`,
  `CREATE INDEX IF NOT EXISTS incidents_store_status_idx
    ON incidents(store_id, status)`,
  `CREATE INDEX IF NOT EXISTS handovers_store_created_idx
    ON handovers(store_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS requests_store_employee_created_idx
    ON requests(store_id, employee_email, created_at)`,
  `CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
    ON notifications(recipient_email, created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS attendance_event_session_action_idx
    ON attendance_events(session_id, action)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS active_attendance_session_employee_idx
    ON attendance_sessions(employee_email) WHERE closed_at IS NULL`,
];

const requiredColumns: Record<string, Array<[string, string]>> = {
  stores: [
    ["attendance_enabled", "INTEGER NOT NULL DEFAULT 0"],
    ["updated_at", "TEXT"],
  ],
  employees: [
    ["store_id", `TEXT NOT NULL DEFAULT '${STORE_ID}'`],
    ["invited_by", "TEXT"],
    ["updated_at", "TEXT"],
  ],
  shifts: [
    ["timezone_snapshot", "TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh'"],
    ["is_shift_lead", "INTEGER NOT NULL DEFAULT 0"],
    ["created_at", "TEXT"],
  ],
  attendance_capture_sessions: [["nonce_hash", "TEXT"]],
  attendance_sessions: [["rule_version_id", "TEXT"]],
  attendance_events: [["photo_status", "TEXT NOT NULL DEFAULT 'unavailable'"]],
  attendance_photos: [["sha256", "TEXT"]],
  checklist_items: [["updated_at", "TEXT"]],
  incidents: [["updated_at", "TEXT"]],
  handovers: [["acknowledged_at", "TEXT"]],
};

export function getBindings() {
  const bindings = env as unknown as LoopiEnv;
  if (!bindings.DB) throw new Error("D1 binding DB is unavailable.");
  return { db: bindings.DB, evidence: bindings.EVIDENCE };
}

let databaseInitialization: Promise<D1Database> | null = null;

export function ensureDatabase() {
  databaseInitialization ??= initializeDatabase().catch((error) => {
    databaseInitialization = null;
    throw error;
  });
  return databaseInitialization;
}

async function initializeDatabase() {
  const { db } = getBindings();
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  await ensureRequiredColumns(db);

  const now = new Date().toISOString();
  await db.prepare(
    `INSERT OR IGNORE INTO stores
      (id, name, address, timezone, latitude, longitude, attendance_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).bind(
    STORE_ID,
    "LoopiCafe Nguyễn Trãi",
    "Nguyễn Trãi, Quận 5, TP. Hồ Chí Minh",
    "Asia/Ho_Chi_Minh",
    10.754128,
    106.66754,
    now,
    now,
  ).run();

  await db.prepare(
    `INSERT OR IGNORE INTO attendance_rules
      (id, store_id, version, early_checkin_minutes, late_minutes,
       early_departure_minutes, absence_minutes, missing_checkout_minutes,
       evidence_retention_days, active, created_by, created_at)
     VALUES ('rules-v1', ?, 1, 30, 10, 15, 60, 180, 90, 1, 'system', ?)`,
  ).bind(STORE_ID, now).run();

  await seedOperationalData(db, now);
  return db;
}

async function ensureRequiredColumns(db: D1Database) {
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    const existing = new Set(info.results.map((column) => column.name));
    for (const [name, definition] of columns) {
      if (!existing.has(name)) {
        await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();
      }
    }
  }
}

async function seedOperationalData(db: D1Database, now: string) {
  const checklist = [
    ["check-1", "Khởi động máy pha cà phê", "Gia Hân", 1, 1],
    ["check-2", "Kiểm tra tiền lẻ đầu ca", "Minh Khoa", 1, 1],
    ["check-3", "Kiểm tra sữa, hạt và đá", "Thảo Vy", 1, 0],
    ["check-4", "Vệ sinh quầy phục vụ", "Thảo Vy", 1, 0],
    ["check-5", "Mở ứng dụng giao hàng", "Minh Khoa", 0, 1],
    ["check-6", "Xác nhận quán sẵn sàng", "Gia Hân", 1, 0],
  ] as const;
  await db.batch(checklist.map(([id, label, assignee, required, completed]) =>
    db.prepare(
      `INSERT OR IGNORE INTO checklist_items
        (id, store_id, label, assignee, required, completed, completed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, STORE_ID, label, assignee, required, completed, completed ? now : null, now)));

  await db.prepare(
    `INSERT OR IGNORE INTO incidents
      (id, store_id, reporter_email, title, category, severity, status, created_at, updated_at)
     VALUES ('incident-seed-1', ?, 'demo@loopicafe.local',
       'Máy xay số 2 phát tiếng lạ', 'Thiết bị', 'high', 'open', ?, ?)`,
  ).bind(STORE_ID, now, now).run();
}
