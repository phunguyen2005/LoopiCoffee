-- Repair columns present in the Drizzle snapshot but absent from migrations 0000-0005.
-- Preflight existing installations: legacy runtime-created databases may already
-- contain these columns and must be reconciled before applying this migration.
ALTER TABLE `employees` ADD `job_title` text DEFAULT 'Barista';
--> statement-breakpoint
ALTER TABLE `employees` ADD `phone` text;
--> statement-breakpoint
ALTER TABLE `employees` ADD `start_date` text;
--> statement-breakpoint
ALTER TABLE `employees` ADD `last_login_at` text;
--> statement-breakpoint
ALTER TABLE `stores` ADD `geofence_radius_meters` integer DEFAULT 100 NOT NULL;
