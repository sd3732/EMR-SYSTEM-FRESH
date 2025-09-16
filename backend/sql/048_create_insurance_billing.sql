-- Migration: Create insurance and billing information management
-- This migration extends patient information with comprehensive insurance and billing data

BEGIN;

-- Insurance Plans Table
CREATE TABLE IF NOT EXISTS insurance_plans (
    id SERIAL PRIMARY KEY,
    plan_name VARCHAR(200) NOT NULL,
    insurance_company VARCHAR(200) NOT NULL,
    plan_type VARCHAR(50) CHECK (plan_type IN ('HMO', 'PPO', 'EPO', 'POS', 'HDHP', 'Medicare', 'Medicaid', 'Other')),
    network_id VARCHAR(100),
    phone VARCHAR(20),
    website VARCHAR(200),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Patient Insurance Table
CREATE TABLE IF NOT EXISTS patient_insurance (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    insurance_plan_id INTEGER REFERENCES insurance_plans(id),
    
    -- Policy Information
    policy_number VARCHAR(100) NOT NULL,
    group_number VARCHAR(100),
    subscriber_id VARCHAR(100),
    subscriber_name VARCHAR(200),
    subscriber_relationship VARCHAR(50) CHECK (subscriber_relationship IN ('self', 'spouse', 'child', 'parent', 'other')),
    subscriber_dob DATE,
    subscriber_ssn VARCHAR(20), -- encrypted in production
    
    -- Coverage Information
    effective_date DATE,
    termination_date DATE,
    priority_order INTEGER DEFAULT 1, -- 1 = primary, 2 = secondary, etc.
    
    -- Benefits Information
    copay_primary_care DECIMAL(8,2),
    copay_specialist DECIMAL(8,2),
    deductible DECIMAL(10,2),
    deductible_met DECIMAL(10,2) DEFAULT 0,
    out_of_pocket_max DECIMAL(10,2),
    out_of_pocket_met DECIMAL(10,2) DEFAULT 0,
    
    -- Coverage Details
    covers_prescriptions BOOLEAN DEFAULT true,
    covers_mental_health BOOLEAN DEFAULT true,
    covers_vision BOOLEAN DEFAULT false,
    covers_dental BOOLEAN DEFAULT false,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'terminated')),
    verification_date DATE,
    verified_by VARCHAR(100),
    
    -- Additional Information
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Billing Information Table
CREATE TABLE IF NOT EXISTS patient_billing (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    
    -- Billing Address (can be different from patient address)
    billing_address VARCHAR(200),
    billing_city VARCHAR(100),
    billing_state VARCHAR(50),
    billing_zip_code VARCHAR(20),
    billing_country VARCHAR(100) DEFAULT 'United States',
    
    -- Contact Information
    billing_phone VARCHAR(20),
    billing_email VARCHAR(200),
    
    -- Billing Preferences
    preferred_contact_method VARCHAR(50) CHECK (preferred_contact_method IN ('email', 'phone', 'mail', 'portal')),
    statement_delivery VARCHAR(50) CHECK (statement_delivery IN ('email', 'mail', 'portal')) DEFAULT 'mail',
    payment_method VARCHAR(50) CHECK (payment_method IN ('cash', 'check', 'credit_card', 'debit_card', 'auto_pay', 'insurance_only')),
    
    -- Auto-Pay Information (if applicable)
    autopay_enabled BOOLEAN DEFAULT false,
    autopay_card_last_four VARCHAR(4),
    autopay_card_type VARCHAR(20),
    autopay_bank_last_four VARCHAR(4),
    
    -- Financial Information
    credit_limit DECIMAL(10,2),
    current_balance DECIMAL(10,2) DEFAULT 0,
    payment_plan_active BOOLEAN DEFAULT false,
    payment_plan_amount DECIMAL(10,2),
    payment_plan_frequency VARCHAR(20),
    
    -- Financial Assistance
    financial_assistance_eligible BOOLEAN DEFAULT false,
    financial_assistance_percentage INTEGER,
    hardship_status VARCHAR(50),
    
    -- Billing Notes
    billing_notes TEXT,
    collection_notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Billing Transactions Table
CREATE TABLE IF NOT EXISTS billing_transactions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    patient_billing_id INTEGER REFERENCES patient_billing(id),
    
    -- Transaction Information
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('charge', 'payment', 'adjustment', 'refund', 'write_off')),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount DECIMAL(10,2) NOT NULL,
    
    -- Service Information
    service_date DATE,
    service_description TEXT,
    procedure_code VARCHAR(20),
    diagnosis_code VARCHAR(20),
    
    -- Payment Information
    payment_method VARCHAR(50),
    check_number VARCHAR(50),
    authorization_code VARCHAR(50),
    
    -- Insurance Information
    insurance_claim_number VARCHAR(100),
    insurance_payment DECIMAL(10,2),
    patient_responsibility DECIMAL(10,2),
    
    -- Status and Notes
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'denied', 'appealing', 'paid')),
    notes TEXT,
    
    -- Audit Information
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_patient_insurance_patient_id ON patient_insurance(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_insurance_priority ON patient_insurance(priority_order);
CREATE INDEX IF NOT EXISTS idx_patient_insurance_status ON patient_insurance(status);
CREATE INDEX IF NOT EXISTS idx_patient_billing_patient_id ON patient_billing(patient_id);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_patient_id ON billing_transactions(patient_id);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_date ON billing_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_type ON billing_transactions(transaction_type);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_insurance_billing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_insurance_plans_updated_at ON insurance_plans;
CREATE TRIGGER trigger_insurance_plans_updated_at
    BEFORE UPDATE ON insurance_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_insurance_billing_updated_at();

DROP TRIGGER IF EXISTS trigger_patient_insurance_updated_at ON patient_insurance;
CREATE TRIGGER trigger_patient_insurance_updated_at
    BEFORE UPDATE ON patient_insurance
    FOR EACH ROW
    EXECUTE FUNCTION update_insurance_billing_updated_at();

DROP TRIGGER IF EXISTS trigger_patient_billing_updated_at ON patient_billing;
CREATE TRIGGER trigger_patient_billing_updated_at
    BEFORE UPDATE ON patient_billing
    FOR EACH ROW
    EXECUTE FUNCTION update_insurance_billing_updated_at();

DROP TRIGGER IF EXISTS trigger_billing_transactions_updated_at ON billing_transactions;
CREATE TRIGGER trigger_billing_transactions_updated_at
    BEFORE UPDATE ON billing_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_insurance_billing_updated_at();

-- Create comprehensive patient financial view
CREATE OR REPLACE VIEW patient_financial_summary AS
SELECT 
    p.id as patient_id,
    p.first_name,
    p.last_name,
    p.dob,
    
    -- Primary Insurance
    pi_primary.policy_number as primary_policy,
    ip_primary.plan_name as primary_plan,
    ip_primary.insurance_company as primary_company,
    pi_primary.copay_primary_care,
    pi_primary.deductible,
    pi_primary.deductible_met,
    
    -- Secondary Insurance
    pi_secondary.policy_number as secondary_policy,
    ip_secondary.plan_name as secondary_plan,
    ip_secondary.insurance_company as secondary_company,
    
    -- Billing Information
    pb.current_balance,
    pb.payment_plan_active,
    pb.financial_assistance_eligible,
    pb.preferred_contact_method,
    pb.statement_delivery,
    
    -- Recent Transaction Summary
    (SELECT SUM(amount) FROM billing_transactions bt 
     WHERE bt.patient_id = p.id 
     AND bt.transaction_type = 'charge' 
     AND bt.transaction_date >= CURRENT_DATE - INTERVAL '90 days') as charges_90_days,
     
    (SELECT SUM(amount) FROM billing_transactions bt 
     WHERE bt.patient_id = p.id 
     AND bt.transaction_type = 'payment' 
     AND bt.transaction_date >= CURRENT_DATE - INTERVAL '90 days') as payments_90_days

FROM patients p
LEFT JOIN patient_insurance pi_primary ON p.id = pi_primary.patient_id AND pi_primary.priority_order = 1 AND pi_primary.status = 'active'
LEFT JOIN insurance_plans ip_primary ON pi_primary.insurance_plan_id = ip_primary.id
LEFT JOIN patient_insurance pi_secondary ON p.id = pi_secondary.patient_id AND pi_secondary.priority_order = 2 AND pi_secondary.status = 'active'
LEFT JOIN insurance_plans ip_secondary ON pi_secondary.insurance_plan_id = ip_secondary.id
LEFT JOIN patient_billing pb ON p.id = pb.patient_id;

-- Sample insurance plans (common providers)
INSERT INTO insurance_plans (plan_name, insurance_company, plan_type, phone) VALUES 
    ('Blue Cross Blue Shield PPO', 'Blue Cross Blue Shield', 'PPO', '1-800-123-4567'),
    ('Aetna Better Health', 'Aetna', 'HMO', '1-800-234-5678'),
    ('UnitedHealthcare Choice Plus', 'UnitedHealthcare', 'PPO', '1-800-345-6789'),
    ('Cigna HealthCare', 'Cigna', 'PPO', '1-800-456-7890'),
    ('Kaiser Permanente', 'Kaiser Permanente', 'HMO', '1-800-567-8901'),
    ('Humana Gold Plus', 'Humana', 'Medicare', '1-800-678-9012'),
    ('Medicare Traditional', 'Centers for Medicare & Medicaid Services', 'Medicare', '1-800-633-4227'),
    ('Medicaid', 'State Medicaid Program', 'Medicaid', '1-800-789-0123')
ON CONFLICT DO NOTHING;

COMMIT;