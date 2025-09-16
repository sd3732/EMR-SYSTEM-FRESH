-- Migration: Create medications table for prescription management
-- This table stores the drug database with comprehensive medication information

CREATE TABLE medications (
    id SERIAL PRIMARY KEY,
    
    -- Drug names and identifiers
    generic_name VARCHAR(255) NOT NULL,
    brand_name VARCHAR(255),
    ndc VARCHAR(20), -- National Drug Code
    rxcui VARCHAR(20), -- RxNorm Concept Unique Identifier
    
    -- Drug classification
    drug_class VARCHAR(100),
    therapeutic_class VARCHAR(100),
    
    -- Dosage information
    dosage_form VARCHAR(50) NOT NULL, -- tablet, capsule, liquid, injection, etc.
    strength VARCHAR(100) NOT NULL, -- 10mg, 5mg/ml, etc.
    strength_numeric DECIMAL(10,4), -- numeric value for calculations
    strength_unit VARCHAR(20), -- mg, ml, g, etc.
    
    -- Drug characteristics
    controlled_substance BOOLEAN DEFAULT false,
    schedule VARCHAR(10), -- C-I, C-II, C-III, C-IV, C-V
    
    -- Status and metadata
    active BOOLEAN DEFAULT true,
    formulary BOOLEAN DEFAULT true, -- covered by insurance/formulary
    generic_available BOOLEAN DEFAULT false,
    
    -- Common prescribing information
    typical_dose_min DECIMAL(10,4),
    typical_dose_max DECIMAL(10,4),
    typical_frequency VARCHAR(50), -- BID, TID, QD, etc.
    
    -- Search optimization
    search_vector TSVECTOR,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient searching
CREATE INDEX idx_medications_generic_name ON medications(generic_name);
CREATE INDEX idx_medications_brand_name ON medications(brand_name);
CREATE INDEX idx_medications_drug_class ON medications(drug_class);
CREATE INDEX idx_medications_dosage_form ON medications(dosage_form);
CREATE INDEX idx_medications_active ON medications(active);
CREATE INDEX idx_medications_controlled ON medications(controlled_substance);

-- Full-text search index
CREATE INDEX idx_medications_search ON medications USING gin(search_vector);

-- Trigger to update search vector
CREATE OR REPLACE FUNCTION update_medication_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', 
        COALESCE(NEW.generic_name, '') || ' ' ||
        COALESCE(NEW.brand_name, '') || ' ' ||
        COALESCE(NEW.drug_class, '') || ' ' ||
        COALESCE(NEW.therapeutic_class, '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_medication_search_vector
    BEFORE INSERT OR UPDATE ON medications
    FOR EACH ROW EXECUTE FUNCTION update_medication_search_vector();

-- Trigger for updated_at
CREATE TRIGGER update_medications_updated_at 
    BEFORE UPDATE ON medications 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();