CREATE TRIGGER shifts_locked_period_insert BEFORE INSERT ON shifts
WHEN NEW.status <> 'cancelled'
BEGIN
  SELECT RAISE(ABORT, 'shift_locked_period') WHERE EXISTS (
    SELECT 1 FROM payroll_periods p WHERE p.store_id = NEW.store_id
      AND p.status IN ('finalized', 'paid') AND p.period_start < NEW.ends_at AND p.period_end > NEW.starts_at
  );
END;
