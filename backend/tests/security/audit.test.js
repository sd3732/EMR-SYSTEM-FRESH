// Audit Logging Security Tests
// Tests HIPAA-compliant audit trail functionality

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import auditService from '../../services/audit.service.js';
import pool from '../../db/index.js';

describe('Audit Logging', () => {
  let testUserId;
  let testPatientId;
  let testProviderId;

  beforeAll(async () => {
    // Create test entities
    const userResult = await pool.query(`
      INSERT INTO providers (first_name, last_name, email, specialty, npi) 
      VALUES ('Test', 'Provider', 'test@example.com', 'Internal Medicine', '1234567890')
      RETURNING id
    `);
    testUserId = userResult.rows[0].id;
    testProviderId = testUserId;

    const patientResult = await pool.query(`
      INSERT INTO patients (first_name, last_name, dob, gender) 
      VALUES ('Test', 'Patient', '1990-01-01', 'male')
      RETURNING id
    `);
    testPatientId = patientResult.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM phi_access_logs WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM patients WHERE id = $1', [testPatientId]);
    await pool.query('DELETE FROM providers WHERE id = $1', [testProviderId]);
  });

  beforeEach(async () => {
    // Clean audit logs before each test
    await pool.query('DELETE FROM phi_access_logs WHERE user_id = $1', [testUserId]);
  });

  test('logs PHI access with all required fields', async () => {
    const accessDetails = {
      userId: testUserId,
      resourceType: 'patients',
      resourceId: testPatientId,
      actionType: 'read',
      actionDescription: 'Viewed patient demographics',
      clinicalJustification: 'Routine care review'
    };

    await auditService.logPHIAccess(
      accessDetails.userId,
      accessDetails.resourceType,
      accessDetails.resourceId,
      accessDetails.actionType,
      accessDetails.actionDescription,
      accessDetails.clinicalJustification
    );

    const auditLog = await pool.query(`
      SELECT * FROM phi_access_logs 
      WHERE user_id = $1 AND patient_id = $2 
      ORDER BY created_at DESC LIMIT 1
    `, [testUserId, testPatientId]);

    expect(auditLog.rows).toHaveLength(1);
    const log = auditLog.rows[0];

    // Verify all required HIPAA audit fields
    expect(log.user_id).toBe(testUserId);
    expect(log.patient_id).toBe(testPatientId);
    expect(log.resource_type).toBe('patients');
    expect(log.action_type).toBe('read');
    expect(log.action_description).toBe('Viewed patient demographics');
    expect(log.clinical_justification).toBe('Routine care review');
    expect(log.created_at).toBeDefined();
    expect(log.session_id).toBeDefined();
    expect(log.ip_address).toBeDefined();
    expect(log.user_agent).toBeDefined();
  });

  test('captures user session information', async () => {
    const sessionInfo = {
      sessionId: 'test-session-123',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Browser'
    };

    await auditService.logPHIAccess(
      testUserId,
      'encounters',
      123,
      'create',
      'Created new encounter',
      'New patient visit',
      sessionInfo
    );

    const auditLog = await pool.query(`
      SELECT * FROM phi_access_logs 
      WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
    `, [testUserId]);

    const log = auditLog.rows[0];
    expect(log.session_id).toBe(sessionInfo.sessionId);
    expect(log.ip_address).toBe(sessionInfo.ipAddress);
    expect(log.user_agent).toBe(sessionInfo.userAgent);
  });

  test('triggers audit on patient table updates', async () => {
    // Update patient record
    await pool.query(`
      UPDATE patients 
      SET first_name = 'Updated', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [testPatientId]);

    // Check if audit trigger created log entry
    const auditLog = await pool.query(`
      SELECT * FROM phi_access_logs 
      WHERE patient_id = $1 AND action_type = 'update'
      ORDER BY created_at DESC LIMIT 1
    `, [testPatientId]);

    expect(auditLog.rows.length).toBeGreaterThan(0);
    const log = auditLog.rows[0];
    expect(log.resource_type).toBe('patients');
    expect(log.action_type).toBe('update');
  });

  test('generates compliant audit reports', async () => {
    // Create multiple audit entries
    const auditEntries = [
      { action: 'read', description: 'Viewed patient chart' },
      { action: 'update', description: 'Updated vitals' },
      { action: 'create', description: 'Added new prescription' },
      { action: 'delete', description: 'Removed old allergy' }
    ];

    for (const entry of auditEntries) {
      await auditService.logPHIAccess(
        testUserId,
        'patients',
        testPatientId,
        entry.action,
        entry.description,
        'Clinical care'
      );
    }

    // Generate audit report
    const report = await auditService.generateAuditReport({
      patientId: testPatientId,
      userId: testUserId,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      endDate: new Date()
    });

    expect(report).toHaveProperty('entries');
    expect(report.entries).toHaveLength(4);
    expect(report).toHaveProperty('summary');
    expect(report.summary.totalAccesses).toBe(4);
    expect(report.summary.uniqueUsers).toBe(1);
    expect(report.summary.patientId).toBe(testPatientId);

    // Verify report includes all required HIPAA fields
    report.entries.forEach(entry => {
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('userId');
      expect(entry).toHaveProperty('actionType');
      expect(entry).toHaveProperty('resourceAccessed');
      expect(entry).toHaveProperty('clinicalJustification');
    });
  });

  test('detects anomalous access patterns', async () => {
    // Simulate rapid access pattern (potential misuse)
    const rapidAccessCount = 20;
    for (let i = 0; i < rapidAccessCount; i++) {
      await auditService.logPHIAccess(
        testUserId,
        'patients',
        testPatientId,
        'read',
        `Rapid access ${i}`,
        'Testing pattern detection'
      );
    }

    // Check for anomaly detection
    const anomalies = await auditService.detectAnomalousAccess({
      userId: testUserId,
      timeWindow: 300, // 5 minutes
      threshold: 15 // More than 15 accesses in 5 minutes
    });

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toHaveProperty('userId', testUserId);
    expect(anomalies[0]).toHaveProperty('accessCount');
    expect(anomalies[0].accessCount).toBeGreaterThan(15);
    expect(anomalies[0]).toHaveProperty('severity', 'high');
  });

  test('maintains 6-year retention policy', async () => {
    // Create old audit entry (simulate)
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 7); // 7 years ago

    await pool.query(`
      INSERT INTO phi_access_logs (
        user_id, patient_id, resource_type, action_type, 
        action_description, clinical_justification, created_at
      ) VALUES ($1, $2, 'patients', 'read', 'Old access', 'Historical', $3)
    `, [testUserId, testPatientId, oldDate]);

    // Run retention policy cleanup
    const deletedCount = await auditService.enforceRetentionPolicy();

    expect(deletedCount).toBeGreaterThan(0);

    // Verify old record was deleted
    const oldRecords = await pool.query(`
      SELECT COUNT(*) FROM phi_access_logs 
      WHERE created_at < CURRENT_DATE - INTERVAL '6 years'
      AND user_id = $1
    `, [testUserId]);

    expect(parseInt(oldRecords.rows[0].count)).toBe(0);
  });

  test('logs high-risk actions with additional detail', async () => {
    const highRiskActions = [
      'bulk_export',
      'admin_access',
      'emergency_access',
      'print_records'
    ];

    for (const action of highRiskActions) {
      await auditService.logHighRiskAction(
        testUserId,
        action,
        testPatientId,
        `Performed ${action}`,
        'Emergency situation',
        { additionalContext: 'Test scenario' }
      );
    }

    const highRiskLogs = await pool.query(`
      SELECT * FROM phi_access_logs 
      WHERE user_id = $1 AND risk_level = 'high'
      ORDER BY created_at DESC
    `, [testUserId]);

    expect(highRiskLogs.rows).toHaveLength(4);
    
    highRiskLogs.rows.forEach(log => {
      expect(log.risk_level).toBe('high');
      expect(log.requires_review).toBe(true);
      expect(log.additional_context).toBeDefined();
    });
  });

  test('tracks failed access attempts', async () => {
    const failureReasons = [
      'insufficient_permissions',
      'invalid_session',
      'resource_not_found',
      'unauthorized_patient_access'
    ];

    for (const reason of failureReasons) {
      await auditService.logFailedAccess(
        testUserId,
        'patients',
        testPatientId,
        'read',
        reason,
        { attemptedAction: 'View sensitive data' }
      );
    }

    const failedAttempts = await pool.query(`
      SELECT * FROM phi_access_logs 
      WHERE user_id = $1 AND success = false
      ORDER BY created_at DESC
    `, [testUserId]);

    expect(failedAttempts.rows).toHaveLength(4);
    
    failedAttempts.rows.forEach(log => {
      expect(log.success).toBe(false);
      expect(log.failure_reason).toBeDefined();
      expect(failureReasons).toContain(log.failure_reason);
    });
  });

  test('audit logs are tamper-evident', async () => {
    await auditService.logPHIAccess(
      testUserId,
      'patients',
      testPatientId,
      'read',
      'Tamper test',
      'Testing integrity'
    );

    const originalLog = await pool.query(`
      SELECT * FROM phi_access_logs 
      WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
    `, [testUserId]);

    const originalHash = originalLog.rows[0].integrity_hash;
    expect(originalHash).toBeDefined();

    // Attempt to modify audit log (should be prevented)
    await expect(
      pool.query(`
        UPDATE phi_access_logs 
        SET action_description = 'Modified description'
        WHERE id = $1
      `, [originalLog.rows[0].id])
    ).rejects.toThrow(); // Should be prevented by trigger or constraint
  });

  test('performance benchmark for audit logging', async () => {
    const auditCount = 100;
    const startTime = Date.now();

    // Log multiple entries rapidly
    const promises = [];
    for (let i = 0; i < auditCount; i++) {
      promises.push(
        auditService.logPHIAccess(
          testUserId,
          'patients',
          testPatientId,
          'read',
          `Performance test ${i}`,
          'Load testing'
        )
      );
    }

    await Promise.all(promises);
    const endTime = Date.now();

    const totalTime = endTime - startTime;
    const avgTime = totalTime / auditCount;

    // Should complete each audit log in under 50ms
    expect(avgTime).toBeLessThan(50);

    // Verify all entries were created
    const logCount = await pool.query(`
      SELECT COUNT(*) FROM phi_access_logs 
      WHERE user_id = $1 AND action_description LIKE 'Performance test%'
    `, [testUserId]);

    expect(parseInt(logCount.rows[0].count)).toBe(auditCount);
  });

  test('audit log search and filtering', async () => {
    // Create diverse audit entries
    const testEntries = [
      { resource: 'patients', action: 'read', description: 'Demographics view' },
      { resource: 'encounters', action: 'create', description: 'New visit' },
      { resource: 'medications', action: 'update', description: 'Prescription change' },
      { resource: 'lab_results', action: 'read', description: 'Lab review' }
    ];

    for (const entry of testEntries) {
      await auditService.logPHIAccess(
        testUserId,
        entry.resource,
        testPatientId,
        entry.action,
        entry.description,
        'Testing search functionality'
      );
    }

    // Test filtering by resource type
    const patientLogs = await auditService.searchAuditLogs({
      userId: testUserId,
      resourceType: 'patients',
      startDate: new Date(Date.now() - 60000), // 1 minute ago
      endDate: new Date()
    });

    expect(patientLogs.length).toBe(1);
    expect(patientLogs[0].resource_type).toBe('patients');

    // Test filtering by action type
    const readLogs = await auditService.searchAuditLogs({
      userId: testUserId,
      actionType: 'read',
      startDate: new Date(Date.now() - 60000),
      endDate: new Date()
    });

    expect(readLogs.length).toBe(2); // Demographics view and Lab review
  });
});