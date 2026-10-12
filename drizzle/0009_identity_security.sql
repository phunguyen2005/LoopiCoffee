ALTER TABLE employees ADD COLUMN must_change_password integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE employees ADD COLUMN password_version integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE employees ADD COLUMN password_reset_pending integer NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Old password requirements lived in user-editable provider metadata. Fail closed
-- for existing linked accounts instead of trusting that metadata during upgrade.
UPDATE employees SET must_change_password = 1 WHERE auth_user_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE audit_events ADD COLUMN store_id text;
--> statement-breakpoint
-- Only attribute legacy events when their actor has one unambiguous membership.
-- System/unknown actors remain unscoped and are hidden from store dashboards.
UPDATE audit_events SET store_id = (
  SELECT MIN(e.store_id) FROM employees e
  WHERE lower(e.email) = lower(audit_events.actor_email)
  HAVING COUNT(*) = 1
);
--> statement-breakpoint
CREATE INDEX audit_events_store_created_idx ON audit_events (store_id, created_at);
