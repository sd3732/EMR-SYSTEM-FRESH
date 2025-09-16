BEGIN;

-- 1) add a nullable "primary provider" reference
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS provider_id integer;

-- 2) foreign key + on delete set null
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'patients_provider_id_fkey'
  ) THEN
    ALTER TABLE patients
      ADD CONSTRAINT patients_provider_id_fkey
      FOREIGN KEY (provider_id) REFERENCES providers(id)
      ON DELETE SET NULL;
  END IF;
END$$;

-- 3) index for quick lookups (provider panel)
CREATE INDEX IF NOT EXISTS idx_patients_provider_id ON patients(provider_id);

-- 4) optional backfill: use the most recent appointment per patient
WITH latest AS (
  SELECT patient_id, provider_id
  FROM (
    SELECT a.patient_id,
           a.provider_id,
           ROW_NUMBER() OVER (PARTITION BY a.patient_id ORDER BY a."start" DESC) AS rn
    FROM appointments a
  ) x
  WHERE rn = 1
)
UPDATE patients p
SET provider_id = l.provider_id
FROM latest l
WHERE p.id = l.patient_id
  AND p.provider_id IS NULL;

COMMIT;
