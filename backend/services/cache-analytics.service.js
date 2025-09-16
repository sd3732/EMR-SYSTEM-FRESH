// backend/services/cache-analytics.service.js
import cacheService from './cache.service.js';
import redisClient from '../config/redis.config.js';

class CacheAnalyticsService {
  constructor() {
    this.analyticsHistory = [];
    this.performanceThresholds = {
      hitRateWarning: 70, // Warn if hit rate below 70%
      hitRateCritical: 50, // Critical if hit rate below 50%
      errorRateWarning: 5, // Warn if error rate above 5%
      errorRateCritical: 10, // Critical if error rate above 10%
    };
    
    // Start periodic collection if enabled
    if (process.env.CACHE_ANALYTICS_ENABLED !== 'false') {
      this.startPeriodicCollection();
    }
  }

  /**
   * Collect current cache analytics
   */
  async collectAnalytics() {
    try {
      const timestamp = new Date();
      const basicAnalytics = cacheService.getAnalytics();
      const memoryUsage = await this.getMemoryUsage();
      const keyStatistics = await this.getKeyStatistics();
      const redisInfo = await this.getRedisInfo();
      
      const analytics = {
        timestamp: timestamp.toISOString(),
        basic: basicAnalytics,
        memory: memoryUsage,
        keys: keyStatistics,
        redis: redisInfo,
        performance: this.calculatePerformanceMetrics(basicAnalytics)
      };

      // Add to history (keep last 100 entries)
      this.analyticsHistory.push(analytics);
      if (this.analyticsHistory.length > 100) {
        this.analyticsHistory = this.analyticsHistory.slice(-100);
      }

      // Check for performance issues
      this.checkPerformanceThresholds(analytics);

      return analytics;
    } catch (error) {
      console.error('[Cache Analytics] Failed to collect analytics:', error);
      return null;
    }
  }

  /**
   * Get Redis memory usage information
   */
  async getMemoryUsage() {
    try {
      const redis = redisClient.getClient();
      if (!redis) {
        return { available: false };
      }

      const info = await redis.memory('usage');
      const stats = await redis.memory('stats');
      
      return {
        available: true,
        usage_bytes: info,
        stats: stats || {},
        usage_mb: info ? (info / 1024 / 1024).toFixed(2) : 0
      };
    } catch (error) {
      console.error('[Cache Analytics] Memory usage error:', error);
      return { available: false, error: error.message };
    }
  }

  /**
   * Get statistics about cached keys
   */
  async getKeyStatistics() {
    try {
      const redis = redisClient.getClient();
      if (!redis) {
        return { available: false };
      }

      // Get all EMR cache keys
      const allKeys = await redis.keys('emr:*');
      
      // Categorize keys by type
      const keysByType = {};
      const keysByTTL = {
        no_expire: 0,
        short_term: 0, // < 10 minutes
        medium_term: 0, // 10 minutes - 1 hour
        long_term: 0, // > 1 hour
      };

      for (const key of allKeys) {
        // Extract key type (first part after emr:)
        const parts = key.split(':');
        const keyType = parts[1] || 'unknown';
        
        keysByType[keyType] = (keysByType[keyType] || 0) + 1;
        
        // Get TTL information
        try {
          const ttl = await redis.ttl(key);
          if (ttl === -1) {
            keysByTTL.no_expire++;
          } else if (ttl < 600) {
            keysByTTL.short_term++;
          } else if (ttl < 3600) {
            keysByTTL.medium_term++;
          } else {
            keysByTTL.long_term++;
          }
        } catch (error) {
          // Skip TTL check if key doesn't exist or other error
        }
      }

      return {
        available: true,
        total_keys: allKeys.length,
        keys_by_type: keysByType,
        keys_by_ttl: keysByTTL
      };
    } catch (error) {
      console.error('[Cache Analytics] Key statistics error:', error);
      return { available: false, error: error.message };
    }
  }

  /**
   * Get Redis server information
   */
  async getRedisInfo() {
    try {
      const redis = redisClient.getClient();
      if (!redis) {
        return { available: false };
      }

      const info = await redis.info('server');
      const keyspaceInfo = await redis.info('keyspace');
      
      // Parse Redis info into object
      const serverInfo = {};
      info.split('\r\n').forEach(line => {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            serverInfo[key] = value;
          }
        }
      });

      const keyspaceStats = {};
      keyspaceInfo.split('\r\n').forEach(line => {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            keyspaceStats[key] = value;
          }
        }
      });

      return {
        available: true,
        server: serverInfo,
        keyspace: keyspaceStats,
        uptime_seconds: serverInfo.uptime_in_seconds || 0
      };
    } catch (error) {
      console.error('[Cache Analytics] Redis info error:', error);
      return { available: false, error: error.message };
    }
  }

  /**
   * Calculate performance metrics
   */
  calculatePerformanceMetrics(basicAnalytics) {
    const hitRate = parseFloat(basicAnalytics.hitRate) || 0;
    const totalRequests = basicAnalytics.totalRequests || 0;
    const errorRate = totalRequests > 0 ? 
      ((basicAnalytics.errors / totalRequests) * 100).toFixed(2) : 0;

    return {
      hit_rate: hitRate,
      miss_rate: (100 - hitRate).toFixed(2),
      error_rate: errorRate,
      efficiency_score: this.calculateEfficiencyScore(hitRate, parseFloat(errorRate)),
      status: this.getPerformanceStatus(hitRate, parseFloat(errorRate))
    };
  }

  /**
   * Calculate overall efficiency score (0-100)
   */
  calculateEfficiencyScore(hitRate, errorRate) {
    // Base score from hit rate (0-80 points)
    let score = (hitRate / 100) * 80;
    
    // Penalty for errors (0-20 points deducted)
    const errorPenalty = Math.min(errorRate * 2, 20);
    score -= errorPenalty;
    
    return Math.max(0, Math.round(score));
  }

  /**
   * Get performance status based on metrics
   */
  getPerformanceStatus(hitRate, errorRate) {
    if (errorRate >= this.performanceThresholds.errorRateCritical || 
        hitRate <= this.performanceThresholds.hitRateCritical) {
      return 'critical';
    } else if (errorRate >= this.performanceThresholds.errorRateWarning || 
               hitRate <= this.performanceThresholds.hitRateWarning) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  /**
   * Check performance thresholds and log warnings
   */
  checkPerformanceThresholds(analytics) {
    const perf = analytics.performance;
    
    if (perf.status === 'critical') {
      console.error(`[Cache Analytics] CRITICAL: Hit rate ${perf.hit_rate}%, Error rate ${perf.error_rate}%`);
    } else if (perf.status === 'warning') {
      console.warn(`[Cache Analytics] WARNING: Hit rate ${perf.hit_rate}%, Error rate ${perf.error_rate}%`);
    }
  }

  /**
   * Generate performance report
   */
  generateReport(timeRange = 'last_hour') {
    const now = new Date();
    let timeFilter;
    
    switch (timeRange) {
      case 'last_hour':
        timeFilter = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'last_day':
        timeFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'last_week':
        timeFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        timeFilter = new Date(0); // All time
    }

    const filteredData = this.analyticsHistory.filter(
      entry => new Date(entry.timestamp) >= timeFilter
    );

    if (filteredData.length === 0) {
      return {
        timeRange,
        dataPoints: 0,
        message: 'No data available for selected time range'
      };
    }

    // Calculate averages and trends
    const metrics = filteredData.map(entry => entry.performance);
    const avgHitRate = metrics.reduce((sum, m) => sum + m.hit_rate, 0) / metrics.length;
    const avgErrorRate = metrics.reduce((sum, m) => sum + parseFloat(m.error_rate), 0) / metrics.length;
    const avgEfficiency = metrics.reduce((sum, m) => sum + m.efficiency_score, 0) / metrics.length;

    // Get latest data
    const latest = filteredData[filteredData.length - 1];

    // Calculate trends (comparing first vs last half)
    const midpoint = Math.floor(filteredData.length / 2);
    const firstHalf = filteredData.slice(0, midpoint);
    const secondHalf = filteredData.slice(midpoint);

    const trends = this.calculateTrends(firstHalf, secondHalf);

    return {
      timeRange,
      period: {
        start: filteredData[0].timestamp,
        end: latest.timestamp,
        dataPoints: filteredData.length
      },
      summary: {
        current_status: latest.performance.status,
        avg_hit_rate: avgHitRate.toFixed(2) + '%',
        avg_error_rate: avgErrorRate.toFixed(2) + '%',
        avg_efficiency: Math.round(avgEfficiency),
      },
      trends,
      current: latest,
      recommendations: this.generateRecommendations(avgHitRate, avgErrorRate, trends)
    };
  }

  /**
   * Calculate performance trends
   */
  calculateTrends(firstHalf, secondHalf) {
    if (firstHalf.length === 0 || secondHalf.length === 0) {
      return { available: false };
    }

    const firstAvg = firstHalf.reduce((sum, entry) => sum + entry.performance.hit_rate, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, entry) => sum + entry.performance.hit_rate, 0) / secondHalf.length;
    
    const hitRateTrend = secondAvg - firstAvg;

    return {
      available: true,
      hit_rate_trend: hitRateTrend > 1 ? 'improving' : hitRateTrend < -1 ? 'declining' : 'stable',
      hit_rate_change: hitRateTrend.toFixed(2) + '%'
    };
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(avgHitRate, avgErrorRate, trends) {
    const recommendations = [];

    if (avgHitRate < this.performanceThresholds.hitRateWarning) {
      recommendations.push({
        priority: 'high',
        category: 'hit_rate',
        message: 'Consider increasing cache TTL for frequently accessed data',
        action: 'Review cache rules and extend TTL for stable data'
      });
    }

    if (avgErrorRate > this.performanceThresholds.errorRateWarning) {
      recommendations.push({
        priority: 'high',
        category: 'errors',
        message: 'High error rate detected - check Redis connection and memory',
        action: 'Monitor Redis logs and consider scaling'
      });
    }

    if (trends.available && trends.hit_rate_trend === 'declining') {
      recommendations.push({
        priority: 'medium',
        category: 'trend',
        message: 'Cache hit rate is declining - investigate cache invalidation patterns',
        action: 'Review cache invalidation logic and data access patterns'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'info',
        category: 'status',
        message: 'Cache performance is within acceptable limits',
        action: 'Continue monitoring'
      });
    }

    return recommendations;
  }

  /**
   * Start periodic analytics collection
   */
  startPeriodicCollection() {
    // Collect analytics every 5 minutes
    setInterval(() => {
      this.collectAnalytics().catch(error => {
        console.error('[Cache Analytics] Periodic collection failed:', error);
      });
    }, 5 * 60 * 1000);

    console.log('[Cache Analytics] Periodic collection started (5 minute intervals)');
  }

  /**
   * Get analytics history
   */
  getHistory(limit = 50) {
    return this.analyticsHistory.slice(-limit);
  }

  /**
   * Clear analytics history
   */
  clearHistory() {
    this.analyticsHistory = [];
    console.log('[Cache Analytics] History cleared');
  }

  /**
   * Export analytics data
   */
  exportData(format = 'json') {
    const data = {
      exported_at: new Date().toISOString(),
      thresholds: this.performanceThresholds,
      history: this.analyticsHistory
    };

    if (format === 'csv') {
      // Convert to CSV format
      const headers = ['timestamp', 'hit_rate', 'miss_rate', 'error_rate', 'efficiency_score', 'status'];
      const rows = this.analyticsHistory.map(entry => [
        entry.timestamp,
        entry.performance.hit_rate,
        entry.performance.miss_rate,
        entry.performance.error_rate,
        entry.performance.efficiency_score,
        entry.performance.status
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return data;
  }
}

// Export singleton instance
const cacheAnalyticsService = new CacheAnalyticsService();
export default cacheAnalyticsService;