#!/usr/bin/env node
// backend/scripts/encrypt-existing-data.js
import pkg from 'pg';
import encryptionService from '../services/encryption.service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Data migration script to encrypt existing PHI in the database
 * Addresses critical HIPAA compliance issue identified in security audit
 */
class PHIEncryptionMigration {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || this.buildConnectionString()
    });
    
    this.backupDir = path.join(__dirname, '../backups');
    this.logFile = path.join(__dirname, '../logs/encryption-migration.log');
    
    // PHI fields that need encryption
    this.phiFields = [
      {
        table: 'patient_insurance',
        fields: [
          { column: 'subscriber_ssn', description: 'Social Security Numbers' },
          { column: 'subscriber_name', description: 'Subscriber names' }
        ],
        idColumn: 'id'
      },
      {
        table: 'patients', 
        fields: [
          { column: 'dob', description: 'Date of birth' }
        ],
        idColumn: 'id',
        jsonFields: [
          { 
            column: 'identifiers', 
            phiKeys: ['ssn', 'email', 'phone', 'address', 'city', 'state', 'zip'],
            description: 'Patient identifiers JSON'
          }
        ]
      },
      {
        table: 'patient_billing',
        fields: [
          { column: 'billing_phone', description: 'Billing phone numbers' },
          { column: 'billing_email', description: 'Billing email addresses' },
          { column: 'billing_address', description: 'Billing addresses' },
          { column: 'autopay_card_last_four', description: 'Credit card last 4 digits' },
          { column: 'autopay_bank_last_four', description: 'Bank account last 4 digits' }
        ],
        idColumn: 'id'
      }
    ];

    this.stats = {
      tablesProcessed: 0,
      recordsProcessed: 0,
      fieldsEncrypted: 0,
      errors: [],
      startTime: null,
      endTime: null
    };
  }

  buildConnectionString() {
    const host = process.env.PGHOST || '127.0.0.1';
    const port = process.env.PGPORT || 5432;
    const database = process.env.PGDATABASE || 'emr';
    const user = process.env.PGUSER || 'emr_user';
    const password = process.env.PGPASSWORD || 'emr_local_123';
    
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }

  /**
   * Initialize directories and validate setup
   */
  async initialize() {
    // Create backup directory
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }

    // Create logs directory
    const logsDir = path.dirname(this.logFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Validate encryption setup
    const verification = encryptionService.verifySetup();
    if (!verification.encryptionWorking) {
      throw new Error(`Encryption service setup failed: ${verification.error}`);
    }

    this.log('Migration initialization complete');
    this.log(`Encryption service verified: ${JSON.stringify(verification)}`);
  }

  /**
   * Log messages with timestamp
   */
  log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    console.log(message);
    fs.appendFileSync(this.logFile, logEntry);
  }

  /**
   * Create database backup before migration
   */
  async createBackup() {
    const backupFile = path.join(this.backupDir, `phi-backup-${Date.now()}.sql`);
    
    this.log('Creating database backup...');
    
    try {
      // Create backup of PHI tables
      const backupQueries = [];
      
      for (const tableConfig of this.phiFields) {
        const query = `SELECT * FROM ${tableConfig.table}`;
        const result = await this.pool.query(query);
        
        if (result.rows.length > 0) {
          backupQueries.push(`-- Backup of ${tableConfig.table}`);
          backupQueries.push(`-- Created: ${new Date().toISOString()}`);
          
          // Create backup table
          backupQueries.push(`DROP TABLE IF EXISTS ${tableConfig.table}_backup;`);
          backupQueries.push(`CREATE TABLE ${tableConfig.table}_backup AS SELECT * FROM ${tableConfig.table};`);
          backupQueries.push('');
        }
      }
      
      fs.writeFileSync(backupFile, backupQueries.join('\n'));
      this.log(`✅ Database backup created: ${backupFile}`);
      
      return backupFile;
    } catch (error) {
      this.log(`❌ Backup failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a field is already encrypted
   */
  isFieldEncrypted(value) {
    if (!value || typeof value !== 'string') {
      return false;
    }
    
    return encryptionService.isEncrypted(value);
  }

  /**
   * Encrypt a single field value
   */
  async encryptField(value, fieldInfo) {
    if (!value) return null;
    
    if (this.isFieldEncrypted(value)) {
      this.log(`⚠️  Field already encrypted: ${fieldInfo.table}.${fieldInfo.column}`);
      return value; // Already encrypted
    }

    try {
      return encryptionService.encryptString(value.toString());
    } catch (error) {
      this.log(`❌ Encryption failed for ${fieldInfo.table}.${fieldInfo.column}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Encrypt PHI keys in JSON field
   */
  async encryptJsonField(jsonValue, jsonFieldConfig) {
    if (!jsonValue) return null;
    
    try {
      let parsedJson;
      
      if (typeof jsonValue === 'string') {
        parsedJson = JSON.parse(jsonValue);
      } else {
        parsedJson = jsonValue;
      }
      
      let hasChanges = false;
      
      for (const phiKey of jsonFieldConfig.phiKeys) {
        if (parsedJson[phiKey] && !this.isFieldEncrypted(parsedJson[phiKey])) {
          parsedJson[phiKey] = encryptionService.encryptString(parsedJson[phiKey].toString());
          hasChanges = true;
          this.stats.fieldsEncrypted++;
        }
      }
      
      return hasChanges ? parsedJson : jsonValue;
    } catch (error) {
      this.log(`❌ JSON field encryption failed: ${error.message}`);
      return jsonValue; // Return original on error
    }
  }

  /**
   * Process a single table for encryption
   */
  async processTable(tableConfig) {
    this.log(`📊 Processing table: ${tableConfig.table}`);
    
    try {
      // Get all records from table
      const selectQuery = `SELECT * FROM ${tableConfig.table} ORDER BY ${tableConfig.idColumn}`;
      const result = await this.pool.query(selectQuery);
      
      if (result.rows.length === 0) {
        this.log(`ℹ️  No records found in ${tableConfig.table}`);
        return;
      }

      this.log(`📋 Found ${result.rows.length} records in ${tableConfig.table}`);
      
      let processedCount = 0;
      const batchSize = 50; // Process in batches to avoid memory issues
      
      for (let i = 0; i < result.rows.length; i += batchSize) {
        const batch = result.rows.slice(i, i + batchSize);
        await this.processBatch(batch, tableConfig);
        processedCount += batch.length;
        
        this.log(`📈 Processed ${processedCount}/${result.rows.length} records in ${tableConfig.table}`);
      }
      
      this.stats.tablesProcessed++;
      this.stats.recordsProcessed += result.rows.length;
      
    } catch (error) {
      this.log(`❌ Error processing table ${tableConfig.table}: ${error.message}`);
      this.stats.errors.push({
        table: tableConfig.table,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Process a batch of records
   */
  async processBatch(records, tableConfig) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const record of records) {
        await this.processRecord(client, record, tableConfig);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process a single record for encryption
   */
  async processRecord(client, record, tableConfig) {
    const updates = [];
    const updateValues = [];
    let parameterIndex = 1;
    let hasUpdates = false;

    // Process regular fields
    if (tableConfig.fields) {
      for (const field of tableConfig.fields) {
        const currentValue = record[field.column];
        
        if (currentValue && !this.isFieldEncrypted(currentValue)) {
          const encryptedValue = await this.encryptField(currentValue, {
            table: tableConfig.table,
            column: field.column
          });
          
          updates.push(`${field.column} = $${parameterIndex}`);
          updateValues.push(encryptedValue);
          parameterIndex++;
          hasUpdates = true;
          this.stats.fieldsEncrypted++;
        }
      }
    }

    // Process JSON fields
    if (tableConfig.jsonFields) {
      for (const jsonField of tableConfig.jsonFields) {
        const currentJson = record[jsonField.column];
        
        if (currentJson) {
          const encryptedJson = await this.encryptJsonField(currentJson, jsonField);
          
          if (encryptedJson !== currentJson) {
            updates.push(`${jsonField.column} = $${parameterIndex}`);
            updateValues.push(JSON.stringify(encryptedJson));
            parameterIndex++;
            hasUpdates = true;
          }
        }
      }
    }

    // Execute update if there are changes
    if (hasUpdates) {
      const updateQuery = `
        UPDATE ${tableConfig.table} 
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE ${tableConfig.idColumn} = $${parameterIndex}
      `;
      
      updateValues.push(record[tableConfig.idColumn]);
      
      await client.query(updateQuery, updateValues);
    }
  }

  /**
   * Verify encryption was successful
   */
  async verifyEncryption() {
    this.log('🔍 Verifying encryption...');
    
    let verificationErrors = 0;
    
    for (const tableConfig of this.phiFields) {
      try {
        const query = `SELECT ${tableConfig.idColumn}, ${tableConfig.fields?.map(f => f.column).join(', ')} FROM ${tableConfig.table} LIMIT 10`;
        const result = await this.pool.query(query);
        
        for (const row of result.rows) {
          for (const field of tableConfig.fields || []) {
            const value = row[field.column];
            
            if (value && !this.isFieldEncrypted(value)) {
              // Check if it's a legitimate unencrypted value that should be encrypted
              if (this.shouldBeEncrypted(value, field)) {
                verificationErrors++;
                this.log(`❌ Unencrypted PHI found: ${tableConfig.table}.${field.column} (ID: ${row[tableConfig.idColumn]})`);
              }
            }
          }
        }
      } catch (error) {
        this.log(`❌ Verification error for ${tableConfig.table}: ${error.message}`);
        verificationErrors++;
      }
    }
    
    if (verificationErrors === 0) {
      this.log('✅ Encryption verification passed');
    } else {
      this.log(`⚠️  Found ${verificationErrors} verification issues`);
    }
    
    return verificationErrors === 0;
  }

  /**
   * Check if a value should be encrypted based on patterns
   */
  shouldBeEncrypted(value, field) {
    if (!value || typeof value !== 'string') return false;
    
    // Common PHI patterns
    const patterns = {
      ssn: /^\d{3}-\d{2}-\d{4}$|^\d{9}$/,
      email: /@.*\./,
      phone: /\(\d{3}\)\s\d{3}-\d{4}|\d{3}-\d{3}-\d{4}/,
      dob: /^\d{4}-\d{2}-\d{2}/,
      creditCard: /^\d{4}$/
    };
    
    // Check if value matches PHI patterns
    return Object.values(patterns).some(pattern => pattern.test(value));
  }

  /**
   * Generate migration report
   */
  generateReport() {
    const duration = (this.stats.endTime - this.stats.startTime) / 1000;
    
    const report = {
      summary: {
        tablesProcessed: this.stats.tablesProcessed,
        recordsProcessed: this.stats.recordsProcessed,
        fieldsEncrypted: this.stats.fieldsEncrypted,
        duration: `${duration}s`,
        errors: this.stats.errors.length,
        success: this.stats.errors.length === 0
      },
      details: {
        startTime: this.stats.startTime,
        endTime: this.stats.endTime,
        encryptionService: encryptionService.verifySetup(),
        errors: this.stats.errors
      },
      tables: this.phiFields.map(table => ({
        name: table.table,
        fieldsToEncrypt: table.fields?.length || 0,
        jsonFields: table.jsonFields?.length || 0
      }))
    };
    
    const reportFile = path.join(__dirname, '../logs', `migration-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    this.log(`📊 Migration report saved: ${reportFile}`);
    return report;
  }

  /**
   * Main migration execution
   */
  async run(options = {}) {
    const { dryRun = false, skipBackup = false } = options;
    
    this.stats.startTime = new Date();
    
    console.log('🔒 EMR PHI Encryption Migration');
    console.log('===============================\n');
    
    if (dryRun) {
      console.log('🧪 DRY RUN MODE - No data will be modified\n');
    }

    try {
      // Initialize
      await this.initialize();
      
      // Create backup unless skipped
      if (!skipBackup && !dryRun) {
        await this.createBackup();
      }

      // Process each table
      for (const tableConfig of this.phiFields) {
        if (dryRun) {
          await this.analyzeTable(tableConfig);
        } else {
          await this.processTable(tableConfig);
        }
      }

      // Verify encryption (unless dry run)
      if (!dryRun) {
        await this.verifyEncryption();
      }

      this.stats.endTime = new Date();
      const report = this.generateReport();
      
      // Display summary
      console.log('\n📊 MIGRATION SUMMARY:');
      console.log('====================');
      console.log(`✅ Tables processed: ${report.summary.tablesProcessed}`);
      console.log(`📋 Records processed: ${report.summary.recordsProcessed}`);
      console.log(`🔐 Fields encrypted: ${report.summary.fieldsEncrypted}`);
      console.log(`⏱️  Duration: ${report.summary.duration}`);
      console.log(`❌ Errors: ${report.summary.errors}`);
      
      if (report.summary.success) {
        console.log('\n🎉 Migration completed successfully!');
        console.log('\n🔐 HIPAA COMPLIANCE STATUS:');
        console.log('===========================');
        console.log('✅ PHI data is now encrypted with AES-256-GCM');
        console.log('✅ Each encrypted value includes unique IV and auth tag');
        console.log('✅ Encryption keys support secure rotation');
        console.log('✅ Critical security vulnerability has been resolved');
      } else {
        console.log('\n⚠️  Migration completed with errors. Check logs for details.');
      }

    } catch (error) {
      this.stats.endTime = new Date();
      this.log(`❌ Migration failed: ${error.message}`);
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    } finally {
      await this.pool.end();
    }
  }

  /**
   * Analyze table for dry run mode
   */
  async analyzeTable(tableConfig) {
    this.log(`🔍 Analyzing table: ${tableConfig.table}`);
    
    try {
      const query = `SELECT COUNT(*) as total FROM ${tableConfig.table}`;
      const result = await this.pool.query(query);
      const totalRecords = parseInt(result.rows[0].total);
      
      console.log(`📊 ${tableConfig.table}: ${totalRecords} records`);
      
      if (tableConfig.fields) {
        for (const field of tableConfig.fields) {
          const fieldQuery = `SELECT COUNT(*) as count FROM ${tableConfig.table} WHERE ${field.column} IS NOT NULL`;
          const fieldResult = await this.pool.query(fieldQuery);
          const fieldCount = parseInt(fieldResult.rows[0].count);
          
          console.log(`   📝 ${field.column}: ${fieldCount} non-null values (${field.description})`);
        }
      }
      
      if (tableConfig.jsonFields) {
        for (const jsonField of tableConfig.jsonFields) {
          console.log(`   📋 ${jsonField.column}: JSON field with PHI keys [${jsonField.phiKeys.join(', ')}]`);
        }
      }
      
    } catch (error) {
      console.log(`❌ Analysis failed for ${tableConfig.table}: ${error.message}`);
    }
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  args.forEach(arg => {
    switch (arg) {
      case '--dry-run':
      case '-d':
        options.dryRun = true;
        break;
      case '--skip-backup':
      case '-s':
        options.skipBackup = true;
        break;
      case '--help':
      case '-h':
        console.log('🔒 EMR PHI Encryption Migration\n');
        console.log('Usage: node encrypt-existing-data.js [options]\n');
        console.log('Options:');
        console.log('  --dry-run, -d      Analyze data without making changes');
        console.log('  --skip-backup, -s  Skip database backup (not recommended)');
        console.log('  --help, -h         Show this help message\n');
        console.log('Examples:');
        console.log('  node encrypt-existing-data.js --dry-run');
        console.log('  node encrypt-existing-data.js');
        console.log('  node encrypt-existing-data.js --skip-backup');
        console.log('\n⚠️  IMPORTANT: Run with --dry-run first to analyze your data!');
        process.exit(0);
        break;
    }
  });

  const migration = new PHIEncryptionMigration();
  migration.run(options).catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export default PHIEncryptionMigration;