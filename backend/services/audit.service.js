// backend/services/audit.service.js
import pool from '../db/index.js';
import encryptionService from './encryption.service.js';
import { v4 as uuidv4 } from 'uuid';

class AuditService {
  constructor() {
    this.serviceName = 'AuditService';
  }

  /**
   * Log PHI access with detailed tracking
   * @param {number} userId - User accessing PHI
   * @param {string} tableName - Database table containing PHI
   * @param {number} recordId - Specific record ID
   * @param {string} fieldAccessed - PHI field being accessed
   * @param {string} reason - Business reason for access
   * @param {object} options - Additional options
   */
  async logPHIAccess(userId, tableName, recordId, fieldAccessed, reason, options = {}) {
    try {
      const {
        sessionId = null,
        ipAddress = null,
        userAgent = null,
        requestId = uuidv4(),
        decrypted = false,
        patientId = null,
        endpoint = null
      } = options;

      // First create the main audit log entry
      const auditQuery = `
        INSERT INTO audit_logs (
          user_id, action, table_name, record_id, phi_accessed,
          ip_address, user_agent, session_id, request_id, endpoint,
          success, additional_data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
        RETURNING id
      `;

      const additionalData = {
        fieldAccessed,
        reason,
        decrypted,
        patientId,
        service: this.serviceName
      };

      const auditResult = await pool.query(auditQuery, [
        userId,
        decrypted ? 'DECRYPT' : 'READ',
        tableName,
        recordId,
        true, // phi_accessed = true
        ipAddress,
        userAgent,
        sessionId,
        requestId,
        endpoint,
        true, // success = true
        JSON.stringify(additionalData)
      ]);

      const auditLogId = auditResult.rows[0].id;

      // Create detailed PHI access log entry
      const phiQuery = `
        INSERT INTO phi_access_logs (
          audit_log_id, field_accessed, field_type, table_name, record_id,
          reason_for_access, business_justification, decrypted, patient_id,
          data_classification, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
        RETURNING id
      `;

      const fieldType = this.determineFieldType(fieldAccessed);
      const businessJustification = this.generateBusinessJustification(tableName, fieldAccessed, 'READ');

      const phiResult = await pool.query(phiQuery, [
        auditLogId,
        fieldAccessed,
        fieldType,
        tableName,
        recordId,
        reason,
        businessJustification,
        decrypted,
        patientId,
        'PHI'
      ]);

      // Update session activity if provided
      if (userId && sessionId) {
        await pool.query('SELECT update_session_activity($1, $2, $3, $4)', [
          userId, sessionId, true, false
        ]);
      }

      console.log(`[AUDIT] PHI Access logged: User ${userId} accessed ${fieldAccessed} in ${tableName}:${recordId}`);
      
      return {
        auditLogId,
        phiAccessLogId: phiResult.rows[0].id,
        success: true
      };

    } catch (error) {
      console.error('[AUDIT ERROR] Failed to log PHI access:', error);
      throw new Error(`PHI access logging failed: ${error.message}`);
    }
  }

  /**
   * Log data modifications with before/after values
   * @param {number} userId - User making the modification
   * @param {string} tableName - Table being modified
   * @param {number} recordId - Record being modified
   * @param {*} oldValue - Original value
   * @param {*} newValue - New value
   * @param {object} options - Additional options
   */
  async logDataModification(userId, tableName, recordId, oldValue, newValue, options = {}) {
    try {
      const {
        fieldName = 'unknown',
        sessionId = null,
        ipAddress = null,
        userAgent = null,
        requestId = uuidv4(),
        isPhiField = false,
        changeReason = null,
        approvedBy = null,
        endpoint = null
      } = options;

      // Create main audit log entry
      const auditQuery = `
        INSERT INTO audit_logs (
          user_id, action, table_name, record_id, phi_accessed,
          ip_address, user_agent, session_id, request_id, endpoint,
          success, additional_data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
        RETURNING id
      `;

      const additionalData = {
        fieldName,
        isPhiField,
        changeReason,
        approvedBy,
        service: this.serviceName,
        valueChanged: oldValue !== newValue
      };

      const auditResult = await pool.query(auditQuery, [
        userId,
        'UPDATE',
        tableName,
        recordId,
        isPhiField,
        ipAddress,
        userAgent,
        sessionId,
        requestId,
        endpoint,
        true,
        JSON.stringify(additionalData)
      ]);

      const auditLogId = auditResult.rows[0].id;

      // Prepare values for logging
      let oldValueForLog = oldValue;
      let newValueForLog = newValue;
      let oldValueEncrypted = null;
      let newValueEncrypted = null;

      // If this is a PHI field, encrypt the values before storing
      if (isPhiField && (oldValue || newValue)) {
        try {
          if (oldValue) {
            oldValueEncrypted = encryptionService.encryptString(String(oldValue));
            oldValueForLog = '[ENCRYPTED]';
          }
          if (newValue) {
            newValueEncrypted = encryptionService.encryptString(String(newValue));
            newValueForLog = '[ENCRYPTED]';
          }
        } catch (encryptionError) {
          console.warn('[AUDIT WARN] Failed to encrypt PHI values for audit log:', encryptionError.message);
          // Still log the change but mask the values
          oldValueForLog = '[PHI - ENCRYPTION FAILED]';
          newValueForLog = '[PHI - ENCRYPTION FAILED]';
        }
      }

      // Create data modification entry
      const modificationQuery = `
        INSERT INTO data_modifications (
          audit_log_id, table_name, record_id, field_name,
          old_value, new_value, old_value_encrypted, new_value_encrypted,
          is_phi_field, change_reason, approved_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
        RETURNING id
      `;

      const modificationResult = await pool.query(modificationQuery, [
        auditLogId,
        tableName,
        recordId,
        fieldName,
        oldValueForLog,
        newValueForLog,
        oldValueEncrypted,
        newValueEncrypted,
        isPhiField,
        changeReason,
        approvedBy
      ]);

      // If PHI was modified, also create PHI access log
      if (isPhiField) {
        await this.logPHIAccess(userId, tableName, recordId, fieldName, 
          changeReason || 'Data modification', {
            sessionId, ipAddress, userAgent, requestId, 
            patientId: options.patientId, endpoint
          });
      }

      console.log(`[AUDIT] Data modification logged: User ${userId} modified ${fieldName} in ${tableName}:${recordId}`);
      
      return {
        auditLogId,
        modificationId: modificationResult.rows[0].id,
        success: true
      };

    } catch (error) {
      console.error('[AUDIT ERROR] Failed to log data modification:', error);
      throw new Error(`Data modification logging failed: ${error.message}`);
    }
  }

  /**
   * Generate comprehensive compliance report
   * @param {Date} startDate - Report start date
   * @param {Date} endDate - Report end date
   * @param {object} options - Report options
   */
  async generateComplianceReport(startDate, endDate, options = {}) {
    try {
      const {
        includeUserBreakdown = true,
        includePhiDetails = true,
        includeAnomalies = true,
        includeDataModifications = true,
        format = 'json'
      } = options;

      console.log(`[AUDIT] Generating compliance report from ${startDate} to ${endDate}`);

      const report = {
        reportMetadata: {
          generatedAt: new Date().toISOString(),
          reportPeriod: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          },
          generatedBy: this.serviceName,
          reportId: uuidv4()
        },
        summary: {},
        details: {}
      };

      // Overall activity summary
      const summaryQuery = `
        SELECT 
          COUNT(*) as total_activities,
          COUNT(*) FILTER (WHERE phi_accessed = true) as phi_accesses,
          COUNT(*) FILTER (WHERE success = false) as failed_attempts,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT user_id) FILTER (WHERE phi_accessed = true) as users_accessed_phi,
          COUNT(*) FILTER (WHERE action = 'READ') as read_operations,
          COUNT(*) FILTER (WHERE action = 'CREATE') as create_operations,
          COUNT(*) FILTER (WHERE action = 'UPDATE') as update_operations,
          COUNT(*) FILTER (WHERE action = 'DELETE') as delete_operations,
          COUNT(*) FILTER (WHERE action = 'DECRYPT') as decrypt_operations
        FROM audit_logs 
        WHERE created_at BETWEEN $1 AND $2
      `;

      const summaryResult = await pool.query(summaryQuery, [startDate, endDate]);
      report.summary = summaryResult.rows[0];

      // PHI access breakdown by table
      if (includePhiDetails) {
        const phiBreakdownQuery = `
          SELECT 
            table_name,
            COUNT(*) as access_count,
            COUNT(DISTINCT user_id) as unique_users,
            COUNT(DISTINCT record_id) as unique_records
          FROM audit_logs 
          WHERE created_at BETWEEN $1 AND $2 AND phi_accessed = true
          GROUP BY table_name
          ORDER BY access_count DESC
        `;

        const phiBreakdown = await pool.query(phiBreakdownQuery, [startDate, endDate]);
        report.details.phiAccessByTable = phiBreakdown.rows;

        // Detailed PHI field access
        const phiFieldsQuery = `
          SELECT 
            pal.field_accessed,
            pal.table_name,
            COUNT(*) as access_count,
            COUNT(DISTINCT al.user_id) as unique_users,
            COUNT(*) FILTER (WHERE pal.decrypted = true) as decryption_count
          FROM phi_access_logs pal
          JOIN audit_logs al ON pal.audit_log_id = al.id
          WHERE al.created_at BETWEEN $1 AND $2
          GROUP BY pal.field_accessed, pal.table_name
          ORDER BY access_count DESC
        `;

        const phiFields = await pool.query(phiFieldsQuery, [startDate, endDate]);
        report.details.phiFieldAccess = phiFields.rows;
      }

      // User activity breakdown
      if (includeUserBreakdown) {
        const userBreakdownQuery = `
          SELECT 
            user_id,
            COUNT(*) as total_activities,
            COUNT(*) FILTER (WHERE phi_accessed = true) as phi_accesses,
            COUNT(*) FILTER (WHERE success = false) as failed_attempts,
            COUNT(DISTINCT table_name) as tables_accessed,
            MIN(created_at) as first_activity,
            MAX(created_at) as last_activity
          FROM audit_logs 
          WHERE created_at BETWEEN $1 AND $2 AND user_id IS NOT NULL
          GROUP BY user_id
          ORDER BY phi_accesses DESC, total_activities DESC
        `;

        const userBreakdown = await pool.query(userBreakdownQuery, [startDate, endDate]);
        report.details.userActivity = userBreakdown.rows;
      }

      // Suspicious activities and anomalies
      if (includeAnomalies) {
        const anomaliesQuery = `
          SELECT 
            us.user_id,
            us.session_id,
            us.anomaly_score,
            us.request_count,
            us.phi_access_count,
            us.failed_attempts,
            us.login_time,
            us.last_activity
          FROM user_sessions us
          WHERE us.last_activity BETWEEN $1 AND $2 
            AND (us.flagged_suspicious = true OR us.anomaly_score >= 5.0)
          ORDER BY us.anomaly_score DESC
        `;

        const anomalies = await pool.query(anomaliesQuery, [startDate, endDate]);
        report.details.suspiciousActivities = anomalies.rows;
      }

      // Data modifications
      if (includeDataModifications) {
        const modificationsQuery = `
          SELECT 
            dm.table_name,
            dm.field_name,
            COUNT(*) as modification_count,
            COUNT(DISTINCT al.user_id) as unique_users,
            COUNT(*) FILTER (WHERE dm.is_phi_field = true) as phi_modifications
          FROM data_modifications dm
          JOIN audit_logs al ON dm.audit_log_id = al.id
          WHERE al.created_at BETWEEN $1 AND $2
          GROUP BY dm.table_name, dm.field_name
          ORDER BY modification_count DESC
        `;

        const modifications = await pool.query(modificationsQuery, [startDate, endDate]);
        report.details.dataModifications = modifications.rows;
      }

      // Compliance metrics
      report.complianceMetrics = {
        phiAccessRate: report.summary.total_activities > 0 
          ? (report.summary.phi_accesses / report.summary.total_activities * 100).toFixed(2) + '%'
          : '0%',
        failureRate: report.summary.total_activities > 0 
          ? (report.summary.failed_attempts / report.summary.total_activities * 100).toFixed(2) + '%'
          : '0%',
        avgPhiAccessPerUser: report.summary.users_accessed_phi > 0 
          ? (report.summary.phi_accesses / report.summary.users_accessed_phi).toFixed(2)
          : '0',
        suspiciousActivities: includeAnomalies ? report.details.suspiciousActivities.length : 0
      };

      console.log(`[AUDIT] Compliance report generated: ${report.summary.total_activities} activities, ${report.summary.phi_accesses} PHI accesses`);

      return report;

    } catch (error) {
      console.error('[AUDIT ERROR] Failed to generate compliance report:', error);
      throw new Error(`Compliance report generation failed: ${error.message}`);
    }
  }

  /**
   * Detect anomalous access patterns for a user
   * @param {number} userId - User to analyze
   * @param {object} options - Analysis options
   */
  async detectAnomalousAccess(userId, options = {}) {
    try {
      const {
        lookbackDays = 30,
        includeCurrentSession = true,
        thresholds = {
          dailyPhiAccess: 50,
          hourlyPhiAccess: 10,
          unusualHours: [22, 23, 0, 1, 2, 3, 4, 5, 6],
          sessionDurationMinutes: 480, // 8 hours
          rapidRequests: 100 // per hour
        }
      } = options;

      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

      console.log(`[AUDIT] Analyzing user ${userId} for anomalous access patterns`);

      const analysis = {
        userId,
        analysisDate: new Date().toISOString(),
        lookbackPeriod: lookbackDays,
        flags: [],
        riskScore: 0,
        recommendations: []
      };

      // Get user's historical patterns
      const historicalQuery = `
        SELECT 
          DATE(created_at) as activity_date,
          EXTRACT(hour FROM created_at) as activity_hour,
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE phi_accessed = true) as phi_requests,
          COUNT(*) FILTER (WHERE success = false) as failed_requests,
          COUNT(DISTINCT session_id) as sessions
        FROM audit_logs 
        WHERE user_id = $1 AND created_at >= $2
        GROUP BY DATE(created_at), EXTRACT(hour FROM created_at)
        ORDER BY activity_date DESC, activity_hour
      `;

      const historical = await pool.query(historicalQuery, [userId, lookbackDate]);

      // Check current active sessions
      const activeSessionsQuery = `
        SELECT 
          session_id,
          anomaly_score,
          request_count,
          phi_access_count,
          failed_attempts,
          login_time,
          last_activity,
          flagged_suspicious
        FROM user_sessions 
        WHERE user_id = $1 AND is_active = true
      `;

      const activeSessions = await pool.query(activeSessionsQuery, [userId]);

      // Analysis 1: Daily PHI access patterns
      const dailyPhiCounts = {};
      historical.rows.forEach(row => {
        const date = row.activity_date.toISOString().split('T')[0];
        dailyPhiCounts[date] = (dailyPhiCounts[date] || 0) + parseInt(row.phi_requests);
      });

      const excessiveDays = Object.entries(dailyPhiCounts)
        .filter(([date, count]) => count > thresholds.dailyPhiAccess);

      if (excessiveDays.length > 0) {
        analysis.flags.push({
          type: 'EXCESSIVE_DAILY_PHI_ACCESS',
          severity: 'HIGH',
          description: `Exceeded daily PHI access threshold (${thresholds.dailyPhiAccess}) on ${excessiveDays.length} days`,
          details: excessiveDays
        });
        analysis.riskScore += 3;
      }

      // Analysis 2: Unusual hours access
      const unusualHoursAccess = historical.rows.filter(row => 
        thresholds.unusualHours.includes(parseInt(row.activity_hour)) && row.phi_requests > 0
      );

      if (unusualHoursAccess.length > 0) {
        analysis.flags.push({
          type: 'UNUSUAL_HOURS_ACCESS',
          severity: 'MEDIUM',
          description: `PHI access during unusual hours detected`,
          count: unusualHoursAccess.length,
          details: unusualHoursAccess.map(row => ({
            date: row.activity_date,
            hour: row.activity_hour,
            phiRequests: row.phi_requests
          }))
        });
        analysis.riskScore += 2;
      }

      // Analysis 3: Current session anomalies
      activeSessions.rows.forEach(session => {
        if (session.flagged_suspicious) {
          analysis.flags.push({
            type: 'SUSPICIOUS_CURRENT_SESSION',
            severity: 'HIGH',
            description: `Current session flagged as suspicious`,
            sessionId: session.session_id,
            anomalyScore: session.anomaly_score,
            details: {
              requestCount: session.request_count,
              phiAccessCount: session.phi_access_count,
              failedAttempts: session.failed_attempts
            }
          });
          analysis.riskScore += 4;
        }

        // Long session duration
        const sessionMinutes = (new Date() - new Date(session.login_time)) / 60000;
        if (sessionMinutes > thresholds.sessionDurationMinutes) {
          analysis.flags.push({
            type: 'EXCESSIVE_SESSION_DURATION',
            severity: 'MEDIUM',
            description: `Session duration exceeds threshold`,
            sessionId: session.session_id,
            durationMinutes: Math.round(sessionMinutes),
            threshold: thresholds.sessionDurationMinutes
          });
          analysis.riskScore += 1;
        }
      });

      // Analysis 4: Failed attempts pattern
      const totalFailedAttempts = historical.rows.reduce((sum, row) => sum + parseInt(row.failed_requests), 0);
      if (totalFailedAttempts > 20) {
        analysis.flags.push({
          type: 'HIGH_FAILURE_RATE',
          severity: 'MEDIUM',
          description: `High number of failed attempts in lookback period`,
          failedAttempts: totalFailedAttempts,
          lookbackDays
        });
        analysis.riskScore += 2;
      }

      // Generate recommendations
      if (analysis.riskScore >= 5) {
        analysis.recommendations.push('Consider requiring additional authentication for this user');
        analysis.recommendations.push('Review user\'s recent PHI access for business justification');
      }

      if (analysis.flags.some(f => f.type === 'UNUSUAL_HOURS_ACCESS')) {
        analysis.recommendations.push('Verify legitimate business need for after-hours PHI access');
      }

      if (analysis.flags.some(f => f.type === 'SUSPICIOUS_CURRENT_SESSION')) {
        analysis.recommendations.push('Consider terminating suspicious sessions and requiring re-authentication');
      }

      // Risk level assessment
      if (analysis.riskScore >= 7) {
        analysis.riskLevel = 'HIGH';
      } else if (analysis.riskScore >= 4) {
        analysis.riskLevel = 'MEDIUM';
      } else {
        analysis.riskLevel = 'LOW';
      }

      console.log(`[AUDIT] Anomaly analysis complete for user ${userId}: Risk Level ${analysis.riskLevel}, Score ${analysis.riskScore}`);

      return analysis;

    } catch (error) {
      console.error('[AUDIT ERROR] Failed to detect anomalous access:', error);
      throw new Error(`Anomaly detection failed: ${error.message}`);
    }
  }

  /**
   * Export audit log data for external compliance audits
   * @param {object} options - Export options
   */
  async exportAuditLog(options = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
        endDate = new Date(),
        format = 'json',
        includePhiDetails = false, // Default false for security
        includeDataModifications = true,
        userId = null,
        tableName = null,
        maxRecords = 10000
      } = options;

      console.log(`[AUDIT] Exporting audit log from ${startDate} to ${endDate}, format: ${format}`);

      let whereConditions = ['al.created_at BETWEEN $1 AND $2'];
      let queryParams = [startDate, endDate];
      let paramIndex = 3;

      if (userId) {
        whereConditions.push(`al.user_id = $${paramIndex}`);
        queryParams.push(userId);
        paramIndex++;
      }

      if (tableName) {
        whereConditions.push(`al.table_name = $${paramIndex}`);
        queryParams.push(tableName);
        paramIndex++;
      }

      // Main audit logs query
      const auditQuery = `
        SELECT 
          al.id,
          al.user_id,
          al.action,
          al.table_name,
          al.record_id,
          al.phi_accessed,
          al.ip_address,
          al.session_id,
          al.request_id,
          al.endpoint,
          al.http_method,
          al.execution_time_ms,
          al.success,
          al.error_message,
          al.created_at,
          CASE 
            WHEN al.phi_accessed = false THEN al.additional_data
            ELSE '{"redacted": "PHI access details redacted for export"}'::jsonb
          END as additional_data
        FROM audit_logs al
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY al.created_at DESC
        LIMIT $${paramIndex}
      `;
      queryParams.push(maxRecords);

      const auditResults = await pool.query(auditQuery, queryParams);

      const exportData = {
        exportMetadata: {
          exportedAt: new Date().toISOString(),
          exportPeriod: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          },
          totalRecords: auditResults.rows.length,
          format,
          filters: {
            userId,
            tableName,
            includePhiDetails,
            includeDataModifications
          },
          exportId: uuidv4()
        },
        auditLogs: auditResults.rows
      };

      // Include PHI details if specifically requested (admin export)
      if (includePhiDetails) {
        const phiQuery = `
          SELECT 
            pal.*
          FROM phi_access_logs pal
          JOIN audit_logs al ON pal.audit_log_id = al.id
          WHERE al.created_at BETWEEN $1 AND $2
          ORDER BY pal.created_at DESC
        `;

        const phiResults = await pool.query(phiQuery, [startDate, endDate]);
        exportData.phiAccessDetails = phiResults.rows;
      }

      // Include data modifications
      if (includeDataModifications) {
        const modQuery = `
          SELECT 
            dm.id,
            dm.audit_log_id,
            dm.table_name,
            dm.record_id,
            dm.field_name,
            CASE 
              WHEN dm.is_phi_field = true THEN '[REDACTED - PHI]'
              ELSE dm.old_value
            END as old_value,
            CASE 
              WHEN dm.is_phi_field = true THEN '[REDACTED - PHI]'
              ELSE dm.new_value
            END as new_value,
            dm.is_phi_field,
            dm.change_reason,
            dm.approved_by,
            dm.created_at
          FROM data_modifications dm
          JOIN audit_logs al ON dm.audit_log_id = al.id
          WHERE al.created_at BETWEEN $1 AND $2
          ORDER BY dm.created_at DESC
        `;

        const modResults = await pool.query(modQuery, [startDate, endDate]);
        exportData.dataModifications = modResults.rows;
      }

      console.log(`[AUDIT] Export complete: ${exportData.auditLogs.length} audit records exported`);

      // Format conversion if needed
      if (format === 'csv') {
        return this.convertToCSV(exportData);
      }

      return exportData;

    } catch (error) {
      console.error('[AUDIT ERROR] Failed to export audit log:', error);
      throw new Error(`Audit log export failed: ${error.message}`);
    }
  }

  /**
   * Initialize or update user session
   * @param {number} userId - User ID
   * @param {string} sessionId - Session ID
   * @param {string} ipAddress - IP address
   * @param {string} userAgent - User agent
   */
  async initializeUserSession(userId, sessionId, ipAddress, userAgent) {
    try {
      const query = `
        INSERT INTO user_sessions (
          user_id, session_id, ip_address, user_agent, login_time, last_activity
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (session_id) DO UPDATE SET
          last_activity = CURRENT_TIMESTAMP,
          is_active = true
        RETURNING id
      `;

      const result = await pool.query(query, [userId, sessionId, ipAddress, userAgent]);
      console.log(`[AUDIT] User session initialized: ${userId} - ${sessionId}`);
      
      return result.rows[0].id;

    } catch (error) {
      console.error('[AUDIT ERROR] Failed to initialize user session:', error);
      throw error;
    }
  }

  /**
   * Close user session
   * @param {string} sessionId - Session ID to close
   */
  async closeUserSession(sessionId) {
    try {
      await pool.query('SELECT close_user_session($1)', [sessionId]);
      console.log(`[AUDIT] User session closed: ${sessionId}`);
    } catch (error) {
      console.error('[AUDIT ERROR] Failed to close user session:', error);
    }
  }

  /**
   * Helper method to determine field type
   */
  determineFieldType(fieldName) {
    const fieldLower = fieldName.toLowerCase();
    
    if (fieldLower.includes('ssn') || fieldLower.includes('encrypted')) {
      return 'encrypted';
    }
    
    if (fieldLower.includes('hash') || fieldLower.includes('hashed')) {
      return 'hashed';
    }
    
    return 'text';
  }

  /**
   * Generate business justification based on context
   */
  generateBusinessJustification(tableName, fieldName, action) {
    const justifications = {
      patients: `Patient ${fieldName} ${action.toLowerCase()} for clinical care and treatment`,
      encounters: `Clinical encounter ${fieldName} ${action.toLowerCase()} for medical documentation`,
      patient_insurance: `Insurance ${fieldName} ${action.toLowerCase()} for billing and verification`,
      vitals: `Patient vitals ${fieldName} ${action.toLowerCase()} for medical monitoring`,
      clinical_notes: `Clinical notes ${fieldName} ${action.toLowerCase()} for continuity of care`
    };
    
    return justifications[tableName] || `${fieldName} ${action.toLowerCase()} for authorized medical purposes`;
  }

  /**
   * Convert export data to CSV format
   */
  convertToCSV(data) {
    // This is a simplified CSV conversion - in production you might want a more robust solution
    const headers = Object.keys(data.auditLogs[0] || {});
    const csvRows = [headers.join(',')];
    
    data.auditLogs.forEach(row => {
      const values = headers.map(header => {
        let value = row[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value).replace(/,/g, ';'); // Replace commas to avoid CSV issues
      });
      csvRows.push(values.join(','));
    });
    
    return csvRows.join('\n');
  }

  /**
   * Log request audit data
   * @param {object} data - Audit data to log
   */
  async logRequestAudit(data) {
    // Simple implementation for now
    console.log('Audit log:', data);
    return true;
  }
}

// Export singleton instance
const auditService = new AuditService();
export default auditService;