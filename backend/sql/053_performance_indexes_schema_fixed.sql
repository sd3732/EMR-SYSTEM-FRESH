-- Migration: Critical Database Performance Indexes (Schema Corrected)
-- This migration adds essential indexes to optimize EMR query performance
-- Note: Adjusted for actual database schema without provider_id in encounters

-- ==============================================
-- PATIENT SEARCH & LOOKUP OPTIMIZATION
-- ==============================================

-- Enhanced patient name search (composite index for ORDER BY optimization)
CREATE INDEX IF NOT EXISTS idx_patients_name_composite 
ON patients(last_name, first_name, id);

-- Full-text search for patient names (supports intelligent search)
CREATE INDEX IF NOT EXISTS idx_patients_name_search 
ON patients USING gin(to_tsvector('english', 
    COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')));

-- Medical Record Number (MRN) lookup optimization
CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(mrn) 
WHERE mrn IS NOT NULL;

-- Date of birth search (for patient identification)
CREATE INDEX IF NOT EXISTS idx_patients_dob ON patients(dob);

-- Provider assignment lookup (if provider_id exists in patients table)
CREATE INDEX IF NOT EXISTS idx_patients_provider ON patients(provider_id) 
WHERE provider_id IS NOT NULL;

-- Insurance lookup optimization  
CREATE INDEX IF NOT EXISTS idx_patients_insurance ON patients(insurance_id)
WHERE insurance_id IS NOT NULL;

-- ==============================================
-- ENCOUNTER/VISIT PERFORMANCE OPTIMIZATION
-- ==============================================

-- Primary encounter lookup by patient (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_encounters_patient_date 
ON encounters(patient_id, created_at DESC, id);

-- Encounter status filtering
CREATE INDEX IF NOT EXISTS idx_encounters_status 
ON encounters(status, created_at DESC) WHERE status IN ('open', 'closed', 'in_progress');

-- Date range queries for encounters
CREATE INDEX IF NOT EXISTS idx_encounters_date_range 
ON encounters(created_at DESC, patient_id);

-- Appointment relationship optimization
CREATE INDEX IF NOT EXISTS idx_encounters_appointment 
ON encounters(appointment_id) WHERE appointment_id IS NOT NULL;

-- ==============================================
-- CLINICAL NOTES JOIN OPTIMIZATION
-- ==============================================

-- Clinical notes patient lookup (eliminates N+1 queries)
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient 
ON clinical_notes(patient_id, created_at DESC);

-- Clinical notes provider lookup (if provider_id exists)
CREATE INDEX IF NOT EXISTS idx_clinical_notes_provider 
ON clinical_notes(provider_id, created_at DESC) WHERE provider_id IS NOT NULL;

-- Template-based notes lookup
CREATE INDEX IF NOT EXISTS idx_clinical_notes_template 
ON clinical_notes(template_id, version DESC, created_at DESC) WHERE template_id IS NOT NULL;

-- Created/Updated user lookup optimization
CREATE INDEX IF NOT EXISTS idx_clinical_notes_created_by 
ON clinical_notes(created_by, created_at DESC);

-- ==============================================
-- USER SESSION PERFORMANCE (from our auth work)  
-- ==============================================

-- Session token lookup (primary authentication query)
CREATE INDEX IF NOT EXISTS idx_user_sessions_token 
ON user_sessions(session_token) WHERE terminated = false;

-- User session management
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active 
ON user_sessions(user_id, terminated, expires_at);

-- Session cleanup optimization
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires 
ON user_sessions(expires_at) WHERE terminated = false;

-- Session activity tracking
CREATE INDEX IF NOT EXISTS idx_user_sessions_activity 
ON user_sessions(last_activity DESC) WHERE terminated = false;

-- ==============================================
-- APPOINTMENT SYSTEM OPTIMIZATION
-- ==============================================

-- Appointment date scheduling optimization
CREATE INDEX IF NOT EXISTS idx_appointments_date_status
ON appointments(appointment_date, status, patient_id);

-- Provider schedule lookup (if provider_id exists)
CREATE INDEX IF NOT EXISTS idx_appointments_provider_date
ON appointments(provider_id, appointment_date, status) WHERE provider_id IS NOT NULL;

-- Patient appointment history
CREATE INDEX IF NOT EXISTS idx_appointments_patient_date
ON appointments(patient_id, appointment_date DESC);

-- ==============================================
-- MEDICATION & PRESCRIPTION OPTIMIZATION
-- ==============================================

-- Active prescriptions lookup
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_active
ON prescriptions(patient_id, status, created_at DESC) 
WHERE status IN ('active', 'pending');

-- Provider prescription history (if provider_id exists)
CREATE INDEX IF NOT EXISTS idx_prescriptions_provider
ON prescriptions(provider_id, created_at DESC) WHERE provider_id IS NOT NULL;

-- ==============================================
-- FOREIGN KEY OPTIMIZATION
-- ==============================================

-- Users table foreign key lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role, active);

-- Providers lookup
CREATE INDEX IF NOT EXISTS idx_providers_active 
ON providers(active, last_name, first_name) WHERE active = true;

-- ==============================================
-- VITALS DATA OPTIMIZATION  
-- ==============================================

-- Vitals data in encounters (JSONB optimization)
CREATE INDEX IF NOT EXISTS idx_encounters_vitals_gin
ON encounters USING gin(vitals) WHERE vitals IS NOT NULL;

-- Intake data optimization
CREATE INDEX IF NOT EXISTS idx_encounters_intake_gin
ON encounters USING gin(intake) WHERE intake IS NOT NULL;

-- ROS data optimization
CREATE INDEX IF NOT EXISTS idx_encounters_ros_gin
ON encounters USING gin(ros) WHERE ros IS NOT NULL;

-- ==============================================
-- AUDIT LOG OPTIMIZATION
-- ==============================================

-- Audit log table optimization (if exists)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action
ON audit_logs(user_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record
ON audit_logs(table_name, record_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_date_range
ON audit_logs(created_at DESC) WHERE created_at >= CURRENT_DATE - INTERVAL '90 days';