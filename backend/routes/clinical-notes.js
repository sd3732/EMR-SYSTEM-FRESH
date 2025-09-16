import { Router } from 'express';
import pool from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';

const router = Router();

/**
 * CLINICAL NOTES API ROUTES
 * - GET /api/encounters/:id/notes - Get clinical notes for encounter
 * - POST /api/encounters/:id/notes - Create clinical notes for encounter  
 * - PUT /api/encounters/:id/notes/:noteId - Update clinical notes
 * - POST /api/encounters/:id/notes/:noteId/finalize - Finalize clinical notes
 * - POST /api/encounters/:id/notes/:noteId/amend - Create amended version
 * - GET /api/notes/search - Search clinical notes
 */

/* Get clinical notes for an encounter */
router.get('/encounters/:encounterId/notes', authenticateToken, checkPermission('visits:read'), async (req, res) => {
  try {
    const encounterId = Number(req.params.encounterId);
    if (!Number.isFinite(encounterId)) {
      return res.status(400).json({ ok: false, error: 'Invalid encounter ID' });
    }

    const result = await pool.query(`
      SELECT 
        cn.*,
        ct.name as template_name,
        ct.visit_type as template_visit_type,
        u_created.first_name as created_by_first_name,
        u_created.last_name as created_by_last_name,
        u_updated.first_name as updated_by_first_name,
        u_updated.last_name as updated_by_last_name,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        prov.first_name as provider_first_name,
        prov.last_name as provider_last_name
      FROM clinical_notes cn
      LEFT JOIN clinical_templates ct ON cn.template_id = ct.id
      LEFT JOIN users u_created ON cn.created_by = u_created.id
      LEFT JOIN users u_updated ON cn.updated_by = u_updated.id
      LEFT JOIN patients p ON cn.patient_id = p.id
      LEFT JOIN providers prov ON cn.provider_id = prov.id
      WHERE cn.encounter_id = $1
      ORDER BY cn.version DESC, cn.created_at DESC
    `, [encounterId]);

    res.json({
      ok: true,
      data: result.rows
    });

  } catch (error) {
    console.error('[clinical-notes:get]', error);
    res.status(500).json({ ok: false, error: 'Failed to get clinical notes' });
  }
});

/* Create clinical notes for an encounter */
router.post('/encounters/:encounterId/notes', authenticateToken, checkPermission('visits:write'), async (req, res) => {
  try {
    const encounterId = Number(req.params.encounterId);
    if (!Number.isFinite(encounterId)) {
      return res.status(400).json({ ok: false, error: 'Invalid encounter ID' });
    }

    const {
      patient_id,
      provider_id,
      subjective,
      objective,
      assessment,
      plan,
      visit_type,
      template_id,
      status = 'draft'
    } = req.body;

    // Validate required fields
    if (!patient_id) {
      return res.status(400).json({ ok: false, error: 'Patient ID is required' });
    }

    // Verify encounter exists and belongs to patient
    const encounterCheck = await pool.query(
      'SELECT patient_id FROM encounters WHERE id = $1',
      [encounterId]
    );
    
    if (encounterCheck.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Encounter not found' });
    }
    
    if (encounterCheck.rows[0].patient_id !== patient_id) {
      return res.status(400).json({ ok: false, error: 'Encounter does not belong to specified patient' });
    }

    // Create the clinical note
    const result = await pool.query(`
      INSERT INTO clinical_notes (
        encounter_id, patient_id, provider_id,
        subjective, objective, assessment, plan,
        visit_type, template_id, status,
        created_by, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
      RETURNING *
    `, [
      encounterId, patient_id, provider_id,
      subjective, objective, assessment, plan,
      visit_type, template_id, status,
      req.user?.userId // from auth middleware
    ]);

    // Track template usage if template was used
    if (template_id) {
      await pool.query('SELECT track_template_usage($1)', [template_id]);
    }

    // Get the complete note with joined data
    const noteResult = await pool.query(`
      SELECT 
        cn.*,
        ct.name as template_name,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        prov.first_name as provider_first_name,
        prov.last_name as provider_last_name
      FROM clinical_notes cn
      LEFT JOIN clinical_templates ct ON cn.template_id = ct.id
      LEFT JOIN patients p ON cn.patient_id = p.id
      LEFT JOIN providers prov ON cn.provider_id = prov.id
      WHERE cn.id = $1
    `, [result.rows[0].id]);

    res.status(201).json({
      ok: true,
      data: noteResult.rows[0]
    });

  } catch (error) {
    console.error('[clinical-notes:create]', error);
    res.status(500).json({ ok: false, error: 'Failed to create clinical notes' });
  }
});

/* Update clinical notes */
router.put('/encounters/:encounterId/notes/:noteId', authenticateToken, checkPermission('visits:write'), async (req, res) => {
  try {
    const encounterId = Number(req.params.encounterId);
    const noteId = Number(req.params.noteId);
    
    if (!Number.isFinite(encounterId) || !Number.isFinite(noteId)) {
      return res.status(400).json({ ok: false, error: 'Invalid encounter or note ID' });
    }

    const {
      subjective,
      objective,
      assessment,
      plan,
      visit_type,
      status
    } = req.body;

    // Check if note exists and belongs to encounter
    const existingNote = await pool.query(
      'SELECT * FROM clinical_notes WHERE id = $1 AND encounter_id = $2',
      [noteId, encounterId]
    );

    if (existingNote.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Clinical note not found' });
    }

    const note = existingNote.rows[0];

    // Only allow updates to draft notes (finalized notes require amendment)
    if (note.status === 'final') {
      return res.status(400).json({ 
        ok: false, 
        error: 'Cannot update finalized notes. Use amendment endpoint instead.' 
      });
    }

    // Build dynamic update query
    const updates = [];
    const params = [noteId];
    let paramCount = 1;

    if (subjective !== undefined) {
      paramCount++;
      updates.push(`subjective = $${paramCount}`);
      params.push(subjective);
    }
    if (objective !== undefined) {
      paramCount++;
      updates.push(`objective = $${paramCount}`);
      params.push(objective);
    }
    if (assessment !== undefined) {
      paramCount++;
      updates.push(`assessment = $${paramCount}`);
      params.push(assessment);
    }
    if (plan !== undefined) {
      paramCount++;
      updates.push(`plan = $${paramCount}`);
      params.push(plan);
    }
    if (visit_type !== undefined) {
      paramCount++;
      updates.push(`visit_type = $${paramCount}`);
      params.push(visit_type);
    }
    if (status !== undefined) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ ok: false, error: 'No valid updates provided' });
    }

    // Add updated_by and updated_at
    paramCount++;
    updates.push(`updated_by = $${paramCount}`);
    params.push(req.user?.userId);

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const sql = `
      UPDATE clinical_notes 
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(sql, params);

    // Get the complete updated note
    const noteResult = await pool.query(`
      SELECT 
        cn.*,
        ct.name as template_name,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        prov.first_name as provider_first_name,
        prov.last_name as provider_last_name
      FROM clinical_notes cn
      LEFT JOIN clinical_templates ct ON cn.template_id = ct.id
      LEFT JOIN patients p ON cn.patient_id = p.id
      LEFT JOIN providers prov ON cn.provider_id = prov.id
      WHERE cn.id = $1
    `, [result.rows[0].id]);

    res.json({
      ok: true,
      data: noteResult.rows[0]
    });

  } catch (error) {
    console.error('[clinical-notes:update]', error);
    res.status(500).json({ ok: false, error: 'Failed to update clinical notes' });
  }
});

/* Finalize clinical notes */
router.post('/encounters/:encounterId/notes/:noteId/finalize', authenticateToken, checkPermission('visits:write'), async (req, res) => {
  try {
    const noteId = Number(req.params.noteId);
    const userId = req.user?.userId;

    if (!Number.isFinite(noteId)) {
      return res.status(400).json({ ok: false, error: 'Invalid note ID' });
    }

    const result = await pool.query('SELECT finalize_clinical_note($1, $2)', [noteId, userId]);
    
    if (!result.rows[0].finalize_clinical_note) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Note not found or already finalized' 
      });
    }

    // Return the finalized note
    const noteResult = await pool.query(`
      SELECT 
        cn.*,
        ct.name as template_name,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        prov.first_name as provider_first_name,
        prov.last_name as provider_last_name
      FROM clinical_notes cn
      LEFT JOIN clinical_templates ct ON cn.template_id = ct.id
      LEFT JOIN patients p ON cn.patient_id = p.id
      LEFT JOIN providers prov ON cn.provider_id = prov.id
      WHERE cn.id = $1
    `, [noteId]);

    res.json({
      ok: true,
      data: noteResult.rows[0]
    });

  } catch (error) {
    console.error('[clinical-notes:finalize]', error);
    res.status(500).json({ ok: false, error: 'Failed to finalize clinical notes' });
  }
});

/* Create amended version of clinical notes */
router.post('/encounters/:encounterId/notes/:noteId/amend', authenticateToken, checkPermission('visits:write'), async (req, res) => {
  try {
    const noteId = Number(req.params.noteId);
    const userId = req.user?.userId;

    if (!Number.isFinite(noteId)) {
      return res.status(400).json({ ok: false, error: 'Invalid note ID' });
    }

    const {
      subjective,
      objective,
      assessment,
      plan
    } = req.body;

    const result = await pool.query(
      'SELECT amend_clinical_note($1, $2, $3, $4, $5, $6)',
      [noteId, subjective, objective, assessment, plan, userId]
    );

    const newNoteId = result.rows[0].amend_clinical_note;

    // Get the amended note
    const noteResult = await pool.query(`
      SELECT 
        cn.*,
        ct.name as template_name,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        prov.first_name as provider_first_name,
        prov.last_name as provider_last_name
      FROM clinical_notes cn
      LEFT JOIN clinical_templates ct ON cn.template_id = ct.id
      LEFT JOIN patients p ON cn.patient_id = p.id
      LEFT JOIN providers prov ON cn.provider_id = prov.id
      WHERE cn.id = $1
    `, [newNoteId]);

    res.status(201).json({
      ok: true,
      data: noteResult.rows[0]
    });

  } catch (error) {
    console.error('[clinical-notes:amend]', error);
    res.status(500).json({ ok: false, error: 'Failed to create amended note' });
  }
});

/* Search clinical notes */
router.get('/notes/search', authenticateToken, checkPermission('visits:read'), async (req, res) => {
  try {
    const {
      q: query,
      patient_id,
      provider_id,
      visit_type,
      status,
      date_from,
      date_to,
      limit = 50,
      offset = 0
    } = req.query;

    let sql = `
      SELECT 
        cn.id,
        cn.encounter_id,
        cn.patient_id,
        cn.provider_id,
        cn.visit_type,
        cn.status,
        cn.created_at,
        cn.finalized_at,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        prov.first_name as provider_first_name,
        prov.last_name as provider_last_name,
        -- Search ranking if query provided
        ${query ? "ts_rank(to_tsvector('english', COALESCE(cn.subjective, '') || ' ' || COALESCE(cn.objective, '') || ' ' || COALESCE(cn.assessment, '') || ' ' || COALESCE(cn.plan, '')), websearch_to_tsquery('english', $1)) as rank" : '0 as rank'}
      FROM clinical_notes cn
      LEFT JOIN patients p ON cn.patient_id = p.id
      LEFT JOIN providers prov ON cn.provider_id = prov.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    // Add search query
    if (query) {
      paramCount++;
      sql += ` AND to_tsvector('english', COALESCE(cn.subjective, '') || ' ' || COALESCE(cn.objective, '') || ' ' || COALESCE(cn.assessment, '') || ' ' || COALESCE(cn.plan, '')) @@ websearch_to_tsquery('english', $${paramCount})`;
      params.push(query);
    }

    // Filter by patient
    if (patient_id) {
      paramCount++;
      sql += ` AND cn.patient_id = $${paramCount}`;
      params.push(Number(patient_id));
    }

    // Filter by provider
    if (provider_id) {
      paramCount++;
      sql += ` AND cn.provider_id = $${paramCount}`;
      params.push(Number(provider_id));
    }

    // Filter by visit type
    if (visit_type) {
      paramCount++;
      sql += ` AND cn.visit_type = $${paramCount}`;
      params.push(visit_type);
    }

    // Filter by status
    if (status) {
      paramCount++;
      sql += ` AND cn.status = $${paramCount}`;
      params.push(status);
    }

    // Date range filters
    if (date_from) {
      paramCount++;
      sql += ` AND cn.created_at >= $${paramCount}`;
      params.push(date_from);
    }
    if (date_to) {
      paramCount++;
      sql += ` AND cn.created_at <= $${paramCount}`;
      params.push(date_to);
    }

    // Order by relevance if searching, otherwise by date
    if (query) {
      sql += ` ORDER BY rank DESC, cn.created_at DESC`;
    } else {
      sql += ` ORDER BY cn.created_at DESC`;
    }

    // Add pagination
    paramCount++;
    sql += ` LIMIT $${paramCount}`;
    params.push(Math.min(Number(limit), 100));

    paramCount++;
    sql += ` OFFSET $${paramCount}`;
    params.push(Number(offset));

    const result = await pool.query(sql, params);

    res.json({
      ok: true,
      data: {
        notes: result.rows,
        pagination: {
          limit: Math.min(Number(limit), 100),
          offset: Number(offset),
          hasMore: result.rows.length === Math.min(Number(limit), 100)
        }
      }
    });

  } catch (error) {
    console.error('[clinical-notes:search]', error);
    res.status(500).json({ ok: false, error: 'Failed to search clinical notes' });
  }
});

export default router;