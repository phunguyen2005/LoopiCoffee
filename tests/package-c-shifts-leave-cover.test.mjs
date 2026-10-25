import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  createDatabase,
  seedStore,
  seedEmployee,
  seedShift,
  seedAttendanceSession,
  seedRequest,
} from "./helpers/database.mjs";
import { ROLES } from "./fixtures/workforce-fixtures.mjs";
import {
  changeShift,
  assignCoverShift,
} from "../modules/operations/application/manage-shifts.ts";
import { createRequest } from "../modules/operations/application/create-request.ts";

describe("Gói C: Hủy ca, Duyệt nghỉ & Bố trí người thay", () => {
  // =========================================================================
  // 1. Cut-off 12 giờ theo DEC-002 & Disambiguation
  // =========================================================================
  describe("1. Cut-off 12 giờ & Phân tách nguyên nhân lỗi hủy/sửa ca", () => {
    test("Hủy ca trước đúng 12h hoặc > 12h thành công; < 12h yêu cầu lý do điều chỉnh", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());

      seedStore(db, { id: "store-c01", code: "S01", name: "Store C01" });
      seedEmployee(db, { id: "emp-owner", storeId: "store-c01", email: "owner@loopicafe.test", role: ROLES.OWNER });
      seedEmployee(db, { id: "emp-staff", storeId: "store-c01", email: "staff@loopicafe.test", role: ROLES.EMPLOYEE });

      const ownerActor = {
        id: "emp-owner",
        email: "owner@loopicafe.test",
        storeId: "store-c01",
        role: ROLES.OWNER,
        permissions: ["shifts.read", "shifts.create", "shifts.publish", "shifts.cancel", "shifts.adjust"],
      };

      const nowMs = Date.now();
      const twelveHoursMs = 12 * 60 * 60 * 1000;

      // Ca A: Bắt đầu lúc now + 12h + 10s (>= 12h) -> Cho phép hủy
      const shiftAStartsAt = new Date(nowMs + twelveHoursMs + 10000).toISOString();
      const shiftAEndsAt = new Date(nowMs + twelveHoursMs + 8 * 3600000).toISOString();
      const shiftA = seedShift(db, {
        id: "shift-a",
        storeId: "store-c01",
        employeeEmail: "staff@loopicafe.test",
        startsAt: shiftAStartsAt,
        endsAt: shiftAEndsAt,
        status: "published",
        revision: 1,
      });

      const cancelResA = await changeShift(db, ownerActor, {
        id: shiftA.id,
        action: "cancel",
        expectedRevision: 1,
      });
      assert.equal(cancelResA.updated, true);
      assert.equal(cancelResA.status, "cancelled");

      const updatedShiftA = db.sqlite.prepare("SELECT status FROM shifts WHERE id = ?").get("shift-a");
      assert.equal(updatedShiftA.status, "cancelled");

      // Ca B: Bắt đầu lúc now + 12h - 5s (< 12h) -> Cận giờ, không có lý do -> Bị chặn
      const shiftBStartsAt = new Date(nowMs + twelveHoursMs - 5000).toISOString();
      const shiftBEndsAt = new Date(nowMs + twelveHoursMs + 7 * 3600000).toISOString();
      seedShift(db, {
        id: "shift-b",
        storeId: "store-c01",
        employeeEmail: "staff@loopicafe.test",
        startsAt: shiftBStartsAt,
        endsAt: shiftBEndsAt,
        status: "published",
        revision: 1,
      });

      await assert.rejects(
        () =>
          changeShift(db, ownerActor, {
            id: "shift-b",
            action: "cancel",
            expectedRevision: 1,
          }),
        (err) => {
          assert.equal(err.code, "cutoff_lock_active");
          assert.match(err.message, /12 giờ/);
          return true;
        }
      );

      // Thử lại với action "adjust" và reason đầy đủ -> Cho phép điều chỉnh ca cận giờ
      const adjustResB = await changeShift(db, ownerActor, {
        id: "shift-b",
        action: "adjust",
        reason: "Nhân viên gặp sự cố đột xuất",
        startsAt: shiftBStartsAt,
        endsAt: shiftBEndsAt,
        expectedRevision: 1,
      });
      assert.equal(adjustResB.updated, true);
    });

    test("Ca nháp (draft) cho phép hủy mọi lúc không bị khóa bởi cut-off 12 giờ", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());

      seedStore(db, { id: "store-c02", code: "S02", name: "Store C02" });
      seedEmployee(db, { id: "emp-owner", storeId: "store-c02", email: "owner@loopicafe.test", role: ROLES.OWNER });
      seedEmployee(db, { id: "emp-staff", storeId: "store-c02", email: "staff@loopicafe.test", role: ROLES.EMPLOYEE });

      const ownerActor = {
        id: "emp-owner",
        email: "owner@loopicafe.test",
        storeId: "store-c02",
        role: ROLES.OWNER,
        permissions: ["shifts.read", "shifts.create", "shifts.publish", "shifts.cancel", "shifts.adjust"],
      };

      const nowMs = Date.now();
      // Ca draft bắt đầu chỉ sau 2 giờ (< 12 giờ)
      const shiftStartsAt = new Date(nowMs + 2 * 3600000).toISOString();
      const shiftEndsAt = new Date(nowMs + 10 * 3600000).toISOString();
      seedShift(db, {
        id: "shift-draft",
        storeId: "store-c02",
        employeeEmail: "staff@loopicafe.test",
        startsAt: shiftStartsAt,
        endsAt: shiftEndsAt,
        status: "draft",
        revision: 1,
      });

      const cancelRes = await changeShift(db, ownerActor, {
        id: "shift-draft",
        action: "cancel",
        expectedRevision: 1,
      });
      assert.equal(cancelRes.updated, true);
      assert.equal(cancelRes.status, "cancelled");

      const row = db.sqlite.prepare("SELECT status FROM shifts WHERE id = ?").get("shift-draft");
      assert.equal(row.status, "cancelled");
    });

    test("Ca qua đêm (overnight shift) tính cut-off 12 giờ chuẩn theo thời điểm bắt đầu", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());

      seedStore(db, { id: "store-c03", code: "S03", name: "Store C03" });
      seedEmployee(db, { id: "emp-owner", storeId: "store-c03", email: "owner@loopicafe.test", role: ROLES.OWNER });
      seedEmployee(db, { id: "emp-staff", storeId: "store-c03", email: "staff@loopicafe.test", role: ROLES.EMPLOYEE });

      const ownerActor = {
        id: "emp-owner",
        email: "owner@loopicafe.test",
        storeId: "store-c03",
        role: ROLES.OWNER,
        permissions: ["shifts.read", "shifts.create", "shifts.publish", "shifts.cancel", "shifts.adjust"],
      };

      const nowMs = Date.now();
      const startsAt = new Date(nowMs + 13 * 3600000).toISOString();
      const endsAt = new Date(nowMs + 21 * 3600000).toISOString(); // Kết thúc sáng hôm sau

      seedShift(db, {
        id: "shift-overnight",
        storeId: "store-c03",
        employeeEmail: "staff@loopicafe.test",
        startsAt,
        endsAt,
        status: "published",
        revision: 1,
      });

      // 13 giờ > 12 giờ -> Cho phép hủy
      const res = await changeShift(db, ownerActor, {
        id: "shift-overnight",
        action: "cancel",
        expectedRevision: 1,
      });
      assert.equal(res.updated, true);
      assert.equal(res.status, "cancelled");
    });

    test("Phân biệt lỗi chi tiết: stale revision, có công chấm, có đơn nghỉ duyệt", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());

      seedStore(db, { id: "store-c04", code: "S04", name: "Store C04" });
      seedEmployee(db, { id: "emp-owner", storeId: "store-c04", email: "owner@loopicafe.test", role: ROLES.OWNER });
      seedEmployee(db, { id: "emp-staff-1", storeId: "store-c04", email: "staff1@loopicafe.test", role: ROLES.EMPLOYEE });
      seedEmployee(db, { id: "emp-staff-2", storeId: "store-c04", email: "staff2@loopicafe.test", role: ROLES.EMPLOYEE });
      seedEmployee(db, { id: "emp-staff-3", storeId: "store-c04", email: "staff3@loopicafe.test", role: ROLES.EMPLOYEE });

      const ownerActor = {
        id: "emp-owner",
        email: "owner@loopicafe.test",
        storeId: "store-c04",
        role: ROLES.OWNER,
        permissions: ["shifts.read", "shifts.create", "shifts.publish", "shifts.cancel", "shifts.adjust"],
      };

      const futureStart = new Date(Date.now() + 24 * 3600000).toISOString();
      const futureEnd = new Date(Date.now() + 32 * 3600000).toISOString();

      // 1. Test Stale Revision
      seedShift(db, {
        id: "shift-stale",
        storeId: "store-c04",
        employeeEmail: "staff1@loopicafe.test",
        startsAt: futureStart,
        endsAt: futureEnd,
        status: "published",
        revision: 3,
      });

      await assert.rejects(
        () =>
          changeShift(db, ownerActor, {
            id: "shift-stale",
            action: "cancel",
            expectedRevision: 1, // Sai revision
          }),
        (err) => {
          assert.ok(err.code === "shift_conflict" || err.code === "stale_revision");
          assert.match(err.message, /thao tác khác/);
          return true;
        }
      );

      // 2. Test Shift đã có đơn nghỉ duyệt
      seedRequest(db, {
        id: "req-leave-approved",
        storeId: "store-c04",
        employeeEmail: "staff2@loopicafe.test",
        type: "leave",
        status: "approved",
      });
      seedShift(db, {
        id: "shift-with-leave",
        storeId: "store-c04",
        employeeEmail: "staff2@loopicafe.test",
        startsAt: futureStart,
        endsAt: futureEnd,
        status: "published",
        revision: 1,
        approvedLeaveRequestId: "req-leave-approved",
      });

      await assert.rejects(
        () =>
          changeShift(db, ownerActor, {
            id: "shift-with-leave",
            action: "cancel",
            expectedRevision: 1,
          }),
        (err) => {
          assert.equal(err.code, "shift_has_approved_leave");
          assert.match(err.message, /đơn nghỉ phép được duyệt/);
          return true;
        }
      );

      // 3. Test Shift đã có ca chấm công
      seedShift(db, {
        id: "shift-with-att",
        storeId: "store-c04",
        employeeEmail: "staff3@loopicafe.test",
        startsAt: futureStart,
        endsAt: futureEnd,
        status: "published",
        revision: 1,
      });
      seedAttendanceSession(db, {
        id: "att-sess-1",
        storeId: "store-c04",
        employeeEmail: "staff3@loopicafe.test",
        shiftId: "shift-with-att",
        status: "open",
        openedAt: new Date().toISOString(),
      });

      await assert.rejects(
        () =>
          changeShift(db, ownerActor, {
            id: "shift-with-att",
            action: "cancel",
            expectedRevision: 1,
          }),
        (err) => {
          assert.equal(err.code, "shift_has_attendance");
          assert.match(err.message, /phiên chấm công/);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 2. Tạo đơn nghỉ & Thông báo nguyên tử cho Approvers
  // =========================================================================
  describe("2. Tạo đơn nghỉ & Thông báo nguyên tử cho Approvers", () => {
    test("Tạo đơn nghỉ gửi notification cho Owner, Manager và Custom Role có quyền duyệt", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());

      seedStore(db, { id: "store-c05", code: "S05", name: "Store C05" });
      seedEmployee(db, { id: "emp-owner", storeId: "store-c05", email: "owner@loopicafe.test", role: ROLES.OWNER });
      seedEmployee(db, { id: "emp-mgr", storeId: "store-c05", email: "mgr@loopicafe.test", role: ROLES.MANAGER });

      // Tạo một custom role có quyền duyệt requests.approve qua sqlite trực tiếp
      db.sqlite.prepare(`
        INSERT INTO custom_roles (id, store_id, name, description, status, revision, created_by, created_at, updated_at)
        VALUES ('crole_lead_test', 'store-c05', 'Ca Trưởng Phê Duyệt', 'Có quyền duyệt đơn', 'active', 0, 'admin@loopicafe.test', datetime('now'), datetime('now'))
      `).run();
      db.sqlite.prepare(`
        INSERT INTO role_permissions (store_id, role, permission_key, created_at)
        VALUES ('store-c05', 'crole_lead_test', 'requests.leave.review', datetime('now'))
      `).run();

      seedEmployee(db, {
        id: "emp-lead-custom",
        storeId: "store-c05",
        email: "lead_custom@loopicafe.test",
        role: "custom",
        roleId: "crole_lead_test",
      });

      // Nhân viên thường (người nộp đơn)
      seedEmployee(db, { id: "emp-staff", storeId: "store-c05", email: "staff@loopicafe.test", role: ROLES.EMPLOYEE });

      const futureStart = new Date(Date.now() + 48 * 3600000).toISOString();
      const futureEnd = new Date(Date.now() + 56 * 3600000).toISOString();
      seedShift(db, {
        id: "shift-target",
        storeId: "store-c05",
        employeeEmail: "staff@loopicafe.test",
        startsAt: futureStart,
        endsAt: futureEnd,
        status: "published",
        revision: 1,
      });

      const staffActor = {
        id: "emp-staff",
        email: "staff@loopicafe.test",
        storeId: "store-c05",
        role: ROLES.EMPLOYEE,
        permissions: ["requests.create"],
      };

      const reqRes = await createRequest(db, staffActor, {
        type: "leave",
        title: "Đơn xin nghỉ phép ca làm",
        shiftId: "shift-target",
        reason: "Bận việc gia đình quan trọng",
        idempotencyKey: "idem-req-001",
      });

      assert.equal(reqRes.replayed, false);
      assert.ok(reqRes.request.id);

      // Kiểm tra notifications tạo trong DB
      const notifs = db.sqlite.prepare("SELECT recipient_email, type, title FROM notifications").all();
      assert.ok(notifs.length >= 3, `Phải có ít nhất 3 thông báo cho approvers, thực tế có ${notifs.length}`);

      const recipientEmails = notifs.map((n) => n.recipient_email);
      assert.ok(recipientEmails.includes("owner@loopicafe.test"), "Owner phải nhận được thông báo");
      assert.ok(recipientEmails.includes("mgr@loopicafe.test"), "Manager phải nhận được thông báo");
      assert.ok(recipientEmails.includes("lead_custom@loopicafe.test"), "Custom role có quyền duyệt phải nhận thông báo");
      assert.ok(!recipientEmails.includes("staff@loopicafe.test"), "Người nộp đơn không tự nhận thông báo duyệt");

      // Kiểm tra idempotency: gửi lại cùng key
      const replayedRes = await createRequest(db, staffActor, {
        type: "leave",
        title: "Đơn xin nghỉ phép ca làm",
        shiftId: "shift-target",
        reason: "Bận việc gia đình quan trọng",
        idempotencyKey: "idem-req-001",
      });

      assert.equal(replayedRes.replayed, true);
      assert.equal(replayedRes.request.id, reqRes.request.id);

      // Số lượng notifications không bị nhân đôi
      const notifsAfterReplay = db.sqlite.prepare("SELECT COUNT(*) as count FROM notifications").get();
      assert.equal(notifsAfterReplay.count, notifs.length);
    });
  });

  // =========================================================================
  // 3. Bố trí người làm thay (assignCoverShift)
  // =========================================================================
  describe("3. Bố trí người làm thay (assignCoverShift)", () => {
    test("Phân công ca thay: tạo ca mới có cover_for_shift_id, chống gán trùng, chống tự thay", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());

      seedStore(db, { id: "store-c06", code: "S06", name: "Store C06" });
      seedEmployee(db, { id: "emp-owner", storeId: "store-c06", email: "owner@loopicafe.test", role: ROLES.OWNER });
      seedEmployee(db, { id: "emp-leaver", storeId: "store-c06", email: "leaver@loopicafe.test", role: ROLES.EMPLOYEE });
      seedEmployee(db, { id: "emp-replacer", storeId: "store-c06", email: "replacer@loopicafe.test", role: ROLES.EMPLOYEE });
      seedEmployee(db, { id: "emp-busy", storeId: "store-c06", email: "busy@loopicafe.test", role: ROLES.EMPLOYEE });

      const ownerActor = {
        id: "emp-owner",
        email: "owner@loopicafe.test",
        storeId: "store-c06",
        role: ROLES.OWNER,
        permissions: ["shifts.read", "shifts.create", "shifts.publish", "shifts.cancel", "shifts.adjust"],
      };

      const futureStart = new Date(Date.now() + 24 * 3600000).toISOString();
      const futureEnd = new Date(Date.now() + 32 * 3600000).toISOString();

      seedRequest(db, {
        id: "req-leave-1",
        storeId: "store-c06",
        employeeEmail: "leaver@loopicafe.test",
        type: "leave",
        status: "approved",
      });

      seedShift(db, {
        id: "shift-leave-original",
        storeId: "store-c06",
        employeeEmail: "leaver@loopicafe.test",
        startsAt: futureStart,
        endsAt: futureEnd,
        status: "published",
        revision: 1,
        approvedLeaveRequestId: "req-leave-1",
      });

      // 0a. Thiếu quyền shifts.publish -> bị từ chối 403 permission_denied
      await assert.rejects(
        () =>
          assignCoverShift(
            db,
            { ...ownerActor, role: ROLES.MANAGER, permissions: ["shifts.create"] },
            {
              originalShiftId: "shift-leave-original",
              replacementEmail: "replacer@loopicafe.test",
            },
          ),
        (err) => {
          assert.equal(err.code, "permission_denied");
          return true;
        },
      );

      // 0b. Nhân viên không tham gia chấm công (participates_attendance = 0) -> bị từ chối 400 employee_not_eligible
      seedEmployee(db, {
        id: "emp-non-att",
        storeId: "store-c06",
        email: "nonatt@loopicafe.test",
        role: ROLES.EMPLOYEE,
        participatesAttendance: 0,
      });
      await assert.rejects(
        () =>
          assignCoverShift(db, ownerActor, {
            originalShiftId: "shift-leave-original",
            replacementEmail: "nonatt@loopicafe.test",
          }),
        (err) => {
          assert.equal(err.code, "employee_not_eligible");
          return true;
        },
      );

      // 1. Thử phân công chính người xin nghỉ -> Lỗi
      await assert.rejects(
        () =>
          assignCoverShift(db, ownerActor, {
            originalShiftId: "shift-leave-original",
            replacementEmail: "leaver@loopicafe.test",
          }),
        (err) => {
          assert.equal(err.code, "invalid_replacement");
          assert.match(err.message, /chính ca của mình/);
          return true;
        }
      );

      // 2. Thử phân công nhân viên đang bận ca khác trùng giờ -> Lỗi
      seedShift(db, {
        id: "shift-busy-existing",
        storeId: "store-c06",
        employeeEmail: "busy@loopicafe.test",
        startsAt: futureStart,
        endsAt: futureEnd,
        status: "published",
        revision: 1,
      });

      await assert.rejects(
        () =>
          assignCoverShift(db, ownerActor, {
            originalShiftId: "shift-leave-original",
            replacementEmail: "busy@loopicafe.test",
          }),
        (err) => {
          assert.equal(err.code, "shift_overlap");
          assert.match(err.message, /đã có ca làm trùng thời gian/);
          return true;
        }
      );

      // 3. Phân công nhân viên hợp lệ (replacer) -> Thành công
      const coverRes = await assignCoverShift(db, ownerActor, {
        originalShiftId: "shift-leave-original",
        replacementEmail: "replacer@loopicafe.test",
        reason: "Bố trí người làm thay theo quy trình",
      });

      assert.equal(coverRes.success, true);
      assert.ok(coverRes.coverShift.id);
      assert.equal(coverRes.coverShift.originalShiftId, "shift-leave-original");

      // Kiểm tra ca thay trong DB
      const coverShift = db.sqlite.prepare("SELECT * FROM shifts WHERE id = ?").get(coverRes.coverShift.id);
      assert.equal(coverShift.cover_for_shift_id, "shift-leave-original");
      assert.equal(coverShift.employee_email, "replacer@loopicafe.test");
      assert.equal(coverShift.status, "published");

      // Kiểm tra notifications: cả người nghỉ và người làm thay đều nhận được thông báo
      const notifs = db.sqlite.prepare("SELECT recipient_email, title FROM notifications").all();
      const notifRecipients = notifs.map((n) => n.recipient_email);
      assert.ok(notifRecipients.includes("leaver@loopicafe.test"), "Người nghỉ phải được thông báo đã có người thay");
      assert.ok(notifRecipients.includes("replacer@loopicafe.test"), "Người thay phải nhận được thông báo phân công ca");

      // 4. Thử phân công lần thứ 2 khi đã có ca thay -> Bị chặn (1 ca nghỉ chỉ có 1 ca thay còn hiệu lực)
      seedEmployee(db, { id: "emp-replacer-alt", storeId: "store-c06", email: "replacer_alt@loopicafe.test", role: ROLES.EMPLOYEE });
      await assert.rejects(
        () =>
          assignCoverShift(db, ownerActor, {
            originalShiftId: "shift-leave-original",
            replacementEmail: "replacer_alt@loopicafe.test",
          }),
        (err) => {
          assert.equal(err.code, "cover_already_assigned");
          assert.match(err.message, /đã được bố trí người thay/);
          return true;
        }
      );

      // 5. Nếu hủy ca thay hợp lệ -> Cho phép bố trí lại
      await changeShift(db, ownerActor, {
        id: coverRes.coverShift.id,
        action: "cancel",
        expectedRevision: coverShift.revision,
      });

      // Tạo nhân viên mới để thay
      seedEmployee(db, { id: "emp-replacer2", storeId: "store-c06", email: "replacer2@loopicafe.test", role: ROLES.EMPLOYEE });

      const coverRes2 = await assignCoverShift(db, ownerActor, {
        originalShiftId: "shift-leave-original",
        replacementEmail: "replacer2@loopicafe.test",
      });

      assert.equal(coverRes2.success, true);
      assert.ok(coverRes2.coverShift.id);
      assert.notEqual(coverRes2.coverShift.id, coverRes.coverShift.id);
    });

    test("Phân công ca thay cho ca đã bắt đầu: không bắt buộc nhập lý do phân công", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());

      seedStore(db, { id: "store-c06b", code: "S06B", name: "Store C06B" });
      seedEmployee(db, { id: "emp-owner-b", storeId: "store-c06b", email: "ownerb@loopicafe.test", role: ROLES.OWNER });
      seedEmployee(db, { id: "emp-leaver-b", storeId: "store-c06b", email: "leaverb@loopicafe.test", role: ROLES.EMPLOYEE });
      seedEmployee(db, { id: "emp-replacer-b", storeId: "store-c06b", email: "replacerb@loopicafe.test", role: ROLES.EMPLOYEE });

      const ownerActor = {
        id: "emp-owner-b",
        email: "ownerb@loopicafe.test",
        storeId: "store-c06b",
        role: ROLES.OWNER,
        permissions: ["shifts.read", "shifts.create", "shifts.publish", "shifts.cancel", "shifts.adjust"],
      };

      // Ca bắt đầu 1 giờ trước và kết thúc sau 3 giờ nữa (ca đang diễn ra)
      const nowMs = Date.now();
      const startedAt = new Date(nowMs - 3600000).toISOString();
      const willEndAt = new Date(nowMs + 3 * 3600000).toISOString();

      seedRequest(db, {
        id: "req-leave-started",
        storeId: "store-c06b",
        employeeEmail: "leaverb@loopicafe.test",
        type: "leave",
        status: "approved",
      });

      seedShift(db, {
        id: "shift-started",
        storeId: "store-c06b",
        employeeEmail: "leaverb@loopicafe.test",
        startsAt: startedAt,
        endsAt: willEndAt,
        status: "published",
        revision: 1,
        approvedLeaveRequestId: "req-leave-started",
      });

      // Phân công người thay mà không điền lý do (hoặc chuỗi rỗng / undefined) -> Thành công
      const coverRes = await assignCoverShift(db, ownerActor, {
        originalShiftId: "shift-started",
        replacementEmail: "replacerb@loopicafe.test",
      });

      assert.equal(coverRes.success, true);
      assert.ok(coverRes.coverShift.id);
      const coverShift = db.sqlite.prepare("SELECT * FROM shifts WHERE id = ?").get(coverRes.coverShift.id);
      assert.equal(coverShift.cover_for_shift_id, "shift-started");
      assert.equal(coverShift.employee_email, "replacerb@loopicafe.test");
    });
  });

  // =========================================================================
  // 4. Ca nghỉ bị loại khỏi danh sách ca hôm nay (Today API logic)
  // =========================================================================
  describe("4. Ca nghỉ bị loại khỏi danh sách ca hôm nay", () => {
    test("Query ca hôm nay loại bỏ ca có approved_leave_request_id", (t) => {
      const db = createDatabase();
      t.after(() => db.close());

      seedStore(db, { id: "store-c07", code: "S07", name: "Store C07" });
      seedEmployee(db, { id: "emp-staff", storeId: "store-c07", email: "staff@loopicafe.test", role: ROLES.EMPLOYEE });

      const todayStart = new Date().toISOString();
      const todayEnd = new Date(Date.now() + 4 * 3600000).toISOString();

      // Ca 1: Ca bình thường
      seedShift(db, {
        id: "shift-normal",
        storeId: "store-c07",
        employeeEmail: "staff@loopicafe.test",
        startsAt: todayStart,
        endsAt: todayEnd,
        status: "published",
        revision: 1,
      });

      // Ca 2: Ca đã duyệt nghỉ
      seedRequest(db, {
        id: "req-leave-today",
        storeId: "store-c07",
        employeeEmail: "staff@loopicafe.test",
        type: "leave",
        status: "approved",
      });
      seedShift(db, {
        id: "shift-leaved",
        storeId: "store-c07",
        employeeEmail: "staff@loopicafe.test",
        startsAt: todayStart,
        endsAt: todayEnd,
        status: "published",
        revision: 1,
        approvedLeaveRequestId: "req-leave-today",
      });

      // Query áp dụng đúng logic của app/api/today/route.ts: AND approved_leave_request_id IS NULL
      const visibleShifts = db.sqlite
        .prepare(`
          SELECT id, starts_at, ends_at, role_label, is_shift_lead, status
          FROM shifts
          WHERE store_id = ?
            AND employee_email = ?
            AND status = 'published'
            AND approved_leave_request_id IS NULL
        `)
        .all("store-c07", "staff@loopicafe.test");

      assert.equal(visibleShifts.length, 1);
      assert.equal(visibleShifts[0].id, "shift-normal");
    });
  });
});
