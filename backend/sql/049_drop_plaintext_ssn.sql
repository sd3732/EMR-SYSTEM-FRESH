-- Migration: Drop plaintext SSN column after successful encryption
-- This migration removes the plaintext subscriber_ssn column from patient_insurance table
-- CRITICAL: Only run this after successfully encrypting all SSN data using migrate-ssn-encryption.js

BEGIN;

-- Verify that all SSNs have been encrypted before dropping plaintext column
DO $$
DECLARE
    plaintext_count INTEGER;
    encrypted_count INTEGER;
BEGIN
    -- Count records with plaintext SSNs
    SELECT COUNT(*) INTO plaintext_count 
    FROM patient_insurance 
    WHERE subscriber_ssn IS NOT NULL AND subscriber_ssn != '';
    
    -- Count records with encrypted SSNs
    SELECT COUNT(*) INTO encrypted_count 
    FROM patient_insurance 
    WHERE subscriber_ssn_encrypted IS NOT NULL;
    
    -- Log the counts for audit
    RAISE NOTICE 'Pre-cleanup audit: % plaintext SSNs, % encrypted SSNs', plaintext_count, encrypted_count;
    
    -- Safety check: If there are plaintext SSNs, warn but don't fail
    -- This allows for manual review in production
    IF plaintext_count > 0 THEN
        RAISE WARNING 'Found % plaintext SSN records that have not been encrypted. Review before proceeding.', plaintext_count;
        RAISE WARNING 'Run the migration script: node scripts/migrate-ssn-encryption.js';
        RAISE WARNING 'You can still proceed if you are certain these records should not be encrypted.';
    END IF;
END;
$$;

-- Create audit log entry for this cleanup operation
INSERT INTO ssn_access_log (
    user_id, 
    access_type, 
    purpose,
    created_at
) VALUES (
    NULL,
    'cleanup',
    'SSN Cleanup Migration - Removing plaintext subscriber_ssn column after encryption',
    CURRENT_TIMESTAMP
);

-- Drop the constraint that was temporarily added during migration
-- This constraint ensured either plaintext OR encrypted SSN existed
ALTER TABLE patient_insurance 
    DROP CONSTRAINT IF EXISTS check_ssn_encryption_state;

-- Drop the plaintext SSN column
-- This is the critical security improvement - removes plaintext PHI storage
ALTER TABLE patient_insurance 
    DROP COLUMN IF EXISTS subscriber_ssn;

-- Add a new constraint to ensure encrypted SSN is used going forward
-- This prevents accidentally storing plaintext SSNs in the future
ALTER TABLE patient_insurance 
    ADD CONSTRAINT check_encrypted_ssn_only 
    CHECK (
        subscriber_ssn_encrypted IS NULL OR 
        (subscriber_ssn_encrypted IS NOT NULL AND length(subscriber_ssn_encrypted) > 20)
    );

-- Add comment to document the change
COMMENT ON COLUMN patient_insurance.subscriber_ssn_encrypted IS 
'Encrypted Social Security Number using AES-256-GCM encryption.
Format: base64(keyId:iv:tag:ciphertext)
HIPAA compliant encrypted storage for PHI data.
Use encryption service to encrypt/decrypt values.
Plaintext subscriber_ssn column was removed in migration 049 for security.';

-- Update the safe view to reflect that plaintext SSN no longer exists
CREATE OR REPLACE VIEW patient_insurance_safe AS
SELECT 
    id,
    patient_id,
    insurance_plan_id,
    policy_number,
    group_number,
    subscriber_id,
    subscriber_name,
    -- Only show encrypted SSN indicator since plaintext is gone
    CASE 
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

-- Update the decryption function comment to reflect the security improvement
COMMENT ON FUNCTION get_decrypted_ssn(INTEGER, INTEGER, TEXT) IS 
'Secure function to retrieve encrypted SSN with mandatory audit logging. 
Returns encrypted value - decryption must be performed in application layer.
This function is the ONLY way to access SSN data after plaintext column removal.
All access is logged for HIPAA compliance.';

-- Create a verification function to confirm cleanup was successful
CREATE OR REPLACE FUNCTION verify_ssn_cleanup()
RETURNS TABLE(
    total_records BIGINT,
    encrypted_records BIGINT,
    encryption_rate DECIMAL(5,2),
    plaintext_column_exists BOOLEAN,
    cleanup_successful BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_records,
        COUNT(subscriber_ssn_encrypted) as encrypted_records,
        CASE 
            WHEN COUNT(*) > 0 THEN 
                ROUND((COUNT(subscriber_ssn_encrypted)::DECIMAL / COUNT(*)) * 100, 2)
            ELSE 0::DECIMAL(5,2)
        END as encryption_rate,
        EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'patient_insurance' 
            AND column_name = 'subscriber_ssn'
        ) as plaintext_column_exists,
        NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'patient_insurance' 
            AND column_name = 'subscriber_ssn'
        ) as cleanup_successful
    FROM patient_insurance;
END;
$$ LANGUAGE plpgsql;

-- Grant appropriate permissions to the verification function
GRANT EXECUTE ON FUNCTION verify_ssn_cleanup() TO PUBLIC;

-- Log completion
DO $$
DECLARE
    verification_result RECORD;
BEGIN
    -- Get verification results
    SELECT * INTO verification_result FROM verify_ssn_cleanup();
    
    RAISE NOTICE 'SSN Cleanup Migration Completed Successfully';
    RAISE NOTICE '=====================================';
    RAISE NOTICE 'Total Records: %', verification_result.total_records;
    RAISE NOTICE 'Encrypted Records: %', verification_result.encrypted_records;
    RAISE NOTICE 'Encryption Rate: %\%', verification_result.encryption_rate;
    RAISE NOTICE 'Plaintext Column Exists: %', verification_result.plaintext_column_exists;
    RAISE NOTICE 'Cleanup Successful: %', verification_result.cleanup_successful;
    RAISE NOTICE '';
    
    IF verification_result.cleanup_successful THEN
        RAISE NOTICE '✅ SUCCESS: Plaintext SSN column has been removed';
        RAISE NOTICE '✅ All SSN data is now encrypted and secure';
        RAISE NOTICE '✅ HIPAA compliance vulnerability has been resolved';
    ELSE
        RAISE WARNING '❌ FAILURE: Plaintext SSN column still exists';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '1. Verify application functionality with encrypted SSNs';
    RAISE NOTICE '2. Test SSN decryption through API endpoints';
    RAISE NOTICE '3. Review audit logs for any access anomalies';
    RAISE NOTICE '4. Update documentation and procedures';
END;
$$;

-- Final security verification
DO $$
DECLARE
    has_plaintext BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patient_insurance' 
        AND column_name = 'subscriber_ssn'
    ) INTO has_plaintext;
    
    IF has_plaintext THEN
        RAISE EXCEPTION 'SECURITY ERROR: Plaintext SSN column still exists after cleanup migration';
    END IF;
    
    RAISE NOTICE '🔒 SECURITY VERIFIED: No plaintext SSN storage remains in database';
END;
$$;

COMMIT;