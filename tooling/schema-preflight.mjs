import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repairs = {
  "0006_repair_application_columns": {
    employees: ["job_title", "phone", "start_date", "last_login_at"],
    stores: ["geofence_radius_meters"],
  },
  "0007_payroll_snapshots": { payroll_entries: ["row_snapshot", "snapshot_version"] },
};

// Read-only: never marks a migration as applied or changes live schema/data.
export function inspectSchema(database) {
  return Object.entries(repairs).map(([migration, tables]) => {
    const present = [], missing = [];
    for (const [table, columns] of Object.entries(tables)) {
      const actual = new Set(database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
      for (const column of columns) (actual.has(column) ? present : missing).push(`${table}.${column}`);
    }
    return {
      migration, present, missing,
      state: present.length === 0 ? "columns_missing" : missing.length === 0 ? "columns_present" : "mixed_schema_requires_reconciliation",
    };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) {
    console.error("Usage: npm run db:preflight -- <absolute-path-to-local-sqlite-database>");
    process.exitCode = 1;
  } else {
    const database = new DatabaseSync(resolve(process.argv[2]), { readOnly: true });
    try {
      const schema = inspectSchema(database);
      const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all().length;
      console.log(JSON.stringify({ schema, foreignKeyViolations, note: "Compare migration history separately. Present columns do not prove a migration was applied. See docs/database-operations.md." }, null, 2));
      if (foreignKeyViolations || schema.some((item) => item.state.startsWith("mixed"))) process.exitCode = 2;
    } finally { database.close(); }
  }
}
