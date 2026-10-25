CREATE TABLE `admin_account_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`target_employee_id` text,
	`action` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_operations_actor_key_idx` ON `admin_account_operations` (`store_id`,`actor_email`,`id`);--> statement-breakpoint
CREATE TABLE `role_permission_sets` (
	`store_id` text NOT NULL,
	`role` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`store_id`, `role`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`store_id` text NOT NULL,
	`role` text NOT NULL,
	`permission_key` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`store_id`, `role`, `permission_key`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `employees` ADD `access_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
INSERT INTO `role_permission_sets` (`store_id`, `role`, `revision`, `updated_by`, `updated_at`)
SELECT `id`, roles.role, 0, 'migration:0017', CURRENT_TIMESTAMP
FROM `stores`
CROSS JOIN (SELECT 'manager' AS role UNION ALL SELECT 'team_lead') roles;--> statement-breakpoint
INSERT INTO `role_permissions` (`store_id`, `role`, `permission_key`, `created_at`)
WITH permissions(permission_key) AS (VALUES
  ('dashboard.read'), ('people.read'), ('people.update'),
  ('shifts.read_team'), ('shifts.create'), ('shifts.publish'), ('shifts.adjust'), ('shifts.cancel'),
  ('requests.leave.review'), ('requests.correction.review'), ('requests.swap.apply'),
  ('attendance.review'), ('attendance.correct'), ('attendance.evidence.read'),
  ('payroll.read'), ('payroll.finalize'), ('reports.export'),
  ('checklists.manage'), ('incidents.transition'), ('handovers.manage'),
  ('menu.manage'), ('orders.read'), ('orders.transition'), ('orders.cancel'), ('ordering.availability.manage')
)
SELECT stores.id, 'manager', permissions.permission_key, CURRENT_TIMESTAMP
FROM stores
CROSS JOIN permissions;--> statement-breakpoint
INSERT INTO `role_permissions` (`store_id`, `role`, `permission_key`, `created_at`)
WITH permissions(permission_key) AS (VALUES
  ('requests.swap.apply'), ('checklists.manage'), ('incidents.transition'), ('handovers.manage')
)
SELECT stores.id, 'team_lead', permissions.permission_key, CURRENT_TIMESTAMP
FROM stores
CROSS JOIN permissions;
