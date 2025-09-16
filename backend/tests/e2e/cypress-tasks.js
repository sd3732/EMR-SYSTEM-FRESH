// Cypress Custom Tasks for HIPAA E2E Testing
// Database and environment setup tasks for end-to-end testing

import pool from '../../db/index.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export default {
  async setupTestDatabase() {
    console.log('Setting up test database...');
    
    try {
      // Clean up any existing test data
      await pool.query('DELETE FROM phi_access_logs WHERE user_id IN (SELECT id FROM providers WHERE email LIKE %test%example.com%)');
      await pool.query('DELETE FROM authentication_logs WHERE user_id IN (SELECT id FROM providers WHERE email LIKE %test%example.com%)');
      await pool.query('DELETE FROM lab_results WHERE patient_id IN (SELECT id FROM patients WHERE last_name = "Doe")');
      await pool.query('DELETE FROM lab_tests WHERE patient_id IN (SELECT id FROM patients WHERE last_name = "Doe")');
      await pool.query('DELETE FROM lab_orders WHERE patient_id IN (SELECT id FROM patients WHERE last_name = "Doe")');
      await pool.query('DELETE FROM vitals WHERE encounter_id IN (SELECT id FROM encounters WHERE patient_id IN (SELECT id FROM patients WHERE last_name = "Doe"))');
      await pool.query('DELETE FROM encounters WHERE patient_id IN (SELECT id FROM patients WHERE last_name = "Doe")');
      await pool.query('DELETE FROM patients WHERE last_name = "Doe"');
      await pool.query('DELETE FROM providers WHERE email LIKE %test%example.com%');
      
      return 'Database setup completed';
    } catch (error) {
      console.error('Database setup error:', error);
      throw error;
    }
  },

  async createTestUser(userData) {
    console.log('Creating test user:', userData.email);
    
    try {
      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      // Insert user
      const result = await pool.query(`
        INSERT INTO providers (first_name, last_name, email, password_hash, specialty, npi, role) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (email) DO UPDATE SET 
          password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role
        RETURNING id
      `, [
        userData.firstName,
        userData.lastName,
        userData.email,
        hashedPassword,
        'Internal Medicine',
        '1234567890',
        userData.role
      ]);

      return { id: result.rows[0].id, ...userData };
    } catch (error) {
      console.error('Create user error:', error);
      throw error;
    }
  },

  async createTestPatient(patientData) {
    console.log('Creating test patient:', patientData.firstName, patientData.lastName);
    
    try {
      // Insert patient
      const result = await pool.query(`
        INSERT INTO patients (
          first_name, last_name, dob, gender, ssn, phone, email,
          address_line1, city, state, zip_code, country,
          ethnicity, race, primary_language,
          insurance_type, insurance_member_id, insurance_group_number, insurance_plan_name
        ) VALUES (
          $1, $2, $3, 'male', $4, '555-123-4567', 'test@patient.com',
          '123 Test St', 'Test City', 'CA', '12345', 'USA',
          'non-hispanic', 'white', 'English',
          'commercial', 'TEST123', 'GRP456', 'Test Health Plan'
        )
        ON CONFLICT (ssn) DO UPDATE SET 
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name
        RETURNING id
      `, [
        patientData.firstName,
        patientData.lastName,
        patientData.dob,
        patientData.ssn
      ]);

      return { id: result.rows[0].id, ...patientData };
    } catch (error) {
      console.error('Create patient error:', error);
      throw error;
    }
  },

  async createTestEncounter(encounterId, patientId, providerId) {
    console.log('Creating test encounter for patient:', patientId);
    
    try {
      const result = await pool.query(`
        INSERT INTO encounters (
          patient_id, provider_id, encounter_type, encounter_date, 
          chief_complaint, status, visit_notes
        ) VALUES (
          $1, $2, 'office-visit', CURRENT_TIMESTAMP,
          'Test encounter for E2E testing', 'completed',
          'Automated test encounter - no actual patient care provided'
        )
        RETURNING id
      `, [patientId, providerId]);

      return result.rows[0].id;
    } catch (error) {
      console.error('Create encounter error:', error);
      throw error;
    }
  },

  async createTestLabOrder(patientId, providerId) {
    console.log('Creating test lab order for patient:', patientId);
    
    try {
      // Create lab order
      const orderResult = await pool.query(`
        INSERT INTO lab_orders (
          patient_id, provider_id, clinical_indication, priority, status
        ) VALUES (
          $1, $2, 'E2E testing lab order', 'routine', 'pending'
        )
        RETURNING id
      `, [patientId, providerId]);

      const orderId = orderResult.rows[0].id;

      // Create test in the order
      await pool.query(`
        INSERT INTO lab_tests (
          order_id, patient_id, loinc_code, test_name, specimen_type, status
        ) VALUES (
          $1, $2, '2951-2', 'Glucose', 'serum', 'pending'
        )
      `, [orderId, patientId]);

      return orderId;
    } catch (error) {
      console.error('Create lab order error:', error);
      throw error;
    }
  },

  async cleanupTestData() {
    console.log('Cleaning up test data...');
    
    try {
      // Clean up in reverse dependency order
      await pool.query('DELETE FROM lab_results WHERE patient_id IN (SELECT id FROM patients WHERE last_name = "Doe" OR last_name = "Patient")');
      await pool.query('DELETE FROM lab_tests WHERE patient_id IN (SELECT id FROM patients WHERE last_name = "Doe" OR last_name = "Patient")');
      await pool.query('DELETE FROM lab_orders WHERE patient_id IN (SELECT id FROM patients WHERE last_name = "Doe" OR last_name = "Patient")');
      await pool.query('DELETE FROM vitals WHERE encounter_id IN (SELECT id FROM encounters WHERE patient_id IN (SELECT id FROM patients WHERE last_name = "Doe" OR last_name = "Patient"))');
      await pool.query('DELETE FROM encounters WHERE patient_id IN (SELECT id FROM patients WHERE last_name = "Doe" OR last_name = "Patient")');
      await pool.query('DELETE FROM phi_access_logs WHERE patient_id IN (SELECT id FROM patients WHERE last_name = "Doe" OR last_name = "Patient")');
      await pool.query('DELETE FROM patients WHERE last_name = "Doe" OR last_name = "Patient"');
      await pool.query('DELETE FROM authentication_logs WHERE user_id IN (SELECT id FROM providers WHERE email LIKE %test%example.com%)');
      await pool.query('DELETE FROM phi_access_logs WHERE user_id IN (SELECT id FROM providers WHERE email LIKE %test%example.com%)');
      await pool.query('DELETE FROM providers WHERE email LIKE %test%example.com%');
      
      return 'Cleanup completed';
    } catch (error) {
      console.error('Cleanup error:', error);
      throw error;
    }
  },

  async verifyAuditLog(userId, patientId, actionType) {
    console.log('Verifying audit log:', { userId, patientId, actionType });
    
    try {
      const result = await pool.query(`
        SELECT * FROM phi_access_logs 
        WHERE user_id = $1 AND patient_id = $2 AND action_type = $3
        AND created_at > CURRENT_TIMESTAMP - INTERVAL '5 minutes'
        ORDER BY created_at DESC
        LIMIT 1
      `, [userId, patientId, actionType]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('Verify audit log error:', error);
      throw error;
    }
  },

  async checkCriticalValues(patientId) {
    console.log('Checking critical values for patient:', patientId);
    
    try {
      const result = await pool.query(`
        SELECT lr.* FROM lab_results lr
        JOIN lab_tests lt ON lr.test_id = lt.id
        WHERE lt.patient_id = $1 
        AND lr.is_critical = true
        AND lr.acknowledged_at IS NULL
        ORDER BY lr.created_at DESC
      `, [patientId]);

      return result.rows;
    } catch (error) {
      console.error('Check critical values error:', error);
      throw error;
    }
  },

  async simulateSessionTimeout(userId) {
    console.log('Simulating session timeout for user:', userId);
    
    try {
      // Update user sessions to be expired
      await pool.query(`
        UPDATE authentication_logs 
        SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 hour'
        WHERE user_id = $1 AND success = true
        AND expires_at > CURRENT_TIMESTAMP
      `, [userId]);

      return 'Session timeout simulated';
    } catch (error) {
      console.error('Simulate session timeout error:', error);
      throw error;
    }
  },

  async generateTestToken(userData) {
    console.log('Generating test token for:', userData.email);
    
    try {
      const token = jwt.sign(
        { 
          id: userData.id, 
          email: userData.email, 
          role: userData.role 
        },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '15m' }
      );

      return token;
    } catch (error) {
      console.error('Generate token error:', error);
      throw error;
    }
  },

  async checkEncryptionStatus(patientId, dataType) {
    console.log('Checking encryption status:', { patientId, dataType });
    
    try {
      let query, params;
      
      if (dataType === 'ssn') {
        query = 'SELECT ssn FROM patients WHERE id = $1';
        params = [patientId];
      } else if (dataType === 'lab_result') {
        query = `
          SELECT lr.result_value, lr.is_encrypted 
          FROM lab_results lr
          JOIN lab_tests lt ON lr.test_id = lt.id
          WHERE lt.patient_id = $1
          ORDER BY lr.created_at DESC
          LIMIT 1
        `;
        params = [patientId];
      } else {
        throw new Error('Unknown data type for encryption check');
      }

      const result = await pool.query(query, params);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('Check encryption error:', error);
      throw error;
    }
  },

  async createAnomalousActivity(userId, patientId) {
    console.log('Creating anomalous activity for testing:', { userId, patientId });
    
    try {
      // Create multiple rapid accesses to trigger anomaly detection
      for (let i = 0; i < 25; i++) {
        await pool.query(`
          INSERT INTO phi_access_logs (
            user_id, patient_id, resource_type, action_type,
            action_description, session_id, ip_address, user_agent
          ) VALUES (
            $1, $2, 'patients', 'read',
            'Anomalous test access', 'test-session', '192.168.1.100', 'Test Agent'
          )
        `, [userId, patientId]);
      }

      return 'Anomalous activity created';
    } catch (error) {
      console.error('Create anomalous activity error:', error);
      throw error;
    }
  },

  async validateHIPAACompliance(reportData) {
    console.log('Validating HIPAA compliance for report data');
    
    try {
      const requiredFields = [
        'timestamp', 'userId', 'patientId', 'actionType', 
        'resourceType', 'ipAddress', 'sessionId'
      ];

      const compliance = {
        isCompliant: true,
        missingFields: [],
        issues: []
      };

      if (!reportData.entries || !Array.isArray(reportData.entries)) {
        compliance.isCompliant = false;
        compliance.issues.push('Missing audit entries array');
        return compliance;
      }

      reportData.entries.forEach((entry, index) => {
        requiredFields.forEach(field => {
          if (!entry.hasOwnProperty(field) || entry[field] === null) {
            compliance.isCompliant = false;
            compliance.missingFields.push(`Entry ${index}: ${field}`);
          }
        });
      });

      // Check for data retention compliance
      const oldEntries = reportData.entries.filter(entry => {
        const entryDate = new Date(entry.timestamp);
        const sixYearsAgo = new Date();
        sixYearsAgo.setFullYear(sixYearsAgo.getFullYear() - 6);
        return entryDate < sixYearsAgo;
      });

      if (oldEntries.length > 0) {
        compliance.issues.push(`Found ${oldEntries.length} entries older than 6 years - should be purged`);
      }

      return compliance;
    } catch (error) {
      console.error('HIPAA validation error:', error);
      throw error;
    }
  }
};