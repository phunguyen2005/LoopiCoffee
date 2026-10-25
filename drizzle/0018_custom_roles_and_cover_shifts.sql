CREATE TABLE `custom_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_roles_store_name_idx` ON `custom_roles` (`store_id`, `name`);
--> statement-breakpoint
ALTER TABLE `employees` ADD `role_id` text REFERENCES `custom_roles`(`id`);
--> statement-breakpoint
ALTER TABLE `shifts` ADD `cover_for_shift_id` text REFERENCES `shifts`(`id`);
--> statement-breakpoint
CREATE INDEX `shifts_cover_for_shift_idx` ON `shifts` (`store_id`, `cover_for_shift_id`);
