-- Migration: Create clinical templates table for standardized note templates
-- This table stores reusable templates for different types of clinical encounters

CREATE TABLE clinical_templates (
    id SERIAL PRIMARY KEY,
    
    -- Template identification
    name VARCHAR(100) NOT NULL,
    description TEXT,
    visit_type VARCHAR(50) NOT NULL, -- 'routine', 'follow-up', 'urgent', 'physical', etc.
    specialty VARCHAR(50),           -- 'internal_medicine', 'cardiology', 'endocrinology', etc.
    
    -- Template content (SOAP structure)
    subjective_template TEXT,        -- Template for subjective section
    objective_template TEXT,         -- Template for objective section  
    assessment_template TEXT,        -- Template for assessment section
    plan_template TEXT,             -- Template for plan section
    
    -- Template metadata
    is_active BOOLEAN DEFAULT true,
    is_system_template BOOLEAN DEFAULT false, -- vs user-created
    usage_count INTEGER DEFAULT 0,
    
    -- Common diagnoses for this template type
    common_diagnoses JSONB,         -- Array of common ICD-10 codes for this visit type
    
    -- Template settings
    auto_populate_vitals BOOLEAN DEFAULT true,
    auto_populate_allergies BOOLEAN DEFAULT true,
    auto_populate_medications BOOLEAN DEFAULT true,
    require_assessment BOOLEAN DEFAULT true,
    require_plan BOOLEAN DEFAULT true,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id)
);

-- Create indexes
CREATE INDEX idx_clinical_templates_visit_type ON clinical_templates(visit_type);
CREATE INDEX idx_clinical_templates_specialty ON clinical_templates(specialty);
CREATE INDEX idx_clinical_templates_active ON clinical_templates(is_active) WHERE is_active = true;
CREATE INDEX idx_clinical_templates_usage ON clinical_templates(usage_count DESC);

-- Trigger for updated_at
CREATE TRIGGER update_clinical_templates_updated_at 
    BEFORE UPDATE ON clinical_templates 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to track template usage
CREATE OR REPLACE FUNCTION track_template_usage(template_id INTEGER) 
RETURNS VOID AS $$
BEGIN
    UPDATE clinical_templates 
    SET usage_count = usage_count + 1
    WHERE id = template_id;
END;
$$ LANGUAGE plpgsql;

-- Insert standard clinical templates
INSERT INTO clinical_templates (
    name, description, visit_type, specialty,
    subjective_template, objective_template, assessment_template, plan_template,
    is_system_template, common_diagnoses,
    auto_populate_vitals, auto_populate_allergies, auto_populate_medications
) VALUES 

-- Annual Physical Template
(
    'Annual Physical Exam',
    'Comprehensive annual physical examination for adults',
    'physical',
    'internal_medicine',
    E'CHIEF COMPLAINT:\n\nHISTORY OF PRESENT ILLNESS:\nPatient here for routine annual physical exam. Generally feels well.\n\nREVIEW OF SYSTEMS:\n- Constitutional: No fever, chills, night sweats, or unintentional weight loss\n- HEENT: No headaches, vision changes, hearing changes\n- Cardiovascular: No chest pain, palpitations, shortness of breath\n- Respiratory: No cough, shortness of breath, wheezing\n- GI: No nausea, vomiting, diarrhea, constipation, abdominal pain\n- GU: No dysuria, frequency, urgency\n- Musculoskeletal: No joint pain, muscle pain, swelling\n- Neurological: No dizziness, weakness, numbness, tingling\n- Psychiatric: No depression, anxiety, sleep disturbances',
    E'VITAL SIGNS:\n[Auto-populated from encounter]\n\nGENERAL APPEARANCE:\nWell-appearing, in no acute distress\n\nHEENT:\nNormocephalic, atraumatic. PERRL. EOMI. TMs clear bilaterally. Oropharynx clear.\n\nNECK:\nSupple, no lymphadenopathy, no thyromegaly, no JVD\n\nCARDIOVASCULAR:\nRegular rate and rhythm, no murmurs, rubs, or gallops. No peripheral edema.\n\nRESPIRATORY:\nClear to auscultation bilaterally, no wheezes, rales, or rhonchi\n\nABDOMEN:\nSoft, non-tender, non-distended, normal bowel sounds, no organomegaly\n\nEXTREMITIES:\nNo cyanosis, clubbing, or edema. Pulses intact.\n\nNEUROLOGICAL:\nAlert and oriented x3. Cranial nerves II-XII intact. Motor and sensory exam grossly normal.\n\nSKIN:\nNo concerning lesions noted.',
    E'ASSESSMENT:\n1. [Primary diagnosis - select from ICD-10]\n2. [Additional diagnoses as needed]\n\nPatient is a [age]-year-old [gender] presenting for routine annual physical examination.',
    E'PLAN:\n1. Continue current medications if stable\n2. Routine laboratory studies: CBC, CMP, lipid panel, HbA1c, TSH\n3. Age-appropriate screening:\n   - Mammogram (if due)\n   - Colonoscopy (if due)\n   - Bone density scan (if due)\n4. Immunizations per CDC guidelines\n5. Lifestyle counseling: diet, exercise, smoking cessation as appropriate\n6. Follow-up in 1 year for routine care, sooner if concerns\n7. Patient education provided and questions answered',
    true,
    '["Z00.00", "Z12.11", "Z23"]'::jsonb,
    true, true, true
),

-- Follow-up Visit Template  
(
    'Follow-up Visit',
    'Standard follow-up visit for established patients',
    'follow-up',
    'internal_medicine',
    E'CHIEF COMPLAINT:\nFollow-up for [condition]\n\nHISTORY OF PRESENT ILLNESS:\nPatient returns for follow-up of [condition]. Since last visit:\n- [Symptoms/status]\n- [Medication compliance]\n- [Response to treatment]\n\nREVIEW OF SYSTEMS:\nPertinent positive: [relevant symptoms]\nPertinent negative: [relevant negatives]\nAll other systems reviewed and negative except as noted above.',
    E'VITAL SIGNS:\n[Auto-populated from encounter]\n\nGENERAL APPEARANCE:\n[General appearance]\n\nPHYSICAL EXAM:\n[Focused exam based on chief complaint]\n- [Relevant findings]\n- [Normal findings]',
    E'ASSESSMENT:\n1. [Primary diagnosis] - [stable/improved/worse]\n2. [Additional active problems]\n\n[Clinical reasoning and assessment of current status]',
    E'PLAN:\n1. [Medication management]\n2. [Diagnostic studies if needed]\n3. [Referrals if needed]\n4. [Lifestyle modifications]\n5. [Follow-up timing and parameters]\n6. [Patient education and counseling]\n7. [When to return/call if concerns]',
    true,
    '[]'::jsonb,
    true, true, true
),

-- Diabetes Management Template
(
    'Diabetes Management',
    'Template for diabetes follow-up visits',
    'follow-up',
    'endocrinology',
    E'CHIEF COMPLAINT:\nDiabetes follow-up\n\nHISTORY OF PRESENT ILLNESS:\nPatient with Type [1/2] diabetes mellitus returns for routine follow-up.\n- Blood sugar control: [patient report]\n- Hypoglycemic episodes: [frequency/severity]\n- Medication compliance: [assessment]\n- Diet and exercise: [adherence]\n- Home glucose monitoring: [frequency/results]\n\nREVIEW OF SYSTEMS:\n- Constitutional: No polyuria, polydipsia, polyphagia, unexplained weight loss\n- Cardiovascular: No chest pain, shortness of breath, palpitations\n- Neurological: No numbness, tingling, vision changes\n- GU: No dysuria, frequency\n- Skin: No slow-healing wounds, infections',
    E'VITAL SIGNS:\n[Auto-populated - note weight changes]\n\nGENERAL APPEARANCE:\nWell-appearing, in no acute distress\n\nCARDIOVASCULAR:\nRegular rate and rhythm, no murmurs. No peripheral edema.\n\nEXTREMITIES:\nFeet examined: [skin integrity, sensation, pulses]\nNo diabetic foot ulcers noted.\n\nNEUROLOGICAL:\nMonofilament testing: [results]\nVibratory sensation: [results]',
    E'ASSESSMENT:\n1. Type [1/2] diabetes mellitus - [controlled/uncontrolled]\n   - HbA1c: [value if available]\n   - Target range: <7% (or individualized target)\n2. [Diabetic complications if present]\n3. [Other comorbidities]',
    E'PLAN:\nDiabetes Management:\n1. Continue [current medications] vs adjust doses\n2. Home glucose monitoring: [frequency recommendations]\n3. HbA1c goal: [target]\n4. Laboratory: HbA1c in 3 months, annual microalbumin, lipids\n\nScreening/Prevention:\n1. Annual diabetic eye exam\n2. Foot care education\n3. Aspirin therapy if appropriate\n4. ACE inhibitor/ARB for renal protection\n\nLifestyle:\n1. Diabetes education reinforcement\n2. Nutritionist referral if needed\n3. Exercise recommendations\n\nFollow-up: 3 months or sooner if concerns',
    true,
    '["E11.9", "E11.65", "E78.5", "I10"]'::jsonb,
    true, true, true
),

-- Hypertension Management Template
(
    'Hypertension Management',
    'Template for hypertension follow-up visits',
    'follow-up',
    'cardiology',
    E'CHIEF COMPLAINT:\nHypertension follow-up\n\nHISTORY OF PRESENT ILLNESS:\nPatient with hypertension returns for routine follow-up.\n- Home blood pressure readings: [patient report]\n- Medication compliance: [assessment]\n- Side effects: [none/specify]\n- Lifestyle modifications: [diet, exercise, weight management]\n\nREVIEW OF SYSTEMS:\n- Cardiovascular: No chest pain, palpitations, shortness of breath\n- Neurological: No headaches, dizziness, vision changes\n- Constitutional: No fatigue or exercise intolerance',
    E'VITAL SIGNS:\n[Auto-populated - multiple BP readings if elevated]\n\nGENERAL APPEARANCE:\nWell-appearing, in no acute distress\n\nCARDIOVASCULAR:\nRegular rate and rhythm, no murmurs, rubs, or gallops.\nNo peripheral edema, pulses intact.\n\nNEUROLOGICAL:\nAlert and oriented, no focal deficits',
    E'ASSESSMENT:\n1. Essential hypertension - [controlled/uncontrolled]\n   - Current BP: [reading]\n   - Target: <130/80 mmHg (or individualized)\n2. [Cardiovascular risk factors]\n3. [Target organ damage if present]',
    E'PLAN:\nHypertension Management:\n1. [Continue current antihypertensives vs adjust]\n2. Home blood pressure monitoring\n3. Target BP: <130/80 mmHg\n\nLifestyle Modifications:\n1. DASH diet, low sodium (<2g/day)\n2. Regular aerobic exercise\n3. Weight management if overweight\n4. Limit alcohol intake\n5. Smoking cessation if applicable\n\nMonitoring:\n1. Renal function and electrolytes in 4-6 weeks if medication changed\n2. Annual cardiovascular risk assessment\n\nFollow-up: [timing based on control]',
    true,
    '["I10", "I25.10", "E78.5"]'::jsonb,
    true, true, true
),

-- Acute Visit Template
(
    'Acute/Urgent Visit',
    'Template for acute illness visits',
    'urgent',
    'internal_medicine',
    E'CHIEF COMPLAINT:\n[Patient''s primary concern in their own words]\n\nHISTORY OF PRESENT ILLNESS:\n[Symptom onset, character, location, duration, severity, aggravating/alleviating factors, associated symptoms, prior episodes, treatments tried]\n\nREVIEW OF SYSTEMS:\nPertinent positive: [relevant symptoms]\nPertinent negative: [relevant negatives that help differentiate diagnosis]',
    E'VITAL SIGNS:\n[Auto-populated - note abnormal values]\n\nGENERAL APPEARANCE:\n[Well-appearing vs ill-appearing, distress level]\n\nFOCUSED PHYSICAL EXAM:\n[Exam findings relevant to chief complaint]\n[Document pertinent positives and negatives]',
    E'ASSESSMENT:\n1. [Most likely diagnosis based on H&P]\n2. [Differential diagnoses considered]\n3. [Risk stratification if applicable]\n\n[Clinical reasoning for diagnosis]',
    E'PLAN:\nDiagnostic:\n1. [Laboratory studies, imaging, other tests if needed]\n\nTherapeutic:\n1. [Medications prescribed]\n2. [Non-pharmacologic interventions]\n\nPatient Education:\n1. [Diagnosis explanation]\n2. [Expected course]\n3. [Warning signs requiring immediate care]\n4. [When to follow up]\n\nDisposition:\n1. [Home vs further evaluation]\n2. [Follow-up timing and with whom]\n3. [Return precautions provided]',
    true,
    '[]'::jsonb,
    true, true, true
);

-- Update usage counters
UPDATE clinical_templates SET usage_count = 0;