#!/usr/bin/env node

// backend/scripts/verify-performance.js
// Script to verify database performance optimizations
import pool from '../db/index.js';
import databaseHealthService from '../services/database-health.service.js';
import queryBuilder from '../utils/query-builder.js';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

async function verifyIndexes() {
  console.log(`${colors.blue}📊 Verifying Database Indexes...${colors.reset}`);
  
  try {
    // Check if our performance indexes exist
    const indexQuery = `
      SELECT 
        indexname,
        tablename,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND (
          indexname LIKE 'idx_patients_%'
          OR indexname LIKE 'idx_encounters_%'
          OR indexname LIKE 'idx_clinical_%'
          OR indexname LIKE 'idx_user_sessions_%'
        )
      ORDER BY tablename, indexname
    `;
    
    const result = await pool.query(indexQuery);
    
    console.log(`${colors.green}✅ Performance indexes found: ${result.rows.length}${colors.reset}`);
    
    const expectedIndexes = [
      'idx_patients_name_composite',
      'idx_patients_name_search', 
      'idx_patients_mrn',
      'idx_encounters_patient_date',
      'idx_user_sessions_token',
      'idx_clinical_notes_patient'
    ];

    const foundIndexes = result.rows.map(row => row.indexname);
    const missingIndexes = expectedIndexes.filter(idx => !foundIndexes.includes(idx));
    
    if (missingIndexes.length > 0) {
      console.log(`${colors.red}❌ Missing indexes:${colors.reset}`, missingIndexes);
      console.log(`${colors.yellow}💡 Run the migration: psql -d emr -f sql/053_performance_indexes.sql${colors.reset}`);
      return false;
    } else {
      console.log(`${colors.green}✅ All critical indexes are present${colors.reset}`);
      return true;
    }
  } catch (error) {
    console.error(`${colors.red}❌ Error checking indexes:${colors.reset}`, error.message);
    return false;
  }
}

async function testPatientSearch() {
  console.log(`${colors.blue}🔍 Testing Patient Search Performance...${colors.reset}`);
  
  try {
    // Test 1: Basic patient list (should use composite index)
    const startTime1 = Date.now();
    const result1 = await pool.query(`
      SELECT id, first_name, last_name, mrn 
      FROM patients 
      ORDER BY last_name, first_name 
      LIMIT 100
    `);
    const time1 = Date.now() - startTime1;
    
    console.log(`${colors.green}✅ Patient list query: ${time1}ms (${result1.rows.length} rows)${colors.reset}`);
    
    // Test 2: Full-text search (should use GIN index)
    if (result1.rows.length > 0) {
      const searchTerm = result1.rows[0].first_name;
      const startTime2 = Date.now();
      const result2 = await pool.query(`
        SELECT id, first_name, last_name, mrn 
        FROM patients 
        WHERE to_tsvector('english', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) 
              @@ plainto_tsquery('english', $1)
        LIMIT 10
      `, [searchTerm]);
      const time2 = Date.now() - startTime2;
      
      console.log(`${colors.green}✅ Full-text search: ${time2}ms (${result2.rows.length} rows)${colors.reset}`);
    }

    // Test 3: Optimized patient search with JOINs
    const queryObj = queryBuilder.buildPatientSearchQuery({
      limit: 50,
      includeProvider: true,
      includeInsurance: false
    });
    
    const startTime3 = Date.now();
    const result3 = await queryBuilder.executeQuery(queryObj);
    const time3 = Date.now() - startTime3;
    
    console.log(`${colors.green}✅ Optimized patient search with JOINs: ${time3}ms (${result3.rows.length} rows)${colors.reset}`);
    
    return time1 < 100 && time3 < 100; // Success if both under 100ms
  } catch (error) {
    console.error(`${colors.red}❌ Patient search test failed:${colors.reset}`, error.message);
    return false;
  }
}

async function testEncounterQueries() {
  console.log(`${colors.blue}🏥 Testing Encounter Query Performance...${colors.reset}`);
  
  try {
    // Get a patient ID for testing
    const patientResult = await pool.query('SELECT id FROM patients LIMIT 1');
    if (patientResult.rows.length === 0) {
      console.log(`${colors.yellow}⚠️  No patients found, skipping encounter tests${colors.reset}`);
      return true;
    }
    
    const patientId = patientResult.rows[0].id;
    
    // Test encounter query by patient (should use composite index)
    const startTime = Date.now();
    const result = await pool.query(`
      SELECT id, patient_id, reason, status, created_at
      FROM encounters 
      WHERE patient_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [patientId]);
    const time = Date.now() - startTime;
    
    console.log(`${colors.green}✅ Encounter by patient query: ${time}ms (${result.rows.length} rows)${colors.reset}`);
    
    // Test optimized encounter query with JOINs
    const queryObj = queryBuilder.buildEncounterQuery({
      patientId,
      includePatient: true,
      includeProvider: true,
      limit: 20
    });
    
    const startTime2 = Date.now();
    const result2 = await queryBuilder.executeQuery(queryObj);
    const time2 = Date.now() - startTime2;
    
    console.log(`${colors.green}✅ Optimized encounter query with JOINs: ${time2}ms (${result2.rows.length} rows)${colors.reset}`);
    
    return time < 100 && time2 < 100;
  } catch (error) {
    console.error(`${colors.red}❌ Encounter query test failed:${colors.reset}`, error.message);
    return false;
  }
}

async function testSessionQueries() {
  console.log(`${colors.blue}🔐 Testing Session Query Performance...${colors.reset}`);
  
  try {
    // Test session token lookup (should be very fast with index)
    const startTime = Date.now();
    const result = await pool.query(`
      SELECT user_id, expires_at, terminated
      FROM user_sessions 
      WHERE session_token = $1 AND terminated = false
    `, ['test-token-' + Math.random()]);
    const time = Date.now() - startTime;
    
    console.log(`${colors.green}✅ Session token lookup: ${time}ms${colors.reset}`);
    
    // Test session cleanup query
    const startTime2 = Date.now();
    const result2 = await pool.query(`
      SELECT COUNT(*) as expired_count
      FROM user_sessions 
      WHERE expires_at <= CURRENT_TIMESTAMP AND terminated = false
    `);
    const time2 = Date.now() - startTime2;
    
    console.log(`${colors.green}✅ Session cleanup query: ${time2}ms${colors.reset}`);
    
    return time < 50 && time2 < 100; // Session lookups should be very fast
  } catch (error) {
    console.error(`${colors.red}❌ Session query test failed:${colors.reset}`, error.message);
    return false;
  }
}

async function generateHealthReport() {
  console.log(`${colors.blue}📋 Generating Database Health Report...${colors.reset}`);
  
  try {
    const report = await databaseHealthService.generateHealthReport();
    
    if (report.error) {
      console.error(`${colors.red}❌ Health report failed:${colors.reset}`, report.error);
      return false;
    }
    
    console.log(`${colors.green}✅ Database Health: ${report.database_health.overall_status}${colors.reset}`);
    console.log(`${colors.blue}📊 Performance Score: ${report.database_health.performance_score}/100${colors.reset}`);
    
    if (report.database_health.recommendations.length > 0) {
      console.log(`${colors.yellow}💡 Recommendations:${colors.reset}`);
      report.database_health.recommendations.forEach(rec => {
        console.log(`  • ${rec.message} (${rec.priority})`);
      });
    }
    
    // Check for concerning issues
    const hasSlowQueries = report.slow_queries.slow_queries && report.slow_queries.slow_queries.length > 0;
    const hasMissingIndexes = Array.isArray(report.missing_indexes) && report.missing_indexes.length > 0;
    
    if (hasSlowQueries) {
      console.log(`${colors.yellow}⚠️  Found ${report.slow_queries.slow_queries.length} slow queries${colors.reset}`);
    }
    
    if (hasMissingIndexes) {
      console.log(`${colors.yellow}⚠️  Found ${report.missing_indexes.length} tables with high sequential scans${colors.reset}`);
    }
    
    return !hasSlowQueries && !hasMissingIndexes;
  } catch (error) {
    console.error(`${colors.red}❌ Health report generation failed:${colors.reset}`, error.message);
    return false;
  }
}

async function main() {
  console.log(`${colors.blue}🚀 EMR Database Performance Verification${colors.reset}\n`);
  
  const results = {
    indexes: false,
    patientSearch: false,
    encounterQueries: false,
    sessionQueries: false,
    healthReport: false
  };
  
  try {
    results.indexes = await verifyIndexes();
    console.log('');
    
    results.patientSearch = await testPatientSearch();
    console.log('');
    
    results.encounterQueries = await testEncounterQueries();
    console.log('');
    
    results.sessionQueries = await testSessionQueries();
    console.log('');
    
    results.healthReport = await generateHealthReport();
    console.log('');
    
    // Final summary
    const passedTests = Object.values(results).filter(Boolean).length;
    const totalTests = Object.keys(results).length;
    
    console.log(`${colors.blue}📊 Performance Verification Summary:${colors.reset}`);
    console.log(`   Passed: ${passedTests}/${totalTests} tests`);
    
    Object.entries(results).forEach(([test, passed]) => {
      const icon = passed ? '✅' : '❌';
      const color = passed ? colors.green : colors.red;
      console.log(`   ${icon} ${color}${test}${colors.reset}`);
    });
    
    if (passedTests === totalTests) {
      console.log(`\n${colors.green}🎉 All performance optimizations verified successfully!${colors.reset}`);
      console.log(`${colors.blue}💡 Your EMR database is optimized for HIPAA-compliant performance.${colors.reset}`);
    } else {
      console.log(`\n${colors.yellow}⚠️  Some performance tests failed. Review the output above.${colors.reset}`);
    }
    
  } catch (error) {
    console.error(`${colors.red}❌ Verification failed:${colors.reset}`, error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run verification
main().catch(console.error);