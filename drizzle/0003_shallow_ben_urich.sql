CREATE INDEX `attendance_exceptions_status_event_idx` ON `attendance_exceptions` (`status`,`event_id`);--> statement-breakpoint
CREATE INDEX `attendance_sessions_store_closed_idx` ON `attendance_sessions` (`store_id`,`closed_at`);--> statement-breakpoint
CREATE INDEX `attendance_sessions_employee_activity_idx` ON `attendance_sessions` (`store_id`,`employee_email`,`opened_at`,`closed_at`);--> statement-breakpoint
CREATE INDEX `checklist_items_store_idx` ON `checklist_items` (`store_id`);--> statement-breakpoint
CREATE INDEX `handovers_store_created_idx` ON `handovers` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `incidents_store_status_idx` ON `incidents` (`store_id`,`status`);--> statement-breakpoint
CREATE INDEX `notifications_recipient_created_idx` ON `notifications` (`recipient_email`,`created_at`);--> statement-breakpoint
CREATE INDEX `requests_store_employee_created_idx` ON `requests` (`store_id`,`employee_email`,`created_at`);--> statement-breakpoint
CREATE INDEX `shifts_store_status_ends_idx` ON `shifts` (`store_id`,`status`,`ends_at`);