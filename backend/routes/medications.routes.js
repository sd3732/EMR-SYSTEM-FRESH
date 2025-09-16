// Medication API Routes for EMR System
// Provides endpoints for medication search, interaction checking, and prescribing
import { Router } from 'express';
import pool from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';
import prescriptionService, { SafetyAlert } from '../services/prescription.service.js';
import drugInteractionService from '../services/drug-interaction.service.js';
import { cacheGet, invalidateCache, addCacheHeaders } from '../middleware/cache.middleware.js';

const router = Router();

/**
 * Search medications by name or other criteria
 * GET /api/medications/search?q=aspirin&limit=20
 */
router.get('/medications/search', 
  authenticateToken, 
  checkPermission('medications:read'),
  addCacheHeaders(),
  cacheGet('medications-search'),
  async (req, res) => {
    try {
      const { 
        q = '', 
        limit = 50, 
        drug_class, 
        therapeutic_class,
        controlled_only = false 
      } = req.query;

      if (!q && !drug_class && !therapeutic_class) {
        return res.status(400).json({
          ok: false,
          error: 'Search query (q), drug_class, or therapeutic_class is required'
        });
      }

      let sql = `
        SELECT 
          id,
          generic_name,
          brand_name,
          rxcui,
          drug_class,
          therapeutic_class,
          dosage_form,
          strength,
          controlled_substance,
          schedule,
          active
        FROM medications 
        WHERE active = true
      `;

      const params = [];
      let paramCount = 0;

      // Add search conditions
      if (q) {
        paramCount++;
        sql += ` AND (
          generic_name ILIKE $${paramCount}
          OR brand_name ILIKE $${paramCount + 1}
          OR search_vector @@ plainto_tsquery('english', $${paramCount + 2})
        )`;
        params.push(`%${q}%`, `%${q}%`, q);
        paramCount += 2;
      }

      if (drug_class) {
        paramCount++;
        sql += ` AND drug_class = $${paramCount}`;
        params.push(drug_class);
      }

      if (therapeutic_class) {
        paramCount++;
        sql += ` AND therapeutic_class = $${paramCount}`;
        params.push(therapeutic_class);
      }

      if (controlled_only === 'true') {
        sql += ` AND controlled_substance = true`;
      }

      sql += ` ORDER BY 
        CASE 
          WHEN generic_name ILIKE $${paramCount + 1} THEN 1
          WHEN brand_name ILIKE $${paramCount + 2} THEN 2
          ELSE 3
        END,
        generic_name
        LIMIT $${paramCount + 3}`;
      
      params.push(`${q}%`, `${q}%`, parseInt(limit, 10));

      const startTime = Date.now();
      const result = await pool.query(sql, params);
      const queryTime = Date.now() - startTime;

      res.json({
        ok: true,
        data: result.rows,
        meta: {
          total: result.rows.length,
          query_time_ms: queryTime,
          search_terms: { q, drug_class, therapeutic_class },
          controlled_only
        }
      });

    } catch (error) {
      console.error('[medications:search] Error:', error);
      res.status(500).json({
        ok: false,
        error: 'Medication search failed'
      });
    }
  }
);

/**
 * Check drug interactions for multiple medications
 * POST /api/medications/check-interactions
 * Body: { medicationIds: [1, 2, 3], patientId?: 123 }
 */
router.post('/medications/check-interactions',
  authenticateToken,
  checkPermission('medications:read'),
  async (req, res) => {
    try {
      const { medicationIds, patientId } = req.body;
      const userId = req.user.id;

      if (!medicationIds || !Array.isArray(medicationIds) || medicationIds.length < 2) {
        return res.status(400).json({
          ok: false,
          error: 'At least 2 medication IDs are required'
        });
      }

      // Check for invalid IDs
      const validIds = medicationIds.filter(id => Number.isInteger(id) && id > 0);
      if (validIds.length !== medicationIds.length) {
        return res.status(400).json({
          ok: false,
          error: 'All medication IDs must be positive integers'
        });
      }

      const interactions = await prescriptionService.checkMultipleDrugInteractions(
        validIds, 
        userId, 
        patientId
      );

      res.json({
        ok: true,
        data: interactions,
        meta: {
          medicationCount: validIds.length,
          patientId: patientId || null,
          checkTime: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('[medications:check-interactions] Error:', error);
      res.status(500).json({
        ok: false,
        error: 'Drug interaction check failed'
      });
    }
  }
);

/**
 * Get alternative medications for a specific drug
 * GET /api/medications/:id/alternatives?reason=interaction
 */
router.get('/medications/:id/alternatives',
  authenticateToken,
  checkPermission('medications:read'),
  addCacheHeaders(),
  cacheGet('medication-alternatives'),
  async (req, res) => {
    try {
      const medicationId = parseInt(req.params.id, 10);
      const { reason } = req.query;

      if (!Number.isInteger(medicationId) || medicationId <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'Valid medication ID is required'
        });
      }

      const alternatives = await prescriptionService.getAlternativeMedications(
        medicationId, 
        reason
      );

      res.json({
        ok: true,
        data: alternatives,
        meta: {
          originalMedicationId: medicationId,
          reason: reason || null,
          count: alternatives.length
        }
      });

    } catch (error) {
      console.error('[medications:alternatives] Error:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to get alternative medications'
      });
    }
  }
);

/**
 * Prescribe a medication with safety checking
 * POST /api/medications/prescribe
 */
router.post('/medications/prescribe',
  authenticateToken,
  checkPermission('prescriptions:create'),
  invalidateCache('patient-medications', ['emr:patient-medications:*']),
  async (req, res) => {
    try {
      const {
        patientId,
        medicationId,
        dosage,
        frequency,
        duration,
        quantity,
        instructions,
        indication,
        overrideReason
      } = req.body;

      const prescriberId = req.user.id;

      // Validate required fields
      if (!patientId || !medicationId || !dosage || !frequency) {
        return res.status(400).json({
          ok: false,
          error: 'patientId, medicationId, dosage, and frequency are required'
        });
      }

      // Validate data types
      if (!Number.isInteger(patientId) || !Number.isInteger(medicationId)) {
        return res.status(400).json({
          ok: false,
          error: 'patientId and medicationId must be integers'
        });
      }

      const prescriptionData = {
        patientId,
        medicationId,
        dosage,
        frequency,
        duration,
        quantity,
        instructions,
        indication,
        overrideReason
      };

      const result = await prescriptionService.prescribeMedication(
        prescriptionData, 
        prescriberId
      );

      // Return success with safety information
      res.json({
        ok: true,
        data: result.prescription,
        safety: {
          overallRisk: result.safetyReport.overallRiskLevel,
          alerts: result.alerts,
          overrideUsed: result.overrideUsed,
          interactionCount: result.safetyReport.interactions.total
        },
        message: result.message
      });

    } catch (error) {
      if (error instanceof SafetyAlert) {
        // Return safety alert with detailed information
        return res.status(422).json({
          ok: false,
          error: 'Safety alert',
          alert: {
            type: error.type,
            severity: error.severity,
            message: error.message,
            data: error.data
          },
          requiresOverride: true
        });
      }

      console.error('[medications:prescribe] Error:', error);
      res.status(500).json({
        ok: false,
        error: 'Prescription failed'
      });
    }
  }
);

/**
 * Override a safety alert and proceed with prescription
 * POST /api/medications/prescribe-override
 */
router.post('/medications/prescribe-override',
  authenticateToken,
  checkPermission('prescriptions:create'),
  invalidateCache('patient-medications', ['emr:patient-medications:*']),
  async (req, res) => {
    try {
      const { prescriptionData, overrideReason } = req.body;
      const prescriberId = req.user.id;

      if (!prescriptionData || !overrideReason) {
        return res.status(400).json({
          ok: false,
          error: 'prescriptionData and overrideReason are required'
        });
      }

      if (overrideReason.trim().length < 10) {
        return res.status(400).json({
          ok: false,
          error: 'Override reason must be at least 10 characters long'
        });
      }

      const result = await prescriptionService.overrideSafetyAlert(
        prescriptionData, 
        overrideReason, 
        prescriberId
      );

      res.json({
        ok: true,
        data: result.prescription,
        safety: {
          overallRisk: result.safetyReport.overallRiskLevel,
          alerts: result.alerts,
          overrideUsed: true,
          overrideReason,
          interactionCount: result.safetyReport.interactions.total
        },
        message: 'Prescription created with safety override'
      });

    } catch (error) {
      console.error('[medications:prescribe-override] Error:', error);
      res.status(500).json({
        ok: false,
        error: error.message || 'Override prescription failed'
      });
    }
  }
);

/**
 * Get medication details by ID
 * GET /api/medications/:id
 */
router.get('/medications/:id',
  authenticateToken,
  checkPermission('medications:read'),
  addCacheHeaders(),
  cacheGet('medication-details'),
  async (req, res) => {
    try {
      const medicationId = parseInt(req.params.id, 10);

      if (!Number.isInteger(medicationId) || medicationId <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'Valid medication ID is required'
        });
      }

      const result = await pool.query(`
        SELECT 
          id,
          generic_name,
          brand_name,
          rxcui,
          ndc,
          drug_class,
          therapeutic_class,
          dosage_form,
          strength,
          strength_numeric,
          strength_unit,
          controlled_substance,
          schedule,
          typical_dose_min,
          typical_dose_max,
          typical_frequency,
          active,
          formulary,
          generic_available,
          created_at,
          updated_at
        FROM medications 
        WHERE id = $1
      `, [medicationId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: 'Medication not found'
        });
      }

      res.json({
        ok: true,
        data: result.rows[0]
      });

    } catch (error) {
      console.error('[medications:get] Error:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to get medication details'
      });
    }
  }
);

/**
 * Get patient's current medications
 * GET /api/patients/:id/medications
 */
router.get('/patients/:id/medications',
  authenticateToken,
  checkPermission('medications:read'),
  addCacheHeaders(),
  cacheGet('patient-medications'),
  async (req, res) => {
    try {
      const patientId = parseInt(req.params.id, 10);
      const { includeInactive = false } = req.query;

      if (!Number.isInteger(patientId) || patientId <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'Valid patient ID is required'
        });
      }

      let sql = `
        SELECT 
          pm.id,
          pm.patient_id,
          pm.name,
          pm.dose,
          pm.route,
          pm.frequency,
          pm.started_at,
          pm.ended_at,
          pm.active,
          m.id as medication_id,
          m.generic_name,
          m.brand_name,
          m.drug_class,
          m.therapeutic_class,
          m.controlled_substance,
          m.schedule
        FROM patient_medications pm
        LEFT JOIN medications m ON lower(pm.name) = lower(m.generic_name)
        WHERE pm.patient_id = $1
      `;

      const params = [patientId];

      if (includeInactive !== 'true') {
        sql += ` AND pm.active = true`;
      }

      sql += ` ORDER BY pm.active DESC, pm.started_at DESC`;

      const result = await pool.query(sql, params);

      res.json({
        ok: true,
        data: result.rows,
        meta: {
          patientId,
          total: result.rows.length,
          active: result.rows.filter(m => m.active).length,
          includeInactive: includeInactive === 'true'
        }
      });

    } catch (error) {
      console.error('[patients:medications] Error:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to get patient medications'
      });
    }
  }
);

/**
 * Generate comprehensive drug safety report for patient
 * GET /api/patients/:id/drug-safety-report
 */
router.get('/patients/:id/drug-safety-report',
  authenticateToken,
  checkPermission('medications:read'),
  async (req, res) => {
    try {
      const patientId = parseInt(req.params.id, 10);
      const userId = req.user.id;

      if (!Number.isInteger(patientId) || patientId <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'Valid patient ID is required'
        });
      }

      // Get current patient medications
      const currentMeds = await prescriptionService.getCurrentPatientMedications(patientId);
      const medicationIds = currentMeds
        .filter(m => m.medication_id)
        .map(m => m.medication_id);

      if (medicationIds.length === 0) {
        return res.json({
          ok: true,
          data: {
            patientId,
            medicationCount: 0,
            message: 'No active medications found for safety analysis'
          }
        });
      }

      // Generate comprehensive safety report
      const safetyReport = await drugInteractionService.generateSafetyReport(
        medicationIds, 
        patientId, 
        userId
      );

      res.json({
        ok: true,
        data: safetyReport
      });

    } catch (error) {
      console.error('[patients:drug-safety-report] Error:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to generate drug safety report'
      });
    }
  }
);

export default router;