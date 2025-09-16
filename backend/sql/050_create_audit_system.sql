-- Migration: Create comprehensive HIPAA-compliant audit system
-- This migration implements enterprise-grade audit logging for PHI access and data modifications
-- Addresses HIPAA requirements for access tracking and compliance reporting

BEGIN;

-- Main audit log table for all system activities
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER, -- References users(id) but nullable for system operations
    action VARCHAR(50) NOT NULL CHECK (action IN ('CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'DECRYPT', 'EXPORT')),
    table_name VARCHAR(50),
    record_id INTEGER,
    phi_accessed BOOLEAN DEFAULT false,
    
    -- Request context information
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    request_id VARCHAR(255),
    endpoint VARCHAR(200),
    http_method VARCHAR(10),
    
    -- Timing and metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    execution_time_ms INTEGER,
    
    -- Additional context
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    additional_data JSONB
);

-- PHI-specific access log for detailed tracking of sensitive data access
CREATE TABLE IF NOT EXISTS phi_access_logs (
    id SERIAL PRIMARY KEY,
    audit_log_id INTEGER REFERENCES audit_logs(id) ON DELETE CASCADE,
    
    -- PHI field details
    field_accessed VARCHAR(100) NOT NULL, -- e.g., 'ssn', 'dob', 'phone', 'address'
    field_type VARCHAR(50) DEFAULT 'text', -- 'text', 'encrypted', 'hashed'
    table_name VARCHAR(50),
    record_id INTEGER,
    
    -- Access justification
    reason_for_access TEXT NOT NULL,
    business_justification VARCHAR(200),
    decrypted BOOLEAN DEFAULT false,
    
    -- Additional PHI context
    patient_id INTEGER, -- Link to patient for easier reporting
    data_classification VARCHAR(20) DEFAULT 'PHI' CHECK (data_classification IN ('PHI', 'PII', 'SENSITIVE', 'PUBLIC')),
    
    -- Compliance tracking
    retention_period INTEGER DEFAULT 2555, -- Days (7 years for HIPAA)
    archived BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User session tracking for anomaly detection
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    logout_time TIMESTAMP,
    session_duration_minutes INTEGER,
    is_active BOOLEAN DEFAULT true,
    
    -- Anomaly detection fields
    request_count INTEGER DEFAULT 0,
    phi_access_count INTEGER DEFAULT 0,
    failed_attempts INTEGER DEFAULT 0,
    anomaly_score DECIMAL(5,2) DEFAULT 0.0,
    flagged_suspicious BOOLEAN DEFAULT false
);

-- Data modification tracking table
CREATE TABLE IF NOT EXISTS data_modifications (
    id SERIAL PRIMARY KEY,
    audit_log_id INTEGER REFERENCES audit_logs(id) ON DELETE CASCADE,
    table_name VARCHAR(50) NOT NULL,
    record_id INTEGER NOT NULL,
    field_name VARCHAR(50) NOT NULL,
    
    -- Before/after values (encrypted for PHI)
    old_value TEXT,
    new_value TEXT,
    old_value_encrypted TEXT, -- For PHI fields
    new_value_encrypted TEXT, -- For PHI fields
    
    -- Metadata
    is_phi_field BOOLEAN DEFAULT false,
    change_reason TEXT,
    approved_by INTEGER, -- User ID who approved the change
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Compliance reporting summary table
CREATE TABLE IF NOT EXISTS compliance_summaries (
    id SERIAL PRIMARY KEY,
    report_date DATE NOT NULL,
    total_phi_accesses INTEGER DEFAULT 0,
    unique_users_accessed_phi INTEGER DEFAULT 0,
    failed_access_attempts INTEGER DEFAULT 0,
    suspicious_activities INTEGER DEFAULT 0,
    
    -- Breakdown by action type
    phi_reads INTEGER DEFAULT 0,
    phi_updates INTEGER DEFAULT 0,
    phi_decryptions INTEGER DEFAULT 0,
    phi_exports INTEGER DEFAULT 0,
    
    -- Patient data breakdown
    patients_accessed INTEGER DEFAULT 0,
    encounters_accessed INTEGER DEFAULT 0,
    insurance_records_accessed INTEGER DEFAULT 0,
    
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    generated_by INTEGER
);

-- Performance indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_phi ON audit_logs(phi_accessed, created_at DESC) WHERE phi_accessed = true;
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_endpoint ON audit_logs(endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_success ON audit_logs(success, created_at DESC) WHERE success = false;

-- PHI access log indexes
CREATE INDEX IF NOT EXISTS idx_phi_access_logs_patient ON phi_access_logs(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phi_access_logs_field ON phi_access_logs(field_accessed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phi_access_logs_table_record ON phi_access_logs(table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phi_access_logs_decrypted ON phi_access_logs(decrypted, created_at DESC) WHERE decrypted = true;
CREATE INDEX IF NOT EXISTS idx_phi_access_logs_retention ON phi_access_logs(archived, created_at) WHERE archived = false;

-- User session indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON user_sessions(user_id, is_active, last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_suspicious ON user_sessions(flagged_suspicious, login_time DESC) WHERE flagged_suspicious = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);

-- Data modification indexes
CREATE INDEX IF NOT EXISTS idx_data_modifications_table_record ON data_modifications(table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_modifications_phi ON data_modifications(is_phi_field, created_at DESC) WHERE is_phi_field = true;

-- Compliance summary indexes
CREATE INDEX IF NOT EXISTS idx_compliance_summaries_date ON compliance_summaries(report_date DESC);

-- Create function to automatically calculate anomaly scores
CREATE OR REPLACE FUNCTION calculate_anomaly_score(p_user_id INTEGER, p_session_id VARCHAR(255))
RETURNS DECIMAL(5,2)
LANGUAGE plpgsql
AS $$
DECLARE
    base_score DECIMAL(5,2) := 0.0;
    request_rate DECIMAL(5,2);
    phi_rate DECIMAL(5,2);
    session_duration INTEGER;
    avg_session_duration DECIMAL(10,2);
    current_hour INTEGER;
BEGIN
    -- Get current session stats
    SELECT 
        request_count,
        phi_access_count,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - login_time))/60
    INTO request_rate, phi_rate, session_duration
    FROM user_sessions 
    WHERE user_id = p_user_id AND session_id = p_session_id;
    
    -- Calculate average session duration for user
    SELECT AVG(session_duration_minutes) INTO avg_session_duration
    FROM user_sessions 
    WHERE user_id = p_user_id AND session_duration_minutes IS NOT NULL;
    
    -- Current hour (0-23)
    current_hour := EXTRACT(HOUR FROM CURRENT_TIMESTAMP);
    
    -- Anomaly scoring rules
    
    -- High request rate (>30 requests/hour)
    IF request_rate > 30 THEN
        base_score := base_score + 2.5;
    END IF;
    
    -- High PHI access rate (>10 PHI accesses/hour)
    IF phi_rate > 10 THEN
        base_score := base_score + 3.0;
    END IF;
    
    -- Unusual hours (10 PM - 6 AM)
    IF current_hour >= 22 OR current_hour <= 6 THEN
        base_score := base_score + 1.5;
    END IF;
    
    -- Unusually long session (>3x average)
    IF avg_session_duration IS NOT NULL AND session_duration > (avg_session_duration * 3) THEN
        base_score := base_score + 2.0;
    END IF;
    
    -- Multiple failed attempts in session
    IF (SELECT failed_attempts FROM user_sessions WHERE session_id = p_session_id) > 3 THEN
        base_score := base_score + 4.0;
    END IF;
    
    RETURN LEAST(base_score, 10.0); -- Cap at 10.0
END;
$$;

-- Function to update user session activity
CREATE OR REPLACE FUNCTION update_session_activity(
    p_user_id INTEGER,
    p_session_id VARCHAR(255),
    p_phi_accessed BOOLEAN DEFAULT false,
    p_failed_attempt BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    new_anomaly_score DECIMAL(5,2);
BEGIN
    -- Update session activity
    UPDATE user_sessions 
    SET 
        last_activity = CURRENT_TIMESTAMP,
        request_count = request_count + 1,
        phi_access_count = CASE WHEN p_phi_accessed THEN phi_access_count + 1 ELSE phi_access_count END,
        failed_attempts = CASE WHEN p_failed_attempt THEN failed_attempts + 1 ELSE failed_attempts END
    WHERE user_id = p_user_id AND session_id = p_session_id;
    
    -- Calculate and update anomaly score
    new_anomaly_score := calculate_anomaly_score(p_user_id, p_session_id);
    
    UPDATE user_sessions 
    SET 
        anomaly_score = new_anomaly_score,
        flagged_suspicious = (new_anomaly_score >= 7.0)
    WHERE user_id = p_user_id AND session_id = p_session_id;
END;
$$;

-- Function to close user session
CREATE OR REPLACE FUNCTION close_user_session(p_session_id VARCHAR(255))
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE user_sessions 
    SET 
        logout_time = CURRENT_TIMESTAMP,
        session_duration_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - login_time))/60,
        is_active = false
    WHERE session_id = p_session_id AND is_active = true;
END;
$$;

-- Function to generate daily compliance summary
CREATE OR REPLACE FUNCTION generate_daily_compliance_summary(p_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    summary_record RECORD;
BEGIN
    -- Calculate summary statistics for the date
    SELECT 
        COUNT(*) FILTER (WHERE phi_accessed = true) as total_phi_accesses,
        COUNT(DISTINCT user_id) FILTER (WHERE phi_accessed = true) as unique_users_accessed_phi,
        COUNT(*) FILTER (WHERE success = false) as failed_access_attempts,
        COUNT(*) FILTER (WHERE additional_data->>'suspicious' = 'true') as suspicious_activities,
        COUNT(*) FILTER (WHERE phi_accessed = true AND action = 'READ') as phi_reads,
        COUNT(*) FILTER (WHERE phi_accessed = true AND action = 'UPDATE') as phi_updates,
        COUNT(*) FILTER (WHERE phi_accessed = true AND action = 'DECRYPT') as phi_decryptions,
        COUNT(*) FILTER (WHERE phi_accessed = true AND action = 'EXPORT') as phi_exports,
        COUNT(DISTINCT record_id) FILTER (WHERE table_name = 'patients' AND phi_accessed = true) as patients_accessed,
        COUNT(DISTINCT record_id) FILTER (WHERE table_name = 'encounters' AND phi_accessed = true) as encounters_accessed,
        COUNT(DISTINCT record_id) FILTER (WHERE table_name = 'patient_insurance' AND phi_accessed = true) as insurance_records_accessed
    INTO summary_record
    FROM audit_logs 
    WHERE DATE(created_at) = p_date;
    
    -- Insert or update the summary
    INSERT INTO compliance_summaries (
        report_date,
        total_phi_accesses,
        unique_users_accessed_phi,
        failed_access_attempts,
        suspicious_activities,
        phi_reads,
        phi_updates,
        phi_decryptions,
        phi_exports,
        patients_accessed,
        encounters_accessed,
        insurance_records_accessed
    ) VALUES (
        p_date,
        summary_record.total_phi_accesses,
        summary_record.unique_users_accessed_phi,
        summary_record.failed_access_attempts,
        summary_record.suspicious_activities,
        summary_record.phi_reads,
        summary_record.phi_updates,
        summary_record.phi_decryptions,
        summary_record.phi_exports,
        summary_record.patients_accessed,
        summary_record.encounters_accessed,
        summary_record.insurance_records_accessed
    )
    ON CONFLICT (report_date) DO UPDATE SET
        total_phi_accesses = EXCLUDED.total_phi_accesses,
        unique_users_accessed_phi = EXCLUDED.unique_users_accessed_phi,
        failed_access_attempts = EXCLUDED.failed_access_attempts,
        suspicious_activities = EXCLUDED.suspicious_activities,
        phi_reads = EXCLUDED.phi_reads,
        phi_updates = EXCLUDED.phi_updates,
        phi_decryptions = EXCLUDED.phi_decryptions,
        phi_exports = EXCLUDED.phi_exports,
        patients_accessed = EXCLUDED.patients_accessed,
        encounters_accessed = EXCLUDED.encounters_accessed,
        insurance_records_accessed = EXCLUDED.insurance_records_accessed,
        generated_at = CURRENT_TIMESTAMP;
END;
$$;

-- Add constraints for data integrity
ALTER TABLE audit_logs ADD CONSTRAINT check_audit_logs_phi_context 
    CHECK ((phi_accessed = false) OR (phi_accessed = true AND table_name IS NOT NULL));

ALTER TABLE phi_access_logs ADD CONSTRAINT check_phi_reason_required 
    CHECK (LENGTH(TRIM(reason_for_access)) > 0);

ALTER TABLE user_sessions ADD CONSTRAINT check_session_duration 
    CHECK (session_duration_minutes IS NULL OR session_duration_minutes >= 0);

-- Add unique constraint for compliance summaries
ALTER TABLE compliance_summaries ADD CONSTRAINT unique_compliance_date UNIQUE (report_date);

-- Add comments for documentation
COMMENT ON TABLE audit_logs IS 'Comprehensive audit log for all system activities and PHI access (HIPAA compliant)';
COMMENT ON TABLE phi_access_logs IS 'Detailed tracking of PHI field access with business justification';
COMMENT ON TABLE user_sessions IS 'User session tracking for anomaly detection and compliance reporting';
COMMENT ON TABLE data_modifications IS 'Before/after tracking of data changes with encryption for PHI';
COMMENT ON TABLE compliance_summaries IS 'Daily compliance summary reports for HIPAA audit requirements';

COMMENT ON FUNCTION calculate_anomaly_score(INTEGER, VARCHAR) IS 'Calculates anomaly score based on user behavior patterns';
COMMENT ON FUNCTION update_session_activity(INTEGER, VARCHAR, BOOLEAN, BOOLEAN) IS 'Updates user session activity and anomaly scores';
COMMENT ON FUNCTION close_user_session(VARCHAR) IS 'Closes user session and calculates final duration';
COMMENT ON FUNCTION generate_daily_compliance_summary(DATE) IS 'Generates daily compliance summary for HIPAA reporting';

-- Create initial compliance summary for today
SELECT generate_daily_compliance_summary(CURRENT_DATE);

COMMIT;