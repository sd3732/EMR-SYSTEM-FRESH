-- Migration: Populate medications table with common drugs
-- This adds frequently prescribed medications to the database

INSERT INTO medications (
    generic_name, brand_name, drug_class, therapeutic_class, 
    dosage_form, strength, strength_numeric, strength_unit,
    controlled_substance, schedule, generic_available,
    typical_dose_min, typical_dose_max, typical_frequency
) VALUES
    -- Cardiovascular medications
    ('lisinopril', 'Prinivil', 'ACE Inhibitor', 'Cardiovascular', 'tablet', '10mg', 10, 'mg', false, null, true, 5, 40, 'QD'),
    ('lisinopril', 'Prinivil', 'ACE Inhibitor', 'Cardiovascular', 'tablet', '20mg', 20, 'mg', false, null, true, 5, 40, 'QD'),
    ('amlodipine', 'Norvasc', 'Calcium Channel Blocker', 'Cardiovascular', 'tablet', '5mg', 5, 'mg', false, null, true, 2.5, 10, 'QD'),
    ('amlodipine', 'Norvasc', 'Calcium Channel Blocker', 'Cardiovascular', 'tablet', '10mg', 10, 'mg', false, null, true, 2.5, 10, 'QD'),
    ('metoprolol', 'Lopressor', 'Beta Blocker', 'Cardiovascular', 'tablet', '25mg', 25, 'mg', false, null, true, 25, 400, 'BID'),
    ('metoprolol', 'Lopressor', 'Beta Blocker', 'Cardiovascular', 'tablet', '50mg', 50, 'mg', false, null, true, 25, 400, 'BID'),
    ('atorvastatin', 'Lipitor', 'Statin', 'Cardiovascular', 'tablet', '20mg', 20, 'mg', false, null, true, 10, 80, 'QD'),
    ('atorvastatin', 'Lipitor', 'Statin', 'Cardiovascular', 'tablet', '40mg', 40, 'mg', false, null, true, 10, 80, 'QD'),

    -- Diabetes medications
    ('metformin', 'Glucophage', 'Biguanide', 'Antidiabetic', 'tablet', '500mg', 500, 'mg', false, null, true, 500, 2000, 'BID'),
    ('metformin', 'Glucophage', 'Biguanide', 'Antidiabetic', 'tablet', '1000mg', 1000, 'mg', false, null, true, 500, 2000, 'BID'),
    ('glipizide', 'Glucotrol', 'Sulfonylurea', 'Antidiabetic', 'tablet', '5mg', 5, 'mg', false, null, true, 2.5, 20, 'BID'),
    ('insulin glargine', 'Lantus', 'Long-acting Insulin', 'Antidiabetic', 'injection', '100 units/ml', 100, 'units/ml', false, null, false, 10, 100, 'QD'),

    -- Antibiotics
    ('amoxicillin', 'Amoxil', 'Penicillin', 'Antibiotic', 'capsule', '500mg', 500, 'mg', false, null, true, 250, 1000, 'TID'),
    ('azithromycin', 'Zithromax', 'Macrolide', 'Antibiotic', 'tablet', '250mg', 250, 'mg', false, null, true, 250, 500, 'QD'),
    ('ciprofloxacin', 'Cipro', 'Fluoroquinolone', 'Antibiotic', 'tablet', '500mg', 500, 'mg', false, null, true, 250, 750, 'BID'),
    ('doxycycline', 'Vibramycin', 'Tetracycline', 'Antibiotic', 'capsule', '100mg', 100, 'mg', false, null, true, 100, 200, 'BID'),

    -- Pain medications
    ('acetaminophen', 'Tylenol', 'Analgesic', 'Pain Management', 'tablet', '325mg', 325, 'mg', false, null, true, 325, 1000, 'QID'),
    ('acetaminophen', 'Tylenol', 'Analgesic', 'Pain Management', 'tablet', '500mg', 500, 'mg', false, null, true, 325, 1000, 'QID'),
    ('ibuprofen', 'Advil', 'NSAID', 'Pain Management', 'tablet', '200mg', 200, 'mg', false, null, true, 200, 800, 'TID'),
    ('ibuprofen', 'Advil', 'NSAID', 'Pain Management', 'tablet', '400mg', 400, 'mg', false, null, true, 200, 800, 'TID'),
    ('ibuprofen', 'Advil', 'NSAID', 'Pain Management', 'tablet', '600mg', 600, 'mg', false, null, true, 200, 800, 'TID'),
    ('naproxen', 'Aleve', 'NSAID', 'Pain Management', 'tablet', '220mg', 220, 'mg', false, null, true, 220, 660, 'BID'),

    -- Controlled substances
    ('hydrocodone/acetaminophen', 'Vicodin', 'Opioid Combination', 'Pain Management', 'tablet', '5mg/325mg', 5, 'mg', true, 'C-II', false, 5, 10, 'QID'),
    ('oxycodone', 'OxyContin', 'Opioid', 'Pain Management', 'tablet', '5mg', 5, 'mg', true, 'C-II', true, 5, 80, 'QID'),
    ('tramadol', 'Ultram', 'Opioid-like', 'Pain Management', 'tablet', '50mg', 50, 'mg', true, 'C-IV', true, 50, 400, 'QID'),
    ('lorazepam', 'Ativan', 'Benzodiazepine', 'Anxiolytic', 'tablet', '0.5mg', 0.5, 'mg', true, 'C-IV', true, 0.5, 6, 'TID'),
    ('alprazolam', 'Xanax', 'Benzodiazepine', 'Anxiolytic', 'tablet', '0.25mg', 0.25, 'mg', true, 'C-IV', true, 0.25, 4, 'TID'),

    -- Mental Health
    ('sertraline', 'Zoloft', 'SSRI', 'Antidepressant', 'tablet', '25mg', 25, 'mg', false, null, true, 25, 200, 'QD'),
    ('sertraline', 'Zoloft', 'SSRI', 'Antidepressant', 'tablet', '50mg', 50, 'mg', false, null, true, 25, 200, 'QD'),
    ('escitalopram', 'Lexapro', 'SSRI', 'Antidepressant', 'tablet', '10mg', 10, 'mg', false, null, true, 5, 20, 'QD'),
    ('fluoxetine', 'Prozac', 'SSRI', 'Antidepressant', 'capsule', '20mg', 20, 'mg', false, null, true, 10, 80, 'QD'),

    -- Respiratory
    ('albuterol', 'ProAir HFA', 'Beta-2 Agonist', 'Bronchodilator', 'inhaler', '90mcg/puff', 0.09, 'mg', false, null, true, 90, 180, 'PRN'),
    ('montelukast', 'Singulair', 'Leukotriene Antagonist', 'Asthma', 'tablet', '10mg', 10, 'mg', false, null, true, 10, 10, 'QD'),
    ('fluticasone', 'Flonase', 'Corticosteroid', 'Nasal Spray', 'nasal spray', '50mcg/spray', 0.05, 'mg', false, null, true, 50, 200, 'QD'),

    -- Gastrointestinal
    ('omeprazole', 'Prilosec', 'PPI', 'Acid Reducer', 'capsule', '20mg', 20, 'mg', false, null, true, 10, 40, 'QD'),
    ('pantoprazole', 'Protonix', 'PPI', 'Acid Reducer', 'tablet', '40mg', 40, 'mg', false, null, true, 20, 40, 'QD'),
    ('ranitidine', 'Zantac', 'H2 Blocker', 'Acid Reducer', 'tablet', '150mg', 150, 'mg', false, null, true, 75, 300, 'BID'),

    -- Dermatology
    ('hydrocortisone', 'Cortaid', 'Topical Corticosteroid', 'Anti-inflammatory', 'cream', '1%', 1, '%', false, null, true, null, null, 'TID'),
    ('mupirocin', 'Bactroban', 'Topical Antibiotic', 'Antibiotic', 'ointment', '2%', 2, '%', false, null, true, null, null, 'TID'),

    -- Thyroid
    ('levothyroxine', 'Synthroid', 'Thyroid Hormone', 'Endocrine', 'tablet', '25mcg', 0.025, 'mg', false, null, true, 25, 300, 'QD'),
    ('levothyroxine', 'Synthroid', 'Thyroid Hormone', 'Endocrine', 'tablet', '50mcg', 0.05, 'mg', false, null, true, 25, 300, 'QD'),
    ('levothyroxine', 'Synthroid', 'Thyroid Hormone', 'Endocrine', 'tablet', '75mcg', 0.075, 'mg', false, null, true, 25, 300, 'QD'),
    ('levothyroxine', 'Synthroid', 'Thyroid Hormone', 'Endocrine', 'tablet', '100mcg', 0.1, 'mg', false, null, true, 25, 300, 'QD'),

    -- Women''s Health
    ('ethinyl estradiol/norgestimate', 'Ortho Tri-Cyclen', 'Oral Contraceptive', 'Contraceptive', 'tablet', '0.035mg/0.25mg', 0.035, 'mg', false, null, false, null, null, 'QD');

-- Update search vectors for all medications
UPDATE medications SET search_vector = to_tsvector('english', 
    COALESCE(generic_name, '') || ' ' ||
    COALESCE(brand_name, '') || ' ' ||
    COALESCE(drug_class, '') || ' ' ||
    COALESCE(therapeutic_class, '')
);