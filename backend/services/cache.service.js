// backend/services/cache.service.js
import redisClient from '../config/redis.config.js';
import crypto from 'crypto';

class CacheService {
  constructor() {
    this.encryptionKey = process.env.CACHE_ENCRYPTION_KEY || this.generateEncryptionKey();
    this.algorithm = 'aes-256-gcm';
    this.keyDerivationIterations = 100000;
    
    // Cache analytics
    this.analytics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };

    // PHI cache audit log
    this.phiAuditLog = [];
  }

  generateEncryptionKey() {
    // Generate a secure random key for encryption
    const key = crypto.randomBytes(32).toString('hex');
    console.warn('[Cache] Generated temporary encryption key. Set CACHE_ENCRYPTION_KEY in environment for production.');
    return key;
  }

  encrypt(data, isPHI = false) {
    try {
      if (!isPHI) {
        // Non-PHI data can be stored as JSON string
        return JSON.stringify(data);
      }

      // PHI data must be encrypted
      const iv = crypto.randomBytes(16);
      const salt = crypto.randomBytes(32);
      
      // Derive key using PBKDF2
      const key = crypto.pbkdf2Sync(this.encryptionKey, salt, this.keyDerivationIterations, 32, 'sha256');
      
      const cipher = crypto.createCipherGCM(this.algorithm, key, iv);
      cipher.setAAD(Buffer.from('emr-phi-data')); // Additional authenticated data
      
      const plaintext = JSON.stringify(data);
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      // Combine salt, iv, authTag, and encrypted data
      const result = {
        encrypted,
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: this.algorithm,
        timestamp: Date.now(),
        isPHI: true
      };

      return JSON.stringify(result);
    } catch (error) {
      console.error('[Cache] Encryption error:', error);
      throw new Error('Failed to encrypt cache data');
    }
  }

  decrypt(encryptedData, isPHI = false) {
    try {
      if (!isPHI) {
        // Non-PHI data is stored as plain JSON
        return JSON.parse(encryptedData);
      }

      // PHI data must be decrypted
      const data = JSON.parse(encryptedData);
      
      if (!data.isPHI) {
        throw new Error('Invalid PHI cache data structure');
      }

      const salt = Buffer.from(data.salt, 'hex');
      const iv = Buffer.from(data.iv, 'hex');
      const authTag = Buffer.from(data.authTag, 'hex');
      
      // Derive the same key
      const key = crypto.pbkdf2Sync(this.encryptionKey, salt, this.keyDerivationIterations, 32, 'sha256');
      
      const decipher = crypto.createDecipherGCM(data.algorithm, key, iv);
      decipher.setAAD(Buffer.from('emr-phi-data'));
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('[Cache] Decryption error:', error);
      throw new Error('Failed to decrypt cache data');
    }
  }

  generateCacheKey(prefix, identifier, userId = null) {
    // Include user context for HIPAA audit trail
    const baseKey = `emr:${prefix}:${identifier}`;
    return userId ? `${baseKey}:user:${userId}` : baseKey;
  }

  async get(key, isPHI = false, userId = null) {
    try {
      const redis = redisClient.getClient();
      if (!redis) {
        console.warn('[Cache] Redis not available, cache miss');
        this.analytics.misses++;
        return null;
      }

      const start = Date.now();
      const cachedData = await redis.get(key);
      const latency = Date.now() - start;

      if (!cachedData) {
        this.analytics.misses++;
        return null;
      }

      // Log PHI access for HIPAA compliance
      if (isPHI && userId) {
        this.logPHIAccess('GET', key, userId);
      }

      const decryptedData = this.decrypt(cachedData, isPHI);
      this.analytics.hits++;

      console.log(`[Cache] HIT ${key} (${latency}ms)${isPHI ? ' [PHI]' : ''}`);
      return decryptedData;
    } catch (error) {
      console.error('[Cache] Get error:', error);
      this.analytics.errors++;
      this.analytics.misses++;
      return null;
    }
  }

  async set(key, value, ttl = 3600, isPHI = false, userId = null) {
    try {
      const redis = redisClient.getClient();
      if (!redis) {
        console.warn('[Cache] Redis not available, skipping cache set');
        return false;
      }

      // Log PHI storage for HIPAA compliance
      if (isPHI && userId) {
        this.logPHIAccess('SET', key, userId, { ttl });
      }

      const encryptedData = this.encrypt(value, isPHI);
      
      const start = Date.now();
      if (ttl > 0) {
        await redis.setex(key, ttl, encryptedData);
      } else {
        await redis.set(key, encryptedData);
      }
      const latency = Date.now() - start;

      this.analytics.sets++;
      console.log(`[Cache] SET ${key} TTL=${ttl}s (${latency}ms)${isPHI ? ' [PHI]' : ''}`);
      return true;
    } catch (error) {
      console.error('[Cache] Set error:', error);
      this.analytics.errors++;
      return false;
    }
  }

  async invalidate(pattern) {
    try {
      const redis = redisClient.getClient();
      if (!redis) {
        console.warn('[Cache] Redis not available, skipping invalidation');
        return false;
      }

      const keys = await redis.keys(pattern);
      if (keys.length === 0) {
        return true;
      }

      const start = Date.now();
      const result = await redis.del(...keys);
      const latency = Date.now() - start;

      this.analytics.deletes += result;
      console.log(`[Cache] INVALIDATE pattern=${pattern} deleted=${result} (${latency}ms)`);
      return true;
    } catch (error) {
      console.error('[Cache] Invalidate error:', error);
      this.analytics.errors++;
      return false;
    }
  }

  async invalidateUser(userId) {
    try {
      const pattern = `emr:*:user:${userId}`;
      return await this.invalidate(pattern);
    } catch (error) {
      console.error('[Cache] User invalidate error:', error);
      return false;
    }
  }

  async invalidatePatient(patientId) {
    try {
      // Invalidate all patient-related cache entries
      const patterns = [
        `emr:patient:${patientId}*`,
        `emr:appointments:patient:${patientId}*`,
        `emr:medications:patient:${patientId}*`,
        `emr:vitals:patient:${patientId}*`
      ];

      const promises = patterns.map(pattern => this.invalidate(pattern));
      await Promise.all(promises);
      return true;
    } catch (error) {
      console.error('[Cache] Patient invalidate error:', error);
      return false;
    }
  }

  logPHIAccess(operation, key, userId, metadata = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation,
      cacheKey: key,
      userId,
      metadata,
      ipAddress: 'server-internal', // Since this is server-side caching
      sessionId: null // Could be enhanced to track session IDs
    };

    this.phiAuditLog.push(logEntry);

    // Keep only last 10000 entries in memory
    if (this.phiAuditLog.length > 10000) {
      this.phiAuditLog = this.phiAuditLog.slice(-10000);
    }

    // In production, this should be written to a secure audit log file or database
    console.log(`[Cache PHI Audit] ${operation} ${key} by user ${userId}`);
  }

  getAnalytics() {
    const total = this.analytics.hits + this.analytics.misses;
    const hitRate = total > 0 ? ((this.analytics.hits / total) * 100).toFixed(2) : 0;
    
    return {
      ...this.analytics,
      hitRate: `${hitRate}%`,
      totalRequests: total
    };
  }

  getPHIAuditLog(limit = 100) {
    return this.phiAuditLog.slice(-limit);
  }

  resetAnalytics() {
    this.analytics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
  }

  async flush() {
    try {
      const redis = redisClient.getClient();
      if (!redis) {
        return false;
      }

      await redis.flushdb();
      console.log('[Cache] Cache flushed');
      return true;
    } catch (error) {
      console.error('[Cache] Flush error:', error);
      return false;
    }
  }

  async getMemoryUsage() {
    try {
      const redis = redisClient.getClient();
      if (!redis) {
        return null;
      }

      const info = await redis.memory('usage');
      return info;
    } catch (error) {
      console.error('[Cache] Memory usage error:', error);
      return null;
    }
  }
}

// Export singleton instance
const cacheService = new CacheService();
export default cacheService;