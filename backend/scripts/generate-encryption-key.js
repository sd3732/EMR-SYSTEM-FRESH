#!/usr/bin/env node
// backend/scripts/generate-encryption-key.js
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate secure encryption keys for HIPAA-compliant PHI protection
 */
class KeyGenerator {
  constructor() {
    this.envPath = path.join(__dirname, '../.env');
    this.envExamplePath = path.join(__dirname, '../.env.example');
  }

  /**
   * Generate a cryptographically secure 256-bit key
   * @returns {string} 64-character hexadecimal string
   */
  generateSecureKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Check if .env file exists and has encryption keys
   * @returns {object} Status of existing keys
   */
  checkExistingKeys() {
    const status = {
      envExists: false,
      hasEncryptionKey: false,
      hasPreviousKey: false,
      encryptionKeyValue: null,
      previousKeyValue: null
    };

    try {
      if (fs.existsSync(this.envPath)) {
        status.envExists = true;
        const envContent = fs.readFileSync(this.envPath, 'utf8');
        
        // Check for existing keys
        const encryptionMatch = envContent.match(/^ENCRYPTION_KEY=(.*)$/m);
        const previousMatch = envContent.match(/^ENCRYPTION_KEY_PREVIOUS=(.*)$/m);
        
        if (encryptionMatch && encryptionMatch[1].trim()) {
          status.hasEncryptionKey = true;
          status.encryptionKeyValue = encryptionMatch[1].trim();
        }
        
        if (previousMatch && previousMatch[1].trim()) {
          status.hasPreviousKey = true;
          status.previousKeyValue = previousMatch[1].trim();
        }
      }
    } catch (error) {
      console.error('Error checking existing keys:', error.message);
    }

    return status;
  }

  /**
   * Create .env file from .env.example if it doesn't exist
   */
  createEnvFromExample() {
    if (!fs.existsSync(this.envPath) && fs.existsSync(this.envExamplePath)) {
      try {
        fs.copyFileSync(this.envExamplePath, this.envPath);
        console.log('✅ Created .env file from .env.example');
        return true;
      } catch (error) {
        console.error('❌ Error creating .env file:', error.message);
        return false;
      }
    }
    return true;
  }

  /**
   * Update or add encryption keys to .env file
   * @param {string} encryptionKey - The primary encryption key
   * @param {string} previousKey - The previous encryption key (optional)
   */
  updateEnvFile(encryptionKey, previousKey = null) {
    try {
      let envContent = '';
      
      if (fs.existsSync(this.envPath)) {
        envContent = fs.readFileSync(this.envPath, 'utf8');
      }

      // Update or add ENCRYPTION_KEY
      if (envContent.includes('ENCRYPTION_KEY=')) {
        envContent = envContent.replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${encryptionKey}`);
      } else {
        envContent += `\n# Encryption Keys for PHI (HIPAA Compliance)\nENCRYPTION_KEY=${encryptionKey}\n`;
      }

      // Update or add ENCRYPTION_KEY_PREVIOUS if provided
      if (previousKey) {
        if (envContent.includes('ENCRYPTION_KEY_PREVIOUS=')) {
          envContent = envContent.replace(/^ENCRYPTION_KEY_PREVIOUS=.*$/m, `ENCRYPTION_KEY_PREVIOUS=${previousKey}`);
        } else {
          envContent += `ENCRYPTION_KEY_PREVIOUS=${previousKey}\n`;
        }
      }

      // Ensure proper line endings
      envContent = envContent.replace(/\n{3,}/g, '\n\n');
      
      fs.writeFileSync(this.envPath, envContent);
      return true;
    } catch (error) {
      console.error('❌ Error updating .env file:', error.message);
      return false;
    }
  }

  /**
   * Validate that a key is properly formatted
   * @param {string} key - The key to validate
   * @returns {boolean} True if key is valid
   */
  validateKey(key) {
    return typeof key === 'string' && /^[0-9a-fA-F]{64}$/.test(key);
  }

  /**
   * Display key rotation instructions
   */
  showKeyRotationInstructions() {
    console.log('\n📋 KEY ROTATION INSTRUCTIONS:');
    console.log('=====================================');
    console.log('1. To rotate keys safely:');
    console.log('   - Move current ENCRYPTION_KEY to ENCRYPTION_KEY_PREVIOUS');
    console.log('   - Generate new ENCRYPTION_KEY');
    console.log('   - Run data migration script to re-encrypt with new key');
    console.log('   - Remove ENCRYPTION_KEY_PREVIOUS after migration');
    console.log('');
    console.log('2. For production deployment:');
    console.log('   - Store keys in secure environment variables');
    console.log('   - Use secrets management (AWS Secrets Manager, Azure Key Vault, etc.)');
    console.log('   - Never commit keys to version control');
    console.log('');
    console.log('3. Key security requirements:');
    console.log('   - Keys must be 256-bit (64 hex characters)');
    console.log('   - Generate using cryptographically secure random source');
    console.log('   - Rotate keys periodically (recommended: every 90 days)');
  }

  /**
   * Display security warnings and best practices
   */
  showSecurityWarnings() {
    console.log('\n🚨 SECURITY WARNINGS:');
    console.log('====================');
    console.log('⚠️  NEVER commit .env file to version control');
    console.log('⚠️  Store production keys in secure secrets management');
    console.log('⚠️  Implement key rotation procedures');
    console.log('⚠️  Monitor key usage and access');
    console.log('⚠️  Backup encrypted data before key rotation');
    console.log('');
    console.log('🔐 HIPAA COMPLIANCE:');
    console.log('===================');
    console.log('✅ These keys enable AES-256-GCM encryption for PHI');
    console.log('✅ Each encryption includes unique IV and authentication tag');
    console.log('✅ Keys support rotation without data loss');
    console.log('✅ Audit logging tracks all encryption/decryption operations');
  }

  /**
   * Main execution function
   * @param {object} options - Configuration options
   */
  async run(options = {}) {
    console.log('🔑 EMR Encryption Key Generator');
    console.log('==============================\n');

    const { force = false, rotate = false } = options;

    // Create .env file if it doesn't exist
    if (!this.createEnvFromExample()) {
      process.exit(1);
    }

    // Check existing keys
    const status = this.checkExistingKeys();

    if (status.hasEncryptionKey && !force && !rotate) {
      console.log('✅ Encryption keys already exist in .env file');
      console.log(`🔐 ENCRYPTION_KEY: ${status.encryptionKeyValue.substring(0, 8)}...`);
      
      if (status.hasPreviousKey) {
        console.log(`🔐 ENCRYPTION_KEY_PREVIOUS: ${status.previousKeyValue.substring(0, 8)}...`);
      }

      console.log('\nℹ️  Use --force to regenerate keys or --rotate for key rotation');
      this.showKeyRotationInstructions();
      this.showSecurityWarnings();
      return;
    }

    // Generate new keys
    let newEncryptionKey, previousKey;

    if (rotate && status.hasEncryptionKey) {
      // Key rotation: current key becomes previous, generate new primary
      console.log('🔄 Performing key rotation...');
      newEncryptionKey = this.generateSecureKey();
      previousKey = status.encryptionKeyValue;
      
      console.log('✅ Generated new primary encryption key');
      console.log('📝 Moved existing key to ENCRYPTION_KEY_PREVIOUS');
    } else {
      // Generate new primary key
      console.log('🔐 Generating new encryption key...');
      newEncryptionKey = this.generateSecureKey();
      previousKey = status.hasPreviousKey ? status.previousKeyValue : null;
      
      if (force && status.hasEncryptionKey) {
        console.log('⚠️  Replacing existing encryption key (--force used)');
      }
    }

    // Validate generated key
    if (!this.validateKey(newEncryptionKey)) {
      console.error('❌ Failed to generate valid encryption key');
      process.exit(1);
    }

    // Update .env file
    if (this.updateEnvFile(newEncryptionKey, previousKey)) {
      console.log('✅ Successfully updated .env file with new encryption key');
      console.log(`🔐 New ENCRYPTION_KEY: ${newEncryptionKey.substring(0, 8)}...`);
      
      if (previousKey) {
        console.log(`🔐 ENCRYPTION_KEY_PREVIOUS: ${previousKey.substring(0, 8)}...`);
      }
    } else {
      console.error('❌ Failed to update .env file');
      process.exit(1);
    }

    // Show next steps
    console.log('\n🎯 NEXT STEPS:');
    console.log('===============');
    if (rotate || (force && status.hasEncryptionKey)) {
      console.log('1. ⚠️  Run data migration script to re-encrypt existing PHI:');
      console.log('   node scripts/encrypt-existing-data.js');
      console.log('2. 🧪 Test encryption service:');
      console.log('   npm test -- encryption.test.js');
    } else {
      console.log('1. 🧪 Test encryption service:');
      console.log('   npm test -- encryption.test.js');
      console.log('2. 🗄️  If you have existing PHI data, run migration:');
      console.log('   node scripts/encrypt-existing-data.js');
    }
    console.log('3. 🚀 Start your application to use encrypted PHI storage');

    this.showKeyRotationInstructions();
    this.showSecurityWarnings();
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  args.forEach(arg => {
    switch (arg) {
      case '--force':
      case '-f':
        options.force = true;
        break;
      case '--rotate':
      case '-r':
        options.rotate = true;
        break;
      case '--help':
      case '-h':
        console.log('🔑 EMR Encryption Key Generator\n');
        console.log('Usage: node generate-encryption-key.js [options]\n');
        console.log('Options:');
        console.log('  --force, -f    Force regenerate keys even if they exist');
        console.log('  --rotate, -r   Rotate keys (move current to previous, generate new)');
        console.log('  --help, -h     Show this help message\n');
        console.log('Examples:');
        console.log('  node generate-encryption-key.js');
        console.log('  node generate-encryption-key.js --force');
        console.log('  node generate-encryption-key.js --rotate');
        process.exit(0);
        break;
    }
  });

  const generator = new KeyGenerator();
  generator.run(options).catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export default KeyGenerator;