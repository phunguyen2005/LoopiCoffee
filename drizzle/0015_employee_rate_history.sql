CREATE TABLE IF NOT EXISTS `employee_rate_history` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL REFERENCES `stores`(`id`),
	`employee_email` text NOT NULL,
	`compensation_type` text DEFAULT 'hourly' NOT NULL,
	`hourly_rate` integer,
	`monthly_salary` integer,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `employee_rate_history_lookup_idx`
  ON `employee_rate_history` (`store_id`, `employee_email`, `effective_from`);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `employee_rate_history_no_overlap`
BEFORE INSERT ON `employee_rate_history`
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM `employee_rate_history` h
  WHERE h.store_id = NEW.store_id
    AND lower(h.employee_email) = lower(NEW.employee_email)
    AND h.compensation_type = NEW.compensation_type
    AND (
      NEW.effective_from < COALESCE(h.effective_to, '9999-12-31T23:59:59.999Z')
      AND COALESCE(NEW.effective_to, '9999-12-31T23:59:59.999Z') > h.effective_from
    )
)
BEGIN
  SELECT RAISE(ABORT, 'rate_history_overlap: Khoảng thời gian áp dụng đơn giá bị chồng lấn.');
END;
