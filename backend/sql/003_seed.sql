
INSERT INTO patients (first_name, last_name, dob, insurance_id)
VALUES
  ('Ava', 'Chen', '1990-04-12', 'A12345'),
  ('Liam', 'Patel', '1985-09-30', 'B99887')
RETURNING *;
