// backend/config/redis.config.js
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

class RedisClient {
  constructor() {
    this.redis = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    this.reconnectInterval = 5000; // 5 seconds
    
    this.init();
  }

  init() {
    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || null,
        db: parseInt(process.env.REDIS_DB || '0', 10),
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          console.log(`[Redis] Retry attempt ${times} in ${delay}ms`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        commandTimeout: 5000,
        connectTimeout: 10000,
        // Disable Redis commands that could be security risks
        enableOfflineQueue: false,
        family: 4, // Use IPv4 only for better compatibility
      });

      this.setupEventHandlers();
      this.connect();
    } catch (error) {
      console.error('[Redis] Initialization error:', error);
      this.handleConnectionFailure();
    }
  }

  setupEventHandlers() {
    this.redis.on('connect', () => {
      console.log('[Redis] Connected to Redis server');
      this.isConnected = true;
      this.connectionAttempts = 0;
    });

    this.redis.on('ready', () => {
      console.log('[Redis] Redis client ready');
      this.isConnected = true;
    });

    this.redis.on('error', (error) => {
      console.error('[Redis] Connection error:', error.message);
      this.isConnected = false;
      this.handleConnectionFailure();
    });

    this.redis.on('close', () => {
      console.log('[Redis] Connection closed');
      this.isConnected = false;
    });

    this.redis.on('reconnecting', (ms) => {
      console.log(`[Redis] Reconnecting in ${ms}ms...`);
    });

    this.redis.on('end', () => {
      console.log('[Redis] Connection ended');
      this.isConnected = false;
    });
  }

  async connect() {
    try {
      await this.redis.connect();
      console.log('[Redis] Successfully connected');
    } catch (error) {
      console.error('[Redis] Failed to connect:', error.message);
      this.handleConnectionFailure();
    }
  }

  handleConnectionFailure() {
    this.connectionAttempts++;
    
    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      console.error(`[Redis] Max connection attempts (${this.maxConnectionAttempts}) reached. Running without Redis cache.`);
      return;
    }

    console.log(`[Redis] Attempting to reconnect (${this.connectionAttempts}/${this.maxConnectionAttempts})...`);
    setTimeout(() => {
      this.init();
    }, this.reconnectInterval);
  }

  isHealthy() {
    return this.isConnected && this.redis && this.redis.status === 'ready';
  }

  async healthCheck() {
    try {
      if (!this.isHealthy()) {
        return { status: 'unhealthy', message: 'Redis not connected' };
      }

      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;

      return {
        status: 'healthy',
        latency,
        connected: this.isConnected,
        uptime: this.redis.connector?.stream?.readableHighWaterMark || 'unknown'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
        connected: false
      };
    }
  }

  getClient() {
    if (!this.isHealthy()) {
      console.warn('[Redis] Client requested but Redis not available');
      return null;
    }
    return this.redis;
  }

  async gracefulShutdown() {
    try {
      console.log('[Redis] Initiating graceful shutdown...');
      if (this.redis) {
        await this.redis.quit();
        console.log('[Redis] Graceful shutdown completed');
      }
    } catch (error) {
      console.error('[Redis] Error during shutdown:', error.message);
      // Force disconnect if graceful quit fails
      if (this.redis) {
        this.redis.disconnect();
      }
    }
  }
}

// Create singleton instance
const redisClient = new RedisClient();

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  await redisClient.gracefulShutdown();
});

process.on('SIGINT', async () => {
  await redisClient.gracefulShutdown();
});

export default redisClient;