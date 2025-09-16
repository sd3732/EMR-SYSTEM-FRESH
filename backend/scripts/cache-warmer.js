#!/usr/bin/env node

// backend/scripts/cache-warmer.js
import pool from '../db/index.js';
import cacheService from '../services/cache.service.js';
import redisClient from '../config/redis.config.js';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

class CacheWarmer {
  constructor() {
    this.warmupTasks = [
      { name: 'Providers Directory', func: this.warmProviders },
      { name: 'Active Providers', func: this.warmActiveProviders },
      { name: 'Medication Formulary', func: this.warmMedications },
      { name: 'Insurance Plans', func: this.warmInsurancePlans },
      { name: 'System Configuration', func: this.warmSystemConfig },
      { name: 'User Preferences', func: this.warmUserPreferences },
      { name: 'Recent Patients', func: this.warmRecentPatients },
      { name: 'Today\'s Appointments', func: this.warmTodaysAppointments }
    ];
  }

  async run() {
    console.log(`${colors.blue}🔥 EMR Cache Warmer Starting...${colors.reset}\n`);
    
    // Check Redis connection
    const healthCheck = await redisClient.healthCheck();
    if (healthCheck.status !== 'healthy') {
      console.error(`${colors.red}❌ Redis not available: ${healthCheck.message}${colors.reset}`);
      process.exit(1);
    }

    console.log(`${colors.green}✅ Redis connection healthy (${healthCheck.latency}ms latency)${colors.reset}\n`);

    const results = [];
    let totalWarmed = 0;

    for (const task of this.warmupTasks) {
      console.log(`${colors.yellow}🔄 Warming: ${task.name}...${colors.reset}`);
      
      try {
        const startTime = Date.now();
        const result = await task.func.call(this);
        const duration = Date.now() - startTime;
        
        console.log(`${colors.green}✅ ${task.name}: ${result.count} items (${duration}ms)${colors.reset}`);
        
        results.push({
          name: task.name,
          success: true,
          count: result.count,
          duration
        });
        
        totalWarmed += result.count;
      } catch (error) {
        console.error(`${colors.red}❌ ${task.name}: ${error.message}${colors.reset}`);
        
        results.push({
          name: task.name,
          success: false,
          error: error.message
        });
      }
    }

    console.log(`\n${colors.blue}📊 Cache Warming Summary:${colors.reset}`);
    console.log(`   Total items warmed: ${totalWarmed}`);
    console.log(`   Successful tasks: ${results.filter(r => r.success).length}/${results.length}`);
    
    const failedTasks = results.filter(r => !r.success);
    if (failedTasks.length > 0) {
      console.log(`${colors.red}   Failed tasks:${colors.reset}`);
      failedTasks.forEach(task => {
        console.log(`     - ${task.name}: ${task.error}`);
      });
    }

    console.log(`\n${colors.green}🎉 Cache warming completed!${colors.reset}`);
  }

  // Warm frequently accessed providers
  async warmProviders() {
    try {
      const result = await pool.query(`
        SELECT id, first_name, last_name, specialty, npi, active
        FROM providers 
        WHERE active = true 
        ORDER BY last_name, first_name
        LIMIT 100
      `);

      const cacheKey = 'emr:providers:directory:active';
      await cacheService.set(cacheKey, result.rows, 3600, false); // 1 hour TTL, non-PHI

      return { count: result.rows.length };
    } catch (error) {
      throw new Error(`Provider warming failed: ${error.message}`);
    }
  }

  // Warm active providers for quick lookup
  async warmActiveProviders() {
    try {
      const result = await pool.query(`
        SELECT id, first_name, last_name, specialty 
        FROM providers 
        WHERE active = true
      `);

      const cacheKey = 'emr:provider-directory:active';
      await cacheService.set(cacheKey, result.rows, 86400, false); // 24 hours TTL, non-PHI

      return { count: result.rows.length };
    } catch (error) {
      throw new Error(`Active providers warming failed: ${error.message}`);
    }
  }

  // Warm medication formulary
  async warmMedications() {
    try {
      // Check if medications table exists
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'medications'
        )
      `);

      if (!tableCheck.rows[0].exists) {
        console.log('   Medications table not found, skipping...');
        return { count: 0 };
      }

      const result = await pool.query(`
        SELECT id, name, generic_name, strength, form
        FROM medications 
        WHERE active = true 
        ORDER BY name
        LIMIT 1000
      `);

      const cacheKey = 'emr:medications-list:formulary';
      await cacheService.set(cacheKey, result.rows, 86400, false); // 24 hours TTL, non-PHI

      return { count: result.rows.length };
    } catch (error) {
      throw new Error(`Medications warming failed: ${error.message}`);
    }
  }

  // Warm insurance plans
  async warmInsurancePlans() {
    try {
      // Check if insurance table exists
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'insurance'
        )
      `);

      if (!tableCheck.rows[0].exists) {
        console.log('   Insurance table not found, skipping...');
        return { count: 0 };
      }

      const result = await pool.query(`
        SELECT id, plan_name, group_number, copay
        FROM insurance 
        WHERE active = true 
        ORDER BY plan_name
      `);

      const cacheKey = 'emr:insurance-plans:active';
      await cacheService.set(cacheKey, result.rows, 86400, false); // 24 hours TTL, non-PHI

      return { count: result.rows.length };
    } catch (error) {
      throw new Error(`Insurance plans warming failed: ${error.message}`);
    }
  }

  // Warm system configuration
  async warmSystemConfig() {
    try {
      // Mock system configuration - in real app this might come from config table
      const systemConfig = {
        app_name: 'EMR System',
        version: '1.0.0',
        max_file_upload_size: '10MB',
        session_timeout: 3600,
        features: {
          prescriptions: true,
          lab_orders: true,
          imaging: true,
          billing: true
        },
        updated_at: new Date().toISOString()
      };

      const cacheKey = 'emr:system-config:current';
      await cacheService.set(cacheKey, systemConfig, 86400, false); // 24 hours TTL, non-PHI

      return { count: 1 };
    } catch (error) {
      throw new Error(`System config warming failed: ${error.message}`);
    }
  }

  // Warm common user preferences
  async warmUserPreferences() {
    try {
      // Check if user_preferences table exists
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'user_preferences'
        )
      `);

      if (!tableCheck.rows[0].exists) {
        console.log('   User preferences table not found, creating default...');
        
        const defaultPrefs = {
          theme: 'light',
          items_per_page: 50,
          default_patient_view: 'summary',
          notifications: {
            email: true,
            push: false,
            sms: false
          }
        };

        const cacheKey = 'emr:user-preferences:default';
        await cacheService.set(cacheKey, defaultPrefs, 3600, false); // 1 hour TTL, non-PHI

        return { count: 1 };
      }

      const result = await pool.query(`
        SELECT DISTINCT preferences
        FROM user_preferences 
        LIMIT 10
      `);

      let cachedCount = 0;
      for (const row of result.rows) {
        const cacheKey = `emr:user-preferences:template:${cachedCount}`;
        await cacheService.set(cacheKey, row.preferences, 3600, false);
        cachedCount++;
      }

      return { count: cachedCount };
    } catch (error) {
      throw new Error(`User preferences warming failed: ${error.message}`);
    }
  }

  // Warm recently accessed patients (non-PHI identifiers only)
  async warmRecentPatients() {
    try {
      const result = await pool.query(`
        SELECT id, last_name, first_name, mrn
        FROM patients 
        WHERE created_at > CURRENT_DATE - INTERVAL '30 days'
        ORDER BY created_at DESC
        LIMIT 50
      `);

      // Cache patient list (PHI data)
      const cacheKey = 'emr:patients:recent:30days';
      await cacheService.set(cacheKey, result.rows, 300, true); // 5 minutes TTL, PHI

      return { count: result.rows.length };
    } catch (error) {
      throw new Error(`Recent patients warming failed: ${error.message}`);
    }
  }

  // Warm today's appointments
  async warmTodaysAppointments() {
    try {
      // Check if appointments table exists
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'appointments'
        )
      `);

      if (!tableCheck.rows[0].exists) {
        console.log('   Appointments table not found, skipping...');
        return { count: 0 };
      }

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const result = await pool.query(`
        SELECT id, patient_id, provider_id, start_time, end_time, status, title
        FROM appointments 
        WHERE start_time >= $1 AND start_time < $2
        ORDER BY start_time
      `, [startOfDay.toISOString(), endOfDay.toISOString()]);

      const cacheKey = `emr:appointments:date:${startOfDay.toISOString().split('T')[0]}`;
      await cacheService.set(cacheKey, result.rows, 300, true); // 5 minutes TTL, PHI

      return { count: result.rows.length };
    } catch (error) {
      throw new Error(`Today's appointments warming failed: ${error.message}`);
    }
  }
}

// CLI execution
async function main() {
  const warmer = new CacheWarmer();
  
  try {
    await warmer.run();
  } catch (error) {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  } finally {
    // Graceful shutdown
    try {
      await pool.end();
      await redisClient.gracefulShutdown();
    } catch (error) {
      console.error('Shutdown error:', error);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default CacheWarmer;