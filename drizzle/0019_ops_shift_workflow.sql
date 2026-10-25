ALTER TABLE `checklist_items` ADD `routine_type` text DEFAULT 'daily_routine' NOT NULL;--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `shift_id` text REFERENCES shifts(id);--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `responsible_role` text;--> statement-breakpoint
CREATE INDEX `checklist_items_shift_idx` ON `checklist_items` (`store_id`,`shift_id`);--> statement-breakpoint
ALTER TABLE `handovers` ADD `shift_id` text REFERENCES shifts(id);--> statement-breakpoint
ALTER TABLE `handovers` ADD `receiver_employee_id` text REFERENCES employees(id);--> statement-breakpoint
ALTER TABLE `handovers` ADD `next_shift_id` text REFERENCES shifts(id);--> statement-breakpoint
ALTER TABLE `handovers` ADD `acknowledged_by` text;--> statement-breakpoint
CREATE INDEX `handovers_receiver_idx` ON `handovers` (`store_id`,`receiver_employee_id`,`acknowledged_at`);--> statement-breakpoint
CREATE INDEX `handovers_next_shift_idx` ON `handovers` (`store_id`,`next_shift_id`,`acknowledged_at`);
