// backend/routes/appointments.js
import { Router } from 'express';
import pool from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';
import { broadcastAppointmentUpdate, broadcastMetricsUpdate } from '../server.js';

const router = Router();

/* ------------ helpers ------------ */
function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
// ensure value fits into Postgres INTEGER (SERIAL) to avoid "out of range"
function toInt32(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 2147483647 ? n : NaN;
}
function normISO(v, fallback) {
  try {
    const d = v ? new Date(v) : fallback;
    return new Date(d).toISOString();
  } catch {
    return new Date(fallback ?? Date.now()).toISOString();
  }
}
const provName = (p) =>
  p
    ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.replace(/\s+/g, ' ').trim() || `Provider #${p.id}`
    : null;
const patName = (p) =>
  p
    ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.replace(/\s+/g, ' ').trim() || `Patient #${p.id}`
    : null;

/* FHIR-friendly Appointment.status set */
const VALID_APPT_STATUS = new Set([
  'proposed',
  'booked',
  'arrived',
  'fulfilled',
  'cancelled',
  'noshow',
]);

/** Map common synonyms → enum-ish text we store */
function normalizeApptStatus(input) {
  const s = String(input || '').toLowerCase();
  if (!s) return 'booked';
  if (VALID_APPT_STATUS.has(s)) return s;
  if (s === 'completed' || s === 'done') return 'fulfilled';
  if (s === 'no_show' || s === 'no-show' || s === 'no show') return 'noshow';
  if (s === 'checked_in' || s === 'checked-in' || s === 'checkin') return 'arrived';
  return 'booked';
}

/* ==========================================================
 * GET /api/appointments?start=ISO&end=ISO&provider_ids=1,2&patient_id=123
 * ========================================================== */
router.get('/appointments', authenticateToken, checkPermission('appointments:read'), async (req, res) => {
  try {
    const now = new Date();
    const start = normISO(req.query.start, new Date(now.setHours(0, 0, 0, 0)));
    const end = normISO(req.query.end, new Date(now.setHours(24, 0, 0, 0)));

    const idsParam = (req.query.provider_ids ?? req.query.providerIds ?? '').toString().trim();
    const providerIds =
      idsParam.length > 0
        ? idsParam
            .split(',')
            .map((s) => toInt(s))
            .filter((n) => Number.isFinite(n))
        : null;

    const patientIdRaw = req.query.patient_id ?? req.query.patientId;
    const patientId = patientIdRaw != null ? toInt(patientIdRaw) : null;

    const params = [
      start,
      end,
      providerIds ?? null,
      Number.isFinite(patientId) ? patientId : null,
    ];

    const sql = `
      SELECT
        a.id, a.provider_id, a.patient_id,
        a.start_ts AS start, a.end_ts AS "end",
        a.title, a.type, a.status, a.notes, a.room,
        pv.first_name AS provider_first_name,
        pv.last_name  AS provider_last_name,
        pt.first_name AS patient_first_name,
        pt.last_name  AS patient_last_name
      FROM appointments a
      LEFT JOIN providers pv ON pv.id = a.provider_id
      LEFT JOIN patients  pt ON pt.id = a.patient_id
      WHERE a.start_ts >= $1
        AND a.end_ts   <= $2
        AND ($3::int[] IS NULL OR a.provider_id = ANY($3::int[]))
        AND ($4::int   IS NULL OR a.patient_id  = $4)
      ORDER BY a.start_ts ASC
    `;

    const r = await pool.query(sql, params);
    const rows = r.rows.map((x) => ({
      id: x.id,
      provider_id: x.provider_id,
      patient_id: x.patient_id,
      start: x.start,
      end: x.end,
      title: x.title,
      type: x.type,
      status: x.status, // TEXT
      notes: x.notes,
      room: x.room,
      provider_name: provName({
        id: x.provider_id,
        first_name: x.provider_first_name,
        last_name: x.provider_last_name,
      }),
      patient_name: patName({
        id: x.patient_id,
        first_name: x.patient_first_name,
        last_name: x.patient_last_name,
      }),
    }));
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('[appointments:list]', e);
    res.status(500).json({ ok: false, error: e.message || 'Database error' });
  }
});

/* ==========================================================
 * POST /api/appointments
 * body: { provider_id, patient_id, start, end, title?, type?, status?, notes?, room? }
 * ========================================================== */
router.post('/appointments', authenticateToken, checkPermission('appointments:create'), async (req, res) => {
  try {
    const b = req.body ?? {};
    const provider_id = toInt32(b.provider_id);
    const patient_id = toInt32(b.patient_id);
    if (!Number.isFinite(provider_id) || !Number.isFinite(patient_id)) {
      return res
        .status(400)
        .json({ ok: false, error: 'provider_id and patient_id are required numbers' });
    }
    if (!b.start || !b.end) {
      return res
        .status(400)
        .json({ ok: false, error: 'start and end (ISO strings) are required' });
    }

    const status = normalizeApptStatus(b.status);

    const r = await pool.query(
      `
      INSERT INTO appointments
        (provider_id, patient_id, start_ts, end_ts, title, type, status, notes, room)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id, provider_id, patient_id,
        start_ts AS start, end_ts AS "end",
        title, type, status, notes, room
      `,
      [
        provider_id,
        patient_id,
        b.start,
        b.end,
        b.title ?? null,
        b.type ?? null,
        status,
        b.notes ?? null,
        b.room ?? null,
      ],
    );

    // Optional: sync patient's primary provider if you keep that column
    try {
      await pool.query(
        `UPDATE patients
            SET provider_id = $1
          WHERE id = $2 AND (provider_id IS NULL OR provider_id <> $1)`,
        [provider_id, patient_id],
      );
    } catch {}

    // Broadcast the new appointment to WebSocket clients
    const appointmentData = {
      ...r.rows[0],
      date: r.rows[0].start?.split('T')[0] // Extract date for client filtering
    };
    
    try {
      broadcastAppointmentUpdate(appointmentData);
    } catch (broadcastError) {
      console.warn('[appointments:create] WebSocket broadcast failed:', broadcastError);
    }

    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    console.error('[appointments:create]', e);
    res.status(500).json({ ok: false, error: e.message || 'Database error' });
  }
});

/* ==========================================================
 * PUT /api/appointments/:id
 * Accepts partial fields. Maps start/end -> start_ts/end_ts in DB.
 * ========================================================== */
router.put('/appointments/:id', authenticateToken, checkPermission('appointments:write'), async (req, res) => {
  try {
    const id = toInt32(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid id' });
    }

    const body = { ...req.body };
    if (body.status != null) {
      body.status = normalizeApptStatus(body.status);
    }

    const sets = [];
    const vals = [];
    let i = 1;

    const mapKey = (k) => (k === 'start' ? 'start_ts' : k === 'end' ? 'end_ts' : k);
    const allowed = [
      'provider_id',
      'patient_id',
      'start',
      'end',
      'title',
      'type',
      'status',
      'notes',
      'room',
    ];

    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        sets.push(`${mapKey(k)} = $${i++}`);
        vals.push(body[k]);
      }
    }
    if (sets.length === 0) {
      return res.status(400).json({ ok: false, error: 'No fields to update' });
    }

    vals.push(id);

    const r = await pool.query(
      `UPDATE appointments
          SET ${sets.join(', ')}
        WHERE id = $${i}
        RETURNING id, provider_id, patient_id,
                  start_ts AS start, end_ts AS "end",
                  title, type, status, notes, room`,
      vals,
    );
    if (r.rowCount === 0) return res.status(404).json({ ok: false, error: 'Not found' });
    
    // Broadcast the updated appointment to WebSocket clients
    const appointmentData = {
      ...r.rows[0],
      date: r.rows[0].start?.split('T')[0] // Extract date for client filtering
    };
    
    try {
      broadcastAppointmentUpdate(appointmentData);
    } catch (broadcastError) {
      console.warn('[appointments:update] WebSocket broadcast failed:', broadcastError);
    }
    
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    console.error('[appointments:update]', e);
    res.status(500).json({ ok: false, error: e.message || 'Database error' });
  }
});

/* ==========================================================
 * DELETE /api/appointments/:id
 * ========================================================== */
router.delete('/appointments/:id', authenticateToken, checkPermission('appointments:delete'), async (req, res) => {
  try {
    const id = toInt32(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid id' });
    }
    // Get appointment data before deletion for WebSocket broadcast
    const getResult = await pool.query(
      'SELECT id, start_ts AS start FROM appointments WHERE id = $1',
      [id]
    );
    
    await pool.query('DELETE FROM appointments WHERE id = $1', [id]);
    
    // Broadcast the deletion to WebSocket clients
    if (getResult.rowCount > 0) {
      const appointmentData = {
        id: getResult.rows[0].id,
        deleted: true,
        date: getResult.rows[0].start?.split('T')[0] // Extract date for client filtering
      };
      
      try {
        broadcastAppointmentUpdate(appointmentData);
      } catch (broadcastError) {
        console.warn('[appointments:delete] WebSocket broadcast failed:', broadcastError);
      }
    }
    
    res.json({ ok: true, data: true });
  } catch (e) {
    console.error('[appointments:delete]', e);
    res.status(500).json({ ok: false, error: e.message || 'Database error' });
  }
});

/* ==========================================================
 * POST /api/appointments/:id/start-encounter
 * Reuse/create encounter linked to this appointment
 * ========================================================== */
router.post('/appointments/:id/start-encounter', authenticateToken, checkPermission('visits:create'), async (req, res) => {
  try {
    const id = toInt32(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid appointment id (must be a saved appointment).' });
    }

    const apt = await pool.query(
      `SELECT a.id, a.patient_id, a.provider_id, a.title,
              p.first_name AS patient_first_name, p.last_name AS patient_last_name
         FROM appointments a
         LEFT JOIN patients p ON p.id = a.patient_id
        WHERE a.id = $1`,
      [id],
    );
    if (apt.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Appointment not found' });
    }
    const { patient_id, provider_id, title, patient_first_name, patient_last_name } = apt.rows[0];

    const existing = await pool.query(
      `SELECT id AS eid
         FROM encounters
        WHERE appointment_id = $1
        ORDER BY id DESC
        LIMIT 1`,
      [id],
    );
    if (existing.rowCount > 0) {
      return res.json({
        ok: true,
        data: {
          eid: existing.rows[0].eid,
          pid: patient_id,
          patient_name: patName({ id: patient_id, first_name: patient_first_name, last_name: patient_last_name }),
        },
      });
    }

    const created = await pool.query(
      `INSERT INTO encounters (patient_id, reason, status, appointment_id)
       VALUES ($1, $2, 'open', $3)
       RETURNING id AS eid`,
      [patient_id, (title ?? '').toString() || 'Visit', id],
    );

    try {
      if (Number.isFinite(provider_id)) {
        await pool.query(
          `UPDATE patients
              SET provider_id = $1
            WHERE id = $2 AND (provider_id IS NULL OR provider_id <> $1)`,
          [provider_id, patient_id],
        );
      }
    } catch {}

    return res.json({
      ok: true,
      data: {
        eid: created.rows[0].eid,
        pid: patient_id,
        patient_name: patName({ id: patient_id, first_name: patient_first_name, last_name: patient_last_name }),
      },
    });
  } catch (e) {
    console.error('[appointments:start-encounter]', e);
    return res.status(500).json({ ok: false, error: e.message || 'Database error' });
  }
});

export default router;
