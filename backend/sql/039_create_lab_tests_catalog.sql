-- 039_create_lab_tests_catalog.sql
-- Lab tests catalog with common laboratory tests

CREATE TABLE lab_tests (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    specimen_type VARCHAR(50) NOT NULL DEFAULT 'blood',
    collection_method VARCHAR(100),
    turnaround_time_hours INTEGER DEFAULT 24,
    fasting_required BOOLEAN DEFAULT false,
    special_instructions TEXT,
    active BOOLEAN DEFAULT true,
    cost_cents INTEGER DEFAULT 0,
    search_vector TSVECTOR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create search index for lab tests
CREATE INDEX idx_lab_tests_search ON lab_tests USING gin(search_vector);
CREATE INDEX idx_lab_tests_category ON lab_tests(category);
CREATE INDEX idx_lab_tests_active ON lab_tests(active);

-- Function to update search vector
CREATE OR REPLACE FUNCTION update_lab_tests_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', 
        COALESCE(NEW.name, '') || ' ' ||
        COALESCE(NEW.code, '') || ' ' ||
        COALESCE(NEW.category, '') || ' ' ||
        COALESCE(NEW.subcategory, '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lab_tests_search_vector_update
    BEFORE INSERT OR UPDATE ON lab_tests
    FOR EACH ROW EXECUTE FUNCTION update_lab_tests_search_vector();

-- Insert common lab tests
INSERT INTO lab_tests (code, name, category, subcategory, specimen_type, fasting_required, special_instructions, cost_cents) VALUES
-- Hematology
('CBC', 'Complete Blood Count with Differential', 'Hematology', 'Complete Blood Count', 'blood', false, 'EDTA tube (purple top)', 2500),
('CBCWD', 'CBC with Differential and Platelets', 'Hematology', 'Complete Blood Count', 'blood', false, 'EDTA tube (purple top)', 3000),
('ESR', 'Erythrocyte Sedimentation Rate', 'Hematology', 'Inflammatory Markers', 'blood', false, 'EDTA tube (purple top)', 1500),
('PT', 'Prothrombin Time', 'Hematology', 'Coagulation', 'blood', false, 'Sodium citrate tube (blue top)', 2000),
('PTT', 'Partial Thromboplastin Time', 'Hematology', 'Coagulation', 'blood', false, 'Sodium citrate tube (blue top)', 2000),
('INR', 'International Normalized Ratio', 'Hematology', 'Coagulation', 'blood', false, 'Sodium citrate tube (blue top)', 2200),

-- Chemistry - Basic Metabolic Panel
('BMP', 'Basic Metabolic Panel', 'Chemistry', 'Electrolytes', 'blood', true, 'Fast 8-12 hours. SST tube (gold top)', 3500),
('CMP', 'Comprehensive Metabolic Panel', 'Chemistry', 'Electrolytes', 'blood', true, 'Fast 8-12 hours. SST tube (gold top)', 4500),
('GLUCOSE', 'Glucose, Fasting', 'Chemistry', 'Diabetes', 'blood', true, 'Fast 8-12 hours. Gray top tube preferred', 1200),
('HBA1C', 'Hemoglobin A1c', 'Chemistry', 'Diabetes', 'blood', false, 'EDTA tube (purple top)', 4000),
('CREAT', 'Creatinine', 'Chemistry', 'Kidney Function', 'blood', false, 'SST tube (gold top)', 1500),
('BUN', 'Blood Urea Nitrogen', 'Chemistry', 'Kidney Function', 'blood', false, 'SST tube (gold top)', 1200),
('EGFR', 'Estimated GFR', 'Chemistry', 'Kidney Function', 'blood', false, 'Calculated from creatinine', 0),

-- Lipid Panel
('LIPID', 'Lipid Panel', 'Chemistry', 'Cardiovascular', 'blood', true, 'Fast 9-12 hours. SST tube (gold top)', 3800),
('CHOL', 'Total Cholesterol', 'Chemistry', 'Cardiovascular', 'blood', true, 'Fast 9-12 hours. SST tube (gold top)', 1500),
('HDL', 'HDL Cholesterol', 'Chemistry', 'Cardiovascular', 'blood', true, 'Fast 9-12 hours. SST tube (gold top)', 1800),
('LDL', 'LDL Cholesterol', 'Chemistry', 'Cardiovascular', 'blood', true, 'Fast 9-12 hours. SST tube (gold top)', 2000),
('TRIG', 'Triglycerides', 'Chemistry', 'Cardiovascular', 'blood', true, 'Fast 9-12 hours. SST tube (gold top)', 1800),

-- Liver Function
('ALT', 'Alanine Aminotransferase', 'Chemistry', 'Liver Function', 'blood', false, 'SST tube (gold top)', 1500),
('AST', 'Aspartate Aminotransferase', 'Chemistry', 'Liver Function', 'blood', false, 'SST tube (gold top)', 1500),
('ALKP', 'Alkaline Phosphatase', 'Chemistry', 'Liver Function', 'blood', false, 'SST tube (gold top)', 1500),
('BILI', 'Total Bilirubin', 'Chemistry', 'Liver Function', 'blood', false, 'SST tube (gold top)', 1800),
('DBILI', 'Direct Bilirubin', 'Chemistry', 'Liver Function', 'blood', false, 'SST tube (gold top)', 2000),
('ALB', 'Albumin', 'Chemistry', 'Liver Function', 'blood', false, 'SST tube (gold top)', 1200),

-- Thyroid Function
('TSH', 'Thyroid Stimulating Hormone', 'Chemistry', 'Thyroid', 'blood', false, 'SST tube (gold top)', 4500),
('T4', 'Thyroxine, Free', 'Chemistry', 'Thyroid', 'blood', false, 'SST tube (gold top)', 5000),
('T3', 'Triiodothyronine, Free', 'Chemistry', 'Thyroid', 'blood', false, 'SST tube (gold top)', 5500),

-- Cardiac Markers
('TROP', 'Troponin I', 'Chemistry', 'Cardiac', 'blood', false, 'STAT processing available. SST tube', 8000),
('CK', 'Creatine Kinase', 'Chemistry', 'Cardiac', 'blood', false, 'SST tube (gold top)', 2000),
('CKMB', 'CK-MB', 'Chemistry', 'Cardiac', 'blood', false, 'SST tube (gold top)', 2500),
('BNP', 'B-Type Natriuretic Peptide', 'Chemistry', 'Cardiac', 'blood', false, 'EDTA tube (purple top)', 12000),

-- Inflammatory Markers
('CRP', 'C-Reactive Protein', 'Chemistry', 'Inflammatory', 'blood', false, 'SST tube (gold top)', 2500),
('HCRP', 'High-Sensitivity C-Reactive Protein', 'Chemistry', 'Inflammatory', 'blood', false, 'SST tube (gold top)', 4000),

-- Vitamins
('B12', 'Vitamin B12', 'Chemistry', 'Vitamins', 'blood', false, 'SST tube (gold top)', 6000),
('FOLATE', 'Folate, Serum', 'Chemistry', 'Vitamins', 'blood', false, 'SST tube (gold top)', 5500),
('VitD', 'Vitamin D, 25-Hydroxy', 'Chemistry', 'Vitamins', 'blood', false, 'SST tube (gold top)', 8500),

-- Urinalysis
('UA', 'Urinalysis, Complete', 'Urinalysis', 'Routine', 'urine', false, 'Clean catch midstream. Sterile container', 2000),
('UMIC', 'Urine Microscopy', 'Urinalysis', 'Microscopic', 'urine', false, 'Fresh specimen preferred', 1500),
('UCULT', 'Urine Culture', 'Microbiology', 'Culture', 'urine', false, 'Sterile collection required', 4500),

-- Microbiology
('STREP', 'Strep A Rapid', 'Microbiology', 'Rapid Test', 'throat swab', false, 'Throat swab, avoid touching teeth/tongue', 3000),
('MONO', 'Monospot Test', 'Microbiology', 'Rapid Test', 'blood', false, 'SST tube (gold top)', 2500);

-- Create table for lab test components (for panel tests)
CREATE TABLE lab_test_components (
    id SERIAL PRIMARY KEY,
    lab_test_id INTEGER NOT NULL REFERENCES lab_tests(id) ON DELETE CASCADE,
    component_code VARCHAR(20) NOT NULL,
    component_name VARCHAR(255) NOT NULL,
    unit VARCHAR(50),
    reference_range_male VARCHAR(100),
    reference_range_female VARCHAR(100),
    reference_range_pediatric VARCHAR(100),
    critical_low DECIMAL(10,3),
    critical_high DECIMAL(10,3),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lab_test_components_test_id ON lab_test_components(lab_test_id);

-- Insert common test components for CBC
INSERT INTO lab_test_components (lab_test_id, component_code, component_name, unit, reference_range_male, reference_range_female, critical_low, critical_high, sort_order) VALUES
-- CBC Components
((SELECT id FROM lab_tests WHERE code = 'CBC'), 'WBC', 'White Blood Cells', 'K/uL', '4.5-11.0', '4.5-11.0', 1.0, 50.0, 1),
((SELECT id FROM lab_tests WHERE code = 'CBC'), 'RBC', 'Red Blood Cells', 'M/uL', '4.5-5.9', '4.0-5.2', 2.0, 7.0, 2),
((SELECT id FROM lab_tests WHERE code = 'CBC'), 'HGB', 'Hemoglobin', 'g/dL', '14.0-17.5', '12.0-15.5', 7.0, 20.0, 3),
((SELECT id FROM lab_tests WHERE code = 'CBC'), 'HCT', 'Hematocrit', '%', '42-52', '37-47', 20.0, 60.0, 4),
((SELECT id FROM lab_tests WHERE code = 'CBC'), 'PLT', 'Platelets', 'K/uL', '150-450', '150-450', 50.0, 1000.0, 5),

-- CMP Components
((SELECT id FROM lab_tests WHERE code = 'CMP'), 'GLUC', 'Glucose', 'mg/dL', '70-99', '70-99', 40.0, 500.0, 1),
((SELECT id FROM lab_tests WHERE code = 'CMP'), 'BUN', 'BUN', 'mg/dL', '7-20', '7-20', 2.0, 100.0, 2),
((SELECT id FROM lab_tests WHERE code = 'CMP'), 'CREAT', 'Creatinine', 'mg/dL', '0.7-1.3', '0.6-1.1', 0.3, 15.0, 3),
((SELECT id FROM lab_tests WHERE code = 'CMP'), 'NA', 'Sodium', 'mEq/L', '136-145', '136-145', 120.0, 160.0, 4),
((SELECT id FROM lab_tests WHERE code = 'CMP'), 'K', 'Potassium', 'mEq/L', '3.5-5.1', '3.5-5.1', 2.5, 6.5, 5),
((SELECT id FROM lab_tests WHERE code = 'CMP'), 'CL', 'Chloride', 'mEq/L', '98-107', '98-107', 80.0, 120.0, 6),
((SELECT id FROM lab_tests WHERE code = 'CMP'), 'CO2', 'CO2', 'mEq/L', '22-29', '22-29', 10.0, 40.0, 7),
((SELECT id FROM lab_tests WHERE code = 'CMP'), 'ALT', 'ALT', 'U/L', '7-56', '7-56', NULL, 1000.0, 8),
((SELECT id FROM lab_tests WHERE code = 'CMP'), 'AST', 'AST', 'U/L', '10-40', '10-40', NULL, 1000.0, 9),
((SELECT id FROM lab_tests WHERE code = 'CMP'), 'TBILI', 'Total Bilirubin', 'mg/dL', '0.2-1.2', '0.2-1.2', NULL, 20.0, 10),

-- Lipid Panel Components
((SELECT id FROM lab_tests WHERE code = 'LIPID'), 'TCHOL', 'Total Cholesterol', 'mg/dL', '<200', '<200', NULL, NULL, 1),
((SELECT id FROM lab_tests WHERE code = 'LIPID'), 'HDL', 'HDL Cholesterol', 'mg/dL', '>40', '>50', NULL, NULL, 2),
((SELECT id FROM lab_tests WHERE code = 'LIPID'), 'LDL', 'LDL Cholesterol', 'mg/dL', '<100', '<100', NULL, NULL, 3),
((SELECT id FROM lab_tests WHERE code = 'LIPID'), 'TRIG', 'Triglycerides', 'mg/dL', '<150', '<150', NULL, NULL, 4);