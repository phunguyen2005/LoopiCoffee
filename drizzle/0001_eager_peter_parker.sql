CREATE TABLE `attendance_action_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_email` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attendance_action_limits_email_time_idx` ON `attendance_action_limits` (`employee_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `attendance_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`employee_reason` text NOT NULL,
	`status` text NOT NULL,
	`reviewer_email` text,
	`reviewer_note` text,
	`reviewed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `attendance_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_exceptions_event_idx` ON `attendance_exceptions` (`event_id`);--> statement-breakpoint
CREATE TABLE `attendance_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`version` integer NOT NULL,
	`early_checkin_minutes` integer NOT NULL,
	`late_minutes` integer NOT NULL,
	`early_departure_minutes` integer NOT NULL,
	`absence_minutes` integer NOT NULL,
	`missing_checkout_minutes` integer NOT NULL,
	`evidence_retention_days` integer DEFAULT 90 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_rules_store_version_idx` ON `attendance_rules` (`store_id`,`version`);--> statement-breakpoint
CREATE INDEX `attendance_rules_active_idx` ON `attendance_rules` (`store_id`,`active`);--> statement-breakpoint
CREATE TABLE `employee_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_email` text NOT NULL,
	`notice_version` text NOT NULL,
	`consented_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_consents_email_version_idx` ON `employee_consents` (`employee_email`,`notice_version`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`employee_email` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`reviewer_email` text,
	`reviewed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_employees` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`invited_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_employees`("id", "store_id", "email", "display_name", "role", "status", "invited_by", "created_at", "updated_at")
SELECT "id", 'store-loopi-nguyen-trai', "email", "display_name", "role", "status", NULL, "created_at", "created_at" FROM `employees`;--> statement-breakpoint
DROP TABLE `employees`;--> statement-breakpoint
ALTER TABLE `__new_employees` RENAME TO `employees`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `employees_email_idx` ON `employees` (`email`);--> statement-breakpoint
CREATE INDEX `employees_store_status_idx` ON `employees` (`store_id`,`status`);--> statement-breakpoint
ALTER TABLE `attendance_capture_sessions` ADD `nonce_hash` text;--> statement-breakpoint
ALTER TABLE `attendance_events` ADD `photo_status` text DEFAULT 'unavailable' NOT NULL;--> statement-breakpoint
ALTER TABLE `attendance_photos` ADD `sha256` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `attendance_sessions` ADD `rule_version_id` text REFERENCES attendance_rules(id);--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE `handovers` ADD `acknowledged_at` text;--> statement-breakpoint
ALTER TABLE `incidents` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE `shifts` ADD `timezone_snapshot` text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL;--> statement-breakpoint
ALTER TABLE `shifts` ADD `is_shift_lead` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `shifts` ADD `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `attendance_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `active_attendance_session_employee_idx` ON `attendance_sessions` (`employee_email`) WHERE `closed_at` IS NULL;
