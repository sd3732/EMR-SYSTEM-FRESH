-- Orders (aka ServiceRequest-lite)
CREATE TABLE IF NOT EXISTS orders (
  id            SERIAL PRIMARY KEY,
  patient_id    INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id  INTEGER REFERENCES encounters(id) ON DELETE SET NULL,
  provider_id   INTEGER REFERENCES providers(id) ON DELETE SET NULL,

  kind          TEXT NOT NULL,          -- 'lab' | 'imaging' | 'referral' | 'procedure' | 'med'
  code_system   TEXT,                   -- 'LOINC' | 'CPT' | 'SNOMED' | 'HCPCS' | 'RXNORM'...
  code          TEXT,                   -- concept code if applicable
  display       TEXT,                   -- human label, e.g. 'CBC with diff'

  status        TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('draft','active','completed','cancelled')),
  priority      TEXT
                 CHECK (priority IN ('routine','urgent','stat')),

  diagnoses     JSONB,                  -- [{system:'ICD-10', code:'J02.9', display:'Pharyngitis'}]
  notes         TEXT,

  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  needed_by     TIMESTAMPTZ,
  meta          JSONB,                  -- free bag for vendor IDs, etc.

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_patient ON orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_orders_encounter ON orders(encounter_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Results (aka DiagnosticReport-lite)
CREATE TABLE IF NOT EXISTS results (
  id            SERIAL PRIMARY KEY,
  patient_id    INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id  INTEGER REFERENCES encounters(id) ON DELETE SET NULL,
  order_id      INTEGER REFERENCES orders(id) ON DELETE SET NULL,

  report_type   TEXT,                   -- 'lab' | 'imaging' | 'pathology' ...
  status        TEXT NOT NULL DEFAULT 'final'
                 CHECK (status IN ('registered','preliminary','final','amended','corrected','cancelled','entered-in-error')),

  summary       TEXT,                   -- human-readable report summary/findings
  attachments   JSONB,                  -- [{type:'pdf', url:'/files/..', name:'...'}]
  data          JSONB,                  -- free-form structured payload if vendor gives JSON

  observed_at   TIMESTAMPTZ,
  issued_at     TIMESTAMPTZ DEFAULT NOW(),
  received_at   TIMESTAMPTZ DEFAULT NOW(),
  performer     TEXT,                   -- lab name/reader
  source        TEXT,                   -- where it came from (Quest, upload, etc.)

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_results_patient ON results(patient_id);
CREATE INDEX IF NOT EXISTS idx_results_order ON results(order_id);
CREATE INDEX IF NOT EXISTS idx_results_status ON results(status);

-- Discrete observations (rows inside a result)
CREATE TABLE IF NOT EXISTS observations (
  id              SERIAL PRIMARY KEY,
  result_id       INTEGER REFERENCES results(id) ON DELETE CASCADE,
  order_id        INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  loinc_code      TEXT,
  label           TEXT,           -- e.g. 'Hemoglobin'
  value_num       NUMERIC,
  value_text      TEXT,
  unit            TEXT,           -- 'g/dL'
  reference_range TEXT,           -- '13.5–17.5'
  interpretation  TEXT,           -- 'H'/'L'/'A' (abnormal), 'N' normal, or words
  abnormal        BOOLEAN,
  observed_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_result ON observations(result_id);
CREATE INDEX IF NOT EXISTS idx_obs_patient ON observations(patient_id);
