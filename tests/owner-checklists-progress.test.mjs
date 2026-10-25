import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, seedStore, seedEmployee, seedShift } from "./helpers/database.mjs";
import { loadModule } from "./helpers/load-module.mjs";
import { auditStatement } from "../server/audit.ts";
import { apiHandler } from "../platform/http/errors.ts";
import { readObject } from "../platform/http/input.ts";
import { businessDate } from "../modules/operations/domain/business-day.ts";

test("Owner observes checklist progress and specific completion details for all shifts", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");

  // Owner actor (has no current shift)
  const owner = seedEmployee(db, {
    id: "owner-1",
    storeId: "store-a",
    role: "owner",
    email: "owner@loopicafe.test",
    displayName: "Chủ Quán Cà Phê",
  });

  // Staff A (Morning shift)
  const staffA = seedEmployee(db, {
    id: "staff-a",
    storeId: "store-a",
    role: "employee",
    email: "barista-a@loopicafe.test",
    displayName: "Nguyễn Văn Barista",
  });

  // Staff B (Evening shift)
  const staffB = seedEmployee(db, {
    id: "staff-b",
    storeId: "store-a",
    role: "employee",
    email: "cashier-b@loopicafe.test",
    displayName: "Trần Thị Thu Ngân",
  });

  const now = new Date();
  const startsAtA = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const endsAtA = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
  const startsAtB = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
  const endsAtB = new Date(now.getTime() + 10 * 60 * 60 * 1000).toISOString();

  const shiftMorning = seedShift(db, {
    id: "shift-morning-1",
    storeId: "store-a",
    employeeEmail: staffA.email,
    startsAt: startsAtA,
    endsAt: endsAtA,
    roleLabel: "Pha chế sáng",
  });

  const shiftEvening = seedShift(db, {
    id: "shift-evening-1",
    storeId: "store-a",
    employeeEmail: staffB.email,
    startsAt: startsAtB,
    endsAt: endsAtB,
    roleLabel: "Thu ngân tối",
  });

  let currentActor = owner;

  const loaded = await loadModule("../../app/api/checklists/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": {
      requireApiUser: async () => ({ actor: currentActor }),
      requireApiPermission: async () => {
        if (currentActor.role === "owner" || perm === "checklists.manage") {
          return { actor: currentActor };
        }
        return { response: new Response("Forbidden", { status: 403 }) };
      },
      auditStatement,
    },
    "@/modules/operations/domain/business-day": { businessDate },
    "@/modules/people/domain/permissions": {
      hasGrantedPermission: (actor) => actor.role === "owner" || actor.role === "manager",
    },
    "@/platform/http/errors": { apiHandler },
    "@/platform/http/input": { readObject },
  });
  t.after(loaded.dispose);
  const route = loaded.module;

  const request = (url, method, body) =>
    new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

  // 1. Owner creates a daily routine item and two shift routine items
  const resDaily = await route.POST(
    request("http://localhost/api/checklists", "POST", {
      label: "Kiểm tra nhiệt độ tủ mát bánh",
      assignee: "Ca sáng (Mở cửa)",
      required: true,
      routineType: "daily_routine",
    })
  );
  assert.equal(resDaily.status, 200);
  const { item: dailyItem } = await resDaily.json();

  const resShiftA = await route.POST(
    request("http://localhost/api/checklists", "POST", {
      label: "Cân chỉnh hạt cà phê Espresso Blend",
      required: true,
      routineType: "shift_routine",
      shiftId: shiftMorning.id,
    })
  );
  assert.equal(resShiftA.status, 200);
  const { item: shiftItemA } = await resShiftA.json();

  const resShiftB = await route.POST(
    request("http://localhost/api/checklists", "POST", {
      label: "Kiểm đếm tiền két đầu ca tối",
      required: false,
      routineType: "shift_routine",
      shiftId: shiftEvening.id,
    })
  );
  assert.equal(resShiftB.status, 200);
  const { item: shiftItemB } = await resShiftB.json();

  // 2. Staff A completes their shift item
  currentActor = staffA;
  const toggleResA = await route.PATCH(
    request("http://localhost/api/checklists", "PATCH", {
      id: shiftItemA.id,
      completed: true,
    })
  );
  assert.equal(toggleResA.status, 200);
  const toggleJsonA = await toggleResA.json();
  assert.equal(toggleJsonA.completed, true);
  assert.equal(toggleJsonA.completedBy, staffA.email);
  assert.equal(toggleJsonA.completedByName, staffA.displayName);
  assert.ok(toggleJsonA.completedAt);

  // 3. Staff A completes the daily item
  const toggleResDaily = await route.PATCH(
    request("http://localhost/api/checklists", "PATCH", {
      id: dailyItem.id,
      completed: true,
    })
  );
  assert.equal(toggleResDaily.status, 200);
  const toggleJsonDaily = await toggleResDaily.json();
  assert.equal(toggleJsonDaily.completed, true);
  assert.equal(toggleJsonDaily.completedBy, staffA.email);

  // 4. Owner queries GET /api/checklists (even though owner is not in any shift)
  currentActor = owner;
  const ownerGetRes = await route.GET(new Request("http://localhost/api/checklists"));
  assert.equal(ownerGetRes.status, 200);
  const ownerData = await ownerGetRes.json();

  // Owner should see canManage: true
  assert.equal(ownerData.canManage, true);
  // Owner sees shifts list
  assert.equal(ownerData.shifts.length, 2);

  // Owner sees ALL items: daily item + shift A + shift B!
  const ownerItems = ownerData.items;
  assert.equal(ownerItems.length, 3, "Owner must see daily tasks and all active shifts tasks");

  // Verify specific completion details for completed shift item
  const itemA = ownerItems.find((i) => i.id === shiftItemA.id);
  assert.ok(itemA, "Shift A item must be visible to owner");
  assert.equal(itemA.completed, 1);
  assert.equal(itemA.completed_by, staffA.email);
  assert.equal(itemA.completed_by_name, staffA.displayName, "Must show display name of employee who completed it");
  assert.ok(itemA.completed_at, "Must have completion timestamp");
  assert.equal(itemA.shift_employee_name, staffA.displayName);
  assert.equal(itemA.shift_role_label, "Pha chế sáng");

  // Verify specific completion details for daily item
  const dailyInOwner = ownerItems.find((i) => i.id === dailyItem.id);
  assert.ok(dailyInOwner);
  assert.equal(dailyInOwner.completed, 1);
  assert.equal(dailyInOwner.completed_by, staffA.email);
  assert.equal(dailyInOwner.completed_by_name, staffA.displayName);

  // Verify incomplete shift B item
  const itemB = ownerItems.find((i) => i.id === shiftItemB.id);
  assert.ok(itemB, "Shift B item must be visible to owner");
  assert.equal(itemB.completed, 0, "Shift B item should still be incomplete");
  assert.equal(itemB.shift_employee_name, staffB.displayName);
  assert.equal(itemB.shift_role_label, "Thu ngân tối");

  // 5. Query with shiftId filter: owner inspects shift A specifically
  const filterResA = await route.GET(new Request(`http://localhost/api/checklists?shiftId=${shiftMorning.id}`));
  const filterDataA = await filterResA.json();
  // Filtered to shift A + daily items
  const shiftItemsOnlyA = filterDataA.items.filter((i) => i.routine_type === "shift_routine");
  assert.equal(shiftItemsOnlyA.length, 1);
  assert.equal(shiftItemsOnlyA[0].id, shiftItemA.id);

  // 6. Verify isolation for regular staff (Staff B)
  currentActor = staffB;
  const staffBGetRes = await route.GET(new Request("http://localhost/api/checklists"));
  const staffBData = await staffBGetRes.json();
  assert.equal(staffBData.canManage, false);
  // Staff B only sees daily items + their own shift items (shift B), NOT shift A items!
  const staffBShiftItems = staffBData.items.filter((i) => i.routine_type === "shift_routine");
  // Staff B's current shift at current time: shift B starts in 4 hours, which is within window
  assert.ok(
    !staffBShiftItems.some((i) => i.shift_id === shiftMorning.id),
    "Staff B must not see Staff A's shift checklist"
  );

  // 7. A finished shift stays in history only: it is excluded from active counts and cannot be changed.
  const finishedShift = seedShift(db, {
    id: "shift-finished-1",
    storeId: "store-a",
    employeeEmail: staffB.email,
    startsAt: new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString(),
    endsAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    roleLabel: "Thu ngân ca cũ",
  });
  db.sqlite.prepare(
    `INSERT INTO checklist_items
      (id, store_id, label, assignee, routine_type, shift_id, required, completed, updated_at)
     VALUES (?, ?, ?, ?, 'shift_routine', ?, 1, 0, ?)`,
  ).run(
    "finished-shift-item",
    "store-a",
    "Đối soát checklist ca cũ",
    "Thu ngân ca cũ",
    finishedShift.id,
    now.toISOString(),
  );

  currentActor = staffB;
  const scopedStaffData = await (
    await route.GET(new Request("http://localhost/api/checklists"))
  ).json();
  const scopedStaffShiftItems = scopedStaffData.items.filter((item) => item.routine_type === "shift_routine");
  assert.deepEqual(
    scopedStaffShiftItems.map((item) => item.shift_id),
    [shiftEvening.id],
    "Staff count must include only the assigned current/upcoming shift",
  );

  const finishedToggle = await route.PATCH(
    request("http://localhost/api/checklists", "PATCH", {
      id: "finished-shift-item",
      completed: true,
    }),
  );
  assert.equal(finishedToggle.status, 409);
  assert.equal((await finishedToggle.json()).code, "shift_ended");
  assert.equal(
    db.sqlite.prepare("SELECT COUNT(*) AS count FROM checklist_executions WHERE item_id = ?").get("finished-shift-item").count,
    0,
    "Finished shift mutation must not write an execution",
  );

  currentActor = owner;
  const ownerAfterFinishedShift = await (
    await route.GET(new Request("http://localhost/api/checklists"))
  ).json();
  assert.ok(!ownerAfterFinishedShift.shifts.some((shift) => shift.id === finishedShift.id));
  assert.ok(!ownerAfterFinishedShift.items.some((item) => item.id === "finished-shift-item"));

  const createForFinishedShift = await route.POST(
    request("http://localhost/api/checklists", "POST", {
      label: "Không được tạo cho ca cũ",
      routineType: "shift_routine",
      shiftId: finishedShift.id,
      required: true,
    }),
  );
  assert.equal(createForFinishedShift.status, 409);
  assert.equal((await createForFinishedShift.json()).code, "shift_ended");
});

test("Today snapshot counts only the assigned current or upcoming shift", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const staff = seedEmployee(db, {
    id: "staff-today",
    storeId: "store-a",
    role: "employee",
    email: "today@loopicafe.test",
    displayName: "Nhân viên hôm nay",
  });
  const now = new Date();
  const finishedShift = seedShift(db, {
    id: "today-finished",
    storeId: "store-a",
    employeeEmail: staff.email,
    startsAt: new Date(now.getTime() - 7 * 60 * 60 * 1000).toISOString(),
    endsAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    roleLabel: "Ca đã kết thúc",
  });
  const upcomingShift = seedShift(db, {
    id: "today-upcoming",
    storeId: "store-a",
    employeeEmail: staff.email,
    startsAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    endsAt: new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString(),
    roleLabel: "Ca sắp tới",
  });
  const insertItem = db.sqlite.prepare(
    `INSERT INTO checklist_items
      (id, store_id, label, assignee, routine_type, shift_id, required, completed, updated_at)
     VALUES (?, 'store-a', ?, ?, ?, ?, 1, 0, ?)`,
  );
  insertItem.run("today-daily", "Việc chung", "Trong ngày", "daily_routine", null, now.toISOString());
  insertItem.run("today-old", "Việc ca cũ", "Ca đã kết thúc", "shift_routine", finishedShift.id, now.toISOString());
  insertItem.run("today-assigned", "Việc ca được giao", "Ca sắp tới", "shift_routine", upcomingShift.id, now.toISOString());

  const loaded = await loadModule("../../app/api/today/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor: staff }) },
    "@/modules/operations/domain/business-day": { businessDate },
    "@/platform/http/errors": { apiHandler },
  });
  t.after(loaded.dispose);

  const response = await loaded.module.GET();
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.checklist, { total: 2, done: 0 });
});
