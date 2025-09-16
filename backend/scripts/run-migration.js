#!/usr/bin/env node

// backend/scripts/run-migration.js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from '../db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  try {
    console.log('🚀 Running performance indexes migration...');
    
    // Read the migration file
    const migrationPath = join(__dirname, '..', 'sql', '053_performance_indexes_schema_fixed.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration file loaded successfully');
    console.log('⚡ Creating performance indexes...');
    
    // Execute the migration
    const startTime = Date.now();
    await pool.query(migrationSQL);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Migration completed successfully in ${duration}ms`);
    
    // Verify some key indexes were created
    const indexCheck = await pool.query(`
      SELECT COUNT(*) as index_count
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND (
          indexname LIKE 'idx_patients_%'
          OR indexname LIKE 'idx_encounters_%'  
          OR indexname LIKE 'idx_clinical_%'
          OR indexname LIKE 'idx_user_sessions_%'
        )
    `);
    
    console.log(`📊 Performance indexes created: ${indexCheck.rows[0].index_count}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration().catch(console.error);