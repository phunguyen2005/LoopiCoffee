import { getDatabaseBinding } from "./runtime";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  return drizzle(getDatabaseBinding(), { schema });
}
