-- =====================================
-- ENHANCED PHI AUDIT SYSTEM FOR HIPAA COMPLIANCE (FIXED)
-- CRITICAL: This system logs EVERY PHI access without exception
-- =====================================

-- Install required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing audit table if it exists (we're upgrading)
DROP TABLE IF EXISTS phi_audit_log CASCADE;

-- Create comprehensive PHI audit log table
CREATE TABLE phi_audit_log (
  id SERIAL PRIMARY KEY,

  -- WHO - User Information
  user_id INTEGER REFERENCES users(id),
  user_role VARCHAR(50) NOT NULL,
  user_name VARCHAR(100) NOT NULL,
  user_email VARCHAR(255),

  -- WHAT - Action and Resource Information
  action VARCHAR(50) NOT NULL, -- VIEW, CREATE, UPDATE, DELETE, EXPORT, PRINT, SEARCH, BULK_EXPORT
  resource_type VARCHAR(50) NOT NULL, -- patient, encounter, medication, lab_result, etc.
  resource_id VARCHAR(50), -- May be multiple IDs for bulk operations
  resource_ids INTEGER[], -- Array for bulk operations
  field_accessed TEXT[], -- Array of specific fields/columns accessed
  old_values JSONB, -- Previous values for UPDATE operations
  new_values JSONB, -- New values for CREATE/UPDATE operations
  query_parameters JSONB, -- Search terms, filters, etc.

  -- WHEN - Temporal Information
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timestamp_ms BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,

  -- WHERE - Location and Access Information
  ip_address INET NOT NULL,
  user_agent TEXT,
  endpoint VARCHAR(500) NOT NULL,
  http_method VARCHAR(10) NOT NULL,
  hostname VARCHAR(255),

  -- WHY - Justification and Context
  reason VARCHAR(500), -- Clinical reason for access
  emergency_access BOOLEAN DEFAULT FALSE,
  patient_consent_status VARCHAR(50), -- GRANTED, REVOKED, NOT_REQUIRED
  legal_basis VARCHAR(100), -- TREATMENT, PAYMENT, OPERATIONS, EMERGENCY

  -- SESSION AND REQUEST TRACKING
  session_id VARCHAR(100) NOT NULL,
  request_id VARCHAR(100) NOT NULL,
  correlation_id VARCHAR(100), -- For tracking related requests
  parent_request_id VARCHAR(100), -- For sub-requests

  -- SECURITY AND INTEGRITY
  checksum VARCHAR(64), -- SHA-256 hash for tamper detection
  previous_hash VARCHAR(64), -- Chain to previous audit entry (blockchain-like)
  digital_signature TEXT, -- Optional digital signature

  -- PERFORMANCE AND TECHNICAL DATA
  response_time_ms INTEGER,
  response_status INTEGER,
  response_size_bytes INTEGER,
  database_query_time_ms INTEGER,

  -- HIPAA SPECIFIC FIELDS
  minimum_necessary_justification TEXT, -- Why this specific data was needed
  data_classification VARCHAR(20) DEFAULT 'PHI', -- PHI, PII, SENSITIVE, PUBLIC
  retention_period_days INTEGER DEFAULT 2555, -- 7 years for HIPAA

  -- COMPLIANCE TRACKING
  audit_level VARCHAR(20) DEFAULT 'STANDARD', -- STANDARD, DETAILED, EMERGENCY
  compliance_flags TEXT[], -- Array of compliance-related flags
  risk_score INTEGER, -- 0-100, calculated risk score for this access

  -- ADMINISTRATIVE
  archived BOOLEAN DEFAULT FALSE,
  archive_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT phi_audit_log_action_check CHECK (action IN (
    'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT', 'SEARCH',
    'BULK_EXPORT', 'BULK_VIEW', 'EMERGENCY_ACCESS', 'ACCESS_DENIED',
    'LIST', 'DOWNLOAD', 'EMAIL', 'FAX', 'SHARE'
  )),

  CONSTRAINT phi_audit_log_legal_basis_check CHECK (legal_basis IN (
    'TREATMENT', 'PAYMENT', 'OPERATIONS', 'EMERGENCY', 'CONSENT', 'LEGAL_REQUIREMENT'
  )),

  CONSTRAINT phi_audit_log_risk_score_check CHECK (risk_score >= 0 AND risk_score <= 100)
);

-- Create indexes for performance and common audit queries
CREATE INDEX idx_phi_audit_timestamp ON phi_audit_log(timestamp DESC);
CREATE INDEX idx_phi_audit_user ON phi_audit_log(user_id, timestamp DESC);
CREATE INDEX idx_phi_audit_resource ON phi_audit_log(resource_type, resource_id, timestamp DESC);
CREATE INDEX idx_phi_audit_patient ON phi_audit_log(resource_id, timestamp DESC) WHERE resource_type = 'patient';
CREATE INDEX idx_phi_audit_action ON phi_audit_log(action, timestamp DESC);
CREATE INDEX idx_phi_audit_session ON phi_audit_log(session_id, timestamp DESC);
CREATE INDEX idx_phi_audit_request ON phi_audit_log(request_id);
CREATE INDEX idx_phi_audit_ip ON phi_audit_log(ip_address, timestamp DESC);
CREATE INDEX idx_phi_audit_emergency ON phi_audit_log(emergency_access, timestamp DESC) WHERE emergency_access = TRUE;
CREATE INDEX idx_phi_audit_high_risk ON phi_audit_log(risk_score DESC, timestamp DESC) WHERE risk_score > 70;
CREATE UNIQUE INDEX idx_phi_audit_checksum ON phi_audit_log(checksum) WHERE checksum IS NOT NULL;

-- Create partial indexes for common compliance queries
CREATE INDEX idx_phi_audit_bulk_operations ON phi_audit_log(timestamp DESC) WHERE action LIKE 'BULK_%';
CREATE INDEX idx_phi_audit_exports ON phi_audit_log(timestamp DESC) WHERE action IN ('EXPORT', 'DOWNLOAD', 'PRINT');
CREATE INDEX idx_phi_audit_deletions ON phi_audit_log(timestamp DESC) WHERE action = 'DELETE';

-- Create GIN indexes for array and JSONB fields
CREATE INDEX idx_phi_audit_fields_gin ON phi_audit_log USING gin(field_accessed);
CREATE INDEX idx_phi_audit_old_values_gin ON phi_audit_log USING gin(old_values);
CREATE INDEX idx_phi_audit_new_values_gin ON phi_audit_log USING gin(new_values);
CREATE INDEX idx_phi_audit_resource_ids_gin ON phi_audit_log USING gin(resource_ids);
CREATE INDEX idx_phi_audit_compliance_flags_gin ON phi_audit_log USING gin(compliance_flags);

-- Create function to calculate audit log checksum
CREATE OR REPLACE FUNCTION calculate_audit_checksum(
  p_user_id INTEGER,
  p_action VARCHAR,
  p_resource_type VARCHAR,
  p_resource_id VARCHAR,
  p_timestamp TIMESTAMPTZ,
  p_session_id VARCHAR,
  p_request_id VARCHAR
) RETURNS VARCHAR AS $$
DECLARE
  checksum_input TEXT;
  calculated_hash VARCHAR;
BEGIN
  -- Create deterministic input string
  checksum_input := COALESCE(p_user_id::TEXT, '') || '|' ||
                   COALESCE(p_action, '') || '|' ||
                   COALESCE(p_resource_type, '') || '|' ||
                   COALESCE(p_resource_id, '') || '|' ||
                   COALESCE(p_timestamp::TEXT, '') || '|' ||
                   COALESCE(p_session_id, '') || '|' ||
                   COALESCE(p_request_id, '');

  -- Calculate SHA-256 hash
  calculated_hash := encode(digest(checksum_input, 'sha256'), 'hex');

  RETURN calculated_hash;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create function to get previous audit hash for chaining
CREATE OR REPLACE FUNCTION get_previous_audit_hash() RETURNS VARCHAR AS $$
DECLARE
  prev_hash VARCHAR;
BEGIN
  SELECT checksum INTO prev_hash
  FROM phi_audit_log
  WHERE checksum IS NOT NULL
  ORDER BY id DESC
  LIMIT 1;

  RETURN COALESCE(prev_hash, '');
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set checksum and previous hash
CREATE OR REPLACE FUNCTION set_audit_integrity() RETURNS TRIGGER AS $$
DECLARE
  calculated_checksum VARCHAR;
  prev_hash VARCHAR;
BEGIN
  -- Calculate checksum for the new record
  calculated_checksum := calculate_audit_checksum(
    NEW.user_id,
    NEW.action,
    NEW.resource_type,
    NEW.resource_id,
    NEW.timestamp,
    NEW.session_id,
    NEW.request_id
  );

  -- Get previous hash for chaining
  prev_hash := get_previous_audit_hash();

  -- Set the calculated values
  NEW.checksum := calculated_checksum;
  NEW.previous_hash := prev_hash;
  NEW.timestamp_ms := EXTRACT(EPOCH FROM NEW.timestamp) * 1000;

  -- Set default risk score if not provided
  IF NEW.risk_score IS NULL THEN
    NEW.risk_score := CASE
      WHEN NEW.action IN ('DELETE', 'BULK_EXPORT', 'EMERGENCY_ACCESS') THEN 90
      WHEN NEW.action IN ('EXPORT', 'PRINT', 'BULK_VIEW') THEN 70
      WHEN NEW.action IN ('UPDATE', 'CREATE') THEN 50
      WHEN NEW.action IN ('VIEW', 'LIST') THEN 30
      ELSE 40
    END;
  END IF;

  -- Set compliance flags based on action and context
  IF NEW.compliance_flags IS NULL THEN
    NEW.compliance_flags := ARRAY[]::TEXT[];
  END IF;

  -- Add automatic compliance flags
  IF NEW.emergency_access THEN
    NEW.compliance_flags := array_append(NEW.compliance_flags, 'EMERGENCY_ACCESS');
  END IF;

  IF NEW.action LIKE 'BULK_%' THEN
    NEW.compliance_flags := array_append(NEW.compliance_flags, 'BULK_OPERATION');
  END IF;

  IF NEW.risk_score > 80 THEN
    NEW.compliance_flags := array_append(NEW.compliance_flags, 'HIGH_RISK');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER trigger_set_audit_integrity
  BEFORE INSERT ON phi_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION set_audit_integrity();

-- Create audit summary table for reporting and analytics
CREATE TABLE phi_audit_summary (
  id SERIAL PRIMARY KEY,
  summary_date DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id INTEGER REFERENCES users(id),
  resource_type VARCHAR(50),
  action VARCHAR(50),
  access_count INTEGER DEFAULT 0,
  unique_patients_accessed INTEGER DEFAULT 0,
  high_risk_accesses INTEGER DEFAULT 0,
  emergency_accesses INTEGER DEFAULT 0,
  bulk_operations INTEGER DEFAULT 0,
  average_response_time_ms DECIMAL(10,2),
  total_data_volume_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(summary_date, user_id, resource_type, action)
);

CREATE INDEX idx_phi_audit_summary_date ON phi_audit_summary(summary_date DESC);
CREATE INDEX idx_phi_audit_summary_user ON phi_audit_summary(user_id, summary_date DESC);

-- Create function to update audit summary (called by nightly job)
CREATE OR REPLACE FUNCTION update_audit_summary(p_summary_date DATE DEFAULT CURRENT_DATE)
RETURNS void AS $$
BEGIN
  -- Insert or update daily summaries
  INSERT INTO phi_audit_summary (
    summary_date, user_id, resource_type, action,
    access_count, unique_patients_accessed, high_risk_accesses,
    emergency_accesses, bulk_operations, average_response_time_ms,
    total_data_volume_bytes, updated_at
  )
  SELECT
    p_summary_date as summary_date,
    user_id,
    resource_type,
    action,
    COUNT(*) as access_count,
    COUNT(DISTINCT resource_id) FILTER (WHERE resource_type = 'patient') as unique_patients_accessed,
    COUNT(*) FILTER (WHERE risk_score > 80) as high_risk_accesses,
    COUNT(*) FILTER (WHERE emergency_access = true) as emergency_accesses,
    COUNT(*) FILTER (WHERE action LIKE 'BULK_%') as bulk_operations,
    AVG(response_time_ms) as average_response_time_ms,
    SUM(COALESCE(response_size_bytes, 0)) as total_data_volume_bytes,
    NOW() as updated_at
  FROM phi_audit_log
  WHERE DATE(timestamp) = p_summary_date
  GROUP BY user_id, resource_type, action
  ON CONFLICT (summary_date, user_id, resource_type, action)
  DO UPDATE SET
    access_count = EXCLUDED.access_count,
    unique_patients_accessed = EXCLUDED.unique_patients_accessed,
    high_risk_accesses = EXCLUDED.high_risk_accesses,
    emergency_accesses = EXCLUDED.emergency_accesses,
    bulk_operations = EXCLUDED.bulk_operations,
    average_response_time_ms = EXCLUDED.average_response_time_ms,
    total_data_volume_bytes = EXCLUDED.total_data_volume_bytes,
    updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

-- Create audit archive table (for long-term storage)
CREATE TABLE phi_audit_log_archive (
  LIKE phi_audit_log INCLUDING ALL
);

-- Create function to archive old audit logs (7 year retention)
CREATE OR REPLACE FUNCTION archive_audit_logs(
  p_archive_before_date DATE DEFAULT CURRENT_DATE - INTERVAL '7 years'
) RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER := 0;
BEGIN
  -- Move records to archive
  INSERT INTO phi_audit_log_archive
  SELECT * FROM phi_audit_log
  WHERE DATE(timestamp) < p_archive_before_date
    AND NOT archived;

  GET DIAGNOSTICS archived_count = ROW_COUNT;

  -- Mark as archived (don't delete for integrity)
  UPDATE phi_audit_log
  SET archived = true, archive_date = NOW()
  WHERE DATE(timestamp) < p_archive_before_date
    AND NOT archived;

  RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- Create view for common audit queries
CREATE VIEW v_phi_audit_recent AS
SELECT
  pal.id,
  pal.timestamp,
  u.first_name || ' ' || u.last_name as user_full_name,
  pal.user_role,
  pal.action,
  pal.resource_type,
  pal.resource_id,
  pal.endpoint,
  pal.ip_address,
  pal.reason,
  pal.emergency_access,
  pal.risk_score,
  pal.response_time_ms
FROM phi_audit_log pal
LEFT JOIN users u ON pal.user_id = u.id
WHERE pal.timestamp > NOW() - INTERVAL '30 days'
  AND NOT pal.archived
ORDER BY pal.timestamp DESC;

-- Create view for suspicious activity detection
CREATE VIEW v_phi_audit_suspicious AS
SELECT
  user_id,
  user_name,
  DATE(timestamp) as access_date,
  COUNT(*) as total_accesses,
  COUNT(DISTINCT resource_id) as unique_patients,
  COUNT(*) FILTER (WHERE action = 'VIEW' AND resource_type = 'patient') as patient_views,
  COUNT(*) FILTER (WHERE risk_score > 80) as high_risk_actions,
  COUNT(*) FILTER (WHERE DATE_PART('hour', timestamp) < 6 OR DATE_PART('hour', timestamp) > 22) as after_hours_access,
  MIN(timestamp) as first_access,
  MAX(timestamp) as last_access
FROM phi_audit_log
WHERE timestamp > NOW() - INTERVAL '7 days'
  AND NOT archived
GROUP BY user_id, user_name, DATE(timestamp)
HAVING
  COUNT(*) > 100 OR  -- High volume access
  COUNT(DISTINCT resource_id) > 50 OR  -- Many different patients
  COUNT(*) FILTER (WHERE risk_score > 80) > 10 OR  -- Many high-risk actions
  COUNT(*) FILTER (WHERE DATE_PART('hour', timestamp) < 6 OR DATE_PART('hour', timestamp) > 22) > 20  -- Excessive after-hours
ORDER BY total_accesses DESC, unique_patients DESC;

-- Grant appropriate permissions (fixed syntax)
GRANT SELECT, INSERT ON phi_audit_log TO emr_user;
GRANT SELECT ON phi_audit_log_archive TO emr_user;
GRANT SELECT, INSERT, UPDATE ON phi_audit_summary TO emr_user;
GRANT SELECT ON v_phi_audit_recent TO emr_user;
GRANT SELECT ON v_phi_audit_suspicious TO emr_user;
GRANT USAGE ON SEQUENCE phi_audit_log_id_seq TO emr_user;
GRANT USAGE ON SEQUENCE phi_audit_summary_id_seq TO emr_user;

-- Create initial audit entry to bootstrap the system
INSERT INTO phi_audit_log (
  user_id, user_role, user_name, user_email,
  action, resource_type, resource_id,
  timestamp, ip_address, user_agent,
  endpoint, http_method, session_id, request_id,
  reason, legal_basis, audit_level
) VALUES (
  NULL, 'SYSTEM', 'System Bootstrap', 'system@emr.local',
  'CREATE', 'audit_system', 'phi_audit_log',
  NOW(), '127.0.0.1', 'PostgreSQL/Bootstrap',
  '/system/bootstrap', 'POST', uuid_generate_v4()::text, uuid_generate_v4()::text,
  'Initialize PHI audit logging system', 'LEGAL_REQUIREMENT', 'SYSTEM'
);

COMMENT ON TABLE phi_audit_log IS 'Comprehensive PHI access audit log for HIPAA compliance. Every PHI access must be logged here.';
COMMENT ON COLUMN phi_audit_log.checksum IS 'SHA-256 checksum for tamper detection and data integrity verification.';
COMMENT ON COLUMN phi_audit_log.previous_hash IS 'Hash of previous audit entry for blockchain-like integrity chain.';
COMMENT ON COLUMN phi_audit_log.minimum_necessary_justification IS 'HIPAA minimum necessary rule justification for data access.';
COMMENT ON COLUMN phi_audit_log.risk_score IS 'Calculated risk score (0-100) for this access event.';

-- Verify the table was created successfully
SELECT 'PHI Audit System Created Successfully' as status,
       COUNT(*) as initial_entries
FROM phi_audit_log;