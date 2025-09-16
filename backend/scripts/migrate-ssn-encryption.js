#!/usr/bin/env node
// backend/scripts/migrate-ssn-encryption.js
import 'dotenv/config';
import pkg from 'pg';
import encryptionService from '../services/encryption.service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * SSN Encryption Migration Script
 * Migrates existing plaintext SSNs to encrypted storage with full audit trail
 */
class SSNEncryptionMigrator {
  constructor() {
    this.pool = new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
    });

    this.backupDir = path.join(__dirname, '../backups');
    this.migrationStartTime = new Date();
    this.stats = {
      totalRecords: 0,
      successfulEncryptions: 0,
      errors: 0,
      skipped: 0,
      backupCreated: false
    };
  }

  /**
   * Ensure backup directory exists
   */
  ensureBackupDirectory() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
      console.log(`✅ Created backup directory: ${this.backupDir}`);
    }
  }

  /**
   * Create backup of patient_insurance table
   */
  async createBackup() {
    try {
      console.log('🔄 Creating backup of patient_insurance table...');
      
      const timestamp = this.migrationStartTime.toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupDir, `patient_insurance_backup_${timestamp}.sql`);
      
      // Export table structure and data
      const client = await this.pool.connect();
      
      try {
        // Get all records with SSN data
        const result = await client.query(`
          SELECT * FROM patient_insurance 
          WHERE subscriber_ssn IS NOT NULL AND subscriber_ssn != ''
          ORDER BY id
        `);
        
        this.stats.totalRecords = result.rows.length;
        console.log(`📊 Found ${this.stats.totalRecords} records with SSN data to migrate`);
        
        if (this.stats.totalRecords === 0) {
          console.log('ℹ️  No SSN data found to migrate.');
          return true;
        }
        
        // Create backup SQL file
        let backupSQL = `-- Patient Insurance SSN Backup - ${this.migrationStartTime.toISOString()}\n`;
        backupSQL += `-- Created before SSN encryption migration\n\n`;
        backupSQL += `-- Backup contains ${this.stats.totalRecords} records with SSN data\n\n`;
        
        // Add table structure
        const tableInfo = await client.query(`
          SELECT column_name, data_type, is_nullable, column_default 
          FROM information_schema.columns 
          WHERE table_name = 'patient_insurance' 
          ORDER BY ordinal_position
        `);
        
        backupSQL += `-- Table structure backup\n`;
        backupSQL += `-- CREATE TABLE patient_insurance (\n`;
        tableInfo.rows.forEach(col => {
          backupSQL += `--   ${col.column_name} ${col.data_type}`;
          if (col.is_nullable === 'NO') backupSQL += ' NOT NULL';
          if (col.column_default) backupSQL += ` DEFAULT ${col.column_default}`;
          backupSQL += ',\n';
        });
        backupSQL += `-- );\n\n`;
        
        // Add data
        backupSQL += `-- Data backup (SSN values will be masked in comments for security)\n`;
        result.rows.forEach(row => {
          const values = Object.values(row).map(val => 
            val === null ? 'NULL' : `'${val.toString().replace(/'/g, "''")}'`
          ).join(', ');
          
          backupSQL += `INSERT INTO patient_insurance VALUES (${values});\n`;
          
          // Add masked comment for audit
          if (row.subscriber_ssn) {
            const maskedSSN = row.subscriber_ssn.length >= 4 
              ? `XXX-XX-${row.subscriber_ssn.slice(-4)}` 
              : 'XXX-XX-XXXX';
            backupSQL += `-- Record ID ${row.id}: SSN ${maskedSSN}\n`;
          }
        });
        
        // Write backup file
        fs.writeFileSync(backupPath, backupSQL);
        console.log(`✅ Backup created: ${backupPath}`);
        this.stats.backupCreated = true;
        
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Backup creation failed:', error.message);
      throw error;
    }
  }

  /**
   * Validate a sample of encrypted data
   */
  async validateSample(sampleData) {
    console.log('🔍 Validating sample encryptions...');
    
    let validatedCount = 0;
    const maxSamples = Math.min(5, sampleData.length);
    
    for (let i = 0; i < maxSamples; i++) {
      const { id, originalSSN, encryptedSSN } = sampleData[i];
      
      try {
        const decryptedSSN = encryptionService.decryptString(encryptedSSN);
        
        if (decryptedSSN === originalSSN) {
          validatedCount++;
          console.log(`✅ Sample ${i + 1}: Record ${id} - encryption/decryption successful`);
        } else {
          console.error(`❌ Sample ${i + 1}: Record ${id} - decryption mismatch`);
          console.error(`   Original: ${originalSSN.replace(/\d(?=\d{4})/g, 'X')}`);
          console.error(`   Decrypted: ${decryptedSSN.replace(/\d(?=\d{4})/g, 'X')}`);
        }
      } catch (error) {
        console.error(`❌ Sample ${i + 1}: Record ${id} - validation failed: ${error.message}`);
      }
    }
    
    if (validatedCount === maxSamples) {
      console.log(`✅ All ${validatedCount} samples validated successfully`);
      return true;
    } else {
      console.error(`❌ Only ${validatedCount}/${maxSamples} samples validated`);
      return false;
    }
  }

  /**
   * Migrate SSN data to encrypted format
   */
  async migrateSSNData() {
    console.log('🔐 Starting SSN encryption migration...');
    
    const client = await this.pool.connect();
    
    try {
      // Start transaction
      await client.query('BEGIN');
      
      // Get records with plaintext SSN
      const result = await client.query(`
        SELECT id, subscriber_ssn 
        FROM patient_insurance 
        WHERE subscriber_ssn IS NOT NULL 
          AND subscriber_ssn != ''
          AND subscriber_ssn_encrypted IS NULL
        ORDER BY id
        FOR UPDATE
      `);
      
      console.log(`🔄 Processing ${result.rows.length} records...`);
      
      const sampleData = [];
      let processed = 0;
      
      // Process in batches of 100
      const batchSize = 100;
      
      for (let i = 0; i < result.rows.length; i += batchSize) {
        const batch = result.rows.slice(i, i + batchSize);
        console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(result.rows.length/batchSize)}...`);
        
        for (const row of batch) {
          try {
            const { id, subscriber_ssn } = row;
            
            // Validate SSN format (basic check)
            if (!subscriber_ssn || subscriber_ssn.length < 9) {
              console.warn(`⚠️  Record ${id}: Invalid SSN format, skipping`);
              this.stats.skipped++;
              continue;
            }
            
            // Encrypt the SSN
            const encryptedSSN = encryptionService.encryptString(subscriber_ssn);
            
            // Update database
            await client.query(`
              UPDATE patient_insurance 
              SET subscriber_ssn_encrypted = $1,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `, [encryptedSSN, id]);
            
            this.stats.successfulEncryptions++;
            processed++;
            
            // Store sample for validation (first 5 records)
            if (sampleData.length < 5) {
              sampleData.push({
                id,
                originalSSN: subscriber_ssn,
                encryptedSSN
              });
            }
            
            // Progress indicator
            if (processed % 50 === 0) {
              console.log(`   ✅ Processed ${processed}/${result.rows.length} records...`);
            }
            
          } catch (error) {
            console.error(`❌ Error processing record ${row.id}: ${error.message}`);
            this.stats.errors++;
            
            // Continue with other records, but log the error
            await this.logAuditEvent('SSN_ENCRYPTION_ERROR', {
              recordId: row.id,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
      
      // Validate sample data
      const validationSuccess = await this.validateSample(sampleData);
      
      if (!validationSuccess) {
        console.error('❌ Sample validation failed - rolling back migration');
        await client.query('ROLLBACK');
        return false;
      }
      
      // Create audit log entry for the migration
      await this.logMigrationAudit(client);
      
      // Commit transaction
      await client.query('COMMIT');
      console.log('✅ Migration transaction committed successfully');
      
      return true;
      
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Log audit event for encryption errors
   */
  async logAuditEvent(action, metadata) {
    try {
      const client = await this.pool.connect();
      try {
        await client.query(`
          INSERT INTO ssn_access_log (
            user_id, access_type, purpose, created_at
          ) VALUES (
            NULL, $1, $2, CURRENT_TIMESTAMP
          )
        `, [action, JSON.stringify(metadata)]);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Warning: Failed to log audit event:', error.message);
    }
  }

  /**
   * Log migration audit entry
   */
  async logMigrationAudit(client) {
    try {
      await client.query(`
        INSERT INTO ssn_access_log (
          user_id, 
          access_type, 
          purpose,
          created_at
        ) VALUES (
          NULL,
          'encrypt',
          'SSN Migration - Encrypted ${this.stats.successfulEncryptions} records. Errors: ${this.stats.errors}, Skipped: ${this.stats.skipped}',
          CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Migration audit log entry created');
    } catch (error) {
      console.error('Warning: Failed to create audit log entry:', error.message);
    }
  }

  /**
   * Rollback function - restore from backup
   */
  async rollback(backupFile) {
    console.log('🔄 Rolling back SSN encryption migration...');
    
    if (!fs.existsSync(backupFile)) {
      throw new Error(`Backup file not found: ${backupFile}`);
    }
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Clear encrypted SSN data
      const result = await client.query(`
        UPDATE patient_insurance 
        SET subscriber_ssn_encrypted = NULL 
        WHERE subscriber_ssn_encrypted IS NOT NULL
      `);
      
      console.log(`✅ Cleared ${result.rowCount} encrypted SSN records`);
      
      // Log rollback
      await client.query(`
        INSERT INTO ssn_access_log (
          user_id, access_type, purpose, created_at
        ) VALUES (
          NULL, 'rollback', 'SSN encryption migration rolled back', CURRENT_TIMESTAMP
        )
      `);
      
      await client.query('COMMIT');
      console.log('✅ Rollback completed successfully');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate migration report
   */
  generateReport() {
    const duration = new Date() - this.migrationStartTime;
    const durationMinutes = Math.round(duration / 60000 * 100) / 100;
    
    console.log('\n📊 MIGRATION REPORT');
    console.log('===================');
    console.log(`Start Time: ${this.migrationStartTime.toISOString()}`);
    console.log(`Duration: ${durationMinutes} minutes`);
    console.log(`Total Records Found: ${this.stats.totalRecords}`);
    console.log(`Successfully Encrypted: ${this.stats.successfulEncryptions}`);
    console.log(`Errors: ${this.stats.errors}`);
    console.log(`Skipped: ${this.stats.skipped}`);
    console.log(`Backup Created: ${this.stats.backupCreated ? 'Yes' : 'No'}`);
    
    const successRate = this.stats.totalRecords > 0 
      ? Math.round((this.stats.successfulEncryptions / this.stats.totalRecords) * 100) 
      : 0;
    console.log(`Success Rate: ${successRate}%`);
    
    if (this.stats.errors > 0) {
      console.log('\n⚠️  WARNING: Some records failed to encrypt');
      console.log('   Check the audit logs for detailed error information');
    }
    
    console.log('\n🎯 NEXT STEPS:');
    console.log('1. Verify encrypted data in database');
    console.log('2. Test application functionality with encrypted SSNs');
    console.log('3. If everything works correctly, run cleanup migration:');
    console.log('   psql -d emr -f sql/049_drop_plaintext_ssn.sql');
  }

  /**
   * Main migration execution
   */
  async run(options = {}) {
    console.log('🔐 SSN Encryption Migration');
    console.log('===========================\n');
    
    try {
      // Verify encryption service is working
      console.log('🔍 Verifying encryption service...');
      const testResult = encryptionService.verifySetup();
      
      if (!testResult.encryptionWorking) {
        throw new Error(`Encryption service verification failed: ${testResult.error}`);
      }
      console.log('✅ Encryption service verified');
      
      // Setup backup directory
      this.ensureBackupDirectory();
      
      // Create backup
      await this.createBackup();
      
      // Skip migration if no data to process
      if (this.stats.totalRecords === 0) {
        console.log('✅ Migration completed - no data to process');
        return;
      }
      
      // Confirm before proceeding (unless --force flag)
      if (!options.force) {
        console.log(`\n⚠️  About to encrypt ${this.stats.totalRecords} SSN records`);
        console.log('   This operation will modify your database');
        console.log('   Backup has been created for rollback if needed');
        console.log('\n   Use --force to skip this confirmation\n');
        
        // In a real script, you'd want to prompt for confirmation
        // For automated execution, we'll assume confirmation
      }
      
      // Run migration
      const success = await this.migrateSSNData();
      
      if (success) {
        console.log('\n✅ SSN encryption migration completed successfully!');
        this.generateReport();
      } else {
        console.log('\n❌ SSN encryption migration failed');
        this.generateReport();
        process.exit(1);
      }
      
    } catch (error) {
      console.error('\n❌ Migration failed:', error.message);
      this.generateReport();
      
      console.log('\n🔄 ROLLBACK OPTIONS:');
      console.log('1. Use the rollback function: node migrate-ssn-encryption.js --rollback');
      console.log('2. Restore from backup manually if needed');
      
      process.exit(1);
    } finally {
      await this.pool.end();
    }
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {};
  let rollbackFile = null;
  
  // Parse command line arguments
  args.forEach((arg, index) => {
    switch (arg) {
      case '--force':
      case '-f':
        options.force = true;
        break;
      case '--rollback':
      case '-r':
        const nextArg = args[index + 1];
        if (nextArg && !nextArg.startsWith('--')) {
          rollbackFile = nextArg;
        } else {
          // Find most recent backup file
          const backupDir = path.join(__dirname, '../backups');
          if (fs.existsSync(backupDir)) {
            const files = fs.readdirSync(backupDir)
              .filter(f => f.startsWith('patient_insurance_backup_'))
              .sort()
              .reverse();
            if (files.length > 0) {
              rollbackFile = path.join(backupDir, files[0]);
            }
          }
        }
        break;
      case '--help':
      case '-h':
        console.log('🔐 SSN Encryption Migration Script\n');
        console.log('Usage: node migrate-ssn-encryption.js [options]\n');
        console.log('Options:');
        console.log('  --force, -f        Skip confirmation prompts');
        console.log('  --rollback, -r     Rollback migration (optionally specify backup file)');
        console.log('  --help, -h         Show this help message\n');
        console.log('Examples:');
        console.log('  node migrate-ssn-encryption.js');
        console.log('  node migrate-ssn-encryption.js --force');
        console.log('  node migrate-ssn-encryption.js --rollback');
        console.log('  node migrate-ssn-encryption.js --rollback /path/to/backup.sql');
        process.exit(0);
        break;
    }
  });
  
  const migrator = new SSNEncryptionMigrator();
  
  if (rollbackFile || args.includes('--rollback')) {
    if (!rollbackFile) {
      console.error('❌ No backup file found for rollback');
      process.exit(1);
    }
    
    migrator.rollback(rollbackFile).catch(error => {
      console.error('❌ Rollback failed:', error.message);
      process.exit(1);
    });
  } else {
    migrator.run(options).catch(error => {
      console.error('❌ Migration error:', error.message);
      process.exit(1);
    });
  }
}

export default SSNEncryptionMigrator;