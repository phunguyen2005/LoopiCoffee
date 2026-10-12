ALTER TABLE `payroll_entries` ADD `row_snapshot` text;--> statement-breakpoint
ALTER TABLE `payroll_entries` ADD `snapshot_version` integer DEFAULT 0 NOT NULL;