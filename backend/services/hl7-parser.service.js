// HL7 Parser Service for Lab Integration
// Handles parsing HL7 ORU (Observation Result) and generating ORM (Order Message) messages
import pool from '../db/index.js';
import auditService from './audit.service.js';

class HL7ParserService {
  constructor() {
    this.fieldSeparator = '|';
    this.componentSeparator = '^';
    this.repetitionSeparator = '~';
    this.escapeCharacter = '\\';
    this.subComponentSeparator = '&';
  }

  /**
   * Parse HL7 ORU (Observation Result) message
   * @param {string} message - Raw HL7 message
   * @param {number} userId - User processing the message
   * @returns {Object} Parsed result data
   */
  async parseORU(message, userId) {
    try {
      // Log incoming HL7 message
      await this.logHL7Message('ORU', 'inbound', message);

      const lines = message.split('\r').filter(line => line.trim().length > 0);
      const segments = {};
      
      // Parse each segment
      for (const line of lines) {
        const segmentType = line.substring(0, 3);
        if (!segments[segmentType]) {
          segments[segmentType] = [];
        }
        segments[segmentType].push(this.parseSegment(line));
      }

      // Validate required segments
      if (!segments.MSH || !segments.PID || !segments.OBR || !segments.OBX) {
        throw new Error('Missing required HL7 segments (MSH, PID, OBR, OBX)');
      }

      // Extract patient information
      const patient = this.extractPatientInfo(segments.PID[0]);
      
      // Extract order information
      const order = this.extractOrderInfo(segments.OBR[0]);
      
      // Extract observation results
      const observations = segments.OBX.map(obx => this.extractObservation(obx));

      // Find patient in our system
      const patientId = await this.findPatientId(patient);
      if (!patientId) {
        throw new Error(`Patient not found: ${patient.patientId}`);
      }

      // Find lab order in our system
      const labOrderId = await this.findLabOrder(patientId, order.orderNumber);
      if (!labOrderId) {
        throw new Error(`Lab order not found: ${order.orderNumber}`);
      }

      const parsedResult = {
        messageType: 'ORU',
        patient: { ...patient, internalId: patientId },
        order: { ...order, internalOrderId: labOrderId },
        observations,
        timestamp: new Date(),
        originalMessage: message
      };

      // Log successful parsing
      await auditService.logPHIAccess(
        userId,
        'hl7_messages',
        patientId,
        'hl7_parsed',
        `Parsed HL7 ORU message with ${observations.length} results`,
        'Lab result processing'
      );

      // Update HL7 log as successfully parsed
      await this.updateHL7MessageStatus(message, true, labOrderId, null);

      return {
        success: true,
        data: parsedResult
      };

    } catch (error) {
      console.error('[HL7Parser] Error parsing ORU message:', error);
      
      // Log parsing error
      await this.updateHL7MessageStatus(message, false, null, null, error.message);
      
      throw new Error(`Failed to parse HL7 ORU message: ${error.message}`);
    }
  }

  /**
   * Generate HL7 ORM (Order Message) for lab order
   * @param {Object} order - Lab order data
   * @returns {string} HL7 formatted message
   */
  async generateORM(order) {
    try {
      const timestamp = this.formatHL7DateTime(new Date());
      const messageControlId = this.generateMessageControlId();

      // Get patient details
      const patientResult = await pool.query(`
        SELECT p.*, pd.ssn, pd.phone_number, pd.address_line1, pd.address_line2,
               pd.city, pd.state, pd.zip_code
        FROM patients p
        LEFT JOIN patient_demographics pd ON p.id = pd.patient_id
        WHERE p.id = $1
      `, [order.patientId]);

      if (patientResult.rows.length === 0) {
        throw new Error(`Patient ${order.patientId} not found`);
      }

      const patient = patientResult.rows[0];

      // Get provider details
      const providerResult = await pool.query(`
        SELECT * FROM providers WHERE id = $1
      `, [order.providerId]);

      const provider = providerResult.rows[0];

      // Get order tests
      const testsResult = await pool.query(`
        SELECT * FROM lab_tests WHERE lab_order_id = $1
      `, [order.id]);

      const tests = testsResult.rows;

      // Build HL7 message
      const hl7Lines = [];

      // MSH - Message Header
      hl7Lines.push(this.buildMSHSegment(messageControlId, timestamp));

      // PID - Patient Identification
      hl7Lines.push(this.buildPIDSegment(patient));

      // PV1 - Patient Visit (if encounter exists)
      if (order.encounterId) {
        hl7Lines.push(this.buildPV1Segment(order));
      }

      // ORC - Common Order
      hl7Lines.push(this.buildORCSegment(order, provider));

      // OBR - Observation Request
      hl7Lines.push(this.buildOBRSegment(order, tests, provider));

      const hl7Message = hl7Lines.join('\r') + '\r';

      // Log outbound HL7 message
      await this.logHL7Message('ORM', 'outbound', hl7Message, order.id);

      return {
        success: true,
        message: hl7Message,
        messageControlId
      };

    } catch (error) {
      console.error('[HL7Parser] Error generating ORM message:', error);
      throw new Error(`Failed to generate HL7 ORM message: ${error.message}`);
    }
  }

  /**
   * Parse individual HL7 segment
   * @param {string} segment - HL7 segment line
   * @returns {Array} Parsed fields
   */
  parseSegment(segment) {
    return segment.split(this.fieldSeparator).map(field => 
      field.split(this.componentSeparator)
    );
  }

  /**
   * Extract patient information from PID segment
   * @param {Array} pidSegment - Parsed PID segment
   * @returns {Object} Patient information
   */
  extractPatientInfo(pidSegment) {
    return {
      patientId: pidSegment[3] ? pidSegment[3][0] : null, // External patient ID
      lastName: pidSegment[5] ? pidSegment[5][0] : null,
      firstName: pidSegment[5] ? pidSegment[5][1] : null,
      middleName: pidSegment[5] ? pidSegment[5][2] : null,
      dateOfBirth: pidSegment[7] ? this.parseHL7Date(pidSegment[7][0]) : null,
      sex: pidSegment[8] ? pidSegment[8][0] : null,
      ssn: pidSegment[19] ? pidSegment[19][0] : null
    };
  }

  /**
   * Extract order information from OBR segment
   * @param {Array} obrSegment - Parsed OBR segment
   * @returns {Object} Order information
   */
  extractOrderInfo(obrSegment) {
    return {
      orderNumber: obrSegment[2] ? obrSegment[2][0] : null,
      universalServiceId: obrSegment[4] ? obrSegment[4][0] : null,
      universalServiceName: obrSegment[4] ? obrSegment[4][1] : null,
      observationDateTime: obrSegment[7] ? this.parseHL7DateTime(obrSegment[7][0]) : null,
      specimenSource: obrSegment[15] ? obrSegment[15][0] : null,
      orderingProvider: obrSegment[16] ? obrSegment[16][1] + ', ' + obrSegment[16][2] : null
    };
  }

  /**
   * Extract observation from OBX segment
   * @param {Array} obxSegment - Parsed OBX segment
   * @returns {Object} Observation data
   */
  extractObservation(obxSegment) {
    const observationId = obxSegment[3] ? obxSegment[3][0] : null;
    const observationName = obxSegment[3] ? obxSegment[3][1] : null;
    const valueType = obxSegment[2] ? obxSegment[2][0] : 'ST';
    const observationValue = obxSegment[5] ? obxSegment[5][0] : null;
    const units = obxSegment[6] ? obxSegment[6][0] : null;
    const referenceRange = obxSegment[7] ? obxSegment[7][0] : null;
    const abnormalFlags = obxSegment[8] ? obxSegment[8][0] : null;
    const resultStatus = obxSegment[11] ? obxSegment[11][0] : 'F';

    // Parse numeric value if applicable
    let numericValue = null;
    if (valueType === 'NM' && observationValue) {
      const parsed = parseFloat(observationValue);
      if (!isNaN(parsed)) {
        numericValue = parsed;
      }
    }

    return {
      loincCode: observationId,
      testName: observationName,
      valueType,
      resultValue: observationValue,
      numericValue,
      unit: units,
      referenceRange,
      abnormalFlag: abnormalFlags,
      resultStatus: this.mapHL7ResultStatus(resultStatus),
      observationDateTime: obxSegment[14] ? this.parseHL7DateTime(obxSegment[14][0]) : new Date()
    };
  }

  /**
   * Build MSH (Message Header) segment
   * @param {string} controlId - Message control ID
   * @param {string} timestamp - HL7 formatted timestamp
   * @returns {string} MSH segment
   */
  buildMSHSegment(controlId, timestamp) {
    return `MSH|^~\\&|EMR_SYSTEM|MAIN_HOSPITAL|LAB_SYSTEM|LAB_HOSPITAL|${timestamp}||ORM^O01|${controlId}|P|2.5`;
  }

  /**
   * Build PID (Patient Identification) segment
   * @param {Object} patient - Patient data
   * @returns {string} PID segment
   */
  buildPIDSegment(patient) {
    const dob = patient.dob ? this.formatHL7Date(patient.dob) : '';
    const address = this.formatHL7Address(patient);
    
    return `PID|1||${patient.id}^^^MRN^MR||${patient.last_name}^${patient.first_name}^${patient.middle_name || ''}||${dob}|${patient.gender}|||${address}|||||||${patient.ssn || ''}`;
  }

  /**
   * Build PV1 (Patient Visit) segment
   * @param {Object} order - Order data
   * @returns {string} PV1 segment
   */
  buildPV1Segment(order) {
    return `PV1|1|O|||||||||||||||||${order.encounterId}`;
  }

  /**
   * Build ORC (Common Order) segment
   * @param {Object} order - Order data
   * @param {Object} provider - Provider data
   * @returns {string} ORC segment
   */
  buildORCSegment(order, provider) {
    const orderDateTime = this.formatHL7DateTime(order.order_date);
    return `ORC|NW|${order.id}|${order.id}||IP||^ONCE^|||${orderDateTime}|${provider.id}^${provider.last_name}^${provider.first_name}`;
  }

  /**
   * Build OBR (Observation Request) segment
   * @param {Object} order - Order data
   * @param {Array} tests - Array of tests
   * @param {Object} provider - Provider data
   * @returns {string} OBR segment
   */
  buildOBRSegment(order, tests, provider) {
    const orderDateTime = this.formatHL7DateTime(order.order_date);
    const priority = order.priority === 'stat' ? 'S' : order.priority === 'urgent' ? 'A' : 'R';
    
    // For simplicity, use first test or generic panel code
    const primaryTest = tests[0];
    const testCode = primaryTest ? primaryTest.loinc_code : 'PANEL';
    const testName = primaryTest ? primaryTest.test_name : 'Lab Panel';
    
    return `OBR|1|${order.id}|${order.id}|${testCode}^${testName}^LN|||${orderDateTime}||||||||${provider.id}^${provider.last_name}^${provider.first_name}||||||||${priority}`;
  }

  /**
   * Format HL7 date
   * @param {Date|string} date - Date to format
   * @returns {string} HL7 date format (YYYYMMDD)
   */
  formatHL7Date(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Format HL7 datetime
   * @param {Date|string} date - Date to format
   * @returns {string} HL7 datetime format (YYYYMMDDHHMMSS)
   */
  formatHL7DateTime(date) {
    const d = new Date(date);
    const dateStr = this.formatHL7Date(d);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${dateStr}${hours}${minutes}${seconds}`;
  }

  /**
   * Parse HL7 date
   * @param {string} hl7Date - HL7 date string
   * @returns {Date} Parsed date
   */
  parseHL7Date(hl7Date) {
    if (!hl7Date || hl7Date.length < 8) return null;
    
    const year = hl7Date.substring(0, 4);
    const month = hl7Date.substring(4, 6);
    const day = hl7Date.substring(6, 8);
    
    return new Date(`${year}-${month}-${day}`);
  }

  /**
   * Parse HL7 datetime
   * @param {string} hl7DateTime - HL7 datetime string
   * @returns {Date} Parsed datetime
   */
  parseHL7DateTime(hl7DateTime) {
    if (!hl7DateTime || hl7DateTime.length < 8) return null;
    
    const year = hl7DateTime.substring(0, 4);
    const month = hl7DateTime.substring(4, 6);
    const day = hl7DateTime.substring(6, 8);
    const hour = hl7DateTime.substring(8, 10) || '00';
    const minute = hl7DateTime.substring(10, 12) || '00';
    const second = hl7DateTime.substring(12, 14) || '00';
    
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  }

  /**
   * Format address for HL7
   * @param {Object} patient - Patient with address data
   * @returns {string} HL7 formatted address
   */
  formatHL7Address(patient) {
    const address1 = patient.address_line1 || '';
    const address2 = patient.address_line2 || '';
    const city = patient.city || '';
    const state = patient.state || '';
    const zip = patient.zip_code || '';
    
    return `${address1}^${address2}^${city}^${state}^${zip}`;
  }

  /**
   * Map HL7 result status to internal status
   * @param {string} hl7Status - HL7 result status
   * @returns {string} Internal result status
   */
  mapHL7ResultStatus(hl7Status) {
    const statusMap = {
      'P': 'preliminary',
      'F': 'final',
      'C': 'corrected',
      'X': 'cancelled',
      'I': 'preliminary',
      'S': 'preliminary'
    };
    
    return statusMap[hl7Status] || 'preliminary';
  }

  /**
   * Generate unique message control ID
   * @returns {string} Message control ID
   */
  generateMessageControlId() {
    return 'EMR' + Date.now() + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /**
   * Find patient ID in our system
   * @param {Object} patient - Patient data from HL7
   * @returns {number|null} Internal patient ID
   */
  async findPatientId(patient) {
    try {
      // Try to find by external patient ID first
      if (patient.patientId) {
        const result = await pool.query(`
          SELECT id FROM patients WHERE id = $1
        `, [patient.patientId]);
        
        if (result.rows.length > 0) {
          return result.rows[0].id;
        }
      }

      // Try to find by name and DOB
      if (patient.lastName && patient.firstName && patient.dateOfBirth) {
        const result = await pool.query(`
          SELECT id FROM patients 
          WHERE last_name ILIKE $1 
          AND first_name ILIKE $2 
          AND dob = $3
        `, [patient.lastName, patient.firstName, patient.dateOfBirth]);
        
        if (result.rows.length > 0) {
          return result.rows[0].id;
        }
      }

      return null;
    } catch (error) {
      console.error('[HL7Parser] Error finding patient:', error);
      return null;
    }
  }

  /**
   * Find lab order in our system
   * @param {number} patientId - Patient ID
   * @param {string} orderNumber - External order number
   * @returns {number|null} Internal lab order ID
   */
  async findLabOrder(patientId, orderNumber) {
    try {
      const result = await pool.query(`
        SELECT id FROM lab_orders 
        WHERE patient_id = $1 
        AND (id::text = $2 OR id = $3)
        ORDER BY order_date DESC
        LIMIT 1
      `, [patientId, orderNumber, parseInt(orderNumber) || -1]);
      
      return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (error) {
      console.error('[HL7Parser] Error finding lab order:', error);
      return null;
    }
  }

  /**
   * Log HL7 message
   * @param {string} messageType - Message type (ORU, ORM, etc.)
   * @param {string} direction - Direction (inbound, outbound)
   * @param {string} message - HL7 message content
   * @param {number|null} labOrderId - Related lab order ID
   * @returns {number} HL7 message log ID
   */
  async logHL7Message(messageType, direction, message, labOrderId = null) {
    try {
      const result = await pool.query(`
        INSERT INTO hl7_messages (message_type, direction, hl7_message, lab_order_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [messageType, direction, message, labOrderId]);
      
      return result.rows[0].id;
    } catch (error) {
      console.error('[HL7Parser] Error logging HL7 message:', error);
      throw error;
    }
  }

  /**
   * Update HL7 message status
   * @param {string} message - Original HL7 message
   * @param {boolean} success - Parsing success status
   * @param {number|null} labOrderId - Lab order ID
   * @param {number|null} labResultId - Lab result ID
   * @param {string|null} errorMessage - Error message if failed
   */
  async updateHL7MessageStatus(message, success, labOrderId = null, labResultId = null, errorMessage = null) {
    try {
      await pool.query(`
        UPDATE hl7_messages 
        SET parsed_successfully = $1, lab_order_id = $2, lab_result_id = $3, error_message = $4
        WHERE hl7_message = $5
      `, [success, labOrderId, labResultId, errorMessage, message]);
    } catch (error) {
      console.error('[HL7Parser] Error updating HL7 message status:', error);
    }
  }
}

export default new HL7ParserService();