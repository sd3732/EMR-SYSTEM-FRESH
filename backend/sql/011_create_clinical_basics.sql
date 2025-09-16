-- Providers & assignment
CREATE TABLE IF NOT EXISTS providers (
  id SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  specialty  TEXT,
  npi        TEXT
);

CREATE TABLE IF NOT EXISTS patient_providers (
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'primary', -- 'primary' for now (future: 'consulting', etc.)
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (patient_id, role)
);

-- Allergies
CREATE TYPE allergy_type AS ENUM ('medication', 'food', 'environment', 'other');
CREATE TABLE IF NOT EXISTS allergies (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  type allergy_type NOT NULL DEFAULT 'other',
  substance TEXT NOT NULL,
  reaction  TEXT,
  severity  TEXT, -- e.g., mild|moderate|severe or free text
  noted_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_allergies_patient ON allergies(patient_id, noted_at DESC);

-- Problems
CREATE TABLE IF NOT EXISTS problems (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  code TEXT,                -- ICD-10/SNOMED optional
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active|resolved
  onset_date DATE,
  resolved_date DATE,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_problems_patient ON problems(patient_id, status);

-- Medications
CREATE TABLE IF NOT EXISTS medications (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dose TEXT,
  route TEXT,
  frequency TEXT,
  started_at DATE,
  ended_at DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_medications_patient ON medications(patient_id, active);

-- Vaccines
CREATE TABLE IF NOT EXISTS vaccines (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date_administered DATE NOT NULL,
  lot TEXT,
  site TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_vaccines_patient ON vaccines(patient_id, date_administered DESC);

-- Vitals (one row per recording)
CREATE TABLE IF NOT EXISTS vitals (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  taken_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  height_cm NUMERIC(5,2),
  weight_kg NUMERIC(5,2),
  systolic  INTEGER,
  diastolic INTEGER,
  pulse     INTEGER,
  temp_c    NUMERIC(4,1),
  spo2      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_vitals_patient ON vitals(patient_id, taken_at DESC);

-- Results (labs/imaging summaries)
CREATE TABLE IF NOT EXISTS results (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,   -- e.g., "Hemoglobin A1c"
  value TEXT,
  unit  TEXT,
  ref_range TEXT,
  observed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_results_patient ON results(patient_id, observed_at DESC);
