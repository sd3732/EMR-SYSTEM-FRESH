import { Router } from 'express';
import pool from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

/* Get recent encounters across all patients (for encounter dashboard) */
router.get('/encounters/recent', authenticateToken, checkPermission('visits:read'), async (req, res) => {
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
router.get('/patients/:id/encounters', authenticateToken, checkPermission('visits:read'), async (req, res) => {
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
router.post('/patients/:id/encounters', authenticateToken, checkPermission('visits:create'), async (req, res) => {
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
router.get('/patients/:pid/encounters/:eid', authenticateToken, checkPermission('visits:read'), async (req, res) => {
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
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    console.error('[encounters:get]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* Patch clinical data (reason + HPI + vitals + intake + ros + status) on an encounter */
router.patch('/patients/:pid/encounters/:eid', authenticateToken, checkPermission('visits:write'), async (req, res) => {
  const pid = Number(req.params.pid);
  const eid = Number(req.params.eid);
  const { hpi = null, vitals = null, status = null, reason = null, intake = null, ros = null } =
    req.body || {};
  if (!Number.isFinite(pid) || !Number.isFinite(eid)) {
    return res.status(400).json({ ok: false, error: 'Invalid ids' });
  }
  try {
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
      [eid, pid, hpi, vitals, status, reason, intake, ros]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Encounter not found' });
    }
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    console.error('[encounters:update]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

export default router;