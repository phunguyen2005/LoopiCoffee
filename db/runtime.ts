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
    geofence_radius_meters INTEGER NOT NULL DEFAULT 100,
    attendance_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL, auth_user_id TEXT, role TEXT NOT NULL, status TEXT NOT NULL,
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
  `CREATE TABLE IF NOT EXISTS payroll_periods (
    id TEXT PRIMARY KEY, store_id TEXT NOT NULL, period_start TEXT NOT NULL,
    period_end TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'reviewing',
    finalized_by TEXT, finalized_at TEXT, reopened_by TEXT, reopened_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(store_id, period_start, period_end)
  )`,
  `CREATE TABLE IF NOT EXISTS payroll_entries (
    id TEXT PRIMARY KEY, payroll_period_id TEXT NOT NULL, employee_email TEXT NOT NULL,
    approved_minutes INTEGER NOT NULL, overtime_minutes INTEGER NOT NULL DEFAULT 0,
    allowance_amount INTEGER NOT NULL DEFAULT 0, bonus_amount INTEGER NOT NULL DEFAULT 0,
    deduction_amount INTEGER NOT NULL DEFAULT 0, total_amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'payroll_finalized', locked_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, UNIQUE(payroll_period_id, employee_email)
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
  `CREATE UNIQUE INDEX IF NOT EXISTS payroll_periods_store_range_idx
    ON payroll_periods(store_id, period_start, period_end)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS payroll_entries_period_employee_idx
    ON payroll_entries(payroll_period_id, employee_email)`,
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
    ["geofence_radius_meters", "INTEGER NOT NULL DEFAULT 100"],
    ["attendance_enabled", "INTEGER NOT NULL DEFAULT 0"],
    ["updated_at", "TEXT"],
  ],
  employees: [
    ["store_id", `TEXT NOT NULL DEFAULT '${STORE_ID}'`],
    ["auth_user_id", "TEXT"],
    ["invited_by", "TEXT"],
    ["updated_at", "TEXT"],
    ["job_title", "TEXT DEFAULT 'Barista'"],
    ["phone", "TEXT"],
    ["start_date", "TEXT"],
    ["last_login_at", "TEXT"],
    ["participates_attendance", "INTEGER"],
    ["payroll_eligible", "INTEGER"],
    ["compensation_type", "TEXT"],
    ["hourly_rate", "INTEGER"],
    ["monthly_salary", "INTEGER"],
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

  await db.prepare(
    `UPDATE employees SET store_id = ? WHERE store_id != ?`,
  ).bind(STORE_ID, STORE_ID).run();

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
  // 1. Seed Accounts (1 Owner, 1 Manager, 3 Staffs + Local variants)
  const seedEmployees = [
    ["emp-owner", STORE_ID, "owner@loopicafe.com", "Nguyễn Minh Linh", "Chủ quán", "0908123456", "2025-01-01", "owner", "active", 0, 0, "none", 0],
    ["emp-owner-local", STORE_ID, "linh.nguyen@loopicafe.local", "Nguyễn Minh Linh", "Chủ quán", "0908123456", "2025-01-01", "owner", "active", 0, 0, "none", 0],
    ["emp-manager", STORE_ID, "manager@loopicafe.com", "Trần Văn Minh", "Quản lý cửa hàng", "0912345678", "2025-03-15", "manager", "active", 1, 1, "hourly", 35000],
    ["emp-staff-1", STORE_ID, "barista@loopicafe.com", "Lê Phước An", "Barista Trưởng", "0923456789", "2025-05-01", "employee", "active", 1, 1, "hourly", 28000],
    ["emp-staff-2", STORE_ID, "staff2@loopicafe.com", "Phạm Quốc Bảo", "Thu ngân", "0934567890", "2025-06-10", "employee", "active", 1, 1, "hourly", 23000],
    ["emp-staff-3", STORE_ID, "staff3@loopicafe.com", "Nguyễn Thảo Vy", "Barista", "0945678901", "2025-07-01", "employee", "active", 1, 1, "hourly", 25000],
  ] as const;

  for (const [id, storeId, email, name, jobTitle, phone, startDate, role, status, participatesAttendance, payrollEligible, compensationType, hourlyRate] of seedEmployees) {
    await db.prepare(
      `INSERT OR IGNORE INTO employees
        (id, store_id, email, display_name, job_title, phone, start_date, role, status,
         participates_attendance, payroll_eligible, compensation_type, hourly_rate, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, storeId, email, name, jobTitle, phone, startDate, role, status,
      participatesAttendance, payrollEligible, compensationType, hourlyRate, now, now,
    ).run();

    await db.prepare(
      `UPDATE employees SET job_title = ?, phone = ?, start_date = ?,
        participates_attendance = COALESCE(participates_attendance, ?),
        payroll_eligible = COALESCE(payroll_eligible, ?),
        compensation_type = COALESCE(compensation_type, ?),
        hourly_rate = COALESCE(hourly_rate, ?)
       WHERE lower(email) = lower(?)`
    ).bind(
      jobTitle, phone, startDate, participatesAttendance, payrollEligible,
      compensationType, hourlyRate, email,
    ).run();
  }

  // 2. Seed Relative Shifts & Attendance Sessions around TODAY (-7 days to +7 days)
  const todayObj = new Date();
  for (let offset = -7; offset <= 7; offset++) {
    const d = new Date(todayObj);
    d.setDate(d.getDate() + offset);
    const dateStr = d.toISOString().split("T")[0];
    const dayOfWeek = d.getDay(); // 0 = Sun

    const morningLead = dayOfWeek === 0 || dayOfWeek === 6 ? "barista@loopicafe.com" : "manager@loopicafe.com";
    const morningStaff = "staff2@loopicafe.com";
    const eveningLead = dayOfWeek === 0 || dayOfWeek === 6 ? "manager@loopicafe.com" : "barista@loopicafe.com";
    const eveningStaff = "staff3@loopicafe.com";

    const dailyShifts = [
      { email: morningLead, start: `${dateStr}T06:00:00.000Z`, end: `${dateStr}T14:00:00.000Z`, role: "Trưởng ca sáng", authorName: "Trần Văn Minh" },
      { email: morningStaff, start: `${dateStr}T06:00:00.000Z`, end: `${dateStr}T14:00:00.000Z`, role: "Thu ngân ca sáng", authorName: "Phạm Quốc Bảo" },
      { email: eveningLead, start: `${dateStr}T14:00:00.000Z`, end: `${dateStr}T22:00:00.000Z`, role: "Barista Trưởng ca tối", authorName: "Lê Phước An" },
      { email: eveningStaff, start: `${dateStr}T14:00:00.000Z`, end: `${dateStr}T22:00:00.000Z`, role: "Barista ca tối", authorName: "Nguyễn Thảo Vy" },
    ];

    if (offset % 3 === 0) {
      dailyShifts.push({
        email: "owner@loopicafe.com",
        start: `${dateStr}T08:00:00.000Z`,
        end: `${dateStr}T12:00:00.000Z`,
        role: "Quản trị cửa hàng",
        authorName: "Nguyễn Minh Linh",
      });
    }

    for (let i = 0; i < dailyShifts.length; i++) {
      const s = dailyShifts[i];
      const shiftId = `shift-rel-${dateStr}-${i}`;
      const sessionId = `session-rel-${dateStr}-${i}`;
      const checkinEventId = `event-in-rel-${dateStr}-${i}`;
      const checkoutEventId = `event-out-rel-${dateStr}-${i}`;
      const workedMins = s.email === "owner@loopicafe.com" ? 240 : 480;

      // Shifts
      await db.prepare(
        `INSERT OR IGNORE INTO shifts
          (id, store_id, employee_email, starts_at, ends_at, timezone_snapshot, role_label, is_shift_lead, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'Asia/Ho_Chi_Minh', ?, 0, 'published', ?)`
      ).bind(shiftId, STORE_ID, s.email, s.start, s.end, s.role, now).run();

      // Only mark completed for past days or earlier today
      if (offset <= 0) {
        await db.prepare(
          `INSERT OR IGNORE INTO attendance_sessions
            (id, employee_email, store_id, shift_id, rule_version_id, status, opened_at, closed_at, worked_minutes)
           VALUES (?, ?, ?, ?, 'rules-v1', 'completed', ?, ?, ?)`
        ).bind(sessionId, s.email, STORE_ID, shiftId, s.start, offset < 0 ? s.end : null, workedMins).run();

        await db.prepare(
          `INSERT OR IGNORE INTO attendance_events
            (id, session_id, employee_email, action, recorded_at, idempotency_key, verification_results, review_required, photo_status)
           VALUES (?, ?, ?, 'check_in', ?, ?, '["gps_verified", "photo_verified"]', 0, 'stored')`
        ).bind(checkinEventId, sessionId, s.email, s.start, `idem-in-rel-${dateStr}-${i}`).run();

        if (offset < 0) {
          await db.prepare(
            `INSERT OR IGNORE INTO attendance_events
              (id, session_id, employee_email, action, recorded_at, idempotency_key, verification_results, review_required, photo_status)
             VALUES (?, ?, ?, 'check_out', ?, ?, '["gps_verified", "photo_verified"]', 0, 'stored')`
          ).bind(checkoutEventId, sessionId, s.email, s.end, `idem-out-rel-${dateStr}-${i}`).run();
        }

        await db.prepare(
          `INSERT OR IGNORE INTO attendance_locations
            (event_id, latitude, longitude, accuracy_meters, server_received_at, distance_from_store_meters, expires_at)
           VALUES (?, 10.754128, 106.66754, 8.5, ?, 12.0, ?)`
        ).bind(checkinEventId, s.start, `${dateStr}T23:59:59Z`).run();
      }
    }

    if (offset <= 0) {
      const morningHandoverId = `handover-rel-${dateStr}-morning`;
      const eveningHandoverId = `handover-rel-${dateStr}-evening`;

      await db.prepare(
        `INSERT OR IGNORE INTO handovers
          (id, store_id, author_email, summary, manager_attention, acknowledged_at, created_at)
         VALUES (?, ?, 'staff2@loopicafe.com', ?, 0, ?, ?)`
      ).bind(
        morningHandoverId,
        STORE_ID,
        `Bàn giao ca sáng (${dateStr}):\n- Két tiền đầu ca: 2.000.000đ. Doanh thu tiền mặt ca sáng: 2.850.000đ.\n- Máy pha La Marzocco hoạt động tốt, áp suất hơi ổn định 1.2 bar.\n- Đã sơ chế 5kg hạt Robusta Bảo Lộc & 3L sữa hạt Macca.`,
        `${dateStr}T14:15:00.000Z`,
        `${dateStr}T14:05:00.000Z`
      ).run();

      await db.prepare(
        `INSERT OR IGNORE INTO handovers
          (id, store_id, author_email, summary, manager_attention, acknowledged_at, created_at)
         VALUES (?, ?, 'barista@loopicafe.com', ?, 0, ?, ?)`
      ).bind(
        eveningHandoverId,
        STORE_ID,
        `Bàn giao ca tối (${dateStr}):\n- Kết ca tối: 4.420.000đ tiền mặt. Đã niêm phong túi két nộp quản lý.\n- Đã vệ sinh sạch sẽ 2 máy xay Fiorenzato, sục vòi bọt sữa bằng nước nóng.\n- Ghi chú: Cần chêm thêm 2 bịch sữa tươi tiệt trùng vào tủ mát cho ca sáng mai.`,
        `${dateStr}T22:15:00.000Z`,
        `${dateStr}T22:05:00.000Z`
      ).run();
    }
  }

  // 3. Seed Realistic Checklist Items & Cleanup Corrupted Legacy Entries
  await db.prepare(
    `DELETE FROM checklist_items WHERE label LIKE '%<%' OR label LIKE '%?%' OR label LIKE '%thi%u%'`
  ).run();

  const checklist = [
    ["check-1", "Khởi động máy pha cà phê La Marzocco 2 họng & xả vòi hơi", "Lê Phước An", 1, 1],
    ["check-2", "Kiểm tra và đếm tiền lẻ két thu ngân (2.000.000đ chuẩn)", "Phạm Quốc Bảo", 1, 1],
    ["check-3", "Kiểm tra tồn kho sữa tươi Barista Milk, hạt Cầu Đất & đá vảy", "Nguyễn Thảo Vy", 1, 1],
    ["check-4", "Tiệt trùng quầy bar, vệ sinh khay bánh ngọt & dàn ly thủy tinh", "Nguyễn Thảo Vy", 1, 1],
    ["check-5", "Bật ứng dụng nhận đơn giao hàng (GrabFood, ShopeeFood)", "Phạm Quốc Bảo", 0, 1],
    ["check-6", "Kiểm tra nhiệt độ tủ mát bảo quản & lau phễu máy xay", "Lê Phước An", 1, 1],
    ["check-7", "Bổ sung khăn giấy rút quầy order, ống hút & ly nhựa ca làm", "Phạm Quốc Bảo", 0, 0],
    ["check-8", "Niêm phong két tiền ca & in báo cáo chốt doanh thu", "Phạm Quốc Bảo", 1, 0],
  ] as const;

  await db.batch(checklist.map(([id, label, assignee, required, completed]) =>
    db.prepare(
      `INSERT OR REPLACE INTO checklist_items
        (id, store_id, label, assignee, required, completed, completed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, STORE_ID, label, assignee, required, completed, completed ? now : null, now)));

  // 4. Seed Realistic Coffee Shop Incidents
  const seedIncidents = [
    ["inc-1", STORE_ID, "barista@loopicafe.com", "Máy xay cà phê Fiorenzato số 2 bị kẹt đĩa xay", "Thiết bị", "high", "resolved", "2026-07-28T08:30:00Z", "2026-07-28T11:00:00Z"],
    ["inc-2", STORE_ID, "staff2@loopicafe.com", "Sắp hết ly nhựa 700ml trà trái cây ca tối", "Thiếu bao bì", "medium", "resolved", "2026-07-29T15:20:00Z", "2026-07-29T17:00:00Z"],
    ["inc-3", STORE_ID, "staff3@loopicafe.com", "Tủ mát bảo quản sữa có dấu hiệu đọng nước chân tủ", "Thiết bị", "medium", "acknowledged", "2026-07-30T09:45:00Z", "2026-07-30T10:15:00Z"],
    ["inc-4", STORE_ID, "manager@loopicafe.com", "Hết syrup Đào dầm & mứt dâu tằm Boduo", "Thiếu nguyên liệu", "high", "resolved", "2026-07-30T14:10:00Z", "2026-07-30T16:30:00Z"],
    ["inc-5", STORE_ID, "staff2@loopicafe.com", "Máy POS quầy thu ngân hết giấy in hóa đơn K80", "Thiết bị", "low", "closed", "2026-07-31T18:00:00Z", "2026-07-31T18:25:00Z"],
  ] as const;

  for (const [id, storeId, reporter, title, cat, sev, status, created, updated] of seedIncidents) {
    await db.prepare(
      `INSERT OR IGNORE INTO incidents
        (id, store_id, reporter_email, title, category, severity, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, storeId, reporter, title, cat, sev, status, created, updated).run();
  }

  // 5. Seed Staff Requests
  const seedRequests = [
    ["req-1", STORE_ID, "barista@loopicafe.com", "leave", "Xin nghỉ phép cá nhân ngày 05/08", "Cần giải quyết công việc gia đình ở quê.", "approved", "manager@loopicafe.com", "2026-07-29T14:00:00Z", "2026-07-29T09:00:00Z"],
    ["req-2", STORE_ID, "staff2@loopicafe.com", "swap", "Đổi ca sáng ngày mai sang ca tối", "Đổi ca với Nguyễn Thảo Vy do bận lịch thi cuối kỳ trường đại học.", "approved", "manager@loopicafe.com", "2026-07-30T16:30:00Z", "2026-07-30T10:15:00Z"],
    ["req-3", STORE_ID, "staff3@loopicafe.com", "correction", "Sửa giờ checkout ngày 28/07", "Quên bấm checkout trên điện thoại do hỗ trợ dọn dẹp kho hạt.", "approved", "manager@loopicafe.com", "2026-07-29T08:00:00Z", "2026-07-28T22:30:00Z"],
  ] as const;

  for (const [id, storeId, employee, type, title, reason, status, reviewer, reviewed, created] of seedRequests) {
    await db.prepare(
      `INSERT OR IGNORE INTO requests
        (id, store_id, employee_email, type, title, reason, status, reviewer_email, reviewed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, storeId, employee, type, title, reason, status, reviewer, reviewed, created).run();
  }

  // 6. Seed Notifications
  const seedNotifications = [
    ["notif-1", "manager@loopicafe.com", "request.created", "Yêu cầu xin nghỉ mới từ Lê Phước An", "/app/requests", "2026-07-29T09:00:00Z", "2026-07-29T09:05:00Z"],
    ["notif-2", "owner@loopicafe.com", "incident.created", "Cảnh báo: Máy xay cà phê số 2 bị kẹt đĩa xay", "/app/issues", "2026-07-28T08:30:00Z", "2026-07-28T08:35:00Z"],
    ["notif-3", "barista@loopicafe.com", "request.approved", "Yêu cầu xin nghỉ phép đã được duyệt", "/app/requests", "2026-07-29T14:00:00Z", "2026-07-29T14:02:00Z"],
    ["notif-4", "staff2@loopicafe.com", "schedule.published", "Lịch làm việc tuần mới đã xuất bản", "/app/schedule", "2026-07-27T08:00:00Z", "2026-07-27T08:10:00Z"],
  ] as const;

  for (const [id, recipient, type, title, href, created, read] of seedNotifications) {
    await db.prepare(
      `INSERT OR IGNORE INTO notifications
        (id, recipient_email, type, title, entity_href, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, recipient, type, title, href, read, created).run();
  }

  // 7. Seed Audit Events
  await db.prepare(
    `INSERT OR IGNORE INTO audit_events
      (id, actor_email, entity_type, entity_id, action, metadata, created_at)
     VALUES ('audit-seed-1', 'owner@loopicafe.com', 'store', 'store-loopi-nguyen-trai', 'store.initialized', '{"mode":"full_operational_seed"}', ?)`
  ).bind(now).run();
}
