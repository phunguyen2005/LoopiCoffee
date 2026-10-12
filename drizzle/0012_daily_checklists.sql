CREATE TABLE checklist_executions (
  item_id text NOT NULL REFERENCES checklist_items(id),
  business_date text NOT NULL,
  completed integer NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  completed_at text,
  completed_by text,
  updated_at text NOT NULL,
  PRIMARY KEY (item_id, business_date)
);
--> statement-breakpoint
CREATE INDEX checklist_executions_date_idx ON checklist_executions (business_date, item_id);
--> statement-breakpoint
-- Preserve legacy completions on their actual business day, not forever.
INSERT INTO checklist_executions (item_id,business_date,completed,completed_at,completed_by,updated_at)
SELECT id,date(completed_at,'+7 hours'),1,completed_at,NULL,updated_at
FROM checklist_items WHERE completed = 1 AND completed_at IS NOT NULL AND date(completed_at) IS NOT NULL;
