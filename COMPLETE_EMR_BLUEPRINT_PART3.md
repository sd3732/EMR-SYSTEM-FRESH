# COMPLETE EMR BLUEPRINT - PART 3: BILLING, REVENUE & COMPLIANCE

## Table of Contents
1. [E&M Code Calculation Engine](#1-em-code-calculation-engine)
2. [Charge Capture & CPT Coding](#2-charge-capture--cpt-coding)
3. [Claims Submission (837 EDI)](#3-claims-submission-837-edi)
4. [ERA Processing (835 EDI)](#4-era-processing-835-edi)
5. [Denial Management & Appeals](#5-denial-management--appeals)
6. [Payment Posting & Reconciliation](#6-payment-posting--reconciliation)
7. [Insurance Eligibility Verification](#7-insurance-eligibility-verification)
8. [HIPAA Compliance Features](#8-hipaa-compliance-features)

---

## 1. E&M Code Calculation Engine

### 1.1 2021 MDM Guidelines Implementation

The system implements automated E&M code calculation based on the **2021 MDM (Medical Decision Making)** guidelines with three key components:

1. **Number and Complexity of Problems Addressed**
2. **Amount and/or Complexity of Data Reviewed**
3. **Risk of Complications, Morbidity, Mortality**

```javascript
// backend/useCases/CalculateEMCodeUseCase.js
const pool = require('../config/database');

class CalculateEMCodeUseCase {
  async execute(encounterId) {
    const encounter = await this.getEncounterData(encounterId);

    // Calculate MDM level
    const mdmLevel = this.calculateMDMLevel(encounter);

    // Determine E&M code based on MDM level and encounter type
    const emCode = this.determineEMCode(mdmLevel, encounter.encounter_type);

    // Save calculated code
    await pool.query(
      `INSERT INTO charges (encounter_id, patient_id, provider_id, clinic_id,
        cpt_code, description, units, charge_amount, service_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, 'pending')`,
      [
        encounterId,
        encounter.patient_id,
        encounter.provider_id,
        encounter.clinic_id,
        emCode.code,
        emCode.description,
        emCode.fee,
        encounter.encounter_date
      ]
    );

    return {
      emCode,
      mdmLevel,
      rationale: this.generateRationale(mdmLevel, encounter)
    };
  }

  async getEncounterData(encounterId) {
    const result = await pool.query(
      `SELECT e.*,
        COUNT(DISTINCT ed.id) as diagnosis_count,
        COUNT(DISTINCT lo.id) as lab_order_count,
        COUNT(DISTINCT io.id) as imaging_order_count,
        COUNT(DISTINCT p.id) as prescription_count
       FROM encounters e
       LEFT JOIN encounter_diagnoses ed ON ed.encounter_id = e.id
       LEFT JOIN lab_orders lo ON lo.encounter_id = e.id
       LEFT JOIN imaging_orders io ON io.encounter_id = e.id
       LEFT JOIN prescriptions p ON p.encounter_id = e.id
       WHERE e.id = $1
       GROUP BY e.id`,
      [encounterId]
    );

    return result.rows[0];
  }

  /**
   * Calculate MDM Level (Straightforward, Low, Moderate, High)
   */
  calculateMDMLevel(encounter) {
    const problemsScore = this.scoreProblemsAddressed(encounter);
    const dataScore = this.scoreDataReviewed(encounter);
    const riskScore = this.scoreRisk(encounter);

    const scores = {
      problems: problemsScore,
      data: dataScore,
      risk: riskScore
    };

    // MDM Level determined by 2 of 3 elements
    const levels = [problemsScore.level, dataScore.level, riskScore.level];
    const highCount = levels.filter(l => l === 'High').length;
    const moderateCount = levels.filter(l => l === 'Moderate').length;

    if (highCount >= 2) return { level: 'High', scores };
    if (highCount >= 1 && moderateCount >= 1) return { level: 'High', scores };
    if (moderateCount >= 2) return { level: 'Moderate', scores };
    if (levels.filter(l => l === 'Low').length >= 2) return { level: 'Low', scores };

    return { level: 'Straightforward', scores };
  }

  /**
   * Score: Number and Complexity of Problems
   */
  scoreProblemsAddressed(encounter) {
    const diagnosisCount = parseInt(encounter.diagnosis_count) || 0;

    // Check for chronic illnesses or acute conditions
    const hasChronicIllness = encounter.chronic_diagnosis_count > 0;
    const hasAcuteUncomplicated = diagnosisCount >= 1 && !hasChronicIllness;
    const hasAcuteComplicated = diagnosisCount >= 2;
    const hasChronicSevere = encounter.chronic_severe_count > 0;

    if (hasChronicSevere || diagnosisCount >= 3) {
      return { level: 'High', description: 'Multiple chronic illnesses or severe exacerbation' };
    }

    if (hasChronicIllness || hasAcuteComplicated) {
      return { level: 'Moderate', description: 'Chronic illness with exacerbation or multiple stable chronic conditions' };
    }

    if (hasAcuteUncomplicated || diagnosisCount >= 1) {
      return { level: 'Low', description: 'Acute uncomplicated illness or minor problem' };
    }

    return { level: 'Straightforward', description: 'Minimal or self-limited problem' };
  }

  /**
   * Score: Amount/Complexity of Data Reviewed
   */
  scoreDataReviewed(encounter) {
    const labCount = parseInt(encounter.lab_order_count) || 0;
    const imagingCount = parseInt(encounter.imaging_order_count) || 0;
    const totalTests = labCount + imagingCount;

    let points = 0;

    // Category 1: Tests and documents
    if (labCount > 0) points += 1;
    if (imagingCount > 0) points += 1;

    // Category 2: Independent interpretation (if provider reviewed imaging)
    if (encounter.independent_interpretation) points += 2;

    // Category 3: Discussion with external provider
    if (encounter.external_discussion) points += 1;

    if (points >= 3 || encounter.independent_interpretation) {
      return { level: 'High', points, description: 'Extensive review and analysis' };
    }

    if (points === 2 || totalTests >= 3) {
      return { level: 'Moderate', points, description: 'Moderate amount of data reviewed' };
    }

    if (points === 1 || totalTests >= 1) {
      return { level: 'Low', points, description: 'Limited data reviewed' };
    }

    return { level: 'Straightforward', points: 0, description: 'Minimal or no data reviewed' };
  }

  /**
   * Score: Risk of Complications/Morbidity/Mortality
   */
  scoreRisk(encounter) {
    const prescriptionCount = parseInt(encounter.prescription_count) || 0;

    // Check for high-risk prescriptions or procedures
    const hasControlledSubstances = encounter.controlled_substance_count > 0;
    const hasProcedure = encounter.procedure_performed === true;
    const hasER = encounter.er_visit_risk === true;

    if (hasER || hasProcedure || hasControlledSubstances) {
      return { level: 'High', description: 'High risk of morbidity or emergency intervention' };
    }

    if (prescriptionCount > 0) {
      return { level: 'Moderate', description: 'Prescription drug management' };
    }

    if (encounter.ros_systems_count >= 2) {
      return { level: 'Low', description: 'Low risk of morbidity' };
    }

    return { level: 'Straightforward', description: 'Minimal risk' };
  }

  /**
   * Determine E&M code based on MDM level and visit type
   */
  determineEMCode(mdmResult, encounterType) {
    const { level } = mdmResult;

    // Office Visit - Established Patient
    if (encounterType === 'Office Visit' || encounterType === 'Follow-up') {
      const codes = {
        'Straightforward': { code: '99212', description: 'Office visit, est patient, Level 2', fee: 75.00 },
        'Low': { code: '99213', description: 'Office visit, est patient, Level 3', fee: 110.00 },
        'Moderate': { code: '99214', description: 'Office visit, est patient, Level 4', fee: 165.00 },
        'High': { code: '99215', description: 'Office visit, est patient, Level 5', fee: 210.00 }
      };
      return codes[level];
    }

    // Office Visit - New Patient
    if (encounterType === 'New Patient') {
      const codes = {
        'Straightforward': { code: '99202', description: 'Office visit, new patient, Level 2', fee: 100.00 },
        'Low': { code: '99203', description: 'Office visit, new patient, Level 3', fee: 145.00 },
        'Moderate': { code: '99204', description: 'Office visit, new patient, Level 4', fee: 210.00 },
        'High': { code: '99205', description: 'Office visit, new patient, Level 5', fee: 280.00 }
      };
      return codes[level];
    }

    // Default to established patient level 3
    return { code: '99213', description: 'Office visit, est patient, Level 3', fee: 110.00 };
  }

  /**
   * Generate human-readable rationale for code selection
   */
  generateRationale(mdmResult, encounter) {
    const { level, scores } = mdmResult;

    return {
      summary: `E&M level determined as ${level} complexity based on 2021 MDM guidelines`,
      problemsAddressed: scores.problems.description,
      dataReviewed: scores.data.description,
      riskLevel: scores.risk.description,
      diagnosisCount: encounter.diagnosis_count,
      ordersPlaced: {
        labs: encounter.lab_order_count,
        imaging: encounter.imaging_order_count
      }
    };
  }
}

module.exports = CalculateEMCodeUseCase;
```

### 1.2 E&M Code Calculator UI

```jsx
// frontend/components/Billing/EMCodeCalculator.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const EMCodeCalculator = ({ encounterId }) => {
  const [calculation, setCalculation] = useState(null);
  const [loading, setLoading] = useState(false);

  const calculateCode = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`/api/encounters/${encounterId}/calculate-em-code`);
      setCalculation(response.data);
    } catch (error) {
      console.error('E&M calculation error:', error);
      alert('Error calculating E&M code');
    } finally {
      setLoading(false);
    }
  };

  if (!calculation) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">E&M Code Calculator</h3>
        <button
          onClick={calculateCode}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? 'Calculating...' : 'Calculate E&M Code'}
        </button>
      </div>
    );
  }

  const { emCode, mdmLevel, rationale } = calculation;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">E&M Code Calculation Result</h3>

      {/* Calculated Code */}
      <div className="bg-green-50 border border-green-200 rounded p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-green-700">Calculated E&M Code</p>
            <p className="text-2xl font-bold text-green-900">{emCode.code}</p>
            <p className="text-sm text-gray-700">{emCode.description}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Fee</p>
            <p className="text-2xl font-bold">${emCode.fee.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* MDM Breakdown */}
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-2">Medical Decision Making: {mdmLevel.level}</h4>
          <p className="text-sm text-gray-600">{rationale.summary}</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="border rounded p-3">
            <p className="text-xs text-gray-600 mb-1">Problems Addressed</p>
            <p className={`text-sm font-semibold ${getLevelColor(mdmLevel.scores.problems.level)}`}>
              {mdmLevel.scores.problems.level}
            </p>
            <p className="text-xs text-gray-500 mt-1">{mdmLevel.scores.problems.description}</p>
          </div>

          <div className="border rounded p-3">
            <p className="text-xs text-gray-600 mb-1">Data Reviewed</p>
            <p className={`text-sm font-semibold ${getLevelColor(mdmLevel.scores.data.level)}`}>
              {mdmLevel.scores.data.level}
            </p>
            <p className="text-xs text-gray-500 mt-1">{mdmLevel.scores.data.description}</p>
          </div>

          <div className="border rounded p-3">
            <p className="text-xs text-gray-600 mb-1">Risk Level</p>
            <p className={`text-sm font-semibold ${getLevelColor(mdmLevel.scores.risk.level)}`}>
              {mdmLevel.scores.risk.level}
            </p>
            <p className="text-xs text-gray-500 mt-1">{mdmLevel.scores.risk.description}</p>
          </div>
        </div>

        {/* Supporting Data */}
        <div className="bg-gray-50 rounded p-3">
          <p className="text-sm font-medium mb-2">Supporting Data:</p>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>• {rationale.diagnosisCount} diagnosis code(s) documented</li>
            <li>• {rationale.ordersPlaced.labs} lab order(s) placed</li>
            <li>• {rationale.ordersPlaced.imaging} imaging order(s) placed</li>
          </ul>
        </div>
      </div>

      <button
        onClick={() => setCalculation(null)}
        className="mt-4 px-4 py-2 text-blue-600 hover:underline"
      >
        Recalculate
      </button>
    </div>
  );
};

const getLevelColor = (level) => {
  const colors = {
    'Straightforward': 'text-gray-600',
    'Low': 'text-blue-600',
    'Moderate': 'text-yellow-600',
    'High': 'text-red-600'
  };
  return colors[level] || 'text-gray-600';
};

export default EMCodeCalculator;
```

---

## 2. Charge Capture & CPT Coding

### 2.1 Charge Entry System

```javascript
// backend/useCases/CreateChargeUseCase.js
const pool = require('../config/database');

class CreateChargeUseCase {
  async execute(chargeData, userId) {
    const {
      encounter_id,
      patient_id,
      clinic_id,
      provider_id,
      cpt_code,
      modifiers,
      units,
      diagnosis_pointers, // Array of diagnosis ranks [1, 2, 3]
      service_date
    } = chargeData;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get CPT code details and fee
      const cptResult = await client.query(
        `SELECT code, description, facility_fee FROM cpt_codes WHERE code = $1`,
        [cpt_code]
      );

      if (cptResult.rows.length === 0) {
        throw new Error(`CPT code ${cpt_code} not found`);
      }

      const cpt = cptResult.rows[0];
      const chargeAmount = parseFloat(cpt.facility_fee) * units;

      // Validate diagnosis pointers
      if (!diagnosis_pointers || diagnosis_pointers.length === 0) {
        throw new Error('At least one diagnosis pointer is required');
      }

      // Create charge
      const chargeResult = await client.query(
        `INSERT INTO charges
         (encounter_id, patient_id, clinic_id, provider_id, cpt_code, description,
          modifiers, units, charge_amount, diagnosis_pointers, service_date,
          status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12)
         RETURNING *`,
        [
          encounter_id, patient_id, clinic_id, provider_id, cpt_code, cpt.description,
          modifiers, units, chargeAmount, diagnosis_pointers, service_date, userId
        ]
      );

      await client.query('COMMIT');

      return chargeResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = CreateChargeUseCase;
```

### 2.2 Charge Capture Interface

```jsx
// frontend/components/Billing/ChargeCapture.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ChargeCapture = ({ encounterId, patientId }) => {
  const [charges, setCharges] = useState([]);
  const [diagnoses, setDiagnoses] = useState([]);
  const [cptSearch, setCptSearch] = useState('');
  const [cptResults, setCptResults] = useState([]);
  const [newCharge, setNewCharge] = useState({
    cpt_code: '',
    units: 1,
    modifiers: [],
    diagnosis_pointers: []
  });

  useEffect(() => {
    loadEncounterData();
  }, [encounterId]);

  useEffect(() => {
    if (cptSearch.length >= 2) {
      searchCPTCodes();
    }
  }, [cptSearch]);

  const loadEncounterData = async () => {
    try {
      const [chargesRes, diagnosesRes] = await Promise.all([
        axios.get(`/api/encounters/${encounterId}/charges`),
        axios.get(`/api/encounters/${encounterId}/diagnoses`)
      ]);

      setCharges(chargesRes.data);
      setDiagnoses(diagnosesRes.data);
    } catch (error) {
      console.error('Error loading encounter data:', error);
    }
  };

  const searchCPTCodes = async () => {
    try {
      const response = await axios.get('/api/cpt-codes/search', {
        params: { q: cptSearch, limit: 10 }
      });
      setCptResults(response.data);
    } catch (error) {
      console.error('CPT search error:', error);
    }
  };

  const addCharge = async () => {
    if (!newCharge.cpt_code) {
      alert('Please select a CPT code');
      return;
    }

    if (newCharge.diagnosis_pointers.length === 0) {
      alert('Please link at least one diagnosis');
      return;
    }

    try {
      await axios.post('/api/charges', {
        encounter_id: encounterId,
        patient_id: patientId,
        ...newCharge
      });

      // Reset form
      setNewCharge({
        cpt_code: '',
        units: 1,
        modifiers: [],
        diagnosis_pointers: []
      });
      setCptSearch('');
      setCptResults([]);

      // Reload charges
      loadEncounterData();
    } catch (error) {
      alert(`Error adding charge: ${error.response?.data?.error || error.message}`);
    }
  };

  const selectCPT = (cpt) => {
    setNewCharge({ ...newCharge, cpt_code: cpt.code });
    setCptSearch(`${cpt.code} - ${cpt.description}`);
    setCptResults([]);
  };

  const toggleDiagnosisPointer = (rank) => {
    const pointers = [...newCharge.diagnosis_pointers];
    const index = pointers.indexOf(rank);

    if (index >= 0) {
      pointers.splice(index, 1);
    } else {
      pointers.push(rank);
    }

    setNewCharge({ ...newCharge, diagnosis_pointers: pointers.sort() });
  };

  return (
    <div className="space-y-6">
      {/* Existing Charges */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Encounter Charges</h3>
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">CPT Code</th>
              <th className="px-4 py-2 text-left">Description</th>
              <th className="px-4 py-2 text-left">Modifiers</th>
              <th className="px-4 py-2 text-left">Units</th>
              <th className="px-4 py-2 text-left">Amount</th>
              <th className="px-4 py-2 text-left">Dx Pointers</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {charges.map(charge => (
              <tr key={charge.id}>
                <td className="px-4 py-2 font-mono">{charge.cpt_code}</td>
                <td className="px-4 py-2">{charge.description}</td>
                <td className="px-4 py-2">{charge.modifiers?.join(', ') || '-'}</td>
                <td className="px-4 py-2">{charge.units}</td>
                <td className="px-4 py-2">${charge.charge_amount.toFixed(2)}</td>
                <td className="px-4 py-2">{charge.diagnosis_pointers?.join(', ')}</td>
                <td className="px-4 py-2">
                  <button className="text-red-600 hover:underline text-sm">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {charges.length === 0 && (
          <p className="text-center text-gray-500 py-4">No charges added yet</p>
        )}
      </div>

      {/* Add New Charge */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Add Charge</h3>

        <div className="space-y-4">
          {/* CPT Code Search */}
          <div className="relative">
            <label className="block text-sm font-medium mb-1">CPT Code</label>
            <input
              type="text"
              value={cptSearch}
              onChange={(e) => setCptSearch(e.target.value)}
              placeholder="Search CPT codes..."
              className="w-full p-2 border rounded"
            />
            {cptResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded shadow-lg max-h-60 overflow-y-auto">
                {cptResults.map(cpt => (
                  <div
                    key={cpt.code}
                    onClick={() => selectCPT(cpt)}
                    className="p-2 hover:bg-gray-100 cursor-pointer"
                  >
                    <span className="font-mono text-sm text-blue-600">{cpt.code}</span>
                    {' - '}
                    <span className="text-sm">{cpt.description}</span>
                    <span className="float-right text-sm text-gray-600">${cpt.facility_fee}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Units */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Units</label>
              <input
                type="number"
                min="1"
                value={newCharge.units}
                onChange={(e) => setNewCharge({ ...newCharge, units: parseInt(e.target.value) })}
                className="w-full p-2 border rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Modifiers (optional)</label>
              <input
                type="text"
                placeholder="e.g., 25, 59"
                value={newCharge.modifiers.join(', ')}
                onChange={(e) => setNewCharge({
                  ...newCharge,
                  modifiers: e.target.value.split(',').map(m => m.trim()).filter(m => m)
                })}
                className="w-full p-2 border rounded"
              />
            </div>
          </div>

          {/* Diagnosis Linking */}
          <div>
            <label className="block text-sm font-medium mb-2">Link to Diagnoses (required)</label>
            <div className="space-y-2">
              {diagnoses.map((dx, index) => (
                <div key={dx.id} className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={newCharge.diagnosis_pointers.includes(index + 1)}
                    onChange={() => toggleDiagnosisPointer(index + 1)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">
                    <span className="font-mono text-blue-600">{dx.icd10_code}</span>
                    {' - '}
                    <span>{dx.description}</span>
                    {dx.is_primary && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        PRIMARY
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={addCharge}
            className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Add Charge
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChargeCapture;
```

---

## 3. Claims Submission (837 EDI)

### 3.1 Claim Creation & Validation

```javascript
// backend/useCases/CreateClaimUseCase.js
const pool = require('../config/database');

class CreateClaimUseCase {
  async execute(encounterId, insuranceId, userId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get encounter and charges
      const encounterResult = await client.query(
        `SELECT e.*, p.* FROM encounters e
         JOIN patients p ON p.id = e.patient_id
         WHERE e.id = $1`,
        [encounterId]
      );

      if (encounterResult.rows.length === 0) {
        throw new Error('Encounter not found');
      }

      const encounter = encounterResult.rows[0];

      // Get charges
      const chargesResult = await client.query(
        `SELECT * FROM charges WHERE encounter_id = $1 AND status = 'pending'`,
        [encounterId]
      );

      if (chargesResult.rows.length === 0) {
        throw new Error('No charges to bill');
      }

      const charges = chargesResult.rows;

      // Get insurance
      const insuranceResult = await client.query(
        `SELECT * FROM patient_insurance WHERE id = $1`,
        [insuranceId]
      );

      const insurance = insuranceResult.rows[0];

      // Calculate totals
      const totalChargeAmount = charges.reduce((sum, c) => sum + parseFloat(c.charge_amount), 0);

      // Generate claim number
      const claimNumber = await this.generateClaimNumber(client);

      // Create claim
      const claimResult = await client.query(
        `INSERT INTO claims
         (encounter_id, patient_id, insurance_id, clinic_id, claim_number,
          total_charge_amount, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7)
         RETURNING *`,
        [
          encounterId,
          encounter.patient_id,
          insuranceId,
          encounter.clinic_id,
          claimNumber,
          totalChargeAmount,
          userId
        ]
      );

      const claim = claimResult.rows[0];

      // Link charges to claim
      for (const [index, charge] of charges.entries()) {
        await client.query(
          `INSERT INTO claim_charges (claim_id, charge_id, line_number)
           VALUES ($1, $2, $3)`,
          [claim.id, charge.id, index + 1]
        );

        // Update charge status
        await client.query(
          `UPDATE charges SET status = 'submitted' WHERE id = $1`,
          [charge.id]
        );
      }

      await client.query('COMMIT');

      return claim;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async generateClaimNumber(client) {
    const result = await client.query(
      `SELECT COALESCE(MAX(SUBSTRING(claim_number FROM '[0-9]+')::INTEGER), 0) + 1 as next_num
       FROM claims`
    );
    const nextNum = result.rows[0].next_num;
    return `CLM${String(nextNum).padStart(8, '0')}`;
  }
}

module.exports = CreateClaimUseCase;
```

### 3.2 EDI 837 Generation

```javascript
// backend/services/EDI837Generator.js
class EDI837Generator {
  /**
   * Generate EDI 837 Professional (837P) file
   */
  async generate837P(claim) {
    const segments = [];

    // ISA - Interchange Control Header
    segments.push(this.generateISA());

    // GS - Functional Group Header
    segments.push(this.generateGS());

    // ST - Transaction Set Header
    segments.push('ST*837*0001*005010X222A1~');

    // BHT - Beginning of Hierarchical Transaction
    segments.push(this.generateBHT(claim));

    // 1000A - Submitter
    segments.push(this.generate1000A());

    // 1000B - Receiver
    segments.push(this.generate1000B(claim.payer_id));

    // 2000A - Billing Provider
    segments.push(this.generate2000A(claim));

    // 2000B - Subscriber
    segments.push(this.generate2000B(claim));

    // 2000C - Patient (if different from subscriber)
    if (claim.patient_id !== claim.subscriber_id) {
      segments.push(this.generate2000C(claim));
    }

    // 2300 - Claim Information
    segments.push(this.generate2300(claim));

    // 2400 - Service Lines
    for (const line of claim.service_lines) {
      segments.push(this.generate2400(line));
    }

    // SE - Transaction Set Trailer
    const segmentCount = segments.length + 1;
    segments.push(`SE*${segmentCount}*0001~`);

    // GE - Functional Group Trailer
    segments.push('GE*1*1~');

    // IEA - Interchange Control Trailer
    segments.push('IEA*1*000000001~');

    return segments.join('\n');
  }

  generateISA() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '').slice(2); // YYMMDD
    const time = now.toTimeString().slice(0, 5).replace(':', ''); // HHMM

    return `ISA*00*          *00*          *ZZ*SUBMITTER_ID   *ZZ*RECEIVER_ID    *${date}*${time}*^*00501*000000001*0*P*:~`;
  }

  generateGS() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const time = now.toTimeString().slice(0, 8).replace(/:/g, ''); // HHMMSS

    return `GS*HC*SUBMITTER_CODE*RECEIVER_CODE*${date}*${time}*1*X*005010X222A1~`;
  }

  generateBHT(claim) {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const time = now.toTimeString().slice(0, 8).replace(/:/g, ''); // HHMMSS

    return `BHT*0019*00*${claim.claim_number}*${date}*${time}*CH~`;
  }

  generate1000A() {
    // Submitter (Clinic)
    return `NM1*41*2*CLINIC_NAME*****46*CLINIC_NPI~
PER*IC*CONTACT_NAME*TE*5551234567~`;
  }

  generate1000B(payerId) {
    // Receiver (Payer)
    return `NM1*40*2*INSURANCE_COMPANY*****46*${payerId}~`;
  }

  generate2000A(claim) {
    // Billing Provider
    return `HL*1**20*1~
NM1*85*2*CLINIC_NAME*****XX*${claim.clinic_npi}~
N3*${claim.clinic_address}~
N4*${claim.clinic_city}*${claim.clinic_state}*${claim.clinic_zip}~
REF*EI*${claim.clinic_tax_id}~`;
  }

  generate2000B(claim) {
    // Subscriber
    return `HL*2*1*22*${claim.patient_is_subscriber ? '0' : '1'}~
SBR*P*${claim.subscriber_relationship}*${claim.group_number}******MC~
NM1*IL*1*${claim.subscriber_last_name}*${claim.subscriber_first_name}****MI*${claim.member_id}~
N3*${claim.subscriber_address}~
N4*${claim.subscriber_city}*${claim.subscriber_state}*${claim.subscriber_zip}~
DMG*D8*${claim.subscriber_dob}*${claim.subscriber_gender}~`;
  }

  generate2000C(claim) {
    // Patient (if different from subscriber)
    return `HL*3*2*23*0~
PAT*${claim.patient_relationship}~
NM1*QC*1*${claim.patient_last_name}*${claim.patient_first_name}~
N3*${claim.patient_address}~
N4*${claim.patient_city}*${claim.patient_state}*${claim.patient_zip}~
DMG*D8*${claim.patient_dob}*${claim.patient_gender}~`;
  }

  generate2300(claim) {
    // Claim Information
    const segments = [];

    segments.push(`CLM*${claim.claim_number}*${claim.total_charge_amount}***11:B:1*Y*A*Y*Y~`);
    segments.push(`DTP*431*D8*${claim.service_date.replace(/-/g, '')}~`);
    segments.push(`REF*D9*${claim.claim_number}~`);

    // Rendering Provider
    segments.push(`NM1*82*1*${claim.provider_last_name}*${claim.provider_first_name}****XX*${claim.provider_npi}~`);

    // Diagnoses
    const diagnosisCodes = claim.diagnoses.map(d => d.icd10_code).join(':');
    segments.push(`HI*ABK:${diagnosisCodes}~`);

    return segments.join('\n');
  }

  generate2400(line) {
    // Service Line
    const segments = [];

    segments.push(`LX*${line.line_number}~`);
    segments.push(`SV1*HC:${line.cpt_code}${line.modifiers ? ':' + line.modifiers.join(':') : ''}*${line.charge_amount}*UN*${line.units}***${line.diagnosis_pointers.join(':')}~`);
    segments.push(`DTP*472*D8*${line.service_date.replace(/-/g, '')}~`);

    return segments.join('\n');
  }
}

module.exports = EDI837Generator;
```

### 3.3 Claim Submission Process

```javascript
// backend/useCases/SubmitClaimUseCase.js
const pool = require('../config/database');
const EDI837Generator = require('../services/EDI837Generator');
const axios = require('axios');

class SubmitClaimUseCase {
  async execute(claimId, userId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get full claim data with all related records
      const claimData = await this.getFullClaimData(client, claimId);

      // Validate claim
      this.validateClaim(claimData);

      // Generate EDI 837 file
      const edi837Generator = new EDI837Generator();
      const edi837Content = await edi837Generator.generate837P(claimData);

      // Update claim with EDI content
      await client.query(
        `UPDATE claims
         SET edi_837_file = $1, status = 'submitted', submission_date = NOW()
         WHERE id = $2`,
        [edi837Content, claimId]
      );

      // Send to clearinghouse
      const clearinghouseResponse = await this.sendToClearinghouse(edi837Content, claimData);

      // Update with clearinghouse ID
      await client.query(
        `UPDATE claims SET clearinghouse_claim_id = $1 WHERE id = $2`,
        [clearinghouseResponse.clearinghouse_id, claimId]
      );

      await client.query('COMMIT');

      return {
        ok: true,
        claimId,
        clearinghouseId: clearinghouseResponse.clearinghouse_id
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getFullClaimData(client, claimId) {
    const result = await client.query(
      `SELECT
        c.*,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        p.date_of_birth as patient_dob,
        p.gender as patient_gender,
        p.address_line1 as patient_address,
        p.city as patient_city,
        p.state as patient_state,
        p.zip_code as patient_zip,
        pi.member_id,
        pi.group_number,
        pi.payer_id,
        pi.payer_name,
        cl.name as clinic_name,
        cl.npi as clinic_npi,
        cl.tax_id as clinic_tax_id,
        cl.address_line1 as clinic_address,
        cl.city as clinic_city,
        cl.state as clinic_state,
        cl.zip_code as clinic_zip,
        u.first_name as provider_first_name,
        u.last_name as provider_last_name,
        u.npi as provider_npi,
        e.encounter_date as service_date
       FROM claims c
       JOIN patients p ON p.id = c.patient_id
       JOIN patient_insurance pi ON pi.id = c.insurance_id
       JOIN clinics cl ON cl.id = c.clinic_id
       JOIN encounters e ON e.id = c.encounter_id
       JOIN users u ON u.id = e.provider_id
       WHERE c.id = $1`,
      [claimId]
    );

    const claim = result.rows[0];

    // Get diagnoses
    const diagnosesResult = await client.query(
      `SELECT ed.* FROM encounter_diagnoses ed
       JOIN encounters e ON e.id = ed.encounter_id
       JOIN claims c ON c.encounter_id = e.id
       WHERE c.id = $1
       ORDER BY ed.rank`,
      [claimId]
    );

    // Get service lines (charges)
    const linesResult = await client.query(
      `SELECT ch.* FROM charges ch
       JOIN claim_charges cc ON cc.charge_id = ch.id
       WHERE cc.claim_id = $1
       ORDER BY cc.line_number`,
      [claimId]
    );

    return {
      ...claim,
      diagnoses: diagnosesResult.rows,
      service_lines: linesResult.rows
    };
  }

  validateClaim(claimData) {
    // Required fields validation
    const required = [
      'patient_first_name',
      'patient_last_name',
      'patient_dob',
      'member_id',
      'clinic_npi',
      'provider_npi'
    ];

    for (const field of required) {
      if (!claimData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Must have at least one diagnosis
    if (!claimData.diagnoses || claimData.diagnoses.length === 0) {
      throw new Error('Claim must have at least one diagnosis');
    }

    // Must have at least one service line
    if (!claimData.service_lines || claimData.service_lines.length === 0) {
      throw new Error('Claim must have at least one service line');
    }

    // Validate NPI format (10 digits)
    if (!/^\d{10}$/.test(claimData.provider_npi)) {
      throw new Error('Invalid provider NPI format');
    }
  }

  async sendToClearinghouse(edi837Content, claimData) {
    try {
      const response = await axios.post(
        process.env.CLEARINGHOUSE_API_URL + '/claims/submit',
        {
          edi_content: edi837Content,
          claim_number: claimData.claim_number,
          payer_id: claimData.payer_id
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.CLEARINGHOUSE_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        clearinghouse_id: response.data.claim_id,
        status: response.data.status
      };
    } catch (error) {
      throw new Error(`Clearinghouse submission failed: ${error.message}`);
    }
  }
}

module.exports = SubmitClaimUseCase;
```

---

## 4. ERA Processing (835 EDI)

### 4.1 ERA Parser & Payment Posting

```javascript
// backend/services/ERA835Parser.js
class ERA835Parser {
  /**
   * Parse EDI 835 ERA (Electronic Remittance Advice)
   */
  parse(edi835Content) {
    const lines = edi835Content.split('~').map(l => l.trim()).filter(l => l);
    const era = {
      payer: {},
      payee: {},
      claims: []
    };

    let currentClaim = null;
    let currentServiceLine = null;

    for (const line of lines) {
      const segments = line.split('*');
      const segmentId = segments[0];

      switch (segmentId) {
        case 'N1':
          if (segments[1] === 'PR') {
            // Payer
            era.payer.name = segments[2];
          } else if (segments[1] === 'PE') {
            // Payee
            era.payee.name = segments[2];
          }
          break;

        case 'REF':
          if (segments[1] === 'EV') {
            era.payer.id = segments[2];
          }
          break;

        case 'TRN':
          era.trace_number = segments[2];
          break;

        case 'DTM':
          if (segments[1] === '405') {
            era.production_date = this.parseDate(segments[2]);
          }
          break;

        case 'CLP':
          // Claim Payment Information
          if (currentClaim) {
            era.claims.push(currentClaim);
          }

          currentClaim = {
            claim_number: segments[1],
            status: segments[2],
            total_charge_amount: parseFloat(segments[3]),
            total_paid_amount: parseFloat(segments[4]),
            patient_responsibility: parseFloat(segments[5]),
            service_lines: [],
            adjustments: []
          };
          break;

        case 'NM1':
          if (segments[1] === 'QC' && currentClaim) {
            // Patient
            currentClaim.patient_name = `${segments[4]} ${segments[3]}`;
            currentClaim.patient_id = segments[9];
          }
          break;

        case 'SVC':
          // Service Line
          if (currentServiceLine && currentClaim) {
            currentClaim.service_lines.push(currentServiceLine);
          }

          const procedureCode = segments[1].split(':')[1];
          currentServiceLine = {
            procedure_code: procedureCode,
            charge_amount: parseFloat(segments[2]),
            paid_amount: parseFloat(segments[3]),
            units: parseFloat(segments[5]),
            adjustments: []
          };
          break;

        case 'CAS':
          // Claim/Service Adjustment
          const adjustment = {
            group_code: segments[1],
            reason_code: segments[2],
            amount: parseFloat(segments[3])
          };

          if (currentServiceLine) {
            currentServiceLine.adjustments.push(adjustment);
          } else if (currentClaim) {
            currentClaim.adjustments.push(adjustment);
          }
          break;

        case 'SE':
          // End of transaction - push last claim
          if (currentServiceLine && currentClaim) {
            currentClaim.service_lines.push(currentServiceLine);
          }
          if (currentClaim) {
            era.claims.push(currentClaim);
          }
          break;
      }
    }

    return era;
  }

  parseDate(ediDate) {
    // YYYYMMDD format
    const year = ediDate.slice(0, 4);
    const month = ediDate.slice(4, 6);
    const day = ediDate.slice(6, 8);
    return `${year}-${month}-${day}`;
  }
}

module.exports = ERA835Parser;
```

### 4.2 Automatic Payment Posting

```javascript
// backend/useCases/ProcessERAUseCase.js
const pool = require('../config/database');
const ERA835Parser = require('../services/ERA835Parser');

class ProcessERAUseCase {
  async execute(edi835Content, userId) {
    const parser = new ERA835Parser();
    const era = parser.parse(edi835Content);

    const client = await pool.connect();
    const results = {
      processed: 0,
      errors: []
    };

    try {
      await client.query('BEGIN');

      for (const eraClaim of era.claims) {
        try {
          await this.processClaim(client, eraClaim, era, userId);
          results.processed++;
        } catch (error) {
          results.errors.push({
            claim_number: eraClaim.claim_number,
            error: error.message
          });
        }
      }

      await client.query('COMMIT');

      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async processClaim(client, eraClaim, era, userId) {
    // Find claim in database
    const claimResult = await client.query(
      `SELECT * FROM claims WHERE claim_number = $1`,
      [eraClaim.claim_number]
    );

    if (claimResult.rows.length === 0) {
      throw new Error(`Claim ${eraClaim.claim_number} not found`);
    }

    const claim = claimResult.rows[0];

    // Post payment
    if (eraClaim.total_paid_amount > 0) {
      await client.query(
        `INSERT INTO payments
         (claim_id, patient_id, payer_type, payment_method, amount, payment_date,
          era_835_file, posted_by, posted_at)
         VALUES ($1, $2, 'insurance', 'ERA', $3, $4, $5, $6, NOW())`,
        [
          claim.id,
          claim.patient_id,
          eraClaim.total_paid_amount,
          era.production_date,
          JSON.stringify(era),
          userId
        ]
      );
    }

    // Post adjustments
    for (const adjustment of eraClaim.adjustments) {
      await client.query(
        `INSERT INTO adjustments
         (claim_id, adjustment_type, reason_code, amount, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          claim.id,
          adjustment.group_code,
          adjustment.reason_code,
          adjustment.amount,
          userId
        ]
      );
    }

    // Update claim amounts
    await client.query(
      `UPDATE claims
       SET total_paid_amount = $1,
           patient_responsibility = $2,
           adjudication_date = $3,
           status = $4
       WHERE id = $5`,
      [
        eraClaim.total_paid_amount,
        eraClaim.patient_responsibility,
        era.production_date,
        eraClaim.status === '1' ? 'paid' : 'partially_paid',
        claim.id
      ]
    );

    // Check for denials
    if (eraClaim.status === '4' || eraClaim.total_paid_amount === 0) {
      await this.handleDenial(client, claim.id, eraClaim, userId);
    }
  }

  async handleDenial(client, claimId, eraClaim, userId) {
    const denialReason = eraClaim.adjustments[0]?.reason_code || 'Unknown';

    await client.query(
      `INSERT INTO denials
       (claim_id, denial_code, denial_reason, denied_amount, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())`,
      [
        claimId,
        denialReason,
        this.getDenialDescription(denialReason),
        eraClaim.total_charge_amount - eraClaim.total_paid_amount
      ]
    );

    // Update claim status to denied
    await client.query(
      `UPDATE claims SET status = 'denied' WHERE id = $1`,
      [claimId]
    );
  }

  getDenialDescription(reasonCode) {
    const descriptions = {
      '1': 'Deductible amount',
      '2': 'Coinsurance amount',
      '3': 'Co-payment amount',
      '16': 'Claim/service lacks information',
      '18': 'Exact duplicate claim/service',
      '50': 'Non-covered service',
      '96': 'Non-covered charge(s)',
      '109': 'Claim not covered by this payer',
      '197': 'Precertification/authorization absent'
    };

    return descriptions[reasonCode] || `Code ${reasonCode}`;
  }
}

module.exports = ProcessERAUseCase;
```

---

## 5. Denial Management & Appeals

### 5.1 Denial Tracking System

```javascript
// backend/useCases/ManageDenialUseCase.js
const pool = require('../config/database');

class ManageDenialUseCase {
  async createAppeal(denialId, appealData, userId) {
    const {
      appeal_reason,
      supporting_documents,
      appeal_deadline
    } = appealData;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get denial info
      const denialResult = await client.query(
        `SELECT * FROM denials WHERE id = $1`,
        [denialId]
      );

      const denial = denialResult.rows[0];

      // Update denial status
      await client.query(
        `UPDATE denials
         SET status = 'appealing',
             appeal_deadline = $1,
             appealed_at = NOW(),
             appealed_by = $2
         WHERE id = $3`,
        [appeal_deadline, userId, denialId]
      );

      // Create appeal record
      await client.query(
        `INSERT INTO denial_appeals
         (denial_id, claim_id, appeal_reason, supporting_documents, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [denialId, denial.claim_id, appeal_reason, JSON.stringify(supporting_documents), userId]
      );

      // Re-submit claim with corrected information
      // Implementation depends on specific denial reason

      await client.query('COMMIT');

      return { ok: true, message: 'Appeal created successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async resolveDenial(denialId, resolution, userId) {
    await pool.query(
      `UPDATE denials
       SET status = 'resolved',
           resolution = $1,
           resolved_at = NOW(),
           resolved_by = $2
       WHERE id = $3`,
      [resolution, userId, denialId]
    );

    return { ok: true };
  }
}

module.exports = ManageDenialUseCase;
```

### 5.2 Denial Management Dashboard

```jsx
// frontend/components/Billing/DenialManagement.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format, differenceInDays } from 'date-fns';

const DenialManagement = () => {
  const [denials, setDenials] = useState([]);
  const [filter, setFilter] = useState('pending');

  useEffect(() => {
    loadDenials();
  }, [filter]);

  const loadDenials = async () => {
    try {
      const response = await axios.get('/api/denials', {
        params: { status: filter }
      });
      setDenials(response.data);
    } catch (error) {
      console.error('Error loading denials:', error);
    }
  };

  const getDaysUntilDeadline = (deadline) => {
    if (!deadline) return null;
    return differenceInDays(new Date(deadline), new Date());
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex space-x-3">
          {['pending', 'appealing', 'resolved'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Denials Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Claim #</th>
              <th className="px-4 py-3 text-left">Patient</th>
              <th className="px-4 py-3 text-left">Denial Reason</th>
              <th className="px-4 py-3 text-left">Amount</th>
              <th className="px-4 py-3 text-left">Deadline</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {denials.map(denial => {
              const daysLeft = getDaysUntilDeadline(denial.appeal_deadline);

              return (
                <tr key={denial.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-sm">{denial.claim_number}</td>
                  <td className="px-4 py-3">{denial.patient_name}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm">{denial.denial_reason}</span>
                    <br />
                    <span className="text-xs text-gray-500">Code: {denial.denial_code}</span>
                  </td>
                  <td className="px-4 py-3">${denial.denied_amount.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    {denial.appeal_deadline ? (
                      <div>
                        <p className="text-sm">{format(new Date(denial.appeal_deadline), 'MM/dd/yyyy')}</p>
                        {daysLeft !== null && (
                          <p className={`text-xs ${
                            daysLeft < 7 ? 'text-red-600' : 'text-gray-500'
                          }`}>
                            {daysLeft > 0 ? `${daysLeft} days left` : 'OVERDUE'}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      denial.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      denial.status === 'appealing' ? 'bg-blue-100 text-blue-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {denial.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {denial.status === 'pending' && (
                      <button
                        onClick={() => window.location.href = `/denials/${denial.id}/appeal`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Create Appeal
                      </button>
                    )}
                    {denial.status === 'appealing' && (
                      <button className="text-green-600 hover:underline text-sm">
                        Mark Resolved
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {denials.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No {filter} denials
          </div>
        )}
      </div>
    </div>
  );
};

export default DenialManagement;
```

---

**(Continuing in next section due to length...)**
