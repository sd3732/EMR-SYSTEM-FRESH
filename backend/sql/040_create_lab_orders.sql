-- 040_create_lab_orders.sql
-- Lab orders table linking encounters to ordered tests

CREATE TABLE lab_orders (
    id SERIAL PRIMARY KEY,
    encounter_id INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id INTEGER NOT NULL REFERENCES providers(id),
    lab_test_id INTEGER NOT NULL REFERENCES lab_tests(id),
    
    -- Order details
    priority VARCHAR(20) DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat')),
    status VARCHAR(20) DEFAULT 'ordered' CHECK (status IN ('ordered', 'collected', 'in_process', 'resulted', 'cancelled')),
    
    -- Clinical information
    clinical_indication TEXT,
    diagnosis_codes TEXT[], -- ICD-10 codes for billing/medical necessity
    fasting_status VARCHAR(20) CHECK (fasting_status IN ('fasting', 'non_fasting', 'unknown')),
    
    -- Scheduling and collection
    ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    collect_after TIMESTAMP, -- earliest collection time (for fasting tests)
    collected_at TIMESTAMP,
    collected_by VARCHAR(255),
    specimen_id VARCHAR(100), -- lab tracking number
    
    -- Processing timestamps
    received_at TIMESTAMP,
    resulted_at TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by INTEGER REFERENCES providers(id),
    
    -- Additional metadata
    external_order_id VARCHAR(100), -- lab company order ID
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX idx_lab_orders_encounter ON lab_orders(encounter_id);
CREATE INDEX idx_lab_orders_patient ON lab_orders(patient_id);
CREATE INDEX idx_lab_orders_provider ON lab_orders(provider_id);
CREATE INDEX idx_lab_orders_status ON lab_orders(status);
CREATE INDEX idx_lab_orders_priority ON lab_orders(priority);
CREATE INDEX idx_lab_orders_ordered_at ON lab_orders(ordered_at);
CREATE INDEX idx_lab_orders_specimen ON lab_orders(specimen_id) WHERE specimen_id IS NOT NULL;

-- Table for lab order sets (common groupings of tests)
CREATE TABLE lab_order_sets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for order sets and tests
CREATE TABLE lab_order_set_tests (
    id SERIAL PRIMARY KEY,
    order_set_id INTEGER NOT NULL REFERENCES lab_order_sets(id) ON DELETE CASCADE,
    lab_test_id INTEGER NOT NULL REFERENCES lab_tests(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    UNIQUE(order_set_id, lab_test_id)
);

-- Insert common lab order sets
INSERT INTO lab_order_sets (name, description, category) VALUES
('Annual Physical Panel', 'Standard tests for annual wellness exam', 'Preventive'),
('Diabetes Monitoring', 'Tests for diabetes follow-up visits', 'Chronic Care'),
('Cardiovascular Risk', 'Lipid panel and cardiac markers', 'Cardiovascular'),
('Thyroid Function Complete', 'Complete thyroid function assessment', 'Endocrine'),
('Liver Function Panel', 'Comprehensive liver function tests', 'Hepatic'),
('Kidney Function Panel', 'Comprehensive kidney function assessment', 'Renal'),
('Anemia Workup', 'Initial anemia investigation tests', 'Hematology'),
('Pre-op Basic', 'Basic pre-operative testing', 'Pre-operative');

-- Populate order sets with tests
-- Annual Physical Panel
INSERT INTO lab_order_set_tests (order_set_id, lab_test_id, sort_order) VALUES
((SELECT id FROM lab_order_sets WHERE name = 'Annual Physical Panel'), (SELECT id FROM lab_tests WHERE code = 'CMP'), 1),
((SELECT id FROM lab_order_sets WHERE name = 'Annual Physical Panel'), (SELECT id FROM lab_tests WHERE code = 'CBC'), 2),
((SELECT id FROM lab_order_sets WHERE name = 'Annual Physical Panel'), (SELECT id FROM lab_tests WHERE code = 'LIPID'), 3),
((SELECT id FROM lab_order_sets WHERE name = 'Annual Physical Panel'), (SELECT id FROM lab_tests WHERE code = 'TSH'), 4),
((SELECT id FROM lab_order_sets WHERE name = 'Annual Physical Panel'), (SELECT id FROM lab_tests WHERE code = 'HBA1C'), 5),
((SELECT id FROM lab_order_sets WHERE name = 'Annual Physical Panel'), (SELECT id FROM lab_tests WHERE code = 'UA'), 6);

-- Diabetes Monitoring
INSERT INTO lab_order_set_tests (order_set_id, lab_test_id, sort_order) VALUES
((SELECT id FROM lab_order_sets WHERE name = 'Diabetes Monitoring'), (SELECT id FROM lab_tests WHERE code = 'HBA1C'), 1),
((SELECT id FROM lab_order_sets WHERE name = 'Diabetes Monitoring'), (SELECT id FROM lab_tests WHERE code = 'BMP'), 2),
((SELECT id FROM lab_order_sets WHERE name = 'Diabetes Monitoring'), (SELECT id FROM lab_tests WHERE code = 'LIPID'), 3),
((SELECT id FROM lab_order_sets WHERE name = 'Diabetes Monitoring'), (SELECT id FROM lab_tests WHERE code = 'UA'), 4);

-- Cardiovascular Risk
INSERT INTO lab_order_set_tests (order_set_id, lab_test_id, sort_order) VALUES
((SELECT id FROM lab_order_sets WHERE name = 'Cardiovascular Risk'), (SELECT id FROM lab_tests WHERE code = 'LIPID'), 1),
((SELECT id FROM lab_order_sets WHERE name = 'Cardiovascular Risk'), (SELECT id FROM lab_tests WHERE code = 'HCRP'), 2),
((SELECT id FROM lab_order_sets WHERE name = 'Cardiovascular Risk'), (SELECT id FROM lab_tests WHERE code = 'HBA1C'), 3);

-- Thyroid Function Complete
INSERT INTO lab_order_set_tests (order_set_id, lab_test_id, sort_order) VALUES
((SELECT id FROM lab_order_sets WHERE name = 'Thyroid Function Complete'), (SELECT id FROM lab_tests WHERE code = 'TSH'), 1),
((SELECT id FROM lab_order_sets WHERE name = 'Thyroid Function Complete'), (SELECT id FROM lab_tests WHERE code = 'T4'), 2),
((SELECT id FROM lab_order_sets WHERE name = 'Thyroid Function Complete'), (SELECT id FROM lab_tests WHERE code = 'T3'), 3);

-- Liver Function Panel
INSERT INTO lab_order_set_tests (order_set_id, lab_test_id, sort_order) VALUES
((SELECT id FROM lab_order_sets WHERE name = 'Liver Function Panel'), (SELECT id FROM lab_tests WHERE code = 'ALT'), 1),
((SELECT id FROM lab_order_sets WHERE name = 'Liver Function Panel'), (SELECT id FROM lab_tests WHERE code = 'AST'), 2),
((SELECT id FROM lab_order_sets WHERE name = 'Liver Function Panel'), (SELECT id FROM lab_tests WHERE code = 'ALKP'), 3),
((SELECT id FROM lab_order_sets WHERE name = 'Liver Function Panel'), (SELECT id FROM lab_tests WHERE code = 'BILI'), 4),
((SELECT id FROM lab_order_sets WHERE name = 'Liver Function Panel'), (SELECT id FROM lab_tests WHERE code = 'ALB'), 5);

-- Kidney Function Panel
INSERT INTO lab_order_set_tests (order_set_id, lab_test_id, sort_order) VALUES
((SELECT id FROM lab_order_sets WHERE name = 'Kidney Function Panel'), (SELECT id FROM lab_tests WHERE code = 'BMP'), 1),
((SELECT id FROM lab_order_sets WHERE name = 'Kidney Function Panel'), (SELECT id FROM lab_tests WHERE code = 'UA'), 2);

-- Anemia Workup
INSERT INTO lab_order_set_tests (order_set_id, lab_test_id, sort_order) VALUES
((SELECT id FROM lab_order_sets WHERE name = 'Anemia Workup'), (SELECT id FROM lab_tests WHERE code = 'CBC'), 1),
((SELECT id FROM lab_order_sets WHERE name = 'Anemia Workup'), (SELECT id FROM lab_tests WHERE code = 'B12'), 2),
((SELECT id FROM lab_order_sets WHERE name = 'Anemia Workup'), (SELECT id FROM lab_tests WHERE code = 'FOLATE'), 3);

-- Pre-op Basic
INSERT INTO lab_order_set_tests (order_set_id, lab_test_id, sort_order) VALUES
((SELECT id FROM lab_order_sets WHERE name = 'Pre-op Basic'), (SELECT id FROM lab_tests WHERE code = 'CBC'), 1),
((SELECT id FROM lab_order_sets WHERE name = 'Pre-op Basic'), (SELECT id FROM lab_tests WHERE code = 'BMP'), 2),
((SELECT id FROM lab_order_sets WHERE name = 'Pre-op Basic'), (SELECT id FROM lab_tests WHERE code = 'PT'), 3),
((SELECT id FROM lab_order_sets WHERE name = 'Pre-op Basic'), (SELECT id FROM lab_tests WHERE code = 'PTT'), 4);