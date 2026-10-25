import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createDatabase, seedStore } from "./helpers/database.mjs";
import { createOrder } from "../modules/ordering/application/create-order.ts";
import { trackOrder } from "../modules/ordering/application/track-order.ts";
import { changeOrderStatus, advanceOrderStatusPipeline, getSpoilageMetrics, getWastageReport } from "../modules/ordering/application/change-status.ts";
import { importMenuItems } from "../modules/ordering/application/import-menu.ts";
import { hasGrantedPermission } from "../modules/people/domain/permissions.ts";
import { limitOrderRequests } from "../modules/ordering/application/rate-limit.ts";
import * as input from "../modules/ordering/application/input.ts";
import * as errors from "../platform/http/errors.ts";
import * as audit from "../server/audit.ts";

const receipt = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
const payload = (item = {}) => ({ customerName: "Test Customer", customerPhone: "0901234567", customerNote: "Private note", expectedTotal: 112000,
  items: [{ itemId: "tea", quantity: 2, sizeId: "large", sugarId: "half", iceId: "normal", toppingIds: ["pearl"], note: "Less ice", ...item }] });
const actor = { storeId: "store-test", email: "manager@example.test", role: "manager" };
function fixture(t) {
  const db = createDatabase(); t.after(() => db.close()); seedStore(db, "store-test"); seedStore(db, "store-other");
  const now = "2026-09-17T00:00:00.000Z";
  db.sqlite.prepare("INSERT INTO store_ordering_settings (id, store_id, is_ordering_open, updated_at) VALUES ('settings', 'store-test', 1, ?)").run(now);
  db.sqlite.prepare("INSERT INTO menu_categories (id, store_id, name, created_at, updated_at) VALUES ('cat', 'store-test', 'Tea', ?, ?), ('other-cat', 'store-other', 'Other', ?, ?)").run(now,now,now,now);
  db.sqlite.prepare("INSERT INTO menu_items (id, store_id, category_id, name, base_price, image_url, created_at, updated_at) VALUES ('tea', 'store-test', 'cat', 'Canonical Tea', 45000, '/tea.jpg', ?, ?)").run(now,now);
  for (const [id, group, price] of [["large","size",6000],["half","sugar",0],["normal","ice",0],["pearl","topping",5000],["foreign","topping",1]]) {
    db.sqlite.prepare("INSERT INTO menu_options (id, store_id, group_type, name, price_modifier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, id === "foreign" ? "store-other" : "store-test", group, id, price, now, now);
  }
  return db;
}
async function place(db, body=payload(), key=crypto.randomUUID(), token=receipt()) {
  return { ...await createOrder(db,"store-test",body,key,token), key, token };
}
function route(path, db, currentActor=actor) {
  const requireApiUser = async roles => currentActor ? !roles || roles.includes(currentActor.role)
    ? {actor:currentActor} : {response:Response.json({error:"forbidden"},{status:403})}
    : {response:Response.json({error:"unauthorized"},{status:401})};
  const dependencies = {
    "@/db/runtime": { ensureDatabase: async()=>db, STORE_ID: "store-test" },
    "@/server/auth": { requireApiUser, requireApiPermission: async permission => {
      const auth = await requireApiUser();
      if (!auth.actor || auth.response) return auth;
      return hasGrantedPermission(auth.actor, permission) ? auth : { response: Response.json({ error: "permission_denied" }, { status: 403 }) };
    } },
    "@/platform/http/errors":errors, "@/server/audit":audit,
    "@/modules/ordering/application/create-order":{createOrder}, "@/modules/ordering/application/track-order":{trackOrder},
    "@/modules/ordering/application/change-status":{changeOrderStatus}, "@/modules/ordering/application/rate-limit":{limitOrderRequests},
    "@/modules/ordering/application/import-menu":{importMenuItems},
    "@/modules/ordering/application/input":input,
  };
  const code=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};
  new Function("exports","require",code)(exports,name=>{ assert.ok(dependencies[name],`Unexpected import ${name}`);return dependencies[name]; });
  return exports;
}
const request = (body, headers={}) => new Request("http://localhost/api/order/create",{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)});

test("actual checkout derives names, base price, size and topping amounts from current menu",async t=>{
  const db=fixture(t); const result=await place(db,payload({price:1,name:"Forged",toppings:[{name:"fake",price:0}]}));
  assert.equal(result.order.totalAmount,112000);
  const item=db.sqlite.prepare("SELECT * FROM order_items").get();
  assert.equal(item.item_name,"Canonical Tea");assert.equal(item.unit_price,56000);assert.equal(item.size_label,"large");
  assert.deepEqual(JSON.parse(item.toppings_json),[{name:"pearl",price:5000}]);
});

test("checkout rejects a stale displayed total and reports the current server total", async t => {
  const db = fixture(t);
  await assert.rejects(
    place(db, { ...payload(), expectedTotal: 1 }),
    (error) => error?.code === "price_changed" && error?.details?.currentTotal === 112000,
  );
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM customer_orders").get().n, 0);
});

test("rejects unknown/sold-out/inactive-category items and invalid or unavailable options",async t=>{
  const db=fixture(t);
  for(const change of [{itemId:"unknown"},{sizeId:"pearl"},{toppingIds:["foreign"]},{toppingIds:["pearl","pearl"]}]) await assert.rejects(place(db,payload(change)));
  db.sqlite.prepare("UPDATE menu_options SET is_available=0 WHERE id='large'").run();await assert.rejects(place(db),{code:"option_unavailable"});
  db.sqlite.prepare("UPDATE menu_options SET is_available=1 WHERE id='large'").run();
  db.sqlite.prepare("UPDATE menu_items SET allows_size=0 WHERE id='tea'").run();await assert.rejects(place(db),{code:"option_unavailable"});
  db.sqlite.prepare("UPDATE menu_items SET allows_size=1, is_available=0 WHERE id='tea'").run();await assert.rejects(place(db),{code:"item_unavailable"});
  db.sqlite.prepare("UPDATE menu_items SET is_available=1 WHERE id='tea'").run();
  db.sqlite.prepare("UPDATE menu_categories SET is_active=0 WHERE id='cat'").run();await assert.rejects(place(db),{code:"item_unavailable"});
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM customer_orders").get().n,0);
});

test("invalid quantities and malformed bounded input never silently normalize into orders",async t=>{
  const db=fixture(t);
  for(const quantity of [0,-1,1.5,21,"2",null]) await assert.rejects(place(db,payload({quantity})),{status:400});
  for(const body of [null,[],{...payload(),customerName:42},{...payload(),customerPhone:"abc"},{...payload(),customerNote:"x".repeat(501)},{...payload(),items:Array(31).fill(payload().items[0])}]) await assert.rejects(place(db,body),{status:400});
});

test("receipt is hashed, private to one order, store scoped, with no phone history expansion",async t=>{
  const db=fixture(t); const a=await place(db);await place(db);
  const tracked=await trackOrder(db,"store-test",a.token);
  assert.equal(tracked.order.id,a.order.id);assert.equal(tracked.orders,undefined);
  assert.equal(tracked.history[0].actor_email,undefined);assert.equal(tracked.history[0].note,undefined);
  assert.notEqual(db.sqlite.prepare("SELECT receipt_token_hash FROM customer_orders WHERE id=?").get(a.order.id).receipt_token_hash,a.token);
  await assert.rejects(trackOrder(db,"store-other",a.token),{status:404});
  for(const credential of [null,"0901234567",a.order.orderCode,receipt()]) await assert.rejects(trackOrder(db,"store-test",credential),{status:404});
});

test("lost-response retry recovers the same order after prices change and ordering closes",async t=>{
  const db=fixture(t);const a=await place(db);
  db.sqlite.prepare("UPDATE menu_items SET base_price=99000 WHERE id='tea'").run();
  db.sqlite.prepare("UPDATE store_ordering_settings SET is_ordering_open=0").run();
  const retry=await place(db,payload(),a.key,a.token);
  assert.equal(retry.replayed,true);assert.equal(retry.order.id,a.order.id);assert.equal(retry.order.totalAmount,112000);
  await assert.rejects(place(db,payload({quantity:3}),a.key,a.token),{code:"idempotency_conflict"});
  await assert.rejects(place(db,{...payload(),expectedTotal:113000},a.key,a.token),{code:"idempotency_conflict"});
  await assert.rejects(place(db,payload(),a.key,receipt()),{code:"idempotency_conflict"});
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM customer_orders").get().n,1);
});

test("concurrent same-key submissions produce one order, one item and one creation history",async t=>{
  const db=fixture(t);const key=crypto.randomUUID(),token=receipt();
  const results=await Promise.all([place(db,payload(),key,token),place(db,payload(),key,token)]);
  assert.equal(results[0].order.id,results[1].order.id);
  for(const table of ["customer_orders","order_items","order_status_history"]) assert.equal(db.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n,1);
});

test("item/history failures roll back the entire order and allow the same submission to retry",async t=>{
  const db=fixture(t); const key=crypto.randomUUID(),token=receipt();db.failOn(/INSERT INTO order_status_history/);
  await assert.rejects(place(db,payload(),key,token));
  for(const table of ["customer_orders","order_items","order_status_history"]) assert.equal(db.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);
  db.failOn(undefined);const result=await place(db,payload(),key,token);assert.equal(result.replayed,false);
});

test("competing menu/store edits are checked inside the order write batch",async t=>{
  for(const edit of ["UPDATE menu_items SET is_available=0", "UPDATE menu_items SET updated_at='changed',base_price=1", "UPDATE store_ordering_settings SET is_ordering_open=0"]){
    const db=fixture(t); const batch=db.batch;db.batch=async statements=>{db.sqlite.exec(edit);return batch(statements);};
    await assert.rejects(place(db),{code:"menu_changed"});
    assert.equal(db.sqlite.prepare("SELECT count(*) n FROM customer_orders").get().n,0);
  }
});

test("status races allow one winner with exactly one history; terminal status cannot reopen",async t=>{
  const db=fixture(t);const order=await place(db);
  const results=await Promise.allSettled([
    changeOrderStatus(db,actor,order.order.id,{expectedStatus:"pending",newStatus:"cancelled",cancelReason:"Customer cancelled"}),
    changeOrderStatus(db,actor,order.order.id,{expectedStatus:"pending",newStatus:"accepted"}),
  ]);
  assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
  assert.equal(db.sqlite.prepare("SELECT status FROM customer_orders").get().status,"cancelled");
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM order_status_history").get().n,2);
  await assert.rejects(changeOrderStatus(db,actor,order.order.id,{expectedStatus:"cancelled",newStatus:"accepted"}),{code:"invalid_transition"});
});

test("status changes enforce roles/store and roll back if history fails",async t=>{
  const db=fixture(t);const order=await place(db);const change={expectedStatus:"pending",newStatus:"accepted"};
  await assert.rejects(changeOrderStatus(db,{...actor,role:"employee"},order.order.id,change),{status:403});
  await assert.rejects(changeOrderStatus(db,{...actor,storeId:"store-other"},order.order.id,change),{code:"order_conflict"});
  db.failOn(/INSERT INTO order_status_history/);await assert.rejects(changeOrderStatus(db,actor,order.order.id,change));
  assert.equal(db.sqlite.prepare("SELECT status FROM customer_orders").get().status,"pending");
});

test("pending cancellation needs no wastage reason while preparing cancellation requires the exact reason-code enum",async t=>{
  const db=fixture(t);const early=await place(db);
  await changeOrderStatus(db,actor,early.order.id,{expectedStatus:"pending",newStatus:"cancelled"});
  assert.equal(db.sqlite.prepare("SELECT cancel_reason FROM customer_orders WHERE id=?").get(early.order.id).cancel_reason,null);

  const preparing=await place(db,payload(),crypto.randomUUID(),receipt());
  await changeOrderStatus(db,actor,preparing.order.id,{expectedStatus:"pending",newStatus:"accepted"});
  await changeOrderStatus(db,actor,preparing.order.id,{expectedStatus:"accepted",newStatus:"preparing"});
  await assert.rejects(
    changeOrderStatus(db,actor,preparing.order.id,{expectedStatus:"preparing",newStatus:"cancelled",cancelReason:"free text only"}),
    {code:"cancellation_reason_required"},
  );
  await assert.rejects(
    changeOrderStatus(db,actor,preparing.order.id,{expectedStatus:"preparing",newStatus:"cancelled",reasonCode:"other"}),
    {code:"invalid_cancellation_reason"},
  );
  await changeOrderStatus(db,actor,preparing.order.id,{expectedStatus:"preparing",newStatus:"cancelled",reasonCode:"item_preparation_error",cancelReason:"Pha nhầm"});

  const metrics=await getSpoilageMetrics(db,"store-test");
  assert.deepEqual(metrics.byReason,{customer_abandoned:0,item_preparation_error:1,store_incident:0});
  assert.equal(metrics.estimatedRetailValue,112000);
  const report=await getWastageReport(db,"store-test");
  assert.equal(report.length,1);
  assert.equal(report[0].reasonCode,"item_preparation_error");
  assert.equal(report[0].note,"Pha nhầm");
  assert.equal(report[0].estimatedRetailValue,112000);
});

test("actual status service completes the preparation workflow and refuses jumps or repeats",async t=>{
  const db=fixture(t);const order=await place(db);
  await assert.rejects(changeOrderStatus(db,actor,order.order.id,{expectedStatus:"pending",newStatus:"completed"}),{code:"invalid_transition"});
  for(const [expectedStatus,newStatus] of [["pending","accepted"],["accepted","preparing"],["preparing","ready"],["ready","completed"]]) {
    await changeOrderStatus(db,actor,order.order.id,{expectedStatus,newStatus});
    await assert.rejects(changeOrderStatus(db,actor,order.order.id,{expectedStatus,newStatus}),{code:"order_conflict"});
  }
  assert.equal((await trackOrder(db,"store-test",order.token)).order.status,"completed");
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM order_status_history").get().n,5);
});

test("advanceOrderStatusPipeline completes multiple status stages cleanly with full audit history", async t => {
  const db = fixture(t);
  const order = await place(db);
  // Fast forward from pending directly to preparing (2 stages: pending -> accepted -> preparing)
  const midResult = await advanceOrderStatusPipeline(db, actor, order.order.id, { newStatus: "preparing" });
  assert.equal(midResult.toStatus, "preparing");
  assert.equal(midResult.stagesAdvanced, 2);
  assert.equal(db.sqlite.prepare("SELECT status FROM customer_orders WHERE id=?").get(order.order.id).status, "preparing");

  // Fast forward from preparing to completed (2 stages: preparing -> ready -> completed)
  const finalResult = await advanceOrderStatusPipeline(db, actor, order.order.id, { newStatus: "completed" });
  assert.equal(finalResult.toStatus, "completed");
  assert.equal(finalResult.stagesAdvanced, 2);
  assert.equal(db.sqlite.prepare("SELECT status FROM customer_orders WHERE id=?").get(order.order.id).status, "completed");

  // Verify full history has all 4 transitions (+ 1 initial creation = 5 history entries)
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM order_status_history WHERE order_id=?").get(order.order.id).n, 5);

  // Reject advancing when already at target or completed
  await assert.rejects(
    advanceOrderStatusPipeline(db, actor, order.order.id, { newStatus: "completed" }),
    { code: "order_conflict" },
  );

  // Reject invalid target
  await assert.rejects(
    advanceOrderStatusPipeline(db, actor, order.order.id, { newStatus: "invalid_state" }),
    { code: "invalid_target_status" },
  );
});

test("durable throttling shares counters across calls, expires windows and stores no raw IP",async t=>{
  const db=fixture(t);const req=new Request("http://localhost",{headers:{"cf-connecting-ip":"192.0.2.4"}});
  for(let i=0;i<10;i++) await limitOrderRequests(db,"store-test",req,"create",60000);
  await assert.rejects(limitOrderRequests(db,"store-test",req,"create",60000),{status:429});
  assert.equal(JSON.stringify(db.sqlite.prepare("SELECT * FROM order_rate_limits").all()).includes("192.0.2.4"),false);
  await limitOrderRequests(db,"store-test",req,"create",240001);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM order_rate_limits").get().n,2);
});

test("PERF-002: calling /api/order/track produces exactly 0 write operations into D1 database", async t => {
  const db = fixture(t);
  const track = route("app/api/order/track/route.ts", db);
  const placed = await place(db);

  // Assert failOn immediately trips if any INSERT, UPDATE, or DELETE statement is executed
  db.failOn(/\b(INSERT|UPDATE|DELETE)\b/i);

  for (let i = 0; i < 20; i++) {
    const res = await track.GET(new Request("http://localhost/track", {
      headers: { "x-order-receipt": placed.token },
    }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.order.id, placed.order.id);
  }

  // Double check that the order_rate_limits table has 0 rows
  const count = db.sqlite.prepare("SELECT count(*) n FROM order_rate_limits").get().n;
  assert.equal(count, 0, "Bảng order_rate_limits phải có đúng 0 dòng khi gọi /api/order/track");
});

test("PERF-002: in-memory rate limiter protects /api/order/track from flooding without D1 writes", async t => {
  const db = fixture(t);
  const req = new Request("http://localhost/track", {
    headers: { "cf-connecting-ip": "203.0.113.99" },
  });

  // Zero D1 writes allowed during tracking rate checks
  db.failOn(/\b(INSERT|UPDATE|DELETE)\b/i);

  // 120 calls within same minute bucket succeed
  for (let i = 0; i < 120; i++) {
    await limitOrderRequests(db, "store-test", req, "track", 1000);
  }

  // 121st call within same minute bucket throws 429
  await assert.rejects(
    limitOrderRequests(db, "store-test", req, "track", 1000),
    { status: 429, code: "rate_limited" },
  );

  // After 60s TTL expires, requests are permitted again
  await limitOrderRequests(db, "store-test", req, "track", 61001);

  // Verify D1 table still has 0 rows
  const count = db.sqlite.prepare("SELECT count(*) n FROM order_rate_limits").get().n;
  assert.equal(count, 0);
});

test("actual HTTP handlers use receipt header, safe errors, replay, and role guards",async t=>{
  const db=fixture(t);const create=route("app/api/order/create/route.ts",db);const track=route("app/api/order/track/route.ts",db);
  const key=crypto.randomUUID(),token=receipt();const headers={"idempotency-key":key,"x-order-receipt":token};
  const a=await create.POST(request(payload(),headers));assert.equal(a.status,201);assert.match(a.headers.get("cache-control"),/no-store/);
  assert.equal((await create.POST(request(payload(),headers))).status,200);
  const order=(await a.json()).order;
  assert.equal((await track.GET(new Request(`http://localhost/track?phone=0901234567&code=${order.orderCode}`))).status,404);
  const receiptResponse=await track.GET(new Request("http://localhost/track",{headers:{"x-order-receipt":token}}));assert.equal(receiptResponse.status,200);assert.equal((await receiptResponse.json()).orders,undefined);
  const statusPath="app/api/owner/orders/[id]/status/route.ts";
  for(const [role,expected] of [[null,401],["employee",403],["team_lead",403]]) {
    const handler=route(statusPath,db,role?{...actor,role}:null);
    assert.equal((await handler.PATCH(request({expectedStatus:"pending",newStatus:"accepted"}),{params:Promise.resolve({id:order.id})})).status,expected);
  }
  db.failOn(/SELECT/);const failed=await track.GET(new Request("http://localhost/track",{headers:{"x-order-receipt":token}}));
  const error=await failed.json();assert.equal(failed.status,500);assert.equal(error.details,undefined);assert.equal(JSON.stringify(error).includes("Injected"),false);
});

test("HTTP input rejects wrong types/oversized bodies and owner category IDs from another store",async t=>{
  const db=fixture(t);const menu=route("app/api/owner/menu/route.ts",db);
  assert.equal((await menu.POST(request({name:"Tea",basePrice:1,categoryId:"other-cat"}))).status,400);
  assert.equal((await menu.POST(request({name:"Tea",basePrice:-1,categoryId:"cat"}))).status,400);
  assert.equal((await menu.POST(request({name:"Tea",basePrice:1,categoryId:"cat",allowsIce:"yes"}))).status,400);
  assert.equal((await menu.PATCH(request({itemId:"missing",basePrice:45000}))).status,404);
  await assert.rejects(input.readOrderBody(request({large:"x".repeat(33000)})),{status:413});
});

test("legacy order snapshot survives menu deletion but cannot be opened with an order code",async t=>{
  const db=fixture(t);const a=await place(db);
  db.sqlite.prepare("UPDATE customer_orders SET receipt_token_hash=NULL WHERE id=?").run(a.order.id);
  const menu=route("app/api/owner/menu/route.ts",db);assert.equal((await menu.DELETE(new Request("http://localhost/menu?id=tea",{method:"DELETE"}))).status,200);
  assert.equal(db.sqlite.prepare("SELECT item_name FROM order_items").get().item_name,"Canonical Tea");
  await assert.rejects(trackOrder(db,"store-test",a.token),{status:404});
});

test("owner menu handlers create and update valid items with audit and reject cross-store edits",async t=>{
  const db=fixture(t);const menu=route("app/api/owner/menu/route.ts",db);
  const created=await menu.POST(request({name:"Fresh Tea",basePrice:39000,categoryId:"cat",allowsToppings:false}));
  assert.equal(created.status,201);const {item}=await created.json();
  assert.equal(db.sqlite.prepare("SELECT allows_toppings FROM menu_items WHERE id=?").get(item.id).allows_toppings,0);
  const originalVersion=db.sqlite.prepare("SELECT updated_at FROM menu_items WHERE id=?").get(item.id).updated_at;
  const edited=await menu.PATCH(request({itemId:item.id,name:"Fresh Tea New",basePrice:42000,isAvailable:false,expectedUpdatedAt:originalVersion}));assert.equal(edited.status,200);
  assert.equal(db.sqlite.prepare("SELECT base_price FROM menu_items WHERE id=?").get(item.id).base_price,42000);
  const stale=await menu.PATCH(request({itemId:item.id,isAvailable:true,expectedUpdatedAt:originalVersion}));
  assert.equal(stale.status,409);
  assert.equal((await stale.json()).code,"menu_conflict");
  assert.equal(db.sqlite.prepare("SELECT is_available FROM menu_items WHERE id=?").get(item.id).is_available,0);
  const foreign=route("app/api/owner/menu/route.ts",db,{...actor,storeId:"store-other"});
  assert.equal((await foreign.PATCH(request({itemId:item.id,basePrice:1}))).status,404);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM audit_events").get().n,2);
});

test("batch menu import creates items, maps existing categories, auto-creates new categories and enforces store boundaries", async t => {
  const db = fixture(t);

  // 1. Rejects empty list
  await assert.rejects(
    importMenuItems(db, actor, { items: [] }),
    { status: 400 }
  );

  // 2. Rejects foreign fallback category
  await assert.rejects(
    importMenuItems(db, actor, {
      items: [{ name: "Drink A", basePrice: 35000 }],
      fallbackCategoryId: "other-cat",
    }),
    { status: 400 }
  );

  // 3. Batch import items with:
  // - mapped to existing category "Tea" (case-insensitive "tea")
  // - auto-creating a new category "Coffee Special"
  // - missing category -> uses fallback "cat"
  const importResult = await importMenuItems(db, actor, {
    items: [
      { name: "Oolong Tea", basePrice: 40000, categoryName: "tea", allowsSize: true, allowsToppings: true },
      { name: "Espresso Roman", basePrice: 48000, categoryName: "Coffee Special", badge: "Mới" },
      { name: "House Special Tea", basePrice: 52000 },
    ],
    fallbackCategoryId: "cat",
    createMissingCategories: true,
  });

  assert.equal(importResult.success, true);
  assert.equal(importResult.createdItems, 3);
  assert.equal(importResult.createdCategories, 1);

  // Verify new category created in DB with correct store_id
  const newCat = db.sqlite.prepare("SELECT * FROM menu_categories WHERE store_id = 'store-test' AND name = 'Coffee Special'").get();
  assert.ok(newCat);

  // Verify items inserted with correct category_id and values
  const oolong = db.sqlite.prepare("SELECT * FROM menu_items WHERE store_id = 'store-test' AND name = 'Oolong Tea'").get();
  assert.equal(oolong.category_id, "cat");
  assert.equal(oolong.base_price, 40000);
  assert.equal(oolong.allows_size, 1);
  assert.equal(oolong.allows_toppings, 1);

  const espresso = db.sqlite.prepare("SELECT * FROM menu_items WHERE store_id = 'store-test' AND name = 'Espresso Roman'").get();
  assert.equal(espresso.category_id, newCat.id);
  assert.equal(espresso.base_price, 48000);
  assert.equal(espresso.badge, "Mới");

  const houseSpecial = db.sqlite.prepare("SELECT * FROM menu_items WHERE store_id = 'store-test' AND name = 'House Special Tea'").get();
  assert.equal(houseSpecial.category_id, "cat");

  // Verify audit event
  const auditLog = db.sqlite.prepare("SELECT * FROM audit_events WHERE action = 'menu.imported'").get();
  assert.ok(auditLog);
  assert.equal(JSON.parse(auditLog.metadata).importedCount, 3);
});

test("POST /api/owner/menu/import route checks permissions and imports correctly", async t => {
  const db = fixture(t);

  // Rejects unauthenticated
  const unauth = route("app/api/owner/menu/import/route.ts", db, null);
  assert.equal((await unauth.POST(request({ items: [{ name: "Drink", basePrice: 30000 }] }))).status, 401);

  // Rejects role without menu.manage permission (e.g. employee)
  const employeeRoute = route("app/api/owner/menu/import/route.ts", db, { ...actor, role: "employee" });
  assert.equal((await employeeRoute.POST(request({ items: [{ name: "Drink", basePrice: 30000 }] }))).status, 403);

  // Manager has menu.manage -> succeeds (201)
  const managerRoute = route("app/api/owner/menu/import/route.ts", db, actor);
  const res = await managerRoute.POST(request({
    items: [
      { name: "Cold Brew Orange", basePrice: 45000, categoryName: "Cold Brew" }
    ],
    createMissingCategories: true
  }));
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.createdItems, 1);
  assert.equal(data.createdCategories, 1);
});

test("importMenuItems updates base_price of existing items and creates new items (Upsert)", async t => {
  const db = fixture(t);

  // Existing item in fixture: name = "Canonical Tea", base_price = 45000, id = 'tea'
  const result = await importMenuItems(db, actor, {
    items: [
      { name: "Canonical Tea", basePrice: 49000, categoryName: "tea" }, // Should update existing
      { name: "Newly Added Drink", basePrice: 38000, categoryName: "tea" }, // Should insert new
    ],
    createMissingCategories: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.createdItems, 1);
  assert.equal(result.updatedItems, 1);

  // Verify DB updated Canonical Tea price
  const updatedTea = db.sqlite.prepare("SELECT * FROM menu_items WHERE id = 'tea'").get();
  assert.equal(updatedTea.base_price, 49000);

  // Verify newly created item
  const newDrink = db.sqlite.prepare("SELECT * FROM menu_items WHERE name = 'Newly Added Drink'").get();
  assert.ok(newDrink);
  assert.equal(newDrink.base_price, 38000);
});

