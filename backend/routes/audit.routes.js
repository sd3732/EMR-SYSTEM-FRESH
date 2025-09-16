// backend/routes/audit.routes.js
import { Router } from 'express';
import auditService from '../services/audit.service.js';
import pool from '../db/index.js';

const router = Router();

/* ---------- Helpers ---------- */
function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// Check if user has admin privileges
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ 
      ok: false, 
      error: 'Admin privileges required for audit operations' 
    });
  }
  next();
}

// Check if user can access audit data (admin or their own data)
function canAccessAuditData(req, res, next) {
  const requestedUserId = toInt(req.params.userId);
  const currentUserId = req.user?.id;
  
  // Admin can access all audit data
  if (req.user?.role === 'admin') {
    return next();
  }
  
  // Users can only access their own audit data
  if (requestedUserId && currentUserId && requestedUserId === currentUserId) {
    return next();
  }
  
  return res.status(403).json({ 
    ok: false, 
    error: 'Access denied: Can only view your own audit data' 
  });
}

// Validate date parameters
function validateDates(startDate, endDate) {
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD or ISO format.');
  }
  
  if (start > end) {
    throw new Error('Start date must be before end date.');
  }
  
  // Limit to 1 year maximum range for performance
  const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year
  if (end - start > maxRange) {
    throw new Error('Date range cannot exceed 1 year.');
  }
  
  return { start, end };
}

/* ---------- View audit logs (admin only) ---------- */
router.get('/audit/logs', requireAdmin, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      userId,
      tableName,
      phiOnly = false,
      limit = 100,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'DESC'
    } = req.query;

    // Validate parameters
    const { start, end } = validateDates(startDate, endDate);
    const limitNum = Math.min(toInt(limit) || 100, 1000); // Max 1000 records
    const offsetNum = toInt(offset) || 0;

    // Build dynamic query
    let query = `
      SELECT 
        al.id,
        al.user_id,
        al.action,
        al.table_name,
        al.record_id,
        al.phi_accessed,
        al.ip_address,
        al.session_id,
        al.request_id,
        al.endpoint,
        al.http_method,
        al.execution_time_ms,
        al.success,
        al.error_message,
        al.created_at,
        -- Include limited additional_data for admin view
        CASE 
          WHEN al.phi_accessed = true THEN 
            jsonb_build_object('phi_accessed', true, 'details', 'PHI access logged')
          ELSE al.additional_data
        END as additional_data
      FROM audit_logs al
      WHERE al.created_at BETWEEN $1 AND $2
    `;

    const params = [start, end];
    let paramIndex = 3;

    if (userId) {
      query += ` AND al.user_id = $${paramIndex}`;
      params.push(toInt(userId));
      paramIndex++;
    }

    if (tableName) {
      query += ` AND al.table_name = $${paramIndex}`;
      params.push(tableName);
      paramIndex++;
    }

    if (phiOnly === 'true') {
      query += ` AND al.phi_accessed = true`;
    }

    // Add ordering and pagination
    const allowedOrderBy = ['created_at', 'user_id', 'action', 'table_name'];
    const safeOrderBy = allowedOrderBy.includes(orderBy) ? orderBy : 'created_at';
    const safeDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY al.${safeOrderBy} ${safeDirection}`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offsetNum);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM audit_logs al
      WHERE al.created_at BETWEEN $1 AND $2
    `;
    
    const countParams = [start, end];
    let countParamIndex = 3;

    if (userId) {
      countQuery += ` AND al.user_id = $${countParamIndex}`;
      countParams.push(toInt(userId));
      countParamIndex++;
    }

    if (tableName) {
      countQuery += ` AND al.table_name = $${countParamIndex}`;
      countParams.push(tableName);
      countParamIndex++;
    }

    if (phiOnly === 'true') {
      countQuery += ` AND al.phi_accessed = true`;
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      ok: true,
      data: result.rows,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < total
      },
      filters: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        userId: userId ? toInt(userId) : null,
        tableName,
        phiOnly: phiOnly === 'true'
      }
    });

    // Log the audit query itself
    await auditService.logPHIAccess(
      req.user.id,
      'audit_logs',
      null,
      'audit_logs_query',
      'Admin audit log review',
      {
        sessionId: req.sessionID,
        ipAddress: req.ip,
        endpoint: req.path,
        requestId: req.requestId
      }
    );

  } catch (error) {
    console.error('[audit:logs]', error);
    res.status(400).json({ 
      ok: false, 
      error: error.message || 'Failed to retrieve audit logs' 
    });
  }
});

/* ---------- Generate compliance report ---------- */
router.get('/audit/report', requireAdmin, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      includeUserBreakdown = 'true',
      includePhiDetails = 'true',
      includeAnomalies = 'true',
      includeDataModifications = 'true',
      format = 'json'
    } = req.query;

    const { start, end } = validateDates(startDate, endDate);

    const options = {
      includeUserBreakdown: includeUserBreakdown === 'true',
      includePhiDetails: includePhiDetails === 'true',
      includeAnomalies: includeAnomalies === 'true',
      includeDataModifications: includeDataModifications === 'true',
      format
    };

    console.log(`[AUDIT API] Generating compliance report for ${req.user.id}`);

    const report = await auditService.generateComplianceReport(start, end, options);

    // Log the report generation
    await auditService.logPHIAccess(
      req.user.id,
      'audit_logs',
      null,
      'compliance_report',
      'HIPAA compliance report generation',
      {
        sessionId: req.sessionID,
        ipAddress: req.ip,
        endpoint: req.path,
        requestId: req.requestId
      }
    );

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="compliance_report_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}.csv"`);
      return res.send(report);
    }

    res.json({ ok: true, data: report });

  } catch (error) {
    console.error('[audit:report]', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || 'Failed to generate compliance report' 
    });
  }
});

/* ---------- Get user's access history ---------- */
router.get('/audit/user/:userId', canAccessAuditData, async (req, res) => {
  try {
    const userId = toInt(req.params.userId);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }

    const {
      startDate,
      endDate,
      includePhiOnly = 'false',
      limit = 50
    } = req.query;

    const { start, end } = validateDates(startDate, endDate);
    const limitNum = Math.min(toInt(limit) || 50, 500); // Max 500 records

    let query = `
      SELECT 
        al.id,
        al.action,
        al.table_name,
        al.record_id,
        al.phi_accessed,
        al.endpoint,
        al.success,
        al.created_at,
        CASE 
          WHEN al.phi_accessed = true THEN 
            'PHI accessed - details logged'
          ELSE 'Regular data access'
        END as description
      FROM audit_logs al
      WHERE al.user_id = $1 
        AND al.created_at BETWEEN $2 AND $3
    `;

    const params = [userId, start, end];

    if (includePhiOnly === 'true') {
      query += ` AND al.phi_accessed = true`;
    }

    query += ` ORDER BY al.created_at DESC LIMIT $4`;
    params.push(limitNum);

    const result = await pool.query(query, params);

    // Get summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_activities,
        COUNT(*) FILTER (WHERE phi_accessed = true) as phi_accesses,
        COUNT(*) FILTER (WHERE success = false) as failed_attempts,
        COUNT(DISTINCT table_name) as tables_accessed,
        MIN(created_at) as first_activity,
        MAX(created_at) as last_activity
      FROM audit_logs 
      WHERE user_id = $1 AND created_at BETWEEN $2 AND $3
    `;

    const summaryResult = await pool.query(summaryQuery, [userId, start, end]);

    res.json({
      ok: true,
      data: {
        activities: result.rows,
        summary: summaryResult.rows[0]
      },
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      }
    });

  } catch (error) {
    console.error('[audit:user]', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to retrieve user access history' 
    });
  }
});

/* ---------- Export audit data ---------- */
router.get('/audit/export', requireAdmin, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      format = 'json',
      includePhiDetails = 'false', // Default false for security
      includeDataModifications = 'true',
      userId,
      tableName
    } = req.query;

    const { start, end } = validateDates(startDate, endDate);

    const options = {
      startDate: start,
      endDate: end,
      format,
      includePhiDetails: includePhiDetails === 'true',
      includeDataModifications: includeDataModifications === 'true',
      userId: userId ? toInt(userId) : null,
      tableName,
      maxRecords: 50000 // Limit large exports
    };

    console.log(`[AUDIT API] Exporting audit data for ${req.user.id}`);

    const exportData = await auditService.exportAuditLog(options);

    // Log the export operation
    await auditService.logPHIAccess(
      req.user.id,
      'audit_logs',
      null,
      'audit_export',
      'Audit data export for compliance purposes',
      {
        sessionId: req.sessionID,
        ipAddress: req.ip,
        endpoint: req.path,
        requestId: req.requestId
      }
    );

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit_export_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}.csv"`);
      return res.send(exportData);
    }

    res.json({ ok: true, data: exportData });

  } catch (error) {
    console.error('[audit:export]', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || 'Failed to export audit data' 
    });
  }
});

/* ---------- Anomaly detection for user ---------- */
router.get('/audit/anomalies/:userId', requireAdmin, async (req, res) => {
  try {
    const userId = toInt(req.params.userId);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID' });
    }

    const {
      lookbackDays = '30',
      includeCurrentSession = 'true'
    } = req.query;

    const options = {
      lookbackDays: Math.min(toInt(lookbackDays) || 30, 365), // Max 1 year
      includeCurrentSession: includeCurrentSession === 'true'
    };

    const analysis = await auditService.detectAnomalousAccess(userId, options);

    // Log the anomaly detection
    await auditService.logPHIAccess(
      req.user.id,
      'audit_logs',
      null,
      'anomaly_detection',
      `Anomaly analysis for user ${userId}`,
      {
        sessionId: req.sessionID,
        ipAddress: req.ip,
        endpoint: req.path,
        requestId: req.requestId
      }
    );

    res.json({ ok: true, data: analysis });

  } catch (error) {
    console.error('[audit:anomalies]', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || 'Failed to analyze anomalous access' 
    });
  }
});

/* ---------- Get current suspicious sessions ---------- */
router.get('/audit/suspicious-sessions', requireAdmin, async (req, res) => {
  try {
    const query = `
      SELECT 
        us.user_id,
        us.session_id,
        us.anomaly_score,
        us.request_count,
        us.phi_access_count,
        us.failed_attempts,
        us.login_time,
        us.last_activity,
        us.ip_address,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - us.login_time))/60 as session_duration_minutes
      FROM user_sessions us
      WHERE us.is_active = true 
        AND (us.flagged_suspicious = true OR us.anomaly_score >= 5.0)
      ORDER BY us.anomaly_score DESC, us.last_activity DESC
    `;

    const result = await pool.query(query);

    res.json({
      ok: true,
      data: result.rows,
      summary: {
        totalSuspiciousSessions: result.rows.length,
        highRiskSessions: result.rows.filter(s => s.anomaly_score >= 7.0).length,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[audit:suspicious-sessions]', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to retrieve suspicious sessions' 
    });
  }
});

/* ---------- Generate daily compliance summary ---------- */
router.post('/audit/generate-daily-summary', requireAdmin, async (req, res) => {
  try {
    const { date } = req.body;
    const summaryDate = date ? new Date(date) : new Date();
    
    if (isNaN(summaryDate.getTime())) {
      return res.status(400).json({ ok: false, error: 'Invalid date format' });
    }

    await pool.query('SELECT generate_daily_compliance_summary($1)', [summaryDate]);

    // Retrieve the generated summary
    const result = await pool.query(
      'SELECT * FROM compliance_summaries WHERE report_date = $1',
      [summaryDate.toISOString().split('T')[0]]
    );

    res.json({
      ok: true,
      data: result.rows[0],
      message: 'Daily compliance summary generated successfully'
    });

  } catch (error) {
    console.error('[audit:generate-daily-summary]', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to generate daily compliance summary' 
    });
  }
});

/* ---------- Get PHI access statistics ---------- */
router.get('/audit/phi-stats', requireAdmin, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      groupBy = 'day' // day, week, month
    } = req.query;

    const { start, end } = validateDates(startDate, endDate);

    let dateFormat;
    switch (groupBy) {
      case 'week':
        dateFormat = 'YYYY-"W"WW';
        break;
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      default:
        dateFormat = 'YYYY-MM-DD';
    }

    const query = `
      SELECT 
        TO_CHAR(created_at, $3) as period,
        COUNT(*) as total_accesses,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT table_name) as unique_tables,
        COUNT(*) FILTER (WHERE action = 'DECRYPT') as decryption_count
      FROM audit_logs 
      WHERE phi_accessed = true 
        AND created_at BETWEEN $1 AND $2
      GROUP BY TO_CHAR(created_at, $3)
      ORDER BY period
    `;

    const result = await pool.query(query, [start, end, dateFormat]);

    res.json({
      ok: true,
      data: result.rows,
      metadata: {
        period: { start: start.toISOString(), end: end.toISOString() },
        groupBy,
        totalPeriods: result.rows.length
      }
    });

  } catch (error) {
    console.error('[audit:phi-stats]', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to retrieve PHI access statistics' 
    });
  }
});

/* ---------- Manual audit log entry (for testing/special cases) ---------- */
router.post('/audit/log-phi-access', requireAdmin, async (req, res) => {
  try {
    const {
      userId,
      tableName,
      recordId,
      fieldAccessed,
      reason,
      decrypted = false
    } = req.body;

    if (!userId || !tableName || !fieldAccessed || !reason) {
      return res.status(400).json({
        ok: false,
        error: 'userId, tableName, fieldAccessed, and reason are required'
      });
    }

    const result = await auditService.logPHIAccess(
      toInt(userId),
      tableName,
      recordId ? toInt(recordId) : null,
      fieldAccessed,
      reason,
      {
        sessionId: req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.requestId,
        decrypted: Boolean(decrypted),
        endpoint: req.path
      }
    );

    res.json({
      ok: true,
      data: result,
      message: 'PHI access logged successfully'
    });

  } catch (error) {
    console.error('[audit:log-phi-access]', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || 'Failed to log PHI access' 
    });
  }
});

export default router;