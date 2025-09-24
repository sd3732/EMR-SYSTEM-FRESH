import { Router } from 'express';
import pool from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';
import { auditPHIAccess, auditSearchOperation } from '../middleware/phiAuditMiddleware.js';

const router = Router();

/* Get encounters with filtering */
router.get('/encounters', authenticateToken, checkPermission('visits:read'),
  auditPHIAccess({ resourceType: 'encounter', action: 'LIST', failOnAuditError: true }),
  auditSearchOperation('encounter'), async (req, res) => {
  try {
    const { date, patient_id } = req.query;

    let query = `
      SELECT
        e.id,
        e.patient_id,
        e.reason,
        e.status,
        e.created_at,
        e.hpi,
        e.vitals,
        e.intake,
        e.ros,
        e.appointment_id,
        e.encounter_number,
        p.first_name AS patient_first_name,
        p.last_name AS patient_last_name,
        p.mrn AS patient_mrn,
        p.dob AS patient_dob,
        p.gender AS patient_gender,
        p.phone AS patient_phone,
        pr.first_name AS provider_first_name,
        pr.last_name AS provider_last_name
      FROM encounters e
      INNER JOIN patients p ON e.patient_id = p.id
      LEFT JOIN providers pr ON p.provider_id = pr.id
    `;

    const params = [];
    const conditions = [];

    if (date) {
      conditions.push(`DATE(e.created_at) = $${params.length + 1}`);
      params.push(date);
    }

    if (patient_id) {
      conditions.push(`e.patient_id = $${params.length + 1}`);
      params.push(patient_id);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY e.created_at DESC LIMIT 100`;

    const result = await pool.query(query, params);

    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching encounters:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* Get recent encounters across all patients (for encounter dashboard) */
router.get('/encounters/recent', authenticateToken, checkPermission('visits:read'),
  auditPHIAccess({ resourceType: 'encounter', action: 'LIST', failOnAuditError: true }), async (req, res) => {
  const { limit = 20 } = req.query;
  
  try {
    const query = `
      SELECT 
        e.id, 
        e.patient_id as "patientId",
        CONCAT(p.first_name, ' ', p.last_name) as "patientName",
        e.reason, 
        e.status, 
        e.created_at as "startTime",
        COALESCE(prov.first_name || ' ' || prov.last_name, 'No Provider') as provider
      FROM encounters e
      JOIN patients p ON e.patient_id = p.id
      LEFT JOIN providers prov ON p.provider_id = prov.id
      ORDER BY e.created_at DESC
      LIMIT $1
    `;
    
    const r = await pool.query(query, [parseInt(limit)]);
    
    res.json({ 
      ok: true, 
      data: r.rows 
    });
  } catch (e) {
    console.error('[encounters:recent]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/**
 * NOTES
 * - All routes live under /patients/:id/encounters...
 * - vitals stored as JSONB (height_cm, weight_kg, bmi, bp_sys, bp_dia, bp_arm, bp_position,
 *   pulse_bpm, rr, o2_sat, temp_c, temp_unit, temp_source, note)
 * - intake JSONB holds additional intake pieces (vaccines, problems, etc.)
 * - ros JSONB holds Review of Systems selections
 */

/* List encounters for a patient (most recent first) */
router.get('/patients/:id/encounters', authenticateToken, checkPermission('visits:read'),
  auditPHIAccess({ resourceType: 'encounter', action: 'LIST', failOnAuditError: true }), async (req, res) => {
  const id = Number(req.params.id);
  const { include_vitals, limit, start_date } = req.query;
  
  console.log('[encounters:list] Query params:', { include_vitals, limit, start_date });
  
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: 'Invalid patient id' });
  }
  try {
    let query = `SELECT id, patient_id, reason, status, created_at`;
    if (include_vitals === 'true') {
      query += `, vitals`;
      console.log('[encounters:list] Including vitals in query');
    }
    query += ` FROM encounters WHERE patient_id = $1`;
    
    const params = [id];
    let paramCount = 1;
    
    if (start_date) {
      paramCount++;
      query += ` AND created_at >= $${paramCount}`;
      params.push(start_date);
    }
    
    query += ` ORDER BY created_at DESC, id DESC`;
    
    if (limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    }
    
    console.log('[encounters:list] Final query:', query);
    console.log('[encounters:list] Query params:', params);
    
    const r = await pool.query(query, params);
    
    console.log('[encounters:list] Query results:', r.rows.length, 'encounters');
    if (include_vitals === 'true' && r.rows.length > 0) {
      console.log('[encounters:list] Sample encounter with vitals:', {
        id: r.rows[0].id,
        vitals: r.rows[0].vitals,
        vitals_type: typeof r.rows[0].vitals
      });
    }
    
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    console.error('[encounters:list]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* Create a visit (encounter) for a patient and return it */
router.post('/patients/:id/encounters', authenticateToken, checkPermission('visits:create'),
  auditPHIAccess({ resourceType: 'encounter', action: 'CREATE', failOnAuditError: true }), async (req, res) => {
  const id = Number(req.params.id);
  const { reason = '' } = req.body || {};
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: 'Invalid patient id' });
  }
  try {
    const r = await pool.query(
      `INSERT INTO encounters (patient_id, reason, status)
       VALUES ($1, $2, 'open')
       RETURNING id, patient_id, reason, status, created_at`,
      [id, (reason || '').trim()]
    );
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    console.error('[encounters:create]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* Get a single encounter (with HPI + vitals + intake + ros) and verify it belongs to patient */
router.get('/patients/:pid/encounters/:eid', authenticateToken, checkPermission('visits:read'),
  auditPHIAccess({ resourceType: 'encounter', action: 'VIEW', failOnAuditError: true }), async (req, res) => {
  const pid = Number(req.params.pid);
  const eid = Number(req.params.eid);
  if (!Number.isFinite(pid) || !Number.isFinite(eid)) {
    return res.status(400).json({ ok: false, error: 'Invalid ids' });
  }
  try {
    const r = await pool.query(
      `SELECT id as eid, patient_id as pid, reason, status, created_at,
              hpi, vitals, intake, ros
         FROM encounters
        WHERE id = $1 AND patient_id = $2`,
      [eid, pid]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Encounter not found' });
    }

    // Parse HPI string back to JSON object if it exists
    const encounter = r.rows[0];
    if (encounter.hpi && typeof encounter.hpi === 'string') {
      try {
        encounter.hpi = JSON.parse(encounter.hpi);
      } catch (e) {
        console.warn('Failed to parse HPI JSON:', e.message);
        encounter.hpi = {}; // Default to empty object if parsing fails
      }
    }

    res.json({ ok: true, data: encounter });
  } catch (e) {
    console.error('[encounters:get]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* Patch clinical data (reason + HPI + vitals + intake + ros + status) on an encounter */
router.patch('/patients/:pid/encounters/:eid', authenticateToken, checkPermission('visits:write'),
  auditPHIAccess({ resourceType: 'encounter', action: 'UPDATE', failOnAuditError: true }), async (req, res) => {
  const pid = Number(req.params.pid);
  const eid = Number(req.params.eid);
  const { hpi = null, vitals = null, status = null, reason = null, intake = null, ros = null } =
    req.body || {};

  // Log payload size for monitoring large requests
  if (process.env.NODE_ENV === 'development') {
    const payloadSize = JSON.stringify(req.body).length;
    if (payloadSize > 100000) { // > 100KB
      console.log(`📊 Large encounter update: Patient ${pid}, Encounter ${eid}, Size: ${(payloadSize / 1024).toFixed(2)} KB`);
    }
  }
  if (!Number.isFinite(pid) || !Number.isFinite(eid)) {
    return res.status(400).json({ ok: false, error: 'Invalid ids' });
  }
  try {
    // Handle HPI serialization properly (since it's stored as TEXT, not JSONB)
    const hpiString = hpi ? JSON.stringify(hpi) : null;

    const r = await pool.query(
      `UPDATE encounters
          SET hpi    = COALESCE($3, hpi),
              vitals = COALESCE($4::jsonb, vitals),
              status = COALESCE($5, status),
              reason = COALESCE($6, reason),
              intake = COALESCE($7::jsonb, intake),
              ros    = COALESCE($8::jsonb, ros)
        WHERE id = $1 AND patient_id = $2
      RETURNING id as eid, patient_id as pid, reason, status,
                created_at, hpi, vitals, intake, ros`,
      [eid, pid, hpiString, vitals, status, reason, intake, ros]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Encounter not found' });
    }

    // Parse HPI string back to JSON object if it exists in the response
    const updatedEncounter = r.rows[0];
    if (updatedEncounter.hpi && typeof updatedEncounter.hpi === 'string') {
      try {
        updatedEncounter.hpi = JSON.parse(updatedEncounter.hpi);
      } catch (e) {
        console.warn('Failed to parse updated HPI JSON:', e.message);
        updatedEncounter.hpi = {}; // Default to empty object if parsing fails
      }
    }

    res.json({ ok: true, data: updatedEncounter });
  } catch (e) {
    console.error('[encounters:update]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* Add vitals to an encounter */
router.post('/encounters/:eid/vitals', authenticateToken, checkPermission('visits:write'),
  auditPHIAccess({ resourceType: 'vitals', action: 'CREATE', failOnAuditError: true }), async (req, res) => {
  const eid = Number(req.params.eid);
  const {
    systolic_bp,
    diastolic_bp,
    heart_rate,
    temperature,
    respiratory_rate,
    oxygen_saturation,
    weight,
    height,
    pain_scale,
    recorded_by,
    notes
  } = req.body || {};

  if (!Number.isFinite(eid)) {
    return res.status(400).json({ ok: false, error: 'Invalid encounter id' });
  }

  try {
    // First verify the encounter exists
    const encounterCheck = await pool.query(
      'SELECT id, patient_id FROM encounters WHERE id = $1',
      [eid]
    );

    if (encounterCheck.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Encounter not found' });
    }

    const patientId = encounterCheck.rows[0].patient_id;

    // Prepare vitals data for encounter JSONB
    const vitalsData = {
      systolic_bp: systolic_bp || null,
      diastolic_bp: diastolic_bp || null,
      heart_rate: heart_rate || null,
      temperature: temperature || null,
      respiratory_rate: respiratory_rate || null,
      oxygen_saturation: oxygen_saturation || null,
      weight: weight || null,
      height: height || null,
      pain_scale: pain_scale || null,
      recorded_by: recorded_by || 'System',
      recorded_at: new Date().toISOString(),
      notes: notes || null
    };

    // DUAL SAVE: Save to both vitals table (for trends) AND encounter JSONB (for immediate display)

    // 1. Save to vitals table for trends
    if (systolic_bp || diastolic_bp || heart_rate || temperature || oxygen_saturation || weight || height) {
      // Convert values for vitals table format
      let heightCm = null;
      if (height) {
        const heightStr = height.toString().toLowerCase();
        if (heightStr.includes('cm')) {
          heightCm = parseFloat(heightStr.replace('cm', '').trim());
        } else if (heightStr.includes('in') || heightStr.includes('"') || heightStr.includes("'")) {
          const inches = parseFloat(heightStr.replace(/[in"']/g, '').trim());
          heightCm = inches * 2.54;
        } else {
          const num = parseFloat(heightStr);
          heightCm = num < 100 ? num * 2.54 : num;
        }
      }

      let weightKg = null;
      if (weight) {
        const w = parseFloat(weight);
        weightKg = w > 50 ? w * 0.453592 : w;
      }

      let tempC = null;
      if (temperature) {
        const temp = parseFloat(temperature);
        tempC = temp > 50 ? (temp - 32) * 5/9 : temp;
      }

      await pool.query(
        `INSERT INTO vitals (
          patient_id, encounter_id, height_cm, weight_kg,
          systolic, diastolic, pulse, temp_c, spo2, taken_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP
        )`,
        [
          patientId,
          eid,
          heightCm,
          weightKg,
          systolic_bp ? parseInt(systolic_bp) : null,
          diastolic_bp ? parseInt(diastolic_bp) : null,
          heart_rate ? parseInt(heart_rate) : null,
          tempC,
          oxygen_saturation ? parseInt(oxygen_saturation) : null
        ]
      );
    }

    // 2. Save to encounter JSONB for immediate display
    const result = await pool.query(
      `UPDATE encounters
       SET vitals = $2::jsonb
       WHERE id = $1
       RETURNING id, patient_id, vitals`,
      [eid, JSON.stringify(vitalsData)]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Failed to update encounter' });
    }

    console.log('Vitals saved to both vitals table and encounter:', eid, vitalsData);

    res.json({
      ok: true,
      data: {
        encounter_id: eid,
        patient_id: result.rows[0].patient_id,
        vitals: result.rows[0].vitals
      }
    });
  } catch (error) {
    console.error('Error saving vitals:', error);
    res.status(500).json({
      ok: false,
      error: 'Database error: ' + error.message
    });
  }
});

export default router;