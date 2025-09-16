import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import pool from '../db/index.js';

const router = express.Router();

// Get discharge templates
router.get('/discharge-summaries/templates', authenticateToken, async (req, res) => {
  try {
    const { template_type, active_only = true } = req.query;
    
    let query = 'SELECT * FROM discharge_templates WHERE 1=1';
    const params = [];
    
    if (template_type) {
      params.push(template_type);
      query += ` AND template_type = $${params.length}`;
    }
    
    if (active_only === 'true') {
      query += ' AND is_active = true';
    }
    
    query += ' ORDER BY template_name';
    
    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching discharge templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Create new discharge summary
router.post('/discharge-summaries/patients/:patientId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { patientId } = req.params;
    const {
      encounter_id,
      template_id,
      admission_date,
      discharge_date = new Date(),
      primary_diagnosis,
      secondary_diagnoses = [],
      procedures_performed = [],
      hospital_course,
      condition_at_discharge,
      functional_status,
      discharge_medications = [],
      medication_changes = [],
      medication_reconciliation_notes,
      activity_restrictions,
      diet_instructions,
      wound_care_instructions,
      patient_education_materials = [],
      warning_signs,
      when_to_seek_care,
      follow_up_appointments = [],
      lab_monitoring_needed = [],
      imaging_needed = [],
      specialist_referrals = []
    } = req.body;

    const providerId = req.user.id;

    // Get auto-populated data if encounter_id is provided
    let autoPopulatedData = {};
    if (encounter_id) {
      const autoDataResult = await client.query(
        'SELECT auto_populate_discharge_data($1, $2) as data',
        [encounter_id, patientId]
      );
      autoPopulatedData = autoDataResult.rows[0].data || {};
    }

    // Insert discharge summary
    const insertQuery = `
      INSERT INTO discharge_summaries (
        patient_id, encounter_id, template_id, provider_id,
        admission_date, discharge_date, primary_diagnosis, secondary_diagnoses,
        procedures_performed, hospital_course, condition_at_discharge, functional_status,
        discharge_medications, medication_changes, medication_reconciliation_notes,
        activity_restrictions, diet_instructions, wound_care_instructions,
        patient_education_materials, warning_signs, when_to_seek_care,
        follow_up_appointments, lab_monitoring_needed, imaging_needed, specialist_referrals
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
      ) RETURNING *
    `;

    const insertResult = await client.query(insertQuery, [
      patientId, encounter_id, template_id, providerId,
      admission_date, discharge_date, primary_diagnosis, secondary_diagnoses,
      procedures_performed, hospital_course, condition_at_discharge, functional_status,
      JSON.stringify(discharge_medications), JSON.stringify(medication_changes), medication_reconciliation_notes,
      activity_restrictions, diet_instructions, wound_care_instructions,
      patient_education_materials, warning_signs, when_to_seek_care,
      JSON.stringify(follow_up_appointments), JSON.stringify(lab_monitoring_needed), 
      JSON.stringify(imaging_needed), JSON.stringify(specialist_referrals)
    ]);

    const dischargeSummary = insertResult.rows[0];

    // Create medication reconciliation entries
    if (medication_changes && medication_changes.length > 0) {
      for (const change of medication_changes) {
        await client.query(`
          INSERT INTO medication_reconciliation (
            discharge_summary_id, medication_name, action_type, 
            previous_dosage, new_dosage, reason_for_change, 
            monitoring_required, monitoring_instructions
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          dischargeSummary.id, change.medication_name, change.action_type,
          change.previous_dosage, change.new_dosage, change.reason_for_change,
          change.monitoring_required || false, change.monitoring_instructions
        ]);
      }
    }

    // Create follow-up recommendations
    if (follow_up_appointments && follow_up_appointments.length > 0) {
      for (const appointment of follow_up_appointments) {
        await client.query(`
          INSERT INTO follow_up_recommendations (
            discharge_summary_id, appointment_type, specialty, urgency_level,
            recommended_timing, specific_instructions, provider_preference
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          dischargeSummary.id, appointment.type, appointment.specialty,
          appointment.urgency || 'routine', appointment.timing,
          appointment.instructions, appointment.provider_id
        ]);
      }
    }

    // Log creation in audit trail
    await client.query(`
      INSERT INTO discharge_summary_audit (discharge_summary_id, action, provider_id, changes)
      VALUES ($1, 'created', $2, $3)
    `, [
      dischargeSummary.id, 
      providerId, 
      JSON.stringify({ auto_populated_data: autoPopulatedData })
    ]);

    await client.query('COMMIT');

    // Fetch complete discharge summary with related data
    const completeResult = await pool.query(`
      SELECT 
        ds.*,
        dt.template_name,
        dt.template_type,
        p.first_name || ' ' || p.last_name as patient_name,
        pr.first_name || ' ' || pr.last_name as provider_name,
        (
          SELECT jsonb_agg(jsonb_build_object(
            'id', fr.id,
            'appointment_type', fr.appointment_type,
            'specialty', fr.specialty,
            'urgency_level', fr.urgency_level,
            'recommended_timing', fr.recommended_timing,
            'specific_instructions', fr.specific_instructions,
            'status', fr.status
          ))
          FROM follow_up_recommendations fr 
          WHERE fr.discharge_summary_id = ds.id
        ) as follow_up_recommendations,
        (
          SELECT jsonb_agg(jsonb_build_object(
            'medication_name', mr.medication_name,
            'action_type', mr.action_type,
            'previous_dosage', mr.previous_dosage,
            'new_dosage', mr.new_dosage,
            'reason_for_change', mr.reason_for_change,
            'monitoring_required', mr.monitoring_required,
            'monitoring_instructions', mr.monitoring_instructions
          ))
          FROM medication_reconciliation mr 
          WHERE mr.discharge_summary_id = ds.id
        ) as medication_reconciliation_details
      FROM discharge_summaries ds
      LEFT JOIN discharge_templates dt ON ds.template_id = dt.id
      LEFT JOIN patients p ON ds.patient_id = p.id
      LEFT JOIN providers pr ON ds.provider_id = pr.id
      WHERE ds.id = $1
    `, [dischargeSummary.id]);

    res.status(201).json({ data: completeResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating discharge summary:', error);
    res.status(500).json({ error: 'Failed to create discharge summary' });
  } finally {
    client.release();
  }
});

// Get discharge summaries for a patient
router.get('/discharge-summaries/patients/:patientId', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status, limit = 50 } = req.query;

    let query = `
      SELECT 
        ds.*,
        dt.template_name,
        dt.template_type,
        pr.first_name || ' ' || pr.last_name as provider_name,
        e.encounter_type,
        e.encounter_date
      FROM discharge_summaries ds
      LEFT JOIN discharge_templates dt ON ds.template_id = dt.id
      LEFT JOIN providers pr ON ds.provider_id = pr.id
      LEFT JOIN encounters e ON ds.encounter_id = e.id
      WHERE ds.patient_id = $1
    `;
    
    const params = [patientId];
    
    if (status) {
      params.push(status);
      query += ` AND ds.status = $${params.length}`;
    }
    
    query += ' ORDER BY ds.discharge_date DESC, ds.created_at DESC';
    
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    }

    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching discharge summaries:', error);
    res.status(500).json({ error: 'Failed to fetch discharge summaries' });
  }
});

// Get specific discharge summary with all details
router.get('/discharge-summaries/:summaryId', authenticateToken, async (req, res) => {
  try {
    const { summaryId } = req.params;

    const result = await pool.query(`
      SELECT 
        ds.*,
        dt.template_name,
        dt.template_type,
        dt.template_content,
        dt.default_instructions,
        p.first_name || ' ' || p.last_name as patient_name,
        p.date_of_birth,
        p.phone,
        pr.first_name || ' ' || pr.last_name as provider_name,
        e.encounter_type,
        e.encounter_date,
        (
          SELECT jsonb_agg(jsonb_build_object(
            'id', fr.id,
            'appointment_type', fr.appointment_type,
            'specialty', fr.specialty,
            'urgency_level', fr.urgency_level,
            'recommended_timing', fr.recommended_timing,
            'specific_instructions', fr.specific_instructions,
            'status', fr.status,
            'scheduled_appointment_id', fr.scheduled_appointment_id
          ))
          FROM follow_up_recommendations fr 
          WHERE fr.discharge_summary_id = ds.id
        ) as follow_up_recommendations,
        (
          SELECT jsonb_agg(jsonb_build_object(
            'medication_name', mr.medication_name,
            'action_type', mr.action_type,
            'previous_dosage', mr.previous_dosage,
            'new_dosage', mr.new_dosage,
            'reason_for_change', mr.reason_for_change,
            'monitoring_required', mr.monitoring_required,
            'monitoring_instructions', mr.monitoring_instructions
          ))
          FROM medication_reconciliation mr 
          WHERE mr.discharge_summary_id = ds.id
        ) as medication_reconciliation_details
      FROM discharge_summaries ds
      LEFT JOIN discharge_templates dt ON ds.template_id = dt.id
      LEFT JOIN patients p ON ds.patient_id = p.id
      LEFT JOIN providers pr ON ds.provider_id = pr.id
      LEFT JOIN encounters e ON ds.encounter_id = e.id
      WHERE ds.id = $1
    `, [summaryId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Discharge summary not found' });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching discharge summary:', error);
    res.status(500).json({ error: 'Failed to fetch discharge summary' });
  }
});

// Update discharge summary
router.put('/discharge-summaries/:summaryId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { summaryId } = req.params;
    const providerId = req.user.id;
    const updates = req.body;

    // Check if summary exists and is editable
    const existingResult = await client.query(
      'SELECT * FROM discharge_summaries WHERE id = $1',
      [summaryId]
    );

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Discharge summary not found' });
    }

    const existing = existingResult.rows[0];
    if (existing.status === 'finalized') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot edit finalized discharge summary' });
    }

    // Build update query dynamically
    const allowedFields = [
      'primary_diagnosis', 'secondary_diagnoses', 'procedures_performed',
      'hospital_course', 'condition_at_discharge', 'functional_status',
      'discharge_medications', 'medication_changes', 'medication_reconciliation_notes',
      'activity_restrictions', 'diet_instructions', 'wound_care_instructions',
      'patient_education_materials', 'warning_signs', 'when_to_seek_care',
      'follow_up_appointments', 'lab_monitoring_needed', 'imaging_needed', 'specialist_referrals'
    ];

    const updateFields = [];
    const updateValues = [];
    const changes = {};

    Object.keys(updates).forEach(field => {
      if (allowedFields.includes(field) && updates[field] !== undefined) {
        updateFields.push(`${field} = $${updateValues.length + 1}`);
        
        // JSON fields need to be stringified
        if (['secondary_diagnoses', 'procedures_performed', 'discharge_medications', 
             'medication_changes', 'follow_up_appointments', 'lab_monitoring_needed', 
             'imaging_needed', 'specialist_referrals', 'patient_education_materials'].includes(field)) {
          updateValues.push(JSON.stringify(updates[field]));
        } else {
          updateValues.push(updates[field]);
        }
        
        changes[field] = { from: existing[field], to: updates[field] };
      }
    });

    if (updateFields.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Add updated_at field
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(summaryId);

    const updateQuery = `
      UPDATE discharge_summaries 
      SET ${updateFields.join(', ')} 
      WHERE id = $${updateValues.length} 
      RETURNING *
    `;

    const updateResult = await client.query(updateQuery, updateValues);

    // Log update in audit trail
    await client.query(`
      INSERT INTO discharge_summary_audit (discharge_summary_id, action, provider_id, changes)
      VALUES ($1, 'updated', $2, $3)
    `, [summaryId, providerId, JSON.stringify(changes)]);

    await client.query('COMMIT');

    res.json({ data: updateResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating discharge summary:', error);
    res.status(500).json({ error: 'Failed to update discharge summary' });
  } finally {
    client.release();
  }
});

// Finalize discharge summary
router.post('/discharge-summaries/:summaryId/finalize', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { summaryId } = req.params;
    const providerId = req.user.id;

    // Update status to finalized
    const result = await client.query(`
      UPDATE discharge_summaries 
      SET status = 'finalized', finalized_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'draft'
      RETURNING *
    `, [summaryId]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Discharge summary not found or already finalized' });
    }

    // Log finalization in audit trail
    await client.query(`
      INSERT INTO discharge_summary_audit (discharge_summary_id, action, provider_id)
      VALUES ($1, 'finalized', $2)
    `, [summaryId, providerId]);

    await client.query('COMMIT');

    res.json({ 
      data: result.rows[0],
      message: 'Discharge summary finalized successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error finalizing discharge summary:', error);
    res.status(500).json({ error: 'Failed to finalize discharge summary' });
  } finally {
    client.release();
  }
});

// Send discharge summary to patient
router.post('/discharge-summaries/:summaryId/send', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { summaryId } = req.params;
    const providerId = req.user.id;
    const { delivery_method = 'email', patient_contact } = req.body;

    // Check if summary is finalized
    const summaryResult = await client.query(
      'SELECT * FROM discharge_summaries WHERE id = $1 AND status = $2',
      [summaryId, 'finalized']
    );

    if (summaryResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Discharge summary must be finalized before sending' });
    }

    // Update sent status
    const updateResult = await client.query(`
      UPDATE discharge_summaries 
      SET sent_to_patient = true, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [summaryId]);

    // Log sending in audit trail
    await client.query(`
      INSERT INTO discharge_summary_audit (discharge_summary_id, action, provider_id, changes)
      VALUES ($1, 'sent', $2, $3)
    `, [
      summaryId, 
      providerId, 
      JSON.stringify({ delivery_method, patient_contact })
    ]);

    await client.query('COMMIT');

    // TODO: Integrate with actual email/SMS/print service
    res.json({ 
      data: updateResult.rows[0],
      message: `Discharge summary sent successfully via ${delivery_method}`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error sending discharge summary:', error);
    res.status(500).json({ error: 'Failed to send discharge summary' });
  } finally {
    client.release();
  }
});

// Get patient education materials
router.get('/discharge-summaries/education-materials', authenticateToken, async (req, res) => {
  try {
    const { category, condition_code, medication_name, language = 'en' } = req.query;

    let query = `
      SELECT * FROM patient_education_materials 
      WHERE is_active = true AND $1 = ANY(languages)
    `;
    const params = [language];

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (condition_code) {
      params.push(condition_code);
      query += ` AND $${params.length} = ANY(condition_codes)`;
    }

    if (medication_name) {
      params.push(medication_name.toLowerCase());
      query += ` AND $${params.length} ILIKE ANY(medication_names)`;
    }

    query += ' ORDER BY title';

    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching education materials:', error);
    res.status(500).json({ error: 'Failed to fetch education materials' });
  }
});

// Get discharge summary metrics and analytics
router.get('/discharge-summaries/analytics/metrics', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, provider_id } = req.query;

    let query = `
      SELECT 
        template_type,
        COUNT(*) as total_summaries,
        COUNT(CASE WHEN status = 'finalized' THEN 1 END) as finalized_count,
        COUNT(CASE WHEN sent_to_patient = true THEN 1 END) as sent_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (finalized_at - created_at))/3600), 2) as avg_completion_hours,
        COUNT(DISTINCT provider_id) as providers_count
      FROM discharge_summaries ds
      JOIN discharge_templates dt ON ds.template_id = dt.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) {
      params.push(start_date);
      query += ` AND ds.discharge_date >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      query += ` AND ds.discharge_date <= $${params.length}`;
    }

    if (provider_id) {
      params.push(provider_id);
      query += ` AND ds.provider_id = $${params.length}`;
    }

    query += ' GROUP BY template_type ORDER BY total_summaries DESC';

    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching discharge summary metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

export default router;