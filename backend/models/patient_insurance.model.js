// backend/models/patient_insurance.model.js
import pool from '../db/index.js';
import encryptionService from '../services/encryption.service.js';

class PatientInsuranceModel {
  constructor() {
    this.tableName = 'patient_insurance';
    this.safeViewName = 'patient_insurance_safe';
  }

  /**
   * Get all patient insurance records (using safe view with masked SSN)
   */
  async findAll(options = {}) {
    const { limit = 500, offset = 0, patientId = null } = options;
    
    let query = `
      SELECT * FROM ${this.safeViewName}
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (patientId) {
      query += ` AND patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get single patient insurance record by ID (using safe view)
   */
  async findById(id, options = {}) {
    const { userId = null, purpose = 'Insurance record lookup' } = options;
    
    const query = `SELECT * FROM ${this.safeViewName} WHERE id = $1`;
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      throw new Error(`Patient insurance record ${id} not found`);
    }

    // Log the access for audit
    await this.logAccess(id, 'view', userId, purpose);
    
    return result.rows[0];
  }

  /**
   * Get patient insurance records by patient ID
   */
  async findByPatientId(patientId, options = {}) {
    const { userId = null, purpose = 'Patient insurance lookup' } = options;
    
    const query = `SELECT * FROM ${this.safeViewName} WHERE patient_id = $1 ORDER BY priority_order, created_at DESC`;
    const result = await pool.query(query, [patientId]);
    
    // Log access for each record
    for (const record of result.rows) {
      await this.logAccess(record.id, 'view', userId, purpose);
    }
    
    return result.rows;
  }

  /**
   * Create new patient insurance record with SSN encryption
   */
  async create(data, options = {}) {
    const { userId = null, purpose = 'Creating insurance record' } = options;
    
    const {
      patient_id,
      insurance_plan_id,
      policy_number,
      group_number,
      subscriber_id,
      subscriber_name,
      subscriber_ssn, // This will be encrypted
      subscriber_relationship,
      subscriber_dob,
      effective_date,
      termination_date,
      priority_order,
      copay_primary_care,
      copay_specialist,
      deductible,
      deductible_met,
      out_of_pocket_max,
      out_of_pocket_met,
      covers_prescriptions,
      covers_mental_health,
      covers_vision,
      covers_dental,
      status,
      verification_date,
      verified_by,
      notes
    } = data;

    // Encrypt SSN if provided
    let encryptedSSN = null;
    if (subscriber_ssn && subscriber_ssn.trim() !== '') {
      try {
        encryptedSSN = encryptionService.encryptString(subscriber_ssn.trim());
        
        // Log the encryption
        await this.logEncryptionActivity('encrypt', {
          purpose: 'New insurance record creation',
          userId,
          hashedSSN: await this.hashForAudit(subscriber_ssn)
        });
      } catch (error) {
        throw new Error(`Failed to encrypt SSN: ${error.message}`);
      }
    }

    const query = `
      INSERT INTO ${this.tableName} (
        patient_id, insurance_plan_id, policy_number, group_number,
        subscriber_id, subscriber_name, subscriber_ssn_encrypted, subscriber_relationship,
        subscriber_dob, effective_date, termination_date, priority_order,
        copay_primary_care, copay_specialist, deductible, deductible_met,
        out_of_pocket_max, out_of_pocket_met, covers_prescriptions,
        covers_mental_health, covers_vision, covers_dental, status,
        verification_date, verified_by, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26
      ) RETURNING id, patient_id, insurance_plan_id, created_at, updated_at
    `;

    const params = [
      patient_id,
      insurance_plan_id || null,
      policy_number || null,
      group_number || null,
      subscriber_id || null,
      subscriber_name || null,
      encryptedSSN,
      subscriber_relationship || null,
      subscriber_dob || null,
      effective_date || null,
      termination_date || null,
      priority_order || 1,
      copay_primary_care || null,
      copay_specialist || null,
      deductible || null,
      deductible_met || false,
      out_of_pocket_max || null,
      out_of_pocket_met || false,
      covers_prescriptions || true,
      covers_mental_health || true,
      covers_vision || false,
      covers_dental || false,
      status || 'active',
      verification_date || null,
      verified_by || null,
      notes || null
    ];

    const result = await pool.query(query, params);
    
    // Log the creation
    await this.logAccess(result.rows[0].id, 'create', userId, purpose);
    
    return result.rows[0];
  }

  /**
   * Update patient insurance record with SSN encryption handling
   */
  async update(id, data, options = {}) {
    const { userId = null, purpose = 'Updating insurance record' } = options;
    
    // First check if record exists
    const existingQuery = `SELECT id, subscriber_ssn_encrypted FROM ${this.tableName} WHERE id = $1`;
    const existingResult = await pool.query(existingQuery, [id]);
    
    if (existingResult.rows.length === 0) {
      throw new Error(`Patient insurance record ${id} not found`);
    }

    const updateFields = [];
    const params = [id];
    let paramIndex = 2;

    // Handle SSN encryption if provided
    if (data.subscriber_ssn !== undefined) {
      if (data.subscriber_ssn && data.subscriber_ssn.trim() !== '') {
        try {
          const encryptedSSN = encryptionService.encryptString(data.subscriber_ssn.trim());
          updateFields.push(`subscriber_ssn_encrypted = $${paramIndex}`);
          params.push(encryptedSSN);
          paramIndex++;
          
          // Log the encryption
          await this.logEncryptionActivity('update', {
            recordId: id,
            purpose: 'Insurance record SSN update',
            userId,
            hashedSSN: await this.hashForAudit(data.subscriber_ssn)
          });
        } catch (error) {
          throw new Error(`Failed to encrypt SSN: ${error.message}`);
        }
      } else {
        // Clear SSN if empty string provided
        updateFields.push(`subscriber_ssn_encrypted = NULL`);
      }
    }

    // Handle other fields
    const fieldsToUpdate = [
      'insurance_plan_id', 'policy_number', 'group_number', 'subscriber_id',
      'subscriber_name', 'subscriber_relationship', 'subscriber_dob',
      'effective_date', 'termination_date', 'priority_order',
      'copay_primary_care', 'copay_specialist', 'deductible', 'deductible_met',
      'out_of_pocket_max', 'out_of_pocket_met', 'covers_prescriptions',
      'covers_mental_health', 'covers_vision', 'covers_dental', 'status',
      'verification_date', 'verified_by', 'notes'
    ];

    fieldsToUpdate.forEach(field => {
      if (data[field] !== undefined) {
        updateFields.push(`${field} = $${paramIndex}`);
        params.push(data[field]);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      throw new Error('No fields to update');
    }

    // Add updated_at
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

    const query = `
      UPDATE ${this.tableName} 
      SET ${updateFields.join(', ')}
      WHERE id = $1
      RETURNING id, patient_id, insurance_plan_id, updated_at
    `;

    const result = await pool.query(query, params);
    
    // Log the update
    await this.logAccess(id, 'update', userId, purpose);
    
    return result.rows[0];
  }

  /**
   * Delete patient insurance record
   */
  async delete(id, options = {}) {
    const { userId = null, purpose = 'Deleting insurance record' } = options;
    
    // Log before deletion
    await this.logAccess(id, 'delete', userId, purpose);
    
    const query = `DELETE FROM ${this.tableName} WHERE id = $1`;
    const result = await pool.query(query, [id]);
    
    return result.rowCount > 0;
  }

  /**
   * Get decrypted SSN (requires special permissions and logging)
   */
  async getDecryptedSSN(id, options = {}) {
    const { userId = null, purpose = 'SSN decryption for authorized purpose' } = options;
    
    if (!userId) {
      throw new Error('User ID required for SSN decryption');
    }

    if (!purpose || purpose.trim() === '') {
      throw new Error('Purpose required for SSN decryption');
    }

    try {
      // Use the secure database function
      const query = `SELECT get_decrypted_ssn($1, $2, $3) as encrypted_ssn`;
      const result = await pool.query(query, [id, userId, purpose]);
      
      if (!result.rows[0].encrypted_ssn) {
        return null;
      }

      // Decrypt using encryption service
      const decryptedSSN = encryptionService.decryptString(result.rows[0].encrypted_ssn);
      
      // Additional audit logging
      await this.logEncryptionActivity('decrypt', {
        recordId: id,
        purpose,
        userId,
        hashedSSN: await this.hashForAudit(decryptedSSN)
      });
      
      return decryptedSSN;
    } catch (error) {
      // Log the failure
      await this.logEncryptionActivity('decrypt_error', {
        recordId: id,
        purpose,
        userId,
        error: error.message
      });
      throw new Error(`Failed to decrypt SSN: ${error.message}`);
    }
  }

  /**
   * Log access for audit trail
   */
  async logAccess(recordId, accessType, userId = null, purpose = '') {
    try {
      const query = `
        INSERT INTO ssn_access_log (
          patient_insurance_id, user_id, access_type, purpose, 
          ip_address, accessed_at
        ) VALUES ($1, $2, $3, $4, inet_client_addr(), CURRENT_TIMESTAMP)
      `;
      
      await pool.query(query, [recordId, userId, accessType, purpose]);
    } catch (error) {
      console.error('Failed to log access:', error.message);
      // Don't throw - logging failure shouldn't break business logic
    }
  }

  /**
   * Log encryption/decryption activities
   */
  async logEncryptionActivity(action, metadata) {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        action,
        metadata,
        service: 'PatientInsuranceModel'
      };
      
      console.log(`[AUDIT] ${JSON.stringify(logEntry)}`);
    } catch (error) {
      console.error('Failed to log encryption activity:', error.message);
    }
  }

  /**
   * Create hash of SSN for audit purposes (non-reversible)
   */
  async hashForAudit(ssn) {
    if (!ssn) return null;
    
    // Create a simple hash for audit purposes
    // In production, use a proper cryptographic hash
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(ssn).digest('hex').substring(0, 16);
  }

  /**
   * Get statistics for admin/reporting
   */
  async getStatistics() {
    const queries = [
      'SELECT COUNT(*) as total_records FROM patient_insurance',
      'SELECT COUNT(*) as encrypted_records FROM patient_insurance WHERE subscriber_ssn_encrypted IS NOT NULL',
      'SELECT COUNT(*) as plaintext_records FROM patient_insurance WHERE subscriber_ssn IS NOT NULL',
      'SELECT COUNT(DISTINCT patient_id) as unique_patients FROM patient_insurance'
    ];

    const results = await Promise.all(
      queries.map(query => pool.query(query))
    );

    return {
      totalRecords: parseInt(results[0].rows[0].total_records),
      encryptedRecords: parseInt(results[1].rows[0].encrypted_records),
      plaintextRecords: parseInt(results[2].rows[0].plaintext_records),
      uniquePatients: parseInt(results[3].rows[0].unique_patients),
      encryptionRate: results[0].rows[0].total_records > 0 
        ? Math.round((results[1].rows[0].encrypted_records / results[0].rows[0].total_records) * 100) 
        : 0
    };
  }

  /**
   * Validate SSN format
   */
  validateSSN(ssn) {
    if (!ssn) return { valid: true, message: 'SSN is optional' };
    
    // Remove any formatting
    const cleanSSN = ssn.replace(/[^0-9]/g, '');
    
    if (cleanSSN.length !== 9) {
      return { valid: false, message: 'SSN must be 9 digits' };
    }

    // Basic validation rules
    if (cleanSSN === '000000000' || cleanSSN === '999999999') {
      return { valid: false, message: 'Invalid SSN format' };
    }

    if (cleanSSN.substring(0, 3) === '000' || cleanSSN.substring(3, 5) === '00') {
      return { valid: false, message: 'Invalid SSN format' };
    }

    return { valid: true, formatted: `${cleanSSN.substring(0, 3)}-${cleanSSN.substring(3, 5)}-${cleanSSN.substring(5)}` };
  }
}

export default new PatientInsuranceModel();