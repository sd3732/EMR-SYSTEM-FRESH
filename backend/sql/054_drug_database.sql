-- Drug Database Schema for EMR System
-- RxNorm-based medication master list and drug interaction checking

-- RxNorm-based medication master list
CREATE TABLE medications_master (
    id SERIAL PRIMARY KEY,
    rxnorm_cui VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255),
    brand_names TEXT[], -- Array of brand names
    drug_class VARCHAR(100),
    dea_schedule VARCHAR(10), -- I, II, III, IV, V for controlled substances
    dosage_forms TEXT[], -- tablet, capsule, injection, etc.
    strengths TEXT[], -- available strengths
    route_of_administration VARCHAR(50), -- oral, IV, IM, topical, etc.
    therapeutic_class VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Drug-drug interactions database
CREATE TABLE drug_interactions (
    id SERIAL PRIMARY KEY,
    drug1_rxnorm VARCHAR(20) NOT NULL,
    drug2_rxnorm VARCHAR(20) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('severe', 'moderate', 'minor')),
    interaction_type VARCHAR(50), -- pharmacokinetic, pharmacodynamic, etc.
    description TEXT NOT NULL,
    clinical_consequence TEXT,
    mechanism TEXT, -- how the interaction occurs
    management_recommendation TEXT,
    evidence_level VARCHAR(20), -- excellent, good, fair, poor
    source VARCHAR(100), -- data source reference
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(drug1_rxnorm, drug2_rxnorm)
);

-- Patient-specific drug allergies and adverse reactions
CREATE TABLE drug_allergies (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    allergen VARCHAR(255) NOT NULL, -- drug name or class
    allergen_type VARCHAR(50), -- specific drug, drug class, ingredient
    rxnorm_cui VARCHAR(20), -- if specific drug
    reaction_type VARCHAR(100) NOT NULL, -- rash, anaphylaxis, nausea, etc.
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('severe', 'moderate', 'minor')),
    reaction_description TEXT,
    onset_date DATE,
    noted_date DATE NOT NULL DEFAULT CURRENT_DATE,
    noted_by INTEGER REFERENCES providers(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Drug contraindications (conditions where drug should not be used)
CREATE TABLE drug_contraindications (
    id SERIAL PRIMARY KEY,
    rxnorm_cui VARCHAR(20) NOT NULL,
    condition_name VARCHAR(255) NOT NULL,
    contraindication_type VARCHAR(50), -- absolute, relative
    description TEXT,
    severity VARCHAR(20) DEFAULT 'severe',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Look-Alike Sound-Alike (LASA) high-risk medication pairs
CREATE TABLE lasa_medications (
    id SERIAL PRIMARY KEY,
    drug1_name VARCHAR(255) NOT NULL,
    drug2_name VARCHAR(255) NOT NULL,
    drug1_rxnorm VARCHAR(20),
    drug2_rxnorm VARCHAR(20),
    confusion_type VARCHAR(50), -- look-alike, sound-alike, both
    risk_level VARCHAR(20) DEFAULT 'high',
    prevention_strategy TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(drug1_name, drug2_name)
);

-- High-risk medications requiring special monitoring
CREATE TABLE high_risk_medications (
    id SERIAL PRIMARY KEY,
    rxnorm_cui VARCHAR(20) NOT NULL UNIQUE,
    medication_name VARCHAR(255) NOT NULL,
    risk_category VARCHAR(100), -- narrow therapeutic index, black box warning, etc.
    monitoring_requirements TEXT,
    special_precautions TEXT,
    beers_criteria BOOLEAN DEFAULT false, -- potentially inappropriate in elderly
    pregnancy_category VARCHAR(10), -- A, B, C, D, X
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for fast lookups
CREATE INDEX idx_medications_master_name ON medications_master(name);
CREATE INDEX idx_medications_master_generic ON medications_master(generic_name);
CREATE INDEX idx_medications_master_rxnorm ON medications_master(rxnorm_cui);
CREATE INDEX idx_medications_master_class ON medications_master(drug_class);
CREATE INDEX idx_medications_master_active ON medications_master(is_active);

-- Full-text search index for medication names
CREATE INDEX idx_medications_master_name_fts ON medications_master USING gin(to_tsvector('english', name || ' ' || COALESCE(generic_name, '')));
CREATE INDEX idx_medications_master_brands_fts ON medications_master USING gin(to_tsvector('english', array_to_string(brand_names, ' ')));

CREATE INDEX idx_drug_interactions_drug1 ON drug_interactions(drug1_rxnorm);
CREATE INDEX idx_drug_interactions_drug2 ON drug_interactions(drug2_rxnorm);
CREATE INDEX idx_drug_interactions_severity ON drug_interactions(severity);

CREATE INDEX idx_drug_allergies_patient ON drug_allergies(patient_id);
CREATE INDEX idx_drug_allergies_allergen ON drug_allergies(allergen);
CREATE INDEX idx_drug_allergies_rxnorm ON drug_allergies(rxnorm_cui);
CREATE INDEX idx_drug_allergies_active ON drug_allergies(is_active);

CREATE INDEX idx_drug_contraindications_rxnorm ON drug_contraindications(rxnorm_cui);
CREATE INDEX idx_lasa_medications_drug1 ON lasa_medications(drug1_rxnorm);
CREATE INDEX idx_lasa_medications_drug2 ON lasa_medications(drug2_rxnorm);
CREATE INDEX idx_high_risk_medications_rxnorm ON high_risk_medications(rxnorm_cui);

-- Update trigger for medications_master
CREATE OR REPLACE FUNCTION update_medications_master_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_medications_master_updated_at
    BEFORE UPDATE ON medications_master
    FOR EACH ROW
    EXECUTE FUNCTION update_medications_master_updated_at();

-- Update trigger for drug_allergies
CREATE OR REPLACE FUNCTION update_drug_allergies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_drug_allergies_updated_at
    BEFORE UPDATE ON drug_allergies
    FOR EACH ROW
    EXECUTE FUNCTION update_drug_allergies_updated_at();