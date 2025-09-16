// Critical Values Service for Lab System
// Handles critical value detection, notifications, and escalation management
import pool from '../db/index.js';
import auditService from './audit.service.js';

class CriticalValuesService {
  constructor() {
    this.notificationMethods = ['phone', 'page', 'email', 'in_app'];
    this.escalationTimeMinutes = 30; // Default escalation time
  }

  /**
   * Check if a lab value is critical
   * @param {string} loincCode - LOINC code of the test
   * @param {number} numericValue - Numeric result value
   * @param {number} patientId - Patient ID for demographics-based ranges
   * @returns {boolean} True if value is critical
   */
  async checkCriticalValue(loincCode, numericValue, patientId) {
    if (!numericValue || !loincCode) {
      return false;
    }

    try {
      // Get patient demographics for age/gender-specific ranges
      const patientResult = await pool.query(`
        SELECT 
          EXTRACT(YEAR FROM AGE(dob)) as age,
          gender
        FROM patients 
        WHERE id = $1
      `, [patientId]);

      const patient = patientResult.rows[0];
      const age = patient ? Math.floor(patient.age) : 30; // Default to adult
      const gender = patient ? patient.gender : 'all';

      // Get critical value ranges for this test
      const rangeResult = await pool.query(`
        SELECT critical_low, critical_high, escalation_minutes
        FROM critical_value_ranges
        WHERE loinc_code = $1
        AND (age_group = 'adult' OR age_group = 'all')
        AND (gender = $2 OR gender = 'all')
        ORDER BY 
          CASE WHEN gender = $2 THEN 1 ELSE 2 END,
          CASE WHEN age_group = 'adult' THEN 1 ELSE 2 END
        LIMIT 1
      `, [loincCode, gender]);

      if (rangeResult.rows.length === 0) {
        return false; // No critical ranges defined for this test
      }

      const range = rangeResult.rows[0];
      const criticalLow = range.critical_low;
      const criticalHigh = range.critical_high;

      // Check if value falls outside critical range
      const isCriticalLow = criticalLow !== null && numericValue < criticalLow;
      const isCriticalHigh = criticalHigh !== null && numericValue > criticalHigh;

      return isCriticalLow || isCriticalHigh;

    } catch (error) {
      console.error('[CriticalValues] Error checking critical value:', error);
      return false; // Err on the side of caution - don't flag if error
    }
  }

  /**
   * Send critical value notification to provider
   * @param {number} resultId - Lab result ID
   * @param {number} patientId - Patient ID
   * @param {number} providerId - Provider ID to notify
   * @param {number} notifiedBy - User ID who triggered the notification
   * @returns {Object} Notification result
   */
  async sendCriticalValueNotification(resultId, patientId, providerId, notifiedBy) {
    try {
      // Get result details
      const resultDetails = await this.getCriticalValueDetails(resultId);
      
      if (!resultDetails) {
        throw new Error(`Lab result ${resultId} not found`);
      }

      // Get escalation time for this test
      const escalationMinutes = await this.getEscalationTime(resultDetails.loincCode);

      // Create notification record
      const notificationResult = await pool.query(`
        INSERT INTO critical_value_notifications (
          lab_result_id, patient_id, provider_id, notification_method,
          escalation_minutes
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [resultId, patientId, providerId, 'in_app', escalationMinutes]);

      const notificationId = notificationResult.rows[0].id;

      // Send actual notification (in real system, this would integrate with:
      // - Hospital paging system
      // - Email service
      // - SMS service
      // - Real-time web notifications
      await this.deliverNotification(notificationId, resultDetails, providerId);

      // Schedule escalation check
      setTimeout(async () => {
        await this.checkForEscalation(notificationId);
      }, escalationMinutes * 60 * 1000);

      // Log the critical value notification
      await auditService.logPHIAccess(
        notifiedBy,
        'critical_value_notifications',
        patientId,
        'critical_value_notification',
        `Critical value notification sent for ${resultDetails.testName}: ${resultDetails.resultValue}`,
        'Critical value management'
      );

      return {
        success: true,
        notificationId,
        message: `Critical value notification sent to provider`,
        escalationTimeMinutes: escalationMinutes
      };

    } catch (error) {
      console.error('[CriticalValues] Error sending notification:', error);
      throw new Error(`Failed to send critical value notification: ${error.message}`);
    }
  }

  /**
   * Acknowledge critical value notification
   * @param {number} resultId - Lab result ID
   * @param {number} providerId - Provider acknowledging the value
   * @param {string} notes - Optional acknowledgment notes
   * @returns {Object} Acknowledgment result
   */
  async acknowledgeCriticalValue(resultId, providerId, notes = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Update lab result with acknowledgment
      await client.query(`
        UPDATE lab_results 
        SET critical_acknowledged_by = $1, critical_acknowledged_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [providerId, resultId]);

      // Update notification record
      const notificationResult = await client.query(`
        UPDATE critical_value_notifications 
        SET acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = $1, notes = $2
        WHERE lab_result_id = $3 AND acknowledged_at IS NULL
        RETURNING id, patient_id
      `, [providerId, notes, resultId]);

      if (notificationResult.rows.length === 0) {
        throw new Error('No pending critical value notification found');
      }

      const notification = notificationResult.rows[0];
      const patientId = notification.patient_id;

      await client.query('COMMIT');

      // Log the acknowledgment
      await auditService.logPHIAccess(
        providerId,
        'critical_value_notifications',
        patientId,
        'critical_value_acknowledged',
        `Critical value acknowledged for result ${resultId}${notes ? `: ${notes}` : ''}`,
        'Critical value management'
      );

      return {
        success: true,
        message: 'Critical value acknowledged successfully'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[CriticalValues] Error acknowledging critical value:', error);
      throw new Error(`Failed to acknowledge critical value: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Get unacknowledged critical values for a provider
   * @param {number} providerId - Provider ID
   * @param {number} limit - Number of results to return
   * @returns {Array} Unacknowledged critical values
   */
  async getUnacknowledgedCriticalValues(providerId, limit = 50) {
    try {
      const result = await pool.query(`
        SELECT 
          cvn.id as notification_id,
          cvn.notification_sent_at,
          cvn.escalated,
          cvn.escalated_at,
          lr.id as result_id,
          lr.result_value,
          lr.numeric_value,
          lr.unit,
          lr.result_date,
          lt.test_name,
          lt.loinc_code,
          lo.id as order_id,
          lo.order_date,
          lo.priority,
          p.id as patient_id,
          p.first_name,
          p.last_name,
          p.dob,
          cvr.critical_low,
          cvr.critical_high
        FROM critical_value_notifications cvn
        JOIN lab_results lr ON cvn.lab_result_id = lr.id
        JOIN lab_tests lt ON lr.lab_test_id = lt.id
        JOIN lab_orders lo ON lt.lab_order_id = lo.id
        JOIN patients p ON cvn.patient_id = p.id
        LEFT JOIN critical_value_ranges cvr ON lt.loinc_code = cvr.loinc_code
        WHERE cvn.provider_id = $1
        AND cvn.acknowledged_at IS NULL
        ORDER BY cvn.notification_sent_at DESC
        LIMIT $2
      `, [providerId, limit]);

      return {
        success: true,
        criticalValues: result.rows
      };

    } catch (error) {
      console.error('[CriticalValues] Error getting unacknowledged critical values:', error);
      throw new Error('Failed to get unacknowledged critical values');
    }
  }

  /**
   * Get all critical values for a patient
   * @param {number} patientId - Patient ID
   * @param {number} userId - User requesting the data
   * @param {number} days - Number of days to look back
   * @returns {Array} Patient critical values history
   */
  async getPatientCriticalValues(patientId, userId, days = 30) {
    try {
      const result = await pool.query(`
        SELECT 
          lr.id as result_id,
          lr.result_value,
          lr.numeric_value,
          lr.unit,
          lr.result_date,
          lr.critical_acknowledged_by,
          lr.critical_acknowledged_at,
          lt.test_name,
          lt.loinc_code,
          lo.order_date,
          lo.priority,
          cvn.notification_sent_at,
          cvn.acknowledged_at,
          cvn.escalated,
          cvr.critical_low,
          cvr.critical_high,
          p_ack.first_name as acknowledged_by_first_name,
          p_ack.last_name as acknowledged_by_last_name
        FROM lab_results lr
        JOIN lab_tests lt ON lr.lab_test_id = lt.id
        JOIN lab_orders lo ON lt.lab_order_id = lo.id
        LEFT JOIN critical_value_notifications cvn ON lr.id = cvn.lab_result_id
        LEFT JOIN critical_value_ranges cvr ON lt.loinc_code = cvr.loinc_code
        LEFT JOIN providers p_ack ON lr.critical_acknowledged_by = p_ack.id
        WHERE lo.patient_id = $1
        AND lr.is_critical = true
        AND lr.result_date >= CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY lr.result_date DESC
      `, [patientId]);

      // Log access for audit
      await auditService.logPHIAccess(
        userId,
        'lab_results',
        patientId,
        'view_critical_values',
        `Viewed critical values history for patient ${patientId}`,
        'Clinical review'
      );

      return {
        success: true,
        criticalValues: result.rows,
        patientId,
        timeRange: `${days} days`
      };

    } catch (error) {
      console.error('[CriticalValues] Error getting patient critical values:', error);
      throw new Error('Failed to get patient critical values');
    }
  }

  /**
   * Get critical value details
   * @param {number} resultId - Lab result ID
   * @returns {Object} Critical value details
   */
  async getCriticalValueDetails(resultId) {
    try {
      const result = await pool.query(`
        SELECT 
          lr.result_value,
          lr.numeric_value,
          lr.unit,
          lr.result_date,
          lt.test_name,
          lt.loinc_code,
          lo.patient_id,
          p.first_name,
          p.last_name,
          p.dob
        FROM lab_results lr
        JOIN lab_tests lt ON lr.lab_test_id = lt.id
        JOIN lab_orders lo ON lt.lab_order_id = lo.id
        JOIN patients p ON lo.patient_id = p.id
        WHERE lr.id = $1
      `, [resultId]);

      return result.rows.length > 0 ? result.rows[0] : null;

    } catch (error) {
      console.error('[CriticalValues] Error getting critical value details:', error);
      return null;
    }
  }

  /**
   * Get escalation time for a test
   * @param {string} loincCode - LOINC code
   * @returns {number} Escalation time in minutes
   */
  async getEscalationTime(loincCode) {
    try {
      const result = await pool.query(`
        SELECT escalation_minutes FROM critical_value_ranges
        WHERE loinc_code = $1
        LIMIT 1
      `, [loincCode]);

      return result.rows.length > 0 ? 
        result.rows[0].escalation_minutes : 
        this.escalationTimeMinutes;

    } catch (error) {
      console.error('[CriticalValues] Error getting escalation time:', error);
      return this.escalationTimeMinutes;
    }
  }

  /**
   * Deliver notification to provider
   * @param {number} notificationId - Notification ID
   * @param {Object} resultDetails - Result details
   * @param {number} providerId - Provider ID
   */
  async deliverNotification(notificationId, resultDetails, providerId) {
    try {
      // In a real system, this would integrate with various notification systems:
      
      // 1. In-app notification (real-time WebSocket/Server-Sent Events)
      const inAppMessage = {
        type: 'critical_value',
        title: 'CRITICAL LAB VALUE',
        message: `${resultDetails.testName}: ${resultDetails.result_value} ${resultDetails.unit || ''}`,
        patient: `${resultDetails.first_name} ${resultDetails.last_name}`,
        urgency: 'high',
        timestamp: new Date(),
        notificationId
      };

      // Store in-app notification (could also use Redis for real-time)
      await pool.query(`
        INSERT INTO provider_notifications (
          provider_id, notification_type, title, message, urgency, data
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        providerId, 
        'critical_value', 
        inAppMessage.title, 
        inAppMessage.message, 
        'high',
        JSON.stringify(inAppMessage)
      ]);

      // 2. Email notification (would integrate with email service)
      console.log(`[CriticalValues] EMAIL: Critical value for ${resultDetails.first_name} ${resultDetails.last_name}`);

      // 3. SMS/Page notification (would integrate with paging service)
      console.log(`[CriticalValues] PAGE: Critical ${resultDetails.testName} - ${resultDetails.result_value}`);

      // 4. Phone call escalation (would integrate with call system)
      console.log(`[CriticalValues] PHONE: Provider ${providerId} - Critical value requires attention`);

    } catch (error) {
      console.error('[CriticalValues] Error delivering notification:', error);
    }
  }

  /**
   * Check for escalation of unacknowledged critical values
   * @param {number} notificationId - Notification ID to check
   */
  async checkForEscalation(notificationId) {
    try {
      // Check if notification is still unacknowledged
      const result = await pool.query(`
        SELECT 
          cvn.*,
          lr.result_value,
          lt.test_name,
          p.first_name,
          p.last_name,
          pr.supervisor_id
        FROM critical_value_notifications cvn
        JOIN lab_results lr ON cvn.lab_result_id = lr.id
        JOIN lab_tests lt ON lr.lab_test_id = lt.id
        JOIN lab_orders lo ON lt.lab_order_id = lo.id
        JOIN patients p ON lo.patient_id = p.id
        LEFT JOIN providers pr ON cvn.provider_id = pr.id
        WHERE cvn.id = $1
        AND cvn.acknowledged_at IS NULL
      `, [notificationId]);

      if (result.rows.length === 0) {
        return; // Notification was acknowledged or doesn't exist
      }

      const notification = result.rows[0];
      const supervisorId = notification.supervisor_id;

      if (supervisorId) {
        // Escalate to supervisor
        await pool.query(`
          UPDATE critical_value_notifications 
          SET escalated = true, escalated_at = CURRENT_TIMESTAMP, escalated_to = $1
          WHERE id = $2
        `, [supervisorId, notificationId]);

        // Send escalation notification
        await this.sendEscalationNotification(notification, supervisorId);

        // Log escalation
        await auditService.logPHIAccess(
          null, // System action
          'critical_value_notifications',
          notification.patient_id,
          'critical_value_escalated',
          `Critical value escalated to supervisor for ${notification.test_name}: ${notification.result_value}`,
          'Critical value escalation'
        );
      }

    } catch (error) {
      console.error('[CriticalValues] Error checking for escalation:', error);
    }
  }

  /**
   * Send escalation notification
   * @param {Object} notification - Original notification data
   * @param {number} supervisorId - Supervisor ID to notify
   */
  async sendEscalationNotification(notification, supervisorId) {
    try {
      // Create escalation notification record
      await pool.query(`
        INSERT INTO critical_value_notifications (
          lab_result_id, patient_id, provider_id, notification_method,
          notes
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        notification.lab_result_id,
        notification.patient_id,
        supervisorId,
        'in_app',
        `Escalated from provider ${notification.provider_id} due to no acknowledgment`
      ]);

      // In real system, send high-priority notification to supervisor
      console.log(`[CriticalValues] ESCALATION: Critical value escalated to supervisor ${supervisorId}`);

    } catch (error) {
      console.error('[CriticalValues] Error sending escalation notification:', error);
    }
  }

  /**
   * Define critical ranges for a test
   * @param {Object} rangeData - Critical range definition
   * @param {number} userId - User defining the range
   * @returns {Object} Creation result
   */
  async defineCriticalRange(rangeData, userId) {
    const {
      loincCode,
      testName,
      criticalLow = null,
      criticalHigh = null,
      unit,
      ageGroup = 'adult',
      gender = 'all',
      escalationMinutes = 30
    } = rangeData;

    try {
      const result = await pool.query(`
        INSERT INTO critical_value_ranges (
          loinc_code, test_name, critical_low, critical_high, unit,
          age_group, gender, escalation_minutes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (loinc_code, age_group, gender)
        DO UPDATE SET
          critical_low = EXCLUDED.critical_low,
          critical_high = EXCLUDED.critical_high,
          unit = EXCLUDED.unit,
          escalation_minutes = EXCLUDED.escalation_minutes,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [loincCode, testName, criticalLow, criticalHigh, unit, ageGroup, gender, escalationMinutes]);

      // Log the range definition
      await auditService.logPHIAccess(
        userId,
        'critical_value_ranges',
        null,
        'define_critical_range',
        `Defined critical range for ${testName} (${loincCode})`,
        'System configuration'
      );

      return {
        success: true,
        range: result.rows[0],
        message: 'Critical value range defined successfully'
      };

    } catch (error) {
      console.error('[CriticalValues] Error defining critical range:', error);
      throw new Error(`Failed to define critical range: ${error.message}`);
    }
  }
}

export default new CriticalValuesService();