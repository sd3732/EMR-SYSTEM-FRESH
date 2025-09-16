-- 20250829_fhir_ready.sql
-- Safe to run multiple times in dev; guards are included.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- A) Providers: add optional NPI + unique constraint when present
-- ─────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS providers
  ADD COLUMN IF NOT EXISTS npi TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname  = 'providers_npi_unique'
  ) THEN
    -- Unique only when NPI is set and non-empty
    CREATE UNIQUE INDEX providers_npi_unique
      ON providers (npi)
      WHERE npi IS NOT NULL AND npi <> '';
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────
-- B) Patients: MRN + flexible identifiers (JSONB)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS patients
  ADD COLUMN IF NOT EXISTS mrn TEXT,
  ADD COLUMN IF NOT EXISTS identifiers JSONB DEFAULT '{}'::jsonb;

-- Make sure identifiers is JSONB even if it previously existed as text
ALTER TABLE IF EXISTS patients
  ALTER COLUMN identifiers
  TYPE JSONB USING COALESCE(identifiers, '{}'::jsonb);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname  = 'patients_mrn_unique'
  ) THEN
    -- Unique only when MRN is set and non-empty
    CREATE UNIQUE INDEX patients_mrn_unique
      ON patients (mrn)
      WHERE mrn IS NOT NULL AND mrn <> '';
  END IF;
END$$;

COMMIT;
