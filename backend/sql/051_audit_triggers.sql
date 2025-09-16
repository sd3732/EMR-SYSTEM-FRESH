-- Migration: Create database triggers for automatic HIPAA audit logging
-- This migration creates triggers on PHI tables to automatically capture data modifications
-- Provides comprehensive audit trail for HIPAA compliance requirements

BEGIN;

-- Generic audit trigger function that can be used across multiple tables
CREATE OR REPLACE FUNCTION audit_table_changes()
RETURNS TRIGGER AS $$
DECLARE
    phi_fields TEXT[] := ARRAY[
        'first_name', 'last_name', 'full_name', 'patient_name',
        'dob', 'date_of_birth', 'birth_date',
        'ssn', 'social_security_number', 'subscriber_ssn',
        'phone', 'phone_number', 'mobile_phone', 'home_phone',
        'email', 'email_address',
        'address', 'street_address', 'home_address', 'city', 'state', 'zip_code',
        'mrn', 'medical_record_number',
        'policy_number', 'subscriber_id', 'insurance_id',
        'diagnosis', 'clinical_notes', 'notes', 'prescription_data',
        'lab_results', 'vital_signs', 'blood_pressure', 'heart_rate', 'temperature',
        'weight', 'height', 'allergies'
    ];
    col_name TEXT;
    old_value TEXT;
    new_value TEXT;
    is_phi_field BOOLEAN;
    audit_log_id INTEGER;
    request_id_val TEXT;
    user_id_val INTEGER;
    session_id_val TEXT;
    ip_addr TEXT;
    phi_accessed BOOLEAN := false;
    current_user_id INTEGER;
BEGIN
    -- Skip if this is a system operation
    IF session_user = 'postgres' OR session_user LIKE '%system%' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Try to get current user context from application
    -- This requires the application to set these session variables
    BEGIN
        SELECT current_setting('audit.user_id', true)::INTEGER INTO current_user_id;
        SELECT current_setting('audit.request_id', true) INTO request_id_val;
        SELECT current_setting('audit.session_id', true) INTO session_id_val;
        SELECT current_setting('audit.ip_address', true) INTO ip_addr;
    EXCEPTION WHEN OTHERS THEN
        current_user_id := NULL;
        request_id_val := NULL;
        session_id_val := NULL;
        ip_addr := NULL;
    END;

    -- Determine operation type and create main audit log entry
    INSERT INTO audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        phi_accessed,
        session_id,
        request_id,
        ip_address,
        endpoint,
        success,
        additional_data,
        created_at
    ) VALUES (
        current_user_id,
        CASE 
            WHEN TG_OP = 'INSERT' THEN 'CREATE'
            WHEN TG_OP = 'UPDATE' THEN 'UPDATE' 
            WHEN TG_OP = 'DELETE' THEN 'DELETE'
        END,
        TG_TABLE_NAME,
        CASE 
            WHEN TG_OP = 'DELETE' THEN OLD.id
            ELSE NEW.id
        END,
        false, -- Will be updated below if PHI is involved
        session_id_val,
        request_id_val,
        ip_addr::inet,
        'database_trigger',
        true,
        jsonb_build_object(
            'trigger_name', TG_NAME,
            'operation', TG_OP,
            'table_schema', TG_TABLE_SCHEMA,
            'timestamp', CURRENT_TIMESTAMP
        ),
        CURRENT_TIMESTAMP
    )
    RETURNING id INTO audit_log_id;

    -- For INSERT operations, log all new values
    IF TG_OP = 'INSERT' THEN
        -- Use dynamic SQL to iterate through all columns
        FOR col_name IN 
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = TG_TABLE_NAME 
            AND table_schema = TG_TABLE_SCHEMA
            AND column_name NOT IN ('id', 'created_at', 'updated_at')
        LOOP
            -- Get the new value using dynamic SQL
            EXECUTE format('SELECT ($1).%I', col_name) 
            USING NEW INTO new_value;
            
            -- Skip if value is null or empty
            CONTINUE WHEN new_value IS NULL OR new_value = '';
            
            -- Check if this is a PHI field
            is_phi_field := col_name = ANY(phi_fields);
            
            -- Set PHI accessed flag
            IF is_phi_field THEN
                phi_accessed := true;
            END IF;
            
            -- Log the data modification
            INSERT INTO data_modifications (
                audit_log_id,
                table_name,
                record_id,
                field_name,
                old_value,
                new_value,
                is_phi_field,
                change_reason,
                created_at
            ) VALUES (
                audit_log_id,
                TG_TABLE_NAME,
                NEW.id,
                col_name,
                NULL, -- No old value for INSERT
                CASE WHEN is_phi_field THEN '[PHI_DATA]' ELSE new_value END,
                is_phi_field,
                'Record creation via ' || TG_OP,
                CURRENT_TIMESTAMP
            );
        END LOOP;

    -- For UPDATE operations, compare old and new values
    ELSIF TG_OP = 'UPDATE' THEN
        FOR col_name IN 
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = TG_TABLE_NAME 
            AND table_schema = TG_TABLE_SCHEMA
            AND column_name NOT IN ('id', 'created_at', 'updated_at')
        LOOP
            -- Get old and new values
            EXECUTE format('SELECT ($1).%I', col_name) USING OLD INTO old_value;
            EXECUTE format('SELECT ($1).%I', col_name) USING NEW INTO new_value;
            
            -- Skip if values haven't changed
            CONTINUE WHEN old_value IS NOT DISTINCT FROM new_value;
            
            -- Check if this is a PHI field
            is_phi_field := col_name = ANY(phi_fields);
            
            -- Set PHI accessed flag
            IF is_phi_field THEN
                phi_accessed := true;
            END IF;
            
            -- Log the data modification
            INSERT INTO data_modifications (
                audit_log_id,
                table_name,
                record_id,
                field_name,
                old_value,
                new_value,
                is_phi_field,
                change_reason,
                created_at
            ) VALUES (
                audit_log_id,
                TG_TABLE_NAME,
                NEW.id,
                col_name,
                CASE WHEN is_phi_field THEN '[PHI_DATA]' ELSE old_value END,
                CASE WHEN is_phi_field THEN '[PHI_DATA]' ELSE new_value END,
                is_phi_field,
                'Record update via ' || TG_OP,
                CURRENT_TIMESTAMP
            );
        END LOOP;

    -- For DELETE operations, log all existing values
    ELSIF TG_OP = 'DELETE' THEN
        FOR col_name IN 
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = TG_TABLE_NAME 
            AND table_schema = TG_TABLE_SCHEMA
            AND column_name NOT IN ('id', 'created_at', 'updated_at')
        LOOP
            -- Get the old value
            EXECUTE format('SELECT ($1).%I', col_name) USING OLD INTO old_value;
            
            -- Skip if value is null or empty
            CONTINUE WHEN old_value IS NULL OR old_value = '';
            
            -- Check if this is a PHI field
            is_phi_field := col_name = ANY(phi_fields);
            
            -- Set PHI accessed flag
            IF is_phi_field THEN
                phi_accessed := true;
            END IF;
            
            -- Log the data modification
            INSERT INTO data_modifications (
                audit_log_id,
                table_name,
                record_id,
                field_name,
                old_value,
                new_value,
                is_phi_field,
                change_reason,
                created_at
            ) VALUES (
                audit_log_id,
                TG_TABLE_NAME,
                OLD.id,
                col_name,
                CASE WHEN is_phi_field THEN '[PHI_DATA]' ELSE old_value END,
                NULL, -- No new value for DELETE
                is_phi_field,
                'Record deletion via ' || TG_OP,
                CURRENT_TIMESTAMP
            );
        END LOOP;
    END IF;

    -- Update the audit log entry with PHI flag
    IF phi_accessed THEN
        UPDATE audit_logs 
        SET phi_accessed = true
        WHERE id = audit_log_id;
    END IF;

    -- Return appropriate record
    RETURN COALESCE(NEW, OLD);

EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't fail the original operation
    RAISE WARNING 'Audit trigger failed for table %: %', TG_TABLE_NAME, SQLERRM;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for patients table
DROP TRIGGER IF EXISTS trigger_audit_patients ON patients;
CREATE TRIGGER trigger_audit_patients
    AFTER INSERT OR UPDATE OR DELETE ON patients
    FOR EACH ROW EXECUTE FUNCTION audit_table_changes();

-- Create triggers for encounters table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'encounters') THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trigger_audit_encounters ON encounters';
        EXECUTE 'CREATE TRIGGER trigger_audit_encounters
                 AFTER INSERT OR UPDATE OR DELETE ON encounters
                 FOR EACH ROW EXECUTE FUNCTION audit_table_changes()';
    END IF;
END $$;

-- Create triggers for patient_insurance table
DROP TRIGGER IF EXISTS trigger_audit_patient_insurance ON patient_insurance;
CREATE TRIGGER trigger_audit_patient_insurance
    AFTER INSERT OR UPDATE OR DELETE ON patient_insurance
    FOR EACH ROW EXECUTE FUNCTION audit_table_changes();

-- Create triggers for vitals table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vitals') THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trigger_audit_vitals ON vitals';
        EXECUTE 'CREATE TRIGGER trigger_audit_vitals
                 AFTER INSERT OR UPDATE OR DELETE ON vitals
                 FOR EACH ROW EXECUTE FUNCTION audit_table_changes()';
    END IF;
END $$;

-- Create triggers for clinical_notes table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clinical_notes') THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trigger_audit_clinical_notes ON clinical_notes';
        EXECUTE 'CREATE TRIGGER trigger_audit_clinical_notes
                 AFTER INSERT OR UPDATE OR DELETE ON clinical_notes
                 FOR EACH ROW EXECUTE FUNCTION audit_table_changes()';
    END IF;
END $$;

-- Create triggers for medical_history table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'medical_history') THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trigger_audit_medical_history ON medical_history';
        EXECUTE 'CREATE TRIGGER trigger_audit_medical_history
                 AFTER INSERT OR UPDATE OR DELETE ON medical_history
                 FOR EACH ROW EXECUTE FUNCTION audit_table_changes()';
    END IF;
END $$;

-- Create triggers for family_history table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'family_history') THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trigger_audit_family_history ON family_history';
        EXECUTE 'CREATE TRIGGER trigger_audit_family_history
                 AFTER INSERT OR UPDATE OR DELETE ON family_history
                 FOR EACH ROW EXECUTE FUNCTION audit_table_changes()';
    END IF;
END $$;

-- Create triggers for prescriptions table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'prescriptions') THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trigger_audit_prescriptions ON prescriptions';
        EXECUTE 'CREATE TRIGGER trigger_audit_prescriptions
                 AFTER INSERT OR UPDATE OR DELETE ON prescriptions
                 FOR EACH ROW EXECUTE FUNCTION audit_table_changes()';
    END IF;
END $$;

-- Create triggers for lab_results table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lab_results') THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trigger_audit_lab_results ON lab_results';
        EXECUTE 'CREATE TRIGGER trigger_audit_lab_results
                 AFTER INSERT OR UPDATE OR DELETE ON lab_results
                 FOR EACH ROW EXECUTE FUNCTION audit_table_changes()';
    END IF;
END $$;

-- Helper function to set audit context from application
CREATE OR REPLACE FUNCTION set_audit_context(
    p_user_id INTEGER,
    p_session_id TEXT DEFAULT NULL,
    p_request_id TEXT DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    -- Set session variables that triggers can access
    PERFORM set_config('audit.user_id', COALESCE(p_user_id::TEXT, ''), false);
    PERFORM set_config('audit.session_id', COALESCE(p_session_id, ''), false);
    PERFORM set_config('audit.request_id', COALESCE(p_request_id, ''), false);
    PERFORM set_config('audit.ip_address', COALESCE(p_ip_address, ''), false);
END;
$$ LANGUAGE plpgsql;

-- Function to clear audit context
CREATE OR REPLACE FUNCTION clear_audit_context()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('audit.user_id', '', false);
    PERFORM set_config('audit.session_id', '', false);
    PERFORM set_config('audit.request_id', '', false);
    PERFORM set_config('audit.ip_address', '', false);
END;
$$ LANGUAGE plpgsql;

-- Create a view for easier audit log analysis
CREATE OR REPLACE VIEW audit_summary AS
SELECT 
    al.id,
    al.user_id,
    al.action,
    al.table_name,
    al.record_id,
    al.phi_accessed,
    al.ip_address,
    al.session_id,
    al.success,
    al.created_at,
    COUNT(dm.id) as field_changes,
    COUNT(dm.id) FILTER (WHERE dm.is_phi_field = true) as phi_field_changes,
    STRING_AGG(
        CASE WHEN dm.is_phi_field = true 
        THEN dm.field_name || ':PHI' 
        ELSE dm.field_name END, 
        ', ' 
        ORDER BY dm.field_name
    ) as fields_modified
FROM audit_logs al
LEFT JOIN data_modifications dm ON al.id = dm.audit_log_id
GROUP BY al.id, al.user_id, al.action, al.table_name, al.record_id, 
         al.phi_accessed, al.ip_address, al.session_id, al.success, al.created_at;

-- Grant appropriate permissions
GRANT EXECUTE ON FUNCTION set_audit_context(INTEGER, TEXT, TEXT, TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION clear_audit_context() TO PUBLIC;
GRANT SELECT ON audit_summary TO PUBLIC;

-- Add comments for documentation
COMMENT ON FUNCTION audit_table_changes() IS 'Generic audit trigger function that logs all data modifications with PHI detection';
COMMENT ON FUNCTION set_audit_context(INTEGER, TEXT, TEXT, TEXT) IS 'Sets audit context variables for triggers to use';
COMMENT ON FUNCTION clear_audit_context() IS 'Clears audit context variables';
COMMENT ON VIEW audit_summary IS 'Summarized view of audit logs with field change counts';

-- Log trigger installation
DO $$
DECLARE
    table_count INTEGER;
    table_name TEXT;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.triggers 
    WHERE trigger_name LIKE 'trigger_audit_%';
    
    RAISE NOTICE 'Audit trigger installation complete: % triggers installed', table_count;
    RAISE NOTICE 'Tables with audit triggers:';
    
    FOR table_name IN 
        SELECT DISTINCT event_object_table 
        FROM information_schema.triggers 
        WHERE trigger_name LIKE 'trigger_audit_%'
        ORDER BY event_object_table
    LOOP
        RAISE NOTICE '  - %', table_name;
    END LOOP;
END $$;

COMMIT;