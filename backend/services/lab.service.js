// Lab Service for EMR System
// Handles lab order creation, result processing, and critical value management
import pool from '../db/index.js';
import auditService from './audit.service.js';
import encryptionService from './encryption.service.js';
import criticalValuesService from './critical-values.service.js';

class LabService {
  constructor() {
    this.sensitiveTests = [
      '33747-0', // HIV-1 RNA
      '5017-9',  // HIV-1 Ab
      '31209-7', // HCV RNA
      '13955-0', // Hepatitis B Surface Antigen
      '82747-9', // SARS-CoV-2 RNA
      '94500-6', // SARS-CoV-2 RNA ORF1ab
    ];
  }

  /**
   * Create a new lab order with multiple tests
   * @param {Object} orderData - Lab order details
   * @param {number} userId - Provider ID placing the order
   * @returns {Object} Created lab order with tests
   */
  async createLabOrder(orderData, userId) {
    const {
      patientId,
      encounterId = null,
      priority = 'routine',
      clinicalIndication,
      fastingRequired = false,
      specialInstructions = null,
      tests = [], // Array of LOINC codes or panel names
      orderingFacility = 'Main Lab'
    } = orderData;

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Log order creation attempt
      await auditService.logPHIAccess(
        userId,
        'lab_orders',
        patientId,
        'create_lab_order',
        `Creating lab order with ${tests.length} tests`,
        'Clinical lab ordering'
      );

      // Create the main lab order
      const orderResult = await client.query(`
        INSERT INTO lab_orders (
          patient_id, provider_id, encounter_id, priority, 
          clinical_indication, fasting_required, special_instructions, ordering_facility
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        patientId, userId, encounterId, priority,
        clinicalIndication, fastingRequired, specialInstructions, orderingFacility
      ]);

      const labOrder = orderResult.rows[0];
      const orderId = labOrder.id;

      // Process tests (could be individual LOINC codes or panel names)
      const labTests = [];
      for (const test of tests) {
        if (test.panelName) {
          // Add tests from a panel
          const panelTests = await this.addPanelToOrder(orderId, test.panelName, client);
          labTests.push(...panelTests);
        } else {
          // Add individual test
          const individualTest = await this.addTestToOrder(orderId, test, client);
          labTests.push(individualTest);
        }
      }

      await client.query('COMMIT');

      // Log successful order creation
      await auditService.logPHIAccess(
        userId,
        'lab_orders',
        patientId,
        'lab_order_created',
        `Lab order ${orderId} created with ${labTests.length} tests`,
        'Clinical lab ordering'
      );

      return {
        success: true,
        labOrder: {
          ...labOrder,
          tests: labTests
        },
        message: `Lab order created successfully with ${labTests.length} tests`
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[LabService] Error creating lab order:', error);
      throw new Error(`Failed to create lab order: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Add individual test to lab order
   * @param {number} orderId - Lab order ID
   * @param {Object} testData - Test details
   * @param {Object} client - Database client
   * @returns {Object} Created lab test
   */
  async addTestToOrder(orderId, testData, client) {
    const {
      loincCode,
      testName,
      specimenType = 'serum',
      collectionMethod = null,
      tubeType = null,
      volumeRequired = null
    } = testData;

    const result = await client.query(`
      INSERT INTO lab_tests (
        lab_order_id, loinc_code, test_name, specimen_type,
        collection_method, tube_type, volume_required
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      orderId, loincCode, testName, specimenType,
      collectionMethod, tubeType, volumeRequired
    ]);

    return result.rows[0];
  }

  /**
   * Add tests from a panel to lab order
   * @param {number} orderId - Lab order ID
   * @param {string} panelName - Panel name
   * @param {Object} client - Database client
   * @returns {Array} Created lab tests
   */
  async addPanelToOrder(orderId, panelName, client) {
    // Get panel details
    const panelResult = await client.query(`
      SELECT loinc_codes, test_names FROM lab_panels 
      WHERE panel_name = $1
    `, [panelName]);

    if (panelResult.rows.length === 0) {
      throw new Error(`Lab panel '${panelName}' not found`);
    }

    const panel = panelResult.rows[0];
    const loincCodes = panel.loinc_codes;
    const testNames = panel.test_names;
    const tests = [];

    // Add each test in the panel
    for (let i = 0; i < loincCodes.length; i++) {
      const test = await this.addTestToOrder(orderId, {
        loincCode: loincCodes[i],
        testName: testNames[i],
        specimenType: 'serum'
      }, client);
      tests.push(test);
    }

    return tests;
  }

  /**
   * Add tests to existing order
   * @param {number} orderId - Lab order ID
   * @param {Array} loincCodes - Array of LOINC codes to add
   * @param {number} userId - Provider ID
   * @returns {Array} Added tests
   */
  async addTestsToOrder(orderId, loincCodes, userId) {
    try {
      const client = await pool.connect();
      const addedTests = [];

      try {
        await client.query('BEGIN');

        for (const loincCode of loincCodes) {
          // Get test details from reference data (you might have a reference table)
          const testName = await this.getTestNameByLoinc(loincCode);
          
          const test = await this.addTestToOrder(orderId, {
            loincCode,
            testName,
            specimenType: 'serum'
          }, client);
          
          addedTests.push(test);
        }

        await client.query('COMMIT');

        // Log the addition
        await auditService.logPHIAccess(
          userId,
          'lab_tests',
          null,
          'add_tests_to_order',
          `Added ${loincCodes.length} tests to order ${orderId}`,
          'Clinical lab ordering'
        );

        return addedTests;

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('[LabService] Error adding tests to order:', error);
      throw new Error(`Failed to add tests to order: ${error.message}`);
    }
  }

  /**
   * Process incoming lab results (typically from HL7 messages)
   * @param {Object} resultData - Lab result details
   * @param {number} userId - User processing the result
   * @returns {Object} Processing result
   */
  async receiveResults(resultData, userId) {
    const {
      testId,
      resultValue,
      numericValue = null,
      unit,
      referenceRange,
      abnormalFlag = '',
      resultStatus = 'preliminary',
      resultDate,
      labTechnician = null,
      instrumentId = null,
      interpretation = null
    } = resultData;

    try {
      // Get test details to check if it's sensitive
      const testResult = await pool.query(`
        SELECT lt.loinc_code, lt.test_name, lo.patient_id 
        FROM lab_tests lt 
        JOIN lab_orders lo ON lt.lab_order_id = lo.id 
        WHERE lt.id = $1
      `, [testId]);

      if (testResult.rows.length === 0) {
        throw new Error(`Lab test with ID ${testId} not found`);
      }

      const test = testResult.rows[0];
      const patientId = test.patient_id;
      const loincCode = test.loinc_code;

      // Check if this is a sensitive test that needs encryption
      const isSensitive = this.sensitiveTests.includes(loincCode);
      let encryptedValue = null;
      let encryptionKeyId = null;
      let finalResultValue = resultValue;

      if (isSensitive) {
        const encryption = await encryptionService.encryptSensitiveData(resultValue, patientId);
        encryptedValue = encryption.encryptedData;
        encryptionKeyId = encryption.keyId;
        finalResultValue = '[ENCRYPTED]'; // Store placeholder in main field
      }

      // Insert the result
      const result = await pool.query(`
        INSERT INTO lab_results (
          lab_test_id, result_value, numeric_value, unit, reference_range,
          abnormal_flag, result_status, result_date, lab_technician,
          instrument_id, interpretation, encrypted_value, encryption_key_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        testId, finalResultValue, numericValue, unit, referenceRange,
        abnormalFlag, resultStatus, resultDate, labTechnician,
        instrumentId, interpretation, encryptedValue, encryptionKeyId
      ]);

      const labResult = result.rows[0];
      const resultId = labResult.id;

      // Check for critical values
      const isCritical = await criticalValuesService.checkCriticalValue(
        loincCode, numericValue, patientId
      );

      if (isCritical) {
        await this.flagCriticalValues(resultId, userId);
      }

      // Update test status
      await pool.query(`
        UPDATE lab_tests SET status = 'completed' WHERE id = $1
      `, [testId]);

      // Log result receipt
      await auditService.logPHIAccess(
        userId,
        'lab_results',
        patientId,
        'result_received',
        `Result received for ${test.test_name}${isCritical ? ' (CRITICAL)' : ''}`,
        'Lab result processing'
      );

      return {
        success: true,
        result: labResult,
        isCritical,
        message: isCritical ? 
          'Result received and flagged as critical - notification sent' :
          'Result received successfully'
      };

    } catch (error) {
      console.error('[LabService] Error receiving results:', error);
      throw new Error(`Failed to process lab result: ${error.message}`);
    }
  }

  /**
   * Flag critical values and initiate notification process
   * @param {number} resultId - Lab result ID
   * @param {number} userId - User flagging the result
   * @returns {Object} Critical value handling result
   */
  async flagCriticalValues(resultId, userId) {
    try {
      // Update result as critical
      await pool.query(`
        UPDATE lab_results SET is_critical = true WHERE id = $1
      `, [resultId]);

      // Get result details for notification
      const resultDetails = await pool.query(`
        SELECT lr.*, lt.test_name, lt.loinc_code, lo.patient_id, lo.provider_id
        FROM lab_results lr
        JOIN lab_tests lt ON lr.lab_test_id = lt.id
        JOIN lab_orders lo ON lt.lab_order_id = lo.id
        WHERE lr.id = $1
      `, [resultId]);

      const result = resultDetails.rows[0];

      // Initiate critical value notification
      const notification = await criticalValuesService.sendCriticalValueNotification(
        resultId, result.patient_id, result.provider_id, userId
      );

      return {
        success: true,
        notification,
        message: 'Critical value flagged and notification sent'
      };

    } catch (error) {
      console.error('[LabService] Error flagging critical value:', error);
      throw new Error(`Failed to flag critical value: ${error.message}`);
    }
  }

  /**
   * Get result trends for a patient and specific test
   * @param {number} patientId - Patient ID
   * @param {string} loincCode - LOINC code of the test
   * @param {number} months - Number of months to look back
   * @returns {Array} Result trend data
   */
  async getResultTrends(patientId, loincCode, months = 12) {
    try {
      const result = await pool.query(`
        SELECT 
          lr.result_date,
          lr.numeric_value,
          lr.result_value,
          lr.unit,
          lr.abnormal_flag,
          lr.is_critical,
          lt.test_name,
          lrr.reference_low,
          lrr.reference_high
        FROM lab_results lr
        JOIN lab_tests lt ON lr.lab_test_id = lt.id
        JOIN lab_orders lo ON lt.lab_order_id = lo.id
        LEFT JOIN lab_reference_ranges lrr ON lt.loinc_code = lrr.loinc_code
        WHERE lo.patient_id = $1 
        AND lt.loinc_code = $2
        AND lr.result_date >= CURRENT_DATE - INTERVAL '${months} months'
        AND lr.result_status = 'final'
        ORDER BY lr.result_date ASC
      `, [patientId, loincCode]);

      return {
        success: true,
        data: result.rows,
        testName: result.rows[0]?.test_name || 'Unknown Test',
        loincCode,
        patientId,
        timeRange: `${months} months`
      };

    } catch (error) {
      console.error('[LabService] Error getting result trends:', error);
      throw new Error(`Failed to get result trends: ${error.message}`);
    }
  }

  /**
   * Get lab order with tests and results
   * @param {number} orderId - Lab order ID
   * @param {number} userId - User requesting the data
   * @returns {Object} Complete lab order details
   */
  async getLabOrderById(orderId, userId) {
    try {
      const orderResult = await pool.query(`
        SELECT 
          lo.*,
          p.first_name, p.last_name, p.dob,
          pr.first_name as provider_first_name, pr.last_name as provider_last_name
        FROM lab_orders lo
        JOIN patients p ON lo.patient_id = p.id
        JOIN providers pr ON lo.provider_id = pr.id
        WHERE lo.id = $1
      `, [orderId]);

      if (orderResult.rows.length === 0) {
        throw new Error(`Lab order ${orderId} not found`);
      }

      const order = orderResult.rows[0];

      // Get tests and results
      const testsResult = await pool.query(`
        SELECT 
          lt.*,
          lr.id as result_id,
          lr.result_value,
          lr.numeric_value,
          lr.unit,
          lr.reference_range,
          lr.abnormal_flag,
          lr.result_status,
          lr.result_date,
          lr.is_critical,
          lr.interpretation
        FROM lab_tests lt
        LEFT JOIN lab_results lr ON lt.id = lr.lab_test_id
        WHERE lt.lab_order_id = $1
        ORDER BY lt.created_at
      `, [orderId]);

      // Log access for audit
      await auditService.logPHIAccess(
        userId,
        'lab_orders',
        order.patient_id,
        'view_lab_order',
        `Viewed lab order ${orderId}`,
        'Clinical review'
      );

      return {
        success: true,
        order: {
          ...order,
          tests: testsResult.rows
        }
      };

    } catch (error) {
      console.error('[LabService] Error getting lab order:', error);
      throw new Error(`Failed to get lab order: ${error.message}`);
    }
  }

  /**
   * Get patient's lab history
   * @param {number} patientId - Patient ID
   * @param {Object} options - Query options
   * @param {number} userId - User requesting the data
   * @returns {Object} Patient lab history
   */
  async getPatientLabHistory(patientId, options = {}, userId) {
    const {
      limit = 50,
      offset = 0,
      dateFrom = null,
      dateTo = null,
      testName = null,
      loincCode = null,
      onlyCritical = false
    } = options;

    try {
      let whereClause = 'WHERE lo.patient_id = $1';
      const params = [patientId];
      let paramCount = 1;

      if (dateFrom) {
        paramCount++;
        whereClause += ` AND lo.order_date >= $${paramCount}`;
        params.push(dateFrom);
      }

      if (dateTo) {
        paramCount++;
        whereClause += ` AND lo.order_date <= $${paramCount}`;
        params.push(dateTo);
      }

      if (testName) {
        paramCount++;
        whereClause += ` AND lt.test_name ILIKE $${paramCount}`;
        params.push(`%${testName}%`);
      }

      if (loincCode) {
        paramCount++;
        whereClause += ` AND lt.loinc_code = $${paramCount}`;
        params.push(loincCode);
      }

      if (onlyCritical) {
        whereClause += ' AND lr.is_critical = true';
      }

      const query = `
        SELECT 
          lo.id as order_id,
          lo.order_date,
          lo.status as order_status,
          lo.priority,
          lt.id as test_id,
          lt.loinc_code,
          lt.test_name,
          lt.status as test_status,
          lr.id as result_id,
          lr.result_value,
          lr.numeric_value,
          lr.unit,
          lr.abnormal_flag,
          lr.result_date,
          lr.is_critical,
          lr.result_status
        FROM lab_orders lo
        JOIN lab_tests lt ON lo.id = lt.lab_order_id
        LEFT JOIN lab_results lr ON lt.id = lr.lab_test_id
        ${whereClause}
        ORDER BY lo.order_date DESC, lr.result_date DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;

      params.push(limit, offset);

      const result = await pool.query(query, params);

      // Log access for audit
      await auditService.logPHIAccess(
        userId,
        'lab_orders',
        patientId,
        'view_lab_history',
        `Viewed lab history for patient ${patientId}`,
        'Clinical review'
      );

      return {
        success: true,
        data: result.rows,
        pagination: {
          limit,
          offset,
          total: result.rows.length
        }
      };

    } catch (error) {
      console.error('[LabService] Error getting patient lab history:', error);
      throw new Error(`Failed to get patient lab history: ${error.message}`);
    }
  }

  /**
   * Get available lab panels
   * @returns {Array} Available lab panels
   */
  async getLabPanels() {
    try {
      const result = await pool.query(`
        SELECT 
          id, panel_name, panel_code, loinc_codes, test_names,
          commonly_ordered, department, turnaround_time_hours,
          fasting_required, special_preparation
        FROM lab_panels
        ORDER BY commonly_ordered DESC, panel_name
      `);

      return {
        success: true,
        panels: result.rows
      };

    } catch (error) {
      console.error('[LabService] Error getting lab panels:', error);
      throw new Error('Failed to get lab panels');
    }
  }

  /**
   * Get test name by LOINC code
   * @param {string} loincCode - LOINC code
   * @returns {string} Test name
   */
  async getTestNameByLoinc(loincCode) {
    try {
      // First check if it's in our panels
      const result = await pool.query(`
        SELECT test_names[array_position(loinc_codes, $1)] as test_name
        FROM lab_panels 
        WHERE $1 = ANY(loinc_codes)
        LIMIT 1
      `, [loincCode]);

      if (result.rows.length > 0 && result.rows[0].test_name) {
        return result.rows[0].test_name;
      }

      // Fallback to a basic mapping or external LOINC lookup
      const basicMapping = {
        '2951-2': 'Glucose',
        '2823-3': 'Potassium',
        '2947-0': 'Sodium',
        '38483-4': 'Creatinine',
        '718-7': 'Hemoglobin',
        '26464-8': 'White Blood Cell Count'
      };

      return basicMapping[loincCode] || `Test ${loincCode}`;

    } catch (error) {
      console.error('[LabService] Error getting test name:', error);
      return `Test ${loincCode}`;
    }
  }

  /**
   * Find test ID by LOINC code within a lab order
   * @param {number} orderId - Lab order ID
   * @param {string} loincCode - LOINC code
   * @returns {number|null} Test ID
   */
  async findTestByLoinc(orderId, loincCode) {
    try {
      const result = await pool.query(`
        SELECT id FROM lab_tests 
        WHERE lab_order_id = $1 AND loinc_code = $2
        LIMIT 1
      `, [orderId, loincCode]);

      return result.rows.length > 0 ? result.rows[0].id : null;

    } catch (error) {
      console.error('[LabService] Error finding test by LOINC:', error);
      return null;
    }
  }
}

export default new LabService();