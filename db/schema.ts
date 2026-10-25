import { index, integer, real, sqliteTable, text, uniqueIndex, primaryKey, check, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const stores = sqliteTable("stores", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  geofenceRadiusMeters: integer("geofence_radius_meters").notNull().default(100),
  wifiSsid: text("wifi_ssid"),
  wifiPublicIp: text("wifi_public_ip"),
  attendanceEnabled: integer("attendance_enabled", { mode: "boolean" }).notNull().default(false),
  workforceRevision: integer("workforce_revision").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const customRoles = sqliteTable("custom_roles", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
  revision: integer("revision").notNull().default(0),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("custom_roles_store_name_idx").on(table.storeId, table.name),
]);

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  roleId: text("role_id").references(() => customRoles.id),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  jobTitle: text("job_title").default("Barista"),
  phone: text("phone"),
  startDate: text("start_date"),
  lastLoginAt: text("last_login_at"),
  authUserId: text("auth_user_id"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  passwordVersion: integer("password_version").notNull().default(0),
  passwordResetPending: integer("password_reset_pending", { mode: "boolean" }).notNull().default(false),
  accessRevision: integer("access_revision").notNull().default(0),
  role: text("role", { enum: ["system_admin", "owner", "manager", "team_lead", "employee"] }).notNull(),
  status: text("status", { enum: ["invited", "active", "suspended", "offboarded", "inactive"] }).notNull().default("invited"),
  participatesAttendance: integer("participates_attendance", { mode: "boolean" }),
  payrollEligible: integer("payroll_eligible", { mode: "boolean" }),
  compensationType: text("compensation_type", { enum: ["hourly", "monthly", "shift", "none"] }),
  hourlyRate: integer("hourly_rate"),
  monthlySalary: integer("monthly_salary"),
  invitedBy: text("invited_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("employees_email_idx").on(table.email),
  uniqueIndex("employees_email_lower_idx").on(sql`lower(${table.email})`),
  index("employees_store_status_idx").on(table.storeId, table.status),
]);

export const rolePermissionSets = sqliteTable("role_permission_sets", {
  storeId: text("store_id").notNull().references(() => stores.id),
  role: text("role").notNull(),
  revision: integer("revision").notNull().default(0),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.storeId, table.role] })]);

export const rolePermissions = sqliteTable("role_permissions", {
  storeId: text("store_id").notNull().references(() => stores.id),
  role: text("role").notNull(),
  permissionKey: text("permission_key").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.storeId, table.role, table.permissionKey] })]);

export const adminAccountOperations = sqliteTable("admin_account_operations", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  actorEmail: text("actor_email").notNull(),
  targetEmployeeId: text("target_employee_id").references(() => employees.id),
  action: text("action").notNull(),
  requestHash: text("request_hash").notNull(),
  status: text("status", { enum: ["pending", "completed", "failed"] }).notNull(),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("admin_operations_actor_key_idx").on(table.storeId, table.actorEmail, table.id)]);

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
  revision: integer("revision").notNull().default(0),
  approvedLeaveRequestId: text("approved_leave_request_id").references((): AnySQLiteColumn => requests.id),
  coverForShiftId: text("cover_for_shift_id").references((): AnySQLiteColumn => shifts.id),
  storeId: text("store_id").notNull().references(() => stores.id),
  employeeEmail: text("employee_email").notNull(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  timezoneSnapshot: text("timezone_snapshot").notNull().default("Asia/Ho_Chi_Minh"),
  roleLabel: text("role_label").notNull(),
  isShiftLead: integer("is_shift_lead", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["draft", "published", "cancelled", "completed"] }).notNull(),
  createdAt: text("created_at"),
}, (table) => [
  index("shifts_employee_start_idx").on(table.employeeEmail, table.startsAt),
  index("shifts_store_status_ends_idx").on(table.storeId, table.status, table.endsAt),
  index("shifts_cover_for_shift_idx").on(table.storeId, table.coverForShiftId),
]);

export const attendanceCaptureSessions = sqliteTable("attendance_capture_sessions", {
  id: text("id").primaryKey(),
  employeeEmail: text("employee_email").notNull(),
  storeId: text("store_id").notNull().references(() => stores.id),
  action: text("action", { enum: ["check_in", "check_out"] }).notNull(),
  nonceHash: text("nonce_hash"),
  issuedAt: text("issued_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

export const attendanceSessions = sqliteTable("attendance_sessions", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  employeeEmail: text("employee_email").notNull(),
  storeId: text("store_id").notNull().references(() => stores.id),
  shiftId: text("shift_id").references(() => shifts.id),
  ruleVersionId: text("rule_version_id").references(() => attendanceRules.id),
  status: text("status", { enum: ["open", "completed", "review_required"] }).notNull(),
  openedAt: text("opened_at"),
  closedAt: text("closed_at"),
  workedMinutes: integer("worked_minutes"),
}, (table) => [
  uniqueIndex("active_attendance_session_employee_idx").on(table.employeeEmail).where(sql`${table.closedAt} IS NULL`),
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
  captureSessionId: text("capture_session_id").references(() => attendanceCaptureSessions.id, { onDelete: "set null" }),
  sessionId: text("session_id").notNull().references(() => attendanceSessions.id),
  employeeEmail: text("employee_email").notNull(),
  action: text("action", { enum: ["check_in", "check_out"] }).notNull(),
  recordedAt: text("recorded_at").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  verificationResults: text("verification_results").notNull(),
  reviewRequired: integer("review_required", { mode: "boolean" }).notNull(),
  photoStatus: text("photo_status", { enum: ["stored", "unavailable", "failed"] }).notNull().default("unavailable"),
  exceptionReason: text("exception_reason"),
}, (table) => [
  uniqueIndex("attendance_idempotency_idx").on(table.idempotencyKey),
  uniqueIndex("attendance_events_capture_idx").on(table.captureSessionId).where(sql`${table.captureSessionId} IS NOT NULL`),
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
}, (table) => [
  index("attendance_locations_expires_idx").on(table.expiresAt),
]);

export const attendancePhotos = sqliteTable("attendance_photos", {
  eventId: text("event_id").primaryKey().references(() => attendanceEvents.id),
  objectKey: text("object_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull().default(""),
  overlayVersion: text("overlay_version").notNull(),
  expiresAt: text("expires_at").notNull(),
  deletedAt: text("deleted_at"),
}, (table) => [
  index("attendance_photos_expires_idx").on(table.expiresAt),
]);

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

export const payrollPeriods = sqliteTable("payroll_periods", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  status: text("status", { enum: ["reviewing", "finalized", "paid"] }).notNull().default("reviewing"),
  finalizedBy: text("finalized_by"),
  finalizedAt: text("finalized_at"),
  reopenedBy: text("reopened_by"),
  reopenedAt: text("reopened_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("payroll_periods_store_range_idx").on(table.storeId, table.periodStart, table.periodEnd),
]);

export const payrollEntries = sqliteTable("payroll_entries", {
  id: text("id").primaryKey(),
  payrollPeriodId: text("payroll_period_id").notNull().references(() => payrollPeriods.id),
  employeeEmail: text("employee_email").notNull(),
  approvedMinutes: integer("approved_minutes").notNull(),
  overtimeMinutes: integer("overtime_minutes").notNull().default(0),
  allowanceAmount: integer("allowance_amount").notNull().default(0),
  bonusAmount: integer("bonus_amount").notNull().default(0),
  deductionAmount: integer("deduction_amount").notNull().default(0),
  totalAmount: integer("total_amount").notNull(),
  status: text("status", { enum: ["payroll_finalized", "paid"] }).notNull().default("payroll_finalized"),
  lockedAt: text("locked_at").notNull(),
  rowSnapshot: text("row_snapshot"),
  snapshotVersion: integer("snapshot_version").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("payroll_entries_period_employee_idx").on(table.payrollPeriodId, table.employeeEmail),
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
  routineType: text("routine_type", { enum: ["daily_routine", "shift_routine"] }).notNull().default("daily_routine"),
  shiftId: text("shift_id").references(() => shifts.id),
  responsibleRole: text("responsible_role"),
  required: integer("required", { mode: "boolean" }).notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull(),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at"),
}, (table) => [
  index("checklist_items_store_idx").on(table.storeId),
  index("checklist_items_shift_idx").on(table.storeId, table.shiftId),
]);

export const checklistExecutions = sqliteTable("checklist_executions", {
  itemId: text("item_id").notNull().references(() => checklistItems.id),
  businessDate: text("business_date").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  completedAt: text("completed_at"),
  completedBy: text("completed_by"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.itemId, table.businessDate] }), index("checklist_executions_date_idx").on(table.businessDate, table.itemId), check("checklist_execution_completed",sql`${table.completed} IN (0,1)`)]);

export const incidents = sqliteTable("incidents", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  reporterEmail: text("reporter_email").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  severity: text("severity", { enum: ["low", "medium", "high"] }).notNull(),
  status: text("status", { enum: ["open", "acknowledged", "resolved", "closed"] }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (table) => [index("incidents_store_status_idx").on(table.storeId, table.status)]);

export const handovers = sqliteTable("handovers", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  authorEmail: text("author_email").notNull(),
  summary: text("summary").notNull(),
  managerAttention: integer("manager_attention", { mode: "boolean" }).notNull(),
  shiftId: text("shift_id").references(() => shifts.id),
  receiverEmployeeId: text("receiver_employee_id").references(() => employees.id),
  nextShiftId: text("next_shift_id").references(() => shifts.id),
  acknowledgedAt: text("acknowledged_at"),
  acknowledgedBy: text("acknowledged_by"),
  clientRequestKey: text("client_request_key"),
  payloadHash: text("payload_hash"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("handovers_store_created_idx").on(table.storeId, table.createdAt),
  index("handovers_receiver_idx").on(table.storeId, table.receiverEmployeeId, table.acknowledgedAt),
  index("handovers_next_shift_idx").on(table.storeId, table.nextShiftId, table.acknowledgedAt),
  uniqueIndex("handovers_client_request_idx").on(table.storeId, table.authorEmail, table.clientRequestKey),
]);

export const requests = sqliteTable("requests", {
  id: text("id").primaryKey(),
  clientRequestKey: text("client_request_key"),
  shiftId: text("shift_id").references(() => shifts.id),
  startsAt: text("starts_at"),
  endsAt: text("ends_at"),
  correctionEventId: text("correction_event_id").references(() => attendanceEvents.id),
  correctionSessionId: text("correction_session_id").references(() => attendanceSessions.id),
  correctionAction: text("correction_action", { enum: ["check_in", "check_out"] }),
  correctionEffectiveTime: text("correction_effective_time"),
  correctionExpectedRevision: integer("correction_expected_revision"),
  storeId: text("store_id").notNull().references(() => stores.id),
  employeeEmail: text("employee_email").notNull(),
  type: text("type", { enum: ["leave", "swap", "correction"] }).notNull(),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected", "approved_pending_apply", "applied", "withdrawn"] }).notNull(),
  reviewerEmail: text("reviewer_email"),
  reviewedAt: text("reviewed_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("requests_store_employee_created_idx").on(table.storeId, table.employeeEmail, table.createdAt),
  uniqueIndex("requests_client_key_idx").on(table.employeeEmail, table.clientRequestKey).where(sql`${table.clientRequestKey} IS NOT NULL`),
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
  storeId: text("store_id"),
  actorEmail: text("actor_email").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("audit_events_store_created_idx").on(table.storeId, table.createdAt)]);

export const menuCategories = sqliteTable("menu_categories", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  name: text("name").notNull(),
  englishName: text("english_name"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("menu_categories_store_sort_idx").on(table.storeId, table.sortOrder),
]);

export const menuItems = sqliteTable("menu_items", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  categoryId: text("category_id").notNull().references(() => menuCategories.id),
  name: text("name").notNull(),
  englishName: text("english_name"),
  description: text("description"),
  basePrice: integer("base_price").notNull(),
  imageUrl: text("image_url").notNull(),
  badge: text("badge"),
  isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(true),
  allowsSize: integer("allows_size", { mode: "boolean" }).notNull().default(true),
  allowsSugar: integer("allows_sugar", { mode: "boolean" }).notNull().default(true),
  allowsIce: integer("allows_ice", { mode: "boolean" }).notNull().default(true),
  allowsToppings: integer("allows_toppings", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("menu_items_store_category_idx").on(table.storeId, table.categoryId, table.sortOrder),
  index("menu_items_store_available_idx").on(table.storeId, table.isAvailable),
]);

export const menuOptions = sqliteTable("menu_options", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  groupType: text("group_type", { enum: ["size", "sugar", "ice", "topping"] }).notNull(),
  name: text("name").notNull(),
  priceModifier: integer("price_modifier").notNull().default(0),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("menu_options_store_group_idx").on(table.storeId, table.groupType, table.sortOrder),
]);

export const customerOrders = sqliteTable("customer_orders", {
  id: text("id").primaryKey(),
  receiptTokenHash: text("receipt_token_hash"),
  submissionKey: text("submission_key"),
  submissionHash: text("submission_hash"),
  orderCode: text("order_code").notNull(),
  storeId: text("store_id").notNull().references(() => stores.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerNote: text("customer_note"),
  totalAmount: integer("total_amount").notNull(),
  itemCount: integer("item_count").notNull(),
  status: text("status", { enum: ["pending", "accepted", "preparing", "ready", "completed", "cancelled"] }).notNull().default("pending"),
  cancelReason: text("cancel_reason"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("customer_orders_order_code_idx").on(table.orderCode),
  uniqueIndex("customer_orders_store_receipt_idx").on(table.storeId, table.receiptTokenHash),
  uniqueIndex("customer_orders_store_submission_idx").on(table.storeId, table.submissionKey),
  index("customer_orders_store_status_idx").on(table.storeId, table.status, table.createdAt),
  index("customer_orders_store_created_idx").on(table.storeId, table.createdAt),
  index("customer_orders_customer_phone_idx").on(table.customerPhone),
]);

export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => customerOrders.id),
  itemId: text("item_id"),
  itemName: text("item_name").notNull(),
  unitPrice: integer("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
  subtotal: integer("subtotal").notNull(),
  sizeLabel: text("size_label"),
  sugarLevel: text("sugar_level"),
  iceLevel: text("ice_level"),
  toppingsJson: text("toppings_json"),
  itemNote: text("item_note"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("order_items_order_id_idx").on(table.orderId),
]);

export const orderStatusHistory = sqliteTable("order_status_history", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => customerOrders.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actorType: text("actor_type", { enum: ["customer", "owner", "system"] }).notNull(),
  actorEmail: text("actor_email"),
  note: text("note"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("order_status_history_order_id_idx").on(table.orderId, table.createdAt),
]);

export const storeOrderingSettings = sqliteTable("store_ordering_settings", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => stores.id),
  isOrderingOpen: integer("is_ordering_open", { mode: "boolean" }).notNull().default(true),
  announcement: text("announcement"),
  openingHoursNotice: text("opening_hours_notice").default("08:00 - 22:30"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("store_ordering_settings_store_id_idx").on(table.storeId),
]);

export const orderRateLimits = sqliteTable("order_rate_limits", {
  bucketKey: text("bucket_key").primaryKey(),
  requestCount: integer("request_count").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("order_rate_limits_expiry_idx").on(table.expiresAt)]);

export const attendanceCorrections = sqliteTable("attendance_corrections", {
  id: text("id").primaryKey().notNull(),
  sessionId: text("session_id").notNull().references(() => attendanceSessions.id),
  eventId: text("event_id").references(() => attendanceEvents.id),
  action: text("action", { enum: ["check_in", "check_out"] }).notNull(),
  previousTime: text("previous_time"),
  effectiveTime: text("effective_time").notNull(),
  reason: text("reason").notNull(),
  actorEmail: text("actor_email").notNull(),
  sourceRequestId: text("source_request_id").references(() => requests.id),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull(),
}, table => [
  index("attendance_corrections_session_idx").on(table.sessionId, table.createdAt),
  uniqueIndex("attendance_corrections_source_request_idx").on(table.sourceRequestId).where(sql`${table.sourceRequestId} IS NOT NULL`),
  check("attendance_corrections_action",sql`${table.action} IN ('check_in','check_out')`),
]);

export const payrollAdjustments = sqliteTable("payroll_adjustments", {
  id: text("id").primaryKey().notNull(),
  storeId: text("store_id").notNull().references(() => stores.id),
  periodKey: text("period_key").notNull(),
  employeeEmail: text("employee_email").notNull(),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  actorEmail: text("actor_email").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("payroll_adjustments_period_idx").on(table.storeId, table.periodKey, table.employeeEmail), check("payroll_adjustments_amount",sql`${table.amount} <> 0 AND abs(${table.amount}) <= 100000000`)]);

export const employeeRateHistory = sqliteTable("employee_rate_history", {
  id: text("id").primaryKey().notNull(),
  storeId: text("store_id").notNull().references(() => stores.id),
  employeeEmail: text("employee_email").notNull(),
  compensationType: text("compensation_type", { enum: ["hourly", "monthly", "none"] }).notNull().default("hourly"),
  hourlyRate: integer("hourly_rate"),
  monthlySalary: integer("monthly_salary"),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("employee_rate_history_lookup_idx").on(table.storeId, table.employeeEmail, table.effectiveFrom),
]);
