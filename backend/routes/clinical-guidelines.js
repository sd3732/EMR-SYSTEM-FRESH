import { Router } from 'express';
import pool from '../db/index.js';

const router = Router();

/**
 * CLINICAL GUIDELINES API ROUTES
 * - GET /api/patients/:id/guidelines - Get applicable guidelines for patient
 * - GET /api/patients/:id/overdue-screenings - Get overdue screenings for patient
 * - GET /api/patients/:id/preventive-care-score - Get preventive care score
 * - POST /api/patients/:id/guidelines/:guidelineId/complete - Mark guideline as completed
 * - POST /api/patients/:id/guidelines/:guidelineId/defer - Defer guideline with reason
 * - GET /api/patients/:id/vaccination-schedule - Get vaccination schedule
 * - POST /api/patients/:id/vaccinations - Record vaccination
 * - GET /api/clinical-guidelines - Get all clinical guidelines
 * - GET /api/clinical-guidelines/categories - Get guideline categories
 */

/* Get applicable clinical guidelines for a patient */
router.get('/patients/:id/guidelines', async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    const { category, priority_level, include_completed = 'false' } = req.query;

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    let sql = `SELECT * FROM get_applicable_guidelines($1)`;
    const params = [patientId];
    let paramCount = 1;

    // Apply filters
    let whereConditions = [];
    
    if (category) {
      whereConditions.push(`category = $${++paramCount}`);
      params.push(category);
    }

    if (priority_level) {
      whereConditions.push(`priority_level = $${++paramCount}`);
      params.push(Number(priority_level));
    }

    if (include_completed === 'false') {
      whereConditions.push(`status != 'completed'`);
    }

    if (whereConditions.length > 0) {
      sql = `SELECT * FROM (${sql}) filtered WHERE ${whereConditions.join(' AND ')}`;
    }

    sql += ` ORDER BY priority_level ASC, due_date ASC`;

    const result = await pool.query(sql, params);

    res.json({
      ok: true,
      data: result.rows
    });

  } catch (error) {
    console.error('[clinical-guidelines:get-patient-guidelines]', error);
    res.status(500).json({ ok: false, error: 'Failed to get patient guidelines' });
  }
});

/* Get overdue screenings for a patient */
router.get('/patients/:id/overdue-screenings', async (req, res) => {
  try {
    const patientId = Number(req.params.id);

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    const result = await pool.query(`
      SELECT * FROM get_overdue_screenings($1)
    `, [patientId]);

    res.json({
      ok: true,
      data: result.rows
    });

  } catch (error) {
    console.error('[clinical-guidelines:overdue-screenings]', error);
    res.status(500).json({ ok: false, error: 'Failed to get overdue screenings' });
  }
});

/* Get preventive care score for a patient */
router.get('/patients/:id/preventive-care-score', async (req, res) => {
  try {
    const patientId = Number(req.params.id);

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    const result = await pool.query(`
      SELECT * FROM calculate_preventive_care_score($1)
    `, [patientId]);

    if (result.rows.length === 0) {
      return res.json({
        ok: true,
        data: {
          total_guidelines: 0,
          completed_count: 0,
          overdue_count: 0,
          score_percentage: 100,
          score_grade: 'N/A'
        }
      });
    }

    res.json({
      ok: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[clinical-guidelines:preventive-care-score]', error);
    res.status(500).json({ ok: false, error: 'Failed to calculate preventive care score' });
  }
});

/* Mark guideline as completed */
router.post('/patients/:id/guidelines/:guidelineId/complete', async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    const guidelineId = Number(req.params.guidelineId);
    const {
      completed_date = new Date().toISOString().split('T')[0],
      provider_id,
      notes,
      result_summary
    } = req.body;

    if (!Number.isFinite(patientId) || !Number.isFinite(guidelineId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient or guideline ID' });
    }

    // Mark guideline as completed
    await pool.query(`
      SELECT update_patient_guideline_status($1, $2, 'completed', $3, $4, $5)
    `, [patientId, guidelineId, completed_date, provider_id, notes]);

    // If result summary provided, update it
    if (result_summary) {
      await pool.query(`
        UPDATE patient_guideline_status 
        SET result_summary = $3
        WHERE patient_id = $1 AND guideline_id = $2
      `, [patientId, guidelineId, result_summary]);
    }

    // Get updated guideline information
    const result = await pool.query(`
      SELECT 
        pgs.*,
        cg.name,
        cg.guideline_code,
        cg.category
      FROM patient_guideline_status pgs
      JOIN clinical_guidelines cg ON pgs.guideline_id = cg.id
      WHERE pgs.patient_id = $1 AND pgs.guideline_id = $2
    `, [patientId, guidelineId]);

    res.json({
      ok: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[clinical-guidelines:complete-guideline]', error);
    res.status(500).json({ ok: false, error: 'Failed to mark guideline as completed' });
  }
});

/* Defer guideline with reason */
router.post('/patients/:id/guidelines/:guidelineId/defer', async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    const guidelineId = Number(req.params.guidelineId);
    const {
      defer_reason,
      defer_until_date,
      provider_id,
      notes
    } = req.body;

    if (!Number.isFinite(patientId) || !Number.isFinite(guidelineId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient or guideline ID' });
    }

    if (!defer_reason) {
      return res.status(400).json({ ok: false, error: 'Defer reason is required' });
    }

    // Update guideline status to deferred
    await pool.query(`
      INSERT INTO patient_guideline_status (
        patient_id, guideline_id, status, due_date, override_reason,
        override_date, override_provider_id, override_notes
      ) VALUES ($1, $2, 'deferred', $3, $4, CURRENT_DATE, $5, $6)
      ON CONFLICT (patient_id, guideline_id) 
      DO UPDATE SET
        status = 'deferred',
        due_date = EXCLUDED.due_date,
        override_reason = EXCLUDED.override_reason,
        override_date = CURRENT_DATE,
        override_provider_id = EXCLUDED.override_provider_id,
        override_notes = EXCLUDED.override_notes,
        updated_at = CURRENT_TIMESTAMP
    `, [
      patientId, 
      guidelineId, 
      defer_until_date || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 90 days default
      defer_reason,
      provider_id,
      notes
    ]);

    // Get updated guideline information
    const result = await pool.query(`
      SELECT 
        pgs.*,
        cg.name,
        cg.guideline_code,
        cg.category
      FROM patient_guideline_status pgs
      JOIN clinical_guidelines cg ON pgs.guideline_id = cg.id
      WHERE pgs.patient_id = $1 AND pgs.guideline_id = $2
    `, [patientId, guidelineId]);

    res.json({
      ok: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[clinical-guidelines:defer-guideline]', error);
    res.status(500).json({ ok: false, error: 'Failed to defer guideline' });
  }
});

/* Get vaccination schedule for a patient */
router.get('/patients/:id/vaccination-schedule', async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    const { include_completed = 'true' } = req.query;

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    let sql = `SELECT * FROM get_patient_vaccination_schedule($1)`;
    const params = [patientId];

    if (include_completed === 'false') {
      sql += ` WHERE status != 'completed'`;
    }

    sql += ` ORDER BY due_date ASC, vaccine_name, dose_number`;

    const result = await pool.query(sql, params);

    // Get patient's vaccination history
    const historyResult = await pool.query(`
      SELECT 
        pv.*,
        p.first_name as provider_first_name,
        p.last_name as provider_last_name
      FROM patient_vaccinations pv
      LEFT JOIN providers p ON pv.administered_provider_id = p.id
      WHERE pv.patient_id = $1
      ORDER BY pv.administered_date DESC
    `, [patientId]);

    res.json({
      ok: true,
      data: {
        schedule: result.rows,
        history: historyResult.rows
      }
    });

  } catch (error) {
    console.error('[clinical-guidelines:vaccination-schedule]', error);
    res.status(500).json({ ok: false, error: 'Failed to get vaccination schedule' });
  }
});

/* Record vaccination */
router.post('/patients/:id/vaccinations', async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    const {
      vaccine_name,
      vaccine_code,
      lot_number,
      manufacturer,
      expiration_date,
      administered_date = new Date().toISOString().split('T')[0],
      administered_provider_id,
      route = 'IM',
      site = 'deltoid',
      dose = '0.5mL',
      dose_number,
      series_complete = false,
      adverse_reaction,
      reaction_severity = 'none',
      notes
    } = req.body;

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    if (!vaccine_name || !administered_date) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Vaccine name and administered date are required' 
      });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Insert vaccination record
      const result = await client.query(`
        INSERT INTO patient_vaccinations (
          patient_id, vaccine_name, vaccine_code, lot_number, manufacturer,
          expiration_date, administered_date, administered_provider_id,
          route, site, dose, dose_number, series_complete,
          adverse_reaction, reaction_severity, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
      `, [
        patientId, vaccine_name, vaccine_code, lot_number, manufacturer,
        expiration_date, administered_date, administered_provider_id,
        route, site, dose, dose_number, series_complete,
        adverse_reaction, reaction_severity, notes
      ]);

      // Calculate next dose due date if part of a series
      if (dose_number && !series_complete) {
        const nextDoseResult = await client.query(`
          SELECT 
            recommended_interval_weeks,
            (dose_number + 1) as next_dose_number,
            total_doses
          FROM vaccination_schedules
          WHERE vaccine_name = $1 AND dose_number = $2 + 1
          LIMIT 1
        `, [vaccine_name, dose_number]);

        if (nextDoseResult.rows.length > 0) {
          const nextDose = nextDoseResult.rows[0];
          const nextDueDate = new Date(administered_date);
          nextDueDate.setDate(nextDueDate.getDate() + (nextDose.recommended_interval_weeks * 7));

          await client.query(`
            UPDATE patient_vaccinations 
            SET next_dose_due_date = $2,
                next_dose_overdue_date = $3
            WHERE id = $1
          `, [
            result.rows[0].id,
            nextDueDate.toISOString().split('T')[0],
            new Date(nextDueDate.getTime() + (28 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0] // 4 weeks overdue
          ]);
        }
      }

      await client.query('COMMIT');

      // Get complete vaccination record with provider info
      const completeResult = await client.query(`
        SELECT 
          pv.*,
          p.first_name as provider_first_name,
          p.last_name as provider_last_name
        FROM patient_vaccinations pv
        LEFT JOIN providers p ON pv.administered_provider_id = p.id
        WHERE pv.id = $1
      `, [result.rows[0].id]);

      res.status(201).json({
        ok: true,
        data: completeResult.rows[0]
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('[clinical-guidelines:record-vaccination]', error);
    res.status(500).json({ ok: false, error: 'Failed to record vaccination' });
  }
});

/* Get all clinical guidelines */
router.get('/clinical-guidelines', async (req, res) => {
  try {
    const { 
      category, 
      active_only = 'true',
      min_age,
      max_age,
      gender,
      limit = 100,
      offset = 0 
    } = req.query;

    let sql = `
      SELECT 
        id, guideline_code, name, description, category,
        min_age, max_age, gender, interval_months, interval_description,
        start_age, priority_level, patient_instructions, provider_notes,
        evidence_level, source_organization, active
      FROM clinical_guidelines
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (active_only === 'true') {
      sql += ` AND active = true`;
    }

    if (category) {
      sql += ` AND category = $${++paramCount}`;
      params.push(category);
    }

    if (min_age) {
      sql += ` AND (min_age IS NULL OR min_age >= $${++paramCount})`;
      params.push(Number(min_age));
    }

    if (max_age) {
      sql += ` AND (max_age IS NULL OR max_age <= $${++paramCount})`;
      params.push(Number(max_age));
    }

    if (gender && gender !== 'any') {
      sql += ` AND (gender = 'any' OR gender = $${++paramCount})`;
      params.push(gender);
    }

    sql += ` ORDER BY category, priority_level, start_age`;

    // Add pagination
    sql += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(Number(limit), Number(offset));

    const result = await pool.query(sql, params);

    res.json({
      ok: true,
      data: result.rows
    });

  } catch (error) {
    console.error('[clinical-guidelines:list]', error);
    res.status(500).json({ ok: false, error: 'Failed to get clinical guidelines' });
  }
});

/* Get guideline categories */
router.get('/clinical-guidelines/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        category,
        COUNT(*) as guideline_count,
        COUNT(CASE WHEN active = true THEN 1 END) as active_count,
        MIN(min_age) as min_age_range,
        MAX(max_age) as max_age_range
      FROM clinical_guidelines
      GROUP BY category
      ORDER BY category
    `);

    res.json({
      ok: true,
      data: result.rows
    });

  } catch (error) {
    console.error('[clinical-guidelines:categories]', error);
    res.status(500).json({ ok: false, error: 'Failed to get guideline categories' });
  }
});

/* Run daily maintenance on guideline statuses */
router.post('/clinical-guidelines/maintenance', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT maintain_guideline_statuses() as updated_count
    `);

    res.json({
      ok: true,
      data: {
        updated_count: result.rows[0].updated_count,
        message: 'Guideline maintenance completed successfully'
      }
    });

  } catch (error) {
    console.error('[clinical-guidelines:maintenance]', error);
    res.status(500).json({ ok: false, error: 'Failed to run guideline maintenance' });
  }
});

export default router;