import { v4 as uuidv4 } from 'uuid';
import pool from '../db/index.js';
import auditServiceOriginal from './audit.service.js';

// Temporary wrapper to handle audit service failures
const auditService = {
  logRequestAudit: async (data) => {
    try {
      return await auditServiceOriginal.logRequestAudit(data);
    } catch (error) {
      console.log('Audit logging disabled - service error:', error.message);
      return true;
    }
  }
};

class SessionService {
  constructor() {
    this.sessionTimeout = 15 * 60 * 1000; // 15 minutes in milliseconds (HIPAA requirement)
  }

  /**
   * Create a new user session
   * @param {number} userId - User ID
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<{sessionToken: string, expiresAt: Date}>}
   */
  async createSession(userId, ipAddress, userAgent) {
    const sessionToken = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionTimeout);

    try {
      const query = `
        INSERT INTO user_sessions (
          user_id, session_token, ip_address, user_agent, 
          last_activity, expires_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;

      const result = await pool.query(query, [
        userId,
        sessionToken,
        ipAddress,
        userAgent,
        now,
        expiresAt,
        now
      ]);

      // Log session creation
      await auditService.logRequestAudit({
        userId,
        action: 'SESSION_CREATE',
        endpoint: '/session/create',
        method: 'POST',
        ip: ipAddress,
        userAgent,
        success: true,
        additionalData: {
          sessionId: result.rows[0].id,
          expiresAt: expiresAt.toISOString()
        }
      });

      return {
        sessionToken,
        expiresAt,
        sessionId: result.rows[0].id
      };
    } catch (error) {
      // Log session creation failure
      await auditService.logRequestAudit({
        userId,
        action: 'SESSION_CREATE',
        endpoint: '/session/create',
        method: 'POST',
        ip: ipAddress,
        userAgent,
        success: false,
        errorMessage: error.message
      });

      throw new Error('Failed to create session: ' + error.message);
    }
  }

  /**
   * Validate a session token
   * @param {string} sessionToken - Session token to validate
   * @returns {Promise<{valid: boolean, user?: object, sessionId?: number}>}
   */
  async validateSession(sessionToken) {
    if (!sessionToken) {
      return { valid: false };
    }

    try {
      const query = `
        SELECT 
          us.id, us.user_id, us.ip_address, us.user_agent,
          us.last_activity, us.expires_at, us.terminated,
          u.email, u.first_name, u.last_name, u.role, u.active
        FROM user_sessions us
        JOIN users u ON us.user_id = u.id
        WHERE us.session_token = $1 AND us.terminated = false
      `;

      const result = await pool.query(query, [sessionToken]);

      if (result.rows.length === 0) {
        return { valid: false, reason: 'Session not found' };
      }

      const session = result.rows[0];
      const now = new Date();

      // Check if session is expired
      if (new Date(session.expires_at) <= now) {
        // Mark session as terminated
        await this.terminateSession(sessionToken, 'EXPIRED');
        return { valid: false, reason: 'Session expired' };
      }

      // Check if user is still active
      if (!session.active) {
        await this.terminateSession(sessionToken, 'USER_INACTIVE');
        return { valid: false, reason: 'User account inactive' };
      }

      // Check for session timeout (15 minutes of inactivity)
      const timeSinceLastActivity = now.getTime() - new Date(session.last_activity).getTime();
      if (timeSinceLastActivity > this.sessionTimeout) {
        await this.terminateSession(sessionToken, 'TIMEOUT');
        return { valid: false, reason: 'Session timeout' };
      }

      // Update last activity
      await pool.query(
        'UPDATE user_sessions SET last_activity = $1 WHERE id = $2',
        [now, session.id]
      );

      return {
        valid: true,
        user: {
          id: session.user_id,
          email: session.email,
          first_name: session.first_name,
          last_name: session.last_name,
          role: session.role,
          active: session.active
        },
        sessionId: session.id,
        ipAddress: session.ip_address
      };
    } catch (error) {
      console.error('Session validation error:', error);
      return { valid: false, reason: 'Validation error' };
    }
  }

  /**
   * Refresh a session (extend expiration)
   * @param {string} sessionToken - Session token to refresh
   * @returns {Promise<{success: boolean, expiresAt?: Date}>}
   */
  async refreshSession(sessionToken) {
    const validation = await this.validateSession(sessionToken);

    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    try {
      const now = new Date();
      const newExpiresAt = new Date(now.getTime() + this.sessionTimeout);

      await pool.query(
        `UPDATE user_sessions 
         SET expires_at = $1, last_activity = $2 
         WHERE session_token = $3`,
        [newExpiresAt, now, sessionToken]
      );

      // Log session refresh
      await auditService.logRequestAudit({
        userId: validation.user.id,
        action: 'SESSION_REFRESH',
        endpoint: '/session/refresh',
        method: 'POST',
        ip: validation.ipAddress,
        success: true,
        additionalData: {
          sessionId: validation.sessionId,
          newExpiresAt: newExpiresAt.toISOString()
        }
      });

      return {
        success: true,
        expiresAt: newExpiresAt
      };
    } catch (error) {
      await auditService.logRequestAudit({
        userId: validation.user?.id,
        action: 'SESSION_REFRESH',
        endpoint: '/session/refresh',
        method: 'POST',
        ip: validation.ipAddress,
        success: false,
        errorMessage: error.message
      });

      return { success: false, reason: 'Refresh failed' };
    }
  }

  /**
   * Terminate a specific session
   * @param {string} sessionToken - Session token to terminate
   * @param {string} reason - Reason for termination
   * @returns {Promise<{success: boolean}>}
   */
  async terminateSession(sessionToken, reason = 'USER_LOGOUT') {
    try {
      const query = `
        UPDATE user_sessions 
        SET terminated = true, termination_reason = $1
        WHERE session_token = $2 AND terminated = false
        RETURNING user_id, ip_address
      `;

      const result = await pool.query(query, [reason, sessionToken]);

      if (result.rows.length > 0) {
        // Log session termination
        await auditService.logRequestAudit({
          userId: result.rows[0].user_id,
          action: 'SESSION_TERMINATE',
          endpoint: '/session/terminate',
          method: 'POST',
          ip: result.rows[0].ip_address,
          success: true,
          additionalData: {
            reason,
            sessionToken: sessionToken.substring(0, 8) + '...' // Partial token for audit
          }
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Session termination error:', error);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Terminate all sessions for a specific user
   * @param {number} userId - User ID
   * @param {string} reason - Reason for termination
   * @returns {Promise<{success: boolean, terminatedCount: number}>}
   */
  async terminateAllUserSessions(userId, reason = 'SECURITY_TERMINATION') {
    try {
      const query = `
        UPDATE user_sessions 
        SET terminated = true, termination_reason = $1
        WHERE user_id = $2 AND terminated = false
        RETURNING id, ip_address
      `;

      const result = await pool.query(query, [reason, userId]);

      // Log mass session termination
      await auditService.logRequestAudit({
        userId,
        action: 'SESSION_TERMINATE_ALL',
        endpoint: '/session/terminate-all',
        method: 'POST',
        success: true,
        additionalData: {
          reason,
          terminatedCount: result.rows.length
        }
      });

      return {
        success: true,
        terminatedCount: result.rows.length
      };
    } catch (error) {
      await auditService.logRequestAudit({
        userId,
        action: 'SESSION_TERMINATE_ALL',
        endpoint: '/session/terminate-all',
        method: 'POST',
        success: false,
        errorMessage: error.message
      });

      return { success: false, reason: error.message };
    }
  }

  /**
   * Clean up expired sessions (maintenance function)
   * @returns {Promise<{cleanedCount: number}>}
   */
  async cleanupExpiredSessions() {
    try {
      const query = `
        UPDATE user_sessions 
        SET terminated = true, termination_reason = 'EXPIRED_CLEANUP'
        WHERE expires_at <= CURRENT_TIMESTAMP AND terminated = false
        RETURNING id
      `;

      const result = await pool.query(query);

      // Log cleanup operation
      if (result.rows.length > 0) {
        await auditService.logRequestAudit({
          userId: null,
          action: 'SESSION_CLEANUP',
          endpoint: '/session/cleanup',
          method: 'POST',
          success: true,
          additionalData: {
            cleanedCount: result.rows.length
          }
        });
      }

      return { cleanedCount: result.rows.length };
    } catch (error) {
      console.error('Session cleanup error:', error);
      await auditService.logRequestAudit({
        userId: null,
        action: 'SESSION_CLEANUP',
        endpoint: '/session/cleanup',
        method: 'POST',
        success: false,
        errorMessage: error.message
      });

      return { cleanedCount: 0 };
    }
  }

  /**
   * Get active sessions for a user
   * @param {number} userId - User ID
   * @returns {Promise<Array>}
   */
  async getUserActiveSessions(userId) {
    try {
      const query = `
        SELECT 
          id, ip_address, user_agent, created_at, 
          last_activity, expires_at
        FROM user_sessions
        WHERE user_id = $1 AND terminated = false 
        AND expires_at > CURRENT_TIMESTAMP
        ORDER BY last_activity DESC
      `;

      const result = await pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      console.error('Get user sessions error:', error);
      return [];
    }
  }
}

// Export singleton instance
const sessionService = new SessionService();
export default sessionService;