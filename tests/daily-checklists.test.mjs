import test from "node:test";
import assert from "node:assert/strict";
import {createDatabase,seedStore,seedEmployee} from "./helpers/database.mjs";
import {loadModule} from "./helpers/load-module.mjs";
import {auditStatement} from "../server/audit.ts";
import {apiHandler} from "../platform/http/errors.ts";
import {readObject} from "../platform/http/input.ts";
import {businessDate} from "../modules/operations/domain/business-day.ts";

test("business checklist day changes at Vietnamese midnight",()=>{
  assert.equal(businessDate(new Date("2026-09-17T16:59:59Z")),"2026-09-17");
  assert.equal(businessDate(new Date("2026-09-17T17:00:00Z")),"2026-09-18");
});

test("actual checklist route retains daily history, rejects foreign items and rolls back failed audits",async t=>{
  const db=createDatabase();t.after(()=>db.close());seedStore(db);const actor=seedEmployee(db);
  seedStore(db,"store-b");
  let day="2026-09-17";
  const loaded=await loadModule("../../app/api/checklists/route.ts",{
    "@/db/runtime":{ensureDatabase:async()=>db},
    "@/server/auth":{requireApiUser:async()=>({actor}),auditStatement},
    "@/modules/operations/domain/business-day":{businessDate:()=>day},
    "@/platform/http/errors":{apiHandler},
    "@/platform/http/input":{readObject},
  });t.after(loaded.dispose);
  const route=loaded.module;
  const request=(method,body)=>new Request("http://localhost/api/checklists",{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const created=await (await route.POST(request("POST",{label:"Vệ sinh máy",required:true}))).json();
  const id=created.item.id;
  assert.equal((await route.PATCH(request("PATCH",{id,completed:true}))).status,200);
  assert.equal((await route.PATCH(request("PATCH",{id,completed:true}))).status,200);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM checklist_executions").get().n,1);
  assert.equal((await (await route.GET()).json()).items[0].completed,1);
  day="2026-09-18";
  assert.equal((await (await route.GET()).json()).items[0].completed,0);
  db.failOn(/INSERT INTO audit_events/);
  assert.equal((await route.PATCH(request("PATCH",{id,completed:true}))).status,500);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM checklist_executions").get().n,1);
  db.failOn(undefined);
  db.sqlite.prepare("INSERT INTO checklist_items(id,store_id,label,assignee,required,completed,updated_at) VALUES('foreign','store-b','Foreign','Staff',1,0,'2026-09-17')").run();
  assert.equal((await route.PATCH(request("PATCH",{id:"foreign",completed:true}))).status,404);
});
