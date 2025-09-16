// routes/lab-tests.js
import express from 'express';
import db from '../db/index.js';

const router = express.Router();

// GET /api/lab-tests/search - search lab tests catalog
router.get('/lab-tests/search', async (req, res) => {
  try {
    const { 
      q = '',
      category,
      specimen_type,
      limit = 50,
      offset = 0,
      include_inactive = false
    } = req.query;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    // Full-text search
    if (q.trim()) {
      whereConditions.push(`lt.search_vector @@ websearch_to_tsquery('english', $${paramIndex})`);
      queryParams.push(q.trim());
      paramIndex++;
    }

    // Category filter
    if (category) {
      whereConditions.push(`lt.category ILIKE $${paramIndex}`);
      queryParams.push(`%${category}%`);
      paramIndex++;
    }

    // Specimen type filter
    if (specimen_type) {
      whereConditions.push(`lt.specimen_type = $${paramIndex}`);
      queryParams.push(specimen_type);
      paramIndex++;
    }

    // Active status filter
    if (!include_inactive) {
      whereConditions.push('lt.active = true');
    }

    let whereClause = whereConditions.length > 0 ? 
      'WHERE ' + whereConditions.join(' AND ') : '';

    // Build the main query
    let searchQuery = `
      SELECT 
        lt.*,
        COUNT(ltc.id) as component_count,
        ${q.trim() ? `ts_rank(lt.search_vector, websearch_to_tsquery('english', $1)) as rank,` : ''}
        CASE 
          WHEN lt.fasting_required THEN 'Fasting Required'
          ELSE NULL
        END as special_requirements
      FROM lab_tests lt
      LEFT JOIN lab_test_components ltc ON lt.id = ltc.lab_test_id
      ${whereClause}
      GROUP BY lt.id
      ORDER BY ${q.trim() ? 'rank DESC,' : ''} lt.category, lt.name
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limit, offset);

    const result = await db.query(searchQuery, queryParams);

    // Get category counts for filtering
    const categoryQuery = `
      SELECT 
        category, 
        COUNT(*) as test_count,
        COUNT(CASE WHEN active THEN 1 END) as active_count
      FROM lab_tests 
      GROUP BY category 
      ORDER BY category
    `;
    
    const categoryResult = await db.query(categoryQuery);

    res.json({
      ok: true,
      data: {
        tests: result.rows,
        categories: categoryResult.rows,
        total: result.rowCount
      }
    });
  } catch (error) {
    console.error('Error searching lab tests:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to search lab tests'
    });
  }
});

// GET /api/lab-tests/:testId - get lab test details with components
router.get('/lab-tests/:testId', async (req, res) => {
  try {
    const { testId } = req.params;

    const testQuery = `
      SELECT * FROM lab_tests WHERE id = $1
    `;

    const componentsQuery = `
      SELECT * FROM lab_test_components 
      WHERE lab_test_id = $1 
      ORDER BY sort_order, component_name
    `;

    const [testResult, componentsResult] = await Promise.all([
      db.query(testQuery, [testId]),
      db.query(componentsQuery, [testId])
    ]);

    if (testResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Lab test not found'
      });
    }

    const test = testResult.rows[0];
    test.components = componentsResult.rows;

    res.json({
      ok: true,
      data: test
    });
  } catch (error) {
    console.error('Error fetching lab test details:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch lab test details'
    });
  }
});

// GET /api/lab-tests/categories - get all test categories
router.get('/lab-tests/categories', async (req, res) => {
  try {
    const query = `
      SELECT 
        category, 
        COUNT(*) as test_count,
        COUNT(CASE WHEN active THEN 1 END) as active_count,
        array_agg(DISTINCT specimen_type) as specimen_types
      FROM lab_tests 
      GROUP BY category 
      ORDER BY category
    `;
    
    const result = await db.query(query);

    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching lab test categories:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch categories'
    });
  }
});

// GET /api/lab-tests/popular - get frequently ordered tests
router.get('/lab-tests/popular', async (req, res) => {
  try {
    const { limit = 20, category } = req.query;

    let whereClause = 'WHERE lt.active = true';
    let queryParams = [];

    if (category) {
      whereClause += ' AND lt.category = $1';
      queryParams.push(category);
    }

    const query = `
      SELECT 
        lt.*,
        COUNT(lo.id) as order_count,
        COUNT(ltc.id) as component_count
      FROM lab_tests lt
      LEFT JOIN lab_orders lo ON lt.id = lo.lab_test_id
      LEFT JOIN lab_test_components ltc ON lt.id = ltc.lab_test_id
      ${whereClause}
      GROUP BY lt.id
      HAVING COUNT(lo.id) > 0
      ORDER BY COUNT(lo.id) DESC, lt.name
      LIMIT $${queryParams.length + 1}
    `;

    queryParams.push(limit);

    const result = await db.query(query, queryParams);

    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching popular lab tests:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch popular tests'
    });
  }
});

// GET /api/lab-order-sets - get lab order sets (common test groupings)
router.get('/lab-order-sets', async (req, res) => {
  try {
    const { category } = req.query;

    let whereClause = 'WHERE los.active = true';
    let queryParams = [];

    if (category) {
      whereClause += ' AND los.category = $1';
      queryParams.push(category);
    }

    const orderSetsQuery = `
      SELECT 
        los.*,
        COUNT(lost.lab_test_id) as test_count
      FROM lab_order_sets los
      LEFT JOIN lab_order_set_tests lost ON los.id = lost.order_set_id
      ${whereClause}
      GROUP BY los.id
      ORDER BY los.category, los.name
    `;

    const result = await db.query(orderSetsQuery, queryParams);

    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching lab order sets:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch order sets'
    });
  }
});

// GET /api/lab-order-sets/:setId/tests - get tests in an order set
router.get('/lab-order-sets/:setId/tests', async (req, res) => {
  try {
    const { setId } = req.params;

    const query = `
      SELECT 
        lt.*,
        lost.sort_order,
        COUNT(ltc.id) as component_count
      FROM lab_order_set_tests lost
      JOIN lab_tests lt ON lost.lab_test_id = lt.id
      LEFT JOIN lab_test_components ltc ON lt.id = ltc.lab_test_id
      WHERE lost.order_set_id = $1 AND lt.active = true
      GROUP BY lt.id, lost.sort_order
      ORDER BY lost.sort_order, lt.name
    `;

    const result = await db.query(query, [setId]);

    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching order set tests:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch order set tests'
    });
  }
});

// GET /api/lab-tests/specimen-types - get all specimen types
router.get('/lab-tests/specimen-types', async (req, res) => {
  try {
    const query = `
      SELECT 
        specimen_type,
        COUNT(*) as test_count
      FROM lab_tests 
      WHERE active = true
      GROUP BY specimen_type 
      ORDER BY COUNT(*) DESC, specimen_type
    `;
    
    const result = await db.query(query);

    res.json({
      ok: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching specimen types:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch specimen types'
    });
  }
});

export default router;