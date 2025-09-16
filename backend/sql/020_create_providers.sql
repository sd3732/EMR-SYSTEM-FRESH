-- 020_create_providers.sql

-- Providers table
CREATE TABLE IF NOT EXISTS providers (
  id          SERIAL PRIMARY KEY,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  specialty   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Make this "unique-ish" so we can seed safely
CREATE UNIQUE INDEX IF NOT EXISTS providers_unique
  ON providers (first_name, last_name, specialty);

-- Link patients to a provider (nullable)
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS provider_id INTEGER
  REFERENCES providers(id) ON DELETE SET NULL;

-- Seed a few providers (run once; the unique index prevents duplicates)
INSERT INTO providers (first_name, last_name, specialty) VALUES
  ('Irene', 'Medina',  'Family Medicine'),
  ('Jake',  'Medlock', 'Internal Medicine'),
  ('Katherine', 'Wu',  'Pediatrics')
ON CONFLICT ON CONSTRAINT providers_unique DO NOTHING;
