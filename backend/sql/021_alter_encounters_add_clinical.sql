BEGIN;

-- Add the new clinical fields if missing
ALTER TABLE encounters
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'open' NOT NULL,
  ADD COLUMN IF NOT EXISTS hpi    text,
  ADD COLUMN IF NOT EXISTS vitals jsonb;

-- Make sure we have created_at (code expects this):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='encounters' AND column_name='created_at'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='encounters' AND column_name='started_at'
    ) THEN
      ALTER TABLE encounters RENAME COLUMN started_at TO created_at;
    ELSE
      ALTER TABLE encounters ADD COLUMN created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL;
    END IF;
  END IF;
END$$;

-- Helpful index for listing visits
CREATE INDEX IF NOT EXISTS idx_encounters_patient_id_created_at
  ON encounters (patient_id, created_at DESC);

COMMIT;
