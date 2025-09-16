// backend/services/database-health.service.js
import pool from '../db/index.js';

class DatabaseHealthService {
  constructor() {
    this.serviceName = 'DatabaseHealthService';
    this.slowQueryThreshold = 100; // ms
    this.criticalQueryThreshold = 500; // ms
  }

  /**
   * Get queries taking longer than threshold
   * @param {number} thresholdMs - Query time threshold in milliseconds
   * @returns {Promise<Array>} - Slow queries with execution stats
   */
  async getSlowQueries(thresholdMs = this.slowQueryThreshold) {
    try {
      // Check if pg_stat_statements extension is available
      const extensionCheck = await pool.query(`
        SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') as has_extension
      `);

      if (!extensionCheck.rows[0].has_extension) {
        return {
          error: 'pg_stat_statements extension not installed',
          recommendation: 'Install with: CREATE EXTENSION pg_stat_statements;',
          queries: []
        };
      }

      const result = await pool.query(`
        SELECT 
          query,
          calls,
          total_time,
          mean_time,
          stddev_time,
          rows,
          100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
        FROM pg_stat_statements 
        WHERE mean_time > $1
        ORDER BY mean_time DESC 
        LIMIT 20
      `, [thresholdMs]);

      return {
        threshold_ms: thresholdMs,
        slow_queries: result.rows.map(row => ({
          query: this.sanitizeQuery(row.query),
          calls: parseInt(row.calls),
          total_time_ms: parseFloat(row.total_time),
          mean_time_ms: parseFloat(row.mean_time),
          stddev_time_ms: parseFloat(row.stddev_time),
          avg_rows: parseFloat(row.rows / row.calls),
          cache_hit_percent: parseFloat(row.hit_percent) || 0,
          performance_rating: this.rateQueryPerformance(parseFloat(row.mean_time))
        }))
      };
    } catch (error) {
      console.error('Error getting slow queries:', error);
      return { error: error.message, queries: [] };
    }
  }

  /**
   * Identify missing indexes based on table scan statistics
   * @returns {Promise<Array>} - Tables that might need indexes
   */
  async getMissingIndexes() {
    try {
      const result = await pool.query(`
        SELECT 
          schemaname,
          tablename,
          seq_scan,
          seq_tup_read,
          idx_scan,
          idx_tup_fetch,
          n_tup_ins + n_tup_upd + n_tup_del as write_activity,
          CASE 
            WHEN seq_scan > 0 THEN round((seq_tup_read::numeric / seq_scan), 2)
            ELSE 0 
          END as avg_seq_read,
          CASE
            WHEN (seq_scan + idx_scan) > 0 
            THEN round((seq_scan::numeric / (seq_scan + idx_scan) * 100), 2)
            ELSE 0
          END as seq_scan_percent
        FROM pg_stat_user_tables 
        WHERE schemaname = 'public'
          AND seq_scan > 100  -- Tables with significant sequential scans
          AND (idx_scan IS NULL OR seq_scan > idx_scan)  -- More seq scans than index scans
        ORDER BY seq_tup_read DESC
      `);

      return result.rows.map(row => ({
        schema: row.schemaname,
        table: row.tablename,
        sequential_scans: parseInt(row.seq_scan),
        sequential_tuples_read: parseInt(row.seq_tup_read),
        index_scans: parseInt(row.idx_scan) || 0,
        index_tuples_fetched: parseInt(row.idx_tup_fetch) || 0,
        write_activity: parseInt(row.write_activity),
        avg_sequential_read: parseFloat(row.avg_seq_read),
        seq_scan_percentage: parseFloat(row.seq_scan_percent),
        recommendation: this.generateIndexRecommendation(row)
      }));
    } catch (error) {
      console.error('Error analyzing missing indexes:', error);
      return { error: error.message };
    }
  }

  /**
   * Get index usage statistics
   * @returns {Promise<Array>} - Index usage statistics
   */
  async getIndexUsage() {
    try {
      const result = await pool.query(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan,
          idx_tup_read,
          idx_tup_fetch,
          CASE 
            WHEN idx_tup_read > 0 
            THEN round((idx_tup_fetch::numeric / idx_tup_read::numeric) * 100, 2)
            ELSE 0
          END as selectivity_percent,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size
        FROM pg_stat_user_indexes 
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC
      `);

      return result.rows.map(row => ({
        schema: row.schemaname,
        table: row.tablename,
        index: row.indexname,
        scans: parseInt(row.idx_scan),
        tuples_read: parseInt(row.idx_tup_read),
        tuples_fetched: parseInt(row.idx_tup_fetch),
        selectivity_percent: parseFloat(row.selectivity_percent),
        size: row.index_size,
        usage_rating: this.rateIndexUsage(parseInt(row.idx_scan)),
        recommendation: this.generateIndexUsageRecommendation(row)
      }));
    } catch (error) {
      console.error('Error getting index usage:', error);
      return { error: error.message };
    }
  }

  /**
   * Get database and table size information
   * @returns {Promise<Object>} - Database size statistics
   */
  async getDatabaseSize() {
    try {
      const dbSizeResult = await pool.query(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as database_size
      `);

      const tableSizeResult = await pool.query(`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
          pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      `);

      return {
        database_size: dbSizeResult.rows[0].database_size,
        tables: tableSizeResult.rows.map(row => ({
          schema: row.schemaname,
          table: row.tablename,
          total_size: row.total_size,
          table_size: row.table_size,
          index_size: row.index_size
        }))
      };
    } catch (error) {
      console.error('Error getting database size:', error);
      return { error: error.message };
    }
  }

  /**
   * Get comprehensive table statistics
   * @returns {Promise<Array>} - Table statistics including dead tuples
   */
  async getTableStatistics() {
    try {
      const result = await pool.query(`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples,
          CASE 
            WHEN n_live_tup > 0 
            THEN round((n_dead_tup::numeric / n_live_tup::numeric) * 100, 2)
            ELSE 0
          END as dead_tuple_percent,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze,
          vacuum_count,
          autovacuum_count,
          analyze_count,
          autoanalyze_count
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY n_live_tup DESC
      `);

      return result.rows.map(row => ({
        schema: row.schemaname,
        table: row.tablename,
        inserts: parseInt(row.inserts),
        updates: parseInt(row.updates),
        deletes: parseInt(row.deletes),
        live_tuples: parseInt(row.live_tuples),
        dead_tuples: parseInt(row.dead_tuples),
        dead_tuple_percent: parseFloat(row.dead_tuple_percent),
        last_vacuum: row.last_vacuum,
        last_autovacuum: row.last_autovacuum,
        last_analyze: row.last_analyze,
        last_autoanalyze: row.last_autoanalyze,
        vacuum_count: parseInt(row.vacuum_count),
        autovacuum_count: parseInt(row.autovacuum_count),
        analyze_count: parseInt(row.analyze_count),
        autoanalyze_count: parseInt(row.autoanalyze_count),
        health_status: this.assessTableHealth(row),
        recommendations: this.generateTableRecommendations(row)
      }));
    } catch (error) {
      console.error('Error getting table statistics:', error);
      return { error: error.message };
    }
  }

  /**
   * Generate comprehensive database health report
   * @returns {Promise<Object>} - Complete health report
   */
  async generateHealthReport() {
    try {
      const [slowQueries, missingIndexes, indexUsage, dbSize, tableStats] = await Promise.all([
        this.getSlowQueries(this.slowQueryThreshold),
        this.getMissingIndexes(),
        this.getIndexUsage(),
        this.getDatabaseSize(),
        this.getTableStatistics()
      ]);

      const report = {
        timestamp: new Date().toISOString(),
        database_health: {
          overall_status: this.calculateOverallHealth(slowQueries, missingIndexes, tableStats),
          performance_score: this.calculatePerformanceScore(slowQueries, indexUsage),
          recommendations: []
        },
        slow_queries: slowQueries,
        missing_indexes: missingIndexes,
        index_usage: indexUsage,
        database_size: dbSize,
        table_statistics: tableStats
      };

      // Generate high-level recommendations
      report.database_health.recommendations = this.generateHealthRecommendations(report);

      return report;
    } catch (error) {
      console.error('Error generating health report:', error);
      return { error: error.message };
    }
  }

  /**
   * Monitor query performance in real-time
   * @param {Function} callback - Callback for performance alerts
   */
  startQueryMonitoring(callback) {
    const checkInterval = 30000; // 30 seconds

    setInterval(async () => {
      try {
        const slowQueries = await this.getSlowQueries(this.criticalQueryThreshold);
        
        if (slowQueries.slow_queries && slowQueries.slow_queries.length > 0) {
          callback({
            type: 'SLOW_QUERY_ALERT',
            timestamp: new Date().toISOString(),
            queries: slowQueries.slow_queries,
            threshold: this.criticalQueryThreshold
          });
        }
      } catch (error) {
        callback({
          type: 'MONITORING_ERROR',
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    }, checkInterval);
  }

  // ===== HELPER METHODS =====

  sanitizeQuery(query) {
    // Remove sensitive data patterns from query strings
    return query
      .replace(/\$\d+/g, '?')  // Replace parameter placeholders
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim()
      .substring(0, 200);     // Limit length
  }

  rateQueryPerformance(meanTime) {
    if (meanTime < 10) return 'EXCELLENT';
    if (meanTime < 50) return 'GOOD';
    if (meanTime < 100) return 'ACCEPTABLE';
    if (meanTime < 500) return 'SLOW';
    return 'CRITICAL';
  }

  rateIndexUsage(scans) {
    if (scans > 1000) return 'HIGH';
    if (scans > 100) return 'MEDIUM';
    if (scans > 10) return 'LOW';
    return 'UNUSED';
  }

  generateIndexRecommendation(row) {
    const recommendations = [];
    
    if (row.seq_scan_percent > 80) {
      recommendations.push('Consider adding indexes to reduce sequential scans');
    }
    
    if (row.avg_seq_read > 1000) {
      recommendations.push('High sequential read volume - index optimization critical');
    }

    if (row.write_activity > 1000 && row.seq_scan_percent > 50) {
      recommendations.push('High write activity with frequent scans - balance index strategy');
    }

    return recommendations;
  }

  generateIndexUsageRecommendation(row) {
    if (row.idx_scan === 0) {
      return 'UNUSED - Consider dropping this index';
    }
    if (row.idx_scan < 10) {
      return 'LOW_USAGE - Monitor and consider removal if pattern continues';
    }
    if (row.selectivity_percent < 10) {
      return 'LOW_SELECTIVITY - Index may not be optimal';
    }
    return 'HEALTHY - Good index usage';
  }

  assessTableHealth(row) {
    const deadPercent = parseFloat(row.dead_tuple_percent);
    const daysSinceVacuum = row.last_autovacuum ? 
      (Date.now() - new Date(row.last_autovacuum).getTime()) / (1000 * 60 * 60 * 24) : 999;

    if (deadPercent > 20 || daysSinceVacuum > 7) return 'UNHEALTHY';
    if (deadPercent > 10 || daysSinceVacuum > 3) return 'WARNING';
    return 'HEALTHY';
  }

  generateTableRecommendations(row) {
    const recommendations = [];
    const deadPercent = parseFloat(row.dead_tuple_percent);

    if (deadPercent > 20) {
      recommendations.push('VACUUM recommended - high dead tuple percentage');
    }

    if (!row.last_analyze || (Date.now() - new Date(row.last_analyze).getTime()) > (7 * 24 * 60 * 60 * 1000)) {
      recommendations.push('ANALYZE recommended - statistics may be outdated');
    }

    return recommendations;
  }

  calculateOverallHealth(slowQueries, missingIndexes, tableStats) {
    let score = 100;
    
    // Deduct for slow queries
    if (slowQueries.slow_queries && slowQueries.slow_queries.length > 0) {
      score -= Math.min(slowQueries.slow_queries.length * 10, 40);
    }

    // Deduct for missing indexes
    if (Array.isArray(missingIndexes) && missingIndexes.length > 0) {
      score -= Math.min(missingIndexes.length * 15, 30);
    }

    // Deduct for unhealthy tables
    if (Array.isArray(tableStats)) {
      const unhealthyTables = tableStats.filter(t => t.health_status === 'UNHEALTHY').length;
      score -= Math.min(unhealthyTables * 10, 30);
    }

    if (score >= 90) return 'EXCELLENT';
    if (score >= 75) return 'GOOD';
    if (score >= 60) return 'FAIR';
    if (score >= 40) return 'POOR';
    return 'CRITICAL';
  }

  calculatePerformanceScore(slowQueries, indexUsage) {
    let score = 100;

    if (slowQueries.slow_queries && slowQueries.slow_queries.length > 0) {
      const criticalQueries = slowQueries.slow_queries.filter(q => q.performance_rating === 'CRITICAL').length;
      score -= criticalQueries * 20;
    }

    if (Array.isArray(indexUsage)) {
      const unusedIndexes = indexUsage.filter(i => i.usage_rating === 'UNUSED').length;
      score -= unusedIndexes * 5;
    }

    return Math.max(0, score);
  }

  generateHealthRecommendations(report) {
    const recommendations = [];

    // Query performance recommendations
    if (report.slow_queries.slow_queries && report.slow_queries.slow_queries.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'QUERY_PERFORMANCE',
        message: `${report.slow_queries.slow_queries.length} slow queries detected`,
        action: 'Review and optimize slow queries, consider adding indexes'
      });
    }

    // Index recommendations
    if (Array.isArray(report.missing_indexes) && report.missing_indexes.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'INDEX_OPTIMIZATION',
        message: `${report.missing_indexes.length} tables with high sequential scan activity`,
        action: 'Analyze query patterns and add appropriate indexes'
      });
    }

    // Table health recommendations
    if (Array.isArray(report.table_statistics)) {
      const unhealthyTables = report.table_statistics.filter(t => t.health_status === 'UNHEALTHY').length;
      if (unhealthyTables > 0) {
        recommendations.push({
          priority: 'MEDIUM',
          category: 'TABLE_MAINTENANCE',
          message: `${unhealthyTables} tables need maintenance`,
          action: 'Run VACUUM and ANALYZE on affected tables'
        });
      }
    }

    return recommendations;
  }
}

// Export singleton instance
const databaseHealthService = new DatabaseHealthService();
export default databaseHealthService;