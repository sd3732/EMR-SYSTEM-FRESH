import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import pool from '../db/index.js';

const router = express.Router();

// Get family tree data for visualization
router.get('/family-history/patients/:patientId/tree', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    
    // Get or calculate family tree positions
    await pool.query('SELECT calculate_family_tree_positions($1)', [patientId]);
    
    // Get complete tree data
    const result = await pool.query('SELECT get_family_tree_data($1) as tree_data', [patientId]);
    const treeData = result.rows[0]?.tree_data || [];
    
    // Get family health patterns for risk assessment
    const patternsResult = await pool.query(`
      SELECT 
        condition_category,
        pattern_strength,
        affected_members_count,
        calculated_risk_level,
        risk_score,
        recommended_screenings,
        genetic_counseling_recommended
      FROM family_health_patterns 
      WHERE patient_id = $1
      ORDER BY risk_score DESC
    `, [patientId]);
    
    res.json({ 
      data: {
        tree_members: treeData,
        health_patterns: patternsResult.rows,
        last_updated: new Date()
      }
    });
  } catch (error) {
    console.error('Error fetching family tree:', error);
    res.status(500).json({ error: 'Failed to fetch family tree data' });
  }
});

// Get family members for a patient
router.get('/family-history/patients/:patientId/members', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { include_conditions = true } = req.query;
    
    let query = `
      SELECT 
        fm.*,
        CASE 
          WHEN fm.is_deceased AND fm.date_of_death IS NOT NULL AND fm.date_of_birth IS NOT NULL 
          THEN EXTRACT(YEAR FROM AGE(fm.date_of_death, fm.date_of_birth))
          WHEN NOT fm.is_deceased AND fm.date_of_birth IS NOT NULL 
          THEN EXTRACT(YEAR FROM AGE(fm.date_of_birth))
          ELSE NULL
        END as current_age
    `;
    
    if (include_conditions === 'true') {
      query += `,
        (
          SELECT jsonb_agg(jsonb_build_object(
            'id', fmc.id,
            'condition_name', fmc.condition_name,
            'condition_category', fmc.condition_category,
            'severity', fmc.severity,
            'age_at_onset', fmc.age_at_onset,
            'age_at_diagnosis', fmc.age_at_diagnosis,
            'current_status', fmc.current_status,
            'genetic_relevance', fmc.genetic_relevance,
            'risk_contribution', fmc.risk_contribution,
            'notes', fmc.notes
          ))
          FROM family_medical_conditions fmc 
          WHERE fmc.family_member_id = fm.id
        ) as medical_conditions
      `;
    }
    
    query += `
      FROM family_members fm
      WHERE fm.patient_id = $1
      ORDER BY fm.generation_level, 
               CASE fm.relationship_to_patient 
                 WHEN 'self' THEN 1
                 WHEN 'father' THEN 2
                 WHEN 'mother' THEN 3
                 ELSE 4
               END,
               fm.first_name
    `;
    
    const result = await pool.query(query, [patientId]);
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching family members:', error);
    res.status(500).json({ error: 'Failed to fetch family members' });
  }
});

// Add or update family member
router.post('/family-history/patients/:patientId/members', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { patientId } = req.params;
    const {
      first_name,
      last_name,
      maiden_name,
      gender,
      date_of_birth,
      date_of_death,
      is_deceased = false,
      relationship_to_patient,
      generation_level,
      parent_id,
      spouse_id,
      is_living = true,
      contact_information = {},
      ethnicity,
      medical_conditions = []
    } = req.body;

    // Insert family member
    const memberResult = await client.query(`
      INSERT INTO family_members (
        patient_id, first_name, last_name, maiden_name, gender,
        date_of_birth, date_of_death, is_deceased, relationship_to_patient,
        generation_level, parent_id, spouse_id, is_living, contact_information,
        ethnicity, medical_history_available
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING *
    `, [
      patientId, first_name, last_name, maiden_name, gender,
      date_of_birth, date_of_death, is_deceased, relationship_to_patient,
      generation_level, parent_id, spouse_id, is_living, JSON.stringify(contact_information),
      ethnicity, medical_conditions.length > 0
    ]);

    const familyMember = memberResult.rows[0];

    // Add medical conditions if provided
    for (const condition of medical_conditions) {
      await client.query(`
        INSERT INTO family_medical_conditions (
          family_member_id, patient_id, condition_name, icd10_code,
          condition_category, severity, age_at_onset, age_at_diagnosis,
          age_at_death, is_cause_of_death, current_status, genetic_relevance,
          screening_implications, risk_contribution, notes, source_reliability
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )
      `, [
        familyMember.id, patientId, condition.condition_name, condition.icd10_code,
        condition.condition_category, condition.severity, condition.age_at_onset,
        condition.age_at_diagnosis, condition.age_at_death, condition.is_cause_of_death || false,
        condition.current_status || 'unknown', condition.genetic_relevance || 'unknown',
        JSON.stringify(condition.screening_implications || {}), condition.risk_contribution || 0,
        condition.notes, condition.source_reliability || 'patient_report'
      ]);
    }

    // Recalculate family tree positions
    await client.query('SELECT calculate_family_tree_positions($1)', [patientId]);

    // Update family health patterns
    await updateFamilyHealthPatterns(client, patientId);

    await client.query('COMMIT');

    res.status(201).json({ 
      data: familyMember,
      message: 'Family member added successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding family member:', error);
    res.status(500).json({ error: 'Failed to add family member' });
  } finally {
    client.release();
  }
});

// Update family member
router.put('/family-history/members/:memberId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { memberId } = req.params;
    const updates = req.body;

    // Get current member data
    const currentResult = await client.query(
      'SELECT * FROM family_members WHERE id = $1',
      [memberId]
    );

    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Family member not found' });
    }

    const current = currentResult.rows[0];

    // Build update query
    const allowedFields = [
      'first_name', 'last_name', 'maiden_name', 'gender', 'date_of_birth',
      'date_of_death', 'is_deceased', 'is_living', 'contact_information',
      'ethnicity', 'medical_history_available'
    ];

    const updateFields = [];
    const updateValues = [];

    Object.keys(updates).forEach(field => {
      if (allowedFields.includes(field) && updates[field] !== undefined) {
        updateFields.push(`${field} = $${updateValues.length + 1}`);
        if (field === 'contact_information') {
          updateValues.push(JSON.stringify(updates[field]));
        } else {
          updateValues.push(updates[field]);
        }
      }
    });

    if (updateFields.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updateFields.push('last_updated = CURRENT_TIMESTAMP');
    updateValues.push(memberId);

    const updateQuery = `
      UPDATE family_members 
      SET ${updateFields.join(', ')} 
      WHERE id = $${updateValues.length} 
      RETURNING *
    `;

    const updateResult = await client.query(updateQuery, updateValues);

    // Recalculate positions if relationship changed
    await client.query('SELECT calculate_family_tree_positions($1)', [current.patient_id]);

    await client.query('COMMIT');

    res.json({ data: updateResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating family member:', error);
    res.status(500).json({ error: 'Failed to update family member' });
  } finally {
    client.release();
  }
});

// Add medical condition to family member
router.post('/family-history/members/:memberId/conditions', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { memberId } = req.params;
    const {
      condition_name,
      icd10_code,
      condition_category,
      severity,
      age_at_onset,
      age_at_diagnosis,
      age_at_death,
      is_cause_of_death = false,
      current_status = 'unknown',
      genetic_relevance = 'unknown',
      screening_implications = {},
      risk_contribution = 0,
      notes,
      source_reliability = 'patient_report'
    } = req.body;

    // Get family member to get patient_id
    const memberResult = await client.query(
      'SELECT patient_id FROM family_members WHERE id = $1',
      [memberId]
    );

    if (memberResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Family member not found' });
    }

    const patientId = memberResult.rows[0].patient_id;

    // Insert condition
    const conditionResult = await client.query(`
      INSERT INTO family_medical_conditions (
        family_member_id, patient_id, condition_name, icd10_code,
        condition_category, severity, age_at_onset, age_at_diagnosis,
        age_at_death, is_cause_of_death, current_status, genetic_relevance,
        screening_implications, risk_contribution, notes, source_reliability
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING *
    `, [
      memberId, patientId, condition_name, icd10_code, condition_category,
      severity, age_at_onset, age_at_diagnosis, age_at_death, is_cause_of_death,
      current_status, genetic_relevance, JSON.stringify(screening_implications),
      risk_contribution, notes, source_reliability
    ]);

    // Update member's medical_history_available flag
    await client.query(
      'UPDATE family_members SET medical_history_available = true WHERE id = $1',
      [memberId]
    );

    // Update family health patterns
    await updateFamilyHealthPatterns(client, patientId);

    await client.query('COMMIT');

    res.status(201).json({ data: conditionResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding family medical condition:', error);
    res.status(500).json({ error: 'Failed to add medical condition' });
  } finally {
    client.release();
  }
});

// Update medical condition
router.put('/family-history/conditions/:conditionId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { conditionId } = req.params;
    const updates = req.body;

    // Get current condition
    const currentResult = await client.query(`
      SELECT fmc.*, fm.patient_id 
      FROM family_medical_conditions fmc
      JOIN family_members fm ON fmc.family_member_id = fm.id
      WHERE fmc.id = $1
    `, [conditionId]);

    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Medical condition not found' });
    }

    const current = currentResult.rows[0];

    // Build update query
    const allowedFields = [
      'condition_name', 'icd10_code', 'condition_category', 'severity',
      'age_at_onset', 'age_at_diagnosis', 'age_at_death', 'is_cause_of_death',
      'current_status', 'genetic_relevance', 'screening_implications',
      'risk_contribution', 'notes', 'source_reliability'
    ];

    const updateFields = [];
    const updateValues = [];

    Object.keys(updates).forEach(field => {
      if (allowedFields.includes(field) && updates[field] !== undefined) {
        updateFields.push(`${field} = $${updateValues.length + 1}`);
        if (field === 'screening_implications') {
          updateValues.push(JSON.stringify(updates[field]));
        } else {
          updateValues.push(updates[field]);
        }
      }
    });

    if (updateFields.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(conditionId);

    const updateQuery = `
      UPDATE family_medical_conditions 
      SET ${updateFields.join(', ')} 
      WHERE id = $${updateValues.length} 
      RETURNING *
    `;

    const updateResult = await client.query(updateQuery, updateValues);

    // Update family health patterns
    await updateFamilyHealthPatterns(client, current.patient_id);

    await client.query('COMMIT');

    res.json({ data: updateResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating family medical condition:', error);
    res.status(500).json({ error: 'Failed to update medical condition' });
  } finally {
    client.release();
  }
});

// Delete family member
router.delete('/family-history/members/:memberId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { memberId } = req.params;

    // Get patient_id before deletion
    const memberResult = await client.query(
      'SELECT patient_id FROM family_members WHERE id = $1',
      [memberId]
    );

    if (memberResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Family member not found' });
    }

    const patientId = memberResult.rows[0].patient_id;

    // Delete family member (cascade will delete conditions)
    await client.query('DELETE FROM family_members WHERE id = $1', [memberId]);

    // Recalculate family tree positions
    await client.query('SELECT calculate_family_tree_positions($1)', [patientId]);

    // Update family health patterns
    await updateFamilyHealthPatterns(client, patientId);

    await client.query('COMMIT');

    res.json({ message: 'Family member deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting family member:', error);
    res.status(500).json({ error: 'Failed to delete family member' });
  } finally {
    client.release();
  }
});

// Get family health risk assessment
router.get('/family-history/patients/:patientId/risk-assessment', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;

    const result = await pool.query(`
      SELECT 
        fra.*,
        array_agg(DISTINCT fmc.condition_name) as example_conditions,
        jsonb_agg(DISTINCT jsonb_build_object(
          'member_name', COALESCE(fm.first_name || ' ' || fm.last_name, 'Unknown'),
          'relationship', fm.relationship_to_patient,
          'condition', fmc.condition_name,
          'severity', fmc.severity,
          'age_at_onset', fmc.age_at_onset
        )) as affected_family_members
      FROM family_risk_assessment fra
      LEFT JOIN family_members fm ON fm.patient_id = fra.patient_id
      LEFT JOIN family_medical_conditions fmc ON fm.id = fmc.family_member_id 
        AND fmc.condition_category = fra.condition_category
      WHERE fra.patient_id = $1
      GROUP BY fra.patient_id, fra.condition_category, fra.affected_family_members, 
               fra.relationships_affected, fra.average_risk_contribution, 
               fra.pattern_strength, fra.risk_level
      ORDER BY 
        CASE fra.risk_level 
          WHEN 'high' THEN 1 
          WHEN 'moderate' THEN 2 
          WHEN 'low' THEN 3 
          ELSE 4 
        END,
        fra.affected_family_members DESC
    `, [patientId]);

    res.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching family risk assessment:', error);
    res.status(500).json({ error: 'Failed to fetch risk assessment' });
  }
});

// Helper function to update family health patterns
async function updateFamilyHealthPatterns(client, patientId) {
  try {
    // Delete existing patterns
    await client.query('DELETE FROM family_health_patterns WHERE patient_id = $1', [patientId]);

    // Recalculate patterns based on current family medical conditions
    const patterns = await client.query(`
      WITH condition_analysis AS (
        SELECT 
          fmc.patient_id,
          fmc.condition_category,
          COUNT(DISTINCT fmc.family_member_id) as affected_count,
          COUNT(DISTINCT CASE WHEN fm.generation_level = 1 THEN fmc.family_member_id END) as parent_sibling_count,
          COUNT(DISTINCT CASE WHEN fm.generation_level = 2 THEN fmc.family_member_id END) as grandparent_count,
          AVG(fmc.risk_contribution) as avg_risk,
          MAX(fmc.risk_contribution) as max_risk
        FROM family_medical_conditions fmc
        JOIN family_members fm ON fmc.family_member_id = fm.id
        WHERE fmc.patient_id = $1
        GROUP BY fmc.patient_id, fmc.condition_category
      )
      INSERT INTO family_health_patterns (
        patient_id, condition_category, pattern_strength, affected_members_count,
        total_relevant_members, calculated_risk_level, risk_score,
        genetic_counseling_recommended, genetic_testing_criteria_met
      )
      SELECT 
        patient_id,
        condition_category,
        CASE 
          WHEN affected_count >= 3 THEN 'strong'
          WHEN affected_count = 2 THEN 'moderate'
          ELSE 'weak'
        END,
        affected_count,
        (SELECT COUNT(*) FROM family_members WHERE patient_id = $1),
        CASE 
          WHEN parent_sibling_count >= 1 AND affected_count >= 2 THEN 'high'
          WHEN affected_count >= 2 THEN 'moderate'
          WHEN affected_count >= 1 THEN 'low'
          ELSE 'low'
        END,
        COALESCE(max_risk * 100, 0),
        CASE WHEN parent_sibling_count >= 2 OR affected_count >= 3 THEN true ELSE false END,
        CASE WHEN parent_sibling_count >= 1 AND condition_category IN ('cancer', 'genetic') THEN true ELSE false END
      FROM condition_analysis
    `, [patientId]);

    return patterns;
  } catch (error) {
    console.error('Error updating family health patterns:', error);
    throw error;
  }
}

export default router;