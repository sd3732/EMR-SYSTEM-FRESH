// backend/routes/orders.js
import { Router } from 'express';
import pool from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();
const toInt = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);

/* -------- Orders (ServiceRequest-lite) -------- */
router.get('/patients/:pid/encounters/:eid/orders', authenticateToken, checkPermission('orders:read'), async (req, res) => {
  const pid = toInt(req.params.pid);
  const eid = toInt(req.params.eid);
  if (!Number.isFinite(pid) || !Number.isFinite(eid)) {
    return res.status(400).json({ ok:false, error:'Invalid ids' });
  }
  try {
    const r = await pool.query(
      `SELECT * FROM orders WHERE patient_id=$1 AND encounter_id=$2 ORDER BY requested_at DESC, id DESC`,
      [pid, eid]
    );
    res.json({ ok:true, data:r.rows });
  } catch (e) {
    console.error('[orders:list]', e);
    res.status(500).json({ ok:false, error:'Database error' });
  }
});

router.post('/patients/:pid/encounters/:eid/orders', authenticateToken, checkPermission('orders:create'), async (req, res) => {
  const pid = toInt(req.params.pid);
  const eid = toInt(req.params.eid);
  const b = req.body ?? {};
  if (!Number.isFinite(pid) || !Number.isFinite(eid)) {
    return res.status(400).json({ ok:false, error:'Invalid ids' });
  }
  if (!b.kind || !b.display) {
    return res.status(400).json({ ok:false, error:'kind and display are required' });
  }
  try {
    const r = await pool.query(
      `INSERT INTO orders
        (patient_id, encounter_id, provider_id, kind, code_system, code, display, status, priority,
         diagnoses, notes, requested_at, needed_by, meta)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'active'),$9,$10,$11, COALESCE($12, NOW()), $13, $14)
       RETURNING *`,
      [
        pid, eid, b.provider_id ?? null, b.kind, b.code_system ?? null, b.code ?? null, b.display,
        b.status ?? 'active', b.priority ?? null, b.diagnoses ?? null, b.notes ?? null,
        b.requested_at ?? null, b.needed_by ?? null, b.meta ?? null,
      ]
    );
    res.json({ ok:true, data:r.rows[0] });
  } catch (e) {
    console.error('[orders:create]', e);
    res.status(500).json({ ok:false, error:'Database error' });
  }
});

router.patch('/orders/:id', authenticateToken, checkPermission('orders:write'), async (req, res) => {
  const id = toInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok:false, error:'Invalid id' });

  // allow partial updates
  const body = req.body ?? {};
  const fields = [
    'status','priority','notes','diagnoses','needed_by','display','code','code_system','meta','provider_id'
  ];
  const sets=[], vals=[];
  let i=1;
  for (const k of fields) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      sets.push(`${k} = $${i++}`);
      vals.push(body[k]);
    }
  }
  if (!sets.length) return res.status(400).json({ ok:false, error:'No fields to update' });
  vals.push(id);
  try {
    const r = await pool.query(
      `UPDATE orders SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${i} RETURNING *`,
      vals
    );
    if (r.rowCount===0) return res.status(404).json({ ok:false, error:'Not found' });
    res.json({ ok:true, data:r.rows[0] });
  } catch (e) {
    console.error('[orders:update]', e);
    res.status(500).json({ ok:false, error:'Database error' });
  }
});

/* -------- Results (DiagnosticReport-lite) -------- */
router.get('/patients/:pid/encounters/:eid/results', authenticateToken, checkPermission('orders:read'), async (req, res) => {
  const pid = toInt(req.params.pid);
  const eid = toInt(req.params.eid);
  if (!Number.isFinite(pid) || !Number.isFinite(eid)) {
    return res.status(400).json({ ok:false, error:'Invalid ids' });
  }
  try {
    const r = await pool.query(
      `SELECT * FROM results WHERE patient_id=$1 AND encounter_id=$2 ORDER BY issued_at DESC, id DESC`,
      [pid, eid]
    );
    res.json({ ok:true, data:r.rows });
  } catch (e) {
    console.error('[results:list]', e);
    res.status(500).json({ ok:false, error:'Database error' });
  }
});

router.post('/patients/:pid/encounters/:eid/results', authenticateToken, checkPermission('orders:create'), async (req, res) => {
  const pid = toInt(req.params.pid);
  const eid = toInt(req.params.eid);
  const b = req.body ?? {};
  if (!Number.isFinite(pid) || !Number.isFinite(eid)) {
    return res.status(400).json({ ok:false, error:'Invalid ids' });
  }
  // allow linking to an order or standalone result
  try {
    const r = await pool.query(
      `INSERT INTO results
        (patient_id, encounter_id, order_id, report_type, status, summary, attachments, data,
         observed_at, issued_at, received_at, performer, source)
       VALUES ($1,$2,$3,$4,COALESCE($5,'final'),$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        pid, eid, b.order_id ?? null, b.report_type ?? null, b.status ?? 'final', b.summary ?? null,
        b.attachments ?? null, b.data ?? null, b.observed_at ?? null, b.issued_at ?? null,
        b.received_at ?? null, b.performer ?? null, b.source ?? null,
      ]
    );
    const result = r.rows[0];

    // optional embedded discrete observations
    const obs = Array.isArray(b.observations) ? b.observations : [];
    if (obs.length) {
      const vals = [];
      const rows = [];
      let i = 1;
      for (const o of obs) {
        rows.push(
          `($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`
        );
        vals.push(
          result.id,
          b.order_id ?? null,
          pid,
          o.loinc_code ?? null,
          o.label ?? null,
          o.value_num ?? null,
          o.value_text ?? null,
          o.unit ?? null,
          o.reference_range ?? null,
          o.interpretation ?? null
        );
      }
      await pool.query(
        `INSERT INTO observations
           (result_id, order_id, patient_id, loinc_code, label, value_num, value_text, unit, reference_range, interpretation)
         VALUES ${rows.join(',')}`,
        vals
      );
    }

    res.json({ ok:true, data:result });
  } catch (e) {
    console.error('[results:create]', e);
    res.status(500).json({ ok:false, error:'Database error' });
  }
});

export default router;
