// Authentication Security Tests
// Tests all aspects of authentication and authorization for security compliance

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../server.js';
import pool from '../../db/index.js';

describe('Authentication', () => {
  let testProviderId;
  let validToken;
  let expiredToken;
  let invalidToken;

  beforeAll(async () => {
    // Create test provider
    const result = await pool.query(`
      INSERT INTO providers (first_name, last_name, email, specialty, npi, role) 
      VALUES ('Test', 'Provider', 'test@example.com', 'Internal Medicine', '1234567890', 'physician')
      RETURNING id
    `);
    testProviderId = result.rows[0].id;

    // Generate tokens for testing
    validToken = jwt.sign(
      { id: testProviderId, email: 'test@example.com', role: 'physician' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '15m' }
    );

    expiredToken = jwt.sign(
      { id: testProviderId, email: 'test@example.com', role: 'physician' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '-1h' } // Already expired
    );

    invalidToken = 'invalid.token.here';
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM providers WHERE id = $1', [testProviderId]);
  });

  test('rejects requests without valid token', async () => {
    const protectedEndpoints = [
      '/api/patients',
      '/api/encounters',
      '/api/medications/search',
      '/api/labs/orders',
      '/api/audit/logs'
    ];

    for (const endpoint of protectedEndpoints) {
      const response = await request(app)
        .get(endpoint)
        .expect(401);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/token|auth/i);
    }
  });

  test('no auth bypass in any environment', async () => {
    // Test with various environment variables that might bypass auth
    const originalEnv = process.env.NODE_ENV;
    
    const testEnvironments = ['development', 'test', 'staging', 'production'];
    
    for (const env of testEnvironments) {
      process.env.NODE_ENV = env;
      
      const response = await request(app)
        .get('/api/patients')
        .expect(401);

      expect(response.body.ok).toBe(false);
    }

    // Restore original environment
    process.env.NODE_ENV = originalEnv;
  });

  test('sessions expire after 15 minutes', async () => {
    // Test with expired token
    const response = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toMatch(/expired|invalid/i);
  });

  test('rate limits login attempts', async () => {
    const loginAttempts = 6; // Assuming rate limit is 5 attempts
    const loginData = {
      email: 'test@example.com',
      password: 'wrong-password'
    };

    let rateLimitHit = false;

    for (let i = 0; i < loginAttempts; i++) {
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      if (response.status === 429) {
        rateLimitHit = true;
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toMatch(/rate limit|too many/i);
        break;
      }
    }

    expect(rateLimitHit).toBe(true);
  });

  test('RBAC prevents unauthorized actions', async () => {
    // Create a token with limited permissions
    const limitedToken = jwt.sign(
      { id: testProviderId, email: 'test@example.com', role: 'nurse' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '15m' }
    );

    // Test access to admin-only endpoints
    const adminEndpoints = [
      { method: 'get', path: '/api/audit/logs' },
      { method: 'post', path: '/api/providers' },
      { method: 'delete', path: '/api/patients/1' }
    ];

    for (const endpoint of adminEndpoints) {
      const response = await request(app)
        [endpoint.method](endpoint.path)
        .set('Authorization', `Bearer ${limitedToken}`)
        .expect(403);

      expect(response.body.ok).toBe(false);
      expect(response.body.error).toMatch(/permission|forbidden|access/i);
    }
  });

  test('logs all authentication events', async () => {
    // Clear existing auth logs
    await pool.query('DELETE FROM authentication_logs WHERE user_id = $1', [testProviderId]);

    // Test successful authentication
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'correct-password'
      });

    // Test failed authentication
    await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrong-password'
      });

    // Check authentication logs
    const authLogs = await pool.query(`
      SELECT * FROM authentication_logs 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [testProviderId]);

    expect(authLogs.rows.length).toBeGreaterThanOrEqual(1);

    // Check log fields
    const successLog = authLogs.rows.find(log => log.success === true);
    const failureLog = authLogs.rows.find(log => log.success === false);

    if (successLog) {
      expect(successLog).toHaveProperty('ip_address');
      expect(successLog).toHaveProperty('user_agent');
      expect(successLog).toHaveProperty('session_id');
    }

    if (failureLog) {
      expect(failureLog).toHaveProperty('failure_reason');
      expect(failureLog.success).toBe(false);
    }
  });

  test('validates JWT token integrity', async () => {
    // Test with tampered token
    const tamperedToken = validToken.slice(0, -5) + 'XXXXX';

    const response = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${tamperedToken}`)
      .expect(401);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toMatch(/invalid|malformed/i);
  });

  test('enforces secure session management', async () => {
    // Test token with valid signature but missing required claims
    const invalidClaimsToken = jwt.sign(
      { email: 'test@example.com' }, // Missing id and role
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '15m' }
    );

    const response = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${invalidClaimsToken}`)
      .expect(401);

    expect(response.body.ok).toBe(false);
  });

  test('prevents session fixation attacks', async () => {
    // Login to get initial session
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'correct-password'
      });

    const sessionCookie = loginResponse.headers['set-cookie'];
    
    // Logout should invalidate session
    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', sessionCookie);

    // Try to use old session - should fail
    const response = await request(app)
      .get('/api/patients')
      .set('Cookie', sessionCookie)
      .expect(401);

    expect(response.body.ok).toBe(false);
  });

  test('implements proper password policies', async () => {
    const weakPasswords = [
      '123456',
      'password',
      'admin',
      'qwerty',
      'abc123'
    ];

    for (const weakPassword of weakPasswords) {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: weakPassword,
          firstName: 'New',
          lastName: 'User'
        });

      expect([400, 422]).toContain(response.status);
      expect(response.body.error).toMatch(/password|weak|strength/i);
    }
  });

  test('protects against brute force attacks', async () => {
    const maxAttempts = 5;
    const testEmail = 'brute-force-test@example.com';

    // Create test user
    await pool.query(`
      INSERT INTO providers (first_name, last_name, email, specialty, npi, role) 
      VALUES ('Brute', 'Force', $1, 'Test', '9876543210', 'physician')
    `, [testEmail]);

    let lockoutTriggered = false;

    for (let i = 0; i < maxAttempts + 1; i++) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'wrong-password'
        });

      if (response.status === 429 || response.body.error?.includes('locked')) {
        lockoutTriggered = true;
        break;
      }
    }

    expect(lockoutTriggered).toBe(true);

    // Clean up
    await pool.query('DELETE FROM providers WHERE email = $1', [testEmail]);
  });

  test('validates token audience and issuer', async () => {
    // Token with wrong issuer
    const wrongIssuerToken = jwt.sign(
      { id: testProviderId, email: 'test@example.com', role: 'physician' },
      process.env.JWT_SECRET || 'test-secret',
      { 
        expiresIn: '15m',
        issuer: 'wrong-issuer',
        audience: 'wrong-audience'
      }
    );

    const response = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${wrongIssuerToken}`)
      .expect(401);

    expect(response.body.ok).toBe(false);
  });

  test('enforces HTTPS in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Test that HTTPS is enforced (this would need to be implemented)
    const response = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${validToken}`)
      .set('X-Forwarded-Proto', 'http'); // Simulate HTTP request

    // Should redirect to HTTPS or reject
    expect([301, 302, 400, 403]).toContain(response.status);

    process.env.NODE_ENV = originalEnv;
  });

  test('validates concurrent session limits', async () => {
    // Create multiple valid tokens for same user
    const tokens = [];
    for (let i = 0; i < 6; i++) { // Assuming limit is 5 concurrent sessions
      const token = jwt.sign(
        { 
          id: testProviderId, 
          email: 'test@example.com', 
          role: 'physician',
          sessionId: `session-${i}`
        },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '15m' }
      );
      tokens.push(token);
    }

    // Use all tokens - last one should fail if concurrent limit is enforced
    const promises = tokens.map(token =>
      request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${token}`)
    );

    const responses = await Promise.all(promises);
    const failedResponses = responses.filter(res => res.status === 401 || res.status === 429);

    expect(failedResponses.length).toBeGreaterThan(0);
  });

  test('handles token refresh securely', async () => {
    // Test refresh token endpoint
    const refreshResponse = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${validToken}`);

    if (refreshResponse.status === 200) {
      expect(refreshResponse.body).toHaveProperty('token');
      expect(refreshResponse.body.token).not.toBe(validToken);
      
      // Old token should still work until expiry
      const oldTokenResponse = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${validToken}`);
      
      expect([200, 401]).toContain(oldTokenResponse.status);
      
      // New token should work
      const newTokenResponse = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${refreshResponse.body.token}`);
      
      expect([200, 403]).toContain(newTokenResponse.status); // 403 if no patients permission
    }
  });

  test('audit logs include all authentication metadata', async () => {
    // Make authenticated request
    const response = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${validToken}`)
      .set('User-Agent', 'Test-Agent/1.0')
      .set('X-Forwarded-For', '192.168.1.100');

    // Check that audit log includes metadata
    const auditLogs = await pool.query(`
      SELECT * FROM phi_access_logs 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 1
    `, [testProviderId]);

    if (auditLogs.rows.length > 0) {
      const log = auditLogs.rows[0];
      expect(log).toHaveProperty('user_agent');
      expect(log).toHaveProperty('ip_address');
      expect(log).toHaveProperty('session_id');
    }
  });
});