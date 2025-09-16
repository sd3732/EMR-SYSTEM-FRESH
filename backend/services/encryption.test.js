// backend/services/encryption.test.js
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EncryptionService } from './encryption.service.js';
import crypto from 'crypto';

describe('EncryptionService', () => {
  let encryptionService;
  let originalEnv;

  beforeEach(() => {
    // Backup original environment
    originalEnv = { ...process.env };
    
    // Set up test encryption keys
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    process.env.ENCRYPTION_KEY_PREVIOUS = crypto.randomBytes(32).toString('hex');
    
    // Create new instance for each test
    encryptionService = new EncryptionService();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Constructor and Key Management', () => {
    it('should initialize with valid encryption keys', () => {
      expect(encryptionService.primaryKeyBuffer).toBeInstanceOf(Buffer);
      expect(encryptionService.primaryKeyBuffer.length).toBe(32);
    });

    it('should throw error when ENCRYPTION_KEY is missing', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => new EncryptionService()).toThrow('ENCRYPTION_KEY environment variable is required');
    });

    it('should throw error when ENCRYPTION_KEY is invalid format', () => {
      process.env.ENCRYPTION_KEY = 'invalid-key';
      expect(() => new EncryptionService()).toThrow('must be a 64-character hexadecimal string');
    });

    it('should handle optional previous key', () => {
      delete process.env.ENCRYPTION_KEY_PREVIOUS;
      const service = new EncryptionService();
      expect(service.previousKeyBuffer).toBeNull();
    });
  });

  describe('String Encryption/Decryption', () => {
    const testCases = [
      'simple text',
      '123-45-6789', // SSN format
      'patient@email.com',
      '1234 Main Street, City, State 12345', // Address
      'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?',
      'Unicode: 🏥⚕️👨‍⚕️👩‍⚕️',
      'Very long text: ' + 'A'.repeat(1000)
    ];

    testCases.forEach(testString => {
      it(`should encrypt and decrypt: "${testString.substring(0, 50)}..."`, () => {
        const encrypted = encryptionService.encryptString(testString);
        const decrypted = encryptionService.decryptString(encrypted);
        
        expect(decrypted).toBe(testString);
        expect(encrypted).not.toBe(testString);
        expect(encrypted.length).toBeGreaterThan(testString.length);
      });
    });

    it('should produce different ciphertext for same plaintext', () => {
      const plaintext = '123-45-6789';
      const encrypted1 = encryptionService.encryptString(plaintext);
      const encrypted2 = encryptionService.encryptString(plaintext);
      
      expect(encrypted1).not.toBe(encrypted2);
      expect(encryptionService.decryptString(encrypted1)).toBe(plaintext);
      expect(encryptionService.decryptString(encrypted2)).toBe(plaintext);
    });

    it('should handle empty string', () => {
      expect(() => encryptionService.encryptString('')).toThrow('Plaintext must be a non-empty string');
    });

    it('should handle null/undefined input', () => {
      expect(() => encryptionService.encryptString(null)).toThrow('Plaintext must be a non-empty string');
      expect(() => encryptionService.encryptString(undefined)).toThrow('Plaintext must be a non-empty string');
    });

    it('should handle non-string input', () => {
      expect(() => encryptionService.encryptString(123)).toThrow('Plaintext must be a non-empty string');
      expect(() => encryptionService.encryptString({})).toThrow('Plaintext must be a non-empty string');
    });
  });

  describe('JSON Encryption/Decryption', () => {
    it('should encrypt and decrypt JSON objects', () => {
      const testObject = {
        ssn: '123-45-6789',
        dob: '1990-01-01',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'ST',
          zip: '12345'
        },
        contacts: ['555-1234', 'patient@email.com']
      };

      const encrypted = encryptionService.encryptJSON(testObject);
      const decrypted = encryptionService.decryptJSON(encrypted);
      
      expect(decrypted).toEqual(testObject);
      expect(encrypted).not.toContain('123-45-6789');
      expect(encrypted).not.toContain('Main St');
    });

    it('should handle complex nested objects', () => {
      const complexObject = {
        patient: {
          demographics: {
            personalInfo: {
              ssn: '987-65-4321',
              name: { first: 'John', last: 'Doe' }
            }
          }
        },
        medical: {
          conditions: ['diabetes', 'hypertension'],
          medications: [
            { name: 'Metformin', dosage: '500mg' },
            { name: 'Lisinopril', dosage: '10mg' }
          ]
        }
      };

      const encrypted = encryptionService.encryptJSON(complexObject);
      const decrypted = encryptionService.decryptJSON(encrypted);
      
      expect(decrypted).toEqual(complexObject);
    });

    it('should handle invalid JSON during decryption', () => {
      // Create corrupted encrypted data
      const validEncrypted = encryptionService.encryptString('invalid json {');
      expect(() => encryptionService.decryptJSON(validEncrypted)).toThrow('JSON decryption failed');
    });
  });

  describe('Batch Operations', () => {
    it('should encrypt batch of strings successfully', () => {
      const items = [
        { id: 'patient1_ssn', value: '123-45-6789' },
        { id: 'patient2_ssn', value: '987-65-4321' },
        { id: 'patient3_ssn', value: '456-78-9012' }
      ];

      const result = encryptionService.encryptBatch(items);
      
      expect(result.results).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      
      result.results.forEach((item, index) => {
        expect(item.id).toBe(items[index].id);
        expect(item.encrypted).toBeDefined();
        expect(item.encrypted).not.toBe(items[index].value);
      });
    });

    it('should decrypt batch of strings successfully', () => {
      const originalItems = [
        { id: 'test1', value: '123-45-6789' },
        { id: 'test2', value: 'patient@email.com' },
        { id: 'test3', value: '1234 Main Street' }
      ];

      // First encrypt them
      const encryptResult = encryptionService.encryptBatch(originalItems);
      const encryptedItems = encryptResult.results.map(item => ({
        id: item.id,
        encrypted: item.encrypted
      }));

      // Then decrypt them
      const decryptResult = encryptionService.decryptBatch(encryptedItems);
      
      expect(decryptResult.results).toHaveLength(3);
      expect(decryptResult.errors).toHaveLength(0);
      
      decryptResult.results.forEach((item, index) => {
        expect(item.id).toBe(originalItems[index].id);
        expect(item.value).toBe(originalItems[index].value);
      });
    });

    it('should handle batch errors gracefully', () => {
      const items = [
        { id: 'valid', value: 'valid data' },
        { id: 'invalid1' }, // missing value
        { value: 'missing id' }, // missing id
        { id: 'valid2', value: 'more valid data' }
      ];

      const result = encryptionService.encryptBatch(items);
      
      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(2);
      expect(result.results[0].id).toBe('valid');
      expect(result.results[1].id).toBe('valid2');
    });

    it('should validate batch input type', () => {
      expect(() => encryptionService.encryptBatch('not an array')).toThrow('Items must be an array');
      expect(() => encryptionService.decryptBatch({})).toThrow('Items must be an array');
    });
  });

  describe('Key Rotation Support', () => {
    it('should encrypt with primary key by default', () => {
      const plaintext = 'test data';
      const encrypted = encryptionService.encryptString(plaintext);
      
      // Should start with 'primary:' when base64 decoded
      const decoded = Buffer.from(encrypted, 'base64');
      expect(decoded.toString('utf8', 0, 8)).toBe('primary:');
    });

    it('should decrypt data encrypted with previous key', () => {
      const plaintext = 'test data with previous key';
      
      // Encrypt with previous key explicitly
      const encrypted = encryptionService.encryptString(plaintext, 'previous');
      const decrypted = encryptionService.decryptString(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should fail when requested key is not available', () => {
      delete process.env.ENCRYPTION_KEY_PREVIOUS;
      const service = new EncryptionService();
      
      expect(() => service.encryptString('test', 'previous')).toThrow("Encryption key 'previous' not available");
    });
  });

  describe('Data Validation', () => {
    it('should detect encrypted data correctly', () => {
      const plaintext = 'sensitive data';
      const encrypted = encryptionService.encryptString(plaintext);
      
      expect(encryptionService.isEncrypted(encrypted)).toBe(true);
      expect(encryptionService.isEncrypted(plaintext)).toBe(false);
      expect(encryptionService.isEncrypted('not-encrypted')).toBe(false);
      expect(encryptionService.isEncrypted('')).toBe(false);
      expect(encryptionService.isEncrypted(null)).toBe(false);
    });

    it('should handle corrupted encrypted data', () => {
      const validEncrypted = encryptionService.encryptString('test data');
      
      // Corrupt the data
      const corruptedData = validEncrypted.slice(0, -5) + 'XXXXX';
      
      expect(() => encryptionService.decryptString(corruptedData)).toThrow('Decryption failed');
    });

    it('should detect tampering attempts', () => {
      const encrypted = encryptionService.encryptString('original data');
      const buffer = Buffer.from(encrypted, 'base64');
      
      // Tamper with a byte in the ciphertext
      buffer[buffer.length - 1] ^= 1;
      const tamperedData = buffer.toString('base64');
      
      expect(() => encryptionService.decryptString(tamperedData)).toThrow('Decryption failed');
    });
  });

  describe('Security Features', () => {
    it('should use different IVs for each encryption', () => {
      const plaintext = 'same data';
      const encrypted1 = encryptionService.encryptString(plaintext);
      const encrypted2 = encryptionService.encryptString(plaintext);
      
      // Extract IVs (after keyId and colon)
      const buffer1 = Buffer.from(encrypted1, 'base64');
      const buffer2 = Buffer.from(encrypted2, 'base64');
      
      const colonIndex = buffer1.indexOf(':');
      const iv1 = buffer1.subarray(colonIndex + 1, colonIndex + 1 + 16);
      const iv2 = buffer2.subarray(colonIndex + 1, colonIndex + 1 + 16);
      
      expect(iv1).not.toEqual(iv2);
    });

    it('should include authentication tag for integrity', () => {
      const encrypted = encryptionService.encryptString('test data');
      const buffer = Buffer.from(encrypted, 'base64');
      
      // Should be long enough to contain IV + tag + ciphertext
      const minLength = 'primary:'.length + 16 + 16 + 1; // keyId + IV + tag + min ciphertext
      expect(buffer.length).toBeGreaterThanOrEqual(minLength);
    });
  });

  describe('Error Handling', () => {
    it('should handle decryption of invalid base64', () => {
      expect(() => encryptionService.decryptString('invalid-base64!')).toThrow('Decryption failed');
    });

    it('should handle malformed encrypted data format', () => {
      const invalidData = Buffer.from('no-colon-separator').toString('base64');
      expect(() => encryptionService.decryptString(invalidData)).toThrow('Invalid encrypted data format');
    });

    it('should handle insufficient data length', () => {
      const tooShort = Buffer.from('primary:').toString('base64');
      expect(() => encryptionService.decryptString(tooShort)).toThrow('Decryption failed');
    });
  });

  describe('Performance', () => {
    it('should encrypt and decrypt large amounts of data efficiently', async () => {
      const largeData = 'A'.repeat(10000); // 10KB of data
      const start = Date.now();
      
      const encrypted = encryptionService.encryptString(largeData);
      const decrypted = encryptionService.decryptString(encrypted);
      
      const duration = Date.now() - start;
      
      expect(decrypted).toBe(largeData);
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle batch operations efficiently', () => {
      const batchSize = 100;
      const items = Array.from({ length: batchSize }, (_, i) => ({
        id: `patient_${i}`,
        value: `${i.toString().padStart(3, '0')}-45-6789`
      }));

      const start = Date.now();
      const result = encryptionService.encryptBatch(items);
      const duration = Date.now() - start;

      expect(result.results).toHaveLength(batchSize);
      expect(result.errors).toHaveLength(0);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
  });

  describe('Setup Verification', () => {
    it('should verify correct setup', () => {
      const verification = encryptionService.verifySetup();
      
      expect(verification.primaryKeyValid).toBe(true);
      expect(verification.previousKeyValid).toBe(true);
      expect(verification.encryptionWorking).toBe(true);
      expect(verification.error).toBeNull();
    });

    it('should detect invalid setup', () => {
      // Corrupt the primary key buffer
      encryptionService.primaryKeyBuffer = Buffer.from('invalid');
      
      const verification = encryptionService.verifySetup();
      
      expect(verification.primaryKeyValid).toBe(false);
      expect(verification.encryptionWorking).toBe(false);
      expect(verification.error).toBeTruthy();
    });
  });

  describe('Static Methods', () => {
    it('should generate valid encryption keys', () => {
      const key1 = EncryptionService.generateKey();
      const key2 = EncryptionService.generateKey();
      
      expect(key1).toMatch(/^[0-9a-f]{64}$/);
      expect(key2).toMatch(/^[0-9a-f]{64}$/);
      expect(key1).not.toBe(key2); // Should be random
      
      // Should be usable as encryption key
      process.env.TEST_KEY = key1;
      expect(() => {
        const testService = new EncryptionService();
        testService.primaryKey = key1;
        testService.primaryKeyBuffer = Buffer.from(key1, 'hex');
      }).not.toThrow();
    });
  });

  describe('Real-world PHI Test Cases', () => {
    const realWorldTestCases = [
      { type: 'SSN', value: '123-45-6789' },
      { type: 'SSN', value: '987654321' }, // No dashes
      { type: 'DOB', value: '1985-03-15' },
      { type: 'Phone', value: '(555) 123-4567' },
      { type: 'Email', value: 'patient.name@email.com' },
      { type: 'Address', value: '123 Main Street, Apt 4B, Anytown, ST 12345-6789' },
      { type: 'Credit Card', value: '4532-1234-5678-9012' },
      { type: 'Bank Last 4', value: '9876' },
      { type: 'Policy Number', value: 'POL-123456789' },
      { type: 'Medical Record', value: 'Patient has diabetes type 2, taking Metformin 500mg twice daily' }
    ];

    realWorldTestCases.forEach(({ type, value }) => {
      it(`should securely encrypt ${type}: ${value}`, () => {
        const encrypted = encryptionService.encryptString(value);
        const decrypted = encryptionService.decryptString(encrypted);
        
        expect(decrypted).toBe(value);
        expect(encrypted).not.toContain(value);
        
        // Ensure common PHI patterns are not visible in encrypted data
        const commonPatterns = [
          /\d{3}-\d{2}-\d{4}/, // SSN
          /\d{4}-\d{4}-\d{4}-\d{4}/, // Credit card
          /\(\d{3}\)\s\d{3}-\d{4}/, // Phone
          /@[\w.-]+\.[\w]{2,}/, // Email
          /\d{4}\/\d{2}\/\d{2}/, // Date
        ];
        
        commonPatterns.forEach(pattern => {
          expect(encrypted).not.toMatch(pattern);
        });
      });
    });
  });
});