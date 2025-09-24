import { Router } from 'express';
import pool from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';
import { auditPHIAccess, auditSearchOperation } from '../middleware/phiAuditMiddleware.js';

const router = Router();

/**
 * MEDICATION SEARCH AND MANAGEMENT ROUTES
 * - GET /api/medications/search - Search drug database
 * - GET /api/medications/:id - Get specific medication details
 * - GET /api/medications/classes - Get drug classes for filtering
 */

/* Search medications database */
router.get('/medications/search', authenticateToken, checkPermission('medications:read'),
  auditPHIAccess({ resourceType: 'medication', action: 'SEARCH', failOnAuditError: true }),
  auditSearchOperation('medication'), async (req, res) => {
  try {
    const { 
      q: query = '', 
      limit = 50, 
      offset = 0,
      class: drugClass,
      form: dosageForm,
      active_only = 'true'
    } = req.query;

    const searchLimit = Math.min(Number(limit), 100); // Cap at 100 results
    const searchOffset = Number(offset);

    let sql = `
      SELECT 
        m.id,
        m.generic_name,
        m.brand_name,
        m.drug_class,
        m.therapeutic_class,
        m.dosage_form,
        m.strength,
        m.controlled_substance,
        m.schedule,
        m.generic_available,
        m.typical_frequency,
        ts_rank(m.search_vector, query) AS rank
      FROM medications m, websearch_to_tsquery('english', $1) query
      WHERE 1=1
    `;

    const params = [query || ''];
    let paramCount = 1;

    // Add full-text search if query provided
    if (query.trim()) {
      sql += ` AND m.search_vector @@ query`;
    }

    // Filter by active medications
    if (active_only === 'true') {
      sql += ` AND m.active = true`;
    }

    // Filter by drug class
    if (drugClass) {
      paramCount++;
      sql += ` AND LOWER(m.drug_class) = LOWER($${paramCount})`;
      params.push(drugClass);
    }

    // Filter by dosage form
    if (dosageForm) {
      paramCount++;
      sql += ` AND LOWER(m.dosage_form) = LOWER($${paramCount})`;
      params.push(dosageForm);
    }

    // Order by relevance if searching, otherwise by name
    if (query.trim()) {
      sql += ` ORDER BY rank DESC, m.generic_name ASC`;
    } else {
      sql += ` ORDER BY m.generic_name ASC, m.brand_name ASC`;
    }

    // Add pagination
    paramCount++;
    sql += ` LIMIT $${paramCount}`;
    params.push(searchLimit);

    paramCount++;
    sql += ` OFFSET $${paramCount}`;
    params.push(searchOffset);

    const result = await pool.query(sql, params);

    // Get total count for pagination
    let countSql = `
      SELECT COUNT(*) as total
      FROM medications m
      WHERE 1=1
    `;
    const countParams = [];
    let countParamCount = 0;

    if (query.trim()) {
      countSql += ` AND m.search_vector @@ websearch_to_tsquery('english', $1)`;
      countParams.push(query);
      countParamCount = 1;
    }

    if (active_only === 'true') {
      countSql += ` AND m.active = true`;
    }

    if (drugClass) {
      countParamCount++;
      countSql += ` AND LOWER(m.drug_class) = LOWER($${countParamCount})`;
      countParams.push(drugClass);
    }

    if (dosageForm) {
      countParamCount++;
      countSql += ` AND LOWER(m.dosage_form) = LOWER($${countParamCount})`;
      countParams.push(dosageForm);
    }

    const countResult = await pool.query(countSql, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      ok: true,
      data: {
        medications: result.rows,
        pagination: {
          total,
          limit: searchLimit,
          offset: searchOffset,
          hasMore: searchOffset + searchLimit < total
        }
      }
    });

  } catch (error) {
    console.error('[medications:search]', error);
    res.status(500).json({ ok: false, error: 'Failed to search medications' });
  }
});

/* Get medication details by ID */
router.get('/medications/:id', authenticateToken, checkPermission('medications:read'),
  auditPHIAccess({ resourceType: 'medication', action: 'VIEW', failOnAuditError: true }), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid medication ID' });
    }

    const result = await pool.query(`
      SELECT 
        m.*,
        -- Get interaction count
        (
          SELECT COUNT(*) 
          FROM drug_interactions di 
          WHERE (di.medication_1_id = m.id OR di.medication_2_id = m.id)
            AND di.active = true
        ) as interaction_count
      FROM medications m
      WHERE m.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Medication not found' });
    }

    res.json({
      ok: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[medications:get]', error);
    res.status(500).json({ ok: false, error: 'Failed to get medication details' });
  }
});

/* Get drug classes for filtering */
router.get('/medications/classes', authenticateToken, checkPermission('medications:read'),
  auditPHIAccess({ resourceType: 'medication', action: 'LIST', failOnAuditError: true }), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        drug_class,
        COUNT(*) as medication_count
      FROM medications 
      WHERE active = true AND drug_class IS NOT NULL
      GROUP BY drug_class
      ORDER BY drug_class ASC
    `);

    res.json({
      ok: true,
      data: result.rows
    });

  } catch (error) {
    console.error('[medications:classes]', error);
    res.status(500).json({ ok: false, error: 'Failed to get drug classes' });
  }
});

/* Get dosage forms for filtering */
router.get('/medications/forms', authenticateToken, checkPermission('medications:read'),
  auditPHIAccess({ resourceType: 'medication', action: 'LIST', failOnAuditError: true }), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        dosage_form,
        COUNT(*) as medication_count
      FROM medications 
      WHERE active = true
      GROUP BY dosage_form
      ORDER BY dosage_form ASC
    `);

    res.json({
      ok: true,
      data: result.rows
    });

  } catch (error) {
    console.error('[medications:forms]', error);
    res.status(500).json({ ok: false, error: 'Failed to get dosage forms' });
  }
});

export default router;