// routes/lab-orders.js
import express from 'express';
import db from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';
import { auditPHIAccess } from '../middleware/phiAuditMiddleware.js';

const router = express.Router();

// GET /api/encounters/:encounterId/lab-orders - get lab orders for an encounter
router.get('/encounters/:encounterId/lab-orders', authenticateToken, checkPermission('lab_orders:read'),
  auditPHIAccess({ resourceType: 'lab_order', action: 'LIST', failOnAuditError: true }), async (req, res) => {
  try {
    const { encounterId } = req.params;

    const ordersQuery = `
      SELECT 
        lo.*,
        lt.name as test_name,
        lt.code as test_code,
        lt.category,
        lt.specimen_type,
        lt.fasting_required,
        lt.turnaround_time_hours,
        lt.special_instructions,
        p.first_name || ' ' || p.last_name as provider_name,
        COUNT(r.id) as result_count
      FROM lab_orders lo
      JOIN lab_tests lt ON lo.lab_test_id = lt.id
      LEFT JOIN providers p ON lo.provider_id = p.id
      LEFT JOIN results r ON lo.id = r.lab_order_id
      WHERE lo.encounter_id = $1
      GROUP BY lo.id, lt.id, p.id
      ORDER BY lo.created_at DESC
    `;

    const result = await db.query(ordersQuery, [encounterId]);

    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching encounter lab orders:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch lab orders'
    });
  }
});

// POST /api/encounters/:encounterId/lab-orders - create lab orders for an encounter
router.post('/encounters/:encounterId/lab-orders', authenticateToken, checkPermission('lab_orders:create'),
  auditPHIAccess({ resourceType: 'lab_order', action: 'CREATE', failOnAuditError: true }), async (req, res) => {
  try {
    const { encounterId } = req.params;
    const { 
      patient_id, 
      provider_id, 
      lab_test_ids = [], 
      priority = 'routine',
      clinical_indication,
      diagnosis_codes = [],
      fasting_status,
      notes,
      collect_after
    } = req.body;

    if (!patient_id || !provider_id || lab_test_ids.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'patient_id, provider_id, and lab_test_ids are required'
      });
    }

    const client = await db.connect();
    
    try {
      await client.query('BEGIN');

      const createdOrders = [];

      for (const lab_test_id of lab_test_ids) {
        const orderQuery = `
          INSERT INTO lab_orders (
            encounter_id, patient_id, provider_id, lab_test_id,
            priority, clinical_indication, diagnosis_codes,
            fasting_status, notes, collect_after
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `;

        const orderResult = await client.query(orderQuery, [
          encounterId,
          patient_id,
          provider_id,
          lab_test_id,
          priority,
          clinical_indication,
          diagnosis_codes,
          fasting_status,
          notes,
          collect_after
        ]);

        createdOrders.push(orderResult.rows[0]);
      }

      await client.query('COMMIT');

      // Fetch complete order details
      const orderIds = createdOrders.map(order => order.id);
      const detailsQuery = `
        SELECT 
          lo.*,
          lt.name as test_name,
          lt.code as test_code,
          lt.category,
          lt.specimen_type,
          lt.fasting_required,
          lt.turnaround_time_hours,
          lt.special_instructions
        FROM lab_orders lo
        JOIN lab_tests lt ON lo.lab_test_id = lt.id
        WHERE lo.id = ANY($1)
        ORDER BY lo.created_at ASC
      `;

      const detailsResult = await client.query(detailsQuery, [orderIds]);

      res.status(201).json({
        ok: true,
        data: detailsResult.rows
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating lab orders:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to create lab orders'
    });
  }
});

// PUT /api/lab-orders/:orderId - update lab order status
router.put('/lab-orders/:orderId', authenticateToken, checkPermission('lab_orders:write'),
  auditPHIAccess({ resourceType: 'lab_order', action: 'UPDATE', failOnAuditError: true }), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { 
      status,
      collected_at,
      collected_by,
      specimen_id,
      received_at,
      resulted_at,
      reviewed_at,
      reviewed_by,
      notes,
      external_order_id
    } = req.body;

    const updateQuery = `
      UPDATE lab_orders 
      SET 
        status = COALESCE($2, status),
        collected_at = COALESCE($3, collected_at),
        collected_by = COALESCE($4, collected_by),
        specimen_id = COALESCE($5, specimen_id),
        received_at = COALESCE($6, received_at),
        resulted_at = COALESCE($7, resulted_at),
        reviewed_at = COALESCE($8, reviewed_at),
        reviewed_by = COALESCE($9, reviewed_by),
        notes = COALESCE($10, notes),
        external_order_id = COALESCE($11, external_order_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(updateQuery, [
      orderId, status, collected_at, collected_by, specimen_id,
      received_at, resulted_at, reviewed_at, reviewed_by, notes, external_order_id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Lab order not found'
      });
    }

    res.json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating lab order:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to update lab order'
    });
  }
});

// DELETE /api/lab-orders/:orderId - cancel lab order
router.delete('/lab-orders/:orderId', authenticateToken, checkPermission('lab_orders:delete'),
  auditPHIAccess({ resourceType: 'lab_order', action: 'DELETE', failOnAuditError: true }), async (req, res) => {
  try {
    const { orderId } = req.params;

    const cancelQuery = `
      UPDATE lab_orders 
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'ordered'
      RETURNING *
    `;

    const result = await db.query(cancelQuery, [orderId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Lab order not found or cannot be cancelled'
      });
    }

    res.json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error cancelling lab order:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to cancel lab order'
    });
  }
});

// GET /api/patients/:patientId/lab-orders - get all lab orders for a patient
router.get('/patients/:patientId/lab-orders', authenticateToken, checkPermission('lab_orders:read'),
  auditPHIAccess({ resourceType: 'lab_order', action: 'LIST', failOnAuditError: true }), async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;

    let whereClause = 'WHERE lo.patient_id = $1';
    let queryParams = [patientId];

    if (status) {
      whereClause += ' AND lo.status = $2';
      queryParams.push(status);
    }

    const ordersQuery = `
      SELECT 
        lo.*,
        lt.name as test_name,
        lt.code as test_code,
        lt.category,
        lt.specimen_type,
        p.first_name || ' ' || p.last_name as provider_name,
        e.visit_type as encounter_type,
        COUNT(r.id) as result_count
      FROM lab_orders lo
      JOIN lab_tests lt ON lo.lab_test_id = lt.id
      LEFT JOIN providers p ON lo.provider_id = p.id
      LEFT JOIN encounters e ON lo.encounter_id = e.id
      LEFT JOIN results r ON lo.id = r.lab_order_id
      ${whereClause}
      GROUP BY lo.id, lt.id, p.id, e.id
      ORDER BY lo.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    queryParams.push(limit, offset);

    const result = await db.query(ordersQuery, queryParams);

    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching patient lab orders:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch lab orders'
    });
  }
});

// GET /api/lab-orders/:orderId/results - get results for a lab order
router.get('/lab-orders/:orderId/results', authenticateToken, checkPermission('lab_results:read'),
  auditPHIAccess({ resourceType: 'lab_result', action: 'VIEW', failOnAuditError: true }), async (req, res) => {
  try {
    const { orderId } = req.params;

    const resultsQuery = `
      SELECT 
        r.*,
        lo.specimen_id,
        lt.name as test_name,
        lt.code as test_code
      FROM results r
      JOIN lab_orders lo ON r.lab_order_id = lo.id
      JOIN lab_tests lt ON lo.lab_test_id = lt.id
      WHERE lo.id = $1
      ORDER BY r.observed_at DESC, r.component_code
    `;

    const result = await db.query(resultsQuery, [orderId]);

    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching lab order results:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch results'
    });
  }
});

export default router;