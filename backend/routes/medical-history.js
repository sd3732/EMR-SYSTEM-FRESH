import { Router } from 'express';
import pool from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

/**
 * MEDICAL HISTORY API ROUTES
 * - GET /api/patients/:id/medical-history - Get comprehensive medical history
 * - POST /api/patients/:id/medical-history - Add medical history entry
 * - PUT /api/patients/:id/medical-history/:historyId - Update medical history entry
 * - DELETE /api/patients/:id/medical-history/:historyId - Delete medical history entry
 * - GET /api/patients/:id/chronic-conditions - Get chronic conditions
 * - POST /api/patients/:id/chronic-conditions - Add chronic condition
 * - PUT /api/patients/:id/chronic-conditions/:conditionId - Update chronic condition
 * - GET /api/patients/:id/family-history - Get family medical history
 * - POST /api/patients/:id/family-history - Add family history entry
 * - GET /api/patients/:id/surgical-history - Get surgical history
 * - POST /api/patients/:id/surgical-history - Add surgical history entry
 * - GET /api/patients/:id/hospitalizations - Get hospitalization history
 * - POST /api/patients/:id/hospitalizations - Add hospitalization record
 * - GET /api/patients/:id/health-screenings - Get health screenings
 * - POST /api/patients/:id/health-screenings - Add health screening record
 */

/* Get comprehensive medical history for a patient */
router.get('/patients/:id/medical-history', authenticateToken, checkPermission('medical_history:read'), async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    const { category, status, limit = 50 } = req.query;

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    let whereConditions = ['patient_id = $1'];
    let params = [patientId];
    let paramCount = 1;

    if (category) {
      whereConditions.push(`category = $${++paramCount}`);
      params.push(category);
    }

    if (status) {
      whereConditions.push(`status = $${++paramCount}`);
      params.push(status);
    }

    const result = await pool.query(`
      SELECT 
        id,
        category,
        condition_name,
        icd10_code,
        onset_date,
        resolved_date,
        status,
        severity,
        provider_id,
        notes,
        created_at,
        updated_at
      FROM patient_medical_history
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY onset_date DESC NULLS LAST, created_at DESC
      LIMIT $${++paramCount}
    `, [...params, Number(limit)]);

    res.json({
      ok: true,
      data: result.rows
    });

  } catch (error) {
    console.error('[medical-history:get-medical-history]', error);
    res.status(500).json({ ok: false, error: 'Failed to get medical history' });
  }
});

/* Add medical history entry */
router.post('/patients/:id/medical-history', authenticateToken, checkPermission('medical_history:write'), async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    const {
      category,
      condition_name,
      icd10_code,
      onset_date,
      resolved_date,
      status = 'active',
      severity,
      provider_id,
      notes
    } = req.body;

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    if (!category || !condition_name) {
      return res.status(400).json({ ok: false, error: 'Category and condition name are required' });
    }

    const result = await pool.query(`
      INSERT INTO patient_medical_history (
        patient_id, category, condition_name, icd10_code, onset_date,
        resolved_date, status, severity, provider_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      patientId, category, condition_name, icd10_code, onset_date,
      resolved_date, status, severity, provider_id, notes
    ]);

    res.status(201).json({
      ok: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[medical-history:add-medical-history]', error);
    res.status(500).json({ ok: false, error: 'Failed to add medical history entry' });
  }
});

/* Get chronic conditions for a patient */
router.get('/patients/:id/chronic-conditions', authenticateToken, checkPermission('medical_history:read'), async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    const { controlled, active_only = 'false' } = req.query;

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    let whereConditions = ['patient_id = $1'];
    let params = [patientId];
    let paramCount = 1;

    if (controlled !== undefined) {
      whereConditions.push(`controlled = $${++paramCount}`);
      params.push(controlled === 'true');
    }

    if (active_only === 'true') {
      whereConditions.push(`controlled = false`);
    }

    const result = await pool.query(`
      SELECT 
        cc.*,
        p.first_name as provider_first_name,
        p.last_name as provider_last_name
      FROM chronic_conditions cc
      LEFT JOIN providers p ON cc.provider_id = p.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY cc.diagnosed_date DESC NULLS LAST, cc.created_at DESC
    `, params);

    res.json({
      ok: true,
      data: result.rows
    });

  } catch (error) {
    console.error('[medical-history:get-chronic-conditions]', error);
    res.status(500).json({ ok: false, error: 'Failed to get chronic conditions' });
  }
});

/* Add chronic condition */
router.post('/patients/:id/chronic-conditions', authenticateToken, checkPermission('medical_history:write'), async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    const {
      condition_name,
      icd10_code,
      diagnosed_date,
      severity,
      management_plan,
      target_goals,
      monitoring_frequency,
      controlled = false,
      medications,
      lifestyle_modifications,
      provider_id
    } = req.body;

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    if (!condition_name) {
      return res.status(400).json({ ok: false, error: 'Condition name is required' });
    }

    const result = await pool.query(`
      INSERT INTO chronic_conditions (
        patient_id, condition_name, icd10_code, diagnosed_date, severity,
        management_plan, target_goals, monitoring_frequency, controlled,
        medications, lifestyle_modifications, provider_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      patientId, condition_name, icd10_code, diagnosed_date, severity,
      management_plan, target_goals, monitoring_frequency, controlled,
      medications, lifestyle_modifications, provider_id
    ]);

    res.status(201).json({
      ok: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[medical-history:add-chronic-condition]', error);
    res.status(500).json({ ok: false, error: 'Failed to add chronic condition' });
  }
});

/* Get family medical history */
router.get('/patients/:id/family-history', authenticateToken, checkPermission('medical_history:read'), async (req, res) => {
  try {
    const patientId = Number(req.params.id);

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    const result = await pool.query(`
      SELECT *
      FROM family_medical_history
      WHERE patient_id = $1
      ORDER BY relationship, condition_name
    `, [patientId]);

    // Group by relationship for easier frontend handling
    const grouped = result.rows.reduce((acc, row) => {
      if (!acc[row.relationship]) {
        acc[row.relationship] = [];
      }
      acc[row.relationship].push(row);
      return acc;
    }, {});

    res.json({
      ok: true,
      data: {
        entries: result.rows,
        grouped: grouped
      }
    });

  } catch (error) {
    console.error('[medical-history:get-family-history]', error);
    res.status(500).json({ ok: false, error: 'Failed to get family history' });
  }
});

/* Add family history entry */
router.post('/patients/:id/family-history', authenticateToken, checkPermission('medical_history:write'), async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    const {
      relationship,
      condition_name,
      icd10_code,
      age_at_diagnosis,
      age_at_death,
      cause_of_death,
      notes
    } = req.body;

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    if (!relationship || !condition_name) {
      return res.status(400).json({ ok: false, error: 'Relationship and condition name are required' });
    }

    const result = await pool.query(`
      INSERT INTO family_medical_history (
        patient_id, relationship, condition_name, icd10_code,
        age_at_diagnosis, age_at_death, cause_of_death, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      patientId, relationship, condition_name, icd10_code,
      age_at_diagnosis, age_at_death, cause_of_death, notes
    ]);

    res.status(201).json({
      ok: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[medical-history:add-family-history]', error);
    res.status(500).json({ ok: false, error: 'Failed to add family history entry' });
  }
});

/* Get surgical history */
router.get('/patients/:id/surgical-history', authenticateToken, checkPermission('medical_history:read'), async (req, res) => {
  try {
    const patientId = Number(req.params.id);

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    const result = await pool.query(`
      SELECT *
      FROM surgical_history
      WHERE patient_id = $1
      ORDER BY surgery_date DESC NULLS LAST
    `, [patientId]);

    res.json({
      ok: true,
      data: result.rows
    });

  } catch (error) {
    console.error('[medical-history:get-surgical-history]', error);
    res.status(500).json({ ok: false, error: 'Failed to get surgical history' });
  }
});

/* Add surgical history entry */
router.post('/patients/:id/surgical-history', authenticateToken, checkPermission('medical_history:write'), async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    const {
      procedure_name,
      cpt_code,
      surgery_date,
      surgeon_name,
      hospital_facility,
      complications,
      outcome,
      recovery_notes
    } = req.body;

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    if (!procedure_name || !surgery_date) {
      return res.status(400).json({ ok: false, error: 'Procedure name and surgery date are required' });
    }

    const result = await pool.query(`
      INSERT INTO surgical_history (
        patient_id, procedure_name, cpt_code, surgery_date,
        surgeon_name, hospital_facility, complications, outcome, recovery_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      patientId, procedure_name, cpt_code, surgery_date,
      surgeon_name, hospital_facility, complications, outcome, recovery_notes
    ]);

    res.status(201).json({
      ok: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[medical-history:add-surgical-history]', error);
    res.status(500).json({ ok: false, error: 'Failed to add surgical history entry' });
  }
});

/* Get comprehensive medical history summary */
router.get('/patients/:id/medical-history/summary', authenticateToken, checkPermission('medical_history:read'), async (req, res) => {
  try {
    const patientId = Number(req.params.id);

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    const result = await pool.query(`
      SELECT *
      FROM comprehensive_medical_history
      WHERE patient_id = $1
    `, [patientId]);

    if (result.rows.length === 0) {
      return res.json({
        ok: true,
        data: {
          patient_id: patientId,
          active_chronic_conditions: [],
          recent_medical_history: [],
          family_history: [],
          surgical_history: [],
          recent_hospitalizations: []
        }
      });
    }

    res.json({
      ok: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[medical-history:get-medical-summary]', error);
    res.status(500).json({ ok: false, error: 'Failed to get medical history summary' });
  }
});

export default router;