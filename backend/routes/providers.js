// backend/routes/providers.js
import { Router } from 'express';
import pool from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission, requireAdmin } from '../middleware/rbac.js';
import { cacheGet, invalidateCache, addCacheHeaders } from '../middleware/cache.middleware.js';

const router = Router();

/* ----------------------------- helpers ----------------------------- */
function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function displayName(p) {
  const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.replace(/\s+/g, ' ').trim();
  return full || `Provider #${p.id}`;
}

/* ---------------------------- /providers --------------------------- */
// GET /api/providers?q=smith  → list (optionally search)
router.get('/providers', authenticateToken, checkPermission('users:read'), 
  addCacheHeaders(), cacheGet('providers'), async (req, res) => {
  const q = (req.query.q ?? '').toString().trim();

  const params = [];
  let sql = `
    SELECT id, first_name, last_name, specialty
    FROM providers
  `;
  if (q) {
    sql += `
      WHERE first_name ILIKE $1
         OR last_name  ILIKE $1
         OR specialty  ILIKE $1
    `;
    params.push(`%${q}%`);
  }
  sql += ` ORDER BY last_name, first_name LIMIT 50`;

  try {
    const startTime = Date.now();
    const r = await pool.query(sql, params);
    const queryTime = Date.now() - startTime;
    
    // Log slow queries for monitoring
    if (queryTime > 100) {
      console.warn(`[providers:list] Slow query: ${queryTime}ms`);
    }
    
    const rows = r.rows.map((p) => ({ ...p, name: displayName(p) }));
    res.json({ 
      ok: true, 
      data: rows,
      meta: {
        total: rows.length,
        query_time_ms: queryTime,
        search: q || null
      }
    });
  } catch (e) {
    console.error('[providers:list]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

// POST /api/providers { first_name, last_name, specialty? } → create
router.post('/providers', authenticateToken, requireAdmin(), 
  invalidateCache('providers', ['emr:providers:*', 'emr:provider-directory:*']), async (req, res) => {
  const { first_name, last_name, specialty } = req.body ?? {};
  if (!first_name || !last_name) {
    return res.status(400).json({ ok: false, error: 'first_name and last_name are required' });
  }

  try {
    const r = await pool.query(
      `
      INSERT INTO providers (first_name, last_name, specialty)
      VALUES ($1, $2, $3)
      RETURNING id, first_name, last_name, specialty
      `,
      [first_name, last_name, specialty ?? null]
    );
    const p = r.rows[0];
    res.json({ ok: true, data: { ...p, name: displayName(p) } });
  } catch (e) {
    console.error('[providers:create]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* ---------------------- patient ⇄ provider link -------------------- */
// GET /api/patients/:id/provider  → current provider (or null)
router.get('/patients/:id/provider', authenticateToken, checkPermission('users:read'), 
  addCacheHeaders(), cacheGet('patient-provider'), async (req, res) => {
  const id = toInt(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: 'Invalid patient id' });
  }

  try {
    const startTime = Date.now();
    const r = await pool.query(
      `
      SELECT p.id, p.first_name, p.last_name, p.specialty
      FROM patients x
      LEFT JOIN providers p ON p.id = x.provider_id
      WHERE x.id = $1
      `,
      [id]
    );
    const queryTime = Date.now() - startTime;

    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: `Patient ${id} not found` });
    }

    const prov = r.rows[0]?.id ? { ...r.rows[0], name: displayName(r.rows[0]) } : null;
    res.json({ 
      ok: true, 
      data: prov,
      meta: {
        query_time_ms: queryTime
      }
    });
  } catch (e) {
    console.error('[patients:provider:get]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

// POST /api/patients/:id/provider { provider_id | providerId | provider | null } → assign/clear
router.post('/patients/:id/provider', authenticateToken, requireAdmin(), 
  invalidateCache('patient-provider', ['emr:patient-provider:*', 'emr:patients:*']), async (req, res) => {
  const patientId = toInt(req.params.id);

  // Accept provider_id | providerId | provider; allow null to clear
  const providerIdRaw =
    req.body?.provider_id ?? req.body?.providerId ?? req.body?.provider ?? null;
  const providerId =
    providerIdRaw === null || providerIdRaw === undefined ? null : toInt(providerIdRaw);

  if (!Number.isFinite(patientId)) {
    return res.status(400).json({ ok: false, error: 'Invalid patient id' });
  }
  if (providerId !== null && !Number.isFinite(providerId)) {
    return res.status(400).json({ ok: false, error: 'Invalid provider id' });
  }

  try {
    // 0) Ensure patient exists
    const pat = await pool.query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (pat.rowCount === 0) {
      return res.status(404).json({ ok: false, error: `Patient ${patientId} not found` });
    }

    // Clear assignment
    if (providerId === null) {
      const upd = await pool.query(
        'UPDATE patients SET provider_id = NULL WHERE id = $1 RETURNING id',
        [patientId]
      );
      return res.json({ ok: true, data: { patient_id: upd.rows[0].id, provider: null } });
    }

    // 1) Verify provider exists (and get details to return)
    const prov = await pool.query(
      'SELECT id, first_name, last_name, specialty FROM providers WHERE id = $1',
      [providerId]
    );
    if (prov.rowCount === 0) {
      return res.status(404).json({ ok: false, error: `Provider ${providerId} not found` });
    }

    // 2) Update patient with provider
    const upd = await pool.query(
      'UPDATE patients SET provider_id = $1 WHERE id = $2 RETURNING id',
      [providerId, patientId]
    );

    const p = prov.rows[0];
    res.json({
      ok: true,
      data: { patient_id: upd.rows[0].id, provider: { ...p, name: displayName(p) } },
    });
  } catch (e) {
    console.error('[patients:provider:assign]', e);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

export default router;
