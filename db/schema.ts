import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const stores = sqliteTable("stores", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  createdAt: text("created_at").notNull(),
});

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["owner", "manager", "employee"] }).notNull(),
  status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("employees_email_idx").on(table.email)]);

export const shifts = sqliteTable("shifts", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  employeeEmail: text("employee_email").notNull(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  roleLabel: text("role_label").notNull(),
  status: text("status", { enum: ["draft", "published", "cancelled", "completed"] }).notNull(),
}, (table) => [index("shifts_employee_start_idx").on(table.employeeEmail, table.startsAt)]);

export const attendanceCaptureSessions = sqliteTable("attendance_capture_sessions", {
  id: text("id").primaryKey(),
  employeeEmail: text("employee_email").notNull(),
  storeId: text("store_id").notNull().references(() => stores.id),
  action: text("action", { enum: ["check_in", "check_out"] }).notNull(),
  issuedAt: text("issued_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

export const attendanceSessions = sqliteTable("attendance_sessions", {
  id: text("id").primaryKey(),
  employeeEmail: text("employee_email").notNull(),
  storeId: text("store_id").notNull().references(() => stores.id),
  shiftId: text("shift_id").references(() => shifts.id),
  status: text("status", { enum: ["open", "completed", "review_required"] }).notNull(),
  openedAt: text("opened_at"),
  closedAt: text("closed_at"),
  workedMinutes: integer("worked_minutes"),
});

export const attendanceEvents = sqliteTable("attendance_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => attendanceSessions.id),
  employeeEmail: text("employee_email").notNull(),
  action: text("action", { enum: ["check_in", "check_out"] }).notNull(),
  recordedAt: text("recorded_at").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  verificationResults: text("verification_results").notNull(),
  reviewRequired: integer("review_required", { mode: "boolean" }).notNull(),
  exceptionReason: text("exception_reason"),
}, (table) => [uniqueIndex("attendance_idempotency_idx").on(table.idempotencyKey)]);

export const attendanceLocations = sqliteTable("attendance_locations", {
  eventId: text("event_id").primaryKey().references(() => attendanceEvents.id),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  accuracyMeters: real("accuracy_meters").notNull(),
  browserPositionAt: text("browser_position_at"),
  serverReceivedAt: text("server_received_at").notNull(),
  distanceFromStoreMeters: real("distance_from_store_meters").notNull(),
  expiresAt: text("expires_at").notNull(),
  deletedAt: text("deleted_at"),
});

export const attendancePhotos = sqliteTable("attendance_photos", {
  eventId: text("event_id").primaryKey().references(() => attendanceEvents.id),
  objectKey: text("object_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  overlayVersion: text("overlay_version").notNull(),
  expiresAt: text("expires_at").notNull(),
  deletedAt: text("deleted_at"),
});

export const checklistItems = sqliteTable("checklist_items", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  label: text("label").notNull(),
  assignee: text("assignee").notNull(),
  required: integer("required", { mode: "boolean" }).notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull(),
  completedAt: text("completed_at"),
});

export const incidents = sqliteTable("incidents", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  reporterEmail: text("reporter_email").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  severity: text("severity", { enum: ["low", "medium", "high"] }).notNull(),
  status: text("status", { enum: ["open", "acknowledged", "resolved", "closed"] }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const handovers = sqliteTable("handovers", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  authorEmail: text("author_email").notNull(),
  summary: text("summary").notNull(),
  managerAttention: integer("manager_attention", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  recipientEmail: text("recipient_email").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  entityHref: text("entity_href"),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorEmail: text("actor_email").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
});
