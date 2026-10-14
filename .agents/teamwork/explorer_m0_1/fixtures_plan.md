# Kế Hoạch & Thiết Kế Fixture Đa Vai Trò & Seed Helpers (Milestone M0 / Package P00)

**Tác giả:** `explorer_m0_1` (teamwork_preview_explorer)  
**Ngày lập:** 2026-10-13  
**Mục tiêu:** Thiết kế toàn diện kiến trúc Test Fixtures (`tests/fixtures/workforce-fixtures.mjs`) và mở rộng Database Seed Helpers (`tests/helpers/database.mjs`) phục vụ Milestone M0 (P00), đảm bảo tương thích 100% với 161 tests hiện có và sẵn sàng làm nền tảng cho M1–M5.

---

## 1. Tóm Tắt Khảo Sát & Mục Tiêu Kiến Trúc

### 1.1. Hiện trạng Codebase
- **Test Runner:** Node.js 22 built-in test runner (`node --experimental-strip-types --test tests/*.test.mjs`).
- **Baseline kiểm thử hiện tại:** 25 test suites, 161 test cases, 100% PASS (thời gian chạy ~13 giây).
- **Hạ tầng DB kiểm thử:** `tests/helpers/database.mjs` khởi tạo SQLite in-memory (`DatabaseSync(":memory:")`), tự động áp dụng 15 migrations (`drizzle/0000..0014.sql`), cung cấp API giả lập Cloudflare D1 (`prepare`, `bind`, `first`, `all`, `run`, `batch`, `failOn`).
- **Hạn chế của hiện trạng:**
  - Chưa có thư mục `tests/fixtures/`.
  - Các file test hiện tại phải tự viết các câu lệnh `db.sqlite.prepare("INSERT INTO ...").run(...)` thủ công, trùng lặp nhiều lần (ví dụ: tạo session, event, shift, exceptions lặp lại ở hơn 10 file test).
  - Chưa có bộ fixture chuẩn hóa về đa vai trò (Multi-Role), đặc biệt là phân định `sole_owner` vs `multi_owner`, scope thu hẹp của `team_lead`, cách ly `system_admin`, và các trạng thái vòng đời tài khoản (`suspended`, `offboarded`, `invited`).
  - Chưa có tiện ích dựng nhanh 2 store độc lập (`store-alpha` vs `store-beta`) để kiểm thử cách ly phạm vi (tenant isolation).

### 1.2. Mục tiêu Thiết kế M0
1. **Zero Regression:** Mọi bổ sung vào `database.mjs` phải bảo toàn 100% chữ ký hàm hiện tại của `createDatabase`, `seedStore`, `seedEmployee`. 161 test cases hiện có không bị ảnh hưởng.
2. **Chuẩn hóa Multi-Role Actors:** Cung cấp đầy đủ 7 nhóm tác nhân: `employee A`, `employee B`, `team_lead`, `manager`, `sole_owner` (quán có đúng 1 active owner), `multi_owner` (quán có >= 2 active owner: `owner1`, `owner2`), và `system_admin`.
3. **Bao quát Lifecycle States:** Hỗ trợ đầy đủ các trạng thái `active`, `suspended`, `offboarded`, `invited`, `inactive` với các kỳ vọng nghiệp vụ rõ ràng.
4. **Cô lập Đa Store (Multi-Store Isolation):** Khởi tạo dễ dàng 2 store độc lập với ID riêng biệt, không xung đột dữ liệu.
5. **Cung cấp Bộ Dựng Kịch Bản (Scenario Builders):** Hỗ trợ trực tiếp cho `explorer_m0_2` viết bộ test Golden Cases C01–C07 (`tests/workforce-golden-cases.test.mjs`).

---

## 2. Đặc Tả Tác Nhân Đa Vai Trò (Multi-Role Actors Specification)

Theo `docs/business-rules.md`, `docs/permissions.md`, và Sổ quyết định `DEC-001`, `DEC-003`, `DEC-004`, `DEC-006`, `DEC-007`, hệ thống phân quyền của LoopiCafe bao gồm các vai trò và ràng buộc cụ thể như sau:

| Tác nhân | Role (`employees.role`) | Trạng thái mẫu | Quyền hạn được phép (Allowed) | Ranh giới bị chặn (Blocked / Invariants) |
|---|---|---|---|---|
| **Employee A** | `employee` | `active` | Xem ca published của bản thân; check-in/out ca bản thân; nộp đơn xin nghỉ (`leave`), đổi ca (`swap`), giải trình (`correction`); làm checklist ca được phân công; báo sự cố (`incidents`). | **Chặn tự duyệt** (`actor != target`); chặn duyệt bất kỳ ai; chặn xem ca `draft`; chặn xem ảnh/GPS của người khác; chặn tự hủy đơn pha (`preparing`/`ready`). |
| **Employee B** | `employee` | `active` | Tương tự Employee A; đóng vai trò đối tác đổi ca hoặc người cùng làm ca. | **Chặn tự duyệt đổi ca**: Trong đơn swap A ↔ B, cả A (requester) và B (co-beneficiary) đều bị chặn duyệt (`actor != beneficiary`). |
| **Team Lead** | `team_lead` | `active` | Trưởng ca vận hành: xem lịch published toàn quán; tạo ca cho nhân viên thường (`employee`); làm checklist ca; lập và xác nhận biên bản bàn giao (`handovers`); báo cáo sự cố ca; **Duyệt swap cấp dưới**: Chỉ được duyệt swap khi cả 2 bên đều là `employee`. | **Bị tước quyền quản lý cấp cao (DEC-001)**: Chặn duyệt nghỉ (`leave`); chặn sửa công (`correctAttendance`); chặn duyệt công/ngoại lệ (`reviewAttendance`); chặn duyệt overtime; chặn xem ảnh/GPS; chặn chốt/mở lương; chặn sửa/tạo ca cho `manager`/`owner`; chặn duyệt swap liên quan đến lead/manager/owner. |
| **Manager** | `manager` | `active` | Quản lý vận hành quán: tạo/sửa ca cho `employee` và `team_lead`; điều chỉnh ca trong 12h cutoff (kèm lý do & audit); duyệt nghỉ/swap cho cấp dưới; duyệt ngoại lệ công & overtime; bypass bàn giao ca khẩn cấp; hủy đơn hàng (`preparing`/`ready`) kèm mã lý do chuẩn; chốt kỳ lương (`finalize`); quản lý tài khoản role thấp hơn. | **Chặn tự duyệt**: Không được tự duyệt nghỉ/swap/sửa công của chính mình (yêu cầu của manager phải do Owner duyệt); không được quản lý peer manager hoặc owner; không được mở lại kỳ lương đã chốt (`reopen` là đặc quyền của Owner); không được chạy luồng `sole_owner_self_correction`. |
| **Sole Owner** | `owner` | `active` (Quán duy nhất 1 active owner) | Quyền tối cao trong quán: toàn quyền quản trị nhân sự, lịch làm việc, cấu hình quán, mở lại kỳ lương đã chốt (`reopen`); **Được sử dụng luồng `sole_owner_self_correction`** (DEC-001) khi cần tự sửa công của bản thân (bắt buộc lý do >= 5 ký tự, before/after diff, audit cờ cao). | **Bảo vệ Last-Owner (DEC-001)**: Không thể bị xóa, vô hiệu hóa (`suspend`/`offboard`), hoặc hạ role. |
| **Multi Owner (1 & 2)** | `owner` | `active` (Quán có >= 2 active owner) | Toàn quyền quản trị quán; mở lại kỳ lương đã chốt. Khi Owner 1 nộp đơn/sửa công, Owner 2 sẽ là người xem xét độc lập. | **Chặn `sole_owner_self_correction` (DEC-001)**: Khi quán có >= 2 active owner, luồng sole-owner tự sửa công bị khóa hoàn toàn (403 Forbidden). Owner 1 phải nộp yêu cầu để Owner 2 duyệt. Chặn tự phê duyệt của từng owner. |
| **System Admin** | `system_admin` | `active` | Tài khoản kỹ thuật hạ tầng nền tảng: giám sát kỹ thuật, sao lưu phục hồi, vận hành worker/D1. | **Cách ly nghiệp vụ (DEC-001, ACC-09)**: Bị chặn hoàn toàn khỏi mọi endpoint nghiệp vụ kinh doanh (không được check-in, không được tạo ca, không được duyệt nghỉ/công, không được xem đơn hàng, không được bypass store scope). `canManageEmployee` trả về `false`. |

---

## 3. Đặc Tả Trạng Thái Vòng Đời (Lifecycle States Specification)

Bảng `employees.status` hỗ trợ 5 giá trị: `active`, `suspended`, `offboarded`, `invited`, `inactive`. Fixture phải mô hình hóa rõ ràng hành vi của từng trạng thái:

1. **`active` (Hoạt động):**
   - Đủ điều kiện đăng nhập, nhận ca làm việc, chấm công, nộp yêu cầu, tính lương.
   - Tham gia vào bộ đếm active owners (`COUNT(owners WHERE status = 'active')`).

2. **`suspended` (Tạm đình chỉ):**
   - Tài khoản bị khóa tạm thời.
   - `requireApiUser()` từ chối đăng nhập và trả về HTTP 401 hoặc 403.
   - Không thể xuất bản ca làm việc mới có gắn nhân viên này (Shift Publishing Guard chặn nhân viên không active).
   - Không thể check-in vào ca làm việc.
   - Dữ liệu lịch sử trong quá khứ được giữ nguyên.

3. **`offboarded` (Đã thôi việc):**
   - Nhân viên đã nghỉ việc.
   - Bị chặn đăng nhập và chặn lập lịch mới.
   - **Bảo toàn dữ liệu công và lương:** Các phiên công đã làm trong quá khứ không bị xóa; bảng lương vẫn tổng hợp và tính đủ giờ công/tiền lương của nhân viên offboarded (được kiểm chứng tại `workforce-integrity.test.mjs:36`).

4. **`invited` (Được mời, chưa kích hoạt):**
   - Nhân viên mới được tạo tài khoản nhưng chưa hoàn tất đăng nhập hoặc đổi mật khẩu lần đầu.
   - Bị chặn check-in ca cho đến khi trạng thái chuyển sang `active`.
   - Lập lịch: Không được xuất bản ca chính thức cho nhân viên chưa active.

5. **`inactive` (Không hoạt động):**
   - Tài khoản ngưng hoạt động kéo dài; chặn toàn bộ các tương tác nghiệp vụ phát sinh mới.

---

## 4. Đặc Tả Cách Ly Cửa Hàng (Store Isolation Specification)

Hệ thống LoopiCafe là mô hình Single-Store MVP/Pilot nhưng kiến trúc cơ sở dữ liệu và API phải bảo đảm tính toàn vẹn đa người thuê (multi-tenant boundary):

- **Store Alpha (`store-alpha`):** Cửa hàng chính phục vụ kiểm thử các luồng nghiệp vụ.
  - Tọa độ: `lat = 10.754128`, `lng = 106.66754` (LoopiCafe Nguyễn Trãi).
  - Timezone: `Asia/Ho_Chi_Minh`.
  - Geofence: 100 mét.
  - Rules: Dung sai 5 phút, clipping 15 phút, auto-close 4 giờ, lưu ảnh/GPS 90 ngày.
- **Store Beta (`store-beta`):** Cửa hàng độc lập thứ hai dùng để kiểm thử xâm nhập chéo:
  - Tác nhân thuộc Store Alpha cố gắng xem, sửa, duyệt đơn, tạo ca, hoặc truy vấn dữ liệu của Store Beta phải bị chặn (403/404).
  - SQLite triggers (chống overlap ca, khóa kỳ lương) chỉ có hiệu lực trong phạm vi `store_id` của từng ca, không gây xung đột giữa Store A và Store B.
  - Job dọn dẹp dữ liệu (retention/expire evidence) chỉ xóa bản ghi của đúng store mục tiêu.

---

## 5. Thiết Kế Chi Tiết `tests/fixtures/workforce-fixtures.mjs`

File này sẽ được đặt tại `tests/fixtures/workforce-fixtures.mjs`.

### 5.1. Cấu trúc Module & Exports

```javascript
/**
 * Central Workforce Fixtures for LoopiCafe Test Suite
 * Milestone: M0 (P00 Baseline & Golden Cases)
 */

export const ROLES = Object.freeze({
  SYSTEM_ADMIN: "system_admin",
  OWNER: "owner",
  MANAGER: "manager",
  TEAM_LEAD: "team_lead",
  EMPLOYEE: "employee",
});

export const STATUSES = Object.freeze({
  ACTIVE: "active",
  SUSPENDED: "suspended",
  OFFBOARDED: "offboarded",
  INVITED: "invited",
  INACTIVE: "inactive",
});

/**
 * Creates a fully-wired workforce environment for testing
 * @param {object} db - DatabaseSync wrapper from createDatabase()
 * @param {object} options
 * @param {string} [options.storeId='store-alpha'] - Store ID
 * @param {'sole_owner'|'multi_owner'} [options.mode='sole_owner'] - Owner topology
 * @param {boolean} [options.includeLifecycleActors=true] - Seed suspended/offboarded/invited staff
 * @param {boolean} [options.includeRules=true] - Seed standard attendance rules
 * @returns {WorkforceFixture}
 */
export function createWorkforceFixture(db, {
  storeId = "store-alpha",
  mode = "sole_owner",
  includeLifecycleActors = true,
  includeRules = true,
} = {}) {
  // 1. Seed store & rules
  seedStore(db, { id: storeId, name: `Store ${storeId}` });
  if (includeRules) {
    seedAttendanceRules(db, storeId);
  }

  const actors = {};

  // 2. Seed Owners according to mode
  if (mode === "sole_owner") {
    actors.soleOwner = seedEmployee(db, {
      id: `owner-sole-${storeId}`,
      storeId,
      role: ROLES.OWNER,
      status: STATUSES.ACTIVE,
      displayName: "Chủ Quán Duy Nhất",
      hourlyRate: 0,
      compensationType: "none",
    });
  } else {
    actors.owner1 = seedEmployee(db, {
      id: `owner-1-${storeId}`,
      storeId,
      role: ROLES.OWNER,
      status: STATUSES.ACTIVE,
      displayName: "Chủ Quán 1",
      hourlyRate: 0,
      compensationType: "none",
    });
    actors.owner2 = seedEmployee(db, {
      id: `owner-2-${storeId}`,
      storeId,
      role: ROLES.OWNER,
      status: STATUSES.ACTIVE,
      displayName: "Chủ Quán 2",
      hourlyRate: 0,
      compensationType: "none",
    });
  }

  // 3. Seed Management & Operational Leads
  actors.manager = seedEmployee(db, {
    id: `mgr-${storeId}`,
    storeId,
    role: ROLES.MANAGER,
    status: STATUSES.ACTIVE,
    displayName: "Quản Lý Cửa Hàng",
    hourlyRate: 35000,
    compensationType: "hourly",
  });

  actors.teamLead = seedEmployee(db, {
    id: `lead-${storeId}`,
    storeId,
    role: ROLES.TEAM_LEAD,
    status: STATUSES.ACTIVE,
    displayName: "Trưởng Ca Vận Hành",
    hourlyRate: 30000,
    compensationType: "hourly",
  });

  // 4. Seed Front-line Employees
  actors.employeeA = seedEmployee(db, {
    id: `emp-a-${storeId}`,
    storeId,
    role: ROLES.EMPLOYEE,
    status: STATUSES.ACTIVE,
    displayName: "Nhân Viên Pha Chế A",
    hourlyRate: 25000,
    compensationType: "hourly",
  });

  actors.employeeB = seedEmployee(db, {
    id: `emp-b-${storeId}`,
    storeId,
    role: ROLES.EMPLOYEE,
    status: STATUSES.ACTIVE,
    displayName: "Nhân Viên Thu Ngân B",
    hourlyRate: 28000,
    compensationType: "hourly",
  });

  // 5. Seed System Admin (Technical account outside store boundary)
  actors.systemAdmin = seedEmployee(db, {
    id: "admin-system",
    storeId, // Note: DB FK requires valid store, but domain role is system_admin
    role: ROLES.SYSTEM_ADMIN,
    status: STATUSES.ACTIVE,
    displayName: "Quản Trị Viên Kỹ Thuật",
    hourlyRate: 0,
    compensationType: "none",
  });

  // 6. Seed Lifecycle Variants
  if (includeLifecycleActors) {
    actors.suspendedStaff = seedEmployee(db, {
      id: `emp-suspended-${storeId}`,
      storeId,
      role: ROLES.EMPLOYEE,
      status: STATUSES.SUSPENDED,
      displayName: "Nhân Viên Bị Đình Chỉ",
      hourlyRate: 25000,
    });

    actors.offboardedStaff = seedEmployee(db, {
      id: `emp-offboarded-${storeId}`,
      storeId,
      role: ROLES.EMPLOYEE,
      status: STATUSES.OFFBOARDED,
      displayName: "Nhân Viên Đã Thôi Việc",
      hourlyRate: 25000,
    });

    actors.invitedStaff = seedEmployee(db, {
      id: `emp-invited-${storeId}`,
      storeId,
      role: ROLES.EMPLOYEE,
      status: STATUSES.INVITED,
      displayName: "Nhân Viên Mới Được Mời",
      hourlyRate: 25000,
    });

    actors.inactiveStaff = seedEmployee(db, {
      id: `emp-inactive-${storeId}`,
      storeId,
      role: ROLES.EMPLOYEE,
      status: STATUSES.INACTIVE,
      displayName: "Nhân Viên Không Hoạt Động",
      hourlyRate: 25000,
    });
  }

  // 7. Utility methods bound to fixture
  return {
    storeId,
    mode,
    actors,
    /**
     * Helper to create auth mock dependency for loadModule
     * @param {object} actor - The actor object from fixture
     */
    mockAuth: (actor) => ({
      requireApiUser: async (roles) => {
        if (!actor) return { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
        if (actor.status !== "active") return { response: Response.json({ error: "account_not_active" }, { status: 403 }) };
        if (roles && !roles.includes(actor.role)) return { response: Response.json({ error: "forbidden" }, { status: 403 }) };
        return { actor };
      },
    }),
  };
}

/**
 * Creates two completely isolated stores for tenant boundary verification
 * @param {object} db - DatabaseSync instance
 */
export function createMultiStoreFixture(db) {
  return {
    storeA: createWorkforceFixture(db, { storeId: "store-alpha", mode: "sole_owner" }),
    storeB: createWorkforceFixture(db, { storeId: "store-beta", mode: "multi_owner" }),
  };
}
```

### 5.2. Golden Cases Scenario Builders (Hỗ trợ C01–C07)

`workforce-fixtures.mjs` xuất bản thêm các hàm tạo kịch bản chuyên dụng:

1. **`buildSwapScenario(db, fixture)` (Cho C01 & C06):**
   - Tạo 2 ca `published` cho Employee A và Employee B:
     - Shift A: 08:00–12:00
     - Shift B: 13:00–17:00
   - Tạo yêu cầu đổi ca: `employee_email = Employee A, shift_id = Shift A, client_request_key, status = 'pending'`.
   - Trả về đối tượng `{ shiftA, shiftB, request, actorPerms }` mô tả ma trận ai được duyệt, ai bị chặn.

2. **`buildDraftOverlapScenario(db, fixture)` (Cho C02):**
   - Tạo Ca 1 ở trạng thái `draft` từ 08:00–12:00 cho Employee A.
   - Chuẩn bị dữ liệu tạo Ca 2 từ 10:00–14:00 (chồng lấn 2 giờ) để kiểm thử SQLite trigger `shifts_no_overlap_insert`.

3. **`buildAttendanceClippingScenario(db, fixture)` (Cho C03):**
   - Tạo ca kế hoạch 08:00–12:00 (240 phút).
   - Case A: Check-in 07:50, Check-out 12:10 (ghi nhận 260 phút, tính lương = 240 phút).
   - Case B: Check-in 07:40, Check-out 12:20 (ghi nhận 280 phút, tính lương = 240 phút).
   - Case C: Check-in 07:50, Check-out 12:30 kèm duyệt overtime 20 phút (tính lương = 260 phút).
   - Case Unscheduled: Session không có `shift_id` (giờ tính lương = 0).

4. **`buildRateHistoryScenario(db, fixture)` (Cho C04):**
   - Đơn giá 20.000 VND từ 01/07 đến 15/07; tăng lên 25.000 VND từ 16/07.
   - Ca làm 10 giờ trước ngày 16 và 10 giờ sau ngày 16.
   - Các mẫu phút kiểm thử floor 15 phút: 14m → 0, 15m → 15m, 29m → 15m, 58m → 45m.
   - Các mẫu làm tròn tổng 1.000 VND: 1.450.500 VND → 1.451.000 VND; 1.450.499 VND → 1.450.000 VND.

5. **`buildHandoverScenario(db, fixture)` (Cho C05):**
   - Ca sáng: Tạo handover note nhưng chưa `acknowledged`.
   - Ca chiều: Nhân viên cố check-in → bị chặn (412 Precondition Failed).
   - Quản lý kích hoạt `bypassHandover` kèm lý do & audit → Check-in thành công.
   - Ca đầu ngày: Không có ca liền trước → Tự động bypass check-in gate.

6. **`buildRetentionScenario(db, fixture)` (Cho C07):**
   - Tạo ảnh R2 và tọa độ GPS ở D1 có `created_at` cách đây 95 ngày (`expires_at` đã qua).
   - Tạo đơn hàng có `created_at` cách đây 185 ngày (PII sẵn sàng ẩn danh).
   - Tạo sự kiện chấm công cách đây 2 năm để kiểm chứng bảo tồn tối thiểu 3 năm.

---

## 6. Thiết Kế Mở Rộng `tests/helpers/database.mjs`

### 6.1. Nguyên Tắc Tương Thích Ngược
File `tests/helpers/database.mjs` đang có các export:
- `createDatabase({ migrations = true } = {})`
- `seedStore(db, id = "store-a")`
- `seedEmployee(db, { id = "owner-a", storeId = "store-a", role = "owner", status = "active" } = {})`

Để bảo đảm 100% không làm hỏng 161 tests hiện có:
1. `seedStore`: Nếu tham số thứ hai là `string` (hoặc undefined), chạy logic cũ. Nếu là `object`, trích xuất các thuộc tính mở rộng.
2. `seedEmployee`: Giữ nguyên các tham số mặc định `id = "owner-a", storeId = "store-a", role = "owner", status = "active"`. Trả về đúng object `{ id, storeId, role, email: `${id}@example.test`, ... }`.
3. Bổ sung các hàm seed mới xuất phát từ nhu cầu thực tế của các test cases.

### 6.2. Các Seed Helpers Bổ Sung

```javascript
// --- MỞ RỘNG tests/helpers/database.mjs ---

/**
 * Seed store with full options or backwards-compatible string id
 */
export function seedStore(db, options = "store-a") {
  const opts = typeof options === "string" ? { id: options } : options;
  const {
    id = "store-a",
    name = "Test Store",
    address = "Test Address",
    latitude = 10.754128,
    longitude = 106.66754,
    timezone = "Asia/Ho_Chi_Minh",
    attendanceEnabled = true,
    geofenceRadiusMeters = 100,
    workforceRevision = 0,
    createdAt = "2026-07-01T00:00:00.000Z",
    updatedAt = "2026-07-01T00:00:00.000Z",
  } = opts;

  db.sqlite.prepare(`
    INSERT INTO stores (id, name, address, timezone, latitude, longitude, geofence_radius_meters, attendance_enabled, workforce_revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, name, address, timezone, latitude, longitude,
    geofenceRadiusMeters, attendanceEnabled ? 1 : 0, workforceRevision, createdAt, updatedAt
  );
  return { id, name, address, timezone, latitude, longitude };
}

/**
 * Seed attendance rules for a store
 */
export function seedAttendanceRules(db, storeId = "store-a", options = {}) {
  const {
    id = `rules-${storeId}-v1`,
    version = 1,
    earlyCheckinMinutes = 15,
    lateMinutes = 5,
    earlyDepartureMinutes = 5,
    absenceMinutes = 60,
    missingCheckoutMinutes = 240,
    evidenceRetentionDays = 90,
    active = 1,
    createdBy = "system",
    createdAt = "2026-07-01T00:00:00.000Z",
  } = options;

  db.sqlite.prepare(`
    INSERT INTO attendance_rules (id, store_id, version, early_checkin_minutes, late_minutes, early_departure_minutes, absence_minutes, missing_checkout_minutes, evidence_retention_days, active, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, storeId, version, earlyCheckinMinutes, lateMinutes, earlyDepartureMinutes,
    absenceMinutes, missingCheckoutMinutes, evidenceRetentionDays, active ? 1 : 0, createdBy, createdAt
  );
  return { id, storeId, version };
}

/**
 * Seed employee with full schema support, 100% backwards compatible
 */
export function seedEmployee(db, {
  id = "owner-a",
  storeId = "store-a",
  role = "owner",
  status = "active",
  displayName = id,
  jobTitle = "Barista",
  phone = "0901234567",
  startDate = "2026-07-01",
  hourlyRate = 25000,
  compensationType = "hourly",
  participatesAttendance = 1,
  payrollEligible = 1,
  authUserId = `auth-${id}`,
  mustChangePassword = 0,
  passwordVersion = 0,
  passwordResetPending = 0,
  createdAt = "2026-07-01T00:00:00.000Z",
  updatedAt = "2026-07-01T00:00:00.000Z",
} = {}) {
  const email = `${id}@example.test`;
  db.sqlite.prepare(`
    INSERT INTO employees (
      id, store_id, email, display_name, job_title, phone, start_date, auth_user_id,
      must_change_password, password_version, password_reset_pending, role, status,
      participates_attendance, payroll_eligible, compensation_type, hourly_rate,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, storeId, email, displayName, jobTitle, phone, startDate, authUserId,
    mustChangePassword ? 1 : 0, passwordVersion, passwordResetPending ? 1 : 0,
    role, status, participatesAttendance ? 1 : 0, payrollEligible ? 1 : 0,
    compensationType, hourlyRate, createdAt, updatedAt
  );
  return { id, storeId, role, status, email, displayName, hourlyRate, authUserId };
}

/**
 * Seed a shift record
 */
export function seedShift(db, {
  id = `shift-${crypto.randomUUID()}`,
  storeId = "store-a",
  employeeEmail,
  startsAt = "2026-07-03T01:00:00.000Z",
  endsAt = "2026-07-03T09:00:00.000Z",
  roleLabel = "Barista",
  timezoneSnapshot = "Asia/Ho_Chi_Minh",
  isShiftLead = 0,
  status = "published",
  revision = 0,
  approvedLeaveRequestId = null,
  createdAt = "2026-07-01T00:00:00.000Z",
} = {}) {
  db.sqlite.prepare(`
    INSERT INTO shifts (id, store_id, employee_email, starts_at, ends_at, role_label, timezone_snapshot, is_shift_lead, status, revision, approved_leave_request_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, storeId, employeeEmail, startsAt, endsAt, roleLabel, timezoneSnapshot,
    isShiftLead ? 1 : 0, status, revision, approvedLeaveRequestId, createdAt
  );
  return { id, storeId, employeeEmail, startsAt, endsAt, roleLabel, status, revision };
}

/**
 * Seed an attendance session
 */
export function seedAttendanceSession(db, {
  id = `session-${crypto.randomUUID()}`,
  storeId = "store-a",
  employeeEmail,
  shiftId = null,
  ruleVersionId = null,
  status = "completed",
  openedAt = "2026-07-03T01:00:00.000Z",
  closedAt = "2026-07-03T09:00:00.000Z",
  workedMinutes = 480,
  revision = 0,
} = {}) {
  db.sqlite.prepare(`
    INSERT INTO attendance_sessions (id, store_id, employee_email, shift_id, rule_version_id, status, opened_at, closed_at, worked_minutes, revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, storeId, employeeEmail, shiftId, ruleVersionId, status, openedAt, closedAt, workedMinutes, revision);
  return { id, storeId, employeeEmail, shiftId, status, openedAt, closedAt, workedMinutes, revision };
}

/**
 * Seed an attendance event
 */
export function seedAttendanceEvent(db, {
  id = `event-${crypto.randomUUID()}`,
  sessionId,
  employeeEmail,
  action = "check_in",
  recordedAt = "2026-07-03T01:00:00.000Z",
  idempotencyKey = id,
  verificationResults = "[]",
  reviewRequired = 0,
  photoStatus = "stored",
  captureSessionId = null,
} = {}) {
  db.sqlite.prepare(`
    INSERT INTO attendance_events (id, session_id, employee_email, action, recorded_at, idempotency_key, verification_results, review_required, photo_status, capture_session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, employeeEmail, action, recordedAt, idempotencyKey, verificationResults, reviewRequired ? 1 : 0, photoStatus, captureSessionId);
  return { id, sessionId, employeeEmail, action, recordedAt };
}

/**
 * Seed a payroll period
 */
export function seedPayrollPeriod(db, {
  id = `period-${storeId}-${periodKey}`,
  storeId = "store-a",
  periodKey = "2026-07",
  periodStart = "2026-06-30T17:00:00.000Z",
  periodEnd = "2026-07-31T17:00:00.000Z",
  status = "reviewing",
  finalizedBy = null,
  finalizedAt = null,
  reopenedBy = null,
  reopenedAt = null,
  createdAt = "2026-07-01T00:00:00.000Z",
  updatedAt = "2026-07-01T00:00:00.000Z",
} = {}) {
  db.sqlite.prepare(`
    INSERT INTO payroll_periods (id, store_id, period_start, period_end, status, finalized_by, finalized_at, reopened_by, reopened_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, storeId, periodStart, periodEnd, status, finalizedBy, finalizedAt, reopenedBy, reopenedAt, createdAt, updatedAt);
  return { id, storeId, periodKey, periodStart, periodEnd, status };
}

/**
 * Seed a request (leave, swap, correction)
 */
export function seedRequest(db, {
  id = `req-${crypto.randomUUID()}`,
  storeId = "store-a",
  employeeEmail,
  type = "leave",
  title = "Đơn yêu cầu kiểm thử",
  reason = "Lý do kiểm thử",
  status = "pending",
  reviewerEmail = null,
  reviewedAt = null,
  shiftId = null,
  startsAt = null,
  endsAt = null,
  clientRequestKey = null,
  createdAt = "2026-07-01T00:00:00.000Z",
} = {}) {
  db.sqlite.prepare(`
    INSERT INTO requests (id, store_id, employee_email, type, title, reason, status, reviewer_email, reviewed_at, shift_id, starts_at, ends_at, client_request_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, storeId, employeeEmail, type, title, reason, status, reviewerEmail, reviewedAt, shiftId, startsAt, endsAt, clientRequestKey, createdAt);
  return { id, storeId, employeeEmail, type, status };
}

/**
 * Seed a shift handover
 */
export function seedHandover(db, {
  id = `ho-${crypto.randomUUID()}`,
  storeId = "store-a",
  authorEmail,
  summary = "Biên bản bàn giao ca kiểm thử",
  managerAttention = 0,
  receiverEmployeeId = null,
  nextShiftId = null,
  acknowledgedAt = null,
  createdAt = "2026-07-01T14:00:00.000Z",
} = {}) {
  db.sqlite.prepare(`
    INSERT INTO handovers (id, store_id, author_email, summary, manager_attention, acknowledged_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, storeId, authorEmail, summary, managerAttention ? 1 : 0, acknowledgedAt, createdAt);
  return { id, storeId, authorEmail, summary, acknowledgedAt };
}
```

---

## 7. Phối Hợp & Đồng Bộ Nhóm M0 (Synergy with Peer Explorers)

```
       [explorer_m0_1] (Design & Spec)
      tests/fixtures/workforce-fixtures.mjs
      tests/helpers/database.mjs (extensions)
                     |
       +-------------+-------------+
       |                           |
       v                           v
 [explorer_m0_2]             [explorer_m0_3]
 Golden Cases C01-C07        Test Runner Harness
 workforce-golden-cases      Zero Regression SLA
 .test.mjs                   Discovery & CI Guards
```

1. **Với `explorer_m0_2` (Tác giả `tests/workforce-golden-cases.test.mjs`):**
   - File test của `explorer_m0_2` sẽ trực tiếp import:
     `import { createWorkforceFixture, createMultiStoreFixture, ROLES, STATUSES } from "./fixtures/workforce-fixtures.mjs";`
   - Kịch bản C01 sử dụng `actors.employeeA`, `actors.employeeB`, `actors.teamLead`, `actors.manager`, `actors.soleOwner`, `actors.owner1`, `actors.owner2`.
   - Kịch bản C02 sử dụng `seedShift` với `status: 'draft'`.
   - Kịch bản C03 sử dụng `seedAttendanceSession` & `seedAttendanceEvent`.
   - Kịch bản C04 sử dụng `seedEmployeeRateHistory` & `seedPayrollPeriod`.
   - Kịch bản C05 sử dụng `seedHandover`.
   - Kịch bản C07 sử dụng `seedStore("store-alpha")` vs `seedStore("store-beta")`.

2. **Với `explorer_m0_3` (Tác giả Test Runner Harness & CI Verification):**
   - File `tests/fixtures/workforce-fixtures.mjs` nằm trong thư mục con `tests/fixtures/` và có đuôi `.mjs` (không có `.test.mjs`).
   - Lệnh kiểm thử `node --experimental-strip-types --test tests/*.test.mjs` chỉ quét các file khớp glob `tests/*.test.mjs`, do đó `workforce-fixtures.mjs` không bao giờ bị node test runner chạy nhầm thành test file.
   - Các mở rộng trong `database.mjs` hoàn toàn tương thích ngược, đảm bảo 161 test cases hiện tại tiếp tục xanh 100%.

---

## 8. Ma Trận Đánh Giá Rủi Ro & Kế Hoạch Kiểm Chứng (Risk & Verification Matrix)

| Rủi ro tiềm ẩn | Mức độ | Biện pháp giảm thiểu & Kiểm chứng |
|---|---|---|
| **R1: Phá vỡ chữ ký `seedEmployee` hoặc `seedStore` hiện có** | Cao | Giữ nguyên chính xác giá trị mặc định (`id = "owner-a"`, `storeId = "store-a"`, `role = "owner"`, `status = "active"`). Kiểm chứng bằng cách chạy `npm.cmd test` trên 161 test hiện có; kết quả phải là 161 PASS. |
| **R2: SQLite foreign key constraint fails khi seed** | Trung bình | `seedEmployee` luôn yêu cầu `stores` tồn tại; `seedShift` yêu cầu `stores` và `employees` tồn tại; `seedAttendanceSession` yêu cầu `shifts` (nếu có). Trong `createWorkforceFixture`, thứ tự seed được chuẩn hóa nghiêm ngặt: Store → Rules → Employees → Shifts → Sessions → Events. |
| **R3: Trigger `shifts_no_overlap_insert` chặn khi tạo test shifts** | Trung bình | `seedShift` mặc định tạo ca không trùng giờ hoặc cho phép test cố tình tạo trùng để assert lỗi `shift_overlap`. |
| **R4: Node Test Runner cố chạy file fixture** | Thấp | Fixture đặt trong thư mục `tests/fixtures/` (không khớp `tests/*.test.mjs`). Glob của `package.json` bỏ qua thư mục con. |
| **R5: Chưa có migration cho rate history (0015)** | Thấp | Helper `seedEmployeeRateHistory` kiểm tra sự tồn tại của bảng trước khi execute hoặc sẵn sàng cho migration 0015 ở P05/M3. |

---

## 9. Đề Xuất Chiến Lược Triển Khai Cho Implementer

Khi chuyển giao sang bước triển khai:
1. **Bước 1:** Bổ sung các helper mới vào `tests/helpers/database.mjs` (giữ nguyên code cũ). Chạy `npm.cmd test` để xác nhận 161 tests PASS.
2. **Bước 2:** Tạo thư mục `tests/fixtures/` và file `tests/fixtures/workforce-fixtures.mjs`.
3. **Bước 3:** Chạy `npm.cmd test` để đảm bảo không có lỗi cú pháp hoặc import error.
4. **Bước 4:** Bàn giao cho `explorer_m0_2` và implementer viết `tests/workforce-golden-cases.test.mjs`.
