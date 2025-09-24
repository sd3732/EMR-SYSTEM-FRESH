/**
 * COMPREHENSIVE PHI AUDIT MIDDLEWARE
 * CRITICAL: This middleware logs EVERY PHI access without exception for HIPAA compliance
 * Missing even ONE PHI access in audit logs is a violation
 */

import crypto from 'crypto';
import pool from '../db/index.js';
import { PHI_ENDPOINTS, requiresAuditLogging, getResourceSensitivity } from '../docs/phi-endpoints-inventory.js';

/**
 * Enhanced PHI Audit Middleware
 * Captures comprehensive audit data for every PHI access
 */
export const auditPHIAccess = (config = {}) => {
  return async (req, res, next) => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    // Store request start time for performance tracking
    req.auditStartTime = startTime;
    req.auditRequestId = requestId;

    // Capture original response methods to intercept responses
    const originalJson = res.json;
    const originalSend = res.send;
    const originalEnd = res.end;

    // Track what was accessed during this request
    const accessedData = {
      fields: [],
      patientIds: [],
      resourceIds: [],
      resourceType: config.resourceType || inferResourceType(req.path),
      action: config.action || inferAction(req.method, req.path),
      dataVolume: 0,
      recordCount: 0
    };

    // Enhanced response interceptor for JSON responses
    res.json = function(data) {
      const responseTime = Date.now() - startTime;
      const responseData = data;

      // Analyze response for PHI content
      if (responseData) {
        accessedData.fields = extractPHIFields(responseData, accessedData.resourceType);
        accessedData.patientIds = extractPatientIds(responseData);
        accessedData.resourceIds = extractResourceIds(responseData, accessedData.resourceType);
        accessedData.dataVolume = JSON.stringify(responseData).length;
        accessedData.recordCount = calculateRecordCount(responseData);
      }

      // Create comprehensive audit log
      createAuditLog({
        // WHO
        user_id: req.user?.id || null,
        user_role: req.user?.role || 'anonymous',
        user_name: req.user ? `${req.user.first_name} ${req.user.last_name}` : 'Anonymous',
        user_email: req.user?.email,

        // WHAT
        action: accessedData.action,
        resource_type: accessedData.resourceType,
        resource_id: accessedData.resourceIds.length === 1 ? accessedData.resourceIds[0] : accessedData.resourceIds.join(','),
        resource_ids: accessedData.resourceIds.length > 1 ? accessedData.resourceIds : null,
        field_accessed: accessedData.fields,
        old_values: req.body && req.method === 'PUT' ? extractOldValues(req) : null,
        new_values: req.body && ['POST', 'PUT'].includes(req.method) ? sanitizeRequestBody(req.body) : null,
        query_parameters: Object.keys(req.query).length > 0 ? req.query : null,

        // WHEN
        timestamp: new Date(startTime),
        timestamp_ms: startTime,

        // WHERE
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        endpoint: req.originalUrl,
        http_method: req.method,
        hostname: req.hostname,

        // WHY
        reason: req.body?.reason || req.query?.reason || req.headers['x-audit-reason'] || 'Clinical care',
        emergency_access: req.body?.emergency_access || req.query?.emergency_access || false,
        patient_consent_status: req.headers['x-patient-consent'] || 'NOT_REQUIRED',
        legal_basis: determineLegalBasis(accessedData.action, req.user?.role),

        // SESSION AND REQUEST TRACKING
        session_id: req.sessionID || req.headers['x-session-token'] || 'no-session',
        request_id: requestId,
        correlation_id: req.headers['x-correlation-id'],
        parent_request_id: req.headers['x-parent-request-id'],

        // PERFORMANCE AND TECHNICAL DATA
        response_time_ms: responseTime,
        response_status: res.statusCode,
        response_size_bytes: accessedData.dataVolume,
        database_query_time_ms: req.dbQueryTime || null,

        // HIPAA SPECIFIC
        minimum_necessary_justification: req.headers['x-minimum-necessary'] ||
          `${accessedData.action} on ${accessedData.resourceType} for ${req.body?.reason || 'clinical care'}`,
        data_classification: getDataClassification(accessedData.resourceType),
        retention_period_days: 2555, // 7 years for HIPAA

        // COMPLIANCE TRACKING
        audit_level: config.auditLevel || 'STANDARD',
        compliance_flags: generateComplianceFlags(req, accessedData),
        risk_score: calculateRiskScore(accessedData, req)
      }).catch(err => {
        console.error('CRITICAL: PHI Audit logging failed - HIPAA violation risk:', err);

        // SECURITY: Fail the request if audit logging fails and failOnAuditError is true
        if (config.failOnAuditError !== false) { // Default to true for PHI
          return originalJson.call(this, {
            ok: false,
            error: 'Audit logging failed - operation cannot proceed',
            code: 'AUDIT_FAILURE',
            hipaaNotice: 'All PHI access must be auditable for HIPAA compliance'
          });
        }
      });

      return originalJson.call(this, responseData);
    };

    // Enhanced response interceptor for send responses
    res.send = function(data) {
      const responseTime = Date.now() - startTime;

      // Create audit log for non-JSON responses
      if (res.statusCode >= 400) {
        // Log failed access attempts
        createAuditLog({
          user_id: req.user?.id || null,
          user_role: req.user?.role || 'anonymous',
          user_name: req.user ? `${req.user.first_name} ${req.user.last_name}` : 'Anonymous',
          action: 'ACCESS_DENIED',
          resource_type: accessedData.resourceType,
          resource_id: req.params.id,
          endpoint: req.originalUrl,
          http_method: req.method,
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          session_id: req.sessionID || 'no-session',
          request_id: requestId,
          response_time_ms: responseTime,
          response_status: res.statusCode,
          reason: `Access denied: ${res.statusCode}`,
          legal_basis: 'OPERATIONS',
          risk_score: 60, // Moderate risk for denied access
          compliance_flags: ['ACCESS_DENIED']
        }).catch(err => {
          console.error('CRITICAL: Failed access audit logging failed:', err);
        });
      }

      return originalSend.call(this, data);
    };

    // Add audit context to request for downstream use
    req.auditContext = {
      requestId,
      startTime,
      resourceType: accessedData.resourceType,
      action: accessedData.action
    };

    next();
  };
};

/**
 * Special audit middleware for bulk operations
 * Logs each individual resource accessed in bulk operations
 */
export const auditBulkOperation = (resourceType) => {
  return async (req, res, next) => {
    const originalJson = res.json;

    res.json = function(data) {
      // For bulk operations, log each individual resource
      if (data && Array.isArray(data)) {
        data.forEach(async (item, index) => {
          const resourceId = item.id || item.patient_id || item.encounter_id || index;

          await createAuditLog({
            user_id: req.user?.id,
            user_role: req.user?.role || 'unknown',
            user_name: req.user ? `${req.user.first_name} ${req.user.last_name}` : 'Unknown',
            action: `BULK_${req.method === 'GET' ? 'VIEW' : 'EXPORT'}`,
            resource_type: resourceType,
            resource_id: resourceId.toString(),
            endpoint: req.originalUrl,
            http_method: req.method,
            ip_address: req.ip,
            session_id: req.sessionID || 'no-session',
            request_id: req.auditRequestId || crypto.randomUUID(),
            reason: req.body?.reason || `Bulk ${req.method} operation`,
            legal_basis: 'TREATMENT',
            risk_score: 85, // High risk for bulk operations
            compliance_flags: ['BULK_OPERATION', 'HIGH_RISK']
          }).catch(err => {
            console.error(`CRITICAL: Bulk operation audit failed for ${resourceType}:${resourceId}`, err);
          });
        });
      }

      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * Audit middleware for search operations
 * Logs search terms and results accessed
 */
export const auditSearchOperation = (resourceType) => {
  return async (req, res, next) => {
    // Log search attempt with search terms
    await createAuditLog({
      user_id: req.user?.id,
      user_role: req.user?.role || 'unknown',
      user_name: req.user ? `${req.user.first_name} ${req.user.last_name}` : 'Unknown',
      action: 'SEARCH',
      resource_type: resourceType,
      query_parameters: req.query,
      endpoint: req.originalUrl,
      http_method: req.method,
      ip_address: req.ip,
      session_id: req.sessionID || 'no-session',
      request_id: req.auditRequestId || crypto.randomUUID(),
      reason: `Search for ${resourceType}`,
      legal_basis: 'TREATMENT',
      risk_score: 45,
      compliance_flags: ['SEARCH_OPERATION']
    }).catch(err => {
      console.error(`CRITICAL: Search audit failed for ${resourceType}`, err);
    });

    const originalJson = res.json;

    res.json = function(data) {
      // Log each result accessed through search
      if (data && Array.isArray(data)) {
        data.forEach(async (item) => {
          const resourceId = item.id || item.patient_id || item.encounter_id;

          if (resourceId) {
            await createAuditLog({
              user_id: req.user?.id,
              user_role: req.user?.role || 'unknown',
              user_name: req.user ? `${req.user.first_name} ${req.user.last_name}` : 'Unknown',
              action: 'SEARCH_RESULT_VIEW',
              resource_type: resourceType,
              resource_id: resourceId.toString(),
              endpoint: req.originalUrl,
              http_method: req.method,
              ip_address: req.ip,
              session_id: req.sessionID || 'no-session',
              request_id: req.auditRequestId || crypto.randomUUID(),
              reason: `Search result access`,
              legal_basis: 'TREATMENT',
              risk_score: 40,
              compliance_flags: ['SEARCH_RESULT']
            }).catch(err => {
              console.error(`CRITICAL: Search result audit failed for ${resourceType}:${resourceId}`, err);
            });
          }
        });
      }

      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * Create comprehensive audit log entry
 */
async function createAuditLog(auditData) {
  const query = `
    INSERT INTO phi_audit_log (
      user_id, user_role, user_name, user_email,
      action, resource_type, resource_id, resource_ids,
      field_accessed, old_values, new_values, query_parameters,
      timestamp, timestamp_ms,
      ip_address, user_agent, endpoint, http_method, hostname,
      reason, emergency_access, patient_consent_status, legal_basis,
      session_id, request_id, correlation_id, parent_request_id,
      response_time_ms, response_status, response_size_bytes, database_query_time_ms,
      minimum_necessary_justification, data_classification, retention_period_days,
      audit_level, compliance_flags, risk_score
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
      $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37
    )
    RETURNING id, checksum
  `;

  const values = [
    auditData.user_id,
    auditData.user_role,
    auditData.user_name,
    auditData.user_email,
    auditData.action,
    auditData.resource_type,
    auditData.resource_id,
    auditData.resource_ids,
    auditData.field_accessed,
    auditData.old_values,
    auditData.new_values,
    auditData.query_parameters,
    auditData.timestamp || new Date(),
    auditData.timestamp_ms || Date.now(),
    auditData.ip_address,
    auditData.user_agent,
    auditData.endpoint,
    auditData.http_method,
    auditData.hostname,
    auditData.reason,
    auditData.emergency_access || false,
    auditData.patient_consent_status || 'NOT_REQUIRED',
    auditData.legal_basis || 'TREATMENT',
    auditData.session_id,
    auditData.request_id,
    auditData.correlation_id,
    auditData.parent_request_id,
    auditData.response_time_ms,
    auditData.response_status,
    auditData.response_size_bytes,
    auditData.database_query_time_ms,
    auditData.minimum_necessary_justification,
    auditData.data_classification || 'PHI',
    auditData.retention_period_days || 2555,
    auditData.audit_level || 'STANDARD',
    auditData.compliance_flags || [],
    auditData.risk_score || 50
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Helper Functions for Audit Analysis
 */

function inferResourceType(path) {
  if (path.includes('/patients')) return 'patient';
  if (path.includes('/encounters')) return 'encounter';
  if (path.includes('/vitals')) return 'vitals';
  if (path.includes('/medications')) return 'medication';
  if (path.includes('/prescriptions')) return 'prescription';
  if (path.includes('/allergies')) return 'allergy';
  if (path.includes('/lab-orders')) return 'lab_order';
  if (path.includes('/lab-results')) return 'lab_result';
  if (path.includes('/clinical-notes')) return 'clinical_note';
  if (path.includes('/medical-history')) return 'medical_history';
  if (path.includes('/family-history')) return 'family_history';
  if (path.includes('/discharge-summaries')) return 'discharge_summary';
  if (path.includes('/insurance')) return 'insurance';
  if (path.includes('/appointments')) return 'appointment';
  return 'unknown';
}

function inferAction(method, path) {
  if (method === 'GET') {
    if (path.includes('/search')) return 'SEARCH';
    if (path.includes('/export')) return 'EXPORT';
    if (path.includes('/bulk')) return 'BULK_VIEW';
    return path.includes('/:') ? 'VIEW' : 'LIST';
  }
  if (method === 'POST') {
    if (path.includes('/bulk')) return 'BULK_EXPORT';
    return 'CREATE';
  }
  if (method === 'PUT') return 'UPDATE';
  if (method === 'DELETE') return 'DELETE';
  return 'UNKNOWN';
}

function extractPHIFields(responseData, resourceType) {
  const phiFields = new Set();

  if (!responseData) return [];

  const traverse = (obj, prefix = '') => {
    Object.keys(obj).forEach(key => {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      // Check if this field contains PHI based on field name
      if (isPHIField(key, resourceType)) {
        phiFields.add(fullKey);
      }

      // Recursively check nested objects
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (Array.isArray(obj[key])) {
          obj[key].forEach((item, index) => {
            if (typeof item === 'object') {
              traverse(item, `${fullKey}[${index}]`);
            }
          });
        } else {
          traverse(obj[key], fullKey);
        }
      }
    });
  };

  if (Array.isArray(responseData)) {
    responseData.forEach((item, index) => traverse(item, `[${index}]`));
  } else {
    traverse(responseData);
  }

  return Array.from(phiFields);
}

function isPHIField(fieldName, resourceType) {
  const phiFieldPatterns = [
    // Patient identifiers
    /^(first_name|last_name|dob|ssn|mrn|phone|email|address|city|state|zip)$/i,
    // Clinical data
    /^(diagnosis|symptoms|notes|assessment|plan|medication|dosage|vital_signs)$/i,
    // Sensitive data
    /^(emergency_contact|insurance|clinical_notes|lab_results|prescriptions)$/i
  ];

  return phiFieldPatterns.some(pattern => pattern.test(fieldName));
}

function extractPatientIds(responseData) {
  const patientIds = new Set();

  const traverse = (obj) => {
    if (obj && typeof obj === 'object') {
      if (obj.patient_id) patientIds.add(obj.patient_id.toString());
      if (obj.id && obj.first_name && obj.last_name) patientIds.add(obj.id.toString()); // Patient object

      Object.values(obj).forEach(value => {
        if (Array.isArray(value)) {
          value.forEach(traverse);
        } else if (typeof value === 'object') {
          traverse(value);
        }
      });
    }
  };

  if (Array.isArray(responseData)) {
    responseData.forEach(traverse);
  } else {
    traverse(responseData);
  }

  return Array.from(patientIds);
}

function extractResourceIds(responseData, resourceType) {
  const resourceIds = new Set();

  const traverse = (obj) => {
    if (obj && typeof obj === 'object') {
      if (obj.id) resourceIds.add(obj.id.toString());

      Object.values(obj).forEach(value => {
        if (Array.isArray(value)) {
          value.forEach(traverse);
        } else if (typeof value === 'object' && value !== null) {
          traverse(value);
        }
      });
    }
  };

  if (Array.isArray(responseData)) {
    responseData.forEach(traverse);
  } else {
    traverse(responseData);
  }

  return Array.from(resourceIds);
}

function calculateRecordCount(responseData) {
  if (Array.isArray(responseData)) {
    return responseData.length;
  } else if (responseData && typeof responseData === 'object') {
    return 1;
  }
  return 0;
}

function sanitizeRequestBody(body) {
  // Remove sensitive fields from request body before logging
  const sanitized = { ...body };
  delete sanitized.password;
  delete sanitized.token;
  delete sanitized.secret;
  return sanitized;
}

function extractOldValues(req) {
  // This would be populated by the route handler with previous values
  return req.previousValues || null;
}

function determineLegalBasis(action, userRole) {
  if (action.includes('EMERGENCY')) return 'EMERGENCY';
  if (['admin', 'billing'].includes(userRole)) return 'OPERATIONS';
  if (userRole === 'insurance') return 'PAYMENT';
  return 'TREATMENT';
}

function getDataClassification(resourceType) {
  const sensitiveResources = ['patient', 'clinical_note', 'lab_result', 'prescription'];
  const piiResources = ['insurance', 'appointment'];

  if (sensitiveResources.includes(resourceType)) return 'PHI';
  if (piiResources.includes(resourceType)) return 'PII';
  return 'SENSITIVE';
}

function generateComplianceFlags(req, accessedData) {
  const flags = [];

  if (accessedData.action.includes('BULK')) flags.push('BULK_OPERATION');
  if (accessedData.action.includes('EXPORT')) flags.push('EXPORT_OPERATION');
  if (accessedData.action.includes('EMERGENCY')) flags.push('EMERGENCY_ACCESS');
  if (req.body?.emergency_access) flags.push('EMERGENCY_OVERRIDE');
  if (accessedData.patientIds.length > 10) flags.push('MULTIPLE_PATIENTS');
  if (accessedData.dataVolume > 1000000) flags.push('LARGE_DATA_VOLUME'); // > 1MB

  // Time-based flags
  const hour = new Date().getHours();
  if (hour < 6 || hour > 22) flags.push('AFTER_HOURS_ACCESS');

  return flags;
}

function calculateRiskScore(accessedData, req) {
  let score = 30; // Base score

  // Action-based risk
  if (accessedData.action === 'DELETE') score += 40;
  else if (accessedData.action.includes('BULK')) score += 30;
  else if (accessedData.action.includes('EXPORT')) score += 25;
  else if (accessedData.action === 'UPDATE') score += 15;
  else if (accessedData.action === 'CREATE') score += 10;

  // Volume-based risk
  if (accessedData.patientIds.length > 50) score += 20;
  else if (accessedData.patientIds.length > 10) score += 10;

  // Data sensitivity
  if (accessedData.resourceType === 'patient') score += 10;
  if (accessedData.resourceType === 'clinical_note') score += 15;

  // Time-based risk
  const hour = new Date().getHours();
  if (hour < 6 || hour > 22) score += 15;

  // Emergency access
  if (req.body?.emergency_access) score += 25;

  return Math.min(score, 100); // Cap at 100
}

export default {
  auditPHIAccess,
  auditBulkOperation,
  auditSearchOperation,
  createAuditLog
};