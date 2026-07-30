import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const stores = sqliteTable("stores", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  attendanceEnabled: integer("attendance_enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["owner", "manager", "employee"] }).notNull(),
  status: text("status", { enum: ["invited", "active", "inactive"] }).notNull().default("invited"),
  invitedBy: text("invited_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("employees_email_idx").on(table.email),
  index("employees_store_status_idx").on(table.storeId, table.status),
]);

export const employeeConsents = sqliteTable("employee_consents", {
  id: text("id").primaryKey(),
  employeeEmail: text("employee_email").notNull(),
  noticeVersion: text("notice_version").notNull(),
  consentedAt: text("consented_at").notNull(),
}, (table) => [uniqueIndex("employee_consents_email_version_idx").on(table.employeeEmail, table.noticeVersion)]);

export const attendanceRules = sqliteTable("attendance_rules", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  version: integer("version").notNull(),
  earlyCheckinMinutes: integer("early_checkin_minutes").notNull(),
  lateMinutes: integer("late_minutes").notNull(),
  earlyDepartureMinutes: integer("early_departure_minutes").notNull(),
  absenceMinutes: integer("absence_minutes").notNull(),
  missingCheckoutMinutes: integer("missing_checkout_minutes").notNull(),
  evidenceRetentionDays: integer("evidence_retention_days").notNull().default(90),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("attendance_rules_store_version_idx").on(table.storeId, table.version),
  index("attendance_rules_active_idx").on(table.storeId, table.active),
]);

export const shifts = sqliteTable("shifts", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  employeeEmail: text("employee_email").notNull(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  timezoneSnapshot: text("timezone_snapshot").notNull().default("Asia/Ho_Chi_Minh"),
  roleLabel: text("role_label").notNull(),
  isShiftLead: integer("is_shift_lead", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["draft", "published", "cancelled", "completed"] }).notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("shifts_employee_start_idx").on(table.employeeEmail, table.startsAt),
  index("shifts_store_status_ends_idx").on(table.storeId, table.status, table.endsAt),
]);

export const attendanceCaptureSessions = sqliteTable("attendance_capture_sessions", {
  id: text("id").primaryKey(),
  employeeEmail: text("employee_email").notNull(),
  storeId: text("store_id").notNull().references(() => stores.id),
  action: text("action", { enum: ["check_in", "check_out"] }).notNull(),
  nonceHash: text("nonce_hash").notNull(),
  issuedAt: text("issued_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

export const attendanceSessions = sqliteTable("attendance_sessions", {
  id: text("id").primaryKey(),
  employeeEmail: text("employee_email").notNull(),
  storeId: text("store_id").notNull().references(() => stores.id),
  shiftId: text("shift_id").references(() => shifts.id),
  ruleVersionId: text("rule_version_id").references(() => attendanceRules.id),
  status: text("status", { enum: ["open", "completed", "review_required"] }).notNull(),
  openedAt: text("opened_at"),
  closedAt: text("closed_at"),
  workedMinutes: integer("worked_minutes"),
}, (table) => [
  index("attendance_sessions_store_closed_idx").on(table.storeId, table.closedAt),
  index("attendance_sessions_employee_activity_idx").on(
    table.storeId,
    table.employeeEmail,
    table.openedAt,
    table.closedAt,
  ),
]);

export const attendanceEvents = sqliteTable("attendance_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => attendanceSessions.id),
  employeeEmail: text("employee_email").notNull(),
  action: text("action", { enum: ["check_in", "check_out"] }).notNull(),
  recordedAt: text("recorded_at").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  verificationResults: text("verification_results").notNull(),
  reviewRequired: integer("review_required", { mode: "boolean" }).notNull(),
  photoStatus: text("photo_status", { enum: ["stored", "unavailable", "failed"] }).notNull(),
  exceptionReason: text("exception_reason"),
}, (table) => [
  uniqueIndex("attendance_idempotency_idx").on(table.idempotencyKey),
  uniqueIndex("attendance_event_session_action_idx").on(table.sessionId, table.action),
]);

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
  sha256: text("sha256").notNull(),
  overlayVersion: text("overlay_version").notNull(),
  expiresAt: text("expires_at").notNull(),
  deletedAt: text("deleted_at"),
});

export const attendanceExceptions = sqliteTable("attendance_exceptions", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => attendanceEvents.id),
  employeeReason: text("employee_reason").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull(),
  reviewerEmail: text("reviewer_email"),
  reviewerNote: text("reviewer_note"),
  reviewedAt: text("reviewed_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("attendance_exceptions_event_idx").on(table.eventId),
  index("attendance_exceptions_status_event_idx").on(table.status, table.eventId),
]);

export const attendanceActionLimits = sqliteTable("attendance_action_limits", {
  id: text("id").primaryKey(),
  employeeEmail: text("employee_email").notNull(),
  action: text("action").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("attendance_action_limits_email_time_idx").on(table.employeeEmail, table.createdAt)]);

export const checklistItems = sqliteTable("checklist_items", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  label: text("label").notNull(),
  assignee: text("assignee").notNull(),
  required: integer("required", { mode: "boolean" }).notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull(),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("checklist_items_store_idx").on(table.storeId)]);

export const incidents = sqliteTable("incidents", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  reporterEmail: text("reporter_email").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  severity: text("severity", { enum: ["low", "medium", "high"] }).notNull(),
  status: text("status", { enum: ["open", "acknowledged", "resolved", "closed"] }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("incidents_store_status_idx").on(table.storeId, table.status)]);

export const handovers = sqliteTable("handovers", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  authorEmail: text("author_email").notNull(),
  summary: text("summary").notNull(),
  managerAttention: integer("manager_attention", { mode: "boolean" }).notNull(),
  acknowledgedAt: text("acknowledged_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("handovers_store_created_idx").on(table.storeId, table.createdAt)]);

export const requests = sqliteTable("requests", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  employeeEmail: text("employee_email").notNull(),
  type: text("type", { enum: ["leave", "swap", "correction"] }).notNull(),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull(),
  reviewerEmail: text("reviewer_email"),
  reviewedAt: text("reviewed_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("requests_store_employee_created_idx").on(table.storeId, table.employeeEmail, table.createdAt),
]);

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  recipientEmail: text("recipient_email").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  entityHref: text("entity_href"),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("notifications_recipient_created_idx").on(table.recipientEmail, table.createdAt),
]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorEmail: text("actor_email").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
});
