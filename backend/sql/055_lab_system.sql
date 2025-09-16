-- Lab Order and Results System Schema
-- Comprehensive LOINC-based lab ordering, result processing, and critical value management
-- Includes HL7 integration, audit logging, and encryption for sensitive results

-- Lab orders table
CREATE TABLE IF NOT EXISTS lab_orders (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id INTEGER NOT NULL REFERENCES providers(id),
    encounter_id INTEGER REFERENCES encounters(id),
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority VARCHAR(10) DEFAULT 'routine' CHECK (priority IN ('stat', 'urgent', 'routine')),
    clinical_indication TEXT,
    fasting_required BOOLEAN DEFAULT false,
    special_instructions TEXT,
    ordering_facility VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_priority CHECK (priority IN ('stat', 'urgent', 'routine'))
);

-- Individual lab tests with LOINC codes
CREATE TABLE IF NOT EXISTS lab_tests (
    id SERIAL PRIMARY KEY,
    lab_order_id INTEGER NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
    loinc_code VARCHAR(20) NOT NULL,
    test_name VARCHAR(255) NOT NULL,
    specimen_type VARCHAR(50) DEFAULT 'serum',
    status VARCHAR(20) DEFAULT 'ordered' CHECK (status IN ('ordered', 'collected', 'processing', 'completed', 'cancelled')),
    collection_method VARCHAR(50),
    tube_type VARCHAR(50),
    volume_required VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lab results table
CREATE TABLE IF NOT EXISTS lab_results (
    id SERIAL PRIMARY KEY,
    lab_test_id INTEGER NOT NULL REFERENCES lab_tests(id) ON DELETE CASCADE,
    result_value TEXT,
    numeric_value DECIMAL(15,6), -- For trending and calculations
    unit VARCHAR(50),
    reference_range VARCHAR(100),
    abnormal_flag VARCHAR(10) CHECK (abnormal_flag IN ('H', 'L', 'HH', 'LL', 'N', 'A', '')),
    result_status VARCHAR(20) DEFAULT 'preliminary' CHECK (result_status IN ('preliminary', 'final', 'corrected', 'cancelled')),
    result_date TIMESTAMP NOT NULL,
    result_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_by INTEGER REFERENCES providers(id),
    verified_at TIMESTAMP,
    is_critical BOOLEAN DEFAULT false,
    critical_acknowledged_by INTEGER REFERENCES providers(id),
    critical_acknowledged_at TIMESTAMP,
    lab_technician VARCHAR(100),
    instrument_id VARCHAR(50),
    interpretation TEXT,
    encrypted_value TEXT, -- For sensitive results (HIV, genetics)
    encryption_key_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Common lab panels for quick ordering
CREATE TABLE IF NOT EXISTS lab_panels (
    id SERIAL PRIMARY KEY,
    panel_name VARCHAR(100) NOT NULL UNIQUE,
    panel_code VARCHAR(20),
    loinc_codes TEXT[] NOT NULL,
    test_names TEXT[] NOT NULL,
    commonly_ordered BOOLEAN DEFAULT false,
    department VARCHAR(50) DEFAULT 'chemistry',
    turnaround_time_hours INTEGER,
    fasting_required BOOLEAN DEFAULT false,
    special_preparation TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Critical value definitions
CREATE TABLE IF NOT EXISTS critical_value_ranges (
    id SERIAL PRIMARY KEY,
    loinc_code VARCHAR(20) NOT NULL,
    test_name VARCHAR(255) NOT NULL,
    critical_low DECIMAL(15,6),
    critical_high DECIMAL(15,6),
    unit VARCHAR(50),
    age_group VARCHAR(50) DEFAULT 'adult',
    gender VARCHAR(10),
    notification_required BOOLEAN DEFAULT true,
    escalation_minutes INTEGER DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(loinc_code, age_group, gender)
);

-- Critical value notifications and acknowledgments
CREATE TABLE IF NOT EXISTS critical_value_notifications (
    id SERIAL PRIMARY KEY,
    lab_result_id INTEGER NOT NULL REFERENCES lab_results(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    provider_id INTEGER NOT NULL REFERENCES providers(id),
    notification_method VARCHAR(20) CHECK (notification_method IN ('phone', 'page', 'email', 'in_app')),
    notification_sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP,
    acknowledged_by INTEGER REFERENCES providers(id),
    escalated BOOLEAN DEFAULT false,
    escalated_at TIMESTAMP,
    escalated_to INTEGER REFERENCES providers(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- HL7 message log for integration tracking
CREATE TABLE IF NOT EXISTS hl7_messages (
    id SERIAL PRIMARY KEY,
    message_type VARCHAR(10) NOT NULL, -- 'ORM', 'ORU', etc.
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    hl7_message TEXT NOT NULL,
    parsed_successfully BOOLEAN DEFAULT false,
    lab_order_id INTEGER REFERENCES lab_orders(id),
    lab_result_id INTEGER REFERENCES lab_results(id),
    error_message TEXT,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lab reference ranges by demographics
CREATE TABLE IF NOT EXISTS lab_reference_ranges (
    id SERIAL PRIMARY KEY,
    loinc_code VARCHAR(20) NOT NULL,
    test_name VARCHAR(255) NOT NULL,
    age_min INTEGER, -- age in years
    age_max INTEGER,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'all')),
    reference_low DECIMAL(15,6),
    reference_high DECIMAL(15,6),
    unit VARCHAR(50),
    range_text VARCHAR(200), -- for non-numeric ranges
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lab result amendments/corrections
CREATE TABLE IF NOT EXISTS lab_result_amendments (
    id SERIAL PRIMARY KEY,
    original_result_id INTEGER NOT NULL REFERENCES lab_results(id),
    amendment_type VARCHAR(20) CHECK (amendment_type IN ('correction', 'addition', 'deletion')),
    original_value TEXT,
    amended_value TEXT,
    reason_for_amendment TEXT NOT NULL,
    amended_by INTEGER NOT NULL REFERENCES providers(id),
    amended_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    supervisor_approval INTEGER REFERENCES providers(id),
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient_id ON lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_provider_id ON lab_orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_status ON lab_orders(status);
CREATE INDEX IF NOT EXISTS idx_lab_orders_date ON lab_orders(order_date);

CREATE INDEX IF NOT EXISTS idx_lab_tests_order_id ON lab_tests(lab_order_id);
CREATE INDEX IF NOT EXISTS idx_lab_tests_loinc ON lab_tests(loinc_code);
CREATE INDEX IF NOT EXISTS idx_lab_tests_status ON lab_tests(status);

CREATE INDEX IF NOT EXISTS idx_lab_results_test_id ON lab_results(lab_test_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_date ON lab_results(result_date);
CREATE INDEX IF NOT EXISTS idx_lab_results_critical ON lab_results(is_critical);
CREATE INDEX IF NOT EXISTS idx_lab_results_status ON lab_results(result_status);

CREATE INDEX IF NOT EXISTS idx_critical_values_loinc ON critical_value_ranges(loinc_code);
CREATE INDEX IF NOT EXISTS idx_critical_notifications_result ON critical_value_notifications(lab_result_id);
CREATE INDEX IF NOT EXISTS idx_critical_notifications_provider ON critical_value_notifications(provider_id);

CREATE INDEX IF NOT EXISTS idx_hl7_messages_type ON hl7_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_hl7_messages_direction ON hl7_messages(direction);
CREATE INDEX IF NOT EXISTS idx_hl7_messages_processed ON hl7_messages(processed_at);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_lab_orders_updated_at BEFORE UPDATE ON lab_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lab_tests_updated_at BEFORE UPDATE ON lab_tests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lab_results_updated_at BEFORE UPDATE ON lab_results FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lab_panels_updated_at BEFORE UPDATE ON lab_panels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_critical_value_ranges_updated_at BEFORE UPDATE ON critical_value_ranges FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lab_reference_ranges_updated_at BEFORE UPDATE ON lab_reference_ranges FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert common lab panels
INSERT INTO lab_panels (panel_name, panel_code, loinc_codes, test_names, commonly_ordered, department, turnaround_time_hours, fasting_required) VALUES
('Complete Blood Count (CBC)', 'CBC', 
 ARRAY['26464-8', '26515-7', '33746-0', '26474-7', '26453-1', '26499-4'], 
 ARRAY['White Blood Cell Count', 'Red Blood Cell Count', 'Hemoglobin', 'Hematocrit', 'Platelet Count', 'Mean Cell Volume'], 
 true, 'hematology', 2, false),
 
('Comprehensive Metabolic Panel (CMP)', 'CMP',
 ARRAY['2951-2', '2823-3', '6299-2', '38483-4', '2160-0', '2075-0', '3094-0', '2947-0'], 
 ARRAY['Glucose', 'Potassium', 'Urea Nitrogen', 'Creatinine', 'Chloride', 'Carbon Dioxide', 'Anion Gap', 'Sodium'], 
 true, 'chemistry', 4, true),
 
('Basic Metabolic Panel (BMP)', 'BMP',
 ARRAY['2951-2', '2823-3', '6299-2', '38483-4', '2160-0', '2075-0', '2947-0'], 
 ARRAY['Glucose', 'Potassium', 'Urea Nitrogen', 'Creatinine', 'Chloride', 'Carbon Dioxide', 'Sodium'], 
 true, 'chemistry', 4, true),
 
('Lipid Panel', 'LIPID',
 ARRAY['2093-3', '2085-9', '2089-1', '13457-7'], 
 ARRAY['Total Cholesterol', 'HDL Cholesterol', 'LDL Cholesterol', 'Triglycerides'], 
 true, 'chemistry', 6, true),
 
('Liver Function Tests', 'LFT',
 ARRAY['1742-6', '1744-2', '6768-6', '1920-8'], 
 ARRAY['Alanine Aminotransferase', 'Aspartate Aminotransferase', 'Alkaline Phosphatase', 'Total Bilirubin'], 
 true, 'chemistry', 4, false),
 
('Thyroid Function Panel', 'THYROID',
 ARRAY['3016-3', '3024-7', '34054-7'], 
 ARRAY['Thyroid Stimulating Hormone', 'Free T4', 'Free T3'], 
 true, 'chemistry', 24, false);

-- Insert critical value ranges for common tests
INSERT INTO critical_value_ranges (loinc_code, test_name, critical_low, critical_high, unit, age_group, gender) VALUES
('2951-2', 'Glucose', 40.0, 400.0, 'mg/dL', 'adult', 'all'),
('2823-3', 'Potassium', 2.5, 6.0, 'mmol/L', 'adult', 'all'),
('2947-0', 'Sodium', 120.0, 160.0, 'mmol/L', 'adult', 'all'),
('38483-4', 'Creatinine', NULL, 5.0, 'mg/dL', 'adult', 'all'),
('718-7', 'Hemoglobin', 7.0, 20.0, 'g/dL', 'adult', 'all'),
('26464-8', 'White Blood Cell Count', 2.0, 30.0, '10*3/uL', 'adult', 'all'),
('26499-4', 'Platelet Count', 50.0, 1000.0, '10*3/uL', 'adult', 'all'),
('1742-6', 'Alanine Aminotransferase', NULL, 500.0, 'U/L', 'adult', 'all'),
('3016-3', 'Thyroid Stimulating Hormone', 0.01, 50.0, 'mIU/L', 'adult', 'all');

-- Insert reference ranges for common tests
INSERT INTO lab_reference_ranges (loinc_code, test_name, age_min, age_max, gender, reference_low, reference_high, unit) VALUES
('2951-2', 'Glucose', 18, 120, 'all', 70.0, 100.0, 'mg/dL'),
('2823-3', 'Potassium', 18, 120, 'all', 3.5, 5.1, 'mmol/L'),
('2947-0', 'Sodium', 18, 120, 'all', 136.0, 145.0, 'mmol/L'),
('38483-4', 'Creatinine', 18, 120, 'male', 0.7, 1.3, 'mg/dL'),
('38483-4', 'Creatinine', 18, 120, 'female', 0.6, 1.1, 'mg/dL'),
('718-7', 'Hemoglobin', 18, 120, 'male', 14.0, 18.0, 'g/dL'),
('718-7', 'Hemoglobin', 18, 120, 'female', 12.0, 16.0, 'g/dL'),
('26464-8', 'White Blood Cell Count', 18, 120, 'all', 4.5, 11.0, '10*3/uL'),
('26499-4', 'Platelet Count', 18, 120, 'all', 150.0, 450.0, '10*3/uL'),
('2093-3', 'Total Cholesterol', 18, 120, 'all', 0.0, 200.0, 'mg/dL'),
('2085-9', 'HDL Cholesterol', 18, 120, 'male', 40.0, 1000.0, 'mg/dL'),
('2085-9', 'HDL Cholesterol', 18, 120, 'female', 50.0, 1000.0, 'mg/dL');

-- Comments for documentation
COMMENT ON TABLE lab_orders IS 'Lab orders placed by providers for patients';
COMMENT ON TABLE lab_tests IS 'Individual LOINC-coded tests within lab orders';
COMMENT ON TABLE lab_results IS 'Lab test results with critical value flagging';
COMMENT ON TABLE lab_panels IS 'Pre-defined groups of commonly ordered tests';
COMMENT ON TABLE critical_value_ranges IS 'Defines critical thresholds for lab values';
COMMENT ON TABLE critical_value_notifications IS 'Tracks notifications for critical values';
COMMENT ON TABLE hl7_messages IS 'Log of HL7 messages for lab integration';
COMMENT ON TABLE lab_reference_ranges IS 'Normal reference ranges by demographics';
COMMENT ON TABLE lab_result_amendments IS 'Corrections and amendments to lab results';

COMMENT ON COLUMN lab_results.encrypted_value IS 'Encrypted storage for sensitive results (HIV, genetics)';
COMMENT ON COLUMN lab_results.is_critical IS 'Auto-flagged based on critical_value_ranges';
COMMENT ON COLUMN critical_value_notifications.escalation_minutes IS 'Minutes before escalation if not acknowledged';