// Encryption Service Security Tests
// Tests all aspects of PHI encryption for HIPAA compliance

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import encryptionService from '../../services/encryption.service.js';
import pool from '../../db/index.js';

describe('Encryption Service', () => {
  let testPatientId;
  let originalData;

  beforeAll(async () => {
    // Create a test patient for encryption testing
    const result = await pool.query(`
      INSERT INTO patients (first_name, last_name, dob, gender) 
      VALUES ('Test', 'Patient', '1990-01-01', 'male')
      RETURNING id
    `);
    testPatientId = result.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testPatientId) {
      await pool.query('DELETE FROM patients WHERE id = $1', [testPatientId]);
    }
  });

  beforeEach(() => {
    originalData = {
      ssn: '123-45-6789',
      sensitive_note: 'Patient has HIV diagnosis',
      phone: '555-123-4567'
    };
  });

  test('encrypts and decrypts strings correctly', async () => {
    const testString = 'Sensitive medical information';
    
    const encrypted = await encryptionService.encryptSensitiveData(testString, testPatientId);
    expect(encrypted).toHaveProperty('encryptedData');
    expect(encrypted).toHaveProperty('keyId');
    expect(encrypted.encryptedData).not.toBe(testString);
    expect(encrypted.encryptedData).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64 pattern
    
    const decrypted = await encryptionService.decryptSensitiveData(
      encrypted.encryptedData, 
      encrypted.keyId
    );
    expect(decrypted).toBe(testString);
  });

  test('encrypts and decrypts JSON objects', async () => {
    const testObject = {
      ssn: '987-65-4321',
      medicalHistory: ['diabetes', 'hypertension'],
      insuranceId: 'INS123456'
    };
    
    const encrypted = await encryptionService.encryptSensitiveData(
      JSON.stringify(testObject), 
      testPatientId
    );
    expect(encrypted.encryptedData).not.toContain('987-65-4321');
    
    const decrypted = await encryptionService.decryptSensitiveData(
      encrypted.encryptedData,
      encrypted.keyId
    );
    const decryptedObject = JSON.parse(decrypted);
    expect(decryptedObject).toEqual(testObject);
  });

  test('handles special characters in SSN', async () => {
    const ssnVariations = [
      '123-45-6789',
      '123456789',
      '123 45 6789',
      '123.45.6789'
    ];
    
    for (const ssn of ssnVariations) {
      const encrypted = await encryptionService.encryptSensitiveData(ssn, testPatientId);
      const decrypted = await encryptionService.decryptSensitiveData(
        encrypted.encryptedData,
        encrypted.keyId
      );
      expect(decrypted).toBe(ssn);
    }
  });

  test('detects tampering with encrypted data', async () => {
    const testData = 'Critical patient information';
    const encrypted = await encryptionService.encryptSensitiveData(testData, testPatientId);
    
    // Tamper with the encrypted data
    const tamperedData = encrypted.encryptedData.slice(0, -1) + 'X';
    
    await expect(
      encryptionService.decryptSensitiveData(tamperedData, encrypted.keyId)
    ).rejects.toThrow();
  });

  test('handles key rotation properly', async () => {
    const testData = 'Data for key rotation test';
    
    // Encrypt with current key
    const encrypted1 = await encryptionService.encryptSensitiveData(testData, testPatientId);
    
    // Force key rotation (simulate)
    await encryptionService.rotateEncryptionKey(testPatientId);
    
    // Verify old data can still be decrypted
    const decrypted1 = await encryptionService.decryptSensitiveData(
      encrypted1.encryptedData,
      encrypted1.keyId
    );
    expect(decrypted1).toBe(testData);
    
    // Verify new encryptions use new key
    const encrypted2 = await encryptionService.encryptSensitiveData(testData, testPatientId);
    expect(encrypted2.keyId).not.toBe(encrypted1.keyId);
    
    const decrypted2 = await encryptionService.decryptSensitiveData(
      encrypted2.encryptedData,
      encrypted2.keyId
    );
    expect(decrypted2).toBe(testData);
  });

  test('batch encryption processes multiple records', async () => {
    const testRecords = [
      { id: 1, data: 'Patient A sensitive data' },
      { id: 2, data: 'Patient B sensitive data' },
      { id: 3, data: 'Patient C sensitive data' }
    ];
    
    const batchEncrypted = await encryptionService.batchEncrypt(testRecords, testPatientId);
    expect(batchEncrypted).toHaveLength(3);
    
    for (let i = 0; i < testRecords.length; i++) {
      const decrypted = await encryptionService.decryptSensitiveData(
        batchEncrypted[i].encryptedData,
        batchEncrypted[i].keyId
      );
      expect(decrypted).toBe(testRecords[i].data);
    }
  });

  test('encryption is deterministic for same patient and key', async () => {
    const testData = 'Consistent encryption test';
    
    const encrypted1 = await encryptionService.encryptSensitiveData(testData, testPatientId);
    const encrypted2 = await encryptionService.encryptSensitiveData(testData, testPatientId);
    
    // Should use same key for same patient
    expect(encrypted1.keyId).toBe(encrypted2.keyId);
    
    // Decrypt both and verify
    const decrypted1 = await encryptionService.decryptSensitiveData(
      encrypted1.encryptedData,
      encrypted1.keyId
    );
    const decrypted2 = await encryptionService.decryptSensitiveData(
      encrypted2.encryptedData,
      encrypted2.keyId
    );
    
    expect(decrypted1).toBe(testData);
    expect(decrypted2).toBe(testData);
  });

  test('validates encryption key strength', async () => {
    const keyInfo = await encryptionService.getKeyInfo(testPatientId);
    
    expect(keyInfo).toHaveProperty('algorithm');
    expect(keyInfo).toHaveProperty('keyLength');
    expect(keyInfo.algorithm).toBe('aes-256-gcm'); // Should use strong encryption
    expect(keyInfo.keyLength).toBeGreaterThanOrEqual(256); // Should be at least 256-bit
  });

  test('handles empty and null data gracefully', async () => {
    // Test empty string
    const emptyEncrypted = await encryptionService.encryptSensitiveData('', testPatientId);
    const emptyDecrypted = await encryptionService.decryptSensitiveData(
      emptyEncrypted.encryptedData,
      emptyEncrypted.keyId
    );
    expect(emptyDecrypted).toBe('');
    
    // Test null handling
    await expect(
      encryptionService.encryptSensitiveData(null, testPatientId)
    ).rejects.toThrow('Data cannot be null or undefined');
  });

  test('performance benchmark for encryption operations', async () => {
    const testData = 'Performance test data '.repeat(100); // ~2KB of data
    const iterations = 10;
    
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      const encrypted = await encryptionService.encryptSensitiveData(testData, testPatientId);
      await encryptionService.decryptSensitiveData(encrypted.encryptedData, encrypted.keyId);
    }
    
    const endTime = Date.now();
    const avgTime = (endTime - startTime) / iterations;
    
    // Should complete encrypt/decrypt cycle in under 100ms
    expect(avgTime).toBeLessThan(100);
  });

  test('prevents key reuse across different patients', async () => {
    // Create another test patient
    const result = await pool.query(`
      INSERT INTO patients (first_name, last_name, dob, gender) 
      VALUES ('Test2', 'Patient2', '1991-01-01', 'female')
      RETURNING id
    `);
    const testPatientId2 = result.rows[0].id;
    
    try {
      const testData = 'Cross-patient encryption test';
      
      const encrypted1 = await encryptionService.encryptSensitiveData(testData, testPatientId);
      const encrypted2 = await encryptionService.encryptSensitiveData(testData, testPatientId2);
      
      // Different patients should have different keys
      expect(encrypted1.keyId).not.toBe(encrypted2.keyId);
      
      // Should not be able to decrypt patient 1 data with patient 2 key
      await expect(
        encryptionService.decryptSensitiveData(encrypted1.encryptedData, encrypted2.keyId)
      ).rejects.toThrow();
      
    } finally {
      // Clean up second test patient
      await pool.query('DELETE FROM patients WHERE id = $1', [testPatientId2]);
    }
  });

  test('audit logs encryption operations', async () => {
    const testData = 'Audit logging test data';
    
    // Get initial audit count
    const initialCount = await pool.query(`
      SELECT COUNT(*) FROM phi_access_logs 
      WHERE action_type = 'encryption' AND patient_id = $1
    `, [testPatientId]);
    
    // Perform encryption
    await encryptionService.encryptSensitiveData(testData, testPatientId);
    
    // Check if audit log was created
    const finalCount = await pool.query(`
      SELECT COUNT(*) FROM phi_access_logs 
      WHERE action_type = 'encryption' AND patient_id = $1
    `, [testPatientId]);
    
    expect(parseInt(finalCount.rows[0].count)).toBeGreaterThan(
      parseInt(initialCount.rows[0].count)
    );
  });
});