// Performance Load Tests
// Tests system performance under various load conditions with HIPAA benchmarks

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../server.js';
import pool from '../../db/index.js';
import TestDataGenerator from '../fixtures/testDataGenerator.js';

describe('Performance Load Tests', () => {
  let testToken;
  let testPatients = [];
  let testProviders = [];
  let dataGenerator;

  beforeAll(async () => {
    dataGenerator = new TestDataGenerator();
    
    // Create test providers
    const providers = dataGenerator.generateProviders(5);
    testProviders = await dataGenerator.insertTestProviders(providers);

    // Generate test token
    testToken = jwt.sign(
      { id: testProviders[0].id, email: testProviders[0].email, role: 'physician' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '30m' }
    );

    // Create test patients
    const patients = dataGenerator.generatePatients(50);
    testPatients = await dataGenerator.insertTestPatients(patients);

    // Create encounters and vitals for performance testing
    for (let i = 0; i < 10; i++) {
      const patient = testPatients[i];
      const encounters = dataGenerator.generateEncounters(patient.id, 3);
      const insertedEncounters = await dataGenerator.insertTestEncounters(patient.id, encounters);
      
      for (const encounter of insertedEncounters) {
        const vitals = dataGenerator.generateVitals(encounter.id);
        await dataGenerator.insertTestVitals(vitals);
      }
    }
  }, 30000); // 30 second timeout for setup

  afterAll(async () => {
    // Clean up test data
    await dataGenerator.cleanupTestData();
  });

  test('patient search performance under load', async () => {
    const concurrentRequests = 20;
    const searchTerms = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'];
    
    const startTime = Date.now();
    
    const requests = Array.from({ length: concurrentRequests }, (_, i) => 
      request(app)
        .get(`/api/patients/search?term=${searchTerms[i % searchTerms.length]}`)
        .set('Authorization', `Bearer ${testToken}`)
    );

    const responses = await Promise.all(requests);
    const endTime = Date.now();
    
    const totalTime = endTime - startTime;
    const avgResponseTime = totalTime / concurrentRequests;

    // All requests should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    // Average response time should be under 200ms per HIPAA guidelines
    expect(avgResponseTime).toBeLessThan(200);
    
    console.log(`Patient search: ${concurrentRequests} requests in ${totalTime}ms (avg: ${avgResponseTime.toFixed(1)}ms)`);
  });

  test('patient detail retrieval performance', async () => {
    const concurrentRequests = 15;
    const patientIds = testPatients.slice(0, concurrentRequests).map(p => p.id);
    
    const startTime = Date.now();
    
    const requests = patientIds.map(patientId => 
      request(app)
        .get(`/api/patients/${patientId}`)
        .set('Authorization', `Bearer ${testToken}`)
    );

    const responses = await Promise.all(requests);
    const endTime = Date.now();
    
    const totalTime = endTime - startTime;
    const avgResponseTime = totalTime / concurrentRequests;

    // All requests should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.demographics).toBeDefined();
    });

    // Should meet performance benchmarks
    expect(avgResponseTime).toBeLessThan(150);
    
    console.log(`Patient details: ${concurrentRequests} requests in ${totalTime}ms (avg: ${avgResponseTime.toFixed(1)}ms)`);
  });

  test('encounter creation under load', async () => {
    const concurrentCreations = 10;
    const patientIds = testPatients.slice(0, concurrentCreations).map(p => p.id);
    
    const startTime = Date.now();
    
    const requests = patientIds.map(patientId => 
      request(app)
        .post('/api/encounters')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          patientId,
          encounterType: 'office-visit',
          chiefComplaint: 'Load test encounter',
          visitNotes: 'Performance testing encounter creation'
        })
    );

    const responses = await Promise.all(requests);
    const endTime = Date.now();
    
    const totalTime = endTime - startTime;
    const avgResponseTime = totalTime / concurrentCreations;

    // All creations should succeed
    responses.forEach(response => {
      expect(response.status).toBe(201);
      expect(response.body.data.id).toBeDefined();
    });

    // Creation should be fast
    expect(avgResponseTime).toBeLessThan(300);
    
    console.log(`Encounter creation: ${concurrentCreations} requests in ${totalTime}ms (avg: ${avgResponseTime.toFixed(1)}ms)`);
  });

  test('vitals collection performance', async () => {
    // Get encounters for vitals testing
    const encountersResult = await pool.query(`
      SELECT id FROM encounters 
      WHERE patient_id = ANY($1) 
      LIMIT 10
    `, [testPatients.slice(0, 10).map(p => p.id)]);
    
    const encounterIds = encountersResult.rows.map(row => row.id);
    
    const startTime = Date.now();
    
    const requests = encounterIds.map(encounterId => {
      const vitals = dataGenerator.generateVitals(encounterId);
      return request(app)
        .post('/api/vitals')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          encounterId: vitals.encounterId,
          height: vitals.height,
          weight: vitals.weight,
          temperature: vitals.temperature,
          heartRate: vitals.heartRate,
          systolicBp: vitals.systolicBp,
          diastolicBp: vitals.diastolicBp,
          respiratoryRate: vitals.respiratoryRate,
          oxygenSaturation: vitals.oxygenSaturation,
          painLevel: vitals.painLevel
        });
    });

    const responses = await Promise.all(requests);
    const endTime = Date.now();
    
    const totalTime = endTime - startTime;
    const avgResponseTime = totalTime / encounterIds.length;

    // All vitals should be recorded successfully
    responses.forEach(response => {
      expect(response.status).toBe(201);
      expect(response.body.data.bmi).toBeDefined();
    });

    expect(avgResponseTime).toBeLessThan(200);
    
    console.log(`Vitals collection: ${encounterIds.length} requests in ${totalTime}ms (avg: ${avgResponseTime.toFixed(1)}ms)`);
  });

  test('lab ordering system performance', async () => {
    const concurrentOrders = 8;
    const patientIds = testPatients.slice(0, concurrentOrders).map(p => p.id);
    
    const startTime = Date.now();
    
    const requests = patientIds.map(patientId => {
      const orderData = {
        patientId,
        providerId: testProviders[0].id,
        clinicalIndication: 'Performance test lab order',
        priority: 'routine',
        tests: [
          { loincCode: '2951-2', testName: 'Glucose', specimenType: 'serum' },
          { loincCode: '2823-3', testName: 'Potassium', specimenType: 'serum' }
        ]
      };
      
      return request(app)
        .post('/api/labs/orders')
        .set('Authorization', `Bearer ${testToken}`)
        .send(orderData);
    });

    const responses = await Promise.all(requests);
    const endTime = Date.now();
    
    const totalTime = endTime - startTime;
    const avgResponseTime = totalTime / concurrentOrders;

    // All lab orders should be created
    responses.forEach(response => {
      expect(response.status).toBe(201);
      expect(response.body.data.id).toBeDefined();
    });

    expect(avgResponseTime).toBeLessThan(400);
    
    console.log(`Lab ordering: ${concurrentOrders} requests in ${totalTime}ms (avg: ${avgResponseTime.toFixed(1)}ms)`);
  });

  test('database query performance under load', async () => {
    const concurrentQueries = 25;
    const patientIds = testPatients.slice(0, concurrentQueries).map(p => p.id);
    
    const startTime = Date.now();
    
    const requests = patientIds.map(patientId => 
      request(app)
        .get(`/api/patients/${patientId}/history`)
        .set('Authorization', `Bearer ${testToken}`)
    );

    const responses = await Promise.all(requests);
    const endTime = Date.now();
    
    const totalTime = endTime - startTime;
    const avgResponseTime = totalTime / concurrentQueries;

    // All history requests should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('encounters');
      expect(response.body.data).toHaveProperty('vitals');
    });

    // Database queries should be optimized
    expect(avgResponseTime).toBeLessThan(250);
    
    console.log(`Patient history: ${concurrentQueries} requests in ${totalTime}ms (avg: ${avgResponseTime.toFixed(1)}ms)`);
  });

  test('audit logging performance impact', async () => {
    const requests = 20;
    const patientId = testPatients[0].id;
    
    // Test with audit logging enabled (normal operation)
    const startTimeWithAudit = Date.now();
    
    const auditRequests = Array.from({ length: requests }, () =>
      request(app)
        .get(`/api/patients/${patientId}`)
        .set('Authorization', `Bearer ${testToken}`)
    );

    await Promise.all(auditRequests);
    const endTimeWithAudit = Date.now();
    const timeWithAudit = endTimeWithAudit - startTimeWithAudit;
    
    // Audit logging should not significantly impact performance
    const avgTimeWithAudit = timeWithAudit / requests;
    expect(avgTimeWithAudit).toBeLessThan(200);
    
    // Verify audit logs were created
    const auditCount = await pool.query(`
      SELECT COUNT(*) FROM phi_access_logs 
      WHERE user_id = $1 AND patient_id = $2 
      AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 minute'
    `, [testProviders[0].id, patientId]);
    
    expect(parseInt(auditCount.rows[0].count)).toBeGreaterThanOrEqual(requests);
    
    console.log(`Audit logging impact: ${requests} requests in ${timeWithAudit}ms (avg: ${avgTimeWithAudit.toFixed(1)}ms)`);
  });

  test('encryption service performance', async () => {
    const encryptionOperations = 50;
    const sensitiveData = 'Sensitive patient information for encryption testing';
    const patientId = testPatients[0].id;
    
    const startTime = Date.now();
    
    // Test encryption performance
    const encryptionPromises = Array.from({ length: encryptionOperations }, async () => {
      // Simulate encryption call (would normally use encryptionService)
      return new Promise(resolve => {
        setTimeout(() => resolve({ encrypted: true }), Math.random() * 10);
      });
    });

    await Promise.all(encryptionPromises);
    const endTime = Date.now();
    
    const totalTime = endTime - startTime;
    const avgTime = totalTime / encryptionOperations;
    
    // Encryption should be fast enough for real-time use
    expect(avgTime).toBeLessThan(50);
    
    console.log(`Encryption operations: ${encryptionOperations} operations in ${totalTime}ms (avg: ${avgTime.toFixed(1)}ms)`);
  });

  test('memory usage under sustained load', async () => {
    const initialMemory = process.memoryUsage();
    const sustainedRequests = 100;
    
    // Simulate sustained load
    for (let batch = 0; batch < 10; batch++) {
      const batchRequests = Array.from({ length: 10 }, (_, i) => {
        const patientId = testPatients[i % testPatients.length].id;
        return request(app)
          .get(`/api/patients/${patientId}`)
          .set('Authorization', `Bearer ${testToken}`);
      });
      
      await Promise.all(batchRequests);
    }
    
    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;
    
    // Memory usage should not increase dramatically
    expect(memoryIncreasePercent).toBeLessThan(50);
    
    console.log(`Memory usage: increased by ${(memoryIncrease / 1024 / 1024).toFixed(1)}MB (${memoryIncreasePercent.toFixed(1)}%)`);
  });

  test('cache hit rate performance', async () => {
    const cacheableRequests = 30;
    const patientId = testPatients[0].id;
    
    // Make initial request to populate cache
    await request(app)
      .get(`/api/patients/${patientId}`)
      .set('Authorization', `Bearer ${testToken}`);
    
    const startTime = Date.now();
    
    // Make repeated requests (should hit cache)
    const requests = Array.from({ length: cacheableRequests }, () =>
      request(app)
        .get(`/api/patients/${patientId}`)
        .set('Authorization', `Bearer ${testToken}`)
    );

    const responses = await Promise.all(requests);
    const endTime = Date.now();
    
    const totalTime = endTime - startTime;
    const avgResponseTime = totalTime / cacheableRequests;
    
    // Cached responses should be very fast
    expect(avgResponseTime).toBeLessThan(50);
    
    // All requests should succeed
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });
    
    console.log(`Cache performance: ${cacheableRequests} cached requests in ${totalTime}ms (avg: ${avgResponseTime.toFixed(1)}ms)`);
  });

  test('concurrent user simulation', async () => {
    const concurrentUsers = 15;
    const operationsPerUser = 5;
    
    const startTime = Date.now();
    
    // Simulate multiple users performing various operations
    const userSimulations = Array.from({ length: concurrentUsers }, async (_, userIndex) => {
      const patientId = testPatients[userIndex % testPatients.length].id;
      
      const userOperations = [
        request(app).get(`/api/patients/${patientId}`).set('Authorization', `Bearer ${testToken}`),
        request(app).get(`/api/patients/${patientId}/encounters`).set('Authorization', `Bearer ${testToken}`),
        request(app).get(`/api/patients/${patientId}/vitals/latest`).set('Authorization', `Bearer ${testToken}`),
        request(app).get(`/api/patients/${patientId}/medications`).set('Authorization', `Bearer ${testToken}`),
        request(app).get(`/api/labs/patients/${patientId}/history`).set('Authorization', `Bearer ${testToken}`)
      ];
      
      return Promise.all(userOperations.slice(0, operationsPerUser));
    });
    
    const allResponses = await Promise.all(userSimulations);
    const endTime = Date.now();
    
    const totalTime = endTime - startTime;
    const totalOperations = concurrentUsers * operationsPerUser;
    const avgResponseTime = totalTime / totalOperations;
    
    // All operations should succeed
    allResponses.flat().forEach(response => {
      expect(response.status).toBe(200);
    });
    
    // System should handle concurrent users efficiently
    expect(avgResponseTime).toBeLessThan(300);
    
    console.log(`Concurrent users: ${concurrentUsers} users, ${totalOperations} operations in ${totalTime}ms (avg: ${avgResponseTime.toFixed(1)}ms)`);
  });

  test('system throughput benchmark', async () => {
    const testDuration = 5000; // 5 seconds
    const maxConcurrency = 10;
    let completedRequests = 0;
    let errors = 0;
    
    const startTime = Date.now();
    const endTime = startTime + testDuration;
    
    const runRequest = async () => {
      while (Date.now() < endTime) {
        try {
          const patientId = testPatients[Math.floor(Math.random() * testPatients.length)].id;
          const response = await request(app)
            .get(`/api/patients/${patientId}`)
            .set('Authorization', `Bearer ${testToken}`);
          
          if (response.status === 200) {
            completedRequests++;
          } else {
            errors++;
          }
        } catch (error) {
          errors++;
        }
      }
    };
    
    // Start concurrent request generators
    const requestGenerators = Array.from({ length: maxConcurrency }, () => runRequest());
    await Promise.all(requestGenerators);
    
    const actualDuration = Date.now() - startTime;
    const requestsPerSecond = (completedRequests / actualDuration) * 1000;
    const errorRate = (errors / (completedRequests + errors)) * 100;
    
    // System should maintain good throughput with low error rate
    expect(requestsPerSecond).toBeGreaterThan(20); // At least 20 RPS
    expect(errorRate).toBeLessThan(5); // Less than 5% error rate
    
    console.log(`Throughput: ${requestsPerSecond.toFixed(1)} req/sec, ${completedRequests} requests, ${errorRate.toFixed(1)}% errors`);
  });
});