CREATE TABLE `payroll_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`payroll_period_id` text NOT NULL,
	`employee_email` text NOT NULL,
	`approved_minutes` integer NOT NULL,
	`overtime_minutes` integer DEFAULT 0 NOT NULL,
	`allowance_amount` integer DEFAULT 0 NOT NULL,
	`bonus_amount` integer DEFAULT 0 NOT NULL,
	`deduction_amount` integer DEFAULT 0 NOT NULL,
	`total_amount` integer NOT NULL,
	`status` text DEFAULT 'payroll_finalized' NOT NULL,
	`locked_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`payroll_period_id`) REFERENCES `payroll_periods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_entries_period_employee_idx` ON `payroll_entries` (`payroll_period_id`,`employee_email`);--> statement-breakpoint
CREATE TABLE `payroll_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`status` text DEFAULT 'reviewing' NOT NULL,
	`finalized_by` text,
	`finalized_at` text,
	`reopened_by` text,
	`reopened_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_periods_store_range_idx` ON `payroll_periods` (`store_id`,`period_start`,`period_end`);--> statement-breakpoint
ALTER TABLE `employees` ADD `participates_attendance` integer;--> statement-breakpoint
ALTER TABLE `employees` ADD `payroll_eligible` integer;--> statement-breakpoint
ALTER TABLE `employees` ADD `compensation_type` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `hourly_rate` integer;--> statement-breakpoint
ALTER TABLE `employees` ADD `monthly_salary` integer;
