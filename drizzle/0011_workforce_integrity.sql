ALTER TABLE stores ADD workforce_revision integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE attendance_sessions ADD revision integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE attendance_events ADD capture_session_id text REFERENCES attendance_capture_sessions(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX attendance_events_capture_idx ON attendance_events(capture_session_id) WHERE capture_session_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE shifts ADD revision integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE shifts ADD approved_leave_request_id text REFERENCES requests(id);
--> statement-breakpoint
ALTER TABLE requests ADD shift_id text REFERENCES shifts(id);
--> statement-breakpoint
ALTER TABLE requests ADD starts_at text;
--> statement-breakpoint
ALTER TABLE requests ADD ends_at text;
--> statement-breakpoint
ALTER TABLE requests ADD client_request_key text;
--> statement-breakpoint
CREATE UNIQUE INDEX requests_client_key_idx ON requests(employee_email, client_request_key) WHERE client_request_key IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER attendance_session_revision_guard BEFORE UPDATE OF opened_at, closed_at, worked_minutes, status ON attendance_sessions
WHEN NEW.revision <> OLD.revision + 1 BEGIN SELECT RAISE(ABORT, 'attendance_conflict'); END;
--> statement-breakpoint
CREATE TABLE attendance_corrections (
  id text PRIMARY KEY NOT NULL,
  session_id text NOT NULL REFERENCES attendance_sessions(id),
  event_id text REFERENCES attendance_events(id),
  action text NOT NULL CHECK (action IN ('check_in', 'check_out')),
  previous_time text,
  effective_time text NOT NULL,
  reason text NOT NULL,
  actor_email text NOT NULL,
  created_at text NOT NULL
);
--> statement-breakpoint
CREATE INDEX attendance_corrections_session_idx ON attendance_corrections(session_id, created_at);
--> statement-breakpoint
CREATE TRIGGER attendance_corrections_immutable_update BEFORE UPDATE ON attendance_corrections BEGIN SELECT RAISE(ABORT, 'immutable_attendance_correction'); END;
--> statement-breakpoint
CREATE TRIGGER attendance_corrections_immutable_delete BEFORE DELETE ON attendance_corrections BEGIN SELECT RAISE(ABORT, 'immutable_attendance_correction'); END;
--> statement-breakpoint
CREATE TABLE payroll_adjustments (
  id text PRIMARY KEY NOT NULL,
  store_id text NOT NULL REFERENCES stores(id),
  period_key text NOT NULL,
  employee_email text NOT NULL,
  amount integer NOT NULL CHECK (amount <> 0 AND abs(amount) <= 100000000),
  reason text NOT NULL,
  actor_email text NOT NULL,
  created_at text NOT NULL
);
--> statement-breakpoint
CREATE INDEX payroll_adjustments_period_idx ON payroll_adjustments(store_id, period_key, employee_email);
--> statement-breakpoint
CREATE TRIGGER payroll_adjustments_immutable_update BEFORE UPDATE ON payroll_adjustments BEGIN SELECT RAISE(ABORT, 'immutable_payroll_adjustment'); END;
--> statement-breakpoint
CREATE TRIGGER payroll_adjustments_immutable_delete BEFORE DELETE ON payroll_adjustments BEGIN SELECT RAISE(ABORT, 'immutable_payroll_adjustment'); END;
--> statement-breakpoint
CREATE TRIGGER shifts_no_overlap_insert BEFORE INSERT ON shifts
WHEN NEW.status IN ('draft', 'published') AND NEW.approved_leave_request_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'shift_overlap') WHERE EXISTS (
    SELECT 1 FROM shifts s WHERE lower(s.employee_email) = lower(NEW.employee_email)
      AND s.store_id = NEW.store_id AND s.status IN ('draft', 'published') AND s.approved_leave_request_id IS NULL
      AND s.starts_at < NEW.ends_at AND s.ends_at > NEW.starts_at
  );
END;
--> statement-breakpoint
CREATE TRIGGER shifts_no_overlap_update BEFORE UPDATE OF starts_at, ends_at, employee_email, status, approved_leave_request_id ON shifts
WHEN NEW.status IN ('draft', 'published') AND NEW.approved_leave_request_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'shift_overlap') WHERE EXISTS (
    SELECT 1 FROM shifts s WHERE s.id <> NEW.id AND lower(s.employee_email) = lower(NEW.employee_email)
      AND s.store_id = NEW.store_id AND s.status IN ('draft', 'published') AND s.approved_leave_request_id IS NULL
      AND s.starts_at < NEW.ends_at AND s.ends_at > NEW.starts_at
  );
END;
--> statement-breakpoint
CREATE TRIGGER attendance_revision_insert AFTER INSERT ON attendance_sessions BEGIN UPDATE stores SET workforce_revision = workforce_revision + 1 WHERE id = NEW.store_id; END;
--> statement-breakpoint
CREATE TRIGGER attendance_revision_update AFTER UPDATE ON attendance_sessions BEGIN UPDATE stores SET workforce_revision = workforce_revision + 1 WHERE id = NEW.store_id; END;
--> statement-breakpoint
CREATE TRIGGER attendance_revision_delete AFTER DELETE ON attendance_sessions BEGIN UPDATE stores SET workforce_revision = workforce_revision + 1 WHERE id = OLD.store_id; END;
--> statement-breakpoint
CREATE TRIGGER employee_payroll_revision AFTER UPDATE OF status, participates_attendance, payroll_eligible, compensation_type, hourly_rate, monthly_salary, display_name ON employees BEGIN UPDATE stores SET workforce_revision = workforce_revision + 1 WHERE id = NEW.store_id; END;
--> statement-breakpoint
CREATE TRIGGER shifts_revision_insert AFTER INSERT ON shifts BEGIN UPDATE stores SET workforce_revision = workforce_revision + 1 WHERE id = NEW.store_id; END;
--> statement-breakpoint
CREATE TRIGGER shifts_revision_update AFTER UPDATE ON shifts BEGIN UPDATE stores SET workforce_revision = workforce_revision + 1 WHERE id = NEW.store_id; END;
--> statement-breakpoint
CREATE TRIGGER payroll_adjustments_revision AFTER INSERT ON payroll_adjustments BEGIN UPDATE stores SET workforce_revision = workforce_revision + 1 WHERE id = NEW.store_id; END;
