-- providers (minimal)
CREATE TABLE IF NOT EXISTS providers (
  id          SERIAL PRIMARY KEY,
  name        TEXT,                 -- optional "display" name
  first_name  TEXT,
  last_name   TEXT,
  specialty   TEXT,
  color       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- seed one provider so the calendar has someone to show
INSERT INTO providers (name, first_name, last_name, specialty, color)
SELECT 'Irene Medina', 'Irene', 'Medina', 'Primary Care', '#444'
WHERE NOT EXISTS (SELECT 1 FROM providers);

-- appointments
CREATE TABLE IF NOT EXISTS appointments (
  id           SERIAL PRIMARY KEY,
  provider_id  INTEGER NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  patient_id   INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  start_ts     TIMESTAMPTZ NOT NULL,
  end_ts       TIMESTAMPTZ NOT NULL,
  title        TEXT,
  type         TEXT,
  status       TEXT NOT NULL DEFAULT 'booked', -- booked|checked_in|completed|cancelled...
  notes        TEXT,
  room         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- useful index for day/provider queries
CREATE INDEX IF NOT EXISTS idx_appts_provider_start
  ON appointments (provider_id, start_ts);
