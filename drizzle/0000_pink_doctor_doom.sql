CREATE TABLE `attendance_capture_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_email` text NOT NULL,
	`store_id` text NOT NULL,
	`action` text NOT NULL,
	`issued_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `attendance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`employee_email` text NOT NULL,
	`action` text NOT NULL,
	`recorded_at` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`verification_results` text NOT NULL,
	`review_required` integer NOT NULL,
	`exception_reason` text,
	FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_idempotency_idx` ON `attendance_events` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `attendance_locations` (
	`event_id` text PRIMARY KEY NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`accuracy_meters` real NOT NULL,
	`browser_position_at` text,
	`server_received_at` text NOT NULL,
	`distance_from_store_meters` real NOT NULL,
	`expires_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`event_id`) REFERENCES `attendance_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `attendance_photos` (
	`event_id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`overlay_version` text NOT NULL,
	`expires_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`event_id`) REFERENCES `attendance_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `attendance_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_email` text NOT NULL,
	`store_id` text NOT NULL,
	`shift_id` text,
	`status` text NOT NULL,
	`opened_at` text,
	`closed_at` text,
	`worked_minutes` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`label` text NOT NULL,
	`assignee` text NOT NULL,
	`required` integer NOT NULL,
	`completed` integer NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_email_idx` ON `employees` (`email`);--> statement-breakpoint
CREATE TABLE `handovers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`author_email` text NOT NULL,
	`summary` text NOT NULL,
	`manager_attention` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`reporter_email` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_email` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`entity_href` text,
	`read_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`employee_email` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`role_label` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shifts_employee_start_idx` ON `shifts` (`employee_email`,`starts_at`);--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`created_at` text NOT NULL
);
