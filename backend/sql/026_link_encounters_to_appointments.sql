-- Link an encounter (chart) to the appointment it came from.
ALTER TABLE encounters
  ADD COLUMN IF NOT EXISTS appointment_id integer;

ALTER TABLE encounters
  ADD CONSTRAINT fk_encounters_appointment
  FOREIGN KEY (appointment_id)
  REFERENCES appointments(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_encounters_appointment_id
  ON encounters(appointment_id);
