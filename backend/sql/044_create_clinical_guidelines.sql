-- Migration: Create clinical guidelines system for preventive care reminders
-- This system manages age-based, gender-specific, and condition-based screening recommendations

-- Main clinical guidelines table
CREATE TABLE clinical_guidelines (
    id SERIAL PRIMARY KEY,
    
    -- Guideline identification
    guideline_code VARCHAR(50) NOT NULL UNIQUE, -- e.g., 'MAMMOGRAM_SCREENING', 'COLONOSCOPY_50'
    name VARCHAR(255) NOT NULL, -- human-readable name
    description TEXT,
    category VARCHAR(100) NOT NULL CHECK (category IN (
        'cancer_screening', 'cardiovascular_screening', 'metabolic_screening',
        'infectious_disease', 'vaccination', 'wellness_exam', 'specialty_referral'
    )),
    
    -- Eligibility criteria
    min_age INTEGER, -- minimum age for guideline
    max_age INTEGER, -- maximum age (NULL if no max)
    gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'any')) DEFAULT 'any',
    
    -- Risk factors (JSON array of conditions that modify recommendations)
    risk_factors JSONB DEFAULT '[]', -- e.g., ['family_history_breast_cancer', 'smoking_history']
    excluding_conditions JSONB DEFAULT '[]', -- conditions that exclude this guideline
    
    -- Timing and frequency
    interval_months INTEGER NOT NULL, -- how often to repeat (e.g., 12 for annual)
    interval_description VARCHAR(100), -- human description like "annually" or "every 3 years"
    start_age INTEGER, -- age to start screening
    
    -- Priority and urgency
    priority_level INTEGER DEFAULT 2 CHECK (priority_level BETWEEN 1 AND 5), -- 1=critical, 5=optional
    days_overdue_yellow INTEGER DEFAULT 30, -- days past due for yellow alert
    days_overdue_red INTEGER DEFAULT 90, -- days past due for red alert
    
    -- Clinical details
    procedure_codes TEXT[], -- CPT codes for the procedure
    icd10_codes TEXT[], -- relevant ICD-10 codes
    lab_codes TEXT[], -- LOINC codes if lab-based
    
    -- Recommendations and patient education
    patient_instructions TEXT, -- what to tell the patient
    provider_notes TEXT, -- clinical notes for providers
    contraindications TEXT[], -- when not to recommend
    special_populations TEXT, -- special considerations
    
    -- Evidence and references
    evidence_level VARCHAR(20) CHECK (evidence_level IN (
        'grade_a', 'grade_b', 'grade_c', 'grade_d', 'insufficient'
    )) DEFAULT 'grade_b',
    source_organization VARCHAR(255), -- USPSTF, ACS, ADA, etc.
    last_updated DATE DEFAULT CURRENT_DATE,
    
    -- Status
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Patient-specific guideline tracking
CREATE TABLE patient_guideline_status (
    id SERIAL PRIMARY KEY,
    
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    guideline_id INTEGER NOT NULL REFERENCES clinical_guidelines(id) ON DELETE CASCADE,
    
    -- Current status
    status VARCHAR(20) NOT NULL CHECK (status IN (
        'due', 'overdue', 'completed', 'declined', 'deferred', 'not_applicable'
    )) DEFAULT 'due',
    
    -- Timing information
    due_date DATE NOT NULL,
    last_completed_date DATE, -- when was this last done
    next_due_date DATE, -- calculated next due date
    
    -- Risk assessment
    risk_level VARCHAR(20) CHECK (risk_level IN (
        'low', 'average', 'elevated', 'high'
    )) DEFAULT 'average',
    risk_factors_present TEXT[], -- specific risk factors for this patient
    
    -- Override information
    override_reason VARCHAR(100), -- why was this deferred/declined
    override_date DATE,
    override_provider_id INTEGER REFERENCES providers(id),
    override_notes TEXT,
    
    -- Completion tracking
    completed_date DATE,
    completed_provider_id INTEGER REFERENCES providers(id),
    completion_notes TEXT,
    result_summary TEXT, -- brief summary of results
    
    -- System fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one status per patient per guideline
    CONSTRAINT unique_patient_guideline UNIQUE (patient_id, guideline_id)
);

-- Vaccination tracking (extends basic vaccines table)
CREATE TABLE vaccination_schedules (
    id SERIAL PRIMARY KEY,
    
    -- Vaccine information
    vaccine_name VARCHAR(255) NOT NULL,
    vaccine_code VARCHAR(50), -- CVX code
    series_name VARCHAR(255), -- e.g., "Hepatitis B 3-dose series"
    dose_number INTEGER NOT NULL, -- which dose in series (1, 2, 3, etc.)
    total_doses INTEGER NOT NULL, -- total doses in series
    
    -- Age and timing requirements
    min_age_months INTEGER, -- minimum age for this dose
    max_age_months INTEGER, -- maximum age (NULL if no limit)
    min_interval_weeks INTEGER, -- minimum weeks since previous dose
    recommended_interval_weeks INTEGER, -- recommended interval
    
    -- Special populations and risk factors
    risk_groups TEXT[], -- high-risk groups that need this
    contraindications TEXT[], -- when not to give
    special_considerations TEXT,
    
    -- Clinical details
    route VARCHAR(50), -- IM, PO, intranasal
    site VARCHAR(50), -- deltoid, anterolateral thigh
    volume VARCHAR(20), -- 0.5mL, etc.
    
    -- Status and metadata
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Patient vaccination tracking
CREATE TABLE patient_vaccinations (
    id SERIAL PRIMARY KEY,
    
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    vaccination_schedule_id INTEGER REFERENCES vaccination_schedules(id),
    
    -- Vaccine details (can be independent of schedule)
    vaccine_name VARCHAR(255) NOT NULL,
    vaccine_code VARCHAR(50),
    lot_number VARCHAR(100),
    manufacturer VARCHAR(255),
    expiration_date DATE,
    
    -- Administration details
    administered_date DATE NOT NULL,
    administered_provider_id INTEGER REFERENCES providers(id),
    route VARCHAR(50),
    site VARCHAR(50),
    dose VARCHAR(20),
    
    -- Series tracking
    dose_number INTEGER,
    series_complete BOOLEAN DEFAULT false,
    
    -- Reactions and notes
    adverse_reaction TEXT,
    reaction_severity VARCHAR(20) CHECK (reaction_severity IN (
        'none', 'mild', 'moderate', 'severe'
    )) DEFAULT 'none',
    notes TEXT,
    
    -- Next dose information
    next_dose_due_date DATE,
    next_dose_overdue_date DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient queries
CREATE INDEX idx_clinical_guidelines_category ON clinical_guidelines(category);
CREATE INDEX idx_clinical_guidelines_age_gender ON clinical_guidelines(min_age, max_age, gender);
CREATE INDEX idx_clinical_guidelines_active ON clinical_guidelines(active) WHERE active = true;

CREATE INDEX idx_patient_guideline_status_patient ON patient_guideline_status(patient_id);
CREATE INDEX idx_patient_guideline_status_due ON patient_guideline_status(status, due_date);
CREATE INDEX idx_patient_guideline_status_overdue ON patient_guideline_status(status) WHERE status IN ('due', 'overdue');

CREATE INDEX idx_vaccination_schedules_vaccine ON vaccination_schedules(vaccine_name);
CREATE INDEX idx_vaccination_schedules_age ON vaccination_schedules(min_age_months, max_age_months);

CREATE INDEX idx_patient_vaccinations_patient ON patient_vaccinations(patient_id);
CREATE INDEX idx_patient_vaccinations_date ON patient_vaccinations(administered_date);
CREATE INDEX idx_patient_vaccinations_due ON patient_vaccinations(next_dose_due_date) WHERE next_dose_due_date IS NOT NULL;

-- Triggers for updated_at
CREATE TRIGGER update_clinical_guidelines_updated_at 
    BEFORE UPDATE ON clinical_guidelines 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_guideline_status_updated_at 
    BEFORE UPDATE ON patient_guideline_status 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert common clinical guidelines
INSERT INTO clinical_guidelines (
    guideline_code, name, description, category, min_age, max_age, gender,
    interval_months, start_age, priority_level, 
    patient_instructions, provider_notes, evidence_level, source_organization
) VALUES
    -- Cancer Screenings
    ('MAMMOGRAM_ANNUAL', 'Annual Mammography', 'Breast cancer screening for average-risk women', 
     'cancer_screening', 40, 75, 'female', 12, 40, 2,
     'Annual mammogram recommended. Schedule with radiology department.',
     'Consider earlier screening if family history or genetic risk factors present.',
     'grade_b', 'USPSTF'),
     
    ('MAMMOGRAM_BIENNIAL', 'Biennial Mammography', 'Breast cancer screening every 2 years', 
     'cancer_screening', 50, 74, 'female', 24, 50, 2,
     'Mammogram every 2 years. Discuss benefits and risks with your provider.',
     'USPSTF Grade B recommendation for biennial screening ages 50-74.',
     'grade_b', 'USPSTF'),
     
    ('COLONOSCOPY_SCREENING', 'Colonoscopy Screening', 'Colorectal cancer screening', 
     'cancer_screening', 45, 75, 'any', 120, 45, 2,
     'Colonoscopy every 10 years starting at age 45, or other screening options available.',
     'Consider earlier screening if family history. Alternative: FIT annually, sigmoidoscopy every 5 years.',
     'grade_a', 'USPSTF'),
     
    ('CERVICAL_CANCER_SCREENING', 'Cervical Cancer Screening', 'Pap smear and HPV testing', 
     'cancer_screening', 21, 65, 'female', 36, 21, 2,
     'Pap smear every 3 years (ages 21-29) or Pap + HPV every 5 years (ages 30-65).',
     'Age 21-29: cytology every 3 years. Age 30-65: cytology + HPV every 5 years preferred.',
     'grade_a', 'USPSTF'),
     
    ('PROSTATE_SCREENING', 'Prostate Cancer Screening', 'PSA and digital rectal exam discussion', 
     'cancer_screening', 50, 70, 'male', 12, 50, 3,
     'Discuss PSA screening benefits and risks with your provider.',
     'Shared decision making required. Consider earlier discussion if African American or family history.',
     'grade_c', 'USPSTF'),

    -- Cardiovascular Screenings
    ('BP_SCREENING', 'Blood Pressure Screening', 'Hypertension screening for adults', 
     'cardiovascular_screening', 18, NULL, 'any', 12, 18, 1,
     'Annual blood pressure check recommended.',
     'More frequent monitoring if elevated readings or risk factors present.',
     'grade_a', 'USPSTF'),
     
    ('CHOLESTEROL_SCREENING', 'Cholesterol Screening', 'Lipid panel for cardiovascular risk', 
     'cardiovascular_screening', 40, 75, 'male', 60, 40, 2,
     'Cholesterol screening every 5 years, or more frequently if risk factors present.',
     'Consider earlier/more frequent screening with diabetes, family history, or other CV risk factors.',
     'grade_a', 'USPSTF'),
     
    ('CHOLESTEROL_SCREENING_FEMALE', 'Cholesterol Screening (Women)', 'Lipid panel for women', 
     'cardiovascular_screening', 45, 75, 'female', 60, 45, 2,
     'Cholesterol screening every 5 years, or more frequently if risk factors present.',
     'Consider earlier screening with risk factors: diabetes, smoking, hypertension, family history.',
     'grade_a', 'USPSTF'),

    -- Metabolic Screenings  
    ('DIABETES_SCREENING', 'Diabetes Screening', 'Type 2 diabetes screening', 
     'metabolic_screening', 35, 70, 'any', 36, 35, 2,
     'Blood sugar screening every 3 years if normal, annually if prediabetic.',
     'Screen earlier and more frequently if overweight/obese with additional risk factors.',
     'grade_b', 'USPSTF'),
     
    ('DIABETES_MONITORING', 'Diabetes A1C Monitoring', 'Glycemic control monitoring for diabetics', 
     'metabolic_screening', 18, NULL, 'any', 6, 18, 1,
     'A1C every 6 months if well-controlled, every 3 months if poor control.',
     'Frequency based on glycemic control and treatment changes.',
     'grade_a', 'ADA'),

    -- Vaccinations
    ('INFLUENZA_ANNUAL', 'Annual Influenza Vaccine', 'Yearly flu vaccination', 
     'vaccination', 6, NULL, 'any', 12, 1, 2,
     'Annual flu vaccine recommended for everyone 6 months and older.',
     'Timing: ideally by October, but vaccine throughout flu season if not yet received.',
     'grade_a', 'CDC'),
     
    ('COVID_VACCINE', 'COVID-19 Vaccination', 'COVID-19 vaccine series and boosters', 
     'vaccination', 6, NULL, 'any', 12, 1, 2,
     'Stay up to date with COVID-19 vaccination including boosters as recommended.',
     'Follow CDC guidance for primary series completion and booster timing.',
     'grade_a', 'CDC'),
     
    ('TDAP_VACCINE', 'Tdap Booster', 'Tetanus, diphtheria, acellular pertussis booster', 
     'vaccination', 19, NULL, 'any', 120, 19, 2,
     'Tdap booster every 10 years, or Td if Tdap not available.',
     'One-time Tdap substitution for Td booster, then Td every 10 years.',
     'grade_a', 'CDC'),

    -- Wellness Exams
    ('ANNUAL_WELLNESS', 'Annual Wellness Exam', 'Comprehensive preventive care visit', 
     'wellness_exam', 18, NULL, 'any', 12, 18, 1,
     'Annual wellness exam for health maintenance and preventive care.',
     'Opportunity to review all preventive care recommendations and health goals.',
     'grade_a', 'CMS');

-- Insert common vaccination schedules
INSERT INTO vaccination_schedules (
    vaccine_name, vaccine_code, series_name, dose_number, total_doses,
    min_age_months, recommended_interval_weeks, risk_groups, route, site, volume
) VALUES
    -- Hepatitis B series
    ('Hepatitis B', 'HepB', 'Hepatitis B 3-dose series', 1, 3, 0, 0, 
     ARRAY['healthcare_workers', 'dialysis_patients'], 'IM', 'deltoid', '0.5mL'),
    ('Hepatitis B', 'HepB', 'Hepatitis B 3-dose series', 2, 3, 1, 4, 
     ARRAY['healthcare_workers', 'dialysis_patients'], 'IM', 'deltoid', '0.5mL'),
    ('Hepatitis B', 'HepB', 'Hepatitis B 3-dose series', 3, 3, 6, 8, 
     ARRAY['healthcare_workers', 'dialysis_patients'], 'IM', 'deltoid', '0.5mL'),
     
    -- HPV series
    ('HPV', 'HPV9', 'HPV 2-dose series (11-14 years)', 1, 2, 132, 0, 
     ARRAY['adolescents'], 'IM', 'deltoid', '0.5mL'),
    ('HPV', 'HPV9', 'HPV 2-dose series (11-14 years)', 2, 2, 132, 24, 
     ARRAY['adolescents'], 'IM', 'deltoid', '0.5mL'),
     
    -- Zoster vaccine
    ('Zoster (Shingles)', 'ZOS', 'Shingles vaccine series', 1, 2, 600, 0, 
     ARRAY['adults_50_plus'], 'IM', 'deltoid', '0.5mL'),
    ('Zoster (Shingles)', 'ZOS', 'Shingles vaccine series', 2, 2, 600, 8, 
     ARRAY['adults_50_plus'], 'IM', 'deltoid', '0.5mL'),
     
    -- Pneumococcal
    ('Pneumococcal', 'PCV13', 'Pneumococcal conjugate vaccine', 1, 1, 780, 0, 
     ARRAY['adults_65_plus', 'immunocompromised'], 'IM', 'deltoid', '0.5mL');