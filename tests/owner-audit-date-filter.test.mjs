import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";
import { loadModule } from "./helpers/load-module.mjs";
import { auditStatement } from "../server/audit.ts";

function fixture(t) {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const actor = seedEmployee(db, { id: "owner-a", email: "owner-a@example.test", role: "owner", storeId: "store-a" });
  return { db, actor };
}

async function actual(t, path, dependencies) {
  const loaded = await loadModule(path, dependencies);
  t.after(loaded.dispose);
  return loaded.module;
}

test("owner audit route supports date parameter and returns events for that date in Vietnam timezone", async (t) => {
  const { db, actor } = fixture(t);
  seedStore(db, "store-b");
  const otherActor = seedEmployee(db, { id: "owner-b", email: "owner-b@example.test", role: "owner", storeId: "store-b" });

  // Event 1: ngày 2026-10-26 lúc 09:00:00 VN (UTC+7 -> 02:00:00Z)
  await auditStatement(db, actor.email, "store", "event-1", "store.updated", { note: "Today event" }, "2026-10-26T02:00:00.000Z", false, "ev-1", "store-a").run();

  // Event 2: ngày 2026-10-26 lúc 23:30:00 VN (UTC+7 -> 16:30:00Z)
  await auditStatement(db, actor.email, "shift", "event-2", "shift.published", { note: "Late today event" }, "2026-10-26T16:30:00.000Z", false, "ev-2", "store-a").run();

  // Event 3: ngày 2026-10-25 lúc 15:00:00 VN (UTC+7 -> 08:00:00Z)
  await auditStatement(db, actor.email, "attendance", "event-3", "attendance.check_in", { note: "Yesterday event" }, "2026-10-25T08:00:00.000Z", false, "ev-3", "store-a").run();

  // Event 4: ngày 2026-10-26 nhưng ở store-b
  await auditStatement(db, otherActor.email, "store", "event-4", "store.updated", { note: "Other store event" }, "2026-10-26T02:00:00.000Z", false, "ev-4", "store-b").run();

  const route = await actual(t, "../../app/api/audit/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor }) },
  });

  // Test 1: Lọc theo ngày 2026-10-26
  const reqToday = new Request("https://local.test/api/audit?date=2026-10-26");
  const resToday = await route.GET(reqToday);
  const dataToday = await resToday.json();
  assert.equal(dataToday.events.length, 2);
  assert.deepEqual(dataToday.events.map((e) => e.id), ["ev-2", "ev-1"]);

  // Test 2: Lọc theo ngày 2026-10-25
  const reqYesterday = new Request("https://local.test/api/audit?date=2026-10-25");
  const resYesterday = await route.GET(reqYesterday);
  const dataYesterday = await resYesterday.json();
  assert.equal(dataYesterday.events.length, 1);
  assert.equal(dataYesterday.events[0].id, "ev-3");

  // Test 3: Lọc ngày không có hoạt động
  const reqEmpty = new Request("https://local.test/api/audit?date=2026-10-20");
  const resEmpty = await route.GET(reqEmpty);
  const dataEmpty = await resEmpty.json();
  assert.equal(dataEmpty.events.length, 0);

  // Test 4: Lọc theo dải ngày from / to
  const reqRange = new Request("https://local.test/api/audit?from=2026-10-25&to=2026-10-26");
  const resRange = await route.GET(reqRange);
  const dataRange = await resRange.json();
  assert.equal(dataRange.events.length, 3);
  assert.deepEqual(dataRange.events.map((e) => e.id), ["ev-2", "ev-1", "ev-3"]);

  // Test 5: Không truyền query params -> trả về tất cả của store-a (default LIMIT 200)
  const reqAll = new Request("https://local.test/api/audit");
  const resAll = await route.GET(reqAll);
  const dataAll = await resAll.json();
  assert.equal(dataAll.events.length, 3);
});
