-- 028_backfill_patient_provider.sql
-- Backfill patients.provider_id from their most-recent appointment (if any).
-- Safe to run multiple times.

BEGIN;

DO $$
DECLARE
  col_start text;
  dyn_sql   text;
BEGIN
  -- Detect the timestamp column used for appointment start
  SELECT CASE
           WHEN EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name   = 'appointments'
               AND column_name  = 'start'
           ) THEN 'start'
           WHEN EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name   = 'appointments'
               AND column_name  = 'starts_at'
           ) THEN 'starts_at'
           WHEN EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name   = 'appointments'
               AND column_name  = 'start_time'
           ) THEN 'start_time'
           ELSE NULL
         END
    INTO col_start;

  IF col_start IS NULL THEN
    RAISE NOTICE 'No suitable start column found on table appointments; skipping backfill.';
    RETURN;
  END IF;

  -- Backfill using DISTINCT ON to get the latest appointment per patient
  dyn_sql := format($f$
    WITH latest AS (
      SELECT DISTINCT ON (patient_id)
             patient_id, provider_id, %I AS s
      FROM appointments
      WHERE patient_id IS NOT NULL
        AND provider_id IS NOT NULL
      ORDER BY patient_id, %I DESC
    )
    UPDATE patients p
       SET provider_id = l.provider_id
      FROM latest l
     WHERE p.id = l.patient_id
       AND p.provider_id IS NULL;
  $f$, col_start, col_start);

  EXECUTE dyn_sql;
END $$;

COMMIT;
