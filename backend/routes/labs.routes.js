// Lab Order and Results API Routes
// Provides endpoints for lab ordering, result processing, and critical value management
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';
import { cacheGet, invalidateCache, addCacheHeaders } from '../middleware/cache.middleware.js';
import labService from '../services/lab.service.js';
import hl7ParserService from '../services/hl7-parser.service.js';
import criticalValuesService from '../services/critical-values.service.js';

const router = Router();

/**
 * Create a new lab order
 * POST /api/labs/orders
 * Body: { patientId, encounterId?, priority, clinicalIndication, tests, fastingRequired?, specialInstructions? }
 */
router.post('/labs/orders',
  authenticateToken,
  checkPermission('labs:create'),
  invalidateCache('patient-labs', ['emr:patient-labs:*']),
  async (req, res) => {
    try {
      const {
        patientId,
        encounterId,
        priority,
        clinicalIndication,
        tests,
        fastingRequired,
        specialInstructions,
        orderingFacility
      } = req.body;

      const userId = req.user.id;

      // Validate required fields
      if (!patientId || !clinicalIndication || !tests || !Array.isArray(tests) || tests.length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'patientId, clinicalIndication, and tests array are required'
        });
      }

      // Validate data types
      if (!Number.isInteger(patientId) || patientId <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'patientId must be a positive integer'
        });
      }

      const orderData = {
        patientId,
        encounterId,
        priority: priority || 'routine',
        clinicalIndication,
        tests,
        fastingRequired: fastingRequired || false,
        specialInstructions,
        orderingFacility: orderingFacility || 'Main Lab'
      };

      const result = await labService.createLabOrder(orderData, userId);

      res.json({
        ok: true,
        data: result.labOrder,
        message: result.message
      });

    } catch (error) {
      console.error('[Labs API] Error creating lab order:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to create lab order'
      });
    }
  }
);

/**
 * Get lab order details with tests and results
 * GET /api/labs/orders/:id
 */
router.get('/labs/orders/:id',
  authenticateToken,
  checkPermission('labs:read'),
  addCacheHeaders(),
  cacheGet('lab-order-details'),
  async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      const userId = req.user.id;

      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'Valid order ID is required'
        });
      }

      const result = await labService.getLabOrderById(orderId, userId);

      res.json({
        ok: true,
        data: result.order
      });

    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          ok: false,
          error: 'Lab order not found'
        });
      }

      console.error('[Labs API] Error getting lab order:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to get lab order'
      });
    }
  }
);

/**
 * Receive lab results (typically from HL7 interface)
 * POST /api/labs/results
 * Body: { hl7Message } or { testId, resultValue, numericValue?, unit, referenceRange, abnormalFlag?, resultStatus?, resultDate, ... }
 */
router.post('/labs/results',
  authenticateToken,
  checkPermission('labs:receive_results'),
  invalidateCache('lab-results', ['emr:lab-results:*', 'emr:patient-labs:*']),
  async (req, res) => {
    try {
      const userId = req.user.id;

      // Check if this is an HL7 message
      if (req.body.hl7Message) {
        // Parse HL7 message and process results
        const parseResult = await hl7ParserService.parseORU(req.body.hl7Message, userId);
        
        if (!parseResult.success) {
          return res.status(400).json({
            ok: false,
            error: 'Failed to parse HL7 message',
            details: parseResult.error
          });
        }

        // Process each observation from the HL7 message
        const results = [];
        for (const observation of parseResult.data.observations) {
          // Find the test ID for this LOINC code
          const testId = await labService.findTestByLoinc(
            parseResult.data.order.internalOrderId,
            observation.loincCode
          );

          if (testId) {
            const resultData = {
              testId,
              resultValue: observation.resultValue,
              numericValue: observation.numericValue,
              unit: observation.unit,
              referenceRange: observation.referenceRange,
              abnormalFlag: observation.abnormalFlag,
              resultStatus: observation.resultStatus,
              resultDate: observation.observationDateTime
            };

            const result = await labService.receiveResults(resultData, userId);
            results.push(result);
          }
        }

        return res.json({
          ok: true,
          data: {
            parsedMessage: parseResult.data,
            processedResults: results
          },
          message: `Processed ${results.length} results from HL7 message`
        });

      } else {
        // Direct result input
        const {
          testId,
          resultValue,
          numericValue,
          unit,
          referenceRange,
          abnormalFlag,
          resultStatus,
          resultDate,
          labTechnician,
          instrumentId,
          interpretation
        } = req.body;

        // Validate required fields
        if (!testId || !resultValue || !resultDate) {
          return res.status(400).json({
            ok: false,
            error: 'testId, resultValue, and resultDate are required'
          });
        }

        if (!Number.isInteger(testId) || testId <= 0) {
          return res.status(400).json({
            ok: false,
            error: 'testId must be a positive integer'
          });
        }

        const resultData = {
          testId,
          resultValue,
          numericValue,
          unit,
          referenceRange,
          abnormalFlag,
          resultStatus: resultStatus || 'preliminary',
          resultDate: new Date(resultDate),
          labTechnician,
          instrumentId,
          interpretation
        };

        const result = await labService.receiveResults(resultData, userId);

        res.json({
          ok: true,
          data: result.result,
          isCritical: result.isCritical,
          message: result.message
        });
      }

    } catch (error) {
      console.error('[Labs API] Error receiving results:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to process lab results'
      });
    }
  }
);

/**
 * Get unacknowledged critical values for current provider
 * GET /api/labs/results/critical
 */
router.get('/labs/results/critical',
  authenticateToken,
  checkPermission('labs:read'),
  async (req, res) => {
    try {
      const providerId = req.user.id;
      const limit = parseInt(req.query.limit) || 50;

      const result = await criticalValuesService.getUnacknowledgedCriticalValues(providerId, limit);

      res.json({
        ok: true,
        data: result.criticalValues,
        meta: {
          providerId,
          total: result.criticalValues.length,
          limit
        }
      });

    } catch (error) {
      console.error('[Labs API] Error getting critical values:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to get critical values'
      });
    }
  }
);

/**
 * Acknowledge a critical value
 * PUT /api/labs/results/:id/acknowledge
 * Body: { notes? }
 */
router.put('/labs/results/:id/acknowledge',
  authenticateToken,
  checkPermission('labs:acknowledge'),
  async (req, res) => {
    try {
      const resultId = parseInt(req.params.id, 10);
      const providerId = req.user.id;
      const { notes } = req.body;

      if (!Number.isInteger(resultId) || resultId <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'Valid result ID is required'
        });
      }

      const result = await criticalValuesService.acknowledgeCriticalValue(resultId, providerId, notes);

      res.json({
        ok: true,
        message: result.message
      });

    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          ok: false,
          error: 'Critical value notification not found'
        });
      }

      console.error('[Labs API] Error acknowledging critical value:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to acknowledge critical value'
      });
    }
  }
);

/**
 * Get patient lab history
 * GET /api/labs/patients/:id/history
 */
router.get('/labs/patients/:id/history',
  authenticateToken,
  checkPermission('labs:read'),
  addCacheHeaders(),
  cacheGet('patient-labs'),
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

      const options = {
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0,
        dateFrom: req.query.dateFrom || null,
        dateTo: req.query.dateTo || null,
        testName: req.query.testName || null,
        loincCode: req.query.loincCode || null,
        onlyCritical: req.query.onlyCritical === 'true'
      };

      const result = await labService.getPatientLabHistory(patientId, options, userId);

      res.json({
        ok: true,
        data: result.data,
        pagination: result.pagination,
        meta: {
          patientId,
          filters: options
        }
      });

    } catch (error) {
      console.error('[Labs API] Error getting patient lab history:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to get patient lab history'
      });
    }
  }
);

/**
 * Get result trends for a specific test
 * GET /api/labs/patients/:id/trends/:loincCode
 */
router.get('/labs/patients/:id/trends/:loincCode',
  authenticateToken,
  checkPermission('labs:read'),
  addCacheHeaders(),
  cacheGet('lab-trends'),
  async (req, res) => {
    try {
      const patientId = parseInt(req.params.id, 10);
      const loincCode = req.params.loincCode;
      const months = parseInt(req.query.months) || 12;
      const userId = req.user.id;

      if (!Number.isInteger(patientId) || patientId <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'Valid patient ID is required'
        });
      }

      if (!loincCode) {
        return res.status(400).json({
          ok: false,
          error: 'LOINC code is required'
        });
      }

      const result = await labService.getResultTrends(patientId, loincCode, months);

      res.json({
        ok: true,
        data: result.data,
        meta: {
          testName: result.testName,
          loincCode: result.loincCode,
          patientId: result.patientId,
          timeRange: result.timeRange,
          total: result.data.length
        }
      });

    } catch (error) {
      console.error('[Labs API] Error getting result trends:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to get result trends'
      });
    }
  }
);

/**
 * Get critical values for a patient
 * GET /api/labs/patients/:id/critical
 */
router.get('/labs/patients/:id/critical',
  authenticateToken,
  checkPermission('labs:read'),
  async (req, res) => {
    try {
      const patientId = parseInt(req.params.id, 10);
      const days = parseInt(req.query.days) || 30;
      const userId = req.user.id;

      if (!Number.isInteger(patientId) || patientId <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'Valid patient ID is required'
        });
      }

      const result = await criticalValuesService.getPatientCriticalValues(patientId, userId, days);

      res.json({
        ok: true,
        data: result.criticalValues,
        meta: {
          patientId: result.patientId,
          timeRange: result.timeRange,
          total: result.criticalValues.length
        }
      });

    } catch (error) {
      console.error('[Labs API] Error getting patient critical values:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to get patient critical values'
      });
    }
  }
);

/**
 * Get available lab panels
 * GET /api/labs/panels
 */
router.get('/labs/panels',
  authenticateToken,
  checkPermission('labs:read'),
  addCacheHeaders(),
  cacheGet('lab-panels'),
  async (req, res) => {
    try {
      const result = await labService.getLabPanels();

      res.json({
        ok: true,
        data: result.panels
      });

    } catch (error) {
      console.error('[Labs API] Error getting lab panels:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to get lab panels'
      });
    }
  }
);

/**
 * Add tests to existing lab order
 * POST /api/labs/orders/:id/tests
 * Body: { loincCodes: [array of LOINC codes] }
 */
router.post('/labs/orders/:id/tests',
  authenticateToken,
  checkPermission('labs:update'),
  invalidateCache('lab-order-details', ['emr:lab-order-details:*']),
  async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      const { loincCodes } = req.body;
      const userId = req.user.id;

      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'Valid order ID is required'
        });
      }

      if (!loincCodes || !Array.isArray(loincCodes) || loincCodes.length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'loincCodes array is required'
        });
      }

      const addedTests = await labService.addTestsToOrder(orderId, loincCodes, userId);

      res.json({
        ok: true,
        data: addedTests,
        message: `Added ${addedTests.length} tests to order ${orderId}`
      });

    } catch (error) {
      console.error('[Labs API] Error adding tests to order:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to add tests to order'
      });
    }
  }
);

/**
 * Generate HL7 ORM message for lab order
 * GET /api/labs/orders/:id/hl7
 */
router.get('/labs/orders/:id/hl7',
  authenticateToken,
  checkPermission('labs:read'),
  async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);

      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'Valid order ID is required'
        });
      }

      // Get order details first
      const orderResult = await labService.getLabOrderById(orderId, req.user.id);
      
      if (!orderResult.success) {
        return res.status(404).json({
          ok: false,
          error: 'Lab order not found'
        });
      }

      const hl7Result = await hl7ParserService.generateORM(orderResult.order);

      res.json({
        ok: true,
        data: {
          hl7Message: hl7Result.message,
          messageControlId: hl7Result.messageControlId
        }
      });

    } catch (error) {
      console.error('[Labs API] Error generating HL7 message:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to generate HL7 message'
      });
    }
  }
);

/**
 * Define critical value range (admin only)
 * POST /api/labs/critical-ranges
 * Body: { loincCode, testName, criticalLow?, criticalHigh?, unit, ageGroup?, gender?, escalationMinutes? }
 */
router.post('/labs/critical-ranges',
  authenticateToken,
  checkPermission('labs:admin'),
  async (req, res) => {
    try {
      const {
        loincCode,
        testName,
        criticalLow,
        criticalHigh,
        unit,
        ageGroup,
        gender,
        escalationMinutes
      } = req.body;

      if (!loincCode || !testName) {
        return res.status(400).json({
          ok: false,
          error: 'loincCode and testName are required'
        });
      }

      if (criticalLow === undefined && criticalHigh === undefined) {
        return res.status(400).json({
          ok: false,
          error: 'At least one of criticalLow or criticalHigh must be provided'
        });
      }

      const rangeData = {
        loincCode,
        testName,
        criticalLow,
        criticalHigh,
        unit,
        ageGroup,
        gender,
        escalationMinutes
      };

      const result = await criticalValuesService.defineCriticalRange(rangeData, req.user.id);

      res.json({
        ok: true,
        data: result.range,
        message: result.message
      });

    } catch (error) {
      console.error('[Labs API] Error defining critical range:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to define critical range'
      });
    }
  }
);

export default router;