// Jest Test Setup
// Global test configuration and setup for the EMR test suite

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost';
process.env.DB_PORT = process.env.TEST_DB_PORT || '5432';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'emr_test';
process.env.DB_USER = process.env.TEST_DB_USER || 'postgres';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'password';

// Increase timeout for database operations
jest.setTimeout(30000);

// Mock console methods in test environment to reduce noise
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress console output during tests unless testing console methods
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  // Restore console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global test utilities
global.testUtils = {
  // Helper to create test database connection
  async createTestConnection() {
    // Implementation would create isolated test DB connection
    return null;
  },
  
  // Helper to clean test data
  async cleanTestData() {
    // Implementation would clean up test data
    return null;
  },
  
  // Helper to generate test tokens
  generateTestToken(payload, secret = process.env.JWT_SECRET) {
    const jwt = await import('jsonwebtoken');
    return jwt.default.sign(payload, secret, { expiresIn: '15m' });
  }
};

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in test environment
});

export default {};