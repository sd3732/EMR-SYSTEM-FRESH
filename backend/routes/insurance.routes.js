// backend/routes/insurance.routes.js
import { Router } from 'express';
import patientInsuranceModel from '../models/patient_insurance.model.js';

const router = Router();

/* ---------- Helpers ---------- */
function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// Extract user ID from request (you may need to adjust this based on your auth middleware)
function getUserId(req) {
  return req.user?.id || req.userId || null;
}

// Validate required fields for insurance creation
function validateInsuranceData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate && !data.patient_id) {
    errors.push('patient_id is required');
  }

  if (data.subscriber_ssn) {
    const ssnValidation = patientInsuranceModel.validateSSN(data.subscriber_ssn);
    if (!ssnValidation.valid) {
      errors.push(`SSN validation failed: ${ssnValidation.message}`);
    }
  }

  if (data.priority_order && (!Number.isInteger(data.priority_order) || data.priority_order < 1)) {
    errors.push('priority_order must be a positive integer');
  }

  return errors;
}

/* ---------- List all insurance records ---------- */
router.get('/insurance', async (req, res) => {
  try {
    const { limit, offset, patient_id } = req.query;
    const userId = getUserId(req);

    const options = {
      limit: limit ? toInt(limit) : 500,
      offset: offset ? toInt(offset) : 0,
      patientId: patient_id ? toInt(patient_id) : null
    };

    if (options.limit > 1000) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Limit cannot exceed 1000 records' 
      });
    }

    const records = await patientInsuranceModel.findAll(options);
    
    res.json({ 
      ok: true, 
      data: records,
      meta: {
        count: records.length,
        limit: options.limit,
        offset: options.offset
      }
    });
  } catch (error) {
    console.error('[insurance:list]', error);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* ---------- Get insurance by patient ID ---------- */
router.get('/patients/:patientId/insurance', async (req, res) => {
  try {
    const patientId = toInt(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ ok: false, error: 'Invalid patient ID' });
    }

    const userId = getUserId(req);
    const purpose = 'Patient insurance lookup for clinical care';

    const records = await patientInsuranceModel.findByPatientId(patientId, {
      userId,
      purpose
    });

    res.json({ 
      ok: true, 
      data: records,
      meta: {
        patientId,
        count: records.length
      }
    });
  } catch (error) {
    console.error('[insurance:getByPatientId]', error);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* ---------- Get single insurance record ---------- */
router.get('/insurance/:id', async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid insurance ID' });
    }

    const userId = getUserId(req);
    const purpose = 'Insurance record details lookup';

    const record = await patientInsuranceModel.findById(id, {
      userId,
      purpose
    });

    res.json({ ok: true, data: record });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ ok: false, error: error.message });
    }
    
    console.error('[insurance:get]', error);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* ---------- Create insurance record ---------- */
router.post('/insurance', async (req, res) => {
  try {
    const data = req.body || {};
    const userId = getUserId(req);

    // Validate required fields
    const validationErrors = validateInsuranceData(data);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Validation failed',
        details: validationErrors
      });
    }

    // Validate and format SSN if provided
    if (data.subscriber_ssn) {
      const ssnValidation = patientInsuranceModel.validateSSN(data.subscriber_ssn);
      if (!ssnValidation.valid) {
        return res.status(400).json({ 
          ok: false, 
          error: ssnValidation.message 
        });
      }
      data.subscriber_ssn = ssnValidation.formatted;
    }

    const record = await patientInsuranceModel.create(data, {
      userId,
      purpose: 'Creating new insurance record'
    });

    res.status(201).json({ ok: true, data: record });
  } catch (error) {
    if (error.message.includes('encrypt')) {
      return res.status(500).json({ 
        ok: false, 
        error: 'Encryption error - unable to secure PHI data' 
      });
    }

    console.error('[insurance:create]', error);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* ---------- Update insurance record ---------- */
router.put('/insurance/:id', async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid insurance ID' });
    }

    const data = req.body || {};
    const userId = getUserId(req);

    // Validate data
    const validationErrors = validateInsuranceData(data, true); // isUpdate = true
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Validation failed',
        details: validationErrors
      });
    }

    // Validate and format SSN if provided
    if (data.subscriber_ssn !== undefined && data.subscriber_ssn !== null && data.subscriber_ssn !== '') {
      const ssnValidation = patientInsuranceModel.validateSSN(data.subscriber_ssn);
      if (!ssnValidation.valid) {
        return res.status(400).json({ 
          ok: false, 
          error: ssnValidation.message 
        });
      }
      data.subscriber_ssn = ssnValidation.formatted;
    }

    const record = await patientInsuranceModel.update(id, data, {
      userId,
      purpose: 'Updating insurance record'
    });

    res.json({ ok: true, data: record });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ ok: false, error: error.message });
    }

    if (error.message.includes('encrypt')) {
      return res.status(500).json({ 
        ok: false, 
        error: 'Encryption error - unable to secure PHI data' 
      });
    }

    console.error('[insurance:update]', error);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* ---------- Delete insurance record ---------- */
router.delete('/insurance/:id', async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid insurance ID' });
    }

    const userId = getUserId(req);

    const deleted = await patientInsuranceModel.delete(id, {
      userId,
      purpose: 'Deleting insurance record'
    });

    if (!deleted) {
      return res.status(404).json({ 
        ok: false, 
        error: `Insurance record ${id} not found` 
      });
    }

    res.json({ ok: true, data: { deleted: true, id } });
  } catch (error) {
    console.error('[insurance:delete]', error);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* ---------- Get decrypted SSN (RESTRICTED ENDPOINT) ---------- */
router.post('/insurance/:id/ssn', async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid insurance ID' });
    }

    const userId = getUserId(req);
    const { purpose } = req.body || {};

    // Require user authentication
    if (!userId) {
      return res.status(401).json({ 
        ok: false, 
        error: 'Authentication required for SSN access' 
      });
    }

    // Require purpose
    if (!purpose || purpose.trim() === '') {
      return res.status(400).json({ 
        ok: false, 
        error: 'Purpose required for SSN decryption' 
      });
    }

    // Additional authorization checks would go here
    // For example: check user role, department, etc.

    const decryptedSSN = await patientInsuranceModel.getDecryptedSSN(id, {
      userId,
      purpose: purpose.trim()
    });

    if (!decryptedSSN) {
      return res.status(404).json({ 
        ok: false, 
        error: 'No SSN found for this insurance record' 
      });
    }

    // Return with audit warning
    res.json({ 
      ok: true, 
      data: { 
        ssn: decryptedSSN,
        warning: 'This operation has been logged for audit purposes'
      }
    });
  } catch (error) {
    if (error.message.includes('decrypt')) {
      return res.status(500).json({ 
        ok: false, 
        error: 'Unable to decrypt SSN - operation logged' 
      });
    }

    console.error('[insurance:getSSN]', error);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* ---------- Get insurance statistics (for admin/reporting) ---------- */
router.get('/insurance/admin/statistics', async (req, res) => {
  try {
    const userId = getUserId(req);

    // This would typically require admin authorization
    // Add your authorization checks here

    const stats = await patientInsuranceModel.getStatistics();

    res.json({ 
      ok: true, 
      data: stats,
      meta: {
        generated_at: new Date().toISOString(),
        generated_by: userId
      }
    });
  } catch (error) {
    console.error('[insurance:statistics]', error);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/* ---------- Batch operations endpoint (for migrations/admin) ---------- */
router.post('/insurance/admin/batch', async (req, res) => {
  try {
    const { operation, records } = req.body || {};
    const userId = getUserId(req);

    // Require admin authorization for batch operations
    if (!userId) {
      return res.status(401).json({ 
        ok: false, 
        error: 'Authentication required' 
      });
    }

    if (!operation || !Array.isArray(records)) {
      return res.status(400).json({ 
        ok: false, 
        error: 'operation and records array required' 
      });
    }

    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    switch (operation) {
      case 'encrypt_ssn':
        // This would be used for batch SSN encryption
        for (const record of records) {
          try {
            if (record.id && record.ssn) {
              await patientInsuranceModel.update(record.id, {
                subscriber_ssn: record.ssn
              }, {
                userId,
                purpose: 'Batch SSN encryption operation'
              });
              results.successful++;
            }
          } catch (error) {
            results.failed++;
            results.errors.push({
              id: record.id,
              error: error.message
            });
          }
        }
        break;

      default:
        return res.status(400).json({ 
          ok: false, 
          error: `Unknown operation: ${operation}` 
        });
    }

    res.json({ 
      ok: true, 
      data: results 
    });
  } catch (error) {
    console.error('[insurance:batch]', error);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

export default router;