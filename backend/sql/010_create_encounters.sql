-- Encounters/Visits table
CREATE TABLE IF NOT EXISTS encounters (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  reason TEXT,                                 -- e.g., "Annual physical"
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ,                        -- null while visit is open
  notes TEXT
);

-- Speed up queries "by patient, newest first"
CREATE INDEX IF NOT EXISTS idx_encounters_patient_id_started_at
  ON encounters (patient_id, started_at DESC);