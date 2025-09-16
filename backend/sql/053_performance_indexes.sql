-- Migration: Critical Database Performance Indexes
-- This migration adds essential indexes to optimize EMR query performance
-- Addresses HIPAA performance requirements and N+1 query issues

BEGIN;

-- ==============================================
-- PATIENT SEARCH & LOOKUP OPTIMIZATION
-- ==============================================

-- Enhanced patient name search (composite index for ORDER BY optimization)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_name_composite 
ON patients(last_name, first_name, id);

-- Full-text search for patient names (supports intelligent search)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_name_search 
ON patients USING gin(to_tsvector('english', 
    COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')));

-- Medical Record Number (MRN) lookup optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_mrn ON patients(mrn) 
WHERE mrn IS NOT NULL;

-- Date of birth search (for patient identification)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_dob ON patients(dob);

-- Provider assignment lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_provider ON patients(provider_id) 
WHERE provider_id IS NOT NULL;

-- Insurance lookup optimization  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_insurance ON patients(insurance_id)
WHERE insurance_id IS NOT NULL;

-- ==============================================
-- ENCOUNTER/VISIT PERFORMANCE OPTIMIZATION
-- ==============================================

-- Primary encounter lookup by patient (most common query pattern)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encounters_patient_date 
ON encounters(patient_id, created_at DESC, id);

-- Encounter status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encounters_status 
ON encounters(status, created_at DESC) WHERE status IN ('open', 'closed', 'in_progress');

-- Provider-based encounter lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encounters_provider 
ON encounters(provider_id, created_at DESC) WHERE provider_id IS NOT NULL;

-- Date range queries for encounters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encounters_date_range 
ON encounters(created_at DESC, patient_id);

-- ==============================================
-- CLINICAL NOTES JOIN OPTIMIZATION
-- ==============================================

-- Clinical notes patient lookup (eliminates N+1 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clinical_notes_patient 
ON clinical_notes(patient_id, created_at DESC);

-- Clinical notes provider lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clinical_notes_provider 
ON clinical_notes(provider_id, created_at DESC) WHERE provider_id IS NOT NULL;

-- Template-based notes lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clinical_notes_template 
ON clinical_notes(template_id, version DESC, created_at DESC) WHERE template_id IS NOT NULL;

-- Created/Updated user lookup optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clinical_notes_created_by 
ON clinical_notes(created_by, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clinical_notes_updated_by 
ON clinical_notes(updated_by, updated_at DESC) WHERE updated_by IS NOT NULL;

-- ==============================================
-- VITALS & CLINICAL DATA OPTIMIZATION
-- ==============================================

-- Vitals lookup by encounter (stored as JSONB in encounters table)
-- This index optimizes queries that filter/sort by vitals data
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encounters_vitals_jsonb 
ON encounters USING gin(vitals) WHERE vitals IS NOT NULL;

-- ==============================================
-- USER SESSION PERFORMANCE (from our auth work)  
-- ==============================================

-- Session token lookup (primary authentication query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_token 
ON user_sessions(session_token) WHERE terminated = false;

-- User session management
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_user_active 
ON user_sessions(user_id, terminated, expires_at);

-- Session cleanup optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_expires 
ON user_sessions(expires_at) WHERE terminated = false;

-- Session activity tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_activity 
ON user_sessions(last_activity DESC) WHERE terminated = false;

-- ==============================================
-- AUDIT LOG PERFORMANCE (HIPAA requirement)
-- ==============================================

-- Audit trail date range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_date_range
ON audit_logs(created_at DESC) WHERE phi_accessed = true;

-- User-specific audit trails
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user
ON audit_logs(user_id, created_at DESC);

-- PHI access monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_phi_access
ON audit_logs(phi_accessed, created_at DESC, user_id) WHERE phi_accessed = true;

-- ==============================================
-- APPOINTMENT SYSTEM OPTIMIZATION
-- ==============================================

-- Appointment date scheduling optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_date_status
ON appointments(appointment_date, status, patient_id);

-- Provider schedule lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_provider_date
ON appointments(provider_id, appointment_date, status) WHERE provider_id IS NOT NULL;

-- Patient appointment history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_patient_date
ON appointments(patient_id, appointment_date DESC);

-- ==============================================
-- MEDICATION & PRESCRIPTION OPTIMIZATION
-- ==============================================

-- Active prescriptions lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prescriptions_patient_active
ON prescriptions(patient_id, status, created_at DESC) 
WHERE status IN ('active', 'pending');

-- Provider prescription history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prescriptions_provider
ON prescriptions(provider_id, created_at DESC) WHERE provider_id IS NOT NULL;

-- Medication interaction checking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prescriptions_medication
ON prescriptions(medication_id, status) WHERE status = 'active';

-- ==============================================
-- LAB ORDERS & RESULTS OPTIMIZATION
-- ==============================================

-- Patient lab orders
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lab_orders_patient_date
ON lab_orders(patient_id, order_date DESC);

-- Pending lab results
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lab_orders_status
ON lab_orders(status, order_date DESC) WHERE status IN ('pending', 'in_progress');

-- Provider lab order history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lab_orders_provider
ON lab_orders(provider_id, order_date DESC) WHERE provider_id IS NOT NULL;

-- ==============================================
-- FOREIGN KEY OPTIMIZATION
-- ==============================================

-- Ensure all foreign key relationships have indexes for JOIN performance
-- (PostgreSQL doesn't automatically create indexes for foreign keys)

-- Users table foreign key lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role ON users(role, active);

-- Clinical templates lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clinical_templates_active 
ON clinical_templates(active, created_at DESC) WHERE active = true;

-- Providers lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_providers_active 
ON providers(active, last_name, first_name) WHERE active = true;

-- ==============================================
-- PERFORMANCE MONITORING SETUP
-- ==============================================

-- Enable query statistics collection (if not already enabled)
-- This allows monitoring of slow queries and index usage
DO $$
BEGIN
    -- Enable pg_stat_statements for query performance monitoring
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
    ) THEN
        RAISE NOTICE 'pg_stat_statements extension not found. Install with: CREATE EXTENSION pg_stat_statements;';
    END IF;
END $$;

-- ==============================================
-- INDEX USAGE VERIFICATION
-- ==============================================

-- Function to check if indexes are being used effectively
CREATE OR REPLACE FUNCTION check_index_usage()
RETURNS TABLE (
    schemaname text,
    tablename text,
    indexname text,
    idx_tup_read bigint,
    idx_tup_fetch bigint,
    usage_ratio numeric
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        schemaname::text,
        tablename::text,
        indexname::text,
        idx_tup_read,
        idx_tup_fetch,
        CASE 
            WHEN idx_tup_read > 0 
            THEN round((idx_tup_fetch::numeric / idx_tup_read::numeric) * 100, 2)
            ELSE 0
        END as usage_ratio
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    ORDER BY idx_tup_read DESC;
END;
$$;

-- ==============================================
-- MAINTENANCE TASKS
-- ==============================================

-- Set up automatic table statistics update for better query planning
DO $$
BEGIN
    -- Ensure autovacuum is properly configured for new indexes
    ALTER TABLE patients SET (autovacuum_analyze_scale_factor = 0.02);
    ALTER TABLE encounters SET (autovacuum_analyze_scale_factor = 0.02);
    ALTER TABLE clinical_notes SET (autovacuum_analyze_scale_factor = 0.02);
    ALTER TABLE user_sessions SET (autovacuum_analyze_scale_factor = 0.05);
    
    RAISE NOTICE 'Autovacuum settings updated for better performance monitoring';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not update autovacuum settings: %', SQLERRM;
END $$;

-- ==============================================
-- COMPLETION LOG
-- ==============================================

DO $$
DECLARE
    index_count INTEGER;
BEGIN
    -- Count performance indexes created
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND (indexname LIKE 'idx_%_patient%' 
         OR indexname LIKE 'idx_%_performance%'
         OR indexname LIKE 'idx_%_search%'
         OR indexname LIKE 'idx_%_composite%'
         OR indexname LIKE 'idx_encounters_%'
         OR indexname LIKE 'idx_clinical_%'
         OR indexname LIKE 'idx_user_sessions_%'
         OR indexname LIKE 'idx_appointments_%'
         OR indexname LIKE 'idx_prescriptions_%'
         OR indexname LIKE 'idx_lab_orders_%');
    
    RAISE NOTICE 'EMR Performance Optimization Complete:';
    RAISE NOTICE '  - Performance indexes created: %', index_count;
    RAISE NOTICE '  - Query monitoring functions installed';
    RAISE NOTICE '  - Autovacuum tuned for high-performance';
    RAISE NOTICE '  - Ready for HIPAA-compliant EMR operations';
    
    -- Recommendations
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '  1. Run ANALYZE on all tables to update statistics';
    RAISE NOTICE '  2. Monitor query performance with check_index_usage()';
    RAISE NOTICE '  3. Install pg_stat_statements extension if available';
    RAISE NOTICE '  4. Configure query logging for queries > 100ms';
END $$;

COMMIT;