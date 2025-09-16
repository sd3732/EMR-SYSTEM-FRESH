// backend/middleware/cache.middleware.js
import cacheService from '../services/cache.service.js';

// Cache rules based on data sensitivity and access patterns
const cacheRules = {
  // Provider data (non-PHI, static)
  'providers': { ttl: 3600, phi: false }, // 1 hour
  'provider-schedules': { ttl: 1800, phi: false }, // 30 minutes
  'provider-directory': { ttl: 86400, phi: false }, // 24 hours
  
  // Patient data (PHI, dynamic)
  'patients': { ttl: 300, phi: true }, // 5 minutes
  'patient-demographics': { ttl: 300, phi: true }, // 5 minutes
  'patient-vitals': { ttl: 180, phi: true }, // 3 minutes
  
  // Appointment data (PHI, semi-dynamic)
  'appointments': { ttl: 300, phi: true }, // 5 minutes
  'appointment-slots': { ttl: 600, phi: false }, // 10 minutes
  
  // Medication data
  'medications-list': { ttl: 86400, phi: false }, // 24 hours (formulary)
  'patient-medications': { ttl: 300, phi: true }, // 5 minutes
  'prescriptions': { ttl: 180, phi: true }, // 3 minutes
  
  // Insurance and administrative
  'insurance-plans': { ttl: 86400, phi: false }, // 24 hours
  'insurance-verification': { ttl: 1800, phi: true }, // 30 minutes
  
  // Clinical data
  'lab-results': { ttl: 300, phi: true }, // 5 minutes
  'clinical-notes': { ttl: 180, phi: true }, // 3 minutes
  'diagnoses': { ttl: 300, phi: true }, // 5 minutes
  
  // Provider data (non-PHI directory information)
  'providers': { ttl: 3600, phi: false }, // 1 hour (provider directory)
  'patient-provider': { ttl: 300, phi: true }, // 5 minutes (patient assignments)
  
  // System data (non-PHI)
  'users': { ttl: 1800, phi: false }, // 30 minutes
  'user-preferences': { ttl: 3600, phi: false }, // 1 hour
  'system-config': { ttl: 86400, phi: false }, // 24 hours
};

/**
 * Generate cache key for request
 */
function generateRequestCacheKey(req, cacheType) {
  const userId = req.user?.id;
  const baseKey = `${cacheType}:${req.originalUrl}`;
  
  // Include query parameters in key for GET requests
  if (req.method === 'GET' && Object.keys(req.query).length > 0) {
    const queryString = new URLSearchParams(req.query).toString();
    return `${baseKey}?${queryString}`;
  }
  
  return baseKey;
}

/**
 * Cache GET requests middleware
 */
export function cacheGet(cacheType) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const rule = cacheRules[cacheType];
    if (!rule) {
      console.warn(`[Cache] No cache rule defined for type: ${cacheType}`);
      return next();
    }

    try {
      const cacheKey = generateRequestCacheKey(req, cacheType);
      const userId = req.user?.id;
      
      // Try to get from cache
      const cachedData = await cacheService.get(cacheKey, rule.phi, userId);
      
      if (cachedData) {
        // Cache hit - return cached data
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Type', cacheType);
        res.set('X-Cache-TTL', rule.ttl.toString());
        
        if (rule.phi) {
          res.set('X-Cache-PHI', 'true');
        }
        
        return res.json(cachedData);
      }

      // Cache miss - continue to route handler
      res.set('X-Cache', 'MISS');
      res.set('X-Cache-Type', cacheType);
      
      // Store original json method
      const originalJson = res.json;
      
      // Override json method to cache the response
      res.json = function(data) {
        // Cache the response data
        cacheService.set(cacheKey, data, rule.ttl, rule.phi, userId)
          .catch(error => {
            console.error('[Cache] Failed to cache response:', error);
          });
        
        // Set cache headers
        res.set('X-Cache-Stored', 'true');
        
        // Call original json method
        return originalJson.call(this, data);
      };
      
      next();
    } catch (error) {
      console.error('[Cache] Cache middleware error:', error);
      // Don't fail the request if caching fails
      next();
    }
  };
}

/**
 * Cache invalidation middleware for POST/PUT/DELETE
 */
export function invalidateCache(cacheType, patterns = []) {
  return async (req, res, next) => {
    // Store original methods
    const originalJson = res.json;
    const originalSend = res.send;
    
    // Function to invalidate cache after successful response
    const invalidateAfterResponse = async () => {
      try {
        // Get specific patterns to invalidate
        const invalidationPatterns = patterns.length > 0 
          ? patterns 
          : [`emr:${cacheType}:*`];
        
        // Invalidate each pattern
        for (const pattern of invalidationPatterns) {
          await cacheService.invalidate(pattern);
        }
        
        // Special handling for patient-related data
        if (req.params.id && cacheType.includes('patient')) {
          await cacheService.invalidatePatient(req.params.id);
        }
        
        console.log(`[Cache] Invalidated cache patterns: ${invalidationPatterns.join(', ')}`);
      } catch (error) {
        console.error('[Cache] Cache invalidation error:', error);
      }
    };
    
    // Override response methods
    res.json = function(data) {
      // Only invalidate on successful responses (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        setImmediate(invalidateAfterResponse);
      }
      return originalJson.call(this, data);
    };
    
    res.send = function(data) {
      // Only invalidate on successful responses (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        setImmediate(invalidateAfterResponse);
      }
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Cache warming middleware - preload frequently accessed data
 */
export function warmCache(cacheType, dataLoader) {
  return async (req, res, next) => {
    try {
      const rule = cacheRules[cacheType];
      if (!rule) {
        return next();
      }
      
      // Run cache warming in background
      setImmediate(async () => {
        try {
          const cacheKey = generateRequestCacheKey(req, cacheType);
          const userId = req.user?.id;
          
          // Check if data is already cached
          const existing = await cacheService.get(cacheKey, rule.phi, userId);
          if (existing) {
            return; // Already cached
          }
          
          // Load fresh data
          const data = await dataLoader(req);
          if (data) {
            await cacheService.set(cacheKey, data, rule.ttl, rule.phi, userId);
            console.log(`[Cache] Warmed cache for ${cacheType}`);
          }
        } catch (error) {
          console.error(`[Cache] Cache warming failed for ${cacheType}:`, error);
        }
      });
      
      next();
    } catch (error) {
      console.error('[Cache] Cache warming middleware error:', error);
      next();
    }
  };
}

/**
 * Get cache rule for a given type
 */
export function getCacheRule(cacheType) {
  return cacheRules[cacheType] || null;
}

/**
 * Update cache rule (for runtime configuration)
 */
export function updateCacheRule(cacheType, rule) {
  if (rule.ttl && typeof rule.ttl === 'number' && rule.ttl > 0) {
    cacheRules[cacheType] = {
      ttl: rule.ttl,
      phi: Boolean(rule.phi)
    };
    console.log(`[Cache] Updated cache rule for ${cacheType}:`, cacheRules[cacheType]);
    return true;
  }
  return false;
}

/**
 * Get all cache rules
 */
export function getAllCacheRules() {
  return { ...cacheRules };
}

/**
 * Middleware to add cache analytics headers
 */
export function addCacheHeaders() {
  return (req, res, next) => {
    const analytics = cacheService.getAnalytics();
    
    res.set('X-Cache-Analytics-Hit-Rate', analytics.hitRate);
    res.set('X-Cache-Analytics-Total-Requests', analytics.totalRequests.toString());
    
    next();
  };
}

export default {
  cacheGet,
  invalidateCache,
  warmCache,
  getCacheRule,
  updateCacheRule,
  getAllCacheRules,
  addCacheHeaders
};