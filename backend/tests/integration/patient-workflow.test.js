// Patient Workflow Integration Tests
// Tests complete patient care workflows including encounters, vitals, lab orders, and results

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../server.js';
import pool from '../../db/index.js';
import TestDataGenerator from '../fixtures/testDataGenerator.js';

describe('Patient Workflow Integration', () => {
  let testToken;
  let testPatient;
  let testProvider;
  let testEncounter;
  let dataGenerator;

  beforeAll(async () => {
    dataGenerator = new TestDataGenerator();
    
    // Create test provider
    const providerResult = await pool.query(`
      INSERT INTO providers (first_name, last_name, email, specialty, npi, role) 
      VALUES ('Workflow', 'Test', 'workflow@test.com', 'Internal Medicine', '9876543210', 'physician')
      RETURNING id
    `);
    testProvider = { id: providerResult.rows[0].id };

    // Generate test token
    testToken = jwt.sign(
      { id: testProvider.id, email: 'workflow@test.com', role: 'physician' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '15m' }
    );

    // Create test patient using data generator
    const patients = dataGenerator.generatePatients(1);
    const insertedPatients = await dataGenerator.insertTestPatients(patients);
    testPatient = insertedPatients[0];
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM lab_results WHERE patient_id = $1', [testPatient.id]);
    await pool.query('DELETE FROM lab_tests WHERE patient_id = $1', [testPatient.id]);
    await pool.query('DELETE FROM lab_orders WHERE patient_id = $1', [testPatient.id]);
    await pool.query('DELETE FROM vitals WHERE encounter_id IN (SELECT id FROM encounters WHERE patient_id = $1)', [testPatient.id]);
    await pool.query('DELETE FROM encounters WHERE patient_id = $1', [testPatient.id]);
    await pool.query('DELETE FROM patients WHERE id = $1', [testPatient.id]);
    await pool.query('DELETE FROM providers WHERE id = $1', [testProvider.id]);
    await pool.query('DELETE FROM phi_access_logs WHERE user_id = $1', [testProvider.id]);
  });

  beforeEach(async () => {
    // Clean audit logs before each test
    await pool.query('DELETE FROM phi_access_logs WHERE user_id = $1', [testProvider.id]);
  });

  test('complete patient registration workflow', async () => {
    // Test patient lookup
    const searchResponse = await request(app)
      .get(`/api/patients/search?term=${testPatient.lastName}`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(searchResponse.body.data).toBeInstanceOf(Array);
    const foundPatient = searchResponse.body.data.find(p => p.id === testPatient.id);
    expect(foundPatient).toBeDefined();
    expect(foundPatient.first_name).toBe(testPatient.firstName);

    // Test patient details retrieval
    const detailsResponse = await request(app)
      .get(`/api/patients/${testPatient.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(detailsResponse.body.data.id).toBe(testPatient.id);
    expect(detailsResponse.body.data.demographics).toBeDefined();
    expect(detailsResponse.body.data.insurance).toBeDefined();

    // Verify audit logging
    const auditLogs = await pool.query(`
      SELECT * FROM phi_access_logs 
      WHERE user_id = $1 AND patient_id = $2 
      ORDER BY created_at DESC
    `, [testProvider.id, testPatient.id]);

    expect(auditLogs.rows.length).toBeGreaterThan(0);
    expect(auditLogs.rows[0].action_type).toBe('read');
  });

  test('encounter creation and documentation workflow', async () => {
    // Create new encounter
    const encounterData = {
      patientId: testPatient.id,
      encounterType: 'office-visit',
      chiefComplaint: 'Annual physical examination',
      visitNotes: 'Patient presents for routine annual physical. No acute concerns.',
      assessmentAndPlan: '1. Continue current medications\n2. Routine labs ordered\n3. Return in 1 year'
    };

    const createResponse = await request(app)
      .post('/api/encounters')
      .set('Authorization', `Bearer ${testToken}`)
      .send(encounterData)
      .expect(201);

    testEncounter = createResponse.body.data;
    expect(testEncounter.id).toBeDefined();
    expect(testEncounter.patient_id).toBe(testPatient.id);

    // Retrieve encounter details
    const detailsResponse = await request(app)
      .get(`/api/encounters/${testEncounter.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(detailsResponse.body.data.chief_complaint).toBe(encounterData.chiefComplaint);
    expect(detailsResponse.body.data.status).toBe('active');

    // Update encounter notes
    const updateData = {
      visitNotes: 'Updated notes: Patient reports feeling well. Physical exam normal.',
      status: 'completed'
    };

    await request(app)
      .put(`/api/encounters/${testEncounter.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .send(updateData)
      .expect(200);

    // Verify update
    const updatedResponse = await request(app)
      .get(`/api/encounters/${testEncounter.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(updatedResponse.body.data.visit_notes).toBe(updateData.visitNotes);
    expect(updatedResponse.body.data.status).toBe('completed');
  });

  test('vital signs collection workflow', async () => {
    // Generate realistic vitals using data generator
    const vitalsData = dataGenerator.generateVitals(testEncounter.id, 45);

    // Record vital signs
    const createResponse = await request(app)
      .post('/api/vitals')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        encounterId: vitalsData.encounterId,
        height: vitalsData.height,
        weight: vitalsData.weight,
        temperature: vitalsData.temperature,
        heartRate: vitalsData.heartRate,
        systolicBp: vitalsData.systolicBp,
        diastolicBp: vitalsData.diastolicBp,
        respiratoryRate: vitalsData.respiratoryRate,
        oxygenSaturation: vitalsData.oxygenSaturation,
        painLevel: vitalsData.painLevel
      })
      .expect(201);

    const vitals = createResponse.body.data;
    expect(vitals.id).toBeDefined();
    expect(vitals.bmi).toBeDefined();
    expect(vitals.bmi).toBeGreaterThan(0);

    // Retrieve vitals for encounter
    const vitalsResponse = await request(app)
      .get(`/api/encounters/${testEncounter.id}/vitals`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(vitalsResponse.body.data).toBeInstanceOf(Array);
    expect(vitalsResponse.body.data[0].height_cm).toBe(vitalsData.height);

    // Test vital signs trending
    const trendResponse = await request(app)
      .get(`/api/patients/${testPatient.id}/vitals/trends?metric=weight&days=90`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(trendResponse.body.data).toHaveProperty('metric', 'weight');
    expect(trendResponse.body.data).toHaveProperty('dataPoints');
  });

  test('lab ordering and results workflow', async () => {
    // Create lab order using data generator
    const labOrders = dataGenerator.generateLabOrders(testPatient.id, testProvider.id, 1);
    const orderData = labOrders[0];
    orderData.encounterId = testEncounter.id;

    const orderResponse = await request(app)
      .post('/api/labs/orders')
      .set('Authorization', `Bearer ${testToken}`)
      .send(orderData)
      .expect(201);

    const labOrder = orderResponse.body.data;
    expect(labOrder.id).toBeDefined();
    expect(labOrder.status).toBe('pending');

    // Verify tests were created
    const testsResponse = await request(app)
      .get(`/api/labs/orders/${labOrder.id}/tests`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(testsResponse.body.data).toBeInstanceOf(Array);
    expect(testsResponse.body.data.length).toBe(orderData.tests.length);

    // Simulate result processing
    const results = dataGenerator.generateLabResults(labOrder.id, orderData.tests);
    
    for (const result of results) {
      await request(app)
        .post('/api/labs/results')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          testId: testsResponse.body.data[0].id,
          resultValue: result.resultValue,
          numericValue: result.numericValue,
          unit: result.unit,
          referenceRange: result.referenceRange,
          abnormalFlag: result.abnormalFlag,
          resultStatus: 'final'
        })
        .expect(201);
    }

    // Retrieve patient lab history
    const historyResponse = await request(app)
      .get(`/api/labs/patients/${testPatient.id}/history`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(historyResponse.body.data).toBeInstanceOf(Array);
    expect(historyResponse.body.data.length).toBeGreaterThan(0);

    // Test result trending
    const glucoseTest = orderData.tests.find(t => t.loincCode === '2951-2');
    if (glucoseTest) {
      const trendResponse = await request(app)
        .get(`/api/labs/patients/${testPatient.id}/trends/2951-2`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(trendResponse.body.data).toHaveProperty('loincCode', '2951-2');
      expect(trendResponse.body.data).toHaveProperty('results');
    }
  });

  test('critical value notification workflow', async () => {
    // Create lab order for glucose
    const criticalOrderData = {
      patientId: testPatient.id,
      encounterId: testEncounter.id,
      providerId: testProvider.id,
      clinicalIndication: 'Emergency glucose check',
      priority: 'stat',
      tests: [{
        loincCode: '2951-2',
        testName: 'Glucose',
        specimenType: 'serum'
      }]
    };

    const orderResponse = await request(app)
      .post('/api/labs/orders')
      .set('Authorization', `Bearer ${testToken}`)
      .send(criticalOrderData)
      .expect(201);

    const labOrder = orderResponse.body.data;

    // Get the test ID
    const testsResponse = await request(app)
      .get(`/api/labs/orders/${labOrder.id}/tests`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    const testId = testsResponse.body.data[0].id;

    // Submit critical glucose result (>400 mg/dL)
    const criticalResult = {
      testId: testId,
      resultValue: '450',
      numericValue: 450,
      unit: 'mg/dL',
      referenceRange: '70-100',
      abnormalFlag: 'H',
      resultStatus: 'final'
    };

    const resultResponse = await request(app)
      .post('/api/labs/results')
      .set('Authorization', `Bearer ${testToken}`)
      .send(criticalResult)
      .expect(201);

    // Check for critical value alerts
    const alertsResponse = await request(app)
      .get('/api/labs/results/critical')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(alertsResponse.body.data).toBeInstanceOf(Array);
    
    // Find our critical result
    const criticalAlert = alertsResponse.body.data.find(alert => 
      alert.patient_id === testPatient.id && 
      alert.numeric_value === 450
    );
    
    if (criticalAlert) {
      expect(criticalAlert.requires_acknowledgment).toBe(true);
      expect(criticalAlert.priority).toBe('critical');

      // Acknowledge the critical value
      await request(app)
        .post(`/api/labs/results/${criticalAlert.id}/acknowledge`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          acknowledgmentNotes: 'Provider notified, patient contacted for immediate follow-up'
        })
        .expect(200);
    }
  });

  test('medication safety workflow integration', async () => {
    // Get current medications for patient
    const medsResponse = await request(app)
      .get(`/api/patients/${testPatient.id}/medications`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    // Add a medication with potential interactions
    const medicationData = {
      patientId: testPatient.id,
      encounterId: testEncounter.id,
      medicationName: 'Warfarin',
      dosage: '5mg',
      frequency: 'daily',
      route: 'oral',
      indication: 'Atrial fibrillation',
      startDate: new Date().toISOString().split('T')[0]
    };

    const addMedResponse = await request(app)
      .post('/api/medications/prescribe')
      .set('Authorization', `Bearer ${testToken}`)
      .send(medicationData)
      .expect(201);

    expect(addMedResponse.body.data.id).toBeDefined();

    // Test drug interaction checking
    const interactionResponse = await request(app)
      .post('/api/medications/check-interactions')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        patientId: testPatient.id,
        newMedication: 'Aspirin'
      })
      .expect(200);

    expect(interactionResponse.body.data).toHaveProperty('interactions');
  });

  test('comprehensive audit trail verification', async () => {
    // Perform various patient activities
    await request(app)
      .get(`/api/patients/${testPatient.id}`)
      .set('Authorization', `Bearer ${testToken}`);

    await request(app)
      .get(`/api/encounters/${testEncounter.id}`)
      .set('Authorization', `Bearer ${testToken}`);

    await request(app)
      .get(`/api/labs/patients/${testPatient.id}/history`)
      .set('Authorization', `Bearer ${testToken}`);

    // Check comprehensive audit trail
    const auditResponse = await request(app)
      .get(`/api/audit/logs?patientId=${testPatient.id}&userId=${testProvider.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(auditResponse.body.data).toBeInstanceOf(Array);
    expect(auditResponse.body.data.length).toBeGreaterThan(0);

    // Verify audit entries contain required fields
    const auditEntries = auditResponse.body.data;
    auditEntries.forEach(entry => {
      expect(entry).toHaveProperty('user_id', testProvider.id);
      expect(entry).toHaveProperty('patient_id', testPatient.id);
      expect(entry).toHaveProperty('action_type');
      expect(entry).toHaveProperty('resource_type');
      expect(entry).toHaveProperty('created_at');
      expect(entry).toHaveProperty('session_id');
    });

    // Test audit report generation
    const reportResponse = await request(app)
      .post('/api/audit/reports/generate')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        patientId: testPatient.id,
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString()
      })
      .expect(200);

    expect(reportResponse.body.data).toHaveProperty('entries');
    expect(reportResponse.body.data).toHaveProperty('summary');
    expect(reportResponse.body.data.summary.patientId).toBe(testPatient.id);
  });

  test('patient data export workflow', async () => {
    // Test patient data export
    const exportResponse = await request(app)
      .get(`/api/patients/${testPatient.id}/export`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(exportResponse.body.data).toHaveProperty('patient');
    expect(exportResponse.body.data).toHaveProperty('encounters');
    expect(exportResponse.body.data).toHaveProperty('vitals');
    expect(exportResponse.body.data).toHaveProperty('labResults');

    // Verify patient data is complete
    const exportData = exportResponse.body.data;
    expect(exportData.patient.id).toBe(testPatient.id);
    expect(exportData.encounters).toBeInstanceOf(Array);
    expect(exportData.vitals).toBeInstanceOf(Array);
    expect(exportData.labResults).toBeInstanceOf(Array);

    // Verify sensitive data is not exposed
    expect(exportData.patient.ssn).toBeUndefined();
    expect(exportData.patient.insurance_member_id).toBeUndefined();
  });

  test('workflow performance benchmarks', async () => {
    const startTime = Date.now();

    // Simulate typical workflow operations
    await Promise.all([
      request(app)
        .get(`/api/patients/${testPatient.id}`)
        .set('Authorization', `Bearer ${testToken}`),
      request(app)
        .get(`/api/encounters/${testEncounter.id}`)
        .set('Authorization', `Bearer ${testToken}`),
      request(app)
        .get(`/api/patients/${testPatient.id}/vitals/latest`)
        .set('Authorization', `Bearer ${testToken}`),
      request(app)
        .get(`/api/labs/patients/${testPatient.id}/history`)
        .set('Authorization', `Bearer ${testToken}`)
    ]);

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Should complete all operations in under 2 seconds
    expect(totalTime).toBeLessThan(2000);
  });
});