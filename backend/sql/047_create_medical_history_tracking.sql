-- Migration: Create comprehensive medical history tracking system
-- This migration creates tables for tracking patient medical history

BEGIN;

-- Patient Medical History Table
CREATE TABLE IF NOT EXISTS patient_medical_history (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL CHECK (category IN (
        'chronic_condition', 'past_illness', 'surgery', 'injury', 'hospitalization', 
        'mental_health', 'reproductive_health', 'screening', 'other'
    )),
    condition_name VARCHAR(200) NOT NULL,
    icd10_code VARCHAR(20),
    onset_date DATE,
    resolved_date DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'chronic', 'remission')),
    severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe', 'critical')),
    provider_id INTEGER REFERENCES providers(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Family Medical History Table  
CREATE TABLE IF NOT EXISTS family_medical_history (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    relationship VARCHAR(50) NOT NULL CHECK (relationship IN (
        'mother', 'father', 'maternal_grandmother', 'maternal_grandfather',
        'paternal_grandmother', 'paternal_grandfather', 'sibling', 'child',
        'maternal_aunt', 'maternal_uncle', 'paternal_aunt', 'paternal_uncle',
        'maternal_cousin', 'paternal_cousin', 'other'
    )),
    condition_name VARCHAR(200) NOT NULL,
    icd10_code VARCHAR(20),
    age_at_diagnosis INTEGER,
    age_at_death INTEGER,
    cause_of_death VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Surgical History Table
CREATE TABLE IF NOT EXISTS surgical_history (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    procedure_name VARCHAR(200) NOT NULL,
    cpt_code VARCHAR(20),
    surgery_date DATE NOT NULL,
    surgeon_name VARCHAR(100),
    hospital_facility VARCHAR(150),
    complications TEXT,
    outcome VARCHAR(50) CHECK (outcome IN ('successful', 'successful_with_complications', 'unsuccessful', 'ongoing')),
    recovery_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hospitalizations Table
CREATE TABLE IF NOT EXISTS hospitalizations (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    admission_date DATE NOT NULL,
    discharge_date DATE,
    hospital_name VARCHAR(150),
    admission_reason VARCHAR(300),
    primary_diagnosis VARCHAR(200),
    icd10_code VARCHAR(20),
    length_of_stay INTEGER,
    discharge_disposition VARCHAR(100),
    complications TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chronic Conditions Management Table
CREATE TABLE IF NOT EXISTS chronic_conditions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    condition_name VARCHAR(200) NOT NULL,
    icd10_code VARCHAR(20),
    diagnosed_date DATE,
    severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe')),
    management_plan TEXT,
    target_goals TEXT,
    monitoring_frequency VARCHAR(50),
    last_monitored DATE,
    controlled BOOLEAN DEFAULT false,
    medications TEXT,
    lifestyle_modifications TEXT,
    provider_id INTEGER REFERENCES providers(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Health Screenings Table
CREATE TABLE IF NOT EXISTS health_screenings (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    screening_type VARCHAR(100) NOT NULL,
    screening_date DATE NOT NULL,
    result VARCHAR(50),
    result_details TEXT,
    next_due_date DATE,
    provider_id INTEGER REFERENCES providers(id),
    facility VARCHAR(150),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Immunization History Table (if not already exists from previous migration)
CREATE TABLE IF NOT EXISTS immunization_history (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    vaccine_name VARCHAR(100) NOT NULL,
    vaccine_code VARCHAR(20),
    administration_date DATE NOT NULL,
    dose_number INTEGER,
    route VARCHAR(20) DEFAULT 'IM',
    site VARCHAR(50) DEFAULT 'deltoid',
    lot_number VARCHAR(50),
    manufacturer VARCHAR(100),
    expiration_date DATE,
    provider_id INTEGER REFERENCES providers(id),
    adverse_reactions TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_patient_medical_history_patient_id ON patient_medical_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_medical_history_category ON patient_medical_history(category);
CREATE INDEX IF NOT EXISTS idx_patient_medical_history_status ON patient_medical_history(status);
CREATE INDEX IF NOT EXISTS idx_family_medical_history_patient_id ON family_medical_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_surgical_history_patient_id ON surgical_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_hospitalizations_patient_id ON hospitalizations(patient_id);
CREATE INDEX IF NOT EXISTS idx_chronic_conditions_patient_id ON chronic_conditions(patient_id);
CREATE INDEX IF NOT EXISTS idx_health_screenings_patient_id ON health_screenings(patient_id);
CREATE INDEX IF NOT EXISTS idx_immunization_history_patient_id ON immunization_history(patient_id);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_medical_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables that have updated_at columns
DROP TRIGGER IF EXISTS trigger_patient_medical_history_updated_at ON patient_medical_history;
CREATE TRIGGER trigger_patient_medical_history_updated_at
    BEFORE UPDATE ON patient_medical_history
    FOR EACH ROW
    EXECUTE FUNCTION update_medical_history_updated_at();

DROP TRIGGER IF EXISTS trigger_family_medical_history_updated_at ON family_medical_history;
CREATE TRIGGER trigger_family_medical_history_updated_at
    BEFORE UPDATE ON family_medical_history
    FOR EACH ROW
    EXECUTE FUNCTION update_medical_history_updated_at();

DROP TRIGGER IF EXISTS trigger_surgical_history_updated_at ON surgical_history;
CREATE TRIGGER trigger_surgical_history_updated_at
    BEFORE UPDATE ON surgical_history
    FOR EACH ROW
    EXECUTE FUNCTION update_medical_history_updated_at();

DROP TRIGGER IF EXISTS trigger_hospitalizations_updated_at ON hospitalizations;
CREATE TRIGGER trigger_hospitalizations_updated_at
    BEFORE UPDATE ON hospitalizations
    FOR EACH ROW
    EXECUTE FUNCTION update_medical_history_updated_at();

DROP TRIGGER IF EXISTS trigger_chronic_conditions_updated_at ON chronic_conditions;
CREATE TRIGGER trigger_chronic_conditions_updated_at
    BEFORE UPDATE ON chronic_conditions
    FOR EACH ROW
    EXECUTE FUNCTION update_medical_history_updated_at();

DROP TRIGGER IF EXISTS trigger_health_screenings_updated_at ON health_screenings;
CREATE TRIGGER trigger_health_screenings_updated_at
    BEFORE UPDATE ON health_screenings
    FOR EACH ROW
    EXECUTE FUNCTION update_medical_history_updated_at();

-- Create comprehensive medical history view
CREATE OR REPLACE VIEW comprehensive_medical_history AS
SELECT 
    p.id as patient_id,
    p.first_name,
    p.last_name,
    p.dob,
    
    -- Active chronic conditions
    (SELECT json_agg(json_build_object(
        'id', cc.id,
        'condition_name', cc.condition_name,
        'severity', cc.severity,
        'diagnosed_date', cc.diagnosed_date,
        'controlled', cc.controlled,
        'last_monitored', cc.last_monitored
    ))
    FROM chronic_conditions cc 
    WHERE cc.patient_id = p.id 
    AND cc.controlled = false) as active_chronic_conditions,
    
    -- Recent medical history (last 2 years)
    (SELECT json_agg(json_build_object(
        'id', pmh.id,
        'category', pmh.category,
        'condition_name', pmh.condition_name,
        'onset_date', pmh.onset_date,
        'status', pmh.status,
        'severity', pmh.severity
    ))
    FROM patient_medical_history pmh 
    WHERE pmh.patient_id = p.id 
    AND pmh.onset_date >= CURRENT_DATE - INTERVAL '2 years'
    ORDER BY pmh.onset_date DESC) as recent_medical_history,
    
    -- Family history summary
    (SELECT json_agg(json_build_object(
        'relationship', fmh.relationship,
        'condition_name', fmh.condition_name,
        'age_at_diagnosis', fmh.age_at_diagnosis
    ))
    FROM family_medical_history fmh 
    WHERE fmh.patient_id = p.id) as family_history,
    
    -- Surgical history
    (SELECT json_agg(json_build_object(
        'procedure_name', sh.procedure_name,
        'surgery_date', sh.surgery_date,
        'outcome', sh.outcome
    ))
    FROM surgical_history sh 
    WHERE sh.patient_id = p.id
    ORDER BY sh.surgery_date DESC) as surgical_history,
    
    -- Recent hospitalizations (last 5 years)
    (SELECT json_agg(json_build_object(
        'admission_date', h.admission_date,
        'discharge_date', h.discharge_date,
        'primary_diagnosis', h.primary_diagnosis,
        'length_of_stay', h.length_of_stay
    ))
    FROM hospitalizations h 
    WHERE h.patient_id = p.id 
    AND h.admission_date >= CURRENT_DATE - INTERVAL '5 years'
    ORDER BY h.admission_date DESC) as recent_hospitalizations
    
FROM patients p;

COMMIT;