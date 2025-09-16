// Drug Interaction Service for EMR System
// Provides drug-drug interaction checking and safety alerts
import pool from '../db/index.js';
import auditService from './audit.service.js';

class DrugInteractionService {
  constructor() {
    this.severityLevels = {
      1: { level: 'minor', color: 'blue', priority: 'low' },
      2: { level: 'mild', color: 'green', priority: 'low' },
      3: { level: 'moderate', color: 'yellow', priority: 'medium' },
      4: { level: 'major', color: 'orange', priority: 'high' },
      5: { level: 'severe', color: 'red', priority: 'critical' }
    };
  }

  /**
   * Check drug-drug interactions for a list of medications
   * @param {Array} medicationIds - Array of medication IDs
   * @param {number} userId - User ID for audit logging
   * @param {number} patientId - Patient ID for audit logging
   * @returns {Object} Interaction results categorized by severity
   */
  async checkDrugDrugInteractions(medicationIds, userId, patientId = null) {
    try {
      // Log the interaction check for audit purposes
      await auditService.logPHIAccess(
        userId, 
        'drug_interactions', 
        patientId, 
        'interaction_check', 
        `Checking interactions for ${medicationIds.length} medications`,
        'Clinical safety check'
      );

      const interactions = {
        severe: [],
        major: [],
        moderate: [],
        minor: [],
        total: 0
      };

      if (!medicationIds || medicationIds.length < 2) {
        return interactions;
      }

      // Get all drug interactions for the provided medications
      const result = await pool.query(`
        SELECT 
          di.id,
          di.medication_1_id,
          di.medication_2_id,
          di.interaction_type,
          di.severity_level,
          di.description,
          di.mechanism,
          di.clinical_effect,
          di.management,
          di.evidence_level,
          di.onset,
          m1.generic_name as drug1_name,
          m1.brand_name as drug1_brand,
          m1.rxcui as drug1_rxcui,
          m2.generic_name as drug2_name,
          m2.brand_name as drug2_brand,
          m2.rxcui as drug2_rxcui
        FROM drug_interactions di
        INNER JOIN medications m1 ON di.medication_1_id = m1.id
        INNER JOIN medications m2 ON di.medication_2_id = m2.id
        WHERE di.active = true 
        AND di.medication_1_id = ANY($1::int[])
        AND di.medication_2_id = ANY($1::int[])
        AND di.medication_1_id != di.medication_2_id
        ORDER BY di.severity_level DESC, di.evidence_level
      `, [medicationIds]);

      // Categorize interactions by severity
      result.rows.forEach(interaction => {
        const severityInfo = this.severityLevels[interaction.severity_level] || this.severityLevels[3];
        
        const interactionData = {
          id: interaction.id,
          drug1: {
            id: interaction.medication_1_id,
            name: interaction.drug1_name,
            brand: interaction.drug1_brand,
            rxcui: interaction.drug1_rxcui
          },
          drug2: {
            id: interaction.medication_2_id,
            name: interaction.drug2_name,
            brand: interaction.drug2_brand,
            rxcui: interaction.drug2_rxcui
          },
          severity: severityInfo.level,
          severityLevel: interaction.severity_level,
          priority: severityInfo.priority,
          color: severityInfo.color,
          interactionType: interaction.interaction_type,
          description: interaction.description,
          mechanism: interaction.mechanism,
          clinicalEffect: interaction.clinical_effect,
          management: interaction.management,
          evidenceLevel: interaction.evidence_level,
          onset: interaction.onset
        };

        // Add to appropriate severity category
        switch (interaction.severity_level) {
          case 5:
            interactions.severe.push(interactionData);
            break;
          case 4:
            interactions.major.push(interactionData);
            break;
          case 3:
            interactions.moderate.push(interactionData);
            break;
          default:
            interactions.minor.push(interactionData);
        }

        interactions.total++;
      });

      return interactions;

    } catch (error) {
      console.error('[DrugInteractionService] Error checking drug interactions:', error);
      throw new Error('Failed to check drug interactions');
    }
  }

  /**
   * Check drug-allergy interactions for a specific patient
   * @param {Array} medicationIds - Array of medication IDs to check
   * @param {number} patientId - Patient ID
   * @param {number} userId - User ID for audit logging
   * @returns {Array} Array of potential allergy interactions
   */
  async checkDrugAllergyInteractions(medicationIds, patientId, userId) {
    try {
      // Log the allergy check
      await auditService.logPHIAccess(
        userId, 
        'patient_medications', 
        patientId, 
        'allergy_check', 
        `Checking allergies for ${medicationIds.length} medications`,
        'Clinical safety check'
      );

      // Get patient allergies (if the table exists)
      const allergyResult = await pool.query(`
        SELECT 
          pm.name as allergen,
          'medication' as allergen_type,
          'severe' as severity
        FROM patient_medications pm
        WHERE pm.patient_id = $1 
        AND pm.active = false
        AND lower(pm.name) LIKE '%allerg%'
      `, [patientId]);

      // Get medication details for cross-referencing
      const medicationResult = await pool.query(`
        SELECT id, generic_name, brand_name, drug_class
        FROM medications 
        WHERE id = ANY($1::int[])
      `, [medicationIds]);

      const allergies = [];
      const medications = medicationResult.rows;
      const patientAllergies = allergyResult.rows;

      // Simple allergy checking - in production, this would be more sophisticated
      medications.forEach(med => {
        patientAllergies.forEach(allergy => {
          const allergenLower = allergy.allergen.toLowerCase();
          const medNameLower = med.generic_name.toLowerCase();
          const brandNameLower = (med.brand_name || '').toLowerCase();

          if (allergenLower.includes(medNameLower) || 
              allergenLower.includes(brandNameLower) ||
              medNameLower.includes(allergenLower.replace('allergy to ', ''))) {
            
            allergies.push({
              medication: {
                id: med.id,
                name: med.generic_name,
                brand: med.brand_name,
                drugClass: med.drug_class
              },
              allergen: allergy.allergen,
              severity: allergy.severity,
              type: 'direct_match',
              warning: `Patient has documented allergy to ${allergy.allergen}`,
              recommendation: 'Do not prescribe - use alternative medication'
            });
          }
        });
      });

      return allergies;

    } catch (error) {
      console.error('[DrugInteractionService] Error checking drug allergies:', error);
      return []; // Return empty array rather than failing
    }
  }

  /**
   * Get severity level information
   * @param {number} severityLevel - Numeric severity level
   * @returns {Object} Severity information
   */
  getSeverityInfo(severityLevel) {
    return this.severityLevels[severityLevel] || this.severityLevels[3];
  }

  /**
   * Get alternative medications for a given drug
   * @param {number} medicationId - ID of the medication to find alternatives for
   * @param {string} reason - Reason for seeking alternatives
   * @returns {Array} Array of alternative medications
   */
  async getAlternativeMedications(medicationId, reason = null) {
    try {
      // Get the original medication details
      const originalMed = await pool.query(`
        SELECT id, generic_name, brand_name, drug_class, therapeutic_class, dosage_form
        FROM medications 
        WHERE id = $1
      `, [medicationId]);

      if (originalMed.rows.length === 0) {
        throw new Error('Original medication not found');
      }

      const original = originalMed.rows[0];

      // Find alternatives in the same drug class or therapeutic class
      const alternatives = await pool.query(`
        SELECT id, generic_name, brand_name, drug_class, therapeutic_class, dosage_form, strength
        FROM medications 
        WHERE id != $1
        AND active = true
        AND formulary = true
        AND (
          drug_class = $2 
          OR therapeutic_class = $3
        )
        ORDER BY 
          CASE WHEN drug_class = $2 THEN 1 ELSE 2 END,
          generic_name
        LIMIT 10
      `, [medicationId, original.drug_class, original.therapeutic_class]);

      return alternatives.rows.map(alt => ({
        id: alt.id,
        name: alt.generic_name,
        brand: alt.brand_name,
        drugClass: alt.drug_class,
        therapeuticClass: alt.therapeutic_class,
        dosageForm: alt.dosage_form,
        strength: alt.strength,
        similarity: alt.drug_class === original.drug_class ? 'same_class' : 'same_therapeutic_class'
      }));

    } catch (error) {
      console.error('[DrugInteractionService] Error finding alternatives:', error);
      return [];
    }
  }

  /**
   * Check for high-risk medications (LASA drugs, controlled substances, etc.)
   * @param {Array} medicationIds - Array of medication IDs
   * @returns {Object} High-risk medication warnings
   */
  async checkHighRiskMedications(medicationIds) {
    try {
      const result = await pool.query(`
        SELECT id, generic_name, brand_name, drug_class, controlled_substance, schedule
        FROM medications 
        WHERE id = ANY($1::int[])
        AND (
          controlled_substance = true
          OR drug_class IN ('Opioid', 'Benzodiazepine', 'Barbiturate')
          OR generic_name IN ('warfarin', 'insulin', 'digoxin', 'lithium')
        )
      `, [medicationIds]);

      return result.rows.map(med => {
        let riskLevel = 'moderate';
        let warnings = [];
        
        if (med.controlled_substance) {
          riskLevel = 'high';
          warnings.push(`Controlled substance (Schedule ${med.schedule})`);
          warnings.push('Requires DEA number and special monitoring');
        }

        if (['Opioid', 'Benzodiazepine'].includes(med.drug_class)) {
          riskLevel = 'high';
          warnings.push('High risk for abuse and dependency');
          warnings.push('Monitor for respiratory depression');
        }

        if (['warfarin', 'insulin', 'digoxin', 'lithium'].includes(med.generic_name)) {
          riskLevel = 'high';
          warnings.push('Narrow therapeutic index - requires monitoring');
        }

        return {
          medication: {
            id: med.id,
            name: med.generic_name,
            brand: med.brand_name,
            drugClass: med.drug_class
          },
          riskLevel,
          warnings,
          monitoringRequired: true
        };
      });

    } catch (error) {
      console.error('[DrugInteractionService] Error checking high-risk medications:', error);
      return [];
    }
  }

  /**
   * Generate a comprehensive drug safety report
   * @param {Array} medicationIds - Array of medication IDs
   * @param {number} patientId - Patient ID
   * @param {number} userId - User ID
   * @returns {Object} Comprehensive safety report
   */
  async generateSafetyReport(medicationIds, patientId, userId) {
    try {
      const [interactions, allergies, highRiskMeds] = await Promise.all([
        this.checkDrugDrugInteractions(medicationIds, userId, patientId),
        this.checkDrugAllergyInteractions(medicationIds, patientId, userId),
        this.checkHighRiskMedications(medicationIds)
      ]);

      const report = {
        patientId,
        medicationCount: medicationIds.length,
        timestamp: new Date().toISOString(),
        interactions,
        allergies,
        highRiskMedications: highRiskMeds,
        overallRiskLevel: this.calculateOverallRisk(interactions, allergies, highRiskMeds),
        recommendations: this.generateRecommendations(interactions, allergies, highRiskMeds)
      };

      // Log the safety report generation
      await auditService.logPHIAccess(
        userId, 
        'drug_interactions', 
        patientId, 
        'safety_report', 
        `Generated safety report: ${report.overallRiskLevel} risk`,
        'Clinical safety assessment'
      );

      return report;

    } catch (error) {
      console.error('[DrugInteractionService] Error generating safety report:', error);
      throw new Error('Failed to generate drug safety report');
    }
  }

  /**
   * Calculate overall risk level based on all safety checks
   * @private
   */
  calculateOverallRisk(interactions, allergies, highRiskMeds) {
    if (interactions.severe.length > 0 || allergies.length > 0) {
      return 'critical';
    }
    if (interactions.major.length > 0 || highRiskMeds.filter(m => m.riskLevel === 'high').length > 0) {
      return 'high';
    }
    if (interactions.moderate.length > 0) {
      return 'moderate';
    }
    return 'low';
  }

  /**
   * Generate recommendations based on safety analysis
   * @private
   */
  generateRecommendations(interactions, allergies, highRiskMeds) {
    const recommendations = [];

    if (interactions.severe.length > 0) {
      recommendations.push({
        priority: 'critical',
        type: 'interaction',
        message: 'SEVERE drug interactions detected - do not prescribe combination',
        action: 'required'
      });
    }

    if (allergies.length > 0) {
      recommendations.push({
        priority: 'critical',
        type: 'allergy',
        message: 'Patient allergies detected - use alternative medications',
        action: 'required'
      });
    }

    if (interactions.major.length > 0) {
      recommendations.push({
        priority: 'high',
        type: 'interaction',
        message: 'Major drug interactions detected - use with extreme caution',
        action: 'review_required'
      });
    }

    if (highRiskMeds.length > 0) {
      recommendations.push({
        priority: 'high',
        type: 'monitoring',
        message: 'High-risk medications require enhanced monitoring',
        action: 'monitoring_required'
      });
    }

    if (interactions.moderate.length > 0) {
      recommendations.push({
        priority: 'medium',
        type: 'interaction',
        message: 'Moderate interactions detected - monitor for side effects',
        action: 'monitor'
      });
    }

    return recommendations;
  }
}

// Export singleton instance
const drugInteractionService = new DrugInteractionService();
export default drugInteractionService;