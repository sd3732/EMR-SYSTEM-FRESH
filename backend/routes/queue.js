import { Router } from 'express';
import pool from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';
import { auditPHIAccess } from '../middleware/phiAuditMiddleware.js';

const router = Router();

// GET /api/queue - Get current queue with all patient details
router.get('/queue', authenticateToken, checkPermission('queue:read'),
  auditPHIAccess({ resourceType: 'patient', action: 'LIST', failOnAuditError: true }), async (req, res) => {
  try {
    console.log('Fetching queue for date:', new Date().toISOString().split('T')[0]);

    // Main queue query
    const query = `
      SELECT
        a.id as appointment_id,
        a.patient_id,
        a.encounter_id,
        a.status,
        a.room,
        a.triage_priority,
        a.arrival_time,
        a.notes as chief_complaint,
        a.visit_type,
        p.mrn,
        p.first_name,
        p.last_name,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        p.dob,
        CASE
          WHEN p.dob IS NOT NULL
          THEN EXTRACT(YEAR FROM AGE(p.dob))::integer
          ELSE NULL
        END as age,
        p.gender,
        e.encounter_number,
        CASE
          WHEN a.arrival_time IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (NOW() - a.arrival_time))/60)
          ELSE ROUND(EXTRACT(EPOCH FROM (NOW() - a.created_at))/60)
        END as wait_time_minutes
      FROM appointments a
      INNER JOIN patients p ON a.patient_id = p.id
      LEFT JOIN encounters e ON a.encounter_id = e.id
      WHERE DATE(COALESCE(a.start_ts, a.created_at)) = CURRENT_DATE
        AND a.status IN ('waiting', 'triaged', 'roomed', 'with-provider', 'completed')
      ORDER BY
        CASE
          WHEN a.triage_priority = 'emergent' THEN 1
          WHEN a.triage_priority = 'urgent' THEN 2
          WHEN a.triage_priority = 'less-urgent' THEN 3
          WHEN a.triage_priority = 'non-urgent' THEN 4
          ELSE 5
        END,
        COALESCE(a.arrival_time, a.created_at) ASC
    `;

    const result = await pool.query(query);
    console.log(`Queue query returned ${result.rows.length} patients`);

    // Log first patient for debugging
    if (result.rows.length > 0) {
      console.log('First queue patient:', {
        name: result.rows[0].patient_name,
        status: result.rows[0].status,
        appointment_id: result.rows[0].appointment_id
      });
    }

    res.json({
      ok: true,
      data: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[queue:list] Database error:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch queue',
      message: error.message
    });
  }
});

// GET /api/queue/metrics - Dashboard metrics
router.get('/queue/metrics', authenticateToken, checkPermission('queue:read'),
  auditPHIAccess({ resourceType: 'patient', action: 'VIEW', failOnAuditError: true }), async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;

    const metricsQuery = `
      WITH daily_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE a.status = 'waiting') as waiting,
          COUNT(*) FILTER (WHERE a.status = 'triaged') as triaged,
          COUNT(*) FILTER (WHERE a.status IN ('roomed', 'with-provider')) as in_treatment,
          COUNT(*) FILTER (WHERE a.status = 'completed') as completed,
          COUNT(*) FILTER (WHERE a.triage_priority IN ('emergent', 'urgent')) as urgent_emergent,
          COUNT(DISTINCT CASE WHEN a.status != 'cancelled' THEN a.patient_id END) as seen_today,
          COUNT(*) as total_appointments
        FROM appointments a
        WHERE DATE(COALESCE(a.start_ts, a.created_at)) = $1::date
      ),
      room_stats AS (
        SELECT
          COUNT(DISTINCT room) as occupied_rooms
        FROM appointments
        WHERE room IS NOT NULL
          AND room != ''
          AND status IN ('roomed', 'with-provider')
          AND DATE(COALESCE(start_ts, created_at)) = $1::date
      )
      SELECT
        ds.waiting,
        ds.triaged,
        ds.in_treatment,
        ds.completed,
        ds.urgent_emergent,
        ds.seen_today,
        ds.total_appointments,
        rs.occupied_rooms,
        12 - COALESCE(rs.occupied_rooms, 0) as available_rooms,
        12 as total_rooms
      FROM daily_stats ds
      CROSS JOIN room_stats rs
    `;

    const result = await pool.query(metricsQuery, [date]);

    res.json({
      ok: true,
      data: result.rows[0] || {
        waiting: 0,
        triaged: 0,
        in_treatment: 0,
        completed: 0,
        urgent_emergent: 0,
        seen_today: 0,
        available_rooms: 12,
        total_rooms: 12
      }
    });
  } catch (error) {
    console.error('[queue:metrics] Error:', error);
    res.status(500).json({
      ok: false,
      error: error.message,
      message: 'Failed to fetch queue metrics'
    });
  }
});

// PATCH /api/queue/:id/status - Update patient status
router.patch('/queue/:id/status', authenticateToken, checkPermission('queue:write'),
  auditPHIAccess({ resourceType: 'patient', action: 'UPDATE', failOnAuditError: true }), async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { status, room, triage_priority } = req.body;

    const validStatuses = ['waiting', 'triaged', 'roomed', 'with-provider', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid status',
        validStatuses
      });
    }

    const updateQuery = `
      UPDATE appointments
      SET
        status = $1,
        room = COALESCE($2, room),
        triage_priority = COALESCE($3, triage_priority),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;

    const result = await client.query(updateQuery, [status, room, triage_priority, id]);

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        ok: false,
        error: 'Appointment not found'
      });
    }

    await client.query('COMMIT');

    res.json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[queue:update-status] Error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  } finally {
    client.release();
  }
});

export default router;