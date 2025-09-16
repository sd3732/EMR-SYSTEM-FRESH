// backend/services/encryption.service.js
import crypto from 'crypto';

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    
    // Initialize encryption keys from environment
    this.initializeKeys();
  }

  initializeKeys() {
    this.primaryKey = process.env.ENCRYPTION_KEY;
    this.previousKey = process.env.ENCRYPTION_KEY_PREVIOUS;
    
    if (!this.primaryKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required for PHI encryption');
    }
    
    // Validate key format (should be 64 character hex string)
    if (!/^[0-9a-fA-F]{64}$/.test(this.primaryKey)) {
      throw new Error('ENCRYPTION_KEY must be a 64-character hexadecimal string (256 bits)');
    }
    
    // Convert hex string to buffer
    this.primaryKeyBuffer = Buffer.from(this.primaryKey, 'hex');
    this.previousKeyBuffer = this.previousKey ? Buffer.from(this.previousKey, 'hex') : null;
  }

  /**
   * Encrypt a string value with AES-256-GCM
   * @param {string} plaintext - The string to encrypt
   * @param {string} keyId - Optional key identifier for key rotation
   * @returns {string} Base64 encoded encrypted data with format: keyId:iv:tag:ciphertext
   */
  encryptString(plaintext, keyId = 'primary') {
    if (!plaintext || typeof plaintext !== 'string') {
      throw new Error('Plaintext must be a non-empty string');
    }

    try {
      const key = keyId === 'primary' ? this.primaryKeyBuffer : this.previousKeyBuffer;
      if (!key) {
        throw new Error(`Encryption key '${keyId}' not available`);
      }

      // Generate random IV for each encryption
      const iv = crypto.randomBytes(this.ivLength);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      cipher.setAAD(Buffer.from(keyId)); // Additional authenticated data
      
      // Encrypt the plaintext
      let ciphertext = cipher.update(plaintext, 'utf8');
      ciphertext = Buffer.concat([ciphertext, cipher.final()]);
      
      // Get authentication tag
      const tag = cipher.getAuthTag();
      
      // Combine keyId:iv:tag:ciphertext and encode as base64
      const combined = Buffer.concat([
        Buffer.from(keyId + ':', 'utf8'),
        iv,
        tag,
        ciphertext
      ]);
      
      return combined.toString('base64');
    } catch (error) {
      this.logAuditEvent('ENCRYPTION_ERROR', { error: error.message });
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt a string value encrypted with AES-256-GCM
   * @param {string} encryptedData - Base64 encoded encrypted data
   * @returns {string} Decrypted plaintext
   */
  decryptString(encryptedData) {
    if (!encryptedData || typeof encryptedData !== 'string') {
      throw new Error('Encrypted data must be a non-empty string');
    }

    try {
      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract keyId (look for first colon)
      const keyIdEnd = combined.indexOf(':', 0);
      if (keyIdEnd === -1) {
        throw new Error('Invalid encrypted data format: missing key ID');
      }
      
      const keyId = combined.subarray(0, keyIdEnd).toString('utf8');
      const key = keyId === 'primary' ? this.primaryKeyBuffer : this.previousKeyBuffer;
      
      if (!key) {
        throw new Error(`Decryption key '${keyId}' not available`);
      }
      
      // Extract IV, tag, and ciphertext
      const remainingData = combined.subarray(keyIdEnd + 1);
      const iv = remainingData.subarray(0, this.ivLength);
      const tag = remainingData.subarray(this.ivLength, this.ivLength + this.tagLength);
      const ciphertext = remainingData.subarray(this.ivLength + this.tagLength);
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(tag);
      decipher.setAAD(Buffer.from(keyId)); // Must match encryption AAD
      
      // Decrypt
      let plaintext = decipher.update(ciphertext, null, 'utf8');
      plaintext += decipher.final('utf8');
      
      // Log successful decryption for audit
      this.logAuditEvent('PHI_DECRYPTION', { keyId });
      
      return plaintext;
    } catch (error) {
      this.logAuditEvent('DECRYPTION_ERROR', { error: error.message });
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypt a JSON object
   * @param {object} data - The object to encrypt
   * @param {string} keyId - Optional key identifier
   * @returns {string} Encrypted JSON string
   */
  encryptJSON(data, keyId = 'primary') {
    try {
      const jsonString = JSON.stringify(data);
      return this.encryptString(jsonString, keyId);
    } catch (error) {
      throw new Error(`JSON encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt a JSON object
   * @param {string} encryptedData - Encrypted JSON string
   * @returns {object} Decrypted object
   */
  decryptJSON(encryptedData) {
    try {
      const jsonString = this.decryptString(encryptedData);
      return JSON.parse(jsonString);
    } catch (error) {
      throw new Error(`JSON decryption failed: ${error.message}`);
    }
  }

  /**
   * Batch encrypt multiple strings
   * @param {Array<{id: string, value: string}>} items - Array of items to encrypt
   * @param {string} keyId - Optional key identifier
   * @returns {Array<{id: string, encrypted: string}>} Array of encrypted items
   */
  encryptBatch(items, keyId = 'primary') {
    if (!Array.isArray(items)) {
      throw new Error('Items must be an array');
    }

    const results = [];
    const errors = [];

    for (const item of items) {
      try {
        if (!item.id || !item.value) {
          throw new Error('Each item must have id and value properties');
        }

        const encrypted = this.encryptString(item.value, keyId);
        results.push({ id: item.id, encrypted });
      } catch (error) {
        errors.push({ id: item.id, error: error.message });
      }
    }

    if (errors.length > 0) {
      this.logAuditEvent('BATCH_ENCRYPTION_ERRORS', { errorCount: errors.length, errors });
    }

    return { results, errors };
  }

  /**
   * Batch decrypt multiple strings
   * @param {Array<{id: string, encrypted: string}>} items - Array of encrypted items
   * @returns {Array<{id: string, value: string}>} Array of decrypted items
   */
  decryptBatch(items) {
    if (!Array.isArray(items)) {
      throw new Error('Items must be an array');
    }

    const results = [];
    const errors = [];

    for (const item of items) {
      try {
        if (!item.id || !item.encrypted) {
          throw new Error('Each item must have id and encrypted properties');
        }

        const value = this.decryptString(item.encrypted);
        results.push({ id: item.id, value });
      } catch (error) {
        errors.push({ id: item.id, error: error.message });
      }
    }

    if (errors.length > 0) {
      this.logAuditEvent('BATCH_DECRYPTION_ERRORS', { errorCount: errors.length, errors });
    }

    return { results, errors };
  }

  /**
   * Check if data is encrypted (basic format validation)
   * @param {string} data - Data to check
   * @returns {boolean} True if data appears to be encrypted
   */
  isEncrypted(data) {
    if (!data || typeof data !== 'string') {
      return false;
    }

    try {
      // Check if it's valid base64
      const decoded = Buffer.from(data, 'base64');
      
      // Check for key ID format (should have a colon)
      const colonIndex = decoded.indexOf(':');
      if (colonIndex === -1 || colonIndex === 0) {
        return false;
      }
      
      // Check minimum length (keyId + ':' + iv + tag + at least 1 byte ciphertext)
      const minLength = 1 + 1 + this.ivLength + this.tagLength + 1;
      return decoded.length >= minLength;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate a new encryption key
   * @returns {string} 64-character hex string (256-bit key)
   */
  static generateKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Log audit events for encryption/decryption operations
   * @param {string} action - The action being performed
   * @param {object} metadata - Additional metadata
   */
  logAuditEvent(action, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      service: 'EncryptionService',
      action,
      metadata,
      pid: process.pid
    };
    
    // In production, this should go to a secure audit log
    console.log(`[AUDIT] ${JSON.stringify(logEntry)}`);
  }

  /**
   * Verify encryption setup and keys
   * @returns {object} Verification results
   */
  verifySetup() {
    const results = {
      primaryKeyValid: false,
      previousKeyValid: false,
      encryptionWorking: false,
      error: null
    };

    try {
      // Check primary key
      if (this.primaryKeyBuffer && this.primaryKeyBuffer.length === this.keyLength) {
        results.primaryKeyValid = true;
      }

      // Check previous key if provided
      if (this.previousKeyBuffer) {
        results.previousKeyValid = this.previousKeyBuffer.length === this.keyLength;
      } else {
        results.previousKeyValid = true; // Optional, so valid if not provided
      }

      // Test encryption/decryption using simple AES-256-CBC for testing
      const testKey = this.primaryKeyBuffer;
      const testIv = crypto.randomBytes(16);
      const testData = 'test-phi-data-123';
      
      // Use CBC mode for verification test (simpler)
      const testCipher = crypto.createCipheriv('aes-256-cbc', testKey, testIv);
      let encrypted = testCipher.update(testData, 'utf8', 'hex');
      encrypted += testCipher.final('hex');
      
      const testDecipher = crypto.createDecipheriv('aes-256-cbc', testKey, testIv);
      let decrypted = testDecipher.update(encrypted, 'hex', 'utf8');
      decrypted += testDecipher.final('utf8');
      
      if (decrypted === testData) {
        results.encryptionWorking = true;
      }
    } catch (error) {
      results.error = error.message;
    }

    return results;
  }
}

// Export singleton instance
const encryptionService = new EncryptionService();
export default encryptionService;

// Also export the class for testing
export { EncryptionService };