import { Router } from 'express';
import pool from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

/**
 * DIAGNOSIS/ICD-10 API ROUTES
 * - GET /api/diagnoses/search - Search ICD-10 codes
 * - GET /api/diagnoses/:code - Get specific diagnosis by code
 * - GET /api/diagnoses/categories - Get diagnosis categories
 * - GET /api/diagnoses/popular - Get frequently used diagnoses
 */

/* Search ICD-10 diagnosis codes */
router.get('/diagnoses/search', authenticateToken, checkPermission('diagnoses:read'), async (req, res) => {
  try {
    const {
      q: query = '',
      category,
      billable_only = 'true',
      limit = 25,
      offset = 0
    } = req.query;

    const searchLimit = Math.min(Number(limit), 100);
    const searchOffset = Number(offset);

    let sql = `
      SELECT 
        id,
        code,
        description,
        short_description,
        category,
        subcategory,
        code_type,
        billable,
        usage_count,
        last_used,
        ${query ? "ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS rank" : '0 as rank'}
      FROM icd10_diagnoses
      WHERE (valid_to IS NULL OR valid_to > CURRENT_DATE)
    `;

    const params = [];
    let paramCount = 0;

    // Add search query
    if (query.trim()) {
      paramCount++;
      sql += ` AND search_vector @@ websearch_to_tsquery('english', $${paramCount})`;
      params.push(query);
    }

    // Filter by category
    if (category) {
      paramCount++;
      sql += ` AND LOWER(category) = LOWER($${paramCount})`;
      params.push(category);
    }

    // Filter by billable codes only
    if (billable_only === 'true') {
      sql += ` AND billable = true`;
    }

    // Order by relevance if searching, otherwise by usage and code
    if (query.trim()) {
      sql += ` ORDER BY rank DESC, usage_count DESC, code ASC`;
    } else {
      sql += ` ORDER BY usage_count DESC, code ASC`;
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
      FROM icd10_diagnoses
      WHERE (valid_to IS NULL OR valid_to > CURRENT_DATE)
    `;
    const countParams = [];
    let countParamCount = 0;

    if (query.trim()) {
      countParamCount++;
      countSql += ` AND search_vector @@ websearch_to_tsquery('english', $${countParamCount})`;
      countParams.push(query);
    }

    if (category) {
      countParamCount++;
      countSql += ` AND LOWER(category) = LOWER($${countParamCount})`;
      countParams.push(category);
    }

    if (billable_only === 'true') {
      countSql += ` AND billable = true`;
    }

    const countResult = await pool.query(countSql, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      ok: true,
      data: {
        diagnoses: result.rows,
        pagination: {
          total,
          limit: searchLimit,
          offset: searchOffset,
          hasMore: searchOffset + searchLimit < total
        }
      }
    });

  } catch (error) {
    console.error('[diagnoses:search]', error);
    res.status(500).json({ ok: false, error: 'Failed to search diagnoses' });
  }
});

/* Get specific diagnosis by code */
router.get('/diagnoses/:code', authenticateToken, checkPermission('diagnoses:read'), async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();

    const result = await pool.query(`
      SELECT *
      FROM icd10_diagnoses
      WHERE code = $1
    `, [code]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Diagnosis code not found' });
    }

    // Track usage
    await pool.query('SELECT track_diagnosis_usage($1)', [code]);

    res.json({
      ok: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[diagnoses:get]', error);
    res.status(500).json({ ok: false, error: 'Failed to get diagnosis' });
  }
});

/* Get diagnosis categories */
router.get('/diagnoses/categories', authenticateToken, checkPermission('diagnoses:read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        category,
        COUNT(*) as diagnosis_count,
        COUNT(CASE WHEN billable = true THEN 1 END) as billable_count
      FROM icd10_diagnoses
      WHERE (valid_to IS NULL OR valid_to > CURRENT_DATE)
        AND category IS NOT NULL
      GROUP BY category
      ORDER BY category ASC
    `);

    res.json({
      ok: true,
      data: result.rows
    });

  } catch (error) {
    console.error('[diagnoses:categories]', error);
    res.status(500).json({ ok: false, error: 'Failed to get diagnosis categories' });
  }
});

/* Get popular/frequently used diagnoses */
router.get('/diagnoses/popular', authenticateToken, checkPermission('diagnoses:read'), async (req, res) => {
  try {
    const { 
      category,
      limit = 20
    } = req.query;

    let sql = `
      SELECT 
        code,
        description,
        short_description,
        category,
        usage_count,
        last_used
      FROM icd10_diagnoses
      WHERE (valid_to IS NULL OR valid_to > CURRENT_DATE)
        AND billable = true
        AND usage_count > 0
    `;

    const params = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      sql += ` AND LOWER(category) = LOWER($${paramCount})`;
      params.push(category);
    }

    sql += ` ORDER BY usage_count DESC, last_used DESC`;

    paramCount++;
    sql += ` LIMIT $${paramCount}`;
    params.push(Math.min(Number(limit), 50));

    const result = await pool.query(sql, params);

    res.json({
      ok: true,
      data: result.rows
    });

  } catch (error) {
    console.error('[diagnoses:popular]', error);
    res.status(500).json({ ok: false, error: 'Failed to get popular diagnoses' });
  }
});

/* Get clinical templates */
router.get('/templates', authenticateToken, checkPermission('diagnoses:read'), async (req, res) => {
  try {
    const {
      visit_type,
      specialty,
      active_only = 'true'
    } = req.query;

    let sql = `
      SELECT 
        id,
        name,
        description,
        visit_type,
        specialty,
        subjective_template,
        objective_template,
        assessment_template,
        plan_template,
        common_diagnoses,
        auto_populate_vitals,
        auto_populate_allergies,
        auto_populate_medications,
        require_assessment,
        require_plan,
        usage_count
      FROM clinical_templates
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (active_only === 'true') {
      sql += ` AND is_active = true`;
    }

    if (visit_type) {
      paramCount++;
      sql += ` AND visit_type = $${paramCount}`;
      params.push(visit_type);
    }

    if (specialty) {
      paramCount++;
      sql += ` AND (specialty = $${paramCount} OR specialty IS NULL)`;
      params.push(specialty);
    }

    sql += ` ORDER BY usage_count DESC, name ASC`;

    const result = await pool.query(sql, params);

    res.json({
      ok: true,
      data: result.rows
    });

  } catch (error) {
    console.error('[templates:get]', error);
    res.status(500).json({ ok: false, error: 'Failed to get templates' });
  }
});

/* Get specific template */
router.get('/templates/:id', authenticateToken, checkPermission('diagnoses:read'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid template ID' });
    }

    const result = await pool.query(`
      SELECT *
      FROM clinical_templates
      WHERE id = $1 AND is_active = true
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }

    // Track template usage
    await pool.query('SELECT track_template_usage($1)', [id]);

    res.json({
      ok: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[templates:get-by-id]', error);
    res.status(500).json({ ok: false, error: 'Failed to get template' });
  }
});

export default router;