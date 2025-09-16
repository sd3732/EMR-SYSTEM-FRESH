-- 031_link_results_to_orders.sql
BEGIN;

-- 1) Add the column (nullable so historical results without orders still fit)
ALTER TABLE results
  ADD COLUMN IF NOT EXISTS order_id INTEGER;

-- 2) Add the FK (use a conditional block since Postgres has no IF NOT EXISTS here)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'results_order_id_fkey'
  ) THEN
    ALTER TABLE results
      ADD CONSTRAINT results_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id)
      ON DELETE SET NULL;         -- if an order is deleted, keep the result (unlink)
  END IF;
END $$;

-- 3) Index for fast lookups/grouping by order
CREATE INDEX IF NOT EXISTS idx_results_order ON results(order_id);

-- 4) Optional backfill (safe, best-effort):
--    Try to link existing results to orders by:
--      * same patient
--      * same display/name (case-insensitive)
--      * closest-in-time within a reasonable window (requested vs observed)
--    (You can run this now; it only fills where order_id IS NULL.)
WITH candidates AS (
  SELECT
    r.id  AS rid,
    o.id  AS oid,
    row_number() OVER (
      PARTITION BY r.id
      ORDER BY ABS(EXTRACT(EPOCH FROM (COALESCE(r.observed_at, NOW()) - COALESCE(o.requested_at, NOW()))))
    ) AS rn
  FROM results r
  JOIN orders  o
    ON o.patient_id = r.patient_id
   AND lower(trim(o.display)) = lower(trim(r.name))
   AND r.observed_at BETWEEN o.requested_at - INTERVAL '7 days'
                          AND o.requested_at + INTERVAL '30 days'
  WHERE r.order_id IS NULL
)
UPDATE results r
SET order_id = c.oid
FROM candidates c
WHERE r.id = c.rid AND c.rn = 1;

COMMIT;
