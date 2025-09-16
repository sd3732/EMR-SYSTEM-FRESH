// Drug Safety System Tests
// Tests critical drug interaction detection and safety alert functionality

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import drugInteractionService from '../../services/drug-interaction.service.js';
import prescriptionService from '../../services/prescription.service.js';
import pool from '../../db/index.js';

describe('Drug Safety', () => {
  let testPatientId;
  let testProviderId;
  let testMedicationIds;

  beforeAll(async () => {
    // Create test patient
    const patientResult = await pool.query(`
      INSERT INTO patients (first_name, last_name, dob, gender) 
      VALUES ('Safety', 'Test', '1980-01-01', 'male')
      RETURNING id
    `);
    testPatientId = patientResult.rows[0].id;

    // Create test provider
    const providerResult = await pool.query(`
      INSERT INTO providers (first_name, last_name, email, specialty, npi) 
      VALUES ('Test', 'Provider', 'safety@test.com', 'Internal Medicine', '1111111111')
      RETURNING id
    `);
    testProviderId = providerResult.rows[0].id;

    // Create test medications with known interactions
    const medicationResults = await pool.query(`
      INSERT INTO medications (generic_name, brand_name, rxcui, drug_class, controlled_substance) VALUES
      ('warfarin', 'Coumadin', '11289', 'Anticoagulant', false),
      ('aspirin', 'Bayer', '1191', 'NSAID', false),
      ('simvastatin', 'Zocor', '36567', 'Statin', false),
      ('gemfibrozil', 'Lopid', '4278', 'Fibrate', false),
      ('morphine', 'MS Contin', '7052', 'Opioid', true)
      RETURNING id
    `);
    testMedicationIds = medicationResults.rows.map(row => row.id);

    // Insert known drug interactions
    await pool.query(`
      INSERT INTO drug_interactions (
        medication_1_id, medication_2_id, interaction_type, severity_level,
        description, clinical_effect, management, evidence_level
      ) VALUES
      ($1, $2, 'pharmacodynamic', 5, 
       'Warfarin + Aspirin: Severe bleeding risk', 
       'Increased risk of major bleeding', 
       'Avoid combination or monitor INR closely', 'high'),
      ($3, $4, 'pharmacokinetic', 4,
       'Simvastatin + Gemfibrozil: Myopathy risk',
       'Increased risk of rhabdomyolysis',
       'Use alternative statin or reduce dose', 'high')
    `, [
      testMedicationIds[0], testMedicationIds[1], // warfarin + aspirin
      testMedicationIds[2], testMedicationIds[3]  // simvastatin + gemfibrozil
    ]);
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM drug_interactions WHERE medication_1_id = ANY($1)', [testMedicationIds]);
    await pool.query('DELETE FROM medications WHERE id = ANY($1)', [testMedicationIds]);
    await pool.query('DELETE FROM patients WHERE id = $1', [testPatientId]);
    await pool.query('DELETE FROM providers WHERE id = $1', [testProviderId]);
  });

  test('detects severe drug interactions', async () => {
    const medicationIds = [testMedicationIds[0], testMedicationIds[1]]; // warfarin + aspirin
    
    const interactions = await drugInteractionService.checkDrugDrugInteractions(
      medicationIds, 
      testProviderId, 
      testPatientId
    );

    expect(interactions.severe).toHaveLength(1);
    expect(interactions.severe[0]).toHaveProperty('severity', 'severe');
    expect(interactions.severe[0]).toHaveProperty('priority', 'critical');
    expect(interactions.severe[0].drug1.name).toBe('warfarin');
    expect(interactions.severe[0].drug2.name).toBe('aspirin');
    expect(interactions.severe[0].description).toContain('bleeding');
  });

  test('checks drug allergies', async () => {
    // Add test allergy
    await pool.query(`
      INSERT INTO patient_medications (patient_id, name, active) 
      VALUES ($1, 'allergy to penicillin', false)
    `, [testPatientId]);

    // Add penicillin medication
    const penicillinResult = await pool.query(`
      INSERT INTO medications (generic_name, brand_name, rxcui, drug_class) 
      VALUES ('penicillin', 'Penicillin VK', '7980', 'Antibiotic')
      RETURNING id
    `);
    const penicillinId = penicillinResult.rows[0].id;

    const allergies = await drugInteractionService.checkDrugAllergyInteractions(
      [penicillinId], 
      testPatientId, 
      testProviderId
    );

    expect(allergies).toHaveLength(1);
    expect(allergies[0]).toHaveProperty('severity', 'severe');
    expect(allergies[0]).toHaveProperty('type', 'direct_match');
    expect(allergies[0].warning).toContain('allergy');
    expect(allergies[0].recommendation).toContain('alternative');

    // Clean up
    await pool.query('DELETE FROM medications WHERE id = $1', [penicillinId]);
    await pool.query('DELETE FROM patient_medications WHERE patient_id = $1 AND name LIKE %allergy%', [testPatientId]);
  });

  test('suggests alternatives correctly', async () => {
    const medicationId = testMedicationIds[0]; // warfarin
    
    const alternatives = await drugInteractionService.getAlternativeMedications(
      medicationId, 
      'interaction'
    );

    expect(alternatives).toBeInstanceOf(Array);
    
    if (alternatives.length > 0) {
      alternatives.forEach(alt => {
        expect(alt).toHaveProperty('name');
        expect(alt).toHaveProperty('drugClass');
        expect(alt).toHaveProperty('similarity');
        expect(alt.id).not.toBe(medicationId); // Should not suggest same medication
      });
    }
  });

  test('requires override for severe interactions', async () => {
    const prescriptionData = {
      patientId: testPatientId,
      medicationId: testMedicationIds[1], // aspirin
      dosage: '81mg',
      frequency: 'daily',
      duration: '30 days',
      indication: 'Cardioprotective therapy'
    };

    // Add warfarin to patient's current medications
    await pool.query(`
      INSERT INTO patient_medications (patient_id, name, dose, frequency, active) 
      VALUES ($1, 'warfarin', '5mg', 'daily', true)
    `, [testPatientId]);

    try {
      await prescriptionService.prescribeMedication(prescriptionData, testProviderId);
      
      // Should not reach here - should throw SafetyAlert
      expect(true).toBe(false);
    } catch (error) {
      expect(error.name).toBe('SafetyAlert');
      expect(error.type).toBe('severe_interaction');
      expect(error.severity).toBe('critical');
      expect(error.message).toContain('override');
    }

    // Clean up
    await pool.query('DELETE FROM patient_medications WHERE patient_id = $1', [testPatientId]);
  });

  test('logs all safety checks', async () => {
    const medicationIds = [testMedicationIds[2], testMedicationIds[3]]; // simvastatin + gemfibrozil
    
    // Clear existing audit logs
    await pool.query('DELETE FROM phi_access_logs WHERE user_id = $1', [testProviderId]);

    await drugInteractionService.checkDrugDrugInteractions(
      medicationIds, 
      testProviderId, 
      testPatientId
    );

    // Check audit logs
    const auditLogs = await pool.query(`
      SELECT * FROM phi_access_logs 
      WHERE user_id = $1 AND action_type = 'interaction_check'
      ORDER BY created_at DESC
    `, [testProviderId]);

    expect(auditLogs.rows.length).toBeGreaterThan(0);
    
    const log = auditLogs.rows[0];
    expect(log.resource_type).toBe('drug_interactions');
    expect(log.patient_id).toBe(testPatientId);
    expect(log.action_description).toContain('interactions');
  });

  test('handles controlled substances properly', async () => {
    const morphineId = testMedicationIds[4]; // morphine (controlled)
    
    const prescriptionData = {
      patientId: testPatientId,
      medicationId: morphineId,
      dosage: '15mg',
      frequency: 'every 4 hours',
      duration: '7 days',
      indication: 'Post-operative pain'
    };

    const result = await prescriptionService.prescribeMedication(prescriptionData, testProviderId);

    expect(result.alerts.some(alert => 
      alert.type === 'high_risk' && 
      alert.title === 'Controlled Substance'
    )).toBe(true);

    // Check for DEA compliance warning
    const controlledAlert = result.alerts.find(alert => alert.type === 'high_risk');
    expect(controlledAlert.recommendation).toContain('DEA');
  });

  test('validates dosing ranges', async () => {
    const medicationId = testMedicationIds[0]; // warfarin
    
    // Update medication with typical dosing ranges
    await pool.query(`
      UPDATE medications 
      SET typical_dose_min = 2.5, typical_dose_max = 10.0
      WHERE id = $1
    `, [medicationId]);

    // Test high dose
    const highDoseData = {
      patientId: testPatientId,
      medicationId: medicationId,
      dosage: '15mg', // Above typical max
      frequency: 'daily',
      indication: 'Anticoagulation'
    };

    const highDoseResult = await prescriptionService.prescribeMedication(highDoseData, testProviderId);
    
    const highDoseAlert = highDoseResult.alerts.find(alert => alert.type === 'dosing_concern');
    expect(highDoseAlert).toBeDefined();
    expect(highDoseAlert.severity).toBe('high');
    expect(highDoseAlert.message).toContain('exceeds typical maximum');

    // Test low dose
    const lowDoseData = {
      patientId: testPatientId,
      medicationId: medicationId,
      dosage: '1mg', // Below typical min
      frequency: 'daily',
      indication: 'Anticoagulation'
    };

    const lowDoseResult = await prescriptionService.prescribeMedication(lowDoseData, testProviderId);
    
    const lowDoseAlert = lowDoseResult.alerts.find(alert => alert.type === 'dosing_concern');
    expect(lowDoseAlert).toBeDefined();
    expect(lowDoseAlert.severity).toBe('medium');
    expect(lowDoseAlert.message).toContain('below typical minimum');
  });

  test('checks for duplicate therapy', async () => {
    const aspirinId = testMedicationIds[1]; // aspirin (NSAID)
    
    // Add existing NSAID to patient
    await pool.query(`
      INSERT INTO patient_medications (patient_id, name, dose, frequency, active) 
      VALUES ($1, 'ibuprofen', '400mg', 'three times daily', true)
    `, [testPatientId]);

    const prescriptionData = {
      patientId: testPatientId,
      medicationId: aspirinId,
      dosage: '325mg',
      frequency: 'twice daily',
      indication: 'Pain relief'
    };

    try {
      await prescriptionService.prescribeMedication(prescriptionData, testProviderId);
      
      // Should throw SafetyAlert for duplicate therapy
      expect(true).toBe(false);
    } catch (error) {
      expect(error.name).toBe('SafetyAlert');
      expect(error.type).toBe('duplicate_therapy');
      expect(error.message).toContain('similar medication');
    }

    // Clean up
    await pool.query('DELETE FROM patient_medications WHERE patient_id = $1', [testPatientId]);
  });

  test('performance benchmark for interaction checking', async () => {
    const medicationCount = 10;
    const iterations = 5;
    
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      await drugInteractionService.checkDrugDrugInteractions(
        testMedicationIds.slice(0, medicationCount), 
        testProviderId, 
        testPatientId
      );
    }
    
    const endTime = Date.now();
    const avgTime = (endTime - startTime) / iterations;
    
    // Should complete interaction check in under 500ms
    expect(avgTime).toBeLessThan(500);
  });

  test('generates comprehensive safety report', async () => {
    const medicationIds = testMedicationIds.slice(0, 3); // First 3 medications
    
    const safetyReport = await drugInteractionService.generateSafetyReport(
      medicationIds, 
      testPatientId, 
      testProviderId
    );

    expect(safetyReport).toHaveProperty('patientId', testPatientId);
    expect(safetyReport).toHaveProperty('medicationCount', medicationIds.length);
    expect(safetyReport).toHaveProperty('interactions');
    expect(safetyReport).toHaveProperty('allergies');
    expect(safetyReport).toHaveProperty('highRiskMedications');
    expect(safetyReport).toHaveProperty('overallRiskLevel');
    expect(safetyReport).toHaveProperty('recommendations');
    expect(safetyReport).toHaveProperty('timestamp');

    // Verify recommendations structure
    if (safetyReport.recommendations.length > 0) {
      safetyReport.recommendations.forEach(rec => {
        expect(rec).toHaveProperty('priority');
        expect(rec).toHaveProperty('type');
        expect(rec).toHaveProperty('message');
        expect(rec).toHaveProperty('action');
      });
    }
  });
});