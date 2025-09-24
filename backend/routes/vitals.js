import { Router } from 'express';
import pool from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';
import { auditPHIAccess } from '../middleware/phiAuditMiddleware.js';

const router = Router();

// GET /api/patients/:patientId/vitals - Get all vitals for a patient
router.get('/patients/:patientId/vitals', authenticateToken, checkPermission('vitals:read'),
  auditPHIAccess({ resourceType: 'vitals', action: 'LIST', failOnAuditError: true }), async (req, res) => {
  try {
    const { patientId } = req.params;
    const { limit = 50, encounter_id } = req.query;

    let query = `
      SELECT
        v.*,
        e.encounter_number,
        e.created_at as encounter_date,
        e.chief_complaint
      FROM vitals v
      LEFT JOIN encounters e ON v.encounter_id = e.id
      WHERE v.patient_id = $1
    `;

    const params = [patientId];

    if (encounter_id) {
      query += ` AND v.encounter_id = $2`;
      params.push(encounter_id);
    }

    query += ` ORDER BY v.taken_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching vitals:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// POST /api/patients/:patientId/vitals - Record new vitals
router.post('/patients/:patientId/vitals', authenticateToken, checkPermission('vitals:write'),
  auditPHIAccess({ resourceType: 'vitals', action: 'CREATE', failOnAuditError: true }), async (req, res) => {
  try {
    const { patientId } = req.params;
    const {
      encounter_id,
      height_cm,
      weight_kg,
      systolic,
      diastolic,
      pulse,
      temp_c,
      spo2,
      taken_at
    } = req.body;

    // Validate required fields
    if (!patientId) {
      return res.status(400).json({
        ok: false,
        error: 'Patient ID is required'
      });
    }

    const query = `
      INSERT INTO vitals (
        patient_id, encounter_id, height_cm, weight_kg,
        systolic, diastolic, pulse, temp_c, spo2, taken_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        COALESCE($10::timestamp with time zone, CURRENT_TIMESTAMP)
      ) RETURNING *
    `;

    const result = await pool.query(query, [
      patientId,
      encounter_id || null,
      height_cm || null,
      weight_kg || null,
      systolic || null,
      diastolic || null,
      pulse || null,
      temp_c || null,
      spo2 || null,
      taken_at || null
    ]);

    res.json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error recording vitals:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// GET /api/encounters/:encounterId/vitals - Get vitals for specific encounter
router.get('/encounters/:encounterId/vitals', authenticateToken, checkPermission('vitals:read'),
  auditPHIAccess({ resourceType: 'vitals', action: 'VIEW', failOnAuditError: true }), async (req, res) => {
  try {
    const { encounterId } = req.params;

    const query = `
      SELECT v.*, p.first_name, p.last_name, p.mrn
      FROM vitals v
      JOIN patients p ON v.patient_id = p.id
      WHERE v.encounter_id = $1
      ORDER BY v.taken_at DESC
    `;

    const result = await pool.query(query, [encounterId]);

    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching encounter vitals:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// POST /api/encounters/:encounterId/vitals - Record vitals for specific encounter
router.post('/encounters/:encounterId/vitals', authenticateToken, checkPermission('vitals:write'),
  auditPHIAccess({ resourceType: 'vitals', action: 'CREATE', failOnAuditError: true }), async (req, res) => {
  try {
    const { encounterId } = req.params;
    const {
      height_cm,
      weight_kg,
      systolic,
      diastolic,
      pulse,
      temp_c,
      spo2
    } = req.body;

    // First get the patient_id from the encounter
    const encounterQuery = 'SELECT patient_id FROM encounters WHERE id = $1';
    const encounterResult = await pool.query(encounterQuery, [encounterId]);

    if (encounterResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Encounter not found'
      });
    }

    const patientId = encounterResult.rows[0].patient_id;

    const query = `
      INSERT INTO vitals (
        patient_id, encounter_id, height_cm, weight_kg,
        systolic, diastolic, pulse, temp_c, spo2, taken_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP
      ) RETURNING *
    `;

    const result = await pool.query(query, [
      patientId,
      encounterId,
      height_cm || null,
      weight_kg || null,
      systolic || null,
      diastolic || null,
      pulse || null,
      temp_c || null,
      spo2 || null
    ]);

    res.json({
      ok: true,
      data: result.rows[0],
      message: 'Vitals recorded successfully'
    });
  } catch (error) {
    console.error('Error recording encounter vitals:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// PUT /api/vitals/:id - Update existing vitals
router.put('/vitals/:id', authenticateToken, checkPermission('vitals:write'),
  auditPHIAccess({ resourceType: 'vitals', action: 'UPDATE', failOnAuditError: true }), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      height_cm,
      weight_kg,
      systolic,
      diastolic,
      pulse,
      temp_c,
      spo2
    } = req.body;

    const query = `
      UPDATE vitals SET
        height_cm = COALESCE($2, height_cm),
        weight_kg = COALESCE($3, weight_kg),
        systolic = COALESCE($4, systolic),
        diastolic = COALESCE($5, diastolic),
        pulse = COALESCE($6, pulse),
        temp_c = COALESCE($7, temp_c),
        spo2 = COALESCE($8, spo2)
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [
      id,
      height_cm,
      weight_kg,
      systolic,
      diastolic,
      pulse,
      temp_c,
      spo2
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Vitals record not found'
      });
    }

    res.json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating vitals:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// DELETE /api/vitals/:id - Delete vitals record
router.delete('/vitals/:id', authenticateToken, checkPermission('vitals:delete'),
  auditPHIAccess({ resourceType: 'vitals', action: 'DELETE', failOnAuditError: true }), async (req, res) => {
  try {
    const { id } = req.params;

    const query = 'DELETE FROM vitals WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Vitals record not found'
      });
    }

    res.json({
      ok: true,
      message: 'Vitals record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting vitals:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// GET /api/patients/:patientId/vitals/trends - Get vitals trends for charts
router.get('/patients/:patientId/vitals/trends', authenticateToken, checkPermission('vitals:read'),
  auditPHIAccess({ resourceType: 'vitals', action: 'VIEW', failOnAuditError: true }), async (req, res) => {
  try {
    const { patientId } = req.params;
    const { days = 365 } = req.query;

    const query = `
      SELECT
        v.*,
        e.encounter_number,
        e.created_at as encounter_date,
        e.chief_complaint,
        ROUND(CASE
          WHEN v.height_cm IS NOT NULL AND v.weight_kg IS NOT NULL
          THEN v.weight_kg / POWER(v.height_cm / 100.0, 2)
        END, 1) as bmi
      FROM vitals v
      LEFT JOIN encounters e ON v.encounter_id = e.id
      WHERE v.patient_id = $1
        AND v.taken_at >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY v.taken_at ASC
    `;

    const result = await pool.query(query, [patientId]);

    // Group data for trends
    const trends = {
      blood_pressure: result.rows.filter(r => r.systolic && r.diastolic).map(r => ({
        date: r.taken_at,
        systolic: r.systolic,
        diastolic: r.diastolic,
        encounter: r.encounter_number,
        encounter_date: r.encounter_date
      })),
      pulse: result.rows.filter(r => r.pulse).map(r => ({
        date: r.taken_at,
        value: r.pulse,
        encounter: r.encounter_number,
        encounter_date: r.encounter_date
      })),
      temperature: result.rows.filter(r => r.temp_c).map(r => ({
        date: r.taken_at,
        value: r.temp_c,
        encounter: r.encounter_number,
        encounter_date: r.encounter_date
      })),
      weight: result.rows.filter(r => r.weight_kg).map(r => ({
        date: r.taken_at,
        value: r.weight_kg,
        bmi: r.bmi,
        encounter: r.encounter_number,
        encounter_date: r.encounter_date
      })),
      spo2: result.rows.filter(r => r.spo2).map(r => ({
        date: r.taken_at,
        value: r.spo2,
        encounter: r.encounter_number,
        encounter_date: r.encounter_date
      }))
    };

    res.json({
      ok: true,
      data: trends,
      raw_data: result.rows
    });
  } catch (error) {
    console.error('Error fetching vitals trends:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;