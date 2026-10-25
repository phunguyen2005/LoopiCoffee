ALTER TABLE `requests` ADD `correction_event_id` text REFERENCES `attendance_events`(`id`);
--> statement-breakpoint
ALTER TABLE `requests` ADD `correction_session_id` text REFERENCES `attendance_sessions`(`id`);
--> statement-breakpoint
ALTER TABLE `requests` ADD `correction_action` text;
--> statement-breakpoint
ALTER TABLE `requests` ADD `correction_effective_time` text;
--> statement-breakpoint
ALTER TABLE `requests` ADD `correction_expected_revision` integer;
--> statement-breakpoint
ALTER TABLE `attendance_corrections` ADD `source_request_id` text REFERENCES `requests`(`id`);
--> statement-breakpoint
ALTER TABLE `attendance_corrections` ADD `revision` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_corrections_source_request_idx`
ON `attendance_corrections` (`source_request_id`) WHERE `source_request_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `requests_correction_session_idx`
ON `requests` (`store_id`, `correction_session_id`, `status`);
--> statement-breakpoint
ALTER TABLE `stores` ADD `wifi_ssid` text;
--> statement-breakpoint
ALTER TABLE `stores` ADD `wifi_public_ip` text;
