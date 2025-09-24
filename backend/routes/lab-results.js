// routes/lab-results.js
import express from 'express';
import db from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';
import { auditPHIAccess } from '../middleware/phiAuditMiddleware.js';

const router = express.Router();

// POST /api/results - process incoming lab results
router.post('/results', authenticateToken, checkPermission('lab_results:create'),
  auditPHIAccess({ resourceType: 'lab_result', action: 'CREATE', failOnAuditError: true }), async (req, res) => {
  try {
    const {
      patient_id,
      lab_order_id,
      name,
      value,
      units,
      component_code,
      reference_range,
      specimen_id,
      observed_at,
      resulted_at,
      performing_lab,
      method,
      result_status = 'final',
      notes
    } = req.body;

    if (!patient_id || !name || !value) {
      return res.status(400).json({
        ok: false,
        error: 'patient_id, name, and value are required'
      });
    }

    const insertQuery = `
      INSERT INTO results (
        patient_id, lab_order_id, name, value, units, component_code,
        reference_range, specimen_id, observed_at, resulted_at,
        performing_lab, method, result_status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const result = await db.query(insertQuery, [
      patient_id, lab_order_id, name, value, units, component_code,
      reference_range, specimen_id, observed_at || new Date(), resulted_at,
      performing_lab, method, result_status, notes
    ]);

    // Update lab order status if provided
    if (lab_order_id) {
      await db.query(
        'UPDATE lab_orders SET status = $1, resulted_at = $2 WHERE id = $3',
        ['resulted', resulted_at || new Date(), lab_order_id]
      );
    }

    res.status(201).json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error processing lab result:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to process result'
    });
  }
});

// POST /api/results/batch - process multiple results at once
router.post('/results/batch', authenticateToken, checkPermission('lab_results:create'),
  auditPHIAccess({ resourceType: 'lab_result', action: 'BULK_CREATE', failOnAuditError: true }), async (req, res) => {
  try {
    const { results: resultsData } = req.body;

    if (!Array.isArray(resultsData) || resultsData.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'results array is required'
      });
    }

    const client = await db.connect();
    
    try {
      await client.query('BEGIN');

      const createdResults = [];
      const orderUpdates = new Set();

      for (const resultData of resultsData) {
        const {
          patient_id,
          lab_order_id,
          name,
          value,
          units,
          component_code,
          reference_range,
          specimen_id,
          observed_at,
          resulted_at,
          performing_lab,
          method,
          result_status = 'final',
          notes
        } = resultData;

        if (!patient_id || !name || !value) {
          throw new Error('patient_id, name, and value are required for all results');
        }

        const insertQuery = `
          INSERT INTO results (
            patient_id, lab_order_id, name, value, units, component_code,
            reference_range, specimen_id, observed_at, resulted_at,
            performing_lab, method, result_status, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING *
        `;

        const result = await client.query(insertQuery, [
          patient_id, lab_order_id, name, value, units, component_code,
          reference_range, specimen_id, observed_at || new Date(), resulted_at,
          performing_lab, method, result_status, notes
        ]);

        createdResults.push(result.rows[0]);

        if (lab_order_id) {
          orderUpdates.add(lab_order_id);
        }
      }

      // Update lab order statuses
      for (const orderId of orderUpdates) {
        await client.query(
          'UPDATE lab_orders SET status = $1, resulted_at = $2 WHERE id = $3',
          ['resulted', new Date(), orderId]
        );
      }

      await client.query('COMMIT');

      res.status(201).json({
        ok: true,
        data: createdResults
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error processing batch results:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to process batch results'
    });
  }
});

// GET /api/patients/:patientId/results - get patient result history with trending
router.get('/patients/:patientId/results', authenticateToken, checkPermission('lab_results:read'),
  auditPHIAccess({ resourceType: 'lab_result', action: 'LIST', failOnAuditError: true }), async (req, res) => {
  try {
    const { patientId } = req.params;
    const { 
      component_code,
      days_back = 365,
      abnormal_only = false,
      critical_only = false,
      limit = 100,
      offset = 0
    } = req.query;

    let whereConditions = ['r.patient_id = $1'];
    let queryParams = [patientId];
    let paramIndex = 2;

    // Date filter
    if (days_back) {
      whereConditions.push(`r.observed_at >= CURRENT_DATE - INTERVAL '${days_back} days'`);
    }

    // Component filter
    if (component_code) {
      whereConditions.push(`r.component_code = $${paramIndex}`);
      queryParams.push(component_code);
      paramIndex++;
    }

    // Abnormal only filter
    if (abnormal_only === 'true') {
      whereConditions.push('r.abnormal_flag IS NOT NULL AND r.abnormal_flag != \'N\'');
    }

    // Critical only filter
    if (critical_only === 'true') {
      whereConditions.push('r.critical_flag = true');
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    const resultsQuery = `
      SELECT 
        r.*,
        lo.specimen_id,
        lo.priority as order_priority,
        lt.name as test_name,
        lt.code as test_code,
        lt.category as test_category,
        rt.trend_direction,
        rt.percent_change,
        rn.notification_type,
        rn.priority as notification_priority
      FROM results r
      LEFT JOIN lab_orders lo ON r.lab_order_id = lo.id
      LEFT JOIN lab_tests lt ON lo.lab_test_id = lt.id
      LEFT JOIN result_trends rt ON (r.patient_id = rt.patient_id AND r.component_code = rt.component_code AND r.observed_at::date = rt.result_date)
      LEFT JOIN result_notifications rn ON r.id = rn.result_id
      ${whereClause}
      ORDER BY r.observed_at DESC, r.component_code
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limit, offset);

    const result = await db.query(resultsQuery, queryParams);

    // Get trending data for the patient
    const trendQuery = `
      SELECT 
        component_code,
        COUNT(*) as result_count,
        MIN(result_date) as first_result_date,
        MAX(result_date) as last_result_date,
        COUNT(CASE WHEN abnormal_flag NOT IN ('N') AND abnormal_flag IS NOT NULL THEN 1 END) as abnormal_count
      FROM result_trends 
      WHERE patient_id = $1
      GROUP BY component_code
      ORDER BY last_result_date DESC
    `;

    const trendResult = await db.query(trendQuery, [patientId]);

    res.json({
      ok: true,
      data: {
        results: result.rows,
        trends: trendResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching patient results:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch patient results'
    });
  }
});

// GET /api/results/:resultId - get specific result details
router.get('/results/:resultId', authenticateToken, checkPermission('lab_results:read'),
  auditPHIAccess({ resourceType: 'lab_result', action: 'VIEW', failOnAuditError: true }), async (req, res) => {
  try {
    const { resultId } = req.params;

    const query = `
      SELECT 
        r.*,
        lo.specimen_id,
        lo.clinical_indication,
        lo.priority as order_priority,
        lt.name as test_name,
        lt.code as test_code,
        lt.category as test_category,
        p.first_name || ' ' || p.last_name as provider_name
      FROM results r
      LEFT JOIN lab_orders lo ON r.lab_order_id = lo.id
      LEFT JOIN lab_tests lt ON lo.lab_test_id = lt.id
      LEFT JOIN providers p ON lo.provider_id = p.id
      WHERE r.id = $1
    `;

    const result = await db.query(query, [resultId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Result not found'
      });
    }

    res.json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching result details:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch result details'
    });
  }
});

// GET /api/results/notifications - get pending result notifications
router.get('/results/notifications', authenticateToken, checkPermission('lab_results:read'),
  auditPHIAccess({ resourceType: 'lab_result', action: 'LIST', failOnAuditError: true }), async (req, res) => {
  try {
    const { 
      provider_id,
      notification_type,
      unacknowledged_only = true,
      limit = 50,
      offset = 0
    } = req.query;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (provider_id) {
      whereConditions.push(`rn.recipient_provider_id = $${paramIndex}`);
      queryParams.push(provider_id);
      paramIndex++;
    }

    if (notification_type) {
      whereConditions.push(`rn.notification_type = $${paramIndex}`);
      queryParams.push(notification_type);
      paramIndex++;
    }

    if (unacknowledged_only === 'true') {
      whereConditions.push('rn.acknowledged_at IS NULL');
    }

    const whereClause = whereConditions.length > 0 ? 
      'WHERE ' + whereConditions.join(' AND ') : '';

    const query = `
      SELECT 
        rn.*,
        r.name as result_name,
        r.value as result_value,
        r.units as result_units,
        r.abnormal_flag,
        r.critical_flag,
        r.observed_at,
        p.first_name || ' ' || p.last_name as patient_name,
        prov.first_name || ' ' || prov.last_name as ordering_provider
      FROM result_notifications rn
      JOIN results r ON rn.result_id = r.id
      JOIN patients p ON r.patient_id = p.id
      LEFT JOIN lab_orders lo ON r.lab_order_id = lo.id
      LEFT JOIN providers prov ON lo.provider_id = prov.id
      ${whereClause}
      ORDER BY rn.created_at DESC, rn.priority DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limit, offset);

    const result = await db.query(query, queryParams);

    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching result notifications:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch notifications'
    });
  }
});

// PUT /api/results/notifications/:notificationId/acknowledge - acknowledge notification
router.put('/results/notifications/:notificationId/acknowledge', authenticateToken, checkPermission('lab_results:write'),
  auditPHIAccess({ resourceType: 'lab_result', action: 'UPDATE', failOnAuditError: true }), async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { acknowledged_by } = req.body;

    const query = `
      UPDATE result_notifications 
      SET acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = $2
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, [notificationId, acknowledged_by]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Notification not found'
      });
    }

    res.json({
      ok: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error acknowledging notification:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to acknowledge notification'
    });
  }
});

// GET /api/patients/:patientId/results/trending/:componentCode - get trending data for specific component
router.get('/patients/:patientId/results/trending/:componentCode', authenticateToken, checkPermission('lab_results:read'),
  auditPHIAccess({ resourceType: 'lab_result', action: 'VIEW', failOnAuditError: true }), async (req, res) => {
  try {
    const { patientId, componentCode } = req.params;
    const { months_back = 12 } = req.query;

    const query = `
      SELECT 
        rt.*,
        r.units,
        r.reference_range as current_reference_range
      FROM result_trends rt
      LEFT JOIN results r ON (
        rt.patient_id = r.patient_id AND 
        rt.component_code = r.component_code AND
        rt.result_date = r.observed_at::date
      )
      WHERE rt.patient_id = $1 
        AND rt.component_code = $2
        AND rt.result_date >= CURRENT_DATE - INTERVAL '${months_back} months'
      ORDER BY rt.result_date ASC
    `;

    const result = await db.query(query, [patientId, componentCode]);

    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching trending data:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch trending data'
    });
  }
});

export default router;