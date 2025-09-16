-- One-time: create the initial patients table for Phase 1
CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  dob DATE NOT NULL,
  insurance_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);