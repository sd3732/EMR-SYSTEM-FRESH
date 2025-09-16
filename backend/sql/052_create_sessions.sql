-- Migration: Create secure session management system
-- This migration creates a robust session system with HIPAA compliance
-- Addresses security audit requirements for session timeout and management

BEGIN;

-- Create user_sessions table for secure session management
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    terminated BOOLEAN DEFAULT false,
    termination_reason VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes for session management
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id, terminated);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at) WHERE terminated = false;
CREATE INDEX IF NOT EXISTS idx_sessions_active ON user_sessions(user_id, terminated, expires_at) 
    WHERE terminated = false;

-- Function to automatically clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    cleaned_count INTEGER;
BEGIN
    UPDATE user_sessions 
    SET terminated = true, termination_reason = 'AUTO_EXPIRED'
    WHERE expires_at <= CURRENT_TIMESTAMP 
    AND terminated = false;
    
    GET DIAGNOSTICS cleaned_count = ROW_COUNT;
    
    RETURN cleaned_count;
END;
$$;

-- Function to validate session and update last activity
CREATE OR REPLACE FUNCTION validate_and_update_session(p_session_token VARCHAR(255))
RETURNS TABLE (
    valid BOOLEAN,
    user_id INTEGER,
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    session_id INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    session_record RECORD;
    session_timeout INTERVAL := '15 minutes';
BEGIN
    -- First clean up expired sessions
    PERFORM cleanup_expired_sessions();
    
    -- Find and validate the session
    SELECT 
        us.id, us.user_id, us.last_activity, us.expires_at,
        u.email, u.role, u.active
    INTO session_record
    FROM user_sessions us
    JOIN users u ON us.user_id = u.id
    WHERE us.session_token = p_session_token
    AND us.terminated = false
    AND u.active = true;
    
    -- Check if session found
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::INTEGER, NULL::VARCHAR(255), NULL::VARCHAR(50), NULL::INTEGER;
        RETURN;
    END IF;
    
    -- Check if session expired (database level)
    IF session_record.expires_at <= CURRENT_TIMESTAMP THEN
        -- Mark session as expired
        UPDATE user_sessions 
        SET terminated = true, termination_reason = 'EXPIRED'
        WHERE session_token = p_session_token;
        
        RETURN QUERY SELECT false, NULL::INTEGER, NULL::VARCHAR(255), NULL::VARCHAR(50), NULL::INTEGER;
        RETURN;
    END IF;
    
    -- Check for inactivity timeout
    IF CURRENT_TIMESTAMP - session_record.last_activity > session_timeout THEN
        -- Mark session as timed out
        UPDATE user_sessions 
        SET terminated = true, termination_reason = 'TIMEOUT'
        WHERE session_token = p_session_token;
        
        RETURN QUERY SELECT false, NULL::INTEGER, NULL::VARCHAR(255), NULL::VARCHAR(50), NULL::INTEGER;
        RETURN;
    END IF;
    
    -- Session is valid, update last activity and extend expiration
    UPDATE user_sessions
    SET 
        last_activity = CURRENT_TIMESTAMP,
        expires_at = CURRENT_TIMESTAMP + session_timeout
    WHERE session_token = p_session_token;
    
    -- Return valid session info
    RETURN QUERY SELECT 
        true,
        session_record.user_id,
        session_record.email,
        session_record.role,
        session_record.id;
END;
$$;

-- Function to terminate all sessions for a user (security feature)
CREATE OR REPLACE FUNCTION terminate_user_sessions(p_user_id INTEGER, p_reason VARCHAR(100) DEFAULT 'SECURITY_TERMINATION')
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    terminated_count INTEGER;
BEGIN
    UPDATE user_sessions 
    SET terminated = true, termination_reason = p_reason
    WHERE user_id = p_user_id AND terminated = false;
    
    GET DIAGNOSTICS terminated_count = ROW_COUNT;
    
    RETURN terminated_count;
END;
$$;

-- Create view for active sessions monitoring
CREATE OR REPLACE VIEW active_sessions AS
SELECT 
    us.id,
    us.user_id,
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    us.ip_address,
    us.user_agent,
    us.created_at,
    us.last_activity,
    us.expires_at,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - us.last_activity))/60 as minutes_inactive
FROM user_sessions us
JOIN users u ON us.user_id = u.id
WHERE us.terminated = false 
AND us.expires_at > CURRENT_TIMESTAMP
ORDER BY us.last_activity DESC;

-- Create constraints for data integrity
ALTER TABLE user_sessions ADD CONSTRAINT check_expires_after_created 
    CHECK (expires_at > created_at);

ALTER TABLE user_sessions ADD CONSTRAINT check_last_activity_not_future 
    CHECK (last_activity <= CURRENT_TIMESTAMP);

-- Add comments for documentation
COMMENT ON TABLE user_sessions IS 'Secure session management with HIPAA-compliant 15-minute timeout';
COMMENT ON COLUMN user_sessions.session_token IS 'Unique session identifier (UUID)';
COMMENT ON COLUMN user_sessions.expires_at IS 'Hard expiration time for session';
COMMENT ON COLUMN user_sessions.last_activity IS 'Last user activity for inactivity timeout';
COMMENT ON COLUMN user_sessions.terminated IS 'Flag indicating if session is terminated';
COMMENT ON COLUMN user_sessions.termination_reason IS 'Reason for session termination (LOGOUT, EXPIRED, TIMEOUT, SECURITY, etc.)';

COMMENT ON FUNCTION cleanup_expired_sessions() IS 'Maintenance function to clean up expired sessions';
COMMENT ON FUNCTION validate_and_update_session(VARCHAR) IS 'Validates session token and updates activity';
COMMENT ON FUNCTION terminate_user_sessions(INTEGER, VARCHAR) IS 'Terminates all sessions for a user';
COMMENT ON VIEW active_sessions IS 'Real-time view of all active user sessions';

-- Grant appropriate permissions
GRANT SELECT ON active_sessions TO PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_expired_sessions() TO PUBLIC;
GRANT EXECUTE ON FUNCTION validate_and_update_session(VARCHAR) TO PUBLIC;
GRANT EXECUTE ON FUNCTION terminate_user_sessions(INTEGER, VARCHAR) TO PUBLIC;

-- Log migration completion
DO $$
DECLARE
    table_exists BOOLEAN;
    function_count INTEGER;
BEGIN
    -- Check if table was created
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'user_sessions' 
        AND table_schema = 'public'
    ) INTO table_exists;
    
    -- Count session-related functions
    SELECT COUNT(*) INTO function_count
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    AND (routine_name LIKE '%session%' OR routine_name LIKE '%cleanup%');
    
    RAISE NOTICE 'Session management system installation complete:';
    RAISE NOTICE '  - user_sessions table created: %', table_exists;
    RAISE NOTICE '  - Session functions available: %', function_count;
    RAISE NOTICE '  - Session timeout: 15 minutes (HIPAA compliant)';
    RAISE NOTICE '  - Automatic cleanup enabled';
END $$;

COMMIT;