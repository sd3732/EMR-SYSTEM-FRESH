// Prescription Service for EMR System
// Handles medication prescribing with comprehensive safety checks
import pool from '../db/index.js';
import drugInteractionService from './drug-interaction.service.js';
import auditService from './audit.service.js';

class SafetyAlert extends Error {
  constructor(message, type, severity, data = null) {
    super(message);
    this.name = 'SafetyAlert';
    this.type = type;
    this.severity = severity;
    this.data = data;
  }
}

class PrescriptionService {
  constructor() {
    this.alertTypes = {
      SEVERE_INTERACTION: 'severe_interaction',
      ALLERGY: 'allergy',
      DUPLICATE_THERAPY: 'duplicate_therapy',
      HIGH_RISK: 'high_risk',
      DOSING_CONCERN: 'dosing_concern'
    };

    this.severityLevels = {
      CRITICAL: 'critical',
      HIGH: 'high',
      MEDIUM: 'medium',
      LOW: 'low'
    };
  }

  /**
   * Prescribe medication with comprehensive safety checking
   * @param {Object} prescriptionData - Prescription details
   * @param {number} prescriberId - ID of prescribing provider
   * @returns {Object} Prescription result with safety alerts
   */
  async prescribeMedication(prescriptionData, prescriberId) {
    const {
      patientId,
      medicationId,
      dosage,
      frequency,
      duration,
      quantity,
      instructions,
      indication,
      overrideReason = null
    } = prescriptionData;

    try {
      // Log prescription attempt
      await auditService.logPHIAccess(
        prescriberId, 
        'prescriptions', 
        patientId, 
        'prescribe_medication', 
        `Prescribing medication ID ${medicationId}`,
        'Clinical prescribing'
      );

      // 1. Get current patient medications
      const currentMedications = await this.getCurrentPatientMedications(patientId);
      const allMedicationIds = [...currentMedications.map(m => m.medication_id), medicationId];

      // 2. Run comprehensive safety checks
      const safetyReport = await drugInteractionService.generateSafetyReport(
        allMedicationIds, 
        patientId, 
        prescriberId
      );

      // 3. Check for critical safety alerts
      const criticalAlerts = await this.evaluateSafetyAlerts(safetyReport, prescriptionData);

      // 4. If severe interactions and no override reason, throw safety alert
      if (criticalAlerts.length > 0 && !overrideReason) {
        throw new SafetyAlert(
          'Critical safety alert detected - prescription cannot proceed without override',
          this.alertTypes.SEVERE_INTERACTION,
          this.severityLevels.CRITICAL,
          { alerts: criticalAlerts, safetyReport }
        );
      }

      // 5. Check for duplicate therapy
      const duplicateTherapy = await this.checkDuplicateTherapy(patientId, medicationId);
      if (duplicateTherapy && !overrideReason) {
        throw new SafetyAlert(
          'Duplicate therapy detected - patient already on similar medication',
          this.alertTypes.DUPLICATE_THERAPY,
          this.severityLevels.HIGH,
          { duplicate: duplicateTherapy }
        );
      }

      // 6. Validate dosing
      const dosingAlerts = await this.validateDosing(medicationId, dosage, patientId);

      // 7. Create prescription record
      const prescription = await this.createPrescription({
        patientId,
        medicationId,
        prescriberId,
        dosage,
        frequency,
        duration,
        quantity,
        instructions,
        indication,
        overrideReason,
        safetyChecksPassed: true
      });

      // 8. Return result with safety information
      return {
        success: true,
        prescription,
        safetyReport,
        alerts: [...criticalAlerts, ...dosingAlerts],
        overrideUsed: !!overrideReason,
        message: overrideReason ? 
          'Prescription created with safety override' : 
          'Prescription created successfully'
      };

    } catch (error) {
      if (error instanceof SafetyAlert) {
        // Log safety alert
        await auditService.logPHIAccess(
          prescriberId, 
          'prescriptions', 
          patientId, 
          'safety_alert', 
          `${error.type}: ${error.message}`,
          'Clinical safety alert'
        );
        throw error;
      }

      console.error('[PrescriptionService] Error prescribing medication:', error);
      throw new Error('Failed to prescribe medication');
    }
  }

  /**
   * Get current active medications for a patient
   * @param {number} patientId - Patient ID
   * @returns {Array} Current medications
   */
  async getCurrentPatientMedications(patientId) {
    try {
      const result = await pool.query(`
        SELECT 
          pm.id,
          pm.patient_id,
          pm.name as medication_name,
          pm.dose,
          pm.route,
          pm.frequency,
          pm.started_at,
          pm.ended_at,
          pm.active,
          m.id as medication_id,
          m.generic_name,
          m.brand_name,
          m.drug_class,
          m.therapeutic_class
        FROM patient_medications pm
        LEFT JOIN medications m ON lower(pm.name) = lower(m.generic_name) 
        WHERE pm.patient_id = $1 
        AND pm.active = true
        ORDER BY pm.started_at DESC
      `, [patientId]);

      return result.rows;
    } catch (error) {
      console.error('[PrescriptionService] Error getting current medications:', error);
      return [];
    }
  }

  /**
   * Evaluate safety alerts from the safety report
   * @param {Object} safetyReport - Safety report from drug interaction service
   * @param {Object} prescriptionData - Prescription data
   * @returns {Array} Critical alerts
   */
  async evaluateSafetyAlerts(safetyReport, prescriptionData) {
    const criticalAlerts = [];

    // Check for severe interactions
    if (safetyReport.interactions.severe.length > 0) {
      safetyReport.interactions.severe.forEach(interaction => {
        criticalAlerts.push({
          type: this.alertTypes.SEVERE_INTERACTION,
          severity: this.severityLevels.CRITICAL,
          title: 'Severe Drug Interaction',
          message: `Severe interaction between ${interaction.drug1.name} and ${interaction.drug2.name}`,
          description: interaction.description,
          clinicalEffect: interaction.clinicalEffect,
          management: interaction.management,
          data: interaction
        });
      });
    }

    // Check for drug allergies
    if (safetyReport.allergies.length > 0) {
      safetyReport.allergies.forEach(allergy => {
        criticalAlerts.push({
          type: this.alertTypes.ALLERGY,
          severity: this.severityLevels.CRITICAL,
          title: 'Drug Allergy Alert',
          message: `Patient has documented allergy to ${allergy.allergen}`,
          description: allergy.warning,
          management: allergy.recommendation,
          data: allergy
        });
      });
    }

    return criticalAlerts;
  }

  /**
   * Check for duplicate therapy
   * @param {number} patientId - Patient ID
   * @param {number} medicationId - New medication ID
   * @returns {Object|null} Duplicate therapy information
   */
  async checkDuplicateTherapy(patientId, medicationId) {
    try {
      // Get the drug class of the new medication
      const newMedResult = await pool.query(`
        SELECT drug_class, therapeutic_class, generic_name
        FROM medications 
        WHERE id = $1
      `, [medicationId]);

      if (newMedResult.rows.length === 0) {
        return null;
      }

      const newMed = newMedResult.rows[0];

      // Check if patient is already on a medication in the same class
      const duplicateResult = await pool.query(`
        SELECT 
          pm.name,
          pm.dose,
          pm.frequency,
          pm.started_at,
          m.drug_class,
          m.therapeutic_class
        FROM patient_medications pm
        LEFT JOIN medications m ON lower(pm.name) = lower(m.generic_name)
        WHERE pm.patient_id = $1 
        AND pm.active = true
        AND (m.drug_class = $2 OR m.therapeutic_class = $3)
      `, [patientId, newMed.drug_class, newMed.therapeutic_class]);

      if (duplicateResult.rows.length > 0) {
        return {
          newMedication: newMed.generic_name,
          existingMedications: duplicateResult.rows,
          drugClass: newMed.drug_class,
          therapeuticClass: newMed.therapeutic_class
        };
      }

      return null;
    } catch (error) {
      console.error('[PrescriptionService] Error checking duplicate therapy:', error);
      return null;
    }
  }

  /**
   * Validate dosing for the medication
   * @param {number} medicationId - Medication ID
   * @param {string} dosage - Prescribed dosage
   * @param {number} patientId - Patient ID
   * @returns {Array} Dosing alerts
   */
  async validateDosing(medicationId, dosage, patientId) {
    const alerts = [];

    try {
      // Get medication details including typical dosing
      const medResult = await pool.query(`
        SELECT 
          generic_name,
          strength,
          typical_dose_min,
          typical_dose_max,
          controlled_substance,
          drug_class
        FROM medications 
        WHERE id = $1
      `, [medicationId]);

      if (medResult.rows.length === 0) {
        return alerts;
      }

      const medication = medResult.rows[0];

      // Extract numeric dose from dosage string (basic parsing)
      const doseMatch = dosage.match(/(\d+(?:\.\d+)?)/);
      const numericDose = doseMatch ? parseFloat(doseMatch[1]) : null;

      // Check if dose is outside typical range
      if (numericDose && medication.typical_dose_min && medication.typical_dose_max) {
        if (numericDose < medication.typical_dose_min) {
          alerts.push({
            type: this.alertTypes.DOSING_CONCERN,
            severity: this.severityLevels.MEDIUM,
            title: 'Low Dose Alert',
            message: `Prescribed dose (${dosage}) is below typical minimum (${medication.typical_dose_min})`,
            recommendation: 'Verify dose is appropriate for indication'
          });
        } else if (numericDose > medication.typical_dose_max) {
          alerts.push({
            type: this.alertTypes.DOSING_CONCERN,
            severity: this.severityLevels.HIGH,
            title: 'High Dose Alert',
            message: `Prescribed dose (${dosage}) exceeds typical maximum (${medication.typical_dose_max})`,
            recommendation: 'Verify high dose is clinically justified'
          });
        }
      }

      // Special alerts for controlled substances
      if (medication.controlled_substance) {
        alerts.push({
          type: this.alertTypes.HIGH_RISK,
          severity: this.severityLevels.HIGH,
          title: 'Controlled Substance',
          message: `${medication.generic_name} is a controlled substance`,
          recommendation: 'Ensure DEA compliance and monitor for abuse potential'
        });
      }

      return alerts;
    } catch (error) {
      console.error('[PrescriptionService] Error validating dosing:', error);
      return alerts;
    }
  }

  /**
   * Create prescription record in database
   * @param {Object} prescriptionData - Complete prescription data
   * @returns {Object} Created prescription
   */
  async createPrescription(prescriptionData) {
    const {
      patientId,
      medicationId,
      prescriberId,
      dosage,
      frequency,
      duration,
      quantity,
      instructions,
      indication,
      overrideReason,
      safetyChecksPassed
    } = prescriptionData;

    try {
      const result = await pool.query(`
        INSERT INTO patient_medications (
          patient_id, name, dose, route, frequency, started_at, active
        )
        SELECT 
          $1, 
          m.generic_name,
          $2,
          'oral',  -- Default route, should be parameterized
          $3,
          CURRENT_DATE,
          true
        FROM medications m
        WHERE m.id = $4
        RETURNING *
      `, [patientId, dosage, frequency, medicationId]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create prescription record');
      }

      // Log successful prescription
      await auditService.logPHIAccess(
        prescriberId, 
        'patient_medications', 
        patientId, 
        'prescription_created', 
        `Prescribed ${result.rows[0].name} ${dosage} ${frequency}`,
        'Clinical prescribing'
      );

      return {
        id: result.rows[0].id,
        patientId: result.rows[0].patient_id,
        medicationName: result.rows[0].name,
        dosage: result.rows[0].dose,
        frequency: result.rows[0].frequency,
        route: result.rows[0].route,
        startedAt: result.rows[0].started_at,
        prescriberId,
        indication,
        instructions,
        overrideReason,
        safetyChecksPassed
      };

    } catch (error) {
      console.error('[PrescriptionService] Error creating prescription:', error);
      throw new Error('Failed to create prescription record');
    }
  }

  /**
   * Check multiple drugs for interactions (batch check)
   * @param {Array} medicationIds - Array of medication IDs
   * @param {number} userId - User ID
   * @param {number} patientId - Patient ID
   * @returns {Object} Interaction results
   */
  async checkMultipleDrugInteractions(medicationIds, userId, patientId = null) {
    try {
      return await drugInteractionService.checkDrugDrugInteractions(medicationIds, userId, patientId);
    } catch (error) {
      console.error('[PrescriptionService] Error checking multiple drug interactions:', error);
      throw new Error('Failed to check drug interactions');
    }
  }

  /**
   * Get alternative medications for a drug
   * @param {number} medicationId - Medication ID
   * @param {string} reason - Reason for seeking alternatives
   * @returns {Array} Alternative medications
   */
  async getAlternativeMedications(medicationId, reason = null) {
    try {
      return await drugInteractionService.getAlternativeMedications(medicationId, reason);
    } catch (error) {
      console.error('[PrescriptionService] Error getting alternatives:', error);
      return [];
    }
  }

  /**
   * Override safety alert with reason
   * @param {Object} originalPrescriptionData - Original prescription data
   * @param {string} overrideReason - Reason for override
   * @param {number} prescriberId - Prescriber ID
   * @returns {Object} Prescription result
   */
  async overrideSafetyAlert(originalPrescriptionData, overrideReason, prescriberId) {
    if (!overrideReason || overrideReason.trim().length < 10) {
      throw new Error('Override reason must be at least 10 characters long');
    }

    const prescriptionDataWithOverride = {
      ...originalPrescriptionData,
      overrideReason: overrideReason.trim()
    };

    return await this.prescribeMedication(prescriptionDataWithOverride, prescriberId);
  }
}

// Export both the service and the SafetyAlert error class
export { SafetyAlert };
export default new PrescriptionService();