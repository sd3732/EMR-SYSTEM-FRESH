-- Migration: Create prescriptions table for patient medication management
-- This table stores individual patient prescriptions with detailed dosing information

CREATE TABLE prescriptions (
    id SERIAL PRIMARY KEY,
    
    -- Patient and provider information
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id INTEGER REFERENCES encounters(id) ON DELETE SET NULL,
    provider_id INTEGER REFERENCES providers(id) ON DELETE SET NULL,
    
    -- Medication information
    medication_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE RESTRICT,
    
    -- Prescription details
    prescribed_name VARCHAR(255) NOT NULL, -- What the provider wrote (may differ from medication name)
    
    -- Dosing instructions
    dose VARCHAR(100) NOT NULL, -- e.g., "10mg", "1-2 tablets", "5ml"
    dose_numeric DECIMAL(10,4), -- numeric dose for calculations
    dose_unit VARCHAR(20), -- mg, ml, tablets, etc.
    
    route VARCHAR(50) DEFAULT 'PO', -- PO, IV, IM, topical, etc.
    frequency VARCHAR(100) NOT NULL, -- BID, TID, Q8H, "twice daily", etc.
    frequency_per_day DECIMAL(3,1), -- numeric frequency for calculations (2.0 for BID)
    
    -- Quantity and refills
    quantity INTEGER, -- number of units dispensed
    quantity_unit VARCHAR(20), -- tablets, ml, tubes, etc.
    refills INTEGER DEFAULT 0,
    refills_remaining INTEGER DEFAULT 0,
    
    -- Duration and timing
    duration_days INTEGER, -- length of treatment
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE, -- calculated or specified end date
    
    -- Instructions and notes
    instructions TEXT, -- "Take with food", "as needed for pain", etc.
    indication VARCHAR(255), -- what condition this treats
    notes TEXT, -- provider notes
    
    -- Prescription status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'discontinued', 'on_hold', 'expired')),
    discontinue_reason VARCHAR(255),
    discontinued_date DATE,
    discontinued_by INTEGER REFERENCES providers(id),
    
    -- Prescription metadata
    external_rx_number VARCHAR(50), -- pharmacy prescription number
    filled_date DATE,
    pharmacy_name VARCHAR(255),
    
    -- System fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES providers(id),
    
    -- Ensure end_date logic
    CONSTRAINT check_end_date CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT check_refills CHECK (refills >= 0 AND refills_remaining >= 0 AND refills_remaining <= refills)
);

-- Create indexes for efficient queries
CREATE INDEX idx_prescriptions_patient_id ON prescriptions(patient_id);
CREATE INDEX idx_prescriptions_encounter_id ON prescriptions(encounter_id);
CREATE INDEX idx_prescriptions_medication_id ON prescriptions(medication_id);
CREATE INDEX idx_prescriptions_provider_id ON prescriptions(provider_id);
CREATE INDEX idx_prescriptions_status ON prescriptions(status);
CREATE INDEX idx_prescriptions_start_date ON prescriptions(start_date);
CREATE INDEX idx_prescriptions_created_at ON prescriptions(created_at);

-- Composite indexes for common queries
CREATE INDEX idx_prescriptions_patient_status ON prescriptions(patient_id, status);
CREATE INDEX idx_prescriptions_patient_active ON prescriptions(patient_id) WHERE status = 'active';

-- Trigger for updated_at
CREATE TRIGGER update_prescriptions_updated_at 
    BEFORE UPDATE ON prescriptions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically set end_date based on duration
CREATE OR REPLACE FUNCTION set_prescription_end_date() 
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-calculate end_date if duration_days is provided but end_date is not
    IF NEW.duration_days IS NOT NULL AND NEW.end_date IS NULL THEN
        NEW.end_date := NEW.start_date + INTERVAL '1 day' * NEW.duration_days;
    END IF;
    
    -- Set refills_remaining to refills for new prescriptions
    IF TG_OP = 'INSERT' AND NEW.refills_remaining IS NULL THEN
        NEW.refills_remaining := COALESCE(NEW.refills, 0);
    END IF;
    
    -- Auto-expire prescriptions past their end date
    IF NEW.end_date IS NOT NULL AND NEW.end_date < CURRENT_DATE AND NEW.status = 'active' THEN
        NEW.status := 'expired';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_prescription_end_date
    BEFORE INSERT OR UPDATE ON prescriptions
    FOR EACH ROW EXECUTE FUNCTION set_prescription_end_date();