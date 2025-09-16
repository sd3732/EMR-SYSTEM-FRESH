-- Migration: Create ICD-10 diagnosis codes table for proper medical coding
-- This table contains ICD-10-CM diagnosis codes for clinical documentation

CREATE TABLE icd10_diagnoses (
    id SERIAL PRIMARY KEY,
    
    -- ICD-10 code information
    code VARCHAR(10) NOT NULL UNIQUE, -- e.g., 'I10', 'E11.9', 'Z00.00'
    description TEXT NOT NULL,        -- Full description of the diagnosis
    short_description VARCHAR(255),   -- Abbreviated description
    
    -- Clinical categorization
    category VARCHAR(100),            -- High-level category (e.g., 'Cardiovascular', 'Endocrine')
    subcategory VARCHAR(100),         -- More specific grouping
    
    -- Code metadata
    code_type VARCHAR(20) DEFAULT 'diagnosis' CHECK (code_type IN ('diagnosis', 'symptom', 'screening', 'external_cause')),
    billable BOOLEAN DEFAULT true,    -- Whether this code can be used for billing
    valid_from DATE,                  -- When this code became valid
    valid_to DATE,                    -- When this code expires (NULL if current)
    
    -- Search optimization
    search_terms TEXT,                -- Additional searchable terms
    search_vector TSVECTOR,           -- Full-text search vector
    
    -- Usage tracking
    usage_count INTEGER DEFAULT 0,   -- Track how often this code is used
    last_used DATE,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure valid date range
    CHECK (valid_to IS NULL OR valid_to > valid_from)
);

-- Create indexes for efficient searching
CREATE INDEX idx_icd10_code ON icd10_diagnoses(code);
CREATE INDEX idx_icd10_description ON icd10_diagnoses USING gin(to_tsvector('english', description));
CREATE INDEX idx_icd10_category ON icd10_diagnoses(category);
CREATE INDEX idx_icd10_billable ON icd10_diagnoses(billable) WHERE billable = true;
CREATE INDEX idx_icd10_search_vector ON icd10_diagnoses USING gin(search_vector);
CREATE INDEX idx_icd10_usage ON icd10_diagnoses(usage_count DESC, last_used DESC);

-- Function to update search vector
CREATE OR REPLACE FUNCTION update_icd10_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', 
        NEW.code || ' ' ||
        NEW.description || ' ' ||
        COALESCE(NEW.short_description, '') || ' ' ||
        COALESCE(NEW.search_terms, '') || ' ' ||
        COALESCE(NEW.category, '') || ' ' ||
        COALESCE(NEW.subcategory, '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update search vector
CREATE TRIGGER trig_update_icd10_search_vector
    BEFORE INSERT OR UPDATE ON icd10_diagnoses
    FOR EACH ROW EXECUTE FUNCTION update_icd10_search_vector();

-- Trigger for updated_at
CREATE TRIGGER update_icd10_diagnoses_updated_at 
    BEFORE UPDATE ON icd10_diagnoses 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to track diagnosis usage
CREATE OR REPLACE FUNCTION track_diagnosis_usage(diagnosis_code VARCHAR) 
RETURNS VOID AS $$
BEGIN
    UPDATE icd10_diagnoses 
    SET 
        usage_count = usage_count + 1,
        last_used = CURRENT_DATE
    WHERE code = diagnosis_code;
END;
$$ LANGUAGE plpgsql;

-- Insert common ICD-10 codes for testing
INSERT INTO icd10_diagnoses (code, description, short_description, category, subcategory, search_terms, billable) VALUES
    -- Cardiovascular
    ('I10', 'Essential (primary) hypertension', 'Hypertension', 'Cardiovascular', 'Hypertensive diseases', 'high blood pressure HTN', true),
    ('I25.10', 'Atherosclerotic heart disease of native coronary artery without angina pectoris', 'CAD without angina', 'Cardiovascular', 'Ischemic heart diseases', 'coronary artery disease CAD atherosclerosis', true),
    ('I48.91', 'Unspecified atrial fibrillation', 'Atrial fibrillation', 'Cardiovascular', 'Arrhythmias', 'afib a-fib irregular heartbeat', true),
    ('I50.9', 'Heart failure, unspecified', 'Heart failure', 'Cardiovascular', 'Heart failure', 'CHF congestive heart failure', true),
    
    -- Endocrine/Diabetes
    ('E11.9', 'Type 2 diabetes mellitus without complications', 'Type 2 diabetes', 'Endocrine', 'Diabetes mellitus', 'diabetes DM T2DM', true),
    ('E11.65', 'Type 2 diabetes mellitus with hyperglycemia', 'Type 2 DM with hyperglycemia', 'Endocrine', 'Diabetes mellitus', 'diabetes high blood sugar', true),
    ('E78.5', 'Hyperlipidemia, unspecified', 'Hyperlipidemia', 'Endocrine', 'Lipid disorders', 'high cholesterol dyslipidemia', true),
    ('E03.9', 'Hypothyroidism, unspecified', 'Hypothyroidism', 'Endocrine', 'Thyroid disorders', 'underactive thyroid TSH', true),
    
    -- Respiratory
    ('J44.1', 'Chronic obstructive pulmonary disease with (acute) exacerbation', 'COPD with exacerbation', 'Respiratory', 'COPD', 'chronic obstructive pulmonary disease emphysema', true),
    ('J45.9', 'Asthma, unspecified', 'Asthma', 'Respiratory', 'Asthma', 'wheezing reactive airway disease', true),
    ('J06.9', 'Acute upper respiratory infection, unspecified', 'Upper respiratory infection', 'Respiratory', 'Upper respiratory', 'cold URI viral infection', true),
    ('J18.9', 'Pneumonia, unspecified organism', 'Pneumonia', 'Respiratory', 'Pneumonia', 'lung infection', true),
    
    -- Mental Health
    ('F32.9', 'Major depressive disorder, single episode, unspecified', 'Major depression', 'Mental Health', 'Mood disorders', 'depression MDD mood', true),
    ('F41.9', 'Anxiety disorder, unspecified', 'Anxiety disorder', 'Mental Health', 'Anxiety disorders', 'anxiety GAD panic', true),
    ('F17.210', 'Nicotine dependence, cigarettes, uncomplicated', 'Nicotine dependence', 'Mental Health', 'Substance use', 'smoking tobacco cigarettes', true),
    
    -- Musculoskeletal
    ('M79.3', 'Panniculitis, unspecified', 'Panniculitis', 'Musculoskeletal', 'Soft tissue disorders', 'muscle pain myalgia', true),
    ('M25.50', 'Pain in unspecified joint', 'Joint pain', 'Musculoskeletal', 'Joint disorders', 'arthralgia joint aches', true),
    ('M54.5', 'Low back pain', 'Low back pain', 'Musculoskeletal', 'Back problems', 'lumbago backache spine', true),
    
    -- Genitourinary
    ('N39.0', 'Urinary tract infection, site not specified', 'Urinary tract infection', 'Genitourinary', 'Urinary tract', 'UTI bladder infection cystitis', true),
    ('N18.6', 'End stage renal disease', 'End stage renal disease', 'Genitourinary', 'Chronic kidney disease', 'ESRD kidney failure dialysis', true),
    
    -- Digestive
    ('K21.9', 'Gastro-esophageal reflux disease without esophagitis', 'GERD', 'Digestive', 'Esophageal disorders', 'acid reflux heartburn GERD', true),
    ('K59.00', 'Constipation, unspecified', 'Constipation', 'Digestive', 'Intestinal disorders', 'bowel movement irregular', true),
    
    -- Preventive/Screening
    ('Z00.00', 'Encounter for general adult medical examination without abnormal findings', 'Annual physical exam', 'Preventive', 'Health maintenance', 'annual exam physical wellness visit', true),
    ('Z12.11', 'Encounter for screening for malignant neoplasm of colon', 'Colon cancer screening', 'Preventive', 'Cancer screening', 'colonoscopy screening', true),
    ('Z23', 'Encounter for immunization', 'Immunization encounter', 'Preventive', 'Immunization', 'vaccination vaccine shot', true),
    
    -- Symptoms (often not primary diagnoses)
    ('R50.9', 'Fever, unspecified', 'Fever', 'Symptoms', 'General symptoms', 'temperature febrile', true),
    ('R06.02', 'Shortness of breath', 'Shortness of breath', 'Symptoms', 'Respiratory symptoms', 'SOB dyspnea breathing difficulty', true),
    ('R51.9', 'Headache, unspecified', 'Headache', 'Symptoms', 'Neurological symptoms', 'cephalgia head pain', true),
    ('R10.9', 'Unspecified abdominal pain', 'Abdominal pain', 'Symptoms', 'Digestive symptoms', 'stomach ache belly pain', true);

-- Update search vectors for all inserted records
UPDATE icd10_diagnoses SET updated_at = CURRENT_TIMESTAMP;