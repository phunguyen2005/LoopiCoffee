CREATE INDEX IF NOT EXISTS `customer_orders_store_created_idx` ON `customer_orders` (`store_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `attendance_photos_expires_idx` ON `attendance_photos` (`expires_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `attendance_locations_expires_idx` ON `attendance_locations` (`expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `employees_email_lower_idx` ON `employees` (lower(`email`));
