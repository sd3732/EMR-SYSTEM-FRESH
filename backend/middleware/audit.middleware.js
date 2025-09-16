// backend/middleware/audit.middleware.js
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/index.js';

class AuditMiddleware {
  constructor() {
    this.phiRoutes = new Set([
      // Patient routes - contain PHI
      '/api/patients',
      '/api/patients/',
      
      // Encounter routes - contain clinical data
      '/api/encounters',
      '/api/encounters/',
      
      // Insurance routes - contain SSN and financial PHI
      '/api/insurance',
      '/api/patients/',
      
      // Clinical data routes
      '/api/vitals',
      '/api/clinical-notes',
      '/api/medical-history',
      '/api/family-history',
      '/api/prescriptions',
      '/api/lab-results',
      
      // Sensitive endpoints
      '/api/insurance/',
      '/ssn', // SSN decryption endpoints
    ]);

    this.phiFields = new Set([
      'ssn', 'social_security_number', 'subscriber_ssn',
      'dob', 'date_of_birth', 'birth_date',
      'phone', 'phone_number', 'mobile_phone', 'home_phone',
      'email', 'email_address',
      'address', 'street_address', 'home_address',
      'first_name', 'last_name', 'full_name', 'patient_name',
      'mrn', 'medical_record_number',
      'insurance_id', 'policy_number', 'subscriber_id',
      'diagnosis', 'clinical_notes', 'prescription_data',
      'lab_results', 'vital_signs'
    ]);
  }

  /**
   * Main audit middleware function
   */
  auditLogger() {
    return async (req, res, next) => {
      // Skip audit for health check and public endpoints
      if (this.shouldSkipAudit(req.path)) {
        return next();
      }

      const startTime = Date.now();
      const requestId = uuidv4();
      
      // Add request ID to request context
      req.requestId = requestId;
      req.auditStartTime = startTime;

      // Extract user information
      const userId = this.extractUserId(req);
      const sessionId = this.extractSessionId(req);
      const ipAddress = this.getClientIp(req);
      const userAgent = req.get('User-Agent');

      // Determine if this request accesses PHI
      const phiAccessed = this.determinePhiAccess(req);
      const tableName = this.extractTableName(req.path);
      const recordId = this.extractRecordId(req);

      // Create audit context
      const auditContext = {
        userId,
        sessionId,
        ipAddress,
        userAgent,
        requestId,
        phiAccessed,
        tableName,
        recordId,
        endpoint: req.path,
        httpMethod: req.method,
        startTime
      };

      // Store audit context in request for use by other middleware/routes
      req.auditContext = auditContext;

      // Update session activity
      if (userId && sessionId) {
        await this.updateSessionActivity(userId, sessionId, phiAccessed);
      }

      // Override res.json to capture response data for PHI detection
      const originalJson = res.json;
      res.json = function(data) {
        req.responseData = data;
        return originalJson.call(this, data);
      };

      // Continue to next middleware
      next();
    };
  }

  /**
   * Response audit middleware - logs after request completion
   */
  responseAuditor() {
    return async (req, res, next) => {
      // Only proceed if we have audit context
      if (!req.auditContext) {
        return next();
      }

      res.on('finish', async () => {
        await this.logAuditEntry(req, res);
      });

      next();
    };
  }

  /**
   * Log the complete audit entry
   */
  async logAuditEntry(req, res) {
    try {
      const {
        userId,
        sessionId,
        ipAddress,
        userAgent,
        requestId,
        phiAccessed,
        tableName,
        recordId,
        endpoint,
        httpMethod,
        startTime
      } = req.auditContext;

      const executionTime = Date.now() - startTime;
      const success = res.statusCode < 400;
      const action = this.mapHttpMethodToAction(httpMethod);

      // Detect additional PHI in response
      const responsePhiFields = this.detectPhiInResponse(req.responseData);
      
      // Only set actualPhiAccessed to true if we have a tableName OR if phiAccessed was already true
      // This prevents constraint violations where phi_accessed=true but table_name=null
      let actualPhiAccessed = phiAccessed;
      let finalTableName = tableName;
      
      if (responsePhiFields.length > 0) {
        if (tableName) {
          // We have a table name, safe to mark PHI as accessed
          actualPhiAccessed = true;
        } else {
          // PHI detected but no table name - try to infer from endpoint
          const inferredTable = this.inferTableFromEndpoint(endpoint);
          if (inferredTable) {
            actualPhiAccessed = true;
            finalTableName = inferredTable;
          } else {
            // Cannot safely determine table - log warning but don't mark as PHI accessed
            console.warn(`[AUDIT WARNING] PHI detected in response but no table name could be determined for endpoint: ${endpoint}`);
          }
        }
      }

      // Create main audit log entry
      const auditQuery = `
        INSERT INTO audit_logs (
          user_id, action, table_name, record_id, phi_accessed,
          ip_address, user_agent, session_id, request_id, endpoint, http_method,
          execution_time_ms, success, error_message, additional_data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
        RETURNING id
      `;

      const errorMessage = success ? null : this.getErrorMessage(res.statusCode);
      const additionalData = {
        requestBody: this.sanitizeForLogging(req.body),
        queryParams: req.query,
        responseStatus: res.statusCode,
        responsePhiFields: responsePhiFields,
        userRole: req.user?.role || 'unknown'
      };

      const auditResult = await pool.query(auditQuery, [
        userId,
        action,
        finalTableName,
        recordId,
        actualPhiAccessed,
        ipAddress,
        userAgent,
        sessionId,
        requestId,
        endpoint,
        httpMethod,
        executionTime,
        success,
        errorMessage,
        JSON.stringify(additionalData)
      ]);

      const auditLogId = auditResult.rows[0].id;

      // Log PHI access details if PHI was accessed
      if (actualPhiAccessed && success) {
        await this.logPhiAccess(auditLogId, req, responsePhiFields, finalTableName);
      }

      // Check for anomalous behavior
      if (userId && sessionId) {
        await this.checkAnomalousActivity(userId, sessionId);
      }

    } catch (error) {
      console.error('[AUDIT ERROR] Failed to log audit entry:', error);
      // Don't throw - audit failure shouldn't break the application
    }
  }

  /**
   * Log detailed PHI access
   */
  async logPhiAccess(auditLogId, req, phiFields, tableNameOverride = null) {
    try {
      const { tableName, recordId } = req.auditContext;
      const finalTableName = tableNameOverride || tableName;
      const patientId = this.extractPatientId(req, req.responseData);
      const reason = this.extractAccessReason(req);

      for (const field of phiFields) {
        const phiQuery = `
          INSERT INTO phi_access_logs (
            audit_log_id, field_accessed, field_type, table_name, record_id,
            reason_for_access, business_justification, decrypted, patient_id,
            data_classification, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
        `;

        const fieldType = this.determineFieldType(field);
        const wasDecrypted = req.path.includes('/ssn') || field.includes('decrypted');
        const businessJustification = this.getBusinessJustification(req.path, req.method);

        await pool.query(phiQuery, [
          auditLogId,
          field,
          fieldType,
          finalTableName,
          recordId,
          reason,
          businessJustification,
          wasDecrypted,
          patientId,
          'PHI'
        ]);
      }
    } catch (error) {
      console.error('[AUDIT ERROR] Failed to log PHI access:', error);
    }
  }

  /**
   * Update user session activity and calculate anomaly scores
   */
  async updateSessionActivity(userId, sessionId, phiAccessed, failedAttempt = false) {
    try {
      await pool.query('SELECT update_session_activity($1, $2, $3, $4)', [
        userId,
        sessionId,
        phiAccessed,
        failedAttempt
      ]);
    } catch (error) {
      console.error('[AUDIT ERROR] Failed to update session activity:', error);
    }
  }

  /**
   * Check for anomalous activity patterns
   */
  async checkAnomalousActivity(userId, sessionId) {
    try {
      const result = await pool.query(`
        SELECT anomaly_score, flagged_suspicious, request_count, phi_access_count
        FROM user_sessions 
        WHERE user_id = $1 AND session_id = $2
      `, [userId, sessionId]);

      if (result.rows.length > 0) {
        const session = result.rows[0];
        
        // Alert on high anomaly scores
        if (session.flagged_suspicious) {
          console.warn(`[SECURITY ALERT] Suspicious activity detected for user ${userId}, session ${sessionId}`);
          console.warn(`Anomaly score: ${session.anomaly_score}, Requests: ${session.request_count}, PHI accesses: ${session.phi_access_count}`);
          
          // In production, you might want to:
          // - Send alerts to security team
          // - Temporarily restrict user access
          // - Require additional authentication
        }
      }
    } catch (error) {
      console.error('[AUDIT ERROR] Failed to check anomalous activity:', error);
    }
  }

  /**
   * Extract user ID from JWT token
   */
  extractUserId(req) {
    return req.user?.id || req.user?.userId || req.userId || null;
  }

  /**
   * Extract session ID from request
   */
  extractSessionId(req) {
    // Try multiple sources for session ID
    return req.sessionID || 
           req.session?.id || 
           req.get('X-Session-ID') ||
           req.cookies?.sessionId ||
           req.user?.sessionId ||
           null;
  }

  /**
   * Get client IP address considering proxies
   */
  getClientIp(req) {
    return req.ip ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           req.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
           req.get('X-Real-IP') ||
           '127.0.0.1';
  }

  /**
   * Determine if the request accesses PHI based on route patterns
   */
  determinePhiAccess(req) {
    const path = req.path.toLowerCase();
    
    // Check if path matches known PHI routes
    for (const phiRoute of this.phiRoutes) {
      if (path.includes(phiRoute.toLowerCase()) || path.startsWith(phiRoute.toLowerCase())) {
        return true;
      }
    }

    // Check request body for PHI fields
    if (req.body && typeof req.body === 'object') {
      for (const field of this.phiFields) {
        if (req.body.hasOwnProperty(field)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Detect PHI fields in response data
   */
  detectPhiInResponse(data) {
    const phiFieldsFound = [];
    
    if (!data || typeof data !== 'object') {
      return phiFieldsFound;
    }

    const checkObject = (obj, prefix = '') => {
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          checkObject(item, `${prefix}[${index}]`);
        });
      } else if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach(key => {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          
          // Check if this key is a PHI field
          if (this.phiFields.has(key.toLowerCase())) {
            phiFieldsFound.push(fullKey);
          }
          
          // Recursively check nested objects
          if (obj[key] && typeof obj[key] === 'object') {
            checkObject(obj[key], fullKey);
          }
        });
      }
    };

    checkObject(data);
    return phiFieldsFound;
  }

  /**
   * Extract table name from API path
   */
  extractTableName(path) {
    const pathSegments = path.split('/').filter(segment => segment.length > 0);
    
    if (pathSegments.length >= 2 && pathSegments[0] === 'api') {
      const resource = pathSegments[1];
      
      // Map API resource names to table names
      const resourceToTable = {
        'patients': 'patients',
        'encounters': 'encounters',
        'insurance': 'patient_insurance',
        'vitals': 'vitals',
        'clinical-notes': 'clinical_notes',
        'medical-history': 'medical_history',
        'family-history': 'family_history',
        'prescriptions': 'prescriptions',
        'lab-results': 'lab_results',
        'appointments': 'appointments',
        'orders': 'orders'
      };
      
      return resourceToTable[resource] || resource;
    }
    
    return null;
  }

  /**
   * Infer table name from endpoint when PHI is detected but extractTableName returns null
   */
  inferTableFromEndpoint(endpoint) {
    const path = endpoint.toLowerCase();
    
    // More flexible pattern matching for table inference
    if (path.includes('/patient')) return 'patients';
    if (path.includes('/encounter')) return 'encounters';
    if (path.includes('/insurance')) return 'patient_insurance';
    if (path.includes('/vital')) return 'vitals';
    if (path.includes('/clinical') || path.includes('/notes')) return 'clinical_notes';
    if (path.includes('/medical') || path.includes('/history')) return 'medical_history';
    if (path.includes('/family')) return 'family_history';
    if (path.includes('/prescription') || path.includes('/medication')) return 'prescriptions';
    if (path.includes('/lab')) return 'lab_results';
    if (path.includes('/appointment')) return 'appointments';
    if (path.includes('/order')) return 'orders';
    
    // Generic fallback - if it's a PHI endpoint, assume it's patient-related
    if (path.includes('/api/')) return 'patients';
    
    return null;
  }

  /**
   * Extract record ID from path parameters
   */
  extractRecordId(req) {
    // Try to extract ID from path parameters
    if (req.params && req.params.id) {
      const id = parseInt(req.params.id);
      return isNaN(id) ? null : id;
    }
    
    // Try to extract from other common parameter names
    const idParams = ['patientId', 'encounterId', 'insuranceId', 'recordId'];
    for (const param of idParams) {
      if (req.params && req.params[param]) {
        const id = parseInt(req.params[param]);
        if (!isNaN(id)) return id;
      }
    }
    
    return null;
  }

  /**
   * Extract patient ID for PHI correlation
   */
  extractPatientId(req, responseData) {
    // Try to get from request parameters
    if (req.params?.patientId) {
      const id = parseInt(req.params.patientId);
      return isNaN(id) ? null : id;
    }
    
    // Try to get from request body
    if (req.body?.patient_id) {
      const id = parseInt(req.body.patient_id);
      return isNaN(id) ? null : id;
    }
    
    // Try to get from response data
    if (responseData?.data?.patient_id) {
      const id = parseInt(responseData.data.patient_id);
      return isNaN(id) ? null : id;
    }
    
    return null;
  }

  /**
   * Map HTTP method to audit action
   */
  mapHttpMethodToAction(method) {
    const methodMap = {
      'GET': 'READ',
      'POST': 'CREATE',
      'PUT': 'UPDATE',
      'PATCH': 'UPDATE',
      'DELETE': 'DELETE'
    };
    
    return methodMap[method.toUpperCase()] || method.toUpperCase();
  }

  /**
   * Get business justification based on endpoint and method
   */
  getBusinessJustification(path, method) {
    const pathLower = path.toLowerCase();
    
    if (pathLower.includes('/patients')) {
      return method === 'GET' ? 'Patient information retrieval for clinical care' : 'Patient information update for medical treatment';
    }
    
    if (pathLower.includes('/encounters')) {
      return 'Clinical encounter documentation and care management';
    }
    
    if (pathLower.includes('/insurance')) {
      return 'Insurance verification and billing information management';
    }
    
    if (pathLower.includes('/ssn')) {
      return 'SSN access for insurance verification and billing purposes';
    }
    
    return 'Medical information access for patient care and treatment';
  }

  /**
   * Extract reason for PHI access from request context
   */
  extractAccessReason(req) {
    // Check for explicit reason in request body
    if (req.body?.purpose || req.body?.reason) {
      return req.body.purpose || req.body.reason;
    }
    
    // Default reason based on endpoint and method
    const path = req.path.toLowerCase();
    const method = req.method.toUpperCase();
    
    if (method === 'GET') {
      return `Data retrieval via ${path} for clinical care`;
    } else if (method === 'POST') {
      return `Data creation via ${path} for medical documentation`;
    } else if (method === 'PUT' || method === 'PATCH') {
      return `Data update via ${path} for medical record maintenance`;
    } else if (method === 'DELETE') {
      return `Data deletion via ${path} as authorized`;
    }
    
    return `PHI access via ${path} for authorized medical purposes`;
  }

  /**
   * Determine field type for PHI logging
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
   * Should skip audit for certain paths
   */
  shouldSkipAudit(path) {
    const skipPaths = [
      '/health',
      '/api/auth/login',
      '/api/auth/logout',
      '/favicon.ico',
      '/robots.txt'
    ];
    
    return skipPaths.some(skipPath => path.startsWith(skipPath));
  }

  /**
   * Sanitize request body for logging (remove sensitive data)
   */
  sanitizeForLogging(body) {
    if (!body || typeof body !== 'object') {
      return body;
    }
    
    const sensitiveFields = ['password', 'ssn', 'social_security_number', 'token', 'apiKey'];
    const sanitized = { ...body };
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }

  /**
   * Get error message based on status code
   */
  getErrorMessage(statusCode) {
    if (statusCode >= 200 && statusCode < 300) return null;
    
    const errorMessages = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      422: 'Unprocessable Entity',
      500: 'Internal Server Error'
    };
    
    return errorMessages[statusCode] || `HTTP Error ${statusCode}`;
  }
}

// Export singleton instance
const auditMiddleware = new AuditMiddleware();
export default auditMiddleware;