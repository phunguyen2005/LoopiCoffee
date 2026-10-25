import { getBindings, STORE_ID } from "./runtime";
import { defaultPermissionsForRole } from "../modules/people/domain/permissions";

// Explicit demo-data operation. Apply migrations before calling this function.
export async function seedDemoDatabase() {
  const { db } = getBindings();

  const now = new Date().toISOString();
  await db.prepare(
    `INSERT OR IGNORE INTO stores
      (id, name, address, timezone, latitude, longitude, attendance_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).bind(
    STORE_ID,
    "LoopyCafe Nguyễn Trãi",
    "Nguyễn Trãi, Quận 5, TP. Hồ Chí Minh",
    "Asia/Ho_Chi_Minh",
    10.754128,
    106.66754,
    now,
    now,
  ).run();

  await db.prepare(
    `UPDATE stores SET name = ?, address = ?, updated_at = ?
     WHERE id = ? AND (name LIKE '%?%' OR name LIKE '%Ã%' OR address LIKE '%?%' OR address LIKE '%Ã%')`,
  ).bind(
    "LoopyCafe Nguyễn Trãi",
    "Nguyễn Trãi, Quận 5, TP. Hồ Chí Minh",
    now,
    STORE_ID,
  ).run();

  await db.prepare(
    `INSERT OR IGNORE INTO attendance_rules
      (id, store_id, version, early_checkin_minutes, late_minutes,
       early_departure_minutes, absence_minutes, missing_checkout_minutes,
       evidence_retention_days, active, created_by, created_at)
     VALUES ('rules-v1', ?, 1, 15, 5, 5, 60, 240, 90, 1, 'system', ?)`,
  ).bind(STORE_ID, now).run();

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO role_permission_sets (store_id, role, revision, updated_by, updated_at) VALUES (?, 'manager', 0, 'demo-seed', ?)").bind(STORE_ID, now),
    db.prepare("INSERT OR IGNORE INTO role_permission_sets (store_id, role, revision, updated_by, updated_at) VALUES (?, 'team_lead', 0, 'demo-seed', ?)").bind(STORE_ID, now),
  ]);
  for (const role of ["manager", "team_lead"] as const) {
    for (const permission of defaultPermissionsForRole(role)) {
      await db.prepare(
        "INSERT OR IGNORE INTO role_permissions (store_id, role, permission_key, created_at) VALUES (?, ?, ?, ?)",
      ).bind(STORE_ID, role, permission, now).run();
    }
  }



  await seedOperationalData(db, now);
  return db;
}

async function seedOperationalData(db: D1Database, now: string) {
  // 1. Seed Accounts (1 Owner, 1 Manager, 3 Staffs + Local variants)
  const seedEmployees = [
    ["emp-system-admin", STORE_ID, "admin@loopicafe.com", "Quản trị LoopyCafe", "Quản trị hệ thống", "", "2026-10-14", "system_admin", "active", 0, 0, "none", 0],
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
      `UPDATE employees SET display_name = ?, job_title = ?, phone = ?, start_date = ?,
        participates_attendance = COALESCE(participates_attendance, ?),
        payroll_eligible = COALESCE(payroll_eligible, ?),
        compensation_type = COALESCE(compensation_type, ?),
        hourly_rate = COALESCE(hourly_rate, ?)
       WHERE lower(email) = lower(?)`
    ).bind(
      name, jobTitle, phone, startDate, participatesAttendance, payrollEligible,
      compensationType, hourlyRate, email,
    ).run();
  }

  // 2. Rebuild the clearly identified demo attendance window. Keeping these
  // synthetic rows bounded prevents every app start from inflating monthly hours.
  await db.batch([
    db.prepare("DELETE FROM attendance_locations WHERE event_id LIKE 'event-%-rel-%' OR event_id LIKE 'event-%-20%'"),
    db.prepare("DELETE FROM attendance_exceptions WHERE event_id LIKE 'event-%-rel-%' OR event_id LIKE 'event-%-20%'"),
    db.prepare("DELETE FROM attendance_events WHERE id LIKE 'event-%-rel-%' OR id LIKE 'event-%-20%'"),
    db.prepare("DELETE FROM attendance_sessions WHERE id LIKE 'session-rel-%' OR id LIKE 'session-20%'"),
    db.prepare("DELETE FROM shifts WHERE id LIKE 'shift-rel-%' OR id LIKE 'shift-20%'"),
  ]);

  // Seed a rotating two-person roster for the recent month, not four cloned
  // eight-hour sessions every day. This keeps demo payroll totals realistic.
  const todayObj = new Date();
  for (let offset = -31; offset <= 7; offset++) {
    const d = new Date(todayObj);
    d.setDate(d.getDate() + offset);
    const dateStr = d.toISOString().split("T")[0];
    const rotation = Math.abs(Math.floor(d.getTime() / 86_400_000)) % 4;
    const roster = [
      ["manager@loopicafe.com", "staff3@loopicafe.com"],
      ["staff2@loopicafe.com", "barista@loopicafe.com"],
      ["manager@loopicafe.com", "barista@loopicafe.com"],
      ["staff2@loopicafe.com", "staff3@loopicafe.com"],
    ] as const;
    const [morningEmployee, eveningEmployee] = roster[rotation];

    const dailyShifts = [
      { email: morningEmployee, start: `${dateStr}T06:00:00.000Z`, end: `${dateStr}T14:00:00.000Z`, role: "Ca sáng", authorName: "Trần Văn Minh" },
      { email: eveningEmployee, start: `${dateStr}T14:00:00.000Z`, end: `${dateStr}T22:00:00.000Z`, role: "Ca tối", authorName: "Lê Phước An" },
    ];

    for (let i = 0; i < dailyShifts.length; i++) {
      const s = dailyShifts[i];
      const shiftId = `shift-rel-${dateStr}-${i}`;
      const sessionId = `session-rel-${dateStr}-${i}`;
      const checkinEventId = `event-in-rel-${dateStr}-${i}`;
      const checkoutEventId = `event-out-rel-${dateStr}-${i}`;
      const workedMins = 480;

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
           VALUES (?, ?, ?, ?, 'rules-v1', ?, ?, ?, ?)`
        ).bind(
          sessionId,
          s.email,
          STORE_ID,
          shiftId,
          offset < 0 ? "completed" : "open",
          s.start,
          offset < 0 ? s.end : null,
          offset < 0 ? workedMins : null,
        ).run();

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

  // 8. Seed La Boong Menu, Options, Settings and Sample Orders
  await seedMenuAndOrderingData(db, now);
}

async function seedMenuAndOrderingData(db: D1Database, now: string) {
  // Store ordering settings
  await db.prepare(
    `INSERT OR IGNORE INTO store_ordering_settings
      (id, store_id, is_ordering_open, announcement, opening_hours_notice, updated_at)
     VALUES (?, ?, 1, ?, '08:00 - 22:30', ?)`
  ).bind(
    `settings-${STORE_ID}`,
    STORE_ID,
    "Chào mừng bạn đến với La Boong - Trà Ô Long Làng La Boong! Thưởng thức dòng Săn Mây bồng bềnh đặc sắc.",
    now,
  ).run();

  // Categories
  const categories = [
    { id: "cat-tra-sua", name: "Trà sữa", englishName: "Oolong Milk Tea", sortOrder: 1 },
    { id: "cat-san-may", name: "Săn mây", englishName: "Chasing Cloud", sortOrder: 2 },
    { id: "cat-o-long-hoa-qua", name: "Ô long vị hoa quả", englishName: "Fruit Oolong Tea", sortOrder: 3 },
    { id: "cat-ca-phe", name: "Cà phê", englishName: "Coffee", sortOrder: 4 },
    { id: "cat-non-caffeine", name: "Non-caffeine", englishName: "Non-caffeine", sortOrder: 5 },
    { id: "cat-topping", name: "Topping", englishName: "Topping", sortOrder: 6 },
  ];

  for (const cat of categories) {
    await db.prepare(
      `INSERT OR IGNORE INTO menu_categories
        (id, store_id, name, english_name, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(cat.id, STORE_ID, cat.name, cat.englishName, cat.sortOrder, now, now).run();
  }

  // Menu Options (Sizes, Sugar, Ice, Toppings)
  const options = [
    // Sizes
    { id: "opt-size-m", groupType: "size", name: "Size M (Tiêu chuẩn)", price: 0, isDefault: 1, sort: 1 },
    { id: "opt-size-l", groupType: "size", name: "Size L (Lớn +500ml)", price: 6000, isDefault: 0, sort: 2 },
    // Sugar levels
    { id: "opt-sugar-100", groupType: "sugar", name: "100% đường (Chuẩn vị La Boong)", price: 0, isDefault: 1, sort: 1 },
    { id: "opt-sugar-70", groupType: "sugar", name: "70% đường (Ngọt dịu)", price: 0, isDefault: 0, sort: 2 },
    { id: "opt-sugar-50", groupType: "sugar", name: "50% đường (Ít ngọt)", price: 0, isDefault: 0, sort: 3 },
    { id: "opt-sugar-0", groupType: "sugar", name: "0% đường (Không đường)", price: 0, isDefault: 0, sort: 4 },
    // Ice levels
    { id: "opt-ice-100", groupType: "ice", name: "100% đá (Chuẩn mát)", price: 0, isDefault: 1, sort: 1 },
    { id: "opt-ice-70", groupType: "ice", name: "70% đá", price: 0, isDefault: 0, sort: 2 },
    { id: "opt-ice-50", groupType: "ice", name: "50% đá (Ít đá)", price: 0, isDefault: 0, sort: 3 },
    { id: "opt-ice-0", groupType: "ice", name: "Không đá", price: 0, isDefault: 0, sort: 4 },
    // Toppings
    { id: "opt-top-tranchau-olong", groupType: "topping", name: "Trân Châu Ô Long", price: 10000, isDefault: 0, sort: 1 },
    { id: "opt-top-tranchau-nhai", groupType: "topping", name: "Trân Châu Ô Long Nhài Thủ Công", price: 10000, isDefault: 0, sort: 2 },
    { id: "opt-top-tranchau-trang", groupType: "topping", name: "Trân Châu Trắng Giòn", price: 10000, isDefault: 0, sort: 3 },
    { id: "opt-top-phomai-bong", groupType: "topping", name: "Phô Mai Bồng Bềnh", price: 12000, isDefault: 0, sort: 4 },
    { id: "opt-top-mochi-matcha", groupType: "topping", name: "Mochi Matcha", price: 10000, isDefault: 0, sort: 5 },
    { id: "opt-top-gao-dao-hong", groupType: "topping", name: "Gạo Đào Hồng", price: 10000, isDefault: 0, sort: 6 },
    { id: "opt-top-ngoc-trai", groupType: "topping", name: "Ngọc Trai Hồng", price: 12000, isDefault: 0, sort: 7 },
    { id: "opt-top-kem-trung", groupType: "topping", name: "Kem Trứng / Kem Mây", price: 12000, isDefault: 0, sort: 8 },
  ];

  for (const opt of options) {
    await db.prepare(
      `INSERT OR IGNORE INTO menu_options
        (id, store_id, group_type, name, price_modifier, is_default, is_available, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).bind(opt.id, STORE_ID, opt.groupType, opt.name, opt.price, opt.isDefault, opt.sort, now, now).run();
  }

  // Menu items according to official La Boong menu
  const items = [
    // TRÀ SỮA | OOLONG MILK TEA
    { id: "item-ts-01", cat: "cat-tra-sua", name: "Ô Long Sữa", en: "Oolong Milk Tea", desc: "Trà ô long thượng hạng kết hợp sữa tươi thanh béo, thơm nhẹ vị hoa cỏ tự nhiên.", price: 29000, badge: null, img: "/laboong/drinks/olong-sua.jpg", sort: 1 },
    { id: "item-ts-02", cat: "cat-tra-sua", name: "Ô Long Nhài Sữa", en: "Jasmine Oolong Milk Tea", desc: "Hương hoa nhài ban mai thơm ngát quyện cùng cốt trà ô long ủ lạnh và sữa béo ngậy.", price: 35000, badge: "best_seller", img: "/laboong/drinks/olong-nhai-sua.jpg", sort: 2 },
    { id: "item-ts-03", cat: "cat-tra-sua", name: "Gạo Khói", en: "Roasted Rice Milk Tea", desc: "Vị gạo rang thơm lừng quyện cùng lớp trà sữa đậm đà đặc sắc độc quyền La Boong.", price: 35000, badge: "best_seller", img: "/laboong/drinks/gao-khoi.jpg", sort: 3 },
    { id: "item-ts-04", cat: "cat-tra-sua", name: "Ô Long Sữa Hoa Dành Dành", en: "Gardenia Oolong Milk Tea", desc: "Hương thơm hoa dành dành thanh khiết kết hợp vị sữa ngọt dịu tinh tế.", price: 35000, badge: "new", img: "/laboong/drinks/olong-danh-danh.jpg", sort: 4 },
    { id: "item-ts-05", cat: "cat-tra-sua", name: "Ô Long Hoa Sen", en: "Lotus Oolong Milk Tea", desc: "Hương sen thanh tao, ngọt dịu tinh tế từ hạt và hoa sen chọn lọc vùng cao nguyên.", price: 35000, badge: null, img: "/laboong/drinks/olong-hoa-sen.jpg", sort: 5 },
    { id: "item-ts-06", cat: "cat-tra-sua", name: "Ô Long Sữa Quế Hoa", en: "Osmanthus Oolong Milk Tea", desc: "Rắc cánh hoa mộc quế vàng óng thơm ngát, hậu vị trà ngọt bùi sâu lắng.", price: 35000, badge: null, img: "/laboong/drinks/olong-que-hoa.jpg", sort: 6 },
    { id: "item-ts-07", cat: "cat-tra-sua", name: "Ô Long Nướng", en: "Roasted Oolong Milk Tea", desc: "Lá trà ô long sao nướng lửa than đượm nồng ấm, thơm mùi đường nâu tự nhiên.", price: 35000, badge: "best_seller", img: "/laboong/drinks/olong-nuong.jpg", sort: 7 },
    { id: "item-ts-08", cat: "cat-tra-sua", name: "Ô Long Sữa Dừa", en: "Coconut Oolong Milk Tea", desc: "Cốt nước cốt dừa tươi thơm béo hài hoà tuyệt đối với cốt trà đậm vị.", price: 35000, badge: null, img: "/laboong/drinks/olong-sua-dua.jpg", sort: 8 },
    { id: "item-ts-09", cat: "cat-tra-sua", name: "Ô Long Nếp", en: "Pandan Oolong Milk Tea", desc: "Hương lá dứa nếp thơm lừng đồng nội, thanh tao và tròn vị.", price: 35000, badge: null, img: "/laboong/drinks/olong-nep.jpg", sort: 9 },
    { id: "item-ts-10", cat: "cat-tra-sua", name: "Ô Long Matcha", en: "Matcha Oolong Milk Tea", desc: "Bột matcha Nhật Bản nguyên bản kết hợp trà sữa ô long sánh mượt.", price: 35000, badge: null, img: "/laboong/drinks/olong-matcha.jpg", sort: 10 },
    { id: "item-ts-11", cat: "cat-tra-sua", name: "Ô Long Gạo Đào Hồng", en: "Oolong Milk Tea with Peach Rice", desc: "Thạch gạo đào hồng dẻo giòn quyện trà sữa ô long thanh dịu.", price: 35000, badge: "new", img: "/laboong/drinks/olong-gao-dao-hong.jpg", sort: 11 },

    // SĂN MÂY | CHASING CLOUD
    { id: "item-sm-01", cat: "cat-san-may", name: "Sữa Dừa Tuyết Mây", en: "Coconut Oolong with Cloudy Cream", desc: "Sữa dừa béo thanh phủ lớp kem tuyết mây bồng bềnh mềm mại như mây sớm.", price: 42000, badge: "best_seller", img: "/laboong/drinks/sua-dua-tuyet-may.jpg", sort: 1 },
    { id: "item-sm-02", cat: "cat-san-may", name: "Matcha Săn Mây", en: "Matcha Oolong with Cloud Cream", desc: "Matcha Nhật Bản cao cấp phân tầng xanh ngọc bích cùng lớp kem mây tuyết bông xốp.", price: 42000, badge: "best_seller", img: "/laboong/drinks/matcha-san-may.jpg", sort: 2 },
    { id: "item-sm-03", cat: "cat-san-may", name: "Nếp Tuyết Mây", en: "Pandan Oolong with Cloud Cream", desc: "Hương nếp thơm dẻo cùng cốt trà thanh khiết và lớp kem mây béo ngậy ngọt nhẹ.", price: 42000, badge: null, img: "/laboong/drinks/nep-tuyet-may.jpg", sort: 3 },
    { id: "item-sm-04", cat: "cat-san-may", name: "Bồng Bềnh", en: "Oolong Milk Tea with Egg Cream", desc: "Trà sữa ô long phủ lớp kem phô mai trứng bồng bềnh nướng nhẹ mặt vàng ruộm.", price: 39000, badge: "best_seller", img: "/laboong/drinks/bong-benh.jpg", sort: 4 },
    { id: "item-sm-05", cat: "cat-san-may", name: "Nhài Bồng Bềnh", en: "Jasmine Oolong with Egg Cream", desc: "Hương trà nhài thanh khiết cân bằng hoàn hảo với lớp kem trứng sánh mịn.", price: 42000, badge: null, img: "/laboong/drinks/nhai-bong-benh.jpg", sort: 5 },
    { id: "item-sm-06", cat: "cat-san-may", name: "Hoa Sen Bồng Bềnh", en: "Lotus Oolong with Egg Cream", desc: "Trà hoa sen thanh tao kết hợp kem trứng bồng bềnh béo mịn khó quên.", price: 40000, badge: null, img: "/laboong/drinks/hoa-sen-bong-benh.jpg", sort: 6 },
    { id: "item-sm-07", cat: "cat-san-may", name: "Gạo Khói Bồng Bềnh", en: "Roasted Oolong with Egg Cream", desc: "Vị gạo khói đặc trưng phủ kem trứng vàng ươm, đậm vị và thơm lừng ngào ngạt.", price: 42000, badge: "best_seller", img: "/laboong/drinks/gao-khoi-bong-benh.jpg", sort: 7 },
    { id: "item-sm-08", cat: "cat-san-may", name: "Gạo Khói Mochi Matcha", en: "Roasted Milk Tea with Mochi Matcha", desc: "Trà gạo khói độc quyền kèm viên mochi matcha dẻo quánh nhai cực cuốn.", price: 39000, badge: "new", img: "/laboong/drinks/gao-khoi-mochi-matcha.jpg", sort: 8 },

    // Ô LONG VỊ HOA QUẢ | FRUIT OOLONG TEA
    { id: "item-hq-01", cat: "cat-o-long-hoa-qua", name: "Ô Long / Nhài / Dành Dành Nguyên Vị", en: "Original Oolong / Jasmine / Gardenia Tea", desc: "Trà ủ lạnh mộc mạc nguyên bản, lưu giữ trọn vẹn hương thơm hoa cỏ tinh khôi.", price: 20000, badge: null, img: "/laboong/drinks/olong-nguyen-vi.jpg", sort: 1 },
    { id: "item-hq-02", cat: "cat-o-long-hoa-qua", name: "Dành Dành Thanh Mai", en: "Yamberry Oolong Tea", desc: "Quả thanh mai đỏ mọng chua thanh mát lạnh hoà cùng nền trà hoa dành dành thơm ngát.", price: 35000, badge: "best_seller", img: "/laboong/drinks/danh-danh-thanh-mai.jpg", sort: 2 },
    { id: "item-hq-03", cat: "cat-o-long-hoa-qua", name: "Ô Long Mơ Xanh", en: "Green Apricot Oolong Tea", desc: "Mơ má đào ngâm thủ công chua thanh dịu nhẹ, giải nhiệt tức thì trong ngày oi ả.", price: 35000, badge: null, img: "/laboong/drinks/olong-mo-xanh.jpg", sort: 3 },
    { id: "item-hq-04", cat: "cat-o-long-hoa-qua", name: "Ô Long Dành Dành Chanh Hoa", en: "Gardenia Lemon Oolong Tea", desc: "Chanh vàng mọng nước kết hợp hoa dành dành tươi mát sảng khoái.", price: 29000, badge: null, img: "/laboong/drinks/olong-danh-danh-chanh-hoa.jpg", sort: 4 },
    { id: "item-hq-05", cat: "cat-o-long-hoa-qua", name: "Ô Long Chanh Quế Hoa", en: "Osmanthus Lemon Oolong Tea", desc: "Cánh hoa quế thơm dịu cùng nước cốt chanh tươi chua thanh cân bằng.", price: 35000, badge: null, img: "/laboong/drinks/olong-chanh-que-hoa.jpg", sort: 5 },
    { id: "item-hq-06", cat: "cat-o-long-hoa-qua", name: "Hoa Hồng Đông Phương", en: "Oriental Rose Oolong Tea", desc: "Chiết xuất cánh hoa hồng Damask thơm dịu quý phái, thanh tao và dưỡng nhan.", price: 35000, badge: null, img: "/laboong/drinks/hoa-hong-dong-phuong.jpg", sort: 6 },
    { id: "item-hq-07", cat: "cat-o-long-hoa-qua", name: "Mộc Sương", en: "Morning Dew Fruit Tea", desc: "Thức trà thơm mát dịu nhẹ như hạt sương sớm đọng trên lá trà vùng cao.", price: 35000, badge: null, img: "/laboong/drinks/moc-suong.jpg", sort: 7 },
    { id: "item-hq-08", cat: "cat-o-long-hoa-qua", name: "Ô Long Bưởi Chanh Vàng", en: "Grapefruit Lemon Oolong Tea", desc: "Tép bưởi hồng tươi mọng nước kết hợp chanh vàng Mỹ cắt lát ngập tràn vitamin C.", price: 35000, badge: "best_seller", img: "/laboong/drinks/olong-buoi-chanh-vang.jpg", sort: 8 },
    { id: "item-hq-09", cat: "cat-o-long-hoa-qua", name: "Boong Đỏ", en: "Pomegranate Oolong Tea", desc: "Thức uống signature màu đỏ ruby từ lựu tươi, dâu rừng và trà ô long làng La Boong.", price: 35000, badge: "best_seller", img: "/laboong/drinks/boong-do.jpg", sort: 9 },

    // CÀ PHÊ | COFFEE
    { id: "item-cp-01", cat: "cat-ca-phe", name: "Cà Phê Đen", en: "Black Coffee", desc: "Robusta nguyên chất rang mộc, đậm đà đắng thanh và hậu vị ngọt sâu.", price: 25000, badge: null, img: "/laboong/drinks/ca-phe-den.jpg", sort: 1 },
    { id: "item-cp-02", cat: "cat-ca-phe", name: "Cà Phê Sữa", en: "Coffee with Condensed Milk", desc: "Cà phê phin truyền thống phối trộn sữa đặc ngọt béo thơm lừng quen thuộc.", price: 25000, badge: null, img: "/laboong/drinks/ca-phe-sua.jpg", sort: 2 },
    { id: "item-cp-03", cat: "cat-ca-phe", name: "Bạc Xỉu", en: "White Coffee", desc: "Sữa thơm béo ngậy điểm xuyết cà phê phin đậm hương nồng nàn.", price: 25000, badge: null, img: "/laboong/drinks/bac-xiu.jpg", sort: 3 },
    { id: "item-cp-04", cat: "cat-ca-phe", name: "Cà Phê Muối", en: "Salt Coffee", desc: "Cốt cà phê đen đậm đặc phủ lớp kem muối mặn mà béo ngậy trứ danh xứ Huế.", price: 35000, badge: "best_seller", img: "/laboong/drinks/ca-phe-muoi.jpg", sort: 4 },

    // NON-CAFFEINE
    { id: "item-nc-01", cat: "cat-non-caffeine", name: "Sữa Vải Gạo Đào Hồng", en: "Lychee Milk with Pink Peach Rice", desc: "Sữa tươi vị vải ngọt thơm dịu dàng kết hợp hạt gạo đào hồng dẻo giòn, không caffeine.", price: 42000, badge: "best_seller", img: "/laboong/drinks/sua-vai-gao-dao-hong.jpg", sort: 1 },
    { id: "item-nc-02", cat: "cat-non-caffeine", name: "Sữa Dừa Nướng Phô Mai Bồng Bềnh", en: "Caramel Coconut Milk with Cheese Tofu", desc: "Sữa dừa nướng thơm ngậy phủ lớp phô mai bồng bềnh dẻo mịn tan ngay trong miệng.", price: 38000, badge: null, img: "/laboong/drinks/sua-dua-nuong-phomai.jpg", sort: 2 },
    { id: "item-nc-03", cat: "cat-non-caffeine", name: "Sữa Dừa Matcha Phô Mai Bồng Bềnh", en: "Matcha Coconut Milk with Cheese Tofu", desc: "Sốt matcha Nhật Bản phủ trên sữa dừa nướng và phô mai bồng bềnh tuyệt mỹ.", price: 38000, badge: null, img: "/laboong/drinks/sua-dua-matcha-phomai.jpg", sort: 3 },
    { id: "item-nc-04", cat: "cat-non-caffeine", name: "Sữa Chua Nếp", en: "Pandan Yogurt", desc: "Sữa chua lên men mát lạnh kết hợp nếp cẩm dẻo thơm hạt mềm bổ dưỡng.", price: 35000, badge: null, img: "/laboong/drinks/sua-chua-nep.jpg", sort: 4 },
    { id: "item-nc-05", cat: "cat-non-caffeine", name: "Sữa Chua Mochi Matcha", en: "Mochi Matcha Yogurt", desc: "Sữa chua nhà làm sánh đặc kèm những viên mochi matcha dẻo dai bùi béo thơm ngát.", price: 35000, badge: null, img: "/laboong/drinks/sua-chua-mochi-matcha.jpg", sort: 5 },

    // TOPPING
    { id: "item-tp-01", cat: "cat-topping", name: "Trân Châu Ô Long (Phần rời)", en: "Oolong Tapioca Pearl (Cup)", desc: "Trân châu dẻo thơm đậm vị trà ô long làng La Boong nấu mới trong ngày.", price: 10000, badge: null, img: "/laboong/drinks/topping-tranchau.jpg", sort: 1 },
    { id: "item-tp-02", cat: "cat-topping", name: "Phô Mai Bồng Bềnh (Cup riêng)", en: "Cheese Foam (Cup)", desc: "Cúp kem phô mai mặn béo ngậy sánh mịn đặc quyền La Boong.", price: 12000, badge: "best_seller", img: "/laboong/drinks/topping-phomai.jpg", sort: 2 },
  ];

  for (const item of items) {
    await db.prepare(
      `INSERT OR IGNORE INTO menu_items
        (id, store_id, category_id, name, english_name, description, base_price, image_url, badge, is_available, allows_size, allows_sugar, allows_ice, allows_toppings, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1, 1, ?, ?, ?)`
    ).bind(
      item.id,
      STORE_ID,
      item.cat,
      item.name,
      item.en,
      item.desc,
      item.price,
      item.img,
      item.badge,
      item.sort,
      now,
      now,
    ).run();
  }

  // Seed Initial Sample Orders for live testing
  const sampleOrders = [
    {
      id: "order-demo-01",
      code: "LB-83921",
      customerName: "Nguyễn Thu Hà",
      phone: "0909123456",
      note: "Giao trước 11h giúp mình nhé, cho thêm ống hút to!",
      total: 89000,
      itemCount: 2,
      status: "pending",
      created: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      items: [
        {
          name: "Matcha Săn Mây",
          price: 42000,
          quantity: 1,
          size: "Size L (+500ml)",
          sugar: "70% đường (Ngọt dịu)",
          ice: "70% đá",
          toppings: JSON.stringify([{ name: "Phô Mai Bồng Bềnh", price: 12000 }]),
          subtotal: 60000,
        },
        {
          name: "Ô Long Sữa",
          price: 29000,
          quantity: 1,
          size: "Size M (Tiêu chuẩn)",
          sugar: "100% đường (Chuẩn vị La Boong)",
          ice: "100% đá (Chuẩn mát)",
          toppings: JSON.stringify([]),
          subtotal: 29000,
        },
      ],
    },
    {
      id: "order-demo-02",
      code: "LB-83922",
      customerName: "Trần Anh Quân",
      phone: "0918765432",
      note: "Để đá riêng giúp mình nha shop.",
      total: 87000,
      itemCount: 2,
      status: "accepted",
      created: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
      items: [
        {
          name: "Ô Long Nhài Sữa",
          price: 35000,
          quantity: 1,
          size: "Size L (+500ml)",
          sugar: "50% đường (Ít ngọt)",
          ice: "50% đá (Ít đá)",
          toppings: JSON.stringify([{ name: "Trân Châu Ô Long", price: 10000 }]),
          subtotal: 51000,
        },
        {
          name: "Cà Phê Muối",
          price: 35000,
          quantity: 1,
          size: "Size M (Tiêu chuẩn)",
          sugar: "100% đường (Chuẩn vị La Boong)",
          ice: "100% đá (Chuẩn mát)",
          toppings: JSON.stringify([]),
          subtotal: 36000,
        },
      ],
    },
    {
      id: "order-demo-03",
      code: "LB-83923",
      customerName: "Lê Mỹ Duyên",
      phone: "0933998877",
      note: "Gọi điện trước khi đến.",
      total: 47000,
      itemCount: 1,
      status: "preparing",
      created: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
      items: [
        {
          name: "Ô Long Bưởi Chanh Vàng",
          price: 35000,
          quantity: 1,
          size: "Size L (+500ml)",
          sugar: "70% đường (Ngọt dịu)",
          ice: "100% đá (Chuẩn mát)",
          toppings: JSON.stringify([{ name: "Trân Châu Trắng Giòn", price: 6000 }]),
          subtotal: 47000,
        },
      ],
    },
  ];

  for (const ord of sampleOrders) {
    await db.prepare(
      `INSERT OR IGNORE INTO customer_orders
        (id, order_code, store_id, customer_name, customer_phone, customer_note, total_amount, item_count, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      ord.id,
      ord.code,
      STORE_ID,
      ord.customerName,
      ord.phone,
      ord.note,
      ord.total,
      ord.itemCount,
      ord.status,
      ord.created,
      ord.created,
    ).run();

    for (let i = 0; i < ord.items.length; i++) {
      const it = ord.items[i];
      await db.prepare(
        `INSERT OR IGNORE INTO order_items
          (id, order_id, item_name, unit_price, quantity, subtotal, size_label, sugar_level, ice_level, toppings_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        `${ord.id}-item-${i + 1}`,
        ord.id,
        it.name,
        it.price,
        it.quantity,
        it.subtotal,
        it.size,
        it.sugar,
        it.ice,
        it.toppings,
        ord.created,
      ).run();
    }

    await db.prepare(
      `INSERT OR IGNORE INTO order_status_history
        (id, order_id, from_status, to_status, actor_type, note, created_at)
       VALUES (?, ?, null, ?, 'customer', 'Đơn hàng được khởi tạo thành công', ?)`
    ).bind(
      `${ord.id}-hist-init`,
      ord.id,
      ord.status,
      ord.created,
    ).run();
  }
}

