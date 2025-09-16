import { Router } from 'express';
import pool from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

/**
 * GET /api/patients/:id/allergies
 */
router.get('/patients/:id/allergies', authenticateToken, checkPermission('allergies:read'), async (req, res) => {
  try {
    const { id } = req.params;
    const q = `
      SELECT id, patient_id, type, substance, reaction, severity, noted_at, active
      FROM allergies
      WHERE patient_id = $1
      ORDER BY noted_at DESC, id DESC
    `;
    const { rows } = await pool.query(q, [id]);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[ALLERGIES][LIST]', err.message);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/**
 * POST /api/patients/:id/allergies
 * body: { type, substance, reaction?, severity?, active? }
 */
router.post('/patients/:id/allergies', authenticateToken, checkPermission('allergies:write'), async (req, res) => {
  try {
    const { id } = req.params;
    const { type = 'other', substance, reaction = null, severity = null, active = true } = req.body || {};
    if (!substance) return res.status(400).json({ ok: false, error: 'substance is required' });

    const q = `
      INSERT INTO allergies (patient_id, type, substance, reaction, severity, active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const { rows } = await pool.query(q, [id, type, substance, reaction, severity, active]);
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('[ALLERGIES][CREATE]', err.message);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/**
 * DELETE /api/allergies/:allergyId
 */
router.delete('/allergies/:allergyId', authenticateToken, checkPermission('allergies:delete'), async (req, res) => {
  try {
    const { allergyId } = req.params;
    const { rowCount } = await pool.query('DELETE FROM allergies WHERE id = $1', [allergyId]);
    res.json({ ok: true, deleted: rowCount });
  } catch (err) {
    console.error('[ALLERGIES][DELETE]', err.message);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

export default router;
