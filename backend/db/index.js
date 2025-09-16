import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();
const { Pool } = pkg;

// Make sure we trim accidental whitespace/newlines from env values
const env = (k, def = '') => (process.env[k] ?? def).trim();

// Performance monitoring configuration
const SLOW_QUERY_THRESHOLD = parseInt(env('SLOW_QUERY_THRESHOLD', '100'), 10); // ms
const CRITICAL_QUERY_THRESHOLD = parseInt(env('CRITICAL_QUERY_THRESHOLD', '500'), 10); // ms
const LOG_ALL_QUERIES = env('LOG_ALL_QUERIES', 'false') === 'true';

const pool = new Pool({
  host: env('PGHOST', 'localhost'),
  port: parseInt(env('PGPORT', '5432'), 10),
  database: env('PGDATABASE', 'emr'),
  user: env('PGUSER', 'emr_user'),
  password: env('PGPASSWORD', 'change_me_securely'),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 30000 // 30 second timeout for queries
});

// Query performance monitoring wrapper
class PerformanceMonitoredPool {
  constructor(pool) {
    this.pool = pool;
    this.queryStats = {
      total: 0,
      slow: 0,
      critical: 0,
      totalTime: 0,
      errors: 0
    };
  }

  async query(text, params) {
    const startTime = Date.now();
    const queryId = Math.random().toString(36).substring(2, 8);
    
    try {
      // Log query start if enabled
      if (LOG_ALL_QUERIES) {
        console.log(`[DB:${queryId}] Query start:`, {
          query: this.sanitizeQuery(text),
          params: params ? params.length : 0
        });
      }

      const result = await this.pool.query(text, params);
      const executionTime = Date.now() - startTime;

      // Update statistics
      this.updateStats(executionTime);

      // Log performance information
      this.logPerformance(queryId, text, params, executionTime, result.rowCount);

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.queryStats.errors++;
      
      console.error(`[DB:${queryId}] Query error (${executionTime}ms):`, {
        error: error.message,
        query: this.sanitizeQuery(text),
        params: params ? params.length : 0
      });
      
      throw error;
    }
  }

  updateStats(executionTime) {
    this.queryStats.total++;
    this.queryStats.totalTime += executionTime;

    if (executionTime > CRITICAL_QUERY_THRESHOLD) {
      this.queryStats.critical++;
    } else if (executionTime > SLOW_QUERY_THRESHOLD) {
      this.queryStats.slow++;
    }
  }

  logPerformance(queryId, text, params, executionTime, rowCount) {
    const sanitizedQuery = this.sanitizeQuery(text);
    const logData = {
      queryId,
      executionTime,
      rowCount,
      paramsCount: params ? params.length : 0
    };

    if (executionTime > CRITICAL_QUERY_THRESHOLD) {
      console.error(`[DB:${queryId}] 🚨 CRITICAL QUERY (${executionTime}ms):`, {
        ...logData,
        query: sanitizedQuery,
        severity: 'CRITICAL'
      });
    } else if (executionTime > SLOW_QUERY_THRESHOLD) {
      console.warn(`[DB:${queryId}] ⚠️  SLOW QUERY (${executionTime}ms):`, {
        ...logData,
        query: sanitizedQuery.substring(0, 100) + '...',
        severity: 'SLOW'
      });
    } else if (LOG_ALL_QUERIES) {
      console.log(`[DB:${queryId}] ✅ Query complete (${executionTime}ms):`, {
        ...logData,
        severity: 'NORMAL'
      });
    }
  }

  sanitizeQuery(query) {
    return query
      .replace(/\s+/g, ' ')                    // Normalize whitespace
      .replace(/\$\d+/g, '?')                  // Replace parameters
      .trim()
      .substring(0, 200);                      // Limit length
  }

  getStats() {
    const avgTime = this.queryStats.total > 0 ? 
      Math.round(this.queryStats.totalTime / this.queryStats.total) : 0;

    return {
      ...this.queryStats,
      avgTime,
      slowPercentage: this.queryStats.total > 0 ? 
        Math.round((this.queryStats.slow / this.queryStats.total) * 100) : 0,
      criticalPercentage: this.queryStats.total > 0 ? 
        Math.round((this.queryStats.critical / this.queryStats.total) * 100) : 0,
      errorRate: this.queryStats.total > 0 ? 
        Math.round((this.queryStats.errors / this.queryStats.total) * 100) : 0
    };
  }

  resetStats() {
    this.queryStats = {
      total: 0,
      slow: 0,
      critical: 0,
      totalTime: 0,
      errors: 0
    };
  }

  // Proxy all other pool methods
  async connect() {
    return this.pool.connect();
  }

  async end() {
    console.log('[DB] Final query statistics:', this.getStats());
    return this.pool.end();
  }

  get totalCount() {
    return this.pool.totalCount;
  }

  get idleCount() {
    return this.pool.idleCount;
  }

  get waitingCount() {
    return this.pool.waitingCount;
  }
}

// Create monitored pool instance
const monitoredPool = new PerformanceMonitoredPool(pool);

// Log database performance stats periodically
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    const stats = monitoredPool.getStats();
    if (stats.total > 0) {
      console.log('[DB] Performance stats:', stats);
      
      // Alert on concerning performance
      if (stats.criticalPercentage > 5) {
        console.error(`[DB] 🚨 Alert: ${stats.criticalPercentage}% of queries are critically slow!`);
      } else if (stats.slowPercentage > 20) {
        console.warn(`[DB] ⚠️  Warning: ${stats.slowPercentage}% of queries are slow`);
      }
    }
  }, 60000); // Log every minute
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[DB] Shutting down database connections...');
  await monitoredPool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[DB] Shutting down database connections...');
  await monitoredPool.end();
  process.exit(0);
});

export default monitoredPool;