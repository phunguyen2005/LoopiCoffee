import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { is } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { createDatabase } from "./helpers/database.mjs";
import { inspectSchema } from "../tooling/schema-preflight.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? filesIn(resolve(directory, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [resolve(directory, entry.name)] : []);
}
function imports(file) {
  const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  return ast.statements.flatMap((node) => (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? [node.moduleSpecifier.text] : []);
}

test("every declared schema column exists after running migrations", (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  for (const table of Object.values(schema).filter((value) => is(value, SQLiteTable))) {
    const config = getTableConfig(table);
    const actual = db.sqlite.prepare(`PRAGMA table_info("${config.name}")`).all().map((row) => row.name).sort();
    assert.deepEqual(actual, config.columns.map((column) => column.name).sort(), config.name);
    const actualIndexes = new Map(db.sqlite.prepare(`PRAGMA index_list("${config.name}")`).all().map(row => [row.name,row]));
    for (const index of config.indexes) {
      const actualIndex=actualIndexes.get(index.config.name);
      assert.ok(actualIndex, `${config.name}: missing index ${index.config.name}`);
      assert.equal(Boolean(actualIndex.unique), Boolean(index.config.unique), index.config.name);
    }
  }
  assert.ok(inspectSchema(db.sqlite).every((row) => row.state === "columns_present"));
});

test("migration journal includes every ordered SQL file and snapshot", () => {
  const directory = resolve(root,"drizzle");
  const sqlTags = readdirSync(directory).filter(name => name.endsWith(".sql")).sort().map(name => name.slice(0,-4));
  const entries = JSON.parse(readFileSync(resolve(directory,"meta/_journal.json"),"utf8")).entries;
  assert.deepEqual(entries.map(entry => entry.tag), sqlTags);
  let previous;
  for (const entry of entries) {
    const snapshot=JSON.parse(readFileSync(resolve(directory,`meta/${String(entry.idx).padStart(4,"0")}_snapshot.json`),"utf8"));
    if (previous) assert.equal(snapshot.prevId, previous.id);
    previous=snapshot;
  }
});

test("domain policies and contracts do not depend on HTTP, React or persistence", () => {
  for (const file of filesIn(resolve(root, "modules")).filter((file) => /[\\/](domain|contracts)[\\/]/.test(file))) {
    for (const specifier of imports(file)) {
      assert.ok(specifier.startsWith("."), `${relative(root, file)} imports ${specifier}`);
      const target = resolve(dirname(file), specifier);
      assert.match(target, /[\\/](domain|contracts)[\\/]/, `${relative(root, file)} depends on an outer layer`);
    }
  }
});

test("browser components cannot import server implementations", () => {
  const candidates = [...filesIn(resolve(root, "components")), ...filesIn(resolve(root, "app"))];
  for (const file of candidates) {
    if (!/^\s*["']use client["']/.test(readFileSync(file, "utf8"))) continue;
    for (const specifier of imports(file)) {
      const target = specifier.startsWith("@/") ? resolve(root, specifier.slice(2)) : resolve(dirname(file), specifier);
      assert.doesNotMatch(target, /[\\/](db|server)[\\/]|[\\/]modules[\\/].*[\\/](application|infrastructure)[\\/]/, relative(root, file));
    }
  }
});

test("request-time database binding code never creates or seeds schema", () => {
  const runtime = readFileSync(resolve(root, "db/runtime.ts"), "utf8");
  assert.doesNotMatch(runtime, /CREATE TABLE|ALTER TABLE|INSERT INTO|seedDemoDatabase/);
});
