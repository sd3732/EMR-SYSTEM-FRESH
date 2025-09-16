// backend/routes/cache.js
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { checkPermission } from '../middleware/rbac.js';
import cacheService from '../services/cache.service.js';
import cacheAnalyticsService from '../services/cache-analytics.service.js';
import redisClient from '../config/redis.config.js';

const router = Router();

// Cache analytics endpoint
router.get('/cache/analytics', authenticateToken, checkPermission('admin:read'), async (req, res) => {
  try {
    const analytics = await cacheAnalyticsService.collectAnalytics();
    
    if (!analytics) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to collect cache analytics'
      });
    }
    
    res.json({
      ok: true,
      data: analytics
    });
  } catch (error) {
    console.error('[cache:analytics]', error);
    res.status(500).json({
      ok: false,
      error: 'Analytics collection failed'
    });
  }
});

// Cache performance report
router.get('/cache/report/:timeRange?', authenticateToken, checkPermission('admin:read'), async (req, res) => {
  try {
    const timeRange = req.params.timeRange || 'last_hour';
    const validRanges = ['last_hour', 'last_day', 'last_week', 'all'];
    
    if (!validRanges.includes(timeRange)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid time range. Use: last_hour, last_day, last_week, or all'
      });
    }
    
    const report = cacheAnalyticsService.generateReport(timeRange);
    
    res.json({
      ok: true,
      data: report
    });
  } catch (error) {
    console.error('[cache:report]', error);
    res.status(500).json({
      ok: false,
      error: 'Report generation failed'
    });
  }
});

// Cache health check
router.get('/cache/health', authenticateToken, checkPermission('admin:read'), async (req, res) => {
  try {
    const health = await redisClient.healthCheck();
    const basicAnalytics = cacheService.getAnalytics();
    
    res.json({
      ok: true,
      data: {
        redis: health,
        cache: basicAnalytics,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[cache:health]', error);
    res.status(500).json({
      ok: false,
      error: 'Health check failed'
    });
  }
});

// PHI audit log (limited to last 100 entries)
router.get('/cache/audit/phi', authenticateToken, checkPermission('admin:read'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100'), 1000);
    const auditLog = cacheService.getPHIAuditLog(limit);
    
    res.json({
      ok: true,
      data: {
        entries: auditLog,
        count: auditLog.length,
        note: 'PHI cache access audit log - for HIPAA compliance'
      }
    });
  } catch (error) {
    console.error('[cache:audit]', error);
    res.status(500).json({
      ok: false,
      error: 'Audit log retrieval failed'
    });
  }
});

// Clear cache (admin only)
router.delete('/cache/flush', authenticateToken, checkPermission('admin:write'), async (req, res) => {
  try {
    const success = await cacheService.flush();
    
    if (success) {
      res.json({
        ok: true,
        message: 'Cache flushed successfully'
      });
    } else {
      res.status(500).json({
        ok: false,
        error: 'Cache flush failed'
      });
    }
  } catch (error) {
    console.error('[cache:flush]', error);
    res.status(500).json({
      ok: false,
      error: 'Cache flush failed'
    });
  }
});

// Invalidate specific cache pattern (admin only)
router.delete('/cache/invalidate', authenticateToken, checkPermission('admin:write'), async (req, res) => {
  try {
    const { pattern } = req.body;
    
    if (!pattern) {
      return res.status(400).json({
        ok: false,
        error: 'Pattern is required'
      });
    }
    
    // Security: only allow emr: prefixed patterns
    if (!pattern.startsWith('emr:')) {
      return res.status(400).json({
        ok: false,
        error: 'Pattern must start with "emr:"'
      });
    }
    
    const success = await cacheService.invalidate(pattern);
    
    res.json({
      ok: true,
      message: `Cache pattern "${pattern}" invalidated`,
      success
    });
  } catch (error) {
    console.error('[cache:invalidate]', error);
    res.status(500).json({
      ok: false,
      error: 'Cache invalidation failed'
    });
  }
});

// Export analytics data
router.get('/cache/export/:format?', authenticateToken, checkPermission('admin:read'), async (req, res) => {
  try {
    const format = req.params.format || 'json';
    
    if (!['json', 'csv'].includes(format)) {
      return res.status(400).json({
        ok: false,
        error: 'Format must be json or csv'
      });
    }
    
    const data = cacheAnalyticsService.exportData(format);
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=cache-analytics.csv');
      res.send(data);
    } else {
      res.json({
        ok: true,
        data
      });
    }
  } catch (error) {
    console.error('[cache:export]', error);
    res.status(500).json({
      ok: false,
      error: 'Export failed'
    });
  }
});

export default router;