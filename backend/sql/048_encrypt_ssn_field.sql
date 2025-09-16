-- Migration: Encrypt SSN field for HIPAA compliance
-- This migration adds encrypted storage for Social Security Numbers
-- Addresses critical security vulnerability identified in security audit

BEGIN;

-- Add encrypted SSN column to patient_insurance table
-- Using TEXT type to store base64-encoded encrypted data
ALTER TABLE patient_insurance 
    ADD COLUMN subscriber_ssn_encrypted TEXT;

-- Add comment explaining the encryption approach
COMMENT ON COLUMN patient_insurance.subscriber_ssn_encrypted IS 
'Encrypted Social Security Number using AES-256-GCM encryption.
Format: base64(keyId:iv:tag:ciphertext)
HIPAA compliant encrypted storage for PHI data.
Use encryption service to encrypt/decrypt values.';

-- Add performance index on patient_id for encrypted SSN queries
CREATE INDEX IF NOT EXISTS idx_patient_insurance_encrypted_ssn 
    ON patient_insurance(patient_id) 
    WHERE subscriber_ssn_encrypted IS NOT NULL;

-- Add audit log table for SSN access tracking (HIPAA requirement)
CREATE TABLE IF NOT EXISTS ssn_access_log (
    id SERIAL PRIMARY KEY,
    patient_insurance_id INTEGER REFERENCES patient_insurance(id) ON DELETE SET NULL,
    user_id INTEGER, -- References users table but nullable for system operations
    access_type VARCHAR(20) NOT NULL CHECK (access_type IN ('encrypt', 'decrypt', 'view', 'update')),
    ip_address INET,
    user_agent TEXT,
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    session_id VARCHAR(255),
    purpose TEXT, -- Business reason for accessing SSN
    
    -- Audit trail metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for audit log queries
CREATE INDEX idx_ssn_access_log_patient_id ON ssn_access_log(patient_insurance_id);
CREATE INDEX idx_ssn_access_log_accessed_at ON ssn_access_log(accessed_at);
CREATE INDEX idx_ssn_access_log_user_id ON ssn_access_log(user_id);

-- Add trigger to log SSN column updates
CREATE OR REPLACE FUNCTION log_ssn_access()
RETURNS TRIGGER AS $$
BEGIN
    -- Log when encrypted SSN is updated
    IF NEW.subscriber_ssn_encrypted IS DISTINCT FROM OLD.subscriber_ssn_encrypted THEN
        INSERT INTO ssn_access_log (
            patient_insurance_id, 
            access_type, 
            purpose
        ) VALUES (
            NEW.id, 
            'update', 
            'SSN field updated via database trigger'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for SSN access logging
DROP TRIGGER IF EXISTS trigger_log_ssn_access ON patient_insurance;
CREATE TRIGGER trigger_log_ssn_access
    BEFORE UPDATE ON patient_insurance
    FOR EACH ROW
    EXECUTE FUNCTION log_ssn_access();

-- Add constraint to ensure either plaintext or encrypted SSN exists, but not both in final state
-- This constraint will be enabled after migration is complete
-- Note: We'll add this constraint after the migration process completes

-- Create view for safe SSN access (masked by default)
CREATE OR REPLACE VIEW patient_insurance_safe AS
SELECT 
    id,
    patient_id,
    insurance_plan_id,
    policy_number,
    group_number,
    subscriber_id,
    subscriber_name,
    -- Mask SSN in view - show only last 4 digits
    CASE 
        WHEN subscriber_ssn IS NOT NULL THEN 
            'XXX-XX-' || RIGHT(subscriber_ssn, 4)
        WHEN subscriber_ssn_encrypted IS NOT NULL THEN 
            'XXX-XX-[ENCRYPTED]'
        ELSE NULL
    END as subscriber_ssn_masked,
    subscriber_relationship,
    subscriber_dob,
    effective_date,
    termination_date,
    priority_order,
    copay_primary_care,
    copay_specialist,
    deductible,
    deductible_met,
    out_of_pocket_max,
    out_of_pocket_met,
    covers_prescriptions,
    covers_mental_health,
    covers_vision,
    covers_dental,
    status,
    verification_date,
    verified_by,
    notes,
    created_at,
    updated_at
FROM patient_insurance;

-- Grant appropriate permissions
GRANT SELECT ON patient_insurance_safe TO PUBLIC;

-- Create function to safely access encrypted SSN (with logging)
CREATE OR REPLACE FUNCTION get_decrypted_ssn(
    p_patient_insurance_id INTEGER,
    p_user_id INTEGER DEFAULT NULL,
    p_purpose TEXT DEFAULT NULL
)
RETURNS TEXT
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    encrypted_ssn TEXT;
    ssn_exists BOOLEAN;
BEGIN
    -- Check if record exists and has encrypted SSN
    SELECT 
        subscriber_ssn_encrypted IS NOT NULL,
        subscriber_ssn_encrypted
    INTO ssn_exists, encrypted_ssn
    FROM patient_insurance 
    WHERE id = p_patient_insurance_id;
    
    -- Return NULL if no record or no encrypted SSN
    IF NOT FOUND OR NOT ssn_exists THEN
        RETURN NULL;
    END IF;
    
    -- Log the access attempt
    INSERT INTO ssn_access_log (
        patient_insurance_id,
        user_id,
        access_type,
        ip_address,
        purpose
    ) VALUES (
        p_patient_insurance_id,
        p_user_id,
        'decrypt',
        inet_client_addr(),
        COALESCE(p_purpose, 'SSN decryption requested')
    );
    
    -- Return encrypted value (application layer will decrypt)
    -- We don't decrypt in SQL for security reasons
    RETURN encrypted_ssn;
END;
$$;

-- Revoke execute permissions from public
REVOKE EXECUTE ON FUNCTION get_decrypted_ssn(INTEGER, INTEGER, TEXT) FROM PUBLIC;

-- Documentation comments
COMMENT ON TABLE ssn_access_log IS 'HIPAA audit log for all SSN access attempts';
COMMENT ON FUNCTION get_decrypted_ssn(INTEGER, INTEGER, TEXT) IS 
'Secure function to retrieve encrypted SSN with mandatory audit logging. 
Returns encrypted value - decryption must be performed in application layer.';

COMMIT;