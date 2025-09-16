import { Router } from 'express';
import pool from '../db/index.js';

const router = Router();

/**
 * PRESCRIPTION MANAGEMENT ROUTES
 * - POST /api/prescriptions - Create new prescription
 * - POST /api/prescriptions/check-allergies - Check prescription against patient allergies
 * - POST /api/prescriptions/override - Document override decisions with reasoning
 * - GET /api/medications/:id/alternatives - Get alternative medications
 * - GET /api/patients/:id/prescriptions - Get patient's prescriptions
 * - GET /api/prescriptions/:id - Get specific prescription
 * - PUT /api/prescriptions/:id - Update prescription (refills, discontinue)
 * - GET /api/prescriptions/:id/interactions - Check drug interactions
 */

/* Create new prescription */
router.post('/prescriptions', async (req, res) => {
  try {
    const {
      patient_id,
      encounter_id,
      provider_id,
      medication_id,
      prescribed_name,
      dose,
      dose_numeric,
      dose_unit,
      route = 'PO',
      frequency,
      frequency_per_day,
      quantity,
      quantity_unit,
      refills = 0,
      duration_days,
      start_date,
      end_date,
      instructions,
      indication,
      notes
    } = req.body;

    // Validate required fields
    if (!patient_id || !medication_id || !prescribed_name || !dose || !frequency) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: patient_id, medication_id, prescribed_name, dose, frequency'
      });
    }

    // Verify patient exists
    const patientCheck = await pool.query('SELECT id FROM patients WHERE id = $1', [patient_id]);
    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Patient not found' });
    }

    // Verify medication exists
    const medicationCheck = await pool.query('SELECT id, generic_name FROM medications WHERE id = $1', [medication_id]);
    if (medicationCheck.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Medication not found' });
    }

    // Create prescription
    const result = await pool.query(`
      INSERT INTO prescriptions (
        patient_id, encounter_id, provider_id, medication_id,
        prescribed_name, dose, dose_numeric, dose_unit, route,
        frequency, frequency_per_day, quantity, quantity_unit,
        refills, duration_days, start_date, end_date,
        instructions, indication, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $3)
      RETURNING *
    `, [
      patient_id, encounter_id, provider_id, medication_id,
      prescribed_name, dose, dose_numeric, dose_unit, route,
      frequency, frequency_per_day, quantity, quantity_unit,
      refills, duration_days, start_date, end_date,
      instructions, indication, notes
    ]);

    // Get the complete prescription with medication details
    const prescriptionResult = await pool.query(`
      SELECT 
        p.*,
        m.generic_name,
        m.brand_name,
        m.drug_class,
        m.dosage_form as medication_form,
        m.controlled_substance,
        m.schedule,
        pat.first_name as patient_first_name,
        pat.last_name as patient_last_name,
        prov.first_name as provider_first_name,
        prov.last_name as provider_last_name
      FROM prescriptions p
      JOIN medications m ON p.medication_id = m.id
      JOIN patients pat ON p.patient_id = pat.id
      LEFT JOIN providers prov ON p.provider_id = prov.id
      WHERE p.id = $1
    `, [result.rows[0].id]);

    res.status(201).json({
      ok: true,
      data: prescriptionResult.rows[0]
    });

  } catch (error) {
    console.error('[prescriptions:create]', error);
    res.status(500).json({ ok: false, error: 'Failed to create prescription' });
  }
});

/* Check prescription against patient allergies */
router.post('/prescriptions/check-allergies', async (req, res) => {
  try {
    const {
      patient_id,
      medication_id,
      prescribed_name
    } = req.body;

    if (!patient_id || !medication_id) {
      return res.status(400).json({
        ok: false,
        error: 'patient_id and medication_id are required'
      });
    }

    // Get patient's active allergies
    const allergiesResult = await pool.query(`
      SELECT substance, type, reaction, severity
      FROM allergies 
      WHERE patient_id = $1 AND active = true
    `, [patient_id]);

    if (allergiesResult.rows.length === 0) {
      return res.json({
        ok: true,
        data: {
          interactions: [],
          message: 'No active allergies found for patient'
        }
      });
    }

    const allergySubstances = allergiesResult.rows.map(row => row.substance.toLowerCase());

    // Check for drug-allergy interactions using the database function
    const interactionsResult = await pool.query(`
      SELECT * FROM check_drug_allergy_interactions($1, $2)
    `, [medication_id, allergySubstances]);

    // Get medication details for context
    const medicationResult = await pool.query(`
      SELECT generic_name, brand_name, drug_class 
      FROM medications 
      WHERE id = $1
    `, [medication_id]);

    res.json({
      ok: true,
      data: {
        medication: medicationResult.rows[0] || null,
        patient_allergies: allergiesResult.rows,
        interactions: interactionsResult.rows,
        has_contraindications: interactionsResult.rows.some(row => row.contraindicated),
        highest_severity: interactionsResult.rows.length > 0 ? interactionsResult.rows[0].severity_level : null
      }
    });

  } catch (error) {
    console.error('[prescriptions:check-allergies]', error);
    res.status(500).json({ ok: false, error: 'Failed to check allergies' });
  }
});

/* Document override decisions with reasoning */
router.post('/prescriptions/override', async (req, res) => {
  try {
    const {
      patient_id,
      medication_id,
      provider_id,
      interaction_ids = [],
      override_reason,
      clinical_justification,
      monitoring_plan,
      prescribed_name,
      dose,
      frequency,
      encounter_id,
      // Standard prescription fields
      dose_numeric,
      dose_unit,
      route = 'PO',
      frequency_per_day,
      quantity,
      quantity_unit,
      refills = 0,
      duration_days,
      start_date,
      end_date,
      instructions,
      indication,
      notes
    } = req.body;

    // Validate required fields
    if (!patient_id || !medication_id || !provider_id || !override_reason) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: patient_id, medication_id, provider_id, override_reason'
      });
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create the prescription with override flag
      const prescriptionResult = await client.query(`
        INSERT INTO prescriptions (
          patient_id, encounter_id, provider_id, medication_id,
          prescribed_name, dose, dose_numeric, dose_unit, route,
          frequency, frequency_per_day, quantity, quantity_unit,
          refills, duration_days, start_date, end_date,
          instructions, indication, notes, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $3)
        RETURNING *
      `, [
        patient_id, encounter_id, provider_id, medication_id,
        prescribed_name, dose, dose_numeric, dose_unit, route,
        frequency, frequency_per_day, quantity, quantity_unit,
        refills, duration_days, start_date, end_date,
        instructions, indication, notes
      ]);

      const prescriptionId = prescriptionResult.rows[0].id;

      // Create the override record
      await client.query(`
        INSERT INTO prescription_overrides (
          prescription_id, patient_id, medication_id, provider_id,
          interaction_ids, override_reason, clinical_justification,
          monitoring_plan, override_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      `, [
        prescriptionId, patient_id, medication_id, provider_id,
        interaction_ids, override_reason, clinical_justification,
        monitoring_plan
      ]);

      await client.query('COMMIT');

      // Get complete prescription details
      const detailsResult = await client.query(`
        SELECT 
          p.*,
          m.generic_name,
          m.brand_name,
          m.drug_class,
          pat.first_name as patient_first_name,
          pat.last_name as patient_last_name,
          prov.first_name as provider_first_name,
          prov.last_name as provider_last_name,
          po.override_reason,
          po.clinical_justification,
          po.monitoring_plan
        FROM prescriptions p
        JOIN medications m ON p.medication_id = m.id
        JOIN patients pat ON p.patient_id = pat.id
        LEFT JOIN providers prov ON p.provider_id = prov.id
        LEFT JOIN prescription_overrides po ON p.id = po.prescription_id
        WHERE p.id = $1
      `, [prescriptionId]);

      res.status(201).json({
        ok: true,
        data: detailsResult.rows[0],
        message: 'Prescription created with documented override'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('[prescriptions:override]', error);
    res.status(500).json({ ok: false, error: 'Failed to create override prescription' });
  }
});

/* Get alternative medications for contraindicated drugs */
router.get('/medications/:id/alternatives', async (req, res) => {
  try {
    const medicationId = Number(req.params.id);
    const { drug_class } = req.query;

    if (!Number.isFinite(medicationId)) {
      return res.status(400).json({ ok: false, error: 'Invalid medication ID' });
    }

    // Use the database function to get alternatives
    const alternativesResult = await pool.query(`
      SELECT * FROM get_alternative_medications($1, $2)
    `, [medicationId, drug_class || null]);

    // Get the original medication details
    const originalMedResult = await pool.query(`
      SELECT generic_name, brand_name, drug_class, dosage_form
      FROM medications 
      WHERE id = $1
    `, [medicationId]);

    res.json({
      ok: true,
      data: {
        original_medication: originalMedResult.rows[0] || null,
        alternatives: alternativesResult.rows
      }
    });

  } catch (error) {
    console.error('[medications:alternatives]', error);
    res.status(500).json({ ok: false, error: 'Failed to get alternative medications' });
  }
});

/* Get patient's prescriptions */
router.get('/patients/:id/prescriptions', async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    const { 
      status = 'active',
      limit = 50,
      offset = 0,
      include_inactive = 'false'
    } = req.query;

    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    let sql = `
      SELECT 
        p.*,
        m.generic_name,
        m.brand_name,
        m.drug_class,
        m.dosage_form as medication_form,
        m.controlled_substance,
        m.schedule,
        prov.first_name as provider_first_name,
        prov.last_name as provider_last_name
      FROM prescriptions p
      JOIN medications m ON p.medication_id = m.id
      LEFT JOIN providers prov ON p.provider_id = prov.id
      WHERE p.patient_id = $1
    `;

    const params = [patientId];
    let paramCount = 1;

    // Filter by status
    if (status !== 'all') {
      if (include_inactive === 'false' && status === 'active') {
        sql += ` AND p.status = 'active'`;
      } else if (status !== 'active') {
        paramCount++;
        sql += ` AND p.status = $${paramCount}`;
        params.push(status);
      }
    }

    sql += ` ORDER BY p.created_at DESC`;

    // Add pagination
    const searchLimit = Math.min(Number(limit), 100);
    const searchOffset = Number(offset);

    paramCount++;
    sql += ` LIMIT $${paramCount}`;
    params.push(searchLimit);

    paramCount++;
    sql += ` OFFSET $${paramCount}`;
    params.push(searchOffset);

    const result = await pool.query(sql, params);

    // Get total count
    let countSql = `SELECT COUNT(*) as total FROM prescriptions WHERE patient_id = $1`;
    const countParams = [patientId];

    if (status !== 'all') {
      if (include_inactive === 'false' && status === 'active') {
        countSql += ` AND status = 'active'`;
      } else if (status !== 'active') {
        countSql += ` AND status = $2`;
        countParams.push(status);
      }
    }

    const countResult = await pool.query(countSql, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      ok: true,
      data: {
        prescriptions: result.rows,
        pagination: {
          total,
          limit: searchLimit,
          offset: searchOffset,
          hasMore: searchOffset + searchLimit < total
        }
      }
    });

  } catch (error) {
    console.error('[prescriptions:list]', error);
    res.status(500).json({ ok: false, error: 'Failed to get prescriptions' });
  }
});

/* Get specific prescription */
router.get('/prescriptions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid prescription ID' });
    }

    const result = await pool.query(`
      SELECT 
        p.*,
        m.generic_name,
        m.brand_name,
        m.drug_class,
        m.therapeutic_class,
        m.dosage_form as medication_form,
        m.controlled_substance,
        m.schedule,
        pat.first_name as patient_first_name,
        pat.last_name as patient_last_name,
        prov.first_name as provider_first_name,
        prov.last_name as provider_last_name,
        disc_prov.first_name as discontinued_by_first_name,
        disc_prov.last_name as discontinued_by_last_name
      FROM prescriptions p
      JOIN medications m ON p.medication_id = m.id
      JOIN patients pat ON p.patient_id = pat.id
      LEFT JOIN providers prov ON p.provider_id = prov.id
      LEFT JOIN providers disc_prov ON p.discontinued_by = disc_prov.id
      WHERE p.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Prescription not found' });
    }

    res.json({
      ok: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[prescriptions:get]', error);
    res.status(500).json({ ok: false, error: 'Failed to get prescription' });
  }
});

/* Update prescription */
router.put('/prescriptions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid prescription ID' });
    }

    // Check if prescription exists
    const existingResult = await pool.query('SELECT * FROM prescriptions WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Prescription not found' });
    }

    const {
      status,
      refills_remaining,
      discontinue_reason,
      notes,
      external_rx_number,
      filled_date,
      pharmacy_name,
      discontinued_by
    } = req.body;

    const updates = [];
    const params = [id];
    let paramCount = 1;

    // Handle discontinuation
    if (status === 'discontinued') {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      params.push('discontinued');

      paramCount++;
      updates.push(`discontinued_date = $${paramCount}`);
      params.push(new Date().toISOString().split('T')[0]); // Today's date

      if (discontinue_reason) {
        paramCount++;
        updates.push(`discontinue_reason = $${paramCount}`);
        params.push(discontinue_reason);
      }

      if (discontinued_by) {
        paramCount++;
        updates.push(`discontinued_by = $${paramCount}`);
        params.push(discontinued_by);
      }
    } else if (status) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      params.push(status);
    }

    // Update refills
    if (refills_remaining !== undefined) {
      paramCount++;
      updates.push(`refills_remaining = $${paramCount}`);
      params.push(refills_remaining);
    }

    // Update pharmacy information
    if (external_rx_number) {
      paramCount++;
      updates.push(`external_rx_number = $${paramCount}`);
      params.push(external_rx_number);
    }

    if (filled_date) {
      paramCount++;
      updates.push(`filled_date = $${paramCount}`);
      params.push(filled_date);
    }

    if (pharmacy_name) {
      paramCount++;
      updates.push(`pharmacy_name = $${paramCount}`);
      params.push(pharmacy_name);
    }

    // Update notes
    if (notes) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      params.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ ok: false, error: 'No valid updates provided' });
    }

    // Perform update
    const sql = `
      UPDATE prescriptions 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(sql, params);

    // Get updated prescription with details
    const detailsResult = await pool.query(`
      SELECT 
        p.*,
        m.generic_name,
        m.brand_name,
        m.drug_class,
        pat.first_name as patient_first_name,
        pat.last_name as patient_last_name,
        prov.first_name as provider_first_name,
        prov.last_name as provider_last_name
      FROM prescriptions p
      JOIN medications m ON p.medication_id = m.id
      JOIN patients pat ON p.patient_id = pat.id
      LEFT JOIN providers prov ON p.provider_id = prov.id
      WHERE p.id = $1
    `, [id]);

    res.json({
      ok: true,
      data: detailsResult.rows[0]
    });

  } catch (error) {
    console.error('[prescriptions:update]', error);
    res.status(500).json({ ok: false, error: 'Failed to update prescription' });
  }
});

/* Check drug interactions for a prescription */
router.get('/prescriptions/:id/interactions', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid prescription ID' });
    }

    // Get the prescription and patient's other active medications
    const prescriptionResult = await pool.query(`
      SELECT p.medication_id, p.patient_id
      FROM prescriptions p
      WHERE p.id = $1
    `, [id]);

    if (prescriptionResult.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Prescription not found' });
    }

    const { medication_id, patient_id } = prescriptionResult.rows[0];

    // Get patient's other active medications
    const otherMedsResult = await pool.query(`
      SELECT DISTINCT p.medication_id, m.generic_name, m.brand_name
      FROM prescriptions p
      JOIN medications m ON p.medication_id = m.id
      WHERE p.patient_id = $1 
        AND p.id != $2 
        AND p.status = 'active'
    `, [patient_id, id]);

    const otherMedIds = otherMedsResult.rows.map(row => row.medication_id);

    if (otherMedIds.length === 0) {
      return res.json({
        ok: true,
        data: {
          interactions: [],
          message: 'No other active medications to check interactions with'
        }
      });
    }

    // Check for interactions
    const interactionsResult = await pool.query(`
      SELECT 
        di.*,
        m1.generic_name as med1_generic_name,
        m1.brand_name as med1_brand_name,
        m2.generic_name as med2_generic_name,
        m2.brand_name as med2_brand_name
      FROM drug_interactions di
      JOIN medications m1 ON di.medication_1_id = m1.id
      JOIN medications m2 ON di.medication_2_id = m2.id
      WHERE di.active = true
        AND (
          (di.medication_1_id = $1 AND di.medication_2_id = ANY($2::int[]))
          OR 
          (di.medication_2_id = $1 AND di.medication_1_id = ANY($2::int[]))
        )
      ORDER BY di.severity_level DESC, di.interaction_type
    `, [medication_id, otherMedIds]);

    res.json({
      ok: true,
      data: {
        interactions: interactionsResult.rows,
        checked_against: otherMedsResult.rows
      }
    });

  } catch (error) {
    console.error('[prescriptions:interactions]', error);
    res.status(500).json({ ok: false, error: 'Failed to check interactions' });
  }
});

export default router;