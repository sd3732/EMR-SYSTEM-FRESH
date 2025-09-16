-- Migration: Enhance patient demographics with social determinants of health
-- This migration extends patient profiles with comprehensive social, economic, and demographic data

BEGIN;

-- Add new columns for core demographic information
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS race VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ethnicity VARCHAR(100),
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(50) DEFAULT 'English',
  ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS occupation VARCHAR(100),
  ADD COLUMN IF NOT EXISTS employer VARCHAR(100),
  ADD COLUMN IF NOT EXISTS education_level VARCHAR(50),
  ADD COLUMN IF NOT EXISTS income_range VARCHAR(30),
  ADD COLUMN IF NOT EXISTS housing_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS transportation_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(50),
  ADD COLUMN IF NOT EXISTS pharmacy_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pharmacy_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pharmacy_address TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS social_determinants JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create indexes for better performance on frequently queried fields
CREATE INDEX IF NOT EXISTS idx_patients_gender ON patients(gender);
CREATE INDEX IF NOT EXISTS idx_patients_race ON patients(race);
CREATE INDEX IF NOT EXISTS idx_patients_preferred_language ON patients(preferred_language);
CREATE INDEX IF NOT EXISTS idx_patients_updated_at ON patients(updated_at);

-- Create GIN index for JSONB social_determinants field
CREATE INDEX IF NOT EXISTS idx_patients_social_determinants ON patients USING GIN (social_determinants);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_patient_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_patients_updated_at ON patients;
CREATE TRIGGER trigger_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW
    EXECUTE FUNCTION update_patient_updated_at();

-- Create comprehensive patient view that combines all data
CREATE OR REPLACE VIEW patient_comprehensive AS
SELECT 
    p.id,
    p.mrn,
    p.first_name,
    p.last_name,
    p.dob,
    EXTRACT(YEAR FROM AGE(p.dob)) as age,
    p.gender,
    p.race,
    p.ethnicity,
    p.preferred_language,
    p.marital_status,
    p.occupation,
    p.employer,
    p.education_level,
    p.income_range,
    p.housing_status,
    p.transportation_method,
    p.emergency_contact_name,
    p.emergency_contact_phone,
    p.emergency_contact_relationship,
    p.pharmacy_name,
    p.pharmacy_phone,
    p.pharmacy_address,
    p.photo_url,
    p.notes,
    p.social_determinants,
    p.insurance_id,
    p.identifiers,
    p.provider_id,
    pr.first_name as provider_first_name,
    pr.last_name as provider_last_name,
    p.created_at,
    p.updated_at
FROM patients p
LEFT JOIN providers pr ON p.provider_id = pr.id;

-- Social Determinants Categories with sample structure for the JSONB field:
COMMENT ON COLUMN patients.social_determinants IS 'JSONB field containing social determinants data structure:
{
  "housing": {
    "type": "owned|rented|homeless|assisted_living|other",
    "stability": "stable|unstable|temporary",
    "conditions": ["overcrowded", "poor_heating", "mold", "lead_paint", "pest_infestation"],
    "safety_concerns": true|false
  },
  "food_security": {
    "status": "secure|mild_insecurity|moderate_insecurity|severe_insecurity",
    "snap_benefits": true|false,
    "food_pantry_use": true|false,
    "dietary_restrictions": ["medical", "religious", "personal"]
  },
  "transportation": {
    "primary_method": "personal_vehicle|public_transit|walking|cycling|rideshare|family_friends|none",
    "barriers": ["no_vehicle", "no_license", "cost", "disability", "distance"],
    "medical_transport_needs": true|false
  },
  "financial": {
    "employment_status": "employed|unemployed|retired|disabled|student",
    "financial_strain": "none|mild|moderate|severe",
    "insurance_barriers": ["high_deductible", "no_coverage", "limited_network", "prior_auth_issues"],
    "medication_cost_concerns": true|false
  },
  "social_support": {
    "living_situation": "alone|with_family|with_friends|group_home|assisted_living",
    "social_isolation": "none|mild|moderate|severe",
    "caregiver_available": true|false,
    "community_resources": ["church", "community_center", "senior_center", "support_groups"]
  },
  "education_literacy": {
    "health_literacy": "adequate|marginal|inadequate",
    "digital_literacy": "high|medium|low|none",
    "primary_language_fluency": "native|fluent|intermediate|basic",
    "interpreter_needed": true|false
  },
  "substance_use": {
    "tobacco": "never|former|current",
    "alcohol": "none|social|moderate|concerning|severe",
    "drugs": "none|marijuana|prescription_misuse|illicit",
    "treatment_history": true|false
  },
  "mental_health": {
    "depression_screen": "negative|mild|moderate|severe",
    "anxiety_screen": "negative|mild|moderate|severe",
    "trauma_history": true|false,
    "current_mental_health_treatment": true|false
  },
  "violence_safety": {
    "domestic_violence": "no|suspected|disclosed",
    "community_violence_exposure": true|false,
    "safety_concerns": true|false,
    "protective_orders": true|false
  }
}';

COMMIT;