import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createDatabase,
  seedStore,
  seedEmployee,
  seedShift,
  seedAttendanceSession,
  seedRequest,
} from "./helpers/database.mjs";

describe("Gói D: Camera, GPS & Dashboard Cảnh báo", () => {
  describe("1. Dashboard: Lọc ca nghỉ đã duyệt và đối chiếu phiên chấm công theo ca", () => {
    test("Query ca hôm nay loại bỏ ca nghỉ đã duyệt (approved_leave_request_id NOT NULL)", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());

      const storeId = "store-dash";
      seedStore(db, { id: storeId, name: "Dash Cafe" });
      seedEmployee(db, { id: "emp-1", storeId, email: "staff1@loopi.cafe", displayName: "Staff One" });
      seedEmployee(db, { id: "emp-2", storeId, email: "staff2@loopi.cafe", displayName: "Staff Two" });

      const todayRow = db.prepare("SELECT date('now', '+7 hours') AS d").execute().results[0];
      const todayYmd = todayRow.d;
      const startsAt1 = `${todayYmd}T08:00:00.000Z`;
      const endsAt1 = `${todayYmd}T12:00:00.000Z`;
      const startsAt2 = `${todayYmd}T13:00:00.000Z`;
      const endsAt2 = `${todayYmd}T17:00:00.000Z`;

      // Shift 1: bình thường (chưa nghỉ)
      const shift1 = seedShift(db, {
        id: "shift-active-1",
        storeId,
        employeeEmail: "staff1@loopi.cafe",
        startsAt: startsAt1,
        endsAt: endsAt1,
        status: "published",
        approvedLeaveRequestId: null,
      });

      // Tạo request trước để thỏa mãn foreign key
      const leaveReq = seedRequest(db, {
        id: "leave-req-999",
        storeId,
        employeeEmail: "staff2@loopi.cafe",
        type: "leave",
        status: "approved",
      });

      // Shift 2: có đơn nghỉ đã duyệt
      const shift2 = seedShift(db, {
        id: "shift-leave-2",
        storeId,
        employeeEmail: "staff2@loopi.cafe",
        startsAt: startsAt2,
        endsAt: endsAt2,
        status: "published",
        approvedLeaveRequestId: leaveReq.id,
      });

      // Query dashboard shifts: lấy ca published/completed và approved_leave_request_id IS NULL
      const query = db.prepare(`
        SELECT s.id, s.starts_at, s.ends_at, s.role_label, s.employee_email,
               COALESCE(e.display_name, s.employee_email) AS employee_name
        FROM shifts s LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email)
        WHERE s.store_id = ? AND s.status IN ('published', 'completed')
          AND s.approved_leave_request_id IS NULL
          AND date(s.starts_at,'+7 hours') = date('now','+7 hours')
        ORDER BY s.starts_at ASC
      `, [storeId]);
      const todayShifts = query.execute().results;

      assert.equal(todayShifts.length, 1, "Chỉ có 1 ca chưa nghỉ xuất hiện");
      assert.equal(todayShifts[0].id, shift1.id, "Ca bình thường xuất hiện");
      assert.ok(!todayShifts.some((s) => s.id === shift2.id), "Ca nghỉ đã duyệt bị loại trừ hoàn toàn");
    });

    test("Query todaySessions trả về shift_id để Dashboard đối chiếu chính xác phiên công của từng ca", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());

      const storeId = "store-dash";
      seedStore(db, { id: storeId, name: "Dash Cafe" });
      seedEmployee(db, { id: "emp-1", storeId, email: "staff1@loopi.cafe", displayName: "Staff One" });

      const todayRow = db.prepare("SELECT date('now', '+7 hours') AS d").execute().results[0];
      const todayYmd = todayRow.d;
      const startsAt = `${todayYmd}T08:00:00.000Z`;
      const endsAt = `${todayYmd}T16:00:00.000Z`;

      const shift = seedShift(db, {
        id: "shift-match-1",
        storeId,
        employeeEmail: "staff1@loopi.cafe",
        startsAt,
        endsAt,
        status: "published",
      });

      seedAttendanceSession(db, {
        id: "session-1",
        storeId,
        employeeEmail: "staff1@loopi.cafe",
        shiftId: shift.id,
        openedAt: startsAt,
        closedAt: null,
        status: "open",
      });

      const sessionsQuery = db.prepare(`
        SELECT id, shift_id, employee_email, opened_at, closed_at
        FROM attendance_sessions
        WHERE store_id = ? AND date(opened_at, '+7 hours') = date('now', '+7 hours')
        ORDER BY opened_at ASC
      `, [storeId]);
      const sessions = sessionsQuery.execute().results;

      assert.equal(sessions.length, 1);
      assert.equal(sessions[0].shift_id, shift.id, "Session có shift_id khớp chính xác với ca làm việc");
    });
  });

  describe("2. Logic phân cấp cảnh báo Dashboard (Late vs Absent)", () => {
    function evaluateShiftAlert(shift, sessions, nowMs) {
      const shiftStart = Date.parse(shift.starts_at);
      const shiftEnd = Date.parse(shift.ends_at);

      const hasAttendance = sessions.some((sess) => {
        if (sess.shift_id && sess.shift_id === shift.id) return true;
        if (sess.employee_email === shift.employee_email) {
          const openedAt = Date.parse(sess.opened_at);
          const closedAt = sess.closed_at ? Date.parse(sess.closed_at) : Infinity;
          return openedAt <= shiftEnd && closedAt >= shiftStart - 30 * 60 * 1000;
        }
        return false;
      });

      if (hasAttendance) return null;
      if (nowMs < shiftStart) return null;

      const lateMinutes = Math.floor((nowMs - shiftStart) / (60 * 1000));
      const alertType = lateMinutes >= 120 || nowMs >= shiftEnd ? "absent" : "late";
      const badgeLabel = alertType === "absent" ? "Vắng mặt" : `Trễ ${lateMinutes}p`;

      return { alertType, lateMinutes, badgeLabel };
    }

    test("Ca đã check-in qua shift_id -> Không tạo cảnh báo", () => {
      const shift = { id: "shift-1", employee_email: "staff@loopi.cafe", starts_at: "2026-10-14T08:00:00Z", ends_at: "2026-10-14T12:00:00Z" };
      const sessions = [{ id: "sess-1", shift_id: "shift-1", employee_email: "staff@loopi.cafe", opened_at: "2026-10-14T08:05:00Z", closed_at: null }];
      const now = Date.parse("2026-10-14T08:30:00Z");

      const alert = evaluateShiftAlert(shift, sessions, now);
      assert.equal(alert, null, "Không có cảnh báo khi đã check-in");
    });

    test("Ca chưa check-in sau 25 phút bắt đầu -> Cảnh báo Late (Trễ 25p)", () => {
      const shift = { id: "shift-1", employee_email: "staff@loopi.cafe", starts_at: "2026-10-14T08:00:00Z", ends_at: "2026-10-14T12:00:00Z" };
      const sessions = [];
      const now = Date.parse("2026-10-14T08:25:00Z");

      const alert = evaluateShiftAlert(shift, sessions, now);
      assert.notEqual(alert, null);
      assert.equal(alert.alertType, "late");
      assert.equal(alert.lateMinutes, 25);
      assert.equal(alert.badgeLabel, "Trễ 25p");
    });

    test("Ca chưa check-in sau 130 phút (>= 120p) -> Cảnh báo Absent (Vắng mặt)", () => {
      const shift = { id: "shift-1", employee_email: "staff@loopi.cafe", starts_at: "2026-10-14T08:00:00Z", ends_at: "2026-10-14T12:00:00Z" };
      const sessions = [];
      const now = Date.parse("2026-10-14T10:10:00Z");

      const alert = evaluateShiftAlert(shift, sessions, now);
      assert.notEqual(alert, null);
      assert.equal(alert.alertType, "absent");
      assert.equal(alert.badgeLabel, "Vắng mặt");
    });

    test("Ca chưa check-in đã kết thúc -> Cảnh báo Absent (Vắng mặt)", () => {
      const shift = { id: "shift-1", employee_email: "staff@loopi.cafe", starts_at: "2026-10-14T08:00:00Z", ends_at: "2026-10-14T12:00:00Z" };
      const sessions = [];
      const now = Date.parse("2026-10-14T12:05:00Z");

      const alert = evaluateShiftAlert(shift, sessions, now);
      assert.notEqual(alert, null);
      assert.equal(alert.alertType, "absent");
      assert.equal(alert.badgeLabel, "Vắng mặt");
    });
  });

  describe("3. Phân loại lỗi Camera & GPS Web API", () => {
    function classifyCameraError(caught) {
      if (typeof caught === "object" && caught !== null && "name" in caught) {
        if (caught.name === "NotAllowedError" || caught.name === "PermissionDeniedError") {
          return "Quyền truy cập camera bị từ chối. Vui lòng cấp quyền trong cài đặt trình duyệt để tiếp tục.";
        }
        if (caught.name === "NotFoundError" || caught.name === "DevicesNotFoundError") {
          return "Không tìm thấy camera trên thiết bị của bạn.";
        }
        if (caught.name === "NotReadableError" || caught.name === "TrackStartError") {
          return "Camera đang được ứng dụng khác sử dụng hoặc bị lỗi phần cứng.";
        }
        if (caught.name === "OverconstrainedError" || caught.name === "ConstraintNotSatisfiedError") {
          return "Camera không hỗ trợ độ phân giải yêu cầu.";
        }
      }
      return "Không thể khởi động camera.";
    }

    function classifyLocationError(caught) {
      if (typeof caught === "object" && caught !== null && "code" in caught) {
        const code = caught.code;
        if (code === 1) return "Quyền truy cập vị trí bị từ chối. Vui lòng bật định vị GPS trong trình duyệt/thiết bị.";
        if (code === 2) return "Không thể xác định vị trí hiện tại của thiết bị.";
        if (code === 3) return "Quá thời gian phản hồi vị trí (10 giây).";
      }
      return "Chưa lấy được vị trí GPS.";
    }

    test("Phân loại đúng các lỗi DOMException của camera", () => {
      assert.match(classifyCameraError({ name: "NotAllowedError" }), /từ chối/);
      assert.match(classifyCameraError({ name: "NotFoundError" }), /Không tìm thấy/);
      assert.match(classifyCameraError({ name: "NotReadableError" }), /ứng dụng khác/);
      assert.match(classifyCameraError({ name: "OverconstrainedError" }), /độ phân giải/);
      assert.match(classifyCameraError({ name: "UnknownError" }), /Không thể khởi động/);
    });

    test("Phân loại đúng các mã lỗi GeolocationPositionError", () => {
      assert.match(classifyLocationError({ code: 1 }), /từ chối/);
      assert.match(classifyLocationError({ code: 2 }), /Không thể xác định/);
      assert.match(classifyLocationError({ code: 3 }), /Quá thời gian/);
      assert.match(classifyLocationError({ code: 99 }), /Chưa lấy được vị trí GPS/);
    });
  });
});
