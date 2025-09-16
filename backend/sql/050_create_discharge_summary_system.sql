-- Phase 4: Discharge Summary Generation System
-- Create comprehensive discharge summary templates and tracking

-- Discharge summary templates
CREATE TABLE IF NOT EXISTS discharge_templates (
    id SERIAL PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL,
    template_type VARCHAR(50) NOT NULL, -- 'general', 'surgical', 'cardiology', 'emergency', etc.
    template_content JSONB NOT NULL, -- Template structure with placeholders
    default_instructions JSONB, -- Default discharge instructions by diagnosis
    created_by INTEGER REFERENCES providers(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Generated discharge summaries
CREATE TABLE IF NOT EXISTS discharge_summaries (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    encounter_id INTEGER REFERENCES encounters(id),
    template_id INTEGER REFERENCES discharge_templates(id),
    provider_id INTEGER NOT NULL REFERENCES providers(id),
    
    -- Core discharge information
    admission_date DATE,
    discharge_date DATE NOT NULL DEFAULT CURRENT_DATE,
    primary_diagnosis VARCHAR(255) NOT NULL,
    secondary_diagnoses TEXT[],
    procedures_performed TEXT[],
    
    -- Clinical summary
    hospital_course TEXT,
    condition_at_discharge VARCHAR(50), -- 'improved', 'stable', 'unchanged', 'worse'
    functional_status TEXT,
    
    -- Medications
    discharge_medications JSONB, -- Array of medication objects with instructions
    medication_changes JSONB, -- Changes from admission meds (added, discontinued, modified)
    medication_reconciliation_notes TEXT,
    
    -- Instructions and education
    activity_restrictions TEXT,
    diet_instructions TEXT,
    wound_care_instructions TEXT,
    patient_education_materials TEXT[], -- URLs or references to education materials
    warning_signs TEXT,
    when_to_seek_care TEXT,
    
    -- Follow-up care
    follow_up_appointments JSONB, -- Array of appointment recommendations
    lab_monitoring_needed JSONB, -- Lab work with timing
    imaging_needed JSONB, -- Follow-up imaging requirements
    specialist_referrals JSONB, -- Referral recommendations
    
    -- Administrative
    status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'finalized', 'sent'
    finalized_at TIMESTAMP,
    sent_to_patient BOOLEAN DEFAULT false,
    sent_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Patient education materials library
CREATE TABLE IF NOT EXISTS patient_education_materials (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'condition', 'medication', 'procedure', 'lifestyle'
    condition_codes TEXT[], -- ICD-10 codes this applies to
    medication_names TEXT[], -- Medication names this applies to
    content_type VARCHAR(20) DEFAULT 'text', -- 'text', 'pdf', 'video', 'link'
    content_url TEXT,
    content_text TEXT,
    reading_level VARCHAR(20) DEFAULT 'grade_8', -- 'grade_6', 'grade_8', 'grade_12'
    languages VARCHAR(10)[] DEFAULT ARRAY['en'], -- supported languages
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Follow-up scheduling recommendations
CREATE TABLE IF NOT EXISTS follow_up_recommendations (
    id SERIAL PRIMARY KEY,
    discharge_summary_id INTEGER NOT NULL REFERENCES discharge_summaries(id),
    appointment_type VARCHAR(100) NOT NULL, -- 'primary_care', 'cardiology', 'wound_check', etc.
    specialty VARCHAR(50),
    urgency_level VARCHAR(20) DEFAULT 'routine', -- 'urgent', 'semi_urgent', 'routine'
    recommended_timing VARCHAR(50), -- '1-2 weeks', '3-6 months', etc.
    specific_instructions TEXT,
    provider_preference INTEGER REFERENCES providers(id), -- Preferred provider if any
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'scheduled', 'completed'
    scheduled_appointment_id INTEGER, -- Reference to actual scheduled appointment
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Medication reconciliation tracking
CREATE TABLE IF NOT EXISTS medication_reconciliation (
    id SERIAL PRIMARY KEY,
    discharge_summary_id INTEGER NOT NULL REFERENCES discharge_summaries(id),
    medication_name VARCHAR(200) NOT NULL,
    action_type VARCHAR(20) NOT NULL, -- 'continue', 'start', 'stop', 'modify'
    previous_dosage VARCHAR(100), -- For modifications
    new_dosage VARCHAR(100),
    reason_for_change TEXT,
    monitoring_required BOOLEAN DEFAULT false,
    monitoring_instructions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit trail for discharge summaries
CREATE TABLE IF NOT EXISTS discharge_summary_audit (
    id SERIAL PRIMARY KEY,
    discharge_summary_id INTEGER NOT NULL REFERENCES discharge_summaries(id),
    action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'finalized', 'sent'
    provider_id INTEGER NOT NULL REFERENCES providers(id),
    changes JSONB, -- What was changed
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default discharge templates
INSERT INTO discharge_templates (template_name, template_type, template_content, default_instructions) VALUES 
(
    'General Medical Discharge',
    'general',
    '{
        "sections": [
            {"name": "admission_reason", "required": true, "label": "Reason for Admission"},
            {"name": "hospital_course", "required": true, "label": "Hospital Course"},
            {"name": "condition_at_discharge", "required": true, "label": "Condition at Discharge"},
            {"name": "discharge_medications", "required": true, "label": "Discharge Medications"},
            {"name": "follow_up_care", "required": true, "label": "Follow-up Care"},
            {"name": "activity_restrictions", "required": false, "label": "Activity Restrictions"},
            {"name": "diet_instructions", "required": false, "label": "Diet Instructions"}
        ],
        "auto_populate": ["vitals_summary", "diagnostic_results", "procedures"]
    }',
    '{
        "general": {
            "activity": "Resume normal activities as tolerated unless otherwise specified.",
            "diet": "Resume regular diet unless otherwise specified.",
            "follow_up": "Follow up with your primary care provider in 1-2 weeks.",
            "warning_signs": "Seek immediate medical attention if you experience: fever >101°F, severe pain, shortness of breath, chest pain, or any concerning symptoms."
        }
    }'
),
(
    'Surgical Discharge',
    'surgical',
    '{
        "sections": [
            {"name": "procedure_performed", "required": true, "label": "Procedure Performed"},
            {"name": "surgical_findings", "required": true, "label": "Surgical Findings"},
            {"name": "post_op_course", "required": true, "label": "Post-operative Course"},
            {"name": "wound_care", "required": true, "label": "Wound Care Instructions"},
            {"name": "activity_restrictions", "required": true, "label": "Activity Restrictions"},
            {"name": "discharge_medications", "required": true, "label": "Discharge Medications"}
        ],
        "auto_populate": ["procedure_details", "anesthesia_type", "complications"]
    }',
    '{
        "surgical": {
            "wound_care": "Keep incision clean and dry. Change dressing daily or as directed.",
            "activity": "No heavy lifting >10 lbs for 2 weeks. Gradual return to normal activity.",
            "follow_up": "Follow up with surgeon in 1-2 weeks for wound check.",
            "warning_signs": "Call immediately for: fever, increasing pain, redness or drainage from incision, shortness of breath."
        }
    }'
),
(
    'Emergency Department Discharge',
    'emergency',
    '{
        "sections": [
            {"name": "chief_complaint", "required": true, "label": "Chief Complaint"},
            {"name": "ed_course", "required": true, "label": "Emergency Department Course"},
            {"name": "diagnosis", "required": true, "label": "Diagnosis"},
            {"name": "treatment_provided", "required": true, "label": "Treatment Provided"},
            {"name": "discharge_medications", "required": false, "label": "Medications"},
            {"name": "follow_up_care", "required": true, "label": "Follow-up Instructions"}
        ],
        "auto_populate": ["triage_vitals", "diagnostic_tests", "treatments_given"]
    }',
    '{
        "emergency": {
            "follow_up": "Follow up with your primary care provider within 1-3 days.",
            "return_criteria": "Return to ED immediately if symptoms worsen or new concerning symptoms develop.",
            "activity": "Rest and avoid strenuous activity until follow-up."
        }
    }'
);

-- Insert sample patient education materials
INSERT INTO patient_education_materials (title, category, condition_codes, content_type, content_text, reading_level) VALUES
(
    'Managing Your High Blood Pressure',
    'condition',
    ARRAY['I10', 'I11.9'],
    'text',
    'High blood pressure affects millions of people. Here are key steps to manage your condition: 1) Take medications as prescribed 2) Follow a low-sodium diet 3) Exercise regularly 4) Monitor your blood pressure at home 5) Keep regular follow-up appointments',
    'grade_8'
),
(
    'Diabetes Care After Hospital Discharge',
    'condition', 
    ARRAY['E11.9', 'E10.9'],
    'text',
    'Managing diabetes after leaving the hospital: 1) Check blood sugar as directed 2) Take all diabetes medications 3) Follow your meal plan 4) Watch for signs of high or low blood sugar 5) Keep all follow-up appointments',
    'grade_8'
),
(
    'Taking Blood Thinner Medications Safely',
    'medication',
    ARRAY['warfarin', 'apixaban', 'rivaroxaban'],
    'text',
    'Important safety tips for blood thinners: 1) Take exactly as prescribed 2) Watch for unusual bleeding 3) Avoid activities with high injury risk 4) Tell all healthcare providers about this medication 5) Get blood tests as scheduled',
    'grade_8'
),
(
    'When to Seek Emergency Care',
    'general',
    ARRAY[],
    'text',
    'Seek immediate emergency care for: 1) Chest pain or pressure 2) Difficulty breathing 3) Severe bleeding 4) Signs of stroke (face drooping, arm weakness, speech difficulty) 5) Severe allergic reactions 6) High fever with confusion',
    'grade_6'
);

-- Views for reporting and analytics
CREATE OR REPLACE VIEW discharge_summary_metrics AS
SELECT 
    DATE_TRUNC('month', created_at) as month,
    template_type,
    COUNT(*) as total_summaries,
    COUNT(CASE WHEN status = 'finalized' THEN 1 END) as finalized_count,
    COUNT(CASE WHEN sent_to_patient = true THEN 1 END) as sent_to_patient_count,
    AVG(EXTRACT(EPOCH FROM (finalized_at - created_at))/3600) as avg_completion_hours,
    COUNT(DISTINCT provider_id) as providers_involved
FROM discharge_summaries ds
JOIN discharge_templates dt ON ds.template_id = dt.id
WHERE ds.created_at >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', created_at), template_type
ORDER BY month DESC;

CREATE OR REPLACE VIEW follow_up_compliance AS
SELECT 
    fr.appointment_type,
    fr.urgency_level,
    COUNT(*) as total_recommendations,
    COUNT(CASE WHEN fr.status = 'scheduled' THEN 1 END) as scheduled_count,
    COUNT(CASE WHEN fr.status = 'completed' THEN 1 END) as completed_count,
    ROUND(COUNT(CASE WHEN fr.status IN ('scheduled', 'completed') THEN 1 END) * 100.0 / COUNT(*), 2) as compliance_rate
FROM follow_up_recommendations fr
JOIN discharge_summaries ds ON fr.discharge_summary_id = ds.id
WHERE ds.discharge_date >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY fr.appointment_type, fr.urgency_level
ORDER BY compliance_rate DESC;

-- Functions for discharge summary generation
CREATE OR REPLACE FUNCTION auto_populate_discharge_data(p_encounter_id INTEGER, p_patient_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    encounter_data RECORD;
    vitals_data JSONB;
    medication_data JSONB;
    result JSONB;
BEGIN
    -- Get encounter data
    SELECT * INTO encounter_data FROM encounters WHERE id = p_encounter_id;
    
    -- Get latest vitals
    SELECT jsonb_agg(jsonb_build_object(
        'measurement_type', measurement_type,
        'value', value,
        'unit', unit,
        'recorded_at', recorded_at
    )) INTO vitals_data
    FROM vitals 
    WHERE encounter_id = p_encounter_id;
    
    -- Get current medications
    SELECT jsonb_agg(jsonb_build_object(
        'medication_name', medication_name,
        'dosage', dosage,
        'frequency', frequency,
        'route', route,
        'status', status
    )) INTO medication_data
    FROM prescriptions 
    WHERE patient_id = p_patient_id AND status = 'active';
    
    -- Compile auto-populated data
    result := jsonb_build_object(
        'encounter_type', encounter_data.encounter_type,
        'chief_complaint', encounter_data.chief_complaint,
        'primary_diagnosis', encounter_data.primary_diagnosis,
        'vitals_summary', vitals_data,
        'current_medications', medication_data,
        'encounter_date', encounter_data.encounter_date
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_discharge_summary_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER discharge_summary_update_timestamp
    BEFORE UPDATE ON discharge_summaries
    FOR EACH ROW
    EXECUTE FUNCTION update_discharge_summary_timestamp();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_discharge_summaries_patient ON discharge_summaries(patient_id);
CREATE INDEX IF NOT EXISTS idx_discharge_summaries_encounter ON discharge_summaries(encounter_id);
CREATE INDEX IF NOT EXISTS idx_discharge_summaries_provider ON discharge_summaries(provider_id);
CREATE INDEX IF NOT EXISTS idx_discharge_summaries_status ON discharge_summaries(status);
CREATE INDEX IF NOT EXISTS idx_discharge_summaries_date ON discharge_summaries(discharge_date);
CREATE INDEX IF NOT EXISTS idx_follow_up_recommendations_discharge ON follow_up_recommendations(discharge_summary_id);
CREATE INDEX IF NOT EXISTS idx_medication_reconciliation_discharge ON medication_reconciliation(discharge_summary_id);
CREATE INDEX IF NOT EXISTS idx_patient_education_conditions ON patient_education_materials USING GIN(condition_codes);
CREATE INDEX IF NOT EXISTS idx_patient_education_medications ON patient_education_materials USING GIN(medication_names);

-- Comments for documentation
COMMENT ON TABLE discharge_templates IS 'Template system for different types of discharge summaries';
COMMENT ON TABLE discharge_summaries IS 'Generated discharge summaries with comprehensive patient instructions';
COMMENT ON TABLE patient_education_materials IS 'Library of patient education materials linked to conditions/medications';
COMMENT ON TABLE follow_up_recommendations IS 'Structured follow-up care recommendations with tracking';
COMMENT ON TABLE medication_reconciliation IS 'Medication changes and reconciliation documentation';
COMMENT ON TABLE discharge_summary_audit IS 'Audit trail for all discharge summary changes';