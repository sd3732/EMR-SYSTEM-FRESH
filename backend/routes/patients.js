// backend/routes/patients.js
import { Router } from 'express';
import pool from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';
import { cacheGet, invalidateCache, addCacheHeaders } from '../middleware/cache.middleware.js';
import PatientManagementService from '../services/PatientManagementService.js';
import { auditPHIAccess, auditSearchOperation } from '../middleware/phiAuditMiddleware.js';

const router = Router();

/* ---------- Helpers ---------- */
function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// Accept object or JSON string; always return a JSON string for ::jsonb casts
function asJsonb(v) {
  if (v === undefined || v === null || v === '') return JSON.stringify({});
  try {
    return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v);
  } catch {
    return JSON.stringify({});
  }
}

/* ---------- List patients with optimization ---------- */
router.get('/patients', authenticateToken, checkPermission('patients:read'),
  auditPHIAccess({ resourceType: 'patient', action: 'LIST', failOnAuditError: true }),
  auditSearchOperation('patient'),
  addCacheHeaders(), cacheGet('patients'), async (req, res) => {
  try {
    const { search, limit = 500, include_provider = 'false', include_insurance = 'false' } = req.query;
    
    let baseQuery = `
      SELECT
        p.id, p.first_name, p.last_name, p.dob, p.insurance_id, p.created_at,
        p.provider_id, p.mrn, p.identifiers
    `;
    
    let fromClause = 'FROM patients p';
    let whereClause = '';
    let params = [];
    let paramCount = 0;

    // Add provider info if requested (eliminates N+1 queries)
    if (include_provider === 'true') {
      baseQuery += `, 
        prov.first_name as provider_first_name,
        prov.last_name as provider_last_name,
        prov.specialty as provider_specialty`;
      fromClause += ' LEFT JOIN providers prov ON p.provider_id = prov.id';
    }

    // Add insurance info if requested (eliminates N+1 queries)  
    if (include_insurance === 'true') {
      baseQuery += `,
        ins.plan_name as insurance_plan_name,
        ins.group_number as insurance_group_number`;
      fromClause += ' LEFT JOIN insurance ins ON p.insurance_id = ins.id';
    }

    // Add search functionality with full-text search
    if (search) {
      paramCount++;
      whereClause = `WHERE (
        to_tsvector('english', COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) @@ plainto_tsquery('english', $${paramCount})
        OR p.mrn ILIKE $${paramCount + 1}
        OR CONCAT(p.first_name, ' ', p.last_name) ILIKE $${paramCount + 2}
      )`;
      params.push(search, `%${search}%`, `%${search}%`);
      paramCount += 2;
    }

    // Add limit parameter
    paramCount++;
    const limitClause = `ORDER BY p.last_name, p.first_name, p.id LIMIT $${paramCount}`;
    params.push(parseInt(limit, 10));

    const fullQuery = `${baseQuery} ${fromClause} ${whereClause} ${limitClause}`;
    
    const startTime = Date.now();
    const r = await pool.query(fullQuery, params);
    const queryTime = Date.now() - startTime;

    // Log slow queries for monitoring
    if (queryTime > 100) {
      console.warn(`[patients:list] Slow query: ${queryTime}ms`);
    }

    res.json({ 
      ok: true, 
      data: r.rows,
      meta: {
        total: r.rows.length,
        query_time_ms: queryTime,
        search: search || null,
        includes: {
          provider: include_provider === 'true',
          insurance: include_insurance === 'true'
        }
      }
    });
  } catch (e) {
    console.error('[patients:list]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* ---------- Get one patient ---------- */
router.get('/patients/:id', authenticateToken, checkPermission('patients:read'),
  auditPHIAccess({ resourceType: 'patient', action: 'VIEW', failOnAuditError: true }), 
  addCacheHeaders(), cacheGet('patient-demographics'), async (req, res) => {
  const id = toInt(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: 'Invalid id' });
  }
  try {
    const r = await pool.query(
      `SELECT
         id, first_name, last_name, dob, insurance_id, created_at,
         provider_id, mrn, identifiers
       FROM patients
       WHERE id = $1`,
      [id]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: `Patient ${id} not found` });
    }
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    console.error('[patients:get]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* ---------- Create patient ---------- */
router.post('/patients', authenticateToken, checkPermission('patients:create'),
  auditPHIAccess({ resourceType: 'patient', action: 'CREATE', failOnAuditError: true }),
  invalidateCache('patients', ['emr:patients:*', 'emr:patient-demographics:*']), async (req, res) => {
  try {
    const { is_walk_in, ...patientData } = req.body;

    if (is_walk_in) {
      // Use the complete walk-in flow
      const result = await PatientManagementService.createWalkInPatient(
        patientData,
        req.user.id
      );

      res.json({
        ok: true,
        message: 'Walk-in patient created successfully',
        data: result
      });
    } else {
      // Regular patient creation (implement if needed)
      // For now, create patient without encounter/appointment
      const client = await pool.connect();
      try {
        const mrn = await PatientManagementService.generateMRN();
        const result = await client.query(
          `INSERT INTO patients (mrn, first_name, last_name, dob, gender, phone)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [mrn, patientData.first_name, patientData.last_name,
           patientData.dob, patientData.gender, patientData.phone]
        );
        res.json({ ok: true, data: result.rows[0] });
      } finally {
        client.release();
      }
    }
  } catch (error) {
    console.error('Error creating patient:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* ---------- Update patient (partial) ---------- */
router.put('/patients/:id', authenticateToken, checkPermission('patients:write'),
  auditPHIAccess({ resourceType: 'patient', action: 'UPDATE', failOnAuditError: true }), 
  invalidateCache('patients', ['emr:patients:*', 'emr:patient-demographics:*']), async (req, res) => {
  const id = toInt(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: 'Invalid id' });
  }

  const {
    first_name,
    last_name,
    dob,
    insurance_id,
    provider_id,
    mrn,
    identifiers,
  } = req.body ?? {};

  const providerIdNum = Number.isFinite(toInt(provider_id)) ? Number(provider_id) : null;
  const mrnNorm = mrn === '' ? null : mrn ?? null;

  try {
    const r = await pool.query(
      `UPDATE patients
          SET first_name   = COALESCE($2, first_name),
              last_name    = COALESCE($3, last_name),
              dob          = COALESCE($4, dob),
              insurance_id = COALESCE($5, insurance_id),
              provider_id  = COALESCE($6, provider_id),
              mrn          = COALESCE($7, mrn),
              identifiers  = COALESCE($8::jsonb, identifiers)
        WHERE id = $1
        RETURNING
          id, first_name, last_name, dob, insurance_id, created_at,
          provider_id, mrn, identifiers`,
      [
        id,
        first_name ?? null,
        last_name ?? null,
        dob ?? null,
        insurance_id ?? null,
        providerIdNum,
        mrnNorm,
        asJsonb(identifiers),
      ]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: `Patient ${id} not found` });
    }
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ ok: false, error: 'MRN already in use' });
    }
    console.error('[patients:update]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* ---------- Delete patient ---------- */
router.delete('/patients/:id', authenticateToken, checkPermission('patients:delete'),
  auditPHIAccess({ resourceType: 'patient', action: 'DELETE', failOnAuditError: true }), async (req, res) => {
  const id = toInt(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: 'Invalid id' });
  }
  try {
    const r = await pool.query('DELETE FROM patients WHERE id = $1', [id]);
    res.json({ ok: true, data: r.rowCount > 0 });
  } catch (e) {
    console.error('[patients:delete]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* ---------- Create encounter for existing patient (walk-in) ---------- */
router.post('/patients/:id/encounters', authenticateToken, checkPermission('encounters:create'),
  auditPHIAccess({ resourceType: 'encounter', action: 'CREATE', failOnAuditError: true }), async (req, res) => {
  try {
    const patientId = toInt(req.params.id);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    const { chief_complaint, triage_priority } = req.body;
    if (!chief_complaint) {
      return res.status(400).json({ ok: false, error: 'chief_complaint is required' });
    }

    const result = await PatientManagementService.createEncounterForExistingPatient(
      patientId,
      chief_complaint,
      req.user.id
    );

    res.json({
      ok: true,
      message: 'Encounter created and patient added to queue',
      data: result
    });
  } catch (error) {
    console.error('[patients:create-encounter]', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;

