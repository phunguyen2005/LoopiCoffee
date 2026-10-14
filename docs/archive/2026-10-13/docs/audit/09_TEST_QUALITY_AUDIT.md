# BÁO CÁO AUDIT CHUYÊN SÂU: TEST QUALITY, CI & REGRESSION COVERAGE

**Dự án:** LoopiCafe Management System  
**Mã kiểm toán:** `AUDIT-09-TEST-QUALITY`  
**Vai trò:** AGENT 5 — TEST QUALITY AUDITOR  
**Baseline Git Commit SHA:** `05e7719dc8ae824a833c6d4b3c8fa21c3d3e56c1`  
**Chế độ thực thi:** `AUDIT ONLY` (Toàn bộ source code & test suites là Read-Only)  
**Thời gian hoàn thành:** 2026-10-12  

---

## 1. TỔNG QUAN ĐIỀU HÀNH (EXECUTIVE SUMMARY)

Hệ thống kiểm thử tự động của LoopiCafe Management System hiện bao gồm **20 file kiểm thử unit/integration** chạy qua **Node Test Runner** (`node --test`) kết hợp SQLite in-memory (`DatabaseSync`), và **2 file kiểm thử End-to-End (E2E)** viết bằng **Playwright**.

### Điểm mạnh đã xác minh:
1. **Tốc độ thực thi Unit/Integration ấn tượng:** Toàn bộ **128 bài test** (chứa **696 assertions**) chạy hoàn tất chỉ trong **~7.08 giây** mà không cần Docker hay external services.
2. **Kiểm soát chặt chẽ miền Ordering & Logic nghiệp vụ:** Suite `ordering-system.test.mjs` và `business-logic-verification.test.mjs` có độ bao phủ xuất sắc về trạng thái đơn hàng, tính tiền chuẩn tắc từ menu snapshot, idempotency key và audit log rollback.
3. **Phân lập cơ sở dữ liệu ở cấp độ bài test:** Hầu hết các test case đều khởi tạo SQLite in-memory mới (`createDatabase()`), áp dụng đầy đủ chuỗi migration Drizzle và giải phóng bộ nhớ sạch sẽ qua `t.after(() => db.close())`.

### Lỗ hổng và rủi ro nghiêm trọng (Critical Blind Spots):
1. **0% E2E Test trong CI Pipeline (P0):** GitHub Actions workflow (`.github/workflows/check.yml`) chỉ chạy `npm run check`, hoàn toàn bỏ qua suite Playwright E2E (`npm run test:e2e`). Toàn bộ luồng đăng nhập thực tế, cookie session, chuyển hướng người dùng và đặt hàng trên trình duyệt không bao giờ được kiểm chứng trên CI.
2. **Mô phỏng dữ liệu tạo niềm tin giả (False Confidence via Hand-rolled Mocks - P0):** Trong `tests/security-remediation-full.test.mjs`, thay vì dùng SQLite hay D1 emulator, mã kiểm thử tự tạo đối tượng JavaScript `createMockD1()` kiểm tra câu lệnh SQL bằng string matching thô sơ (`if (sql.includes("DELETE FROM..."))`). Điều này hoàn toàn bỏ qua cú pháp SQL thật, khóa ngoại, ràng buộc bảng và tính toàn vẹn D1.
3. **Kiểm thử giao diện "hời hợt" (Shallow UI Assertions - P1):** Suite `tests/rendered-html.test.mjs` và một phần `operational-ui-permissions.test.mjs` không hề render HTML hay mount React component, mà dùng `fs.readFile` đọc mã nguồn `.tsx` rồi kiểm tra regex chuỗi. Việc này che giấu toàn bộ lỗi runtime rendering, hooks lifecycle hay cú pháp TSX.
4. **Giả lập concurrency trên harness tự viết (P1):** Suite `tests/concurrency-empirical-stress.test.mjs` không kiểm tra trực tiếp component React mà tự viết hàm đóng kín (`createOrdersPollingHarness`, `createScheduleHarness`) để kiểm thử thuật toán chống race condition của chính hàm đóng kín đó, không phản ánh hành vi React thật.
5. **Che giấu tích hợp Auth Middleware (P1):** Đa số các route integration test sử dụng `loadModule` đều mock đè `@/server/auth` thành `{ requireApiUser: async () => ({ actor }) }`, bỏ qua hoàn toàn việc kiểm thử phân tích cookie, xác thực token Supabase, kiểm tra `status === 'active'` và consent policy.

---

## 2. PHẠM VI VÀ SỐ LIỆU KIỂM THỬ HIỆN TẠI (TEST METRICS)

| Phân loại kiểm thử | Số lượng file | Số lượng test cases | Số lượng assertions | Thời gian chạy trung bình | Tình trạng chạy thực tế |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Unit / Integration (Node Test Runner)** | 20 file | 128 tests | 696 asserts | **7,080 ms (~7.08s)** | **128 PASS / 0 FAIL** |
| **End-to-End (Playwright)** | 2 file | 12 tests | ~51 expects | Không chạy trên CI | **Bị bỏ qua trên CI** (Yêu cầu local Supabase) |
| **Tổng cộng** | **22 file** | **140 tests** | **~747 asserts** | — | **Toàn bộ Unit xanh / E2E chưa vào CI** |

### Tỷ lệ phân bố độ bao phủ theo Domain:

```
[Ordering & Customer Flow]      ████████████████████ (21 tests - 16.4%)
[Operations & Shifts/Checklist] ██████████████████   (19 tests - 14.8%)
[Security, RBAC & Seed Users]   ██████████████████   (19 tests - 14.8%)
[Workforce & Payroll]           █████████████████    (18 tests - 14.1%)
[Architecture, Boundaries, D1]  ███████████████      (16 tests - 12.5%)
[People & Identity/Auth]        ██████████████       (14 tests - 10.9%)
[UI State & Concurrency Stress] █████████████        (13 tests - 10.2%)
[Attendance & Evidence]         ████████             (8 tests  -  6.3%)
```

---

## 3. DANH MỤC KIỂM THỬ CHI TIẾT (TEST SUITE INVENTORY)

| STT | Tên file test | Đường dẫn | Domain | Số test | Assertions | Công nghệ / Runner |
| :---: | :--- | :--- | :--- | :---: | :---: | :--- |
| 1 | `adversarial-seed-users.test.mjs` | [tests/adversarial-seed-users.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/adversarial-seed-users.test.mjs) | Security / Seed Protection | 6 | 22 | Node Test Runner / load-module |
| 2 | `architecture-behavior.test.mjs` | [tests/architecture-behavior.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/architecture-behavior.test.mjs) | Architecture / People / Payroll | 15 | 63 | Node Test Runner / SQLite memory |
| 3 | `architecture-boundaries.test.mjs` | [tests/architecture-boundaries.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/architecture-boundaries.test.mjs) | Architecture / Clean Architecture | 8 | 10 | Node Test Runner / TypeScript AST |
| 4 | `attendance-payload.test.mjs` | [tests/attendance-payload.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/attendance-payload.test.mjs) | Attendance / Evidence Storage | 4 | 21 | Node Test Runner / SQLite + jpeg-js |
| 5 | `business-logic-verification.test.mjs` | [tests/business-logic-verification.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/business-logic-verification.test.mjs) | Operations / BIZ States | 5 | 75 | Node Test Runner / SQLite memory |
| 6 | `challenger-stress-suite.test.mjs` | [tests/challenger-stress-suite.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/challenger-stress-suite.test.mjs) | Stress / Security / RBAC | 5 | 40 | Node Test Runner / SQLite memory |
| 7 | `concurrency-empirical-stress.test.mjs` | [tests/concurrency-empirical-stress.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/concurrency-empirical-stress.test.mjs) | UI Concurrency / Harness | 8 | 43 | Node Test Runner / Mock Closures |
| 8 | `d1-contract.test.mjs` | [tests/d1-contract.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/d1-contract.test.mjs) | Database / D1 Compatibility | 1 | 5 | Miniflare Worker Runtime |
| 9 | `daily-checklists.test.mjs` | [tests/daily-checklists.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/daily-checklists.test.mjs) | Operations / Checklists | 2 | 10 | Node Test Runner / SQLite memory |
| 10 | `evidence.test.mjs` | [tests/evidence.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/evidence.test.mjs) | Attendance / SVG Watermark | 4 | 10 | Node Test Runner / Unit |
| 11 | `identity-security.test.mjs` | [tests/identity-security.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/identity-security.test.mjs) | Auth / Session / Password | 9 | 32 | Node Test Runner / SQLite memory |
| 12 | `incidents-handovers.test.mjs` | [tests/incidents-handovers.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/incidents-handovers.test.mjs) | Operations / Incidents / Handovers | 4 | 44 | Node Test Runner / SQLite memory |
| 13 | `local-safety.test.mjs` | [tests/local-safety.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/local-safety.test.mjs) | Platform / Origin / Input Limit | 3 | 9 | Node Test Runner / Unit |
| 14 | `operational-ui-permissions.test.mjs` | [tests/operational-ui-permissions.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/operational-ui-permissions.test.mjs) | People / Team RBAC / UI Regex | 7 | 39 | Node Test Runner / SQLite + Regex |
| 15 | `ordering-system.test.mjs` | [tests/ordering-system.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/ordering-system.test.mjs) | Ordering / Customer API / Throttle | 16 | 74 | Node Test Runner / ts.transpileModule |
| 16 | `platform-compat.test.mjs` | [tests/platform-compat.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/platform-compat.test.mjs) | Packaging / OS / Node Lockfile | 4 | 16 | Node Test Runner / Unit |
| 17 | `rendered-html.test.mjs` | [tests/rendered-html.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/rendered-html.test.mjs) | Frontend Source Code Inspection | 6 | 57 | Node Test Runner / Regex on Source |
| 18 | `security-remediation-full.test.mjs` | [tests/security-remediation-full.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/security-remediation-full.test.mjs) | Security / CSV / Retention | 5 | 48 | Node Test Runner / JS Object Mock |
| 19 | `seed-users-protection.test.mjs` | [tests/seed-users-protection.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/seed-users-protection.test.mjs) | Security / Local Protection | 2 | 16 | Node Test Runner / load-module |
| 20 | `workforce-integrity.test.mjs` | [tests/workforce-integrity.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/workforce-integrity.test.mjs) | Payroll / Shifts / Attendance | 18 | 62 | Node Test Runner / SQLite memory |
| 21 | `auth.spec.ts` | [tests/e2e/auth.spec.ts](file:///d:/College/Practice/loopicafe-management-system/tests/e2e/auth.spec.ts) | E2E Browser / Authentication | 9 | ~25 | Playwright (Chromium/Edge) |
| 22 | `order.spec.ts` | [tests/e2e/order.spec.ts](file:///d:/College/Practice/loopicafe-management-system/tests/e2e/order.spec.ts) | E2E Browser / Public Ordering Flow | 3 | ~26 | Playwright (Chromium/Edge) |

---

## 4. CHECKLIST KIỂM TRA CHẤT LƯỢNG TEST SUITE

| Mục kiểm tra | Trạng thái | Bằng chứng kiểm toán | Ghi chú & Đánh giá rủi ro |
| :--- | :---: | :--- | :--- |
| **1. Node Test Runner Inventory** | **PASS** | 20 file test, 128 tests chạy qua `node --experimental-strip-types --test tests/*.test.mjs`. | Chạy hoàn tất 100% không lỗi cú pháp. |
| **2. SQLite in-memory Isolation** | **PASS** | `tests/helpers/database.mjs` khởi tạo `DatabaseSync(":memory:")` độc lập mỗi test case. | Mỗi bài test có sandbox DB riêng, tránh rò rỉ dữ liệu qua lại. |
| **3. Cloudflare D1 Emulator Fidelity** | **FAIL** | 19/20 file dùng SQLite in-memory; chỉ 1 test (`d1-contract.test.mjs`) dùng Miniflare D1 nhưng tự tạo table tạm. | D1 Worker RPC, batch limits, and concurrency không được mô phỏng trung thực. |
| **4. Playwright CI Integration** | **FAIL** | `.github/workflows/check.yml` chỉ chạy `npm run check`. `test:e2e` không có trong workflow. | Không có E2E regression check trong Pull Request / Push. |
| **5. E2E Browser Portability** | **FAIL** | `playwright.config.ts:12` kiểm tra hardcode đường dẫn Edge trên Windows `C:/Program Files (x86)/...`. | Rủi ro crash hoặc không đồng nhất khi chạy trên Linux / CI runner. |
| **6. Real Database Assertions (State/Audit)** | **PASS** | Hầu hết test case kiểm tra trực tiếp bảng DB (`SELECT * FROM ...`) và `audit_events`. | Tốt ở module ordering, incidents, handovers, workforce. |
| **7. Tránh Mock ảo tưởng (False Confidence)** | **FAIL** | `tests/security-remediation-full.test.mjs:9-100` tự chế mock object `createMockD1` bằng string matching. | Bỏ qua việc thực thi SQL thật; câu lệnh sai cú pháp vẫn PASS. |
| **8. UI Component Rendering Testing** | **FAIL** | `tests/rendered-html.test.mjs` dùng `fs.readFile` và `assert.match` regex, không render HTML/JSX. | Test tĩnh không phát hiện runtime syntax error hay hooks bugs. |
| **9. Concurrency & Race Condition Realism** | **FAIL** | `tests/concurrency-empirical-stress.test.mjs` test trên hàm closure tự chế, không test component React. | Không kiểm chứng được React hooks concurrency thực tế. |
| **10. Auth Middleware Integration Test** | **FAIL** | Các route test qua `loadModule` đều mock stub `requireApiUser` trả về actor trực tiếp. | Không test quá trình trích xuất cookie và xác thực session Supabase thật. |
| **11. Role Matrix Testing (RBAC)** | **PASS** | Đầy đủ ma trận vai trò (owner, manager, team_lead, employee, customer) trong `challenger-stress-suite`. | Đã chứng minh chặn đúng 401, 403 ở cấp server. |
| **12. Idempotency & Replay Testing** | **PASS** | Test lặp lại request cùng key (`Idempotency-Key`, `captureSessionId`, order replay) trả về kết quả nhất quán. | Module order và attendance xử lý replay rất chuẩn mực. |
| **13. Timezone Boundary Testing** | **PASS** | Đã test ranh giới 00:00 Việt Nam (`businessDate`), ranh giới chốt công cuối tháng. | Cần bổ sung ca làm việc đêm xuyên 00:00. |
| **14. Private Object Storage (R2) Fidelity** | **FAIL** | Toàn bộ tương tác R2 bucket được mock bằng JavaScript in-memory `Map`. | Không kiểm thử lỗi timeout R2, lỗi quyền truy cập R2 bucket, hay presigned URL. |
| **15. Auth Rate Limit / Brute Force Testing** | **FAIL** | Chỉ có rate limit cho `/api/order/create`; không có test rate limit cho đăng nhập hay quên mật khẩu. | Nguy cơ tấn công dò mật khẩu chưa được kiểm thử tự động. |

---

## 5. DANH SÁCH FINDINGS (P0 → P3)

```
========================================================================================
BẢNG TỔNG HỢP PHÁT HIỆN KIỂM TOÁN CHẤT LƯỢNG TEST (TEST QUALITY AUDIT FINDINGS)
========================================================================================
ID        MỨC ĐỘ   ĐỘ TIN CẬY   MODULE / FILE                                   TÊN PHÁT HIỆN
----------------------------------------------------------------------------------------
TEST-001  P0       CONFIRMED    tests/security-remediation-full.test.mjs        False Confidence do Mock D1 bằng Plain JS Object
TEST-002  P0       CONFIRMED    .github/workflows/check.yml                     Playwright E2E Test Suite bị loại bỏ hoàn toàn khỏi CI
TEST-003  P1       CONFIRMED    tests/rendered-html.test.mjs                    Kiểm thử UI hời hợt bằng Regex đọc mã nguồn tĩnh
TEST-004  P1       CONFIRMED    tests/concurrency-empirical-stress.test.mjs     False Concurrency do kiểm thử hàm giả lập thay vì React
TEST-005  P1       CONFIRMED    tests/helpers/load-module.mjs                   Route Loader mong manh & Che giấu tích hợp Auth Middleware
TEST-006  P2       CONFIRMED    tests/helpers/database.mjs                      Độ trung thực kém giữa SQLite In-Memory và Cloudflare D1
TEST-007  P2       CONFIRMED    tests/identity-security.test.mjs & lib/evidence Thiếu kiểm thử biên an toàn (Auth Brute Force & R2 Error)
TEST-008  P3       CONFIRMED    tests/seed-users-protection.test.mjs            Nguy cơ rò rỉ trạng thái môi trường process.env giữa các test
TEST-009  P3       CONFIRMED    playwright.config.ts                            Rủi ro Flaky và dính mã cứng cục bộ Windows trong E2E
========================================================================================
```

---

### TEST-001 | P0 | CONFIRMED | Storage & Audit Retention
- **File & Dòng liên quan:** [tests/security-remediation-full.test.mjs#L9-L100](file:///d:/College/Practice/loopicafe-management-system/tests/security-remediation-full.test.mjs#L9-L100) (`createMockD1()`)
- **Root cause:** Test tạo một đối tượng JavaScript tự chế `createMockD1()` với cơ chế xử lý SQL bằng string matching (`if (sql.includes("DELETE FROM attendance_photos")) ...`). Đối tượng này không sử dụng SQLite hay Miniflare D1 emulator.
- **Evidence:**
  ```javascript
  // tests/security-remediation-full.test.mjs (dòng 27-31)
  if (sql.includes("DELETE FROM attendance_photos")) {
    const eventId = args[0];
    const prev = tables.attendance_photos.length;
    tables.attendance_photos = tables.attendance_photos.filter((p) => p.event_id !== eventId);
    return { meta: { changes: prev - tables.attendance_photos.length } };
  }
  ```
- **Expected vs Actual Coverage:**
  - *Expected:* Logic hàm `expireEvidence()` phải chạy trên cơ sở dữ liệu D1/SQLite thực sự với schema và foreign keys hợp lệ để đảm bảo câu lệnh SQL đúng cú pháp và không vi phạm ràng buộc dữ liệu.
  - *Actual:* Câu lệnh SQL thực tế chưa từng được database engine nào biên dịch hay thực thi trong bài test này. Nếu câu lệnh SQL có lỗi cú pháp (ví dụ sai tên cột, lỗi kiểu dữ liệu), bài test vẫn trả về PASS 100%.
- **Business Impact:** Nguy cơ crash hệ sinh thái dữ liệu hoặc hỏng quy trình dọn dẹp ảnh nhạy cảm khi chạy cron job thật trên Cloudflare D1 production, gây vi phạm chính sách lưu trữ dữ liệu riêng tư (privacy SLA).
- **Proposed Remediation:** Thay thế `createMockD1()` trong file này bằng `createDatabase()` chuẩn từ `tests/helpers/database.mjs` với schema Drizzle đầy đủ.
- **Acceptance Criteria:** Toàn bộ test trong `security-remediation-full.test.mjs` chạy thành công trên SQLite thực tế mà không cần đối tượng mock giả lập.

---

### TEST-002 | P0 | CONFIRMED | CI Pipeline & Automated Regression
- **File & Dòng liên quan:** [.github/workflows/check.yml#L16-L17](file:///d:/College/Practice/loopicafe-management-system/.github/workflows/check.yml#L16-L17), [package.json#L15](file:///d:/College/Practice/loopicafe-management-system/package.json#L15)
- **Root cause:** File workflow GitHub Actions chỉ thực thi `npm run check` (`typecheck && lint && test && build`), không hề cấu hình chạy Playwright E2E (`npm run test:e2e`).
- **Evidence:**
  ```yaml
  # .github/workflows/check.yml
  - run: npm ci
  - run: npm run check  # Chỉ chạy unit test, build, lint, typecheck; THIẾU test:e2e!
  ```
  Trong khi đó, file `tests/e2e/auth.spec.ts` có cơ chế tự skip nếu không có local Supabase:
  ```typescript
  // tests/e2e/auth.spec.ts (dòng 73)
  test.skip(Boolean(fixtureUnavailable), fixtureUnavailable);
  ```
- **Expected vs Actual Coverage:**
  - *Expected:* CI pipeline phải tự động chạy ít nhất một bộ smoke E2E kiểm tra đăng nhập thực tế và luồng đặt món của khách hàng trên trình duyệt headless.
  - *Actual:* 0 bài test E2E nào được chạy trên CI. Mã nguồn có thể bị hỏng toàn bộ giao diện phía client nhưng GitHub Actions vẫn báo xanh (Green build).
- **Business Impact:** Khách hàng không thể đặt món hoặc nhân viên không thể đăng nhập sau khi release production do lỗi JavaScript trên trình duyệt (client-side runtime error) mà CI không phát hiện được.
- **Proposed Remediation:** Tạo một job riêng hoặc bổ sung bước chạy Playwright headless trong CI (`npx playwright install --with-deps chromium`, khởi chạy local runtime giả lập, và chạy `test:e2e`).
- **Acceptance Criteria:** Mọi Pull Request đều phải vượt qua ít nhất 2 bài test E2E cốt lõi (Auth login & Customer checkout) trước khi được merge.

---

### TEST-003 | P1 | CONFIRMED | Frontend UI Verification
- **File & Dòng liên quan:** [tests/rendered-html.test.mjs#L1-L149](file:///d:/College/Practice/loopicafe-management-system/tests/rendered-html.test.mjs#L1-L149), [tests/operational-ui-permissions.test.mjs#L147-L182](file:///d:/College/Practice/loopicafe-management-system/tests/operational-ui-permissions.test.mjs#L147-L182)
- **Root cause:** Các bài test mang danh nghĩa kiểm tra UI/HTML nhưng thực chất chỉ dùng `fs.readFile()` để lấy nội dung file `.tsx`/`.css` dạng text rồi kiểm tra regex string (`assert.match`).
- **Evidence:**
  ```javascript
  // tests/rendered-html.test.mjs (dòng 20-36)
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /LoopiCafe trong 10 giây/);
  assert.match(page, /controls/);
  assert.match(page, /playsInline/);
  
  // tests/operational-ui-permissions.test.mjs (dòng 150-156)
  const source = await readFile(new URL("../components/operational/owner-orders-view.tsx", import.meta.url), "utf8");
  assert.match(source, /ordersError,\s*setOrdersError/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
  ```
- **Expected vs Actual Coverage:**
  - *Expected:* Component phải được render bằng công cụ kiểm thử component (như React Testing Library / Playwright component testing) để xác minh DOM tree, trạng thái loading/error, và tương tác người dùng.
  - *Actual:* Test chỉ kiểm tra xem trong file text có các từ khóa mong muốn hay không. Nếu code bị comment out hoặc có lỗi cú pháp React render, test vẫn pass.
- **Business Impact:** Giao diện có thể bị vỡ layout, crash React error boundary, nhưng test suite vẫn xanh hoàn toàn, gây sai lệch nghiêm trọng về chất lượng UI thực tế.
- **Proposed Remediation:** Chuyển đổi các bài kiểm tra này thành Playwright component test hoặc integration browser test thật; loại bỏ cách assert bằng regex trên file text.
- **Acceptance Criteria:** Xóa bỏ assertion dạng đọc mã nguồn thô; thay bằng assertion kiểm tra sự tồn tại của element trên DOM thật.

---

### TEST-004 | P1 | CONFIRMED | UI Concurrency & Race Conditions
- **File & Dòng liên quan:** [tests/concurrency-empirical-stress.test.mjs#L12-L65](file:///d:/College/Practice/loopicafe-management-system/tests/concurrency-empirical-stress.test.mjs#L12-L65), [tests/concurrency-empirical-stress.test.mjs#L214-L256](file:///d:/College/Practice/loopicafe-management-system/tests/concurrency-empirical-stress.test.mjs#L214-L256)
- **Root cause:** Thay vì kiểm tra chính React component (`owner-orders-view.tsx`, `schedule-view.tsx`), file test tự định nghĩa lại toàn bộ logic polling và sequence ref bằng các hàm JavaScript độc lập (`createOrdersPollingHarness`, `createScheduleHarness`) rồi kiểm tra các hàm này.
- **Evidence:**
  ```javascript
  // tests/concurrency-empirical-stress.test.mjs (dòng 12-25)
  function createOrdersPollingHarness(fetchFn) {
    let orders = [];
    let loadingOrders = false;
    const ordersRequestIdRef = { current: 0 };
    // Toàn bộ logic chống race condition được viết lại trong file test!
    const fetchOrders = async (isPolling = false) => { ... };
    return { fetchOrders, getState: () => ({ ... }) };
  }
  ```
- **Expected vs Actual Coverage:**
  - *Expected:* Bài test phải kiểm tra component React thực tế xem khi có phản hồi mạng chậm/nhanh bất thường (out-of-order responses), component có hiển thị đúng trạng thái đơn hàng mới nhất hay không.
  - *Actual:* Bài test chỉ chứng minh rằng hàm harness do người viết test tự tạo hoạt động đúng; hoàn toàn không có sự liên quan hay ràng buộc thực tế nào với file `owner-orders-view.tsx`.
- **Business Impact:** Nếu logic trong `owner-orders-view.tsx` bị sửa đổi hoặc phát sinh lỗi do re-render của React, bài test này vẫn luôn luôn PASS vì nó chạy trên mã nguồn riêng của nó.
- **Proposed Remediation:** Tích hợp kiểm thử concurrency này vào Playwright E2E test bằng cách intercept network routes (`page.route()`) và làm chậm response có chủ đích để kiểm tra DOM của ứng dụng thật.
- **Acceptance Criteria:** Kiểm thử bất đồng bộ phải chạy trên browser context của ứng dụng thực tế.

---

### TEST-005 | P1 | CONFIRMED | Mock Infrastructure & Auth Middleware Gaps
- **File & Dòng liên quan:** [tests/helpers/load-module.mjs#L6-L22](file:///d:/College/Practice/loopicafe-management-system/tests/helpers/load-module.mjs#L6-L22), [tests/ordering-system.test.mjs#L32-L47](file:///d:/College/Practice/loopicafe-management-system/tests/ordering-system.test.mjs#L32-L47)
- **Root cause:** 
  1. `load-module.mjs` sử dụng regex thay thế chuỗi mã nguồn để chèn mock dependencies, dẫn đến sự mong manh và dễ gãy khi cú pháp import thay đổi.
  2. Sự thiếu nhất quán: `ordering-system.test.mjs` lại tự chế một loader riêng dùng `ts.transpileModule` và `new Function(...)`.
  3. Quan trọng nhất: Tất cả các route handler test đều mock stub hoàn toàn `@/server/auth` (`requireApiUser: async () => ({ actor })`).
- **Evidence:**
  ```javascript
  // tests/daily-checklists.test.mjs (dòng 21)
  "@/server/auth": { requireApiUser: async () => ({ actor }), auditStatement }
  
  // tests/incidents-handovers.test.mjs (dòng 33)
  "@/server/auth": { requireApiUser: async () => ({ actor }), auditStatement }
  ```
- **Expected vs Actual Coverage:**
  - *Expected:* Quá trình gọi API phải đi qua tầng middleware xác thực thật sự: đọc session cookie, kiểm tra token Supabase, đối soát trạng thái nhân viên (`active` vs `suspended`), kiểm tra chính sách bảo mật dữ liệu cá nhân (PII consent).
  - *Actual:* Tầng xác thực bị bypass hoàn toàn; test chỉ kiểm tra logic bên trong route sau khi đã có sẵn actor hợp lệ.
- **Business Impact:** Nếu có lỗ hổng trong logic parse session token hoặc kiểm tra quyền tài khoản bị đình chỉ ở server auth middleware, các bài unit test route này hoàn toàn không phát hiện được.
- **Proposed Remediation:** Tạo integration helper cho phép test route với raw cookies hoặc bearer headers thực tế, chạy qua hàm `requireApiUser()` thật sự kết hợp in-memory DB.
- **Acceptance Criteria:** Ít nhất 5 route cốt lõi được kiểm thử end-to-end từ tầng nhận diện Cookie/Token xuống Database mà không stub `requireApiUser`.

---

### TEST-006 | P2 | CONFIRMED | Database Emulator Fidelity (SQLite vs D1)
- **File & Dòng liên quan:** [tests/helpers/database.mjs#L1-L42](file:///d:/College/Practice/loopicafe-management-system/tests/helpers/database.mjs#L1-L42), [tests/d1-contract.test.mjs#L6-L28](file:///d:/College/Practice/loopicafe-management-system/tests/d1-contract.test.mjs#L6-L28)
- **Root cause:** 19/20 file unit test dùng `node:sqlite` in-memory. Khác biệt kỹ thuật giữa SQLite in-memory và Cloudflare D1 trên Workers:
  1. D1 `batch()` gửi mảng lệnh qua Worker binding RPC, có giới hạn kích thước và cơ chế trả về `D1Result` khác với Node SQLite `changes`.
  2. `DatabaseSync` trong Node.js là đơn luồng (synchronous single-threaded), nên các test case `Promise.all` không tái hiện được sự tranh chấp khóa thực sự (`SQLITE_BUSY`, write lock contention) trên D1.
  3. SQLite in-memory không có các tính năng đặc thù của Cloudflare Workers runtime (Miniflare environment).
- **Evidence:**
  ```javascript
  // tests/helpers/database.mjs (dòng 32-38)
  batch: async (statements) => {
    sqlite.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.execute());
      sqlite.exec("COMMIT");
      return results;
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  }
  ```
  Hàm batch này là giao dịch SQLite chuẩn, không phản ánh chính xác hành vi của Cloudflare D1 RPC Batch.
- **Expected vs Actual Coverage:**
  - *Expected:* Các luồng ghi song song phức tạp (như chốt sổ lương, phân ca tuần, tạo đơn hàng đồng thời) nên được kiểm chứng trên Miniflare D1 emulator.
  - *Actual:* 95% test chạy trên SQLite in-memory. Chỉ có 1 test chạy trên Miniflare nhưng lại dùng bảng tự tạo thay vì schema thật.
- **Business Impact:** Rủi ro phát sinh lỗi không tương thích D1 khi triển khai Cloudflare Workers production, đặc biệt là khi xảy ra nhiều giao dịch ghi đồng thời.
- **Proposed Remediation:** Cung cấp tùy chọn chạy test suite với Miniflare D1 runtime trong CI định kỳ hàng tuần.
- **Acceptance Criteria:** Chạy thành công toàn bộ migration chain Drizzle trên Miniflare D1 database emulator.

---

### TEST-007 | P2 | CONFIRMED | Negative Testing & Security Boundary Gaps
- **File & Dòng liên quan:** [tests/identity-security.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/identity-security.test.mjs), [tests/evidence.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/evidence.test.mjs), [tests/workforce-integrity.test.mjs](file:///d:/College/Practice/loopicafe-management-system/tests/workforce-integrity.test.mjs)
- **Root cause:** Thiếu các ca kiểm thử biên tiêu cực (Negative / Adversarial test cases) cho các kịch bản thực tế:
  1. **Brute Force Protection:** Không có test kiểm tra rate limit khi đăng nhập thất bại liên tiếp hoặc gửi OTP spam.
  2. **R2 Storage Failures:** Tương tác R2 private storage lưu ảnh chấm công được mock hoàn toàn bằng JS Map; không có test kịch bản R2 trả về 500, lỗi timeout hoặc bucket credentials bị từ chối giữa chừng lúc upload ảnh SVG.
  3. **Ca làm việc đêm (Overnight shift crossing 00:00 VN):** `workforce-integrity.test.mjs` có test ca qua ranh giới tháng (31/07 sang 01/08), nhưng chưa có test chi tiết cho ca làm việc từ 22:00 hôm trước đến 06:00 hôm sau về mặt tính công và phân bổ ngày checklist.
- **Expected vs Actual Coverage:**
  - *Expected:* Phải có test tự động kiểm tra việc khóa tài khoản/rate limit khi bị tấn công brute force, và xử lý graceful degradation khi Cloudflare R2 bucket gặp sự cố.
  - *Actual:* Các kịch bản này hiện chưa có test case nào kiểm tra.
- **Business Impact:** Khi Cloudflare R2 gặp sự cố gián đoạn hoặc bị tấn công brute force, hệ thống có thể rơi vào trạng thái unhandled exception hoặc bị quá tải.
- **Proposed Remediation:** Viết bổ sung các bài test negative mô phỏng lỗi R2 network failure và kiểm thử ngưỡng rate limit của Auth API.
- **Acceptance Criteria:** Bổ sung tối thiểu 3 test cases: R2 network error handling, Auth brute-force throttling, và ca làm việc xuyên nửa đêm (22:00 - 06:00).

---

### TEST-008 | P3 | CONFIRMED | Test Isolation / Env State Leakage
- **File & Dòng liên quan:** [tests/seed-users-protection.test.mjs#L15-L42](file:///d:/College/Practice/loopicafe-management-system/tests/seed-users-protection.test.mjs#L15-L42), [tests/identity-security.test.mjs#L29-L32](file:///d:/College/Practice/loopicafe-management-system/tests/identity-security.test.mjs#L29-L32)
- **Root cause:** Các bài test trực tiếp gán đè `process.env.NODE_ENV = "production"` hoặc `process.env.ALLOW_DEMO_AUTH = "false"`.
- **Evidence:**
  ```javascript
  // tests/seed-users-protection.test.mjs (dòng 18-26)
  process.env.NODE_ENV = "production";
  // ...
  process.env.NODE_ENV = "development";
  ```
- **Expected vs Actual Coverage:**
  - *Expected:* Môi trường biến `process.env` phải được bảo vệ bằng helper snapshot/restore tự động trong `beforeEach`/`afterEach`, đảm bảo nếu một test case bị crash đột ngột (throw error trước khối restore), các test case tiếp theo không bị nhiễm trạng thái môi trường sai.
  - *Actual:* Việc restore phụ thuộc vào khối `finally` thủ công rải rác trong từng bài test.
- **Business Impact:** Khả năng gây flaky test chéo giữa các bài test chạy cùng một Node process khi có một assertion bất ngờ fail.
- **Proposed Remediation:** Đóng gói helper `withEnv(overrides, async () => { ... })` đảm bảo luôn khôi phục `process.env` an toàn tuyệt đối.
- **Acceptance Criteria:** Không có lệnh gán trực tiếp `process.env.X = Y` nằm trần ngoài helper an toàn.

---

### TEST-009 | P3 | CONFIRMED | E2E Configuration & Windows Environment Coupling
- **File & Dòng liên quan:** [playwright.config.ts#L11-L15](file:///d:/College/Practice/loopicafe-management-system/playwright.config.ts#L11-L15)
- **Root cause:** 
  1. File cấu hình Playwright có dòng kiểm tra đường dẫn file Edge trên Windows: `existsSync("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe")`.
  2. Cấu hình port tĩnh `http://127.0.0.1:4173` và `reuseExistingServer: true`.
  3. Cấu hình `retries: 0` khiến bất kỳ độ trễ khởi động mạng cục bộ nào cũng làm fail toàn bộ suite.
- **Evidence:**
  ```typescript
  // playwright.config.ts (dòng 12)
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], ...(existsSync("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe") ? { channel: "msedge" } : {}) } }]
  ```
- **Expected vs Actual Coverage:**
  - *Expected:* Cấu hình E2E phải hoàn toàn độc lập với hệ điều hành của lập trình viên, ưu tiên sử dụng Chromium chuẩn của Playwright để chạy nhất quán trên cả Linux (CI) và Windows/macOS.
  - *Actual:* Cấu hình bị gắn chặt với đường dẫn cài đặt phần mềm cục bộ của Windows.
- **Business Impact:** Khó khăn khi thiết lập CI/CD trên nền tảng Linux (Ubuntu GitHub Actions Runner), nguy cơ xung đột port hoặc chạy nhầm server cũ còn sót lại.
- **Proposed Remediation:** Chuẩn hóa `playwright.config.ts` để sử dụng kênh `chromium` mặc định, đặt `retries: 1` khi chạy CI, và hỗ trợ dynamic port.
- **Acceptance Criteria:** `npx playwright test` chạy mượt mà trên môi trường Ubuntu Linux mà không phụ thuộc vào Microsoft Edge.

---

## 6. PRIORITY TEST MATRIX (BỘ KIỂM THỬ TỐI THIỂU CHO CI)

Để đảm bảo an toàn tuyệt đối trước khi release (Zero-Regression Policy), hệ thống CI phải duy trì và thực thi nghiêm ngặt 3 tầng kiểm thử sau:

```
===================================================================================================
PRIORITY TEST MATRIX — BỘ KIỂM THỬ TỐI THIỂU (MINIMUM SMOKE SUITE CHO CI)
===================================================================================================
TẦNG         MODULE / SUITE                            TIÊU CHÍ BẮT BUỘC TRONG CI        THỜI GIAN
---------------------------------------------------------------------------------------------------
TẦNG 1       1. architecture-boundaries.test.mjs       Bảo đảm migration journal,         < 1.0s
(Kiến trúc & 2. platform-compat.test.mjs               ràng buộc Clean Architecture,
Nền tảng)    3. d1-contract.test.mjs                   và cross-platform packages.
---------------------------------------------------------------------------------------------------
TẦNG 2       4. ordering-system.test.mjs               Toàn vẹn giá bán, chống duplicate  < 4.0s
(Nghiệp vụ   5. workforce-integrity.test.mjs           order, tính lương chuẩn xác,
Cốt lõi)     6. business-logic-verification.test.mjs   state machine sự cố/bàn giao,
             7. adversarial-seed-users.test.mjs        và chặn đứng seed users trong prod.
---------------------------------------------------------------------------------------------------
TẦNG 3       8. e2e/auth.spec.ts (Headless)            Xác minh luồng Login thật,         < 25.0s
(E2E Smoke   9. e2e/order.spec.ts (Headless)           Session cookie, phân quyền RBAC
Giao diện)                                             và luồng khách đặt hàng trên browser.
===================================================================================================
TỔNG CỘNG SMOKE SUITE: 9 SUITES CỐT LÕI — THỜI GIAN DỰ KIẾN TRÊN CI: ~30 GIÂY
===================================================================================================
```

---

## 7. KẾT QUẢ KIỂM THỬ THỰC TẾ ĐÃ THỰC THI (VERIFIED RUN LOGS)

Trong phiên kiểm toán này, kiểm toán viên đã trực tiếp thực thi các lệnh kiểm thử độc lập và ghi nhận kết quả trung thực như sau:

### Lệnh 1: Chạy toàn bộ Unit / Integration Test Suite
```bash
cmd.exe /c "npm test"
# Lệnh thực thi: node --experimental-strip-types --test tests/*.test.mjs
```
- **Trạng thái:** `EXIT CODE 0 (PASS)`
- **Tổng số test cases:** `128 tests`
- **Kết quả chi tiết:** `128 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo`
- **Thời gian thực thi:** `7,080.92 ms (~7.08s)`
- **Ghi chú cảnh báo:**
  - `(node) ExperimentalWarning: stripTypeScriptTypes is an experimental feature`
  - `(node) ExperimentalWarning: SQLite is an experimental feature`

### Lệnh 2: Kiểm tra kiểu tĩnh (Static Typecheck)
```bash
cmd.exe /c "npm run typecheck"
# Lệnh thực thi: npm run types:generate && tsc --noEmit --incremental false
```
- **Trạng thái:** `EXIT CODE 0 (PASS)`
- **Kết quả:** Wrangler tạo runtime types thành công cho Cloudflare Workers, TypeScript biên dịch sạch sẽ không có lỗi type.

### Lệnh 3: Kiểm tra chuẩn mã nguồn (ESLint)
```bash
cmd.exe /c "npm run lint"
# Lệnh thực thi: eslint . --ignore-pattern dist --ignore-pattern .next
```
- **Trạng thái:** `EXIT CODE 0 (PASS)`
- **Kết quả:** Không có vi phạm eslint trong toàn bộ source tree.

### Lệnh 4: Kiểm tra trạng thái Git Baseline
```bash
git rev-parse HEAD
```
- **Kết quả:** `05e7719dc8ae824a833c6d4b3c8fa21c3d3e56c1`
- **Cam kết:** Toàn bộ file mã nguồn và test suite được giữ nguyên trạng thái Read-Only.

---

## 8. LỘ TRÌNH VÀ KẾ HOẠCH HÀNH ĐỘNG KHẮC PHỤC (ACTIONABLE TASKS)

### Giai đoạn 1: Khắc phục khẩn cấp (Ưu tiên P0 - Trong 24-48 giờ tới)
- [ ] **TASK-TEST-01 (Sửa TEST-002):** Cập nhật `.github/workflows/check.yml` bổ sung job chạy Playwright E2E headless với Chromium runner. Thiết lập mock local auth readiness để test E2E không bị skip trên CI.
- [ ] **TASK-TEST-02 (Sửa TEST-001):** Tái cấu trúc file `tests/security-remediation-full.test.mjs`, loại bỏ hàm `createMockD1()` và thay thế bằng `createDatabase()` SQLite thật sự, xác minh tính toàn vẹn của retention cleanup và audit logging.

### Giai đoạn 2: Cải tiến độ trung thực kiểm thử (Ưu tiên P1 - Trong Sprint tiếp theo)
- [ ] **TASK-TEST-03 (Sửa TEST-003):** Xóa bỏ các bài test dùng regex quét text trong `tests/rendered-html.test.mjs` và `operational-ui-permissions.test.mjs`. Thay bằng Playwright component testing hoặc E2E assertions thật.
- [ ] **TASK-TEST-04 (Sửa TEST-004):** Thay thế các hàm harness giả lập trong `concurrency-empirical-stress.test.mjs` bằng bài test browser thực tế có giả lập mạng chậm qua `page.route()`.
- [ ] **TASK-TEST-05 (Sửa TEST-005):** Chuẩn hóa một helper nạp module API route duy nhất, loại bỏ việc mock đè thô bạo `requireApiUser` để tích hợp kiểm tra session/auth middleware.

### Giai đoạn 3: Tối ưu hóa & Hoàn thiện ranh giới (Ưu tiên P2/P3)
- [ ] **TASK-TEST-06 (Sửa TEST-006 & TEST-007):** Bổ sung test cases cho ca làm việc xuyên đêm (22:00 - 06:00), kịch bản lỗi R2 storage network failure, và brute-force authentication.
- [ ] **TASK-TEST-07 (Sửa TEST-008 & TEST-009):** Chuẩn hóa `playwright.config.ts` loại bỏ path Microsoft Edge trên Windows, thêm helper `withEnv` bảo vệ biến môi trường.

---

*Báo cáo được lập độc quyền bởi **AGENT 5 — TEST QUALITY AUDITOR** theo đúng quy định `AGENTS.md` và `00_COMMON_RULES.md`.*
