BEGIN;

-- Columns used by the Intake tab
ALTER TABLE encounters
  ADD COLUMN IF NOT EXISTS intake jsonb,
  ADD COLUMN IF NOT EXISTS ros    jsonb,
  ADD COLUMN IF NOT EXISTS reason text;

COMMIT;
